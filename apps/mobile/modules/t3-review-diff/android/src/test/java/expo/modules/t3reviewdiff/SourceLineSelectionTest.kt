package expo.modules.t3reviewdiff

import android.app.Activity
import android.graphics.Canvas
import android.graphics.Color
import android.view.MotionEvent
import android.view.View
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class SourceLineSelectionTest {
  @Test
  fun rangeHandlesSelectOriginalLinesInEitherDirection() {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
    val view = View(activity).apply { layout(0, 0, 320, 500) }
    val lines = listOf("first", "\tsecond", "third", "")
    val selection = SourceLineSelection(view, { (it / 40).toInt() }, { it * 40 },
      { (it + 1) * 40 }, { lines.size }, { lines[it] }, {}, { _, _ -> })
    selection.begin(45f)
    assertEquals("\tsecond", selection.selectedText())
    assertTrue(selection.contains(1))
    assertFalse(selection.contains(0))
    val density = view.resources.displayMetrics.density
    fun touch(action: Int, x: Float, y: Float): Boolean {
      val event = MotionEvent.obtain(0, 0, action, x, y, 0)
      val result = selection.onTouch(event)
      event.recycle()
      return result
    }
    assertTrue(touch(MotionEvent.ACTION_DOWN, view.width - 24 * density, 80f))
    assertTrue(touch(MotionEvent.ACTION_MOVE, 200f, 120f))
    assertEquals("\tsecond\nthird\n", selection.selectedText())
    assertTrue(touch(MotionEvent.ACTION_UP, 200f, 120f))
    assertFalse(selection.dragging)
    assertTrue(touch(MotionEvent.ACTION_DOWN, 24 * density, 40f))
    touch(MotionEvent.ACTION_MOVE, 24 * density, 0f)
    touch(MotionEvent.ACTION_UP, 24 * density, 0f)
    assertEquals(lines.joinToString("\n"), selection.selectedText())
    selection.drawHandles(Canvas(), Color.BLUE)
    selection.clear()
    assertEquals("", selection.selectedText())
  }
}
