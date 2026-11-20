package expo.modules.emotionalcheckinwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * ARCHI -- Home-Screen Widget Sync task: the widget's own push payload
 * from JS -- deliberately the SAME field set/shape as
 * arc/floatingTimerOverlayPayload.ts's FloatingTimerOverlayPayload
 * (minus the stage/resting/notification-only fields this widget never
 * renders), so data/emotionalCheckInWidget.ts can build it directly
 * from the SAME payload already built for the floating cube -- never
 * a second, independently-resolved "what's current" computation.
 */
class EmotionalCheckInWidgetPayload : Record {
  @Field
  val taskId: String = ""

  @Field
  val actionTitle: String = ""

  @Field
  val remainingSeconds: Double = 0.0

  @Field
  val paused: Boolean = false

  @Field
  val nextScheduledTaskTitle: String? = null

  @Field
  val nextScheduledTaskTime: String? = null

  @Field
  val nextScheduledTaskDurationMinutes: Int? = null

  @Field
  val nextScheduledTaskIsOverdue: Boolean = false
}

/**
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 1 ("Android Home-Screen... Shortcuts"):
 * the one missing piece of the ALREADY-BUILT emotional check-in widget
 * (EmotionalCheckInWidgetProvider.kt, registered as a plain
 * AppWidgetProvider receiver since the Unified Emotional Check-In task)
 * -- until now there was no JS-callable way for the app ITSELF to offer
 * "add this to your home screen"; the trainee had to find it manually
 * via the launcher's own long-press -> widgets picker. This bridges
 * AppWidgetManager.requestPinAppWidget (API 26+, Android 8.0 "Oreo"),
 * the one system API that lets an app prompt the launcher to pin one of
 * its OWN widgets directly, without the trainee hunting for it.
 *
 * Deliberately isolated to exactly these two functions -- never a
 * second, competing widget-registration mechanism, and never silently
 * claiming support this API doesn't provide: isRequestPinAppWidgetSupported
 * is itself launcher-dependent (not every OEM launcher implements the
 * pin-request flow even on API 26+), so the JS side must check it before
 * ever showing a button that promises to work.
 */
class EmotionalCheckInWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EmotionalCheckInWidget")

    Function("isPinWidgetSupported") {
      isPinSupported()
    }

    Function("requestPinWidget") {
      requestPin()
    }

    // ARCHI -- Home-Screen Widget Sync task: the ONE write path for
    // this widget's dynamic content -- persists the latest state and
    // immediately refreshes every placed widget instance, never
    // blocking/throwing when zero widgets are placed or the context is
    // unavailable (same best-effort convention as every other
    // native-module call this app makes from a background task/screen
    // event).
    Function("update") { payload: EmotionalCheckInWidgetPayload ->
      val context = appContext.reactContext ?: return@Function
      EmotionalCheckInWidgetProvider.pushState(
        context,
        WidgetState(
          taskId = payload.taskId,
          actionTitle = payload.actionTitle,
          remainingSecondsAtPush = payload.remainingSeconds,
          pushedAtEpochMs = System.currentTimeMillis(),
          paused = payload.paused,
          nextScheduledTaskTitle = payload.nextScheduledTaskTitle,
          nextScheduledTaskTime = payload.nextScheduledTaskTime,
          nextScheduledTaskDurationMinutes = payload.nextScheduledTaskDurationMinutes,
          nextScheduledTaskIsOverdue = payload.nextScheduledTaskIsOverdue
        )
      )
    }
  }

  private fun isPinSupported(): Boolean {
    val context = appContext.reactContext ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val appWidgetManager = context.getSystemService(AppWidgetManager::class.java) ?: return false
    return appWidgetManager.isRequestPinAppWidgetSupported
  }

  private fun requestPin(): Boolean {
    val context = appContext.reactContext ?: return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val appWidgetManager = context.getSystemService(AppWidgetManager::class.java) ?: return false
    if (!appWidgetManager.isRequestPinAppWidgetSupported) return false
    val provider = ComponentName(context, EmotionalCheckInWidgetProvider::class.java)
    return try {
      appWidgetManager.requestPinAppWidget(provider, null, null)
    } catch (_: Exception) {
      // Some OEM launchers advertise support but still reject the
      // request at call time -- honestly report failure, never crash
      // the settings screen over a launcher quirk this app can't fix.
      false
    }
  }
}
