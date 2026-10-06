package expo.modules.t3voiceaudio

import android.annotation.SuppressLint
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.log10
import kotlin.math.sqrt

/** The bounded PCM channel separates capture from inference; audio never reaches JavaScript or disk. */
internal class LocalDictationCapture(
  private val audio: AudioManager,
  private val bluetooth: Boolean,
  private val speech: LocalSpeechStream,
  private val phrase: (String) -> Unit,
  private val meter: (Double, Long) -> Unit,
  private val failed: (String) -> Unit
) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val chunks = Channel<FloatArray>(50) // At most five seconds of audio.
  private val running = AtomicBoolean(true)
  private val final = CompletableDeferred<List<String>>()
  private val ready = CompletableDeferred<Unit>()
  private val flush = AtomicBoolean(false)
  private var captureJob: Job? = null
  private var decoderJob: Job? = null
  private var record: AudioRecord? = null

  @SuppressLint("MissingPermission") // The bridge requests runtime access before native start.
  suspend fun start() {
    val recorder = AudioRecord.Builder()
      .setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
      .setAudioFormat(AudioFormat.Builder().setSampleRate(16000).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
      .setBufferSizeInBytes(maxOf(32000, AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)))
      .build()
    record = recorder
    check(recorder.state == AudioRecord.STATE_INITIALIZED) { "The call microphone could not initialize." }
    decoderJob = scope.launch {
      try {
        for (chunk in chunks) {
          if (!running.get() && !flush.get()) break
          speech.accept(chunk).forEach(phrase)
        }
        final.complete(if (flush.get()) speech.finish() else emptyList())
      } catch (error: Exception) {
        final.completeExceptionally(error)
        if (running.get()) failed(error.message ?: "Speech recognition failed.")
      } finally { speech.close() }
    }
    recorder.startRecording()
    captureJob = scope.launch {
      try {
        val buffer = ShortArray(1600)
        var count = 0L
        var connected = false
        var connectedAddress: String? = null
        var attempts = 0
        while (running.get()) {
          ensureActive()
          val size = recorder.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
          if (!running.get()) break
          check(size > 0) { "The call microphone stopped recording." }
          val routed = recorder.routedDevice
          val selected = if (Build.VERSION.SDK_INT >= 31) audio.communicationDevice else null
          val inputAddress = if (Build.VERSION.SDK_INT >= 28) routed?.address else null
          val selectedAddress = if (Build.VERSION.SDK_INT >= 31) selected?.address else null
          val valid = acceptsInput(bluetooth, routed?.type, inputAddress, if (connected) connectedAddress else selectedAddress)
          if (!valid) {
            check(!connected && ++attempts < 100) { "The selected call microphone disconnected or Android routed to the phone. Check Calls is enabled for your glasses." }
            continue
          }
          if (!connected) { connected = true; connectedAddress = inputAddress; ready.complete(Unit) }
          if (Build.VERSION.SDK_INT >= 29) {
            check(recorder.activeRecordingConfiguration?.isClientSilenced != true) { "Android silenced the microphone for another app. End other voice sessions and try again." }
          }
          val samples = FloatArray(size) { buffer[it] / 32768f }
          check(chunks.trySend(samples).isSuccess) { "The speech model cannot keep up. Choose Tiny in dictation setup." }
          count += size
          var energy = 0.0
          samples.forEach { energy += it * it }
          meter(20 * log10(sqrt(energy / size).coerceAtLeast(1e-8)), count * 1000 / 16000)
        }
      } catch (error: CancellationException) {
        if (!ready.isCompleted) ready.completeExceptionally(error)
      } catch (error: Exception) {
        ready.completeExceptionally(error)
        if (running.get()) failed(error.message ?: "The call microphone failed.")
      } finally { chunks.close() }
    }
    withTimeout(10000) { ready.await() }
  }

  suspend fun stop(complete: Boolean): List<String> {
    flush.set(complete)
    running.set(false)
    try { record?.stop() } catch (_: IllegalStateException) {}
    captureJob?.join()
    chunks.close()
    return try {
      if (decoderJob == null) emptyList() else final.await()
    } finally {
      // The completion value is published before the worker's finally block.
      // Wait for its JNI cleanup before touching the same native handles here.
      decoderJob?.join()
      record?.release()
      record = null
      speech.close()
      scope.cancel()
    }
  }

  companion object {
    fun acceptsInput(bluetooth: Boolean, type: Int?, inputAddress: String?, selectedAddress: String?): Boolean {
      if (!bluetooth) return type == AudioDeviceInfo.TYPE_BUILTIN_MIC
      if (type != AudioDeviceInfo.TYPE_BLUETOOTH_SCO && type != AudioDeviceInfo.TYPE_BLE_HEADSET) return false
      return selectedAddress.isNullOrEmpty() || inputAddress == selectedAddress
    }
  }
}
