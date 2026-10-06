// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import org.junit.runner.RunWith
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class CallAudioRouteTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val audio = context.getSystemService(AudioManager::class.java)
    private val shadow = shadowOf(audio)
    private val handler = Handler(Looper.getMainLooper())
    private val failures = mutableListOf<String>()
    private fun route(bluetooth: Boolean = true) = CallAudioRoute(context, handler, bluetooth, failures::add)
    private fun device(type: Int, id: Int, name: String, address: String = "") = mock(AudioDeviceInfo::class.java).also {
        `when`(it.type).thenReturn(type)
        `when`(it.id).thenReturn(id)
        `when`(it.productName).thenReturn(name)
        if (android.os.Build.VERSION.SDK_INT >= 28) `when`(it.address).thenReturn(address)
    }

    @Test fun rayBansArePreferredAndCallModeIsReleasedAfterward() {
        val earbuds = device(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, 1, "Earbuds", "earbuds")
        val glasses = device(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, 2, "Ray-Ban Meta", "glasses")
        shadow.setAvailableCommunicationDevices(listOf(earbuds, glasses))
        var ready: String? = null
        route().use {
            it.open { name -> ready = name }
            assertEquals(AudioManager.MODE_IN_COMMUNICATION, audio.mode)
            assertEquals(glasses, audio.communicationDevice)
            assertEquals("Ray-Ban Meta", ready)
            assertTrue(it.acceptsInput(device(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, 3, "Ray-Ban input", "glasses")))
            assertFalse(it.acceptsInput(earbuds))
            assertFalse(it.acceptsInput(device(AudioDeviceInfo.TYPE_BUILTIN_MIC, 4, "Phone")))
            assertFalse(it.acceptsInput(null))
        }
        assertEquals(AudioManager.MODE_NORMAL, audio.mode)
        assertNull(audio.communicationDevice)
        assertNotNull(shadow.lastAbandonedAudioFocusRequest)
        assertTrue(failures.isEmpty())
    }

    @Test fun unavailableGlassesFailAndStillReleaseCallMode() {
        shadow.setAvailableCommunicationDevices(listOf(device(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, 1, "Phone")))
        route().use { assertFailsWith<IllegalStateException> { it.open {} } }
        assertEquals(AudioManager.MODE_NORMAL, audio.mode)
        assertNotNull(shadow.lastAbandonedAudioFocusRequest)
    }

    @Test fun changingTheCommunicationDeviceStopsTheSession() {
        val glasses = device(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, 1, "Ray-Ban Meta")
        val phone = device(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, 2, "Phone")
        shadow.setAvailableCommunicationDevices(listOf(glasses, phone))
        route().use {
            it.open {}
            shadow.callOnCommunicationDeviceChangedListeners(phone)
            shadowOf(Looper.getMainLooper()).idle()
            assertEquals(listOf("The selected call microphone disconnected."), failures)
        }
        shadow.callOnCommunicationDeviceChangedListeners(glasses)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(1, failures.size)
    }

    @Test fun existingVoiceCallsAreLeftAlone() {
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        route().use { assertFailsWith<IllegalStateException> { it.open {} } }
        assertEquals(AudioManager.MODE_IN_COMMUNICATION, audio.mode)
        assertNull(shadow.lastAbandonedAudioFocusRequest)
    }

    @Test fun rejectedAudioFocusLeavesThePhoneInNormalMode() {
        shadow.setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_FAILED)
        route().use { assertFailsWith<IllegalStateException> { it.open {} } }
        assertEquals(AudioManager.MODE_NORMAL, audio.mode)
        assertNull(shadow.lastAbandonedAudioFocusRequest)
    }

    @Test fun phoneModeAcceptsOnlyTheHandsetMicrophoneAndClearsItsRoutingRequest() {
        val phone = device(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE, 1, "Phone")
        shadow.setAvailableCommunicationDevices(listOf(phone))
        audio.setCommunicationDevice(phone)
        route(false).use {
            it.open {}
            assertTrue(it.acceptsInput(device(AudioDeviceInfo.TYPE_BUILTIN_MIC, 2, "Microphone")))
            assertFalse(it.acceptsInput(device(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, 3, "Glasses")))
        }
        assertNull(audio.communicationDevice)
        assertEquals(AudioManager.MODE_NORMAL, audio.mode)
    }

    @Test @Config(sdk = [26]) fun legacyScoWaitsForConnectionAndReleasesIt() {
        shadow.setIsBluetoothScoAvailableOffCall(true)
        var ready = false
        route().use {
            it.open { ready = true }
            assertFalse(ready)
            context.sendBroadcast(Intent(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
                .putExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, AudioManager.SCO_AUDIO_STATE_CONNECTED))
            shadowOf(Looper.getMainLooper()).idle()
            assertTrue(ready)
            @Suppress("DEPRECATION")
            assertTrue(audio.isBluetoothScoOn)
            assertTrue(it.acceptsInput(device(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, 1, "Glasses")))
        }
        @Suppress("DEPRECATION")
        assertFalse(audio.isBluetoothScoOn)
        assertEquals(AudioManager.MODE_NORMAL, audio.mode)
    }
}
