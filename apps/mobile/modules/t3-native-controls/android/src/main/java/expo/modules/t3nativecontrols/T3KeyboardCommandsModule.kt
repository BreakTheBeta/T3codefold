package expo.modules.t3nativecontrols

import android.app.Activity
import android.content.Context
import android.os.Build
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.Menu
import android.view.View
import android.view.Window
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import java.util.WeakHashMap

class T3KeyboardCommandsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("T3KeyboardCommands")

    View(T3KeyboardCommandsView::class) {
      Prop("enabledCommands") { view: T3KeyboardCommandsView, commands: List<String> ->
        view.enabledCommands = commands.toSet()
      }
      Events("onCommand")
    }
  }
}

/**
 * Hardware-keyboard chord for a key press, or null. Ctrl is the shortcut modifier; Meta is
 * accepted too because many Bluetooth keyboards send it for their Command key. Mirrors the
 * iOS UIKeyCommands and the web default keybindings.
 */
internal fun hardwareKeyboardCommandFor(
  keyCode: Int,
  mod: Boolean,
  shift: Boolean,
  alt: Boolean,
): String? {
  if (!mod) {
    if (shift || alt) return null
    return when (keyCode) {
      KeyEvent.KEYCODE_DPAD_DOWN -> "paletteNext"
      KeyEvent.KEYCODE_DPAD_UP -> "palettePrevious"
      KeyEvent.KEYCODE_ESCAPE -> "paletteDismiss"
      KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "paletteSelect"
      else -> null
    }
  }
  if (alt) {
    if (shift) return null
    return when (keyCode) {
      KeyEvent.KEYCODE_V -> "voiceToggle"
      KeyEvent.KEYCODE_M -> "voiceMute"
      KeyEvent.KEYCODE_S -> "voiceOutputMute"
      else -> null
    }
  }
  if (shift) {
    return when (keyCode) {
      KeyEvent.KEYCODE_LEFT_BRACKET -> "thread.previous"
      KeyEvent.KEYCODE_RIGHT_BRACKET -> "thread.next"
      KeyEvent.KEYCODE_F -> "files"
      KeyEvent.KEYCODE_T -> "terminal"
      KeyEvent.KEYCODE_R -> "review"
      KeyEvent.KEYCODE_C -> "copyThreadReference"
      KeyEvent.KEYCODE_H -> "cycleHost"
      else -> null
    }
  }
  return when (keyCode) {
    KeyEvent.KEYCODE_K -> "commandPalette"
    KeyEvent.KEYCODE_N -> "newTask"
    KeyEvent.KEYCODE_F -> "focusSearch"
    KeyEvent.KEYCODE_B, KeyEvent.KEYCODE_BACKSLASH -> "toggleSidebar"
    KeyEvent.KEYCODE_LEFT_BRACKET -> "back"
    KeyEvent.KEYCODE_GRAVE -> "terminal"
    in KeyEvent.KEYCODE_1..KeyEvent.KEYCODE_9 -> "thread.jump.${keyCode - KeyEvent.KEYCODE_0}"
    else -> null
  }
}

/** Commands that keep firing while their key auto-repeats. */
private val REPEATING_COMMANDS = setOf("paletteNext", "palettePrevious")

/**
 * Routes key events to mounted command views. A ViewGroup only sees keys while a descendant
 * has focus, which in touch mode is rarely true, so the activity window's callback offers every
 * key here before normal dispatch. Other windows (the command palette's Dialog) fall back to
 * the view's own dispatchKeyEvent, which works there because the palette focuses its input.
 */
private object T3KeyboardRouter {
  private val views = mutableListOf<WeakReference<T3KeyboardCommandsView>>()
  private val interceptedRoots = WeakHashMap<View, Unit>()

  /** Key codes whose DOWN was consumed; their repeats and UP are consumed too. */
  private val heldKeyCodes = mutableSetOf<Int>()

  fun register(view: T3KeyboardCommandsView) {
    views.removeAll { it.get() == null || it.get() === view }
    views.add(WeakReference(view))
  }

  fun unregister(view: T3KeyboardCommandsView) {
    views.removeAll { it.get() == null || it.get() === view }
  }

  fun install(activity: Activity) {
    val window = activity.window ?: return
    if (interceptedRoots.containsKey(window.decorView)) return
    window.callback = T3KeyboardWindowCallback(window.callback, window.decorView)
    interceptedRoots[window.decorView] = Unit
  }

  fun intercepts(root: View) = interceptedRoots.containsKey(root)

  /** Offers the event to command views in [root], most recently mounted first. */
  fun dispatch(event: KeyEvent, root: View): Boolean {
    when (event.action) {
      KeyEvent.ACTION_UP -> return heldKeyCodes.remove(event.keyCode)
      KeyEvent.ACTION_DOWN -> Unit
      else -> return false
    }
    val command =
      hardwareKeyboardCommandFor(
        event.keyCode,
        mod = event.isCtrlPressed || event.isMetaPressed,
        shift = event.isShiftPressed,
        alt = event.isAltPressed,
      ) ?: return false
    val view =
      views.asReversed().firstNotNullOfOrNull { reference ->
        reference.get()?.takeIf {
          it.isAttachedToWindow && it.rootView === root && it.enabledCommands.contains(command)
        }
      } ?: return heldKeyCodes.contains(event.keyCode) && event.repeatCount > 0
    heldKeyCodes.add(event.keyCode)
    if (event.repeatCount == 0 || command in REPEATING_COMMANDS) view.emit(command)
    return true
  }
}

private class T3KeyboardWindowCallback(
  private val delegate: Window.Callback,
  private val root: View,
) : Window.Callback by delegate {
  override fun dispatchKeyEvent(event: KeyEvent): Boolean =
    T3KeyboardRouter.dispatch(event, root) || delegate.dispatchKeyEvent(event)

  // Java default methods are not covered by Kotlin delegation.
  override fun onProvideKeyboardShortcuts(
    data: MutableList<KeyboardShortcutGroup>?,
    menu: Menu?,
    deviceId: Int,
  ) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      delegate.onProvideKeyboardShortcuts(data, menu, deviceId)
    }
  }

  override fun onPointerCaptureChanged(hasCapture: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      delegate.onPointerCaptureChanged(hasCapture)
    }
  }
}

class T3KeyboardCommandsView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {
  private val onCommand by EventDispatcher()
  var enabledCommands = emptySet<String>()

  internal fun emit(command: String) {
    onCommand(mapOf("command" to command))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    T3KeyboardRouter.register(this)
    val activity = appContext.currentActivity
    if (activity != null && activity.window?.decorView === rootView) {
      T3KeyboardRouter.install(activity)
    }
  }

  override fun onDetachedFromWindow() {
    T3KeyboardRouter.unregister(this)
    super.onDetachedFromWindow()
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val root = rootView
    if (!T3KeyboardRouter.intercepts(root) && T3KeyboardRouter.dispatch(event, root)) return true
    return super.dispatchKeyEvent(event)
  }
}
