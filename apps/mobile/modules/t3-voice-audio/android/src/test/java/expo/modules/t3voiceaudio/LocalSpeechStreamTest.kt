package expo.modules.t3voiceaudio

import org.junit.Assert.*
import androidx.core.telecom.CallEndpointCompat
import org.junit.Test

class LocalSpeechStreamTest {
  private class Engine : SpeechEngine {
    var frames = 0
    var total = 0L
    var maximum = 0
    var resets = 0
    var incomplete = false
    var closed = false
    override fun begin() {}
    override fun add(samples: FloatArray) { frames += samples.size; total += samples.size; maximum = maxOf(maximum, frames) }
    override fun phrases(final: Boolean) = listOf(SpeechPhrase(1, "recognized phrase", !incomplete || final))
    override fun end() {}
    override fun reset() { frames = 0; ++resets }
    override fun close() { closed = true }
  }
  @Test fun longSessionsRetireHistoryWithoutDroppingAudio() {
    val engine = Engine()
    LocalSpeechStream(engine).use { speech -> repeat(45 * 60 * 10) { speech.accept(FloatArray(1600)) } }
    assertEquals(45L * 60 * 16000, engine.total)
    assertTrue(engine.maximum <= 480000)
    assertTrue(engine.resets >= 90)
    assertTrue(engine.closed)
  }
  @Test fun continuousSpeechHasABoundedDecoderAndFlushesOnce() {
    val engine = Engine().also { it.incomplete = true }
    LocalSpeechStream(engine).use { speech ->
      val phrases = (0 until 600).flatMap { speech.accept(FloatArray(1600)) }
      assertEquals(listOf("recognized phrase"), phrases)
      assertEquals(1, engine.resets)
      assertTrue(engine.maximum <= 960000)
    }
  }
  @Test fun partialSpeechIsNotInsertedUntilFinishedAndFinalsAreDeduplicated() {
    val engine = Engine().also { it.incomplete = true }
    LocalSpeechStream(engine).use { speech ->
      assertTrue(speech.accept(FloatArray(8000)).isEmpty())
      engine.incomplete = false
      assertEquals(listOf("recognized phrase"), speech.accept(FloatArray(8000)))
      assertTrue(speech.accept(FloatArray(8000)).isEmpty())
      assertTrue(speech.finish().isEmpty())
    }
  }
  @Test fun wiredHeadsetsAcceptTheirMicrophonesWithoutAcceptingPhoneFallback() {
    assertTrue(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_WIRED_HEADSET, 3, "", ""))
    assertTrue(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_WIRED_HEADSET, 22, "", ""))
    assertTrue(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_WIRED_HEADSET, 11, "", ""))
    assertFalse(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_WIRED_HEADSET, 15, "", ""))
  }
  @Test fun bluetoothCaptureRejectsPhoneOrDifferentHeadsetFallback() {
    assertFalse(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_BLUETOOTH, 15, "", "glasses"))
    assertFalse(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_BLUETOOTH, 7, "other", "glasses"))
    assertTrue(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_BLUETOOTH, 7, "glasses", "glasses"))
    assertTrue(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_BLUETOOTH, 26, "glasses", "glasses"))
    assertTrue(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_SPEAKER, 15, "", ""))
    assertFalse(LocalDictationCapture.acceptsInput(CallEndpointCompat.TYPE_SPEAKER, 7, "glasses", "glasses"))
  }
}
