// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.app.Activity
import android.inputmethodservice.InputMethodService
import android.view.View
import android.view.ViewGroup
import helium314.keyboard.ShadowInputMethodService
import helium314.keyboard.keyboard.KeyboardSwitcher
import helium314.keyboard.latin.LatinIME
import helium314.keyboard.latin.R
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.test.Test
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], shadows = [ShadowInputMethodService::class])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DictationInsetsTest {
    @Test fun theDictationControlsAreInsideTheImeTouchableRegion() {
        val service = Robolectric.buildService(LatinIME::class.java).create()
        val ime = service.get()
        val switcher = KeyboardSwitcher.getInstance()
        val input = switcher.onCreateInputView(ime, true)
        ime.setInputView(input)
        switcher.reloadMainKeyboard()
        (input.parent as? ViewGroup)?.removeView(input)
        val activity = Robolectric.buildActivity(Activity::class.java).setup()
        activity.get().setContentView(input)
        input.measure(View.MeasureSpec.makeMeasureSpec(ime.resources.displayMetrics.widthPixels, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
        input.layout(0, 0, input.measuredWidth, input.measuredHeight)
        val panel = input.findViewById<View>(R.id.dictation_panel)
        assertTrue(panel.height > 0)
        val insets = InputMethodService.Insets()
        ime.onComputeInsets(insets)
        val origin = IntArray(2)
        val position = IntArray(2)
        input.getLocationInWindow(origin)
        panel.getLocationInWindow(position)
        val x = position[0] - origin[0] + panel.width / 2
        val y = position[1] - origin[1] + panel.height / 2
        assertTrue(insets.touchableRegion.contains(x, y),
            "Dictation controls at $x,$y must receive touches. Region: ${insets.touchableRegion}; " +
                "wrapper shown=${switcher.wrapperView.isShown}, panel=${panel.width}x${panel.height}, input=${input.height}.")
        service.destroy()
        activity.pause().stop().destroy()
    }
}
