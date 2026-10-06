// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.inputmethod.EditorInfo
import helium314.keyboard.latin.LatinIME
import helium314.keyboard.latin.R
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class DictationController(private val ime: LatinIME) {
    private val main = Handler(Looper.getMainLooper())
    private var panel: DictationPanel? = null
    private var pending: EditorTarget? = null
    private var run: Run? = null
    private var message = idleMessage()
    var isInserting = false
        private set
    private val armTimeout = Runnable {
        if (pending != null) {
            cancel()
            message = "Dictation did not start. Return to the text field and try again."
            render()
        }
    }

    private data class EditorTarget(val packageName: String?, val fieldId: Int, val inputType: Int,
                                    val start: Int, val end: Int) {
        fun matches(info: EditorInfo) = packageName == info.packageName && fieldId == info.fieldId && inputType == info.inputType
    }
    private class Run(val lease: EditorLease, val target: EditorTarget) {
        val capture = AtomicBoolean(true)
        val canceled = AtomicBoolean(false)
        val routed = CountDownLatch(1)
        val queue = ArrayBlockingQueue<FloatArray>(50) // Five seconds; fail rather than silently drop speech.
        @Volatile var recorder: AudioRecord? = null
        @Volatile var failure: String? = null
        var route: CallAudioRoute? = null
        var stopping = false
        var tail: String? = null
        var selectedText: String? = null
        var routeName = ""
    }

    fun bind(view: View) {
        panel = view.findViewById(R.id.dictation_panel)
        panel?.bind(this)
        render()
    }
    private fun idleMessage(): String = ime.getString(R.string.dictation_idle,
        ime.getString(if (DictationModels.useBluetooth(ime)) R.string.dictation_bluetooth else R.string.dictation_phone))
    private fun render() {
        panel?.render(message, run != null || pending != null, run?.stopping == true)
    }
    fun inputStarted(info: EditorInfo) {
        // A return from the foreground-service activity may restart this same editor.
        if (pending?.matches(info) == false || run != null) cancel()
    }
    fun inputViewStarted(info: EditorInfo, allowed: Boolean) {
        panel?.visibility = if (allowed) View.VISIBLE else View.GONE
        if (!allowed) { cancel(); return }
        val target = pending ?: run {
            if (run == null) { message = idleMessage(); render() }
            return
        }
        if (!target.matches(info)) { cancel(); return }
        if (!DictationAudioService.running) return
        if (ime.dictationSelectionStart != target.start || ime.dictationSelectionEnd != target.end) {
            cancel(); return
        }
        main.removeCallbacks(armTimeout)
        pending = null
        start(target)
    }
    fun inputEnded() { if (pending == null) cancel() }
    fun selectionChanged(start: Int, end: Int) {
        if (isInserting) return
        val current = run ?: return
        if (!current.lease.selection(start, end)) cancel()
    }
    fun toggle() {
        if (pending != null) { cancel(); return }
        val current = run
        if (current != null) { stop(current, false); return }
        val info = ime.currentInputEditorInfo ?: return
        if (!ime.isInputViewShown || !ime.isDictationAllowed) return
        if (!DictationModels.unlocked(ime)) {
            message = "Unlock your phone before using dictation."; render(); return
        }
        val bluetooth = DictationModels.useBluetooth(ime)
        val permissions = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 31 && bluetooth) permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
        if (permissions.any { ime.checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED } ||
            !DictationModels.isReady(ime, DictationModels.architecture(ime))) {
            openSetup(); return
        }
        ime.prepareDictation()
        val start = ime.dictationSelectionStart
        val end = ime.dictationSelectionEnd
        if (start < 0 || end < 0) {
            message = "This text field has not provided a cursor position. Tap the field and try again."
            render(); return
        }
        pending = EditorTarget(info.packageName, info.fieldId, info.inputType, start, end)
        message = ime.getString(R.string.dictation_connecting)
        render()
        DictationAudioService.armed = true
        DictationAudioService.stopRequested = {
            val active = run
            if (active == null) cancel() else stop(active, false)
        }
        DictationAudioService.revoked = { cancel() }
        main.postDelayed(armTimeout, 30_000)
        try { ime.startActivity(Intent(ime, DictationStartActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        catch (error: RuntimeException) {
            cancel(); message = ime.getString(R.string.dictation_error, error.message); render()
        }
    }
    fun openSetup() {
        cancel()
        ime.startActivity(Intent(ime, DictationSettingsActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    fun cancel() {
        // Ordinary typing must not make a service IPC or read preferences on every key.
        if (pending == null && run == null && !DictationAudioService.armed && !DictationAudioService.running) return
        pending = null
        DictationAudioService.armed = false
        main.removeCallbacks(armTimeout)
        val current = run
        if (current != null) stop(current, true)
        else {
            DictationAudioService.stopRequested = null
            DictationAudioService.revoked = null
            ime.stopService(Intent(ime, DictationAudioService::class.java))
            message = idleMessage()
            render()
        }
    }
    private fun stop(current: Run, discard: Boolean) {
        if (discard) { current.canceled.set(true); current.lease.invalidate(); current.queue.clear() }
        current.stopping = true
        current.capture.set(false)
        current.routed.countDown()
        try { current.recorder?.stop() } catch (_: IllegalStateException) { /* Already stopped by the reader. */ }
        if (run === current) {
            message = ime.getString(R.string.dictation_stopping)
            render()
        }
    }
    private fun fail(current: Run, reason: String) {
        current.failure = reason
        main.post { if (run === current) stop(current, true) }
    }
    private fun start(target: EditorTarget) {
        val current = Run(EditorLease(target.start, target.end), target)
        current.tail = ime.currentInputConnection?.getTextBeforeCursor(64, 0)?.toString()
        current.selectedText = ime.currentInputConnection?.getSelectedText(0)?.toString()
        run = current
        message = ime.getString(R.string.dictation_loading)
        render()
        val architecture = DictationModels.architecture(ime)
        val directory = DictationModels.directory(ime, architecture).absolutePath
        val bluetooth = DictationModels.useBluetooth(ime)
        Thread({ work(current, directory, architecture, bluetooth) }, "keyboard-dictation").start()
    }

    private fun work(current: Run, directory: String, architecture: Int, bluetooth: Boolean) {
        var reader: Thread? = null
        var recorder: AudioRecord? = null
        try {
            StreamingSpeech(MoonshineSpeech(directory, architecture)).use { speech ->
                if (!current.capture.get()) return@use
                main.post {
                    if (run !== current || !current.capture.get()) { current.routed.countDown(); return@post }
                    message = ime.getString(R.string.dictation_connecting)
                    render()
                    val route = CallAudioRoute(ime, main, bluetooth) { fail(current, it) }
                    current.route = route
                    try {
                        route.open { name -> current.routeName = name; current.routed.countDown() }
                    } catch (error: Exception) { fail(current, error.message ?: "Call audio is unavailable."); current.routed.countDown() }
                }
                check(current.routed.await(12, TimeUnit.SECONDS)) { "Timed out connecting call audio." }
                if (!current.capture.get() || current.failure != null) return@use
                val route = checkNotNull(current.route)
                if (ime.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                    throw SecurityException("Microphone permission was revoked. Grant it again in Setup.")
                val minBuffer = AudioRecord.getMinBufferSize(StreamingSpeech.SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                check(minBuffer > 0) { "16 kHz microphone capture is unavailable." }
                val record = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
                    .setAudioFormat(AudioFormat.Builder().setSampleRate(StreamingSpeech.SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
                    .setBufferSizeInBytes(maxOf(minBuffer * 2, 6_400)).build()
                recorder = record
                current.recorder = record
                record.addOnRoutingChangedListener({ routing ->
                    if (current.capture.get() && routing.routedDevice != null && !route.acceptsInput(routing.routedDevice))
                        fail(current, "Android changed the microphone. Reconnect your glasses and try again.")
                }, main)
                if (Build.VERSION.SDK_INT >= 29) {
                    record.registerAudioRecordingCallback(ime.mainExecutor, object : AudioManager.AudioRecordingCallback() {
                        override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
                            if (current.capture.get() && configs.any { it.isClientSilenced })
                                fail(current, "Android silenced the microphone. Check privacy settings or other calls.")
                        }
                    })
                }
                if (!current.capture.get()) return@use
                record.startRecording()
                check(record.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Could not start microphone capture." }
                reader = Thread({
                    try {
                        val pcm = ShortArray(1_600)
                        var verified = false
                        val routingDeadline = android.os.SystemClock.elapsedRealtime() + 2_000
                        while (current.capture.get()) {
                            val count = record.read(pcm, 0, pcm.size, AudioRecord.READ_BLOCKING)
                            if (!current.capture.get()) break
                            check(count > 0) { "The microphone stopped providing audio ($count)." }
                            if (!verified) {
                                if (record.routedDevice == null && android.os.SystemClock.elapsedRealtime() < routingDeadline) continue
                                check(route.acceptsInput(record.routedDevice)) {
                                    "The selected microphone is not the recording device. Android used a different microphone."
                                }
                                verified = true
                                main.post { if (run === current && current.capture.get()) {
                                    message = ime.getString(R.string.dictation_listening, record.routedDevice?.productName ?: current.routeName)
                                    render()
                                } }
                            }
                            check(route.acceptsInput(record.routedDevice)) { "The call microphone disconnected or changed." }
                            val samples = FloatArray(count) { pcm[it] / 32768f }
                            check(current.queue.offer(samples)) {
                                "Speech recognition cannot keep up. Choose a smaller model in Setup."
                            }
                        }
                    } catch (error: Exception) {
                        if (current.capture.get()) fail(current, error.message ?: "Microphone capture failed.")
                    } finally { current.capture.set(false) }
                }, "keyboard-microphone").apply { start() }
                while (current.capture.get() || current.queue.isNotEmpty()) {
                    if (current.canceled.get() || current.failure != null) break
                    val audio = current.queue.poll(100, TimeUnit.MILLISECONDS) ?: continue
                    deliver(current, speech.accept(audio))
                }
                if (!current.canceled.get() && current.failure == null) deliver(current, speech.finish())
            }
        } catch (error: Exception) { current.failure = error.message ?: "Local speech recognition failed." }
        finally {
            current.capture.set(false)
            try { recorder?.stop() } catch (_: IllegalStateException) { }
            reader?.join()
            recorder?.release()
            current.recorder = null
            main.post {
                if (run === current) {
                    try { current.route?.close() } catch (error: Exception) { current.failure = error.message }
                    DictationAudioService.stopRequested = null
                    DictationAudioService.revoked = null
                    DictationAudioService.armed = false
                    ime.stopService(Intent(ime, DictationAudioService::class.java))
                    run = null
                    message = current.failure?.let { ime.getString(R.string.dictation_error, it) } ?: idleMessage()
                    render()
                }
            }
        }
    }
    private fun deliver(current: Run, update: SpeechUpdate) {
        if (update.completed.isEmpty() && update.partial.isEmpty()) return
        main.post {
            if (run !== current || current.canceled.get() || !current.lease.valid) return@post
            val connection = ime.currentInputConnection ?: run { cancel(); return@post }
            if (connection.getTextBeforeCursor(64, 0)?.toString() != current.tail ||
                connection.getSelectedText(0)?.toString() != current.selectedText) {
                cancel(); return@post
            }
            for (text in update.completed) {
                val before = connection.getTextBeforeCursor(1, 0)?.lastOrNull()
                val prefix = if (before != null && !before.isWhitespace() && text.firstOrNull() !in listOf('.', ',', '!', '?', ';', ':')) " " else ""
                isInserting = true
                try { ime.onTextInput(prefix + text) } finally { isInserting = false }
                current.lease.committed(ime.dictationSelectionStart, ime.dictationSelectionEnd)
                if (!current.lease.valid) { cancel(); return@post }
            }
            current.tail = connection.getTextBeforeCursor(64, 0)?.toString()
            current.selectedText = connection.getSelectedText(0)?.toString()
            if (current.capture.get()) {
                message = ime.getString(R.string.dictation_listening, current.routeName) +
                    if (update.partial.isNotEmpty()) "\n${update.partial}" else ""
                render()
            }
        }
    }
}
