// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import helium314.keyboard.latin.R

/** Supplies foreground eligibility for call audio; the IME owns capture and its editor lease. */
class DictationAudioService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("dictation", getString(R.string.dictation_title),
            NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(this, 0, Intent(this, javaClass).setAction("stop"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = Notification.Builder(this, "dictation")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(getString(R.string.dictation_title))
            .setContentText("Speech stays on this phone. Stop to release call audio.")
            .setOngoing(true).addAction(Notification.Action.Builder(null, getString(R.string.dictation_stop), stop).build())
            .build()
        startForeground(4102, notification)
        if (!armed) { stopSelf(); started?.invoke(); return }
        running = true
        started?.invoke()
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "stop") {
            val stop = stopRequested
            if (stop == null) stopSelf() else stop()
        }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        running = false
        revoked?.invoke()
        super.onDestroy()
    }
    companion object {
        var running = false
            private set
        var started: (() -> Unit)? = null
        var stopRequested: (() -> Unit)? = null
        var revoked: (() -> Unit)? = null
        var armed = false
    }
}

/** Android 14+ requires starting a microphone foreground service from a visible activity. */
class DictationStartActivity : Activity() {
    private var launched = false
    private val handler = Handler(Looper.getMainLooper())
    private val timeout = Runnable { finish() }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(android.widget.TextView(this).apply {
            setText(R.string.dictation_connecting)
            gravity = android.view.Gravity.CENTER
        })
    }
    override fun onResume() {
        super.onResume()
        if (launched) return
        launched = true
        if (!DictationAudioService.armed) { finish(); return }
        if (DictationAudioService.running) { finish(); return }
        DictationAudioService.started = { finish() }
        handler.postDelayed(timeout, 5_000)
        try { startForegroundService(Intent(this, DictationAudioService::class.java)) }
        catch (error: RuntimeException) {
            android.widget.Toast.makeText(this, getString(R.string.dictation_error, error.message),
                android.widget.Toast.LENGTH_LONG).show()
            finish()
        }
    }
    override fun onDestroy() {
        handler.removeCallbacks(timeout)
        DictationAudioService.started = null
        super.onDestroy()
    }
}
