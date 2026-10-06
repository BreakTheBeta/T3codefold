package expo.modules.t3windowposture

import android.app.Activity
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Reports the hinges of a foldable display (Jetpack WindowManager folding
 * features) in window-relative dp, so split panes can meet at the fold.
 */
class T3WindowPostureModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private var collection: Job? = null
  private var collectingActivity: Activity? = null
  private var latest: Map<String, Any> = mapOf("hinges" to emptyList<Any>())

  override fun definition() = ModuleDefinition {
    Name("T3WindowPosture")
    Events("onPostureChange")

    Function("getPosture") { latest }

    OnCreate { collect() }
    OnActivityEntersForeground { collect() }
    OnDestroy {
      scope.cancel()
      collection = null
      collectingActivity = null
    }
  }

  private fun collect() {
    val activity = appContext.currentActivity ?: return
    if (collection?.isActive == true && collectingActivity === activity) return
    collection?.cancel()
    collectingActivity = activity
    collection = scope.launch {
      WindowInfoTracker.getOrCreate(activity).windowLayoutInfo(activity).collect { info ->
        latest = postureOf(info, activity.resources.displayMetrics.density)
        sendEvent("onPostureChange", latest)
      }
    }
  }
}

internal fun postureOf(info: WindowLayoutInfo, density: Float): Map<String, Any> =
  mapOf(
    "hinges" to info.displayFeatures.filterIsInstance<FoldingFeature>().map { feature ->
      val bounds = feature.bounds
      mapOf(
        "left" to bounds.left / density,
        "top" to bounds.top / density,
        "right" to bounds.right / density,
        "bottom" to bounds.bottom / density,
        "orientation" to
          if (feature.orientation == FoldingFeature.Orientation.VERTICAL) "vertical"
          else "horizontal",
        "state" to if (feature.state == FoldingFeature.State.HALF_OPENED) "halfOpened" else "flat",
        "separating" to feature.isSeparating,
      )
    },
  )
