package expo.modules.t3nativecontrols

import android.app.Activity
import android.view.View
import android.os.Looper
import android.widget.FrameLayout
import android.widget.EditText
import android.widget.ScrollView
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
  @Test fun navigatingLongConversationScrollsThroughInlineActionsAndReachesReply() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val root = FrameLayout(activity)
    fun target(id: String) = View(activity).apply {
      setTag(com.facebook.react.R.id.view_tag_native_id, id)
      isFocusableInTouchMode = true
    }
    val thread = target("t3-controller:thread:selected").apply { isSelected = true }
    root.addView(thread, FrameLayout.LayoutParams(250, 80).apply { topMargin = 400 })
    val chat = FrameLayout(activity).apply { setTag(com.facebook.react.R.id.view_tag_native_id, "t3-controller-conversation") }
    root.addView(chat, FrameLayout.LayoutParams(650, 600).apply { leftMargin = 300 })
    val scroller = ScrollView(activity)
    val content = FrameLayout(activity).apply { minimumHeight = 2400 }
    scroller.addView(content, FrameLayout.LayoutParams(650, 2400))
    chat.addView(scroller, FrameLayout.LayoutParams(650, 600))
    val first = target("t3-controller:fold:first")
    content.addView(first, FrameLayout.LayoutParams(500, 80).apply { topMargin = 100 })
    val last = target("t3-controller:fold:last")
    content.addView(last, FrameLayout.LayoutParams(500, 80).apply { topMargin = 2200 })
    val reply = target("t3-controller:reply:current")
    root.addView(reply, FrameLayout.LayoutParams(650, 100).apply { leftMargin = 300; topMargin = 700 })
    activity.setContentView(root)
    activity.window.decorView.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY))
    activity.window.decorView.layout(0, 0, 1000, 1000)
    first.requestFocus()
    T3ControllerRouter.move(root, "down")
    assertTrue("Down at the last visible inline action scrolls the thread before leaving it", scroller.scrollY > 0)
    assertTrue("Down must not escape to the sidebar or skip unread content for the reply", root.findFocus() !== thread && root.findFocus() !== reply)
    repeat(12) { T3ControllerRouter.move(root, "down") }
    assertEquals("All the conversation can be traversed", 1800, scroller.scrollY)
    assertSame("Down at the end reaches the reply box", reply, root.findFocus())
    T3ControllerRouter.move(root, "up")
    assertSame("Up from the reply returns to the last inline action", last, root.findFocus())
    T3ControllerRouter.move(root, "right")
    assertSame("Right from any inline action is a direct route to the reply", reply, root.findFocus())
    T3ControllerRouter.move(root, "up")
    repeat(12) { T3ControllerRouter.move(root, "up") }
    assertEquals("Up can traverse all the way back through gaps without inline controls", 0, scroller.scrollY)
    assertSame("Up stays in the conversation instead of escaping to the sidebar", first, root.findFocus())
    content.removeView(first)
    T3ControllerRouter.move(root, "down")
    assertTrue("Recycling the focused inline action must recover inside the conversation", generateSequence(root.findFocus()) { it.parent as? View }.any { it === chat })
    T3ControllerRouter.reset()
  }

  @Test fun conversationNavigationContractHoldsAcrossLayoutsAndContentStates() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    try {
      for (width in listOf(600, 1000)) for (sidebar in listOf(false, true)) {
        for (height in listOf(500, 2400, 7200)) for (density in listOf("none", "sparse", "dense")) {
          for (position in listOf(0, (height - 500) / 2, height - 500).distinct()) {
            val scenario = "width=$width sidebar=$sidebar height=$height controls=$density start=$position"
            val root = FrameLayout(activity)
            fun target(id: String) = View(activity).apply {
              setTag(com.facebook.react.R.id.view_tag_native_id, id)
              isFocusableInTouchMode = true
            }
            val thread = target("t3-controller:thread:selected").apply { isSelected = true }
            if (sidebar) root.addView(thread, FrameLayout.LayoutParams(160, 80).apply { topMargin = 200 })
            val chatLeft = if (sidebar) 180 else 0
            val chatWidth = width - chatLeft
            val chat = FrameLayout(activity).apply {
              setTag(com.facebook.react.R.id.view_tag_native_id, "t3-controller-conversation")
              isFocusableInTouchMode = true
            }
            root.addView(chat, FrameLayout.LayoutParams(chatWidth, 500).apply { leftMargin = chatLeft })
            val scroller = ScrollView(activity)
            val content = FrameLayout(activity).apply { minimumHeight = height }
            scroller.addView(content, FrameLayout.LayoutParams(chatWidth, height))
            chat.addView(scroller, FrameLayout.LayoutParams(chatWidth, 500))
            val offsets = when (density) {
              "sparse" -> listOf(40, height - 100).distinct()
              "dense" -> (40..height - 100 step 160).toList()
              else -> emptyList()
            }
            for (offset in offsets) content.addView(target("t3-controller:inline:$offset"), FrameLayout.LayoutParams(chatWidth - 20, 60).apply { topMargin = offset })
            val reply = target("t3-controller:reply:current")
            root.addView(reply, FrameLayout.LayoutParams(chatWidth, 80).apply { leftMargin = chatLeft; topMargin = 600 })
            activity.setContentView(root)
            activity.window.decorView.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(800, View.MeasureSpec.EXACTLY))
            activity.window.decorView.layout(0, 0, width, 800)
            scroller.scrollTo(0, position)
            chat.requestFocus()
            T3ControllerRouter.move(root, "right")
            assertSame("Reply is directly reachable: $scenario", reply, root.findFocus())
            T3ControllerRouter.move(root, "left")
            assertSame("Reply has a route back to chat: $scenario", chat, root.findFocus())
            val bound = offsets.size * 2 + height / 100 + 10
            repeat(bound) {
              if (root.findFocus() !== reply) T3ControllerRouter.move(root, "down")
              val focus = root.findFocus()
              assertTrue("Vertical navigation stays in chat or reply: $scenario", focus === reply || generateSequence(focus) { it.parent as? View }.any { it === chat })
            }
            assertSame("Down eventually reaches reply: $scenario", reply, root.findFocus())
            assertTrue("Reply is reached only after the unread tail: $scenario", !scroller.canScrollVertically(1))
            T3ControllerRouter.move(root, "up")
            repeat(bound) { T3ControllerRouter.move(root, "up") }
            assertEquals("Up eventually reaches the start: $scenario", 0, scroller.scrollY)
            T3ControllerRouter.move(root, "right")
            assertSame("Inline actions retain the reply shortcut: $scenario", reply, root.findFocus())
            if (sidebar) {
              T3ControllerRouter.move(root, "left")
              T3ControllerRouter.move(root, "left")
              assertSame("Chat has a route back to threads: $scenario", thread, root.findFocus())
            }
            T3ControllerRouter.reset()
          }
        }
      }
    } finally {
      activity.finish()
      T3ControllerRouter.reset()
    }
  }

  @Test fun settingsAndDialogNavigationCanReachOffscreenControls() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().visible().get()
    val root = FrameLayout(activity)
    val scroller = ScrollView(activity)
    val content = FrameLayout(activity).apply { minimumHeight = 2400 }
    fun target(id: String, top: Int) = View(activity).apply {
      setTag(com.facebook.react.R.id.view_tag_native_id, id)
      isFocusableInTouchMode = true
      content.addView(this, FrameLayout.LayoutParams(500, 60).apply { topMargin = top })
    }
    val first = target("t3-controller:adjustable:volume", 80)
    val last = target("t3-controller:setting:last", 2200)
    scroller.addView(content, FrameLayout.LayoutParams(650, 2400))
    root.addView(scroller, FrameLayout.LayoutParams(650, 600))
    activity.setContentView(root)
    activity.window.decorView.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY))
    activity.window.decorView.layout(0, 0, 1000, 1000)
    first.requestFocus()
    val adjustments = mutableListOf<Pair<String, String>>()
    assertTrue(T3ControllerRouter.adjust(root, "right") { action, id -> adjustments.add(action to id) })
    assertTrue(T3ControllerRouter.adjust(root, "left") { action, id -> adjustments.add(action to id) })
    assertEquals(listOf("increment" to "t3-controller:adjustable:volume", "decrement" to "t3-controller:adjustable:volume"), adjustments)
    assertTrue("Up and Down leave the adjustable field", !T3ControllerRouter.adjust(root, "down") { _, _ -> throw AssertionError("Down must navigate") })
    T3ControllerRouter.move(root, "down")
    assertTrue("Settings and dialogs scroll beyond their last visible control", scroller.scrollY > 0)
    repeat(16) { T3ControllerRouter.move(root, "down") }
    assertSame("Offscreen settings remain controller reachable", last, root.findFocus())
    repeat(16) { T3ControllerRouter.move(root, "up") }
    assertEquals("Settings have a reverse path", 0, scroller.scrollY)
    assertSame(first, root.findFocus())
    val field = FrameLayout(activity).apply {
      setTag(com.facebook.react.R.id.view_tag_native_id, "t3-controller:settings-search")
      isFocusableInTouchMode = true
    }
    val editor = EditText(activity).apply { isFocusableInTouchMode = true }
    field.addView(editor, FrameLayout.LayoutParams(400, 60))
    root.addView(field, FrameLayout.LayoutParams(500, 80).apply { topMargin = 700 })
    activity.window.decorView.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY))
    activity.window.decorView.layout(0, 0, 1000, 1000)
    editor.requestFocus()
    assertTrue("Back leaves a settings or dialog editor before closing its scope", T3ControllerRouter.leaveEditor(root))
    assertSame(field, root.findFocus())
    activity.finish()
    T3ControllerRouter.reset()
  }

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
    T3ControllerRouter.move(root, "right")
    assertSame("Right enters the chat even when it has no inline buttons", conversation, root.findFocus())
    T3ControllerRouter.move(root, "left")
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
    T3ControllerRouter.move(root, "left")
    assertSame(conversation, root.findFocus())
    T3ControllerRouter.activate(root, "dictate") { action, id -> dispatched.add(action to id) }
    assertSame("Speaking from chat focuses the current reply", reply, root.findFocus())
    assertTrue("Back from reply navigation returns to the conversation", T3ControllerRouter.back(root))
    assertSame(conversation, root.findFocus())
    assertTrue("Back from conversation returns to threads", T3ControllerRouter.back(root))
    assertSame(thread, root.findFocus())
    T3ControllerRouter.move(root, "right")
    T3ControllerRouter.move(root, "right")
    assertEquals("dictate" to "t3-controller:reply:current", dispatched.last())
    val editor = EditText(activity).apply { isFocusableInTouchMode = true }
    reply.addView(editor, FrameLayout.LayoutParams(500, 80))
    editor.requestFocus()
    assertTrue("Back leaves text editing before navigating away", T3ControllerRouter.leaveEditor(root))
    assertSame(conversation, root.findFocus())
    T3ControllerRouter.move(root, "left")
    assertSame("Navigation is restored after leaving the editor", thread, root.findFocus())
    T3ControllerRouter.reset()
  }
}
