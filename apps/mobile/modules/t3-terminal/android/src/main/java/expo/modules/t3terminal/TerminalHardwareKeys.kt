package expo.modules.t3terminal

import android.view.KeyCharacterMap
import android.view.KeyEvent

/**
 * Decides which hardware key presses the terminal encodes itself, through Ghostty's
 * key encoder so cursor key mode and Kitty keyboard flags apply. Plain typing,
 * unmodified Enter and Backspace stay on the EditText path the soft keyboard uses.
 */
internal object TerminalHardwareKeys {
  private val alwaysEncoded = setOf(
    KeyEvent.KEYCODE_ESCAPE,
    KeyEvent.KEYCODE_TAB,
    KeyEvent.KEYCODE_DPAD_UP,
    KeyEvent.KEYCODE_DPAD_DOWN,
    KeyEvent.KEYCODE_DPAD_LEFT,
    KeyEvent.KEYCODE_DPAD_RIGHT,
    KeyEvent.KEYCODE_MOVE_HOME,
    KeyEvent.KEYCODE_MOVE_END,
    KeyEvent.KEYCODE_PAGE_UP,
    KeyEvent.KEYCODE_PAGE_DOWN,
    KeyEvent.KEYCODE_INSERT,
    KeyEvent.KEYCODE_FORWARD_DEL,
    KeyEvent.KEYCODE_NUMPAD_ENTER,
  ) + (KeyEvent.KEYCODE_F1..KeyEvent.KEYCODE_F12)

  fun shouldEncode(keyCode: Int, metaState: Int): Boolean {
    // Meta (Super) chords belong to app and system shortcuts.
    if ((metaState and KeyEvent.META_META_ON) != 0) return false
    if (keyCode in alwaysEncoded) return true
    val ctrl = (metaState and KeyEvent.META_CTRL_ON) != 0
    // Right Alt is AltGr on many layouts and types characters, so only left Alt modifies.
    val alt = (metaState and KeyEvent.META_ALT_LEFT_ON) != 0
    val shift = (metaState and KeyEvent.META_SHIFT_ON) != 0
    return when (keyCode) {
      KeyEvent.KEYCODE_ENTER -> ctrl || alt || shift
      else -> ctrl || alt
    }
  }

  /** The key's character without Ctrl/Alt/Meta applied, or 0 when it has none. */
  fun text(event: KeyEvent): Int {
    val modifiers = KeyEvent.META_CTRL_MASK or KeyEvent.META_ALT_MASK or KeyEvent.META_META_MASK
    return printable(event.getUnicodeChar(event.metaState and modifiers.inv()))
  }

  fun unshiftedText(event: KeyEvent): Int = printable(event.getUnicodeChar(0))

  private fun printable(char: Int): Int =
    if ((char and KeyCharacterMap.COMBINING_ACCENT) != 0 || char < 0x20) 0 else char
}
