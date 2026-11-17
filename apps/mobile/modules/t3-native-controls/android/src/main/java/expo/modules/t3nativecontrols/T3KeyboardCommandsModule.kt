package expo.modules.t3nativecontrols

import android.content.Context
import android.view.KeyEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class T3KeyboardCommandsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3KeyboardCommands")

    OnActivityEntersBackground { T3ControllerRouter.suspend() }

    View(T3KeyboardCommandsView::class) {
      Prop("enabledCommands") { view: T3KeyboardCommandsView, commands: List<String> ->
        view.enabledCommands = commands.toSet()
      }
      Prop("controllerScope") { view: T3KeyboardCommandsView, scope: String ->
        if (view.controllerScope != scope) { view.controllerScope = scope; T3ControllerRouter.scopeChanged() }
      }
      Prop("controllerRecording") { view: T3KeyboardCommandsView, busy: Boolean -> view.controllerRecording = busy }
      Prop("controllerSelection") { view: T3KeyboardCommandsView, enabled: Boolean -> view.controllerSelection = enabled }
      Prop("controllerEvents") { view: T3KeyboardCommandsView, enabled: Boolean -> view.controllerEvents = enabled }
      Prop("vimKeysEnabled") { view: T3KeyboardCommandsView, enabled: Boolean ->
        view.vimKeysEnabled = enabled
      }
      Events("onCommand", "onVimKey", "onController")
    }
  }
}

class T3KeyboardCommandsView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {
  private val onController by EventDispatcher()
  internal fun emitController(action: String, target: String = "") { onController(mapOf("action" to action, "targetId" to target)) }
  private val onCommand by EventDispatcher()
  private val onVimKey by EventDispatcher()
  var controllerScope = ""
  var controllerSelection = false
  var controllerRecording = false
  var controllerEvents = false
  var enabledCommands = emptySet<String>()
  var vimKeysEnabled = false

  internal fun emit(command: String) {
    onCommand(mapOf("command" to command))
  }

  internal fun emitVimKey(key: String, ctrl: Boolean) {
    onVimKey(mapOf("key" to key, "ctrl" to ctrl))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    T3KeyboardRouter.register(this)
    T3ControllerRouter.register(this)
    val activity = appContext.currentActivity
    if (activity != null && activity.window?.decorView === rootView) {
      T3KeyboardRouter.install(activity)
    }
  }

  override fun onDetachedFromWindow() {
    T3ControllerRouter.unregister(this)
    T3KeyboardRouter.unregister(this)
    super.onDetachedFromWindow()
  }

  override fun dispatchGenericMotionEvent(event: android.view.MotionEvent): Boolean =
    T3ControllerRouter.motion(event, rootView) || super.dispatchGenericMotionEvent(event)

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val root = rootView
    if (!T3KeyboardRouter.intercepts(root) && T3ControllerRouter.key(event, root)) return true
    if (!T3KeyboardRouter.intercepts(root) && T3KeyboardRouter.dispatch(event, root)) return true
    return super.dispatchKeyEvent(event)
  }
}
