// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.content.Context
import android.os.UserManager
import androidx.test.core.app.ApplicationProvider
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class DictationModelsTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    @Test fun theSetupActivityAndDirectBootKeyboardUseTheSamePrivateModelDirectory() {
        val directBoot = context.createDeviceProtectedStorageContext()
        assertEquals(File(directBoot.noBackupFilesDir, "speech/en-2"),
            DictationModels.directory(directBoot, 2))
        assertEquals(DictationModels.directory(context, 2), DictationModels.directory(directBoot, 2))
        DictationModels.save(directBoot, 2, false)
        assertEquals(2, DictationModels.architecture(context))
        assertFalse(DictationModels.useBluetooth(context))
    }

    @Test fun theKeyboardCanInitializeBeforeUnlockWithoutLoadingSpeechData() {
        shadowOf(context.getSystemService(UserManager::class.java)).setUserUnlocked(false)
        val directBoot = context.createDeviceProtectedStorageContext()
        assertEquals(4, DictationModels.architecture(directBoot))
        assertEquals(true, DictationModels.useBluetooth(directBoot))
        assertFalse(DictationModels.isReady(directBoot, 4))
    }
}
