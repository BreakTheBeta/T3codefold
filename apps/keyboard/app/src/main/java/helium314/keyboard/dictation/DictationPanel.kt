// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.content.Context
import android.text.TextUtils
import android.util.AttributeSet
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import helium314.keyboard.latin.R

class DictationPanel(context: Context, attributes: AttributeSet?) : LinearLayout(context, attributes) {
    private val status = TextView(context).apply {
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.END
        setPadding(12, 8, 8, 8)
        textSize = 13f
    }
    private val toggle = Button(context).apply { setText(R.string.dictation_start) }
    private val setup = Button(context).apply { setText(R.string.dictation_setup) }
    init {
        orientation = HORIZONTAL
        gravity = android.view.Gravity.CENTER_VERTICAL
        addView(status, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        addView(toggle, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
        addView(setup, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
    }
    fun bind(controller: DictationController) {
        toggle.setOnClickListener { controller.toggle() }
        setup.setOnClickListener { controller.openSetup() }
    }
    fun render(message: String, busy: Boolean, stopping: Boolean) {
        status.text = message
        toggle.setText(if (busy) R.string.dictation_stop else R.string.dictation_start)
        toggle.isEnabled = !stopping
    }
}
