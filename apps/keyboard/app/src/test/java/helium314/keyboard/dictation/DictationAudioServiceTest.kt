// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.content.Intent
import org.junit.After
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class DictationAudioServiceTest {
    @After fun reset() {
        DictationAudioService.started = null
        DictationAudioService.stopRequested = null
        DictationAudioService.revoked = null
        DictationAudioService.armed = false
    }

    @Test fun aCanceledLaunchCannotLeaveAMicrophoneServiceRunning() {
        DictationAudioService.armed = false
        val service = Robolectric.buildService(DictationAudioService::class.java).create()
        assertTrue(shadowOf(service.get()).isStoppedBySelf)
        assertFalse(DictationAudioService.running)
        service.destroy()
    }

    @Test fun notificationStopAllowsTheLastPhraseToFinishBeforeServiceCleanup() {
        DictationAudioService.armed = true
        var finishing = false
        var revoked = 0
        DictationAudioService.stopRequested = { finishing = true }
        DictationAudioService.revoked = { revoked++ }
        val service = Robolectric.buildService(DictationAudioService::class.java).create()
        assertTrue(DictationAudioService.running)
        service.get().onStartCommand(Intent().setAction("stop"), 0, 1)
        assertTrue(finishing)
        assertFalse(shadowOf(service.get()).isStoppedBySelf)
        assertEquals(0, revoked)
        // The IME releases the service after its decoder flush; Android teardown revokes capture.
        service.destroy()
        assertFalse(DictationAudioService.running)
        assertEquals(1, revoked)
    }

    @Test fun theStartupActivityFinishesIfTheEditorHasAlreadyCanceled() {
        DictationAudioService.armed = false
        val activity = Robolectric.buildActivity(DictationStartActivity::class.java).setup()
        assertTrue(activity.get().isFinishing)
        assertFalse(DictationAudioService.running)
        activity.pause().stop().destroy()
    }
}
