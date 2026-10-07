package expo.modules.t3reviewdiff

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Selection uses document line indices, so wrap and font changes never change its text. */
internal class SourceLineSelection(
  private val view: View,
  private val rowAt: (Float) -> Int,
  private val rowTop: (Int) -> Int,
  private val rowBottom: (Int) -> Int,
  private val rowCount: () -> Int,
  private val rowText: (Int) -> String,
  private val onScroll: (Int) -> Unit,
  private val onAttach: (Int, Int) -> Unit,
) {
  private val density = view.resources.displayMetrics.density
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private var anchor = -1
  private var extent = -1
  private var draggingStart: Boolean? = null
  private var actionMode: ActionMode? = null
  private var dragY = 0f
  private val edgeScroll = object : Runnable {
    override fun run() {
      if (!dragging) return
      val edge = 40 * density
      val delta = when {
        dragY < edge -> (-12 * density).toInt()
        dragY > view.height - edge -> (12 * density).toInt()
        else -> 0
      }
      if (delta != 0) {
        onScroll(delta)
        extent = rowAt(dragY).coerceIn(0, rowCount() - 1)
        actionMode?.invalidateContentRect()
        view.invalidate()
      }
      view.postOnAnimation(this)
    }
  }
  var canAttach = false
  val dragging: Boolean get() = draggingStart != null
  val start: Int get() = min(anchor, extent)
  val end: Int get() = max(anchor, extent)

  fun contains(index: Int) = anchor >= 0 && index in start..end

  fun begin(y: Float) {
    if (rowCount() == 0) return
    clear()
    anchor = rowAt(y).coerceIn(0, rowCount() - 1)
    extent = anchor
    view.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
    actionMode = view.startActionMode(object : ActionMode.Callback2() {
      override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
        menu.add(0, 1, 0, "Copy").setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM)
        menu.add(0, 2, 1, "Select all")
        if (canAttach) menu.add(0, 3, 2, "Attach lines")
        return true
      }
      override fun onPrepareActionMode(mode: ActionMode, menu: Menu) = false
      override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
        when (item.itemId) {
          1 -> {
            val clipboard = view.context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("Source lines", selectedText()))
            mode.finish()
          }
          2 -> {
            anchor = 0
            extent = rowCount() - 1
            view.invalidate()
            mode.invalidateContentRect()
          }
          3 -> {
            onAttach(start, end)
            mode.finish()
          }
          else -> return false
        }
        return true
      }
      override fun onDestroyActionMode(mode: ActionMode) {
        actionMode = null
        anchor = -1
        extent = -1
        draggingStart = null
        view.removeCallbacks(edgeScroll)
        view.invalidate()
      }
      override fun onGetContentRect(mode: ActionMode, source: View, outRect: Rect) {
        outRect.set(0, rowTop(start).coerceIn(0, view.height), view.width,
          rowBottom(end).coerceIn(0, view.height))
      }
    }, ActionMode.TYPE_FLOATING)
    view.invalidate()
  }

  fun clear() {
    actionMode?.finish()
    anchor = -1
    extent = -1
    draggingStart = null
    view.removeCallbacks(edgeScroll)
    view.invalidate()
  }

  fun selectedText(): String = if (anchor < 0) "" else (start..end).joinToString("\n", transform = rowText)

  fun onTouch(event: MotionEvent): Boolean {
    if (anchor < 0) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        val radius = 26 * density
        val nearStart = abs(event.x - handleX(true)) <= radius &&
          abs(event.y - handleY(true)) <= radius
        val nearEnd = abs(event.x - handleX(false)) <= radius &&
          abs(event.y - handleY(false)) <= radius
        if (!nearStart && !nearEnd) return false
        val previousStart = start
        val previousEnd = end
        draggingStart = nearStart
        anchor = if (nearStart) previousEnd else previousStart
        extent = if (nearStart) previousStart else previousEnd
        dragY = event.y
        view.postOnAnimation(edgeScroll)
        view.parent?.requestDisallowInterceptTouchEvent(true)
      }
      MotionEvent.ACTION_MOVE -> {
        if (!dragging) return false
        dragY = event.y
        extent = rowAt(event.y).coerceIn(0, rowCount() - 1)
        actionMode?.invalidateContentRect()
        view.invalidate()
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (!dragging) return false
        draggingStart = null
        view.removeCallbacks(edgeScroll)
        view.parent?.requestDisallowInterceptTouchEvent(false)
      }
      else -> return dragging
    }
    return true
  }

  private fun handleX(first: Boolean) = if (first) 24 * density else view.width - 24 * density
  private fun handleY(first: Boolean) = (if (first) rowTop(start) else rowBottom(end)).toFloat()

  fun drawHandles(canvas: Canvas, color: Int) {
    if (anchor < 0) return
    paint.color = color
    for (first in listOf(true, false)) {
      val y = handleY(first)
      if (y in 0f..view.height.toFloat()) {
        val x = handleX(first)
        canvas.drawCircle(x, y, 9 * density, paint)
        paint.color = Color.WHITE
        canvas.drawCircle(x, y, 2 * density, paint)
        paint.color = color
      }
    }
  }
}
