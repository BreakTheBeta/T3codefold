package expo.modules.t3nativecontrols

import android.graphics.Rect
import android.hardware.input.InputManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import java.lang.ref.WeakReference

// Native focus identifies controls; JS invokes registered actions instead of synthetic clicks.
internal object T3ControllerRouter {
  private val views = mutableListOf<WeakReference<T3KeyboardCommandsView>>()
  private val inputState = T3ControllerRoutingState()
  private var device: Int? = null
  private var enabled = false
  private val handler = Handler(Looper.getMainLooper())
  private var direction: String? = null
  fun scopeChanged() {
    stopScroll()
    repeat?.let { handler.removeCallbacks(it) }; repeat = null
    direction = null; inputState.scopeChanged(); highlighted?.clearFocus(); clearRing()
  }
  private var repeat: Runnable? = null
  private var scrollRepeat: Runnable? = null
  private var scrollOwner: T3KeyboardCommandsView? = null
  private var scrollAmount = 0
  private fun stopScroll() {
    scrollRepeat?.let { handler.removeCallbacks(it) }
    scrollRepeat = null; scrollOwner = null; scrollAmount = 0
  }
  private fun updateScroll(view: T3KeyboardCommandsView, amount: Int) {
    if (amount == 0) { stopScroll(); return }
    scrollAmount = amount
    if (scrollOwner === view && scrollRepeat != null) return
    scrollRepeat?.let { handler.removeCallbacks(it) }
    scrollOwner = view
    val capturedGeneration = inputState.generation
    val task = object : Runnable {
      override fun run() {
        if (!enabled || !inputState.canRepeat(capturedGeneration) || !view.hasWindowFocus() || !view.isAttachedToWindow) { stopScroll(); return }
        scroll(view, scrollAmount)
        handler.postDelayed(this, 50)
      }
    }
    scrollRepeat = task; task.run()
  }
  private var owner: View? = null
  private val analogTriggers = mutableSetOf<Int>()
  private var highlighted: View? = null
  private var ring: android.graphics.drawable.GradientDrawable? = null
  private fun focus(target: View?) {
    clearRing()
    target ?: return
    target.isFocusableInTouchMode = true
    if (!target.requestFocus()) return
    val drawable = android.graphics.drawable.GradientDrawable().apply {
      setColor(android.graphics.Color.TRANSPARENT)
      setStroke((3 * target.resources.displayMetrics.density).toInt(), android.graphics.Color.YELLOW)
      cornerRadius = 12 * target.resources.displayMetrics.density
      setBounds(0, 0, target.width, target.height)
    }
    target.overlay.add(drawable); highlighted = target; ring = drawable
  }
  private fun clearRing() { ring?.let { highlighted?.overlay?.remove(it) }; highlighted = null; ring = null }
  private var manager: InputManager? = null
  private val listener = object : InputManager.InputDeviceListener {
    override fun onInputDeviceAdded(id: Int) = Unit
    override fun onInputDeviceChanged(id: Int) { if (device == id) reset() }
    override fun onInputDeviceRemoved(id: Int) { if (device == id) reset() }
  }
  fun register(view: T3KeyboardCommandsView) {
    views.add(WeakReference(view))
    if (manager == null) {
      manager = view.context.getSystemService(Context.INPUT_SERVICE) as InputManager
      manager?.registerInputDeviceListener(listener, handler)
    }
  }
  fun unregister(view: T3KeyboardCommandsView) {
    views.removeAll { it.get() == null || it.get() === view }
    reset(keepEnabled = views.isNotEmpty())
    if (views.isEmpty()) { manager?.unregisterInputDeviceListener(listener); manager = null }
  }
  fun reset(keepEnabled: Boolean = false) {
    stopScroll()
    clearRing()
    inputState.scopeChanged()
    repeat?.let { handler.removeCallbacks(it) }
    repeat = null
    direction = null
    if (!keepEnabled) { enabled = false; device = null }
    owner = null
    // Keep held buttons blocked until their release, including across window changes.
    views.mapNotNull { it.get() }.filter { it.controllerEvents }.forEach {
      it.emitController("reset")
      if (enabled) it.emitController("enabled")
    }
  }
  private fun view(root: View) = views.asReversed().firstNotNullOfOrNull { it.get()?.takeIf { v -> v.controllerEvents && v.isAttachedToWindow && v.isShown && v.rootView === root } }
  private fun id(view: View?) = view?.getTag(com.facebook.react.R.id.view_tag_native_id) as? String
  private fun targets(root: View): List<View> {
    val result = mutableListOf<View>()
    fun visit(v: View) {
      if (v.importantForAccessibility == View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return
      if (!v.isShown || !v.isEnabled || !v.getGlobalVisibleRect(Rect())) return
      if (id(v)?.startsWith("t3-controller:") == true && v.isFocusable) result.add(v)
      if (v is ViewGroup) for (i in 0 until v.childCount) visit(v.getChildAt(i))
    }
    visit(root)
    return result
  }
  private fun move(root: View, action: String) {
    val candidates = targets(root)
    val current = root.findFocus()
    val currentRect = Rect()
    current?.getGlobalVisibleRect(currentRect)
    val next = if (current !in candidates) {
      val local = if (current is ViewGroup) candidates.filter { target -> generateSequence(target.parent) { it.parent }.any { it === current } } else emptyList()
      (if (local.isNotEmpty()) local else candidates).let { if (action == "up" || action == "left") it.lastOrNull() else it.firstOrNull() }
    } else candidates.filter { it !== current }.mapNotNull { target ->
      val rect = Rect(); target.getGlobalVisibleRect(rect)
      val dx = rect.centerX() - currentRect.centerX(); val dy = rect.centerY() - currentRect.centerY()
      val primary = when(action) { "left" -> -dx; "right" -> dx; "up" -> -dy; else -> dy }
      val secondary = if (action == "left" || action == "right") dy else dx
      if (primary <= 0) null else target to (primary.toLong() * primary + 4L * secondary * secondary)
    }.minByOrNull { it.second }?.first
    focus(next)
  }
  private fun navigate(view: T3KeyboardCommandsView, action: String?) {
    if (direction == action && owner === view) return
    repeat?.let { handler.removeCallbacks(it) }; repeat = null
    direction = action; owner = view
    if (action == null) return
    if (view.controllerSelection) view.emitController(action) else move(view, action)
    val capturedGeneration = inputState.generation
    val task = object : Runnable {
      override fun run() {
        if (!enabled || !inputState.canRepeat(capturedGeneration, view.rootView.findFocus()?.onCheckIsTextEditor() == true, view.controllerSelection) || !view.hasWindowFocus() || !view.isAttachedToWindow) return
        if (view.controllerSelection) view.emitController(action) else move(view, action)
        handler.postDelayed(this, 100)
      }
    }
    repeat = task; handler.postDelayed(task, 350)
  }
  fun key(event: KeyEvent, root: View): Boolean {
    val input = event.device ?: return false
    if (!event.isFromSource(InputDevice.SOURCE_GAMEPAD) && !event.isFromSource(InputDevice.SOURCE_DPAD) && !event.isFromSource(InputDevice.SOURCE_JOYSTICK)) return false
    if (!input.supportsSource(InputDevice.SOURCE_GAMEPAD) && !input.supportsSource(InputDevice.SOURCE_JOYSTICK)) return false
    val view = view(root) ?: return false
    if (event.action == KeyEvent.ACTION_UP) {
      val consumed = inputState.keyUp(event.deviceId, event.keyCode)
      if (event.deviceId == device && event.keyCode in KeyEvent.KEYCODE_DPAD_UP..KeyEvent.KEYCODE_DPAD_RIGHT) navigate(view, null)
      return consumed
    }
    if (event.action != KeyEvent.ACTION_DOWN) return false
    if (!enabled) {
      if (event.keyCode != KeyEvent.KEYCODE_BUTTON_START) return inputState.isHeld(event.deviceId, event.keyCode)
      if (event.repeatCount > 0) return true
      enabled = true; device = event.deviceId; inputState.selectDevice(event.deviceId)
      val disposition = inputState.keyDown(event.deviceId, event.keyCode, "menu", false, false, 0)
      view.emitController("enabled")
      if (disposition == ControllerKeyDisposition.DISPATCH) move(view, "down")
      return true
    }
    if (device != event.deviceId) return false
    val action = when(event.keyCode) {
      KeyEvent.KEYCODE_DPAD_UP -> "up"
      KeyEvent.KEYCODE_DPAD_DOWN -> "down"
      KeyEvent.KEYCODE_DPAD_LEFT -> "left"
      KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
      KeyEvent.KEYCODE_BUTTON_A -> "activate"
      KeyEvent.KEYCODE_BUTTON_B -> "back"
      KeyEvent.KEYCODE_BUTTON_X -> "dictate"
      KeyEvent.KEYCODE_BUTTON_Y -> "footer"
      KeyEvent.KEYCODE_BUTTON_L1 -> "previous"
      KeyEvent.KEYCODE_BUTTON_R1 -> "next"
      KeyEvent.KEYCODE_BUTTON_L2 -> "pageUp"
      KeyEvent.KEYCODE_BUTTON_R2 -> "pageDown"
      KeyEvent.KEYCODE_BUTTON_START -> "menu"
      KeyEvent.KEYCODE_BUTTON_SELECT -> "chooser"
      KeyEvent.KEYCODE_BUTTON_THUMBL -> "conversation"
      KeyEvent.KEYCODE_BUTTON_THUMBR -> "reply"
      else -> return false
    }
    when (inputState.keyDown(event.deviceId, event.keyCode, action, root.findFocus()?.onCheckIsTextEditor() == true, view.controllerSelection, event.repeatCount)) {
      ControllerKeyDisposition.PASS -> return false
      ControllerKeyDisposition.CONSUME -> return true
      ControllerKeyDisposition.DISPATCH -> Unit
    }
    if (action in listOf("up", "down", "left", "right")) navigate(view, action)
    else if (action == "conversation") focus(conversation(view))
    else if (action == "reply") focus(targets(view).firstOrNull { id(it)?.startsWith("t3-controller:reply:") == true })
    else if (action == "footer") focus(targets(view).firstOrNull { id(it)?.startsWith("t3-controller:footer:") == true })
    else if (action == "activate" || action == "dictate") {
      var focused = root.findFocus()
      while (focused != null && id(focused)?.startsWith("t3-controller:") != true) focused = focused.parent as? View
      view.emitController(action, if (focused in targets(view)) id(focused) ?: "" else "")
    }
    else if (action == "pageUp" || action == "pageDown") scroll(view, if (action == "pageUp") -500 else 500)
    else view.emitController(action)
    return true
  }
  private fun conversation(root: View): View? {
    if (!root.isShown) return null
    if (id(root) == "t3-controller-conversation") return root
    if (root is ViewGroup) for (index in 0 until root.childCount) conversation(root.getChildAt(index))?.let { return it }
    return null
  }
  private fun scroll(root: View, amount: Int) {
    fun findScroller(view: View): android.widget.ScrollView? {
      if (!view.isShown || !view.getGlobalVisibleRect(Rect())) return null
      if (view is android.widget.ScrollView && view.canScrollVertically(if (amount < 0) -1 else 1)) return view
      if (view is ViewGroup) for (index in 0 until view.childCount) findScroller(view.getChildAt(index))?.let { return it }
      return null
    }
    val focusedTarget = root.findFocus()
    if (focusedTarget == null || generateSequence(focusedTarget) { it.parent as? View }.any { id(it)?.startsWith("t3-controller:reply:") == true }) {
      conversation(root)?.let { content ->
        findScroller(content)?.smoothScrollBy(0, amount)
        return
      }
    }
    var focused = focusedTarget
    while (focused != null) {
      findScroller(focused)?.let { it.smoothScrollBy(0, amount); return }
      if (id(focused) == "t3-controller-conversation") return
      if (focused === root) return
      focused = focused.parent as? View
    }
  }
  fun motion(event: MotionEvent, root: View): Boolean {
    if (!event.isFromSource(InputDevice.SOURCE_JOYSTICK) || event.action != MotionEvent.ACTION_MOVE || !enabled || device != event.deviceId) return false
    val view = view(root) ?: return false
    val allAxes = listOf(MotionEvent.AXIS_X, MotionEvent.AXIS_Y, MotionEvent.AXIS_HAT_X, MotionEvent.AXIS_HAT_Y, MotionEvent.AXIS_Z, MotionEvent.AXIS_RZ, MotionEvent.AXIS_LTRIGGER, MotionEvent.AXIS_RTRIGGER)
    val active = allAxes.any { axis ->
      val flat = event.device?.getMotionRange(axis, event.source)?.flat ?: 0f
      kotlin.math.abs(event.getAxisValue(axis)) > maxOf(flat, .35f)
    }
    val triggerEdges = listOf(MotionEvent.AXIS_LTRIGGER to -500, MotionEvent.AXIS_RTRIGGER to 500).mapNotNull { (axis, amount) ->
      val value = event.getAxisValue(axis)
      if (value < .35f) analogTriggers.remove(axis)
      if (value > .55f && analogTriggers.add(axis)) amount else null
    }
    if (!inputState.motion(event.deviceId, active)) return true
    triggerEdges.forEach { amount -> scroll(view, amount) }
    if (root.findFocus()?.onCheckIsTextEditor() == true && !view.controllerSelection) {
      val scrollValue = event.getAxisValue(MotionEvent.AXIS_RZ)
      updateScroll(view, if (kotlin.math.abs(scrollValue) > .25f) (scrollValue * 50).toInt() else 0)
      return true
    }
    fun axis(axis: Int): Float {
      val value = event.getAxisValue(axis)
      val flat = event.device?.getMotionRange(axis, event.source)?.flat ?: 0f
      return if (kotlin.math.abs(value) > maxOf(flat, if (direction == null) .55f else .35f)) value else 0f
    }
    val x = axis(MotionEvent.AXIS_HAT_X).takeIf { it != 0f } ?: axis(MotionEvent.AXIS_X)
    val y = axis(MotionEvent.AXIS_HAT_Y).takeIf { it != 0f } ?: axis(MotionEvent.AXIS_Y)
    navigate(view, if (x == 0f && y == 0f) null else if (kotlin.math.abs(x) > kotlin.math.abs(y)) { if(x < 0) "left" else "right" } else { if(y < 0) "up" else "down" })
    val scrollAxis = axis(MotionEvent.AXIS_RZ)
    updateScroll(view, (scrollAxis * 50).toInt())
    return true
  }
}
