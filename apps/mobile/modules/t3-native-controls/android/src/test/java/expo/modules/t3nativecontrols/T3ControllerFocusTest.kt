package expo.modules.t3nativecontrols

import android.app.Activity
import android.view.View
import android.os.Looper
import android.widget.FrameLayout
import android.widget.EditText
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], manifest = Config.NONE, qualifiers = "w1000dp-h1000dp-mdpi")
class T3ControllerFocusTest {
  @Test fun horizontalNavigationLeavesAnEmptyConversationAndReturnsToItsSelectedThread() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val root = FrameLayout(activity)
    fun target(id: String, left: Int, top: Int, width: Int, height: Int) = FrameLayout(activity).apply {
      setTag(com.facebook.react.R.id.view_tag_native_id, id)
      isFocusableInTouchMode = true
      root.addView(this, FrameLayout.LayoutParams(width, height).apply {
        leftMargin = left; topMargin = top
      })
    }
    target("t3-controller:thread:other", 0, 300, 250, 80)
    val thread = target("t3-controller:thread:selected", 0, 200, 250, 80).apply { isSelected = true }
    val conversation = target("t3-controller-conversation", 300, 0, 650, 700)
    val reply = target("t3-controller:reply:current", 300, 750, 650, 100)
    activity.setContentView(root)
    activity.window.decorView.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY))
    activity.window.decorView.layout(0, 0, 1000, 1000)
    assertTrue("Thread is a visible navigation target", thread.getGlobalVisibleRect(android.graphics.Rect()))
    thread.requestFocus()
    val move = T3ControllerRouter::class.java.getDeclaredMethod("move", View::class.java, String::class.java).apply { isAccessible = true }
    move.invoke(T3ControllerRouter, root, "right")
    assertSame("Right enters the chat even when it has no inline buttons", conversation, root.findFocus())
    move.invoke(T3ControllerRouter, root, "left")
    assertSame("Left returns to the selected thread", thread, root.findFocus())
    val dispatched = mutableListOf<Pair<String, String>>()
    T3ControllerRouter.activate(root, "activate") { action, id -> dispatched.add(action to id) }
    shadowOf(Looper.getMainLooper()).idle()
    assertSame("Selecting a thread enters its chat", conversation, root.findFocus())
    assertEquals(listOf("activate" to "t3-controller:thread:selected"), dispatched)
    T3ControllerRouter.scopeChanged()
    shadowOf(Looper.getMainLooper()).idle()
    assertSame("Route and reply registration must not strand focus back in the sidebar", conversation, root.findFocus())
    T3ControllerRouter.activate(root, "activate") { action, id -> dispatched.add(action to id) }
    assertSame("A on an empty chat acquires the reply without activating a random sidebar control", reply, root.findFocus())
    assertEquals(1, dispatched.size)
    move.invoke(T3ControllerRouter, root, "left")
    assertSame(conversation, root.findFocus())
    T3ControllerRouter.activate(root, "dictate") { action, id -> dispatched.add(action to id) }
    assertSame("Speaking from chat focuses the current reply", reply, root.findFocus())
    assertEquals("dictate" to "t3-controller:reply:current", dispatched.last())
    val editor = EditText(activity).apply { isFocusableInTouchMode = true }
    reply.addView(editor, FrameLayout.LayoutParams(500, 80))
    editor.requestFocus()
    assertTrue("Back leaves text editing before navigating away", T3ControllerRouter.leaveEditor(root))
    assertSame(conversation, root.findFocus())
    move.invoke(T3ControllerRouter, root, "left")
    assertSame("Navigation is restored after leaving the editor", thread, root.findFocus())
    T3ControllerRouter.reset()
  }
}
