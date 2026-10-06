package expo.modules.t3voiceaudio

import ai.moonshine.voice.JNI
import ai.moonshine.voice.TranscriberOption
import java.io.Closeable

internal data class SpeechPhrase(val id: Long, val text: String, val complete: Boolean)

internal interface SpeechEngine : Closeable {
  fun begin()
  fun add(samples: FloatArray)
  fun phrases(final: Boolean): List<SpeechPhrase>
  fun end()
  fun reset()
}

/** Decoder state is retired without stopping microphone capture. Only final phrases leave JNI. */
internal class LocalSpeechStream(private val engine: SpeechEngine) : Closeable {
  private val emitted = mutableSetOf<Long>()
  private var samples = 0
  private var pendingSamples = 0
  private var cadence = 8000
  init {
    try { engine.begin() } catch (error: Exception) { engine.close(); throw error }
  }

  fun accept(audio: FloatArray): List<String> {
    engine.add(audio)
    samples += audio.size
    pendingSamples += audio.size
    if (pendingSamples < cadence) return emptyList()
    pendingSamples = 0
    val began = System.nanoTime()
    val phrases = engine.phrases(false)
    val result = collect(phrases, false)
    cadence = ((System.nanoTime() - began) / 1e9 * 16000).toInt().coerceIn(8000, 32000)
    val midPhrase = phrases.any { !it.complete && it.text.isNotBlank() }
    if (samples >= 480000 && (!midPhrase || samples >= 960000)) {
      val final = finish()
      engine.reset()
      emitted.clear()
      samples = 0
      pendingSamples = 0
      engine.begin()
      return result + final
    }
    return result
  }
  fun finish(): List<String> {
    engine.end()
    return collect(engine.phrases(true), true)
  }
  private fun collect(phrases: List<SpeechPhrase>, final: Boolean) = phrases.mapNotNull {
    val text = it.text.trim()
    if (text.isNotEmpty() && (final || it.complete) && emitted.add(it.id)) text else null
  }
  override fun close() = engine.close()
}

internal class MoonshineEngine(directory: String, architecture: Int) : SpeechEngine {
  private var model = -1
  private var stream = -1
  init {
    JNI.ensureLibraryLoaded()
    model = JNI.moonshineLoadTranscriberFromFiles(directory, architecture, arrayOf(
      TranscriberOption("return_audio_data", "false"),
      TranscriberOption("identify_speakers", "false"),
      TranscriberOption("log_output_text", "false"),
      TranscriberOption("vad_max_segment_duration", "15")
    ))
    check(model >= 0) { "Could not load the speech model. Remove it in dictation setup and download again." }
    try { reset() } catch (error: Exception) { close(); throw error }
  }
  override fun begin() { checkResult(JNI.moonshineStartStream(model, stream)) }
  override fun add(samples: FloatArray) { checkResult(JNI.moonshineAddAudioToStream(model, stream, samples, 16000, 0)) }
  override fun end() { checkResult(JNI.moonshineStopStream(model, stream)) }
  override fun reset() {
    if (stream >= 0) checkResult(JNI.moonshineFreeStream(model, stream))
    stream = -1
    stream = JNI.moonshineCreateStream(model, 0)
    check(stream >= 0) { "Could not create a speech decoder." }
  }
  override fun phrases(final: Boolean): List<SpeechPhrase> {
    val transcript = checkNotNull(JNI.moonshineTranscribeStream(model, stream, if (final) JNI.MOONSHINE_FLAG_FORCE_UPDATE else 0)) { "Speech recognition failed." }
    return transcript.lines.orEmpty().map { SpeechPhrase(it.id, it.text.orEmpty(), it.isComplete) }
  }
  override fun close() {
    if (stream >= 0) { JNI.moonshineFreeStream(model, stream); stream = -1 }
    if (model >= 0) { JNI.moonshineFreeTranscriber(model); model = -1 }
  }
  private fun checkResult(code: Int) { check(code >= 0) { JNI.moonshineErrorToString(code) } }
}
