// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.content.Context
import android.os.UserManager
import androidx.core.content.edit
import ai.moonshine.voice.AssetDownloader
import ai.moonshine.voice.JNI
import ai.moonshine.voice.ModelSpec
import java.io.File

object DictationModels {
    private const val PREFS = "local-dictation"
    val architectures = intArrayOf(JNI.MOONSHINE_MODEL_ARCH_TINY_STREAMING,
        JNI.MOONSHINE_MODEL_ARCH_SMALL_STREAMING, JNI.MOONSHINE_MODEL_ARCH_MEDIUM_STREAMING)
    fun unlocked(context: Context) = context.getSystemService(UserManager::class.java).isUserUnlocked
    private fun preferences(context: Context) = context.createDeviceProtectedStorageContext()
        .getSharedPreferences(PREFS, 0)
    fun architecture(context: Context): Int {
        if (!unlocked(context)) return JNI.MOONSHINE_MODEL_ARCH_SMALL_STREAMING
        return preferences(context)
        .getInt("model", JNI.MOONSHINE_MODEL_ARCH_SMALL_STREAMING)
        .takeIf { it in architectures } ?: JNI.MOONSHINE_MODEL_ARCH_SMALL_STREAMING
    }
    fun useBluetooth(context: Context) = if (!unlocked(context)) true else
        preferences(context).getBoolean("bluetooth", true)
    fun save(context: Context, arch: Int, bluetooth: Boolean) {
        preferences(context).edit {
            putInt("model", arch)
            putBoolean("bluetooth", bluetooth)
        }
    }
    // Public model weights only: app-private, excluded from backup, and shared by the setup
    // activity and direct-boot IME. No audio or transcript is written to this directory.
    fun directory(context: Context, arch: Int) = File(context.createDeviceProtectedStorageContext().noBackupFilesDir,
        "speech/en-$arch")
    fun isReady(context: Context, arch: Int) = unlocked(context) && File(directory(context, arch), "installed").isFile
    fun install(context: Context, arch: Int, progress: AssetDownloader.ProgressListener) {
        val root = directory(context, arch)
        AssetDownloader().ensureModelPresent(root, ModelSpec.stt("en", arch, false), progress)
        if (Thread.currentThread().isInterrupted) throw InterruptedException("Download canceled.")
        File(root, "installed").writeText("moonshine-voice:0.1.5\n")
    }
}
