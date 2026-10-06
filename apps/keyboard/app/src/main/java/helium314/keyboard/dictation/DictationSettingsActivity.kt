// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.*
import android.view.View
import helium314.keyboard.latin.R

class DictationSettingsActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var models: Spinner
    private lateinit var source: Spinner
    private lateinit var download: Button
    private var worker: Thread? = null
    private var lastProgress = 0L
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = getString(R.string.dictation_title)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }
        setContentView(ScrollView(this).apply { addView(layout) })
        layout.addView(TextView(this).apply { setText(R.string.dictation_intro); textSize = 17f })
        models = Spinner(this).apply {
            adapter = ArrayAdapter(this@DictationSettingsActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf(getString(R.string.dictation_model_tiny), getString(R.string.dictation_model_small),
                    getString(R.string.dictation_model_medium)))
            setSelection(DictationModels.architectures.indexOf(DictationModels.architecture(context)))
        }
        source = Spinner(this).apply {
            adapter = ArrayAdapter(this@DictationSettingsActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf(getString(R.string.dictation_bluetooth), getString(R.string.dictation_phone)))
            setSelection(if (DictationModels.useBluetooth(context)) 0 else 1)
        }
        layout.addView(models)
        layout.addView(source)
        val listener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: AdapterView<*>?) {}
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                DictationModels.save(this@DictationSettingsActivity, architecture(), source.selectedItemPosition == 0)
                refresh()
            }
        }
        models.onItemSelectedListener = listener
        source.onItemSelectedListener = listener
        layout.addView(Button(this).apply {
            setText(R.string.dictation_permissions)
            setOnClickListener {
                val permissions = requiredPermissions().toMutableList()
                if (Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.POST_NOTIFICATIONS)
                requestPermissions(permissions.toTypedArray(), 1)
            }
        })
        layout.addView(Button(this).apply {
            setText(R.string.dictation_app_permissions)
            setOnClickListener {
                startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    android.net.Uri.fromParts("package", packageName, null)))
            }
        })
        download = Button(this).apply {
            setText(R.string.dictation_download)
            setOnClickListener { install() }
        }
        layout.addView(download)
        status = TextView(this).apply { textSize = 16f }
        layout.addView(status)
        layout.addView(Button(this).apply {
            setText(R.string.dictation_remove)
            setOnClickListener {
                if (worker == null) {
                    val removed = DictationModels.directory(this@DictationSettingsActivity, architecture()).deleteRecursively()
                    if (removed) refresh() else status.setText(R.string.dictation_remove_failed)
                }
            }
        })
        layout.addView(Button(this).apply {
            setText(R.string.dictation_notices)
            setOnClickListener {
                AlertDialog.Builder(this@DictationSettingsActivity).setTitle(R.string.dictation_notices)
                    .setMessage(assets.open("dictation-notices.txt").bufferedReader().use { it.readText() })
                    .setPositiveButton(android.R.string.ok, null).show()
            }
        })
        refresh()
    }
    private fun architecture() = DictationModels.architectures[models.selectedItemPosition]
    private fun requiredPermissions() = if (Build.VERSION.SDK_INT >= 31 && source.selectedItemPosition == 0)
        arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.BLUETOOTH_CONNECT)
        else arrayOf(Manifest.permission.RECORD_AUDIO)
    private fun refresh() {
        if (!::status.isInitialized || worker != null) return
        status.text = when {
            requiredPermissions().any { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED } ->
                getString(R.string.dictation_permissions)
            DictationModels.isReady(this, architecture()) -> getString(R.string.dictation_ready)
            else -> getString(R.string.dictation_download)
        }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()
    }
    override fun onResume() { super.onResume(); refresh() }
    private fun install() {
        if (worker != null) return
        val arch = architecture()
        download.isEnabled = false
        models.isEnabled = false
        source.isEnabled = false
        status.setText(R.string.dictation_loading)
        val app = applicationContext
        worker = Thread({
            var failure: String? = null
            try {
                DictationModels.install(app, arch) { file, _, _, bytes, total ->
                    val now = android.os.SystemClock.elapsedRealtime()
                    if (now - lastProgress >= 200) {
                        lastProgress = now
                        runOnUiThread { if (!isDestroyed) status.text = getString(R.string.dictation_download_progress,
                            file, if (total > 0) (bytes * 100 / total).toInt() else 0) }
                    }
                }
            } catch (error: Exception) { failure = error.message ?: "Download failed. Try again." }
            val message = failure
            runOnUiThread {
                worker = null
                if (!isDestroyed) {
                    download.isEnabled = true; models.isEnabled = true; source.isEnabled = true
                    if (message != null) status.text = message else refresh()
                }
            }
        }, "dictation-model-download").apply { start() }
    }
    override fun onDestroy() { worker?.interrupt(); super.onDestroy() }
}
