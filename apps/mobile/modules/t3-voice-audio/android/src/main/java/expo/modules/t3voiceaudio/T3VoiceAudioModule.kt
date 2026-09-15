package expo.modules.t3voiceaudio

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.telecom.DisconnectCause
import androidx.core.telecom.*
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*

class T3VoiceAudioModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var call: CallControlScope? = null
  private var callJob: Job? = null
  private var currentEndpointId: String? = null
  private var endpoints = emptyList<CallEndpointCompat>()
  private var previousVolumeStream: Int? = null
  private val context get() = requireNotNull(appContext.reactContext)
  private val audio get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  override fun definition() = ModuleDefinition {
    Name("T3VoiceAudio")
    Events("endCall", "audioRoute", "systemMute")
    OnCreate { VoiceCallService.endCall = { sendEvent("endCall") } }
    AsyncFunction("start") { promise: Promise -> perform(promise) {
      check(callJob == null) { "A voice call is already active." }
      val activity = requireNotNull(appContext.currentActivity) { "Start voice with T3 in the foreground." }
      previousVolumeStream = activity.volumeControlStream
      activity.volumeControlStream = AudioManager.STREAM_VOICE_CALL
      val manager = CallsManager(context)
      manager.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE)
      val ready = CompletableDeferred<Unit>()
      context.startForegroundService(Intent(context, VoiceCallService::class.java))
      callJob = scope.launch {
        try {
          manager.addCall(
            CallAttributesCompat("Codex", Uri.parse("t3code:codex"), CallAttributesCompat.DIRECTION_OUTGOING, callCapabilities = 0),
            onAnswer = { throw IllegalStateException("This is an outgoing call.") },
            onDisconnect = { sendEvent("endCall") },
            onSetActive = {},
            onSetInactive = { sendEvent("endCall") }
          ) {
            call = this
            launch { currentCallEndpoint.collect { endpoint ->
              currentEndpointId = endpoint.identifier.toString()
              sendEvent("audioRoute", mapOf("name" to endpoint.name.toString(), "speaker" to (endpoint.type == CallEndpointCompat.TYPE_SPEAKER)))
            } }
            launch { availableEndpoints.collect { endpoints = it } }
            launch { isMuted.collect { sendEvent("systemMute", mapOf("muted" to it)) } }
            ready.complete(Unit)
          }
        } catch (error: Exception) {
          if (!ready.isCompleted) ready.completeExceptionally(error)
          else if (error !is CancellationException) sendEvent("endCall")
        }
      }
      withTimeout(15_000) { ready.await() }
      false
    } }
    AsyncFunction("connected") { promise: Promise -> perform(promise) {
      check(call?.setActive() is CallControlResult.Success) { "Android could not activate call audio." }
      // Telecom owns audio focus and Bluetooth HFP/LE routes. Never compete with
      // it using AudioManager.setCommunicationDevice or startBluetoothSco.
      val preferred = endpoints.firstOrNull { it.type == CallEndpointCompat.TYPE_BLUETOOTH }
        ?: endpoints.firstOrNull { it.type == CallEndpointCompat.TYPE_WIRED_HEADSET }
        ?: endpoints.firstOrNull { it.type == CallEndpointCompat.TYPE_SPEAKER }
      if (preferred != null) check(call?.requestEndpointChange(preferred) is CallControlResult.Success) { "Could not select call audio output." }
      null
    } }
    AsyncFunction("chooseEndpoint") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) promise.reject("VOICE_AUDIO", "Open T3 to choose call audio.", null)
      else activity.runOnUiThread {
        val choices = endpoints.toList()
        AlertDialog.Builder(activity)
          .setTitle("Call audio output")
          .setSingleChoiceItems(choices.map { it.name.toString() }.toTypedArray(), choices.indexOfFirst { it.identifier.toString() == currentEndpointId }) { dialog, index ->
            dialog.dismiss()
            perform(promise) {
              check(call?.requestEndpointChange(choices[index]) is CallControlResult.Success) { "Requested call audio output is unavailable." }
              null
            }
          }
          .setNegativeButton("Cancel") { _, _ -> promise.resolve(null) }
          .setOnCancelListener { promise.resolve(null) }
          .show()
      }
    }
    Function("volumeUp") {
      audio.adjustStreamVolume(AudioManager.STREAM_VOICE_CALL, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
    }
    AsyncFunction("stop") { promise: Promise -> perform(promise) { stop(); null } }
    OnDestroy {
      scope.launch { stop(); scope.cancel() }
      VoiceCallService.endCall = null
    }
  }

  private fun perform(promise: Promise, work: suspend () -> Any?) {
    scope.launch {
      try { promise.resolve(work()) }
      catch (error: Exception) { promise.reject("VOICE_AUDIO", error.message, error) }
    }
  }

  private suspend fun stop() {
    call?.disconnect(DisconnectCause(DisconnectCause.LOCAL))
    call = null
    callJob?.cancelAndJoin()
    callJob = null
    endpoints = emptyList()
    previousVolumeStream?.let { appContext.currentActivity?.volumeControlStream = it }
    previousVolumeStream = null
    context.stopService(Intent(context, VoiceCallService::class.java))
  }
}

class VoiceCallService : Service() {
  companion object { var endCall: (() -> Unit)? = null }
  private var wakeLock: PowerManager.WakeLock? = null
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("codex-voice", "Codex voice calls", NotificationManager.IMPORTANCE_LOW))
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val end = PendingIntent.getService(this, 1, Intent(this, VoiceCallService::class.java).setAction("end"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val notification = Notification.Builder(this, "codex-voice")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("Codex voice is active")
      .setContentText("Microphone in use. Tap to return to T3.")
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_CALL)
    if (Build.VERSION.SDK_INT >= 31) notification.setStyle(
      Notification.CallStyle.forOngoingCall(Person.Builder().setName("Codex").build(), end)
    ) else notification.addAction(Notification.Action.Builder(null, "End call", end).build())
    if (open != null) notification.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    startForeground(3774, notification.build())
    wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "t3:voice").also { it.acquire() }
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "end") endCall?.invoke()
    return START_NOT_STICKY
  }
  override fun onDestroy() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    super.onDestroy()
  }
}
