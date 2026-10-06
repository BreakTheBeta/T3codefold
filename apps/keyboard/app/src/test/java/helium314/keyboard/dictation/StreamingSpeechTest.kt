// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class StreamingSpeechTest {
    private class Decoder : NativeSpeech {
        var frames = 0L
        var resets = 0
        var largestStream = 0
        var currentStream = 0
        var lines = emptyList<SpeechLine>()
        var closed = false
        var rejectStart = false
        override fun start() { check(!rejectStart) }
        override fun add(samples: FloatArray) {
            frames += samples.size
            currentStream += samples.size
            largestStream = maxOf(largestStream, currentStream)
        }
        override fun transcript(force: Boolean) = lines
        override fun stop() {}
        override fun reset() { resets++; currentStream = 0 }
        override fun close() { closed = true }
    }

    @Test fun aLongSessionKeepsAllAudioWithBoundedDecoderHistory() {
        val decoder = Decoder()
        val audio = FloatArray(1_600)
        StreamingSpeech(decoder).use { speech ->
            repeat(45 * 60 * 10) { speech.accept(audio) }
            assertEquals(45L * 60 * 16_000, decoder.frames)
            assertEquals(90, decoder.resets)
            assertEquals(StreamingSpeech.STREAM_SAMPLES, decoder.largestStream)
            assertFalse(decoder.closed)
        }
        assertTrue(decoder.closed)
    }

    @Test fun partialsArePreviewedAndCompletedPhrasesAreCommittedOnce() {
        val decoder = Decoder()
        StreamingSpeech(decoder).use { speech ->
            decoder.lines = listOf(SpeechLine(1, "  Hello world.  ", false))
            assertEquals(SpeechUpdate(emptyList(), "Hello world."), speech.accept(FloatArray(8_000)))
            decoder.lines = listOf(SpeechLine(1, "Hello world.", true), SpeechLine(2, "More speech", false))
            assertEquals(SpeechUpdate(listOf("Hello world."), "More speech"), speech.accept(FloatArray(8_000)))
            assertEquals(SpeechUpdate(emptyList(), "More speech"), speech.accept(FloatArray(8_000)))
            assertEquals(SpeechUpdate(listOf("More speech"), ""), speech.finish())
        }
    }

    @Test fun streamRotationFlushesTheLastPhraseAndAllowsReusedLineIds() {
        val decoder = Decoder()
        StreamingSpeech(decoder).use { speech ->
            decoder.lines = listOf(SpeechLine(1, "First stream", false))
            assertEquals(listOf("First stream"), speech.accept(FloatArray(StreamingSpeech.MAX_STREAM_SAMPLES)).completed)
            decoder.lines = listOf(SpeechLine(1, "Next stream", true))
            assertEquals(listOf("Next stream"), speech.accept(FloatArray(8_000)).completed)
            assertTrue(speech.finish().completed.isEmpty())
        }
    }

    @Test fun modelIsReleasedIfStartingRecognitionFails() {
        val decoder = Decoder().apply { rejectStart = true }
        assertFailsWith<IllegalStateException> { StreamingSpeech(decoder) }
        assertTrue(decoder.closed)
    }

    @Test fun decoderRotationWaitsForTheCurrentPhraseToFinish() {
        val decoder = Decoder()
        StreamingSpeech(decoder).use { speech ->
            decoder.lines = listOf(SpeechLine(1, "An unfinished phrase", false))
            speech.accept(FloatArray(StreamingSpeech.STREAM_SAMPLES))
            assertEquals(0, decoder.resets)
            decoder.lines = listOf(SpeechLine(1, "An unfinished phrase is now complete.", true))
            val result = speech.accept(FloatArray(8_000))
            assertEquals(listOf("An unfinished phrase is now complete."), result.completed)
            assertEquals(1, decoder.resets)
        }
    }
}
