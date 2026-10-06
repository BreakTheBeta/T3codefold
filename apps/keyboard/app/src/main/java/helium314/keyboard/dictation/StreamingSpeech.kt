// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import ai.moonshine.voice.JNI
import ai.moonshine.voice.TranscriberOption
import java.io.Closeable

data class SpeechLine(val id: Long, val text: String, val complete: Boolean)
data class SpeechUpdate(val completed: List<String>, val partial: String)

interface NativeSpeech : Closeable {
    fun start()
    fun add(samples: FloatArray)
    fun transcript(force: Boolean): List<SpeechLine>
    fun stop()
    fun reset()
}

/** Owns bounded stream history; resetting the decoder never stops audio capture. */
class StreamingSpeech(private val native: NativeSpeech) : Closeable {
    private var samples = 0
    private var sinceUpdate = 0
    private var updateSamples = SAMPLE_RATE / 2
    private val committed = mutableSetOf<Long>()
    init {
        try { native.start() } catch (error: Exception) { native.close(); throw error }
    }

    fun accept(audio: FloatArray): SpeechUpdate {
        native.add(audio)
        samples += audio.size
        sinceUpdate += audio.size
        if (sinceUpdate < updateSamples) return SpeechUpdate(emptyList(), "")
        sinceUpdate = 0
        val began = System.nanoTime()
        val update = collect(native.transcript(false), false)
        // Let an inference pass cover at least its own cost on slower phones.
        updateSamples = ((System.nanoTime() - began) / 1e9 * SAMPLE_RATE)
            .coerceIn(SAMPLE_RATE / 2.0, SAMPLE_RATE * 2.0).toInt()
        // Prefer a phrase boundary; continuous speech still has a bounded hard ceiling.
        if (samples >= STREAM_SAMPLES && (update.partial.isEmpty() || samples >= MAX_STREAM_SAMPLES)) {
            val final = finish()
            native.reset()
            committed.clear()
            samples = 0
            sinceUpdate = 0
            native.start()
            return SpeechUpdate(update.completed + final.completed, final.partial)
        }
        return update
    }

    fun finish(): SpeechUpdate {
        native.stop()
        return collect(native.transcript(true), true)
    }

    private fun collect(lines: List<SpeechLine>, force: Boolean): SpeechUpdate {
        val complete = mutableListOf<String>()
        val partial = StringBuilder()
        for (line in lines) {
            val text = line.text.trim()
            if (text.isEmpty()) continue
            if (line.complete || force) {
                if (committed.add(line.id)) complete.add(text)
            } else partial.append(text).append(' ')
        }
        return SpeechUpdate(complete, partial.toString().trim())
    }

    override fun close() = native.close()
    companion object {
        const val SAMPLE_RATE = 16_000
        const val STREAM_SAMPLES = SAMPLE_RATE * 30
        const val MAX_STREAM_SAMPLES = SAMPLE_RATE * 60
    }
}

/** JNI is synchronous: the session worker alone owns every native handle. */
class MoonshineSpeech(directory: String, architecture: Int) : NativeSpeech {
    private var model = -1
    private var stream = -1
    init {
        JNI.ensureLibraryLoaded()
        model = JNI.moonshineLoadTranscriberFromFiles(directory, architecture, arrayOf(
            TranscriberOption("return_audio_data", "false"),
            TranscriberOption("identify_speakers", "false"),
            TranscriberOption("vad_max_segment_duration", "15"),
            TranscriberOption("log_output_text", "false")))
        check(model >= 0) { "Could not load the speech model. Remove it and download it again in Setup." }
        try { reset() } catch (error: Exception) { close(); throw error }
    }
    override fun reset() {
        if (stream >= 0) checkResult(JNI.moonshineFreeStream(model, stream))
        stream = JNI.moonshineCreateStream(model, 0)
        check(stream >= 0) { "Could not create speech stream." }
    }
    override fun start() = checkResult(JNI.moonshineStartStream(model, stream))
    override fun add(samples: FloatArray) = checkResult(JNI.moonshineAddAudioToStream(
        model, stream, samples, StreamingSpeech.SAMPLE_RATE, 0))
    override fun stop() = checkResult(JNI.moonshineStopStream(model, stream))
    override fun transcript(force: Boolean): List<SpeechLine> {
        val transcript = JNI.moonshineTranscribeStream(model, stream,
            if (force) JNI.MOONSHINE_FLAG_FORCE_UPDATE else 0)
        checkNotNull(transcript) { "Speech recognition failed." }
        return transcript.lines.orEmpty().map { SpeechLine(it.id, it.text.orEmpty(), it.isComplete) }
    }
    override fun close() {
        if (stream >= 0) { JNI.moonshineFreeStream(model, stream); stream = -1 }
        if (model >= 0) { JNI.moonshineFreeTranscriber(model); model = -1 }
    }
    private fun checkResult(result: Int) { check(result >= 0) { JNI.moonshineErrorToString(result) } }
}
