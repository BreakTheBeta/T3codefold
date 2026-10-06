// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.BroadcastReceiver
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import java.io.Closeable

/** Communication mode activates HFP/SCO microphone audio, without a cellular call. */
class CallAudioRoute(
    private val context: Context,
    private val handler: Handler,
    private val bluetooth: Boolean,
    private val failed: (String) -> Unit,
) : Closeable {
    private val audio = context.getSystemService(AudioManager::class.java)
    private var previousMode = AudioManager.MODE_NORMAL
    private var ownsAudio = false
    private var closed = false
    private var selected: AudioDeviceInfo? = null
    private var ready: ((String) -> Unit)? = null
    private var deviceListener: AudioManager.OnCommunicationDeviceChangedListener? = null
    private var scoReceiver: BroadcastReceiver? = null
    private val timeout = Runnable { fail("The headset did not connect to call audio. Check Bluetooth calling is enabled for your glasses.") }
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setOnAudioFocusChangeListener({ change ->
            if (change != AudioManager.AUDIOFOCUS_GAIN && !closed) fail("Another app took call audio.")
        }, handler).build()

    fun open(onReady: (String) -> Unit) {
        check(!closed && !ownsAudio)
        ready = onReady
        previousMode = audio.mode
        check(previousMode != AudioManager.MODE_IN_CALL && previousMode != AudioManager.MODE_IN_COMMUNICATION) {
            "End other voice calls before dictating."
        }
        check(audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            "Could not obtain call audio. End other voice calls and try again."
        }
        ownsAudio = true
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        if (Build.VERSION.SDK_INT >= 31) {
            val devices = audio.availableCommunicationDevices
            selected = if (bluetooth) {
                devices.filter { isBluetooth(it.type) }.sortedByDescending {
                    val name = it.productName.toString().lowercase()
                    name.contains("ray") || name.contains("meta")
                }.firstOrNull()
            } else devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
                ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            val device = checkNotNull(selected) {
                if (bluetooth) "No Bluetooth call microphone is available. Connect your Ray-Bans and enable Calls in Bluetooth settings."
                else "The phone microphone is unavailable."
            }
            val listener = AudioManager.OnCommunicationDeviceChangedListener { current ->
                if (closed) return@OnCommunicationDeviceChangedListener
                if (current?.id == device.id) connected(device.productName.toString())
                else if (ready == null) fail("The selected call microphone disconnected.")
            }
            deviceListener = listener
            audio.addOnCommunicationDeviceChangedListener(context.mainExecutor, listener)
            check(audio.setCommunicationDevice(device)) { "Android refused the selected call audio device." }
            handler.postDelayed(timeout, 10_000)
            if (audio.communicationDevice?.id == device.id) connected(device.productName.toString())
        } else if (bluetooth) {
            @Suppress("DEPRECATION")
            check(audio.isBluetoothScoAvailableOffCall) { "Bluetooth call recording is unavailable." }
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    when (intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)) {
                        AudioManager.SCO_AUDIO_STATE_CONNECTED -> {
                            @Suppress("DEPRECATION")
                            audio.isBluetoothScoOn = true
                            connected("Bluetooth headset")
                        }
                        AudioManager.SCO_AUDIO_STATE_DISCONNECTED -> if (ready == null)
                            fail("The Bluetooth call microphone disconnected.")
                    }
                }
            }
            scoReceiver = receiver
            context.registerReceiver(receiver, IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED))
            @Suppress("DEPRECATION")
            audio.startBluetoothSco()
            handler.postDelayed(timeout, 10_000)
        } else connected("Phone microphone")
    }

    fun acceptsInput(device: AudioDeviceInfo?): Boolean {
        if (device == null) return false
        if (!bluetooth) return device.type == AudioDeviceInfo.TYPE_BUILTIN_MIC
        if (!isBluetooth(device.type)) return false
        if (Build.VERSION.SDK_INT < 28) return true
        // HFP input/output endpoints have different IDs, but share a Bluetooth address.
        val address = selected?.address.orEmpty()
        return address.isEmpty() || device.address == address
    }

    private fun connected(name: String) {
        handler.removeCallbacks(timeout)
        val callback = ready ?: return
        ready = null
        callback(name)
    }
    private fun fail(message: String) { if (!closed) failed(message) }

    override fun close() {
        if (closed) return
        closed = true
        ready = null
        handler.removeCallbacks(timeout)
        try {
            try {
                deviceListener?.let { if (Build.VERSION.SDK_INT >= 31) audio.removeOnCommunicationDeviceChangedListener(it) }
            } finally { scoReceiver?.let { context.unregisterReceiver(it) } }
        } finally {
            if (ownsAudio) {
                try {
                    if (Build.VERSION.SDK_INT >= 31) {
                        audio.clearCommunicationDevice()
                    } else if (bluetooth) {
                        @Suppress("DEPRECATION")
                        audio.stopBluetoothSco()
                        @Suppress("DEPRECATION")
                        audio.isBluetoothScoOn = false
                    }
                } finally {
                    try { audio.mode = previousMode }
                    finally { audio.abandonAudioFocusRequest(focus); ownsAudio = false }
                }
            }
        }
    }

    companion object {
        fun isBluetooth(type: Int) = type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
            (Build.VERSION.SDK_INT >= 31 && type == AudioDeviceInfo.TYPE_BLE_HEADSET)
    }
}
