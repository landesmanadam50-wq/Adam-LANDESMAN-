package expo.modules.floatingtimeroverlay

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Floating task timer task: the JS <-> native bridge for the system-wide
 * floating overlay + ongoing notification (OverlayService.kt does the
 * actual work; this class only validates input and starts/stops that
 * service). SYSTEM_ALERT_WINDOW has no runtime "request" dialog of its
 * own on Android -- the only way to grant it is the Settings screen this
 * opens; hasOverlayPermission() lets the JS side poll for whether the
 * trainee granted it after returning from there.
 */
class FloatingTimerOverlayPayload : Record {
  @Field
  val taskId: String = ""

  @Field
  val title: String = ""

  @Field
  val remainingSeconds: Double = 0.0

  @Field
  val paused: Boolean = false

  @Field
  val overlayEnabled: Boolean = true

  // Unified Task Stages task, requirement 6: the overlay's own prominent
  // action text (the active stage's own description for a staged task,
  // or the plain task title otherwise -- arc/floatingTimerOverlayPayload.ts
  // decides which, never this native side). `title` above stays the
  // ongoing notification's own content title, unchanged.
  @Field
  val actionTitle: String = ""

  // Null when there is no next stage to show (a legacy task, or already
  // on the final/main stage).
  @Field
  val nextActionTitle: String? = null

  @Field
  val showCompleteButton: Boolean = false

  // Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict
  // Management task, requirement 1: `resting` (the "I need rest"
  // sub-timer, never confused with `paused` above -- the ongoing
  // notification's own status word distinguishes the two) and the NEXT
  // SCHEDULED TASK's own name/time (never the same thing as
  // `nextActionTitle` above, which is a different task's own next
  // STAGE). Both next-task fields null together means nothing else is
  // scheduled today.
  @Field
  val resting: Boolean = false

  @Field
  val nextScheduledTaskTitle: String? = null

  @Field
  val nextScheduledTaskTime: String? = null

  // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: the
  // next scheduled task's own planned duration, shown alongside its
  // name/time in the unified panel's "next task" section -- null
  // together with the two fields above when nothing is scheduled.
  @Field
  val nextScheduledTaskDurationMinutes: Int? = null

  // ARCHI -- Home-Screen Widget Sync task, section 4: whether the next
  // scheduled task's own start time has already passed -- "never
  // display a past task as upcoming without indicating it is overdue."
  // Always a concrete Boolean (never null, unlike the nullable fields
  // above) since arc/floatingTimerOverlayPayload.ts's own
  // nextScheduledTaskIsOverdue field already defaults to false when
  // there is no next task at all -- never a third "unknown" state here.
  @Field
  val nextScheduledTaskIsOverdue: Boolean = false
}

class FloatingTimerOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FloatingTimerOverlay")

    Function("hasOverlayPermission") {
      hasPermission()
    }

    Function("requestOverlayPermission") {
      val context = appContext.reactContext
      if (context != null) {
        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.packageName))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          context.startActivity(intent)
        } catch (_: Exception) {
          // Some OEMs/Android versions reject this exact intent -- nothing
          // more this side can do; the settings toggle screen's own
          // "already granted?" re-check on focus is the real source of truth.
        }
      }
    }

    Function("show") { payload: FloatingTimerOverlayPayload ->
      startOverlayService(payload, OverlayService.ACTION_SHOW)
    }

    Function("update") { payload: FloatingTimerOverlayPayload ->
      startOverlayService(payload, OverlayService.ACTION_UPDATE)
    }

    Function("hide") {
      val context = appContext.reactContext
      if (context != null) {
        context.stopService(Intent(context, OverlayService::class.java))
      }
    }

    // Proactive Support During Task LIVE task: a plain synchronous query
    // (same bridge style as hasOverlayPermission() above -- no new
    // module, no SYSTEM_ALERT_WINDOW permission involved), queried by
    // the JS-side AppState listener at the exact moment the app just
    // backgrounded. isInteractive=false covers "screen off";
    // isKeyguardLocked=true covers "locked but the screen is still on"
    // (e.g. mid-animation) -- together matching the spec's own "כיבה
    // או נעילה" (off OR locked) wording exactly. Never used to react to
    // a change over time (no BroadcastReceiver, no event emitted back
    // to JS) -- this module has never had an event-emission channel,
    // and a point-in-time answer at the moment JS needs it is all this
    // feature requires.
    // ARC Addiction: the independent second line (urge waiting timer).
    Function("setSecondaryTimer") { label: String, endsAtMs: Double ->
      startSecondaryCommand(OverlayService.ACTION_SET_SECONDARY, label, endsAtMs.toLong())
    }

    Function("clearSecondaryTimer") {
      startSecondaryCommand(OverlayService.ACTION_CLEAR_SECONDARY, null, 0L)
    }

    Function("isScreenLockedOrOff") {
      isScreenLockedOrOff()
    }
  }

  private fun startSecondaryCommand(action: String, label: String?, endsAtMs: Long) {
    val context = appContext.reactContext ?: return
    val intent = Intent(context, OverlayService::class.java).apply {
      this.action = action
      putExtra(OverlayService.EXTRA_SECONDARY_LABEL, label)
      putExtra(OverlayService.EXTRA_SECONDARY_ENDS_AT_MS, endsAtMs)
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    } catch (_: Exception) {
      // Background-start restrictions etc. -- the in-app timer and notifications still work.
    }
  }

  private fun isScreenLockedOrOff(): Boolean {
    val context = appContext.reactContext ?: return false
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    val screenOff = powerManager?.isInteractive == false
    val locked = keyguardManager?.isKeyguardLocked == true
    return screenOff || locked
  }

  private fun hasPermission(): Boolean {
    val context = appContext.reactContext ?: return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(context)
    } else {
      true
    }
  }

  private fun startOverlayService(payload: FloatingTimerOverlayPayload, action: String) {
    val context = appContext.reactContext ?: return
    val intent = Intent(context, OverlayService::class.java).apply {
      this.action = action
      putExtra(OverlayService.EXTRA_TASK_ID, payload.taskId)
      putExtra(OverlayService.EXTRA_TITLE, payload.title)
      putExtra(OverlayService.EXTRA_REMAINING_SECONDS, payload.remainingSeconds)
      putExtra(OverlayService.EXTRA_PAUSED, payload.paused)
      putExtra(OverlayService.EXTRA_OVERLAY_ENABLED, payload.overlayEnabled)
      putExtra(OverlayService.EXTRA_ACTION_TITLE, payload.actionTitle)
      putExtra(OverlayService.EXTRA_NEXT_ACTION_TITLE, payload.nextActionTitle)
      putExtra(OverlayService.EXTRA_SHOW_COMPLETE_BUTTON, payload.showCompleteButton)
      putExtra(OverlayService.EXTRA_RESTING, payload.resting)
      putExtra(OverlayService.EXTRA_NEXT_SCHEDULED_TASK_TITLE, payload.nextScheduledTaskTitle)
      putExtra(OverlayService.EXTRA_NEXT_SCHEDULED_TASK_TIME, payload.nextScheduledTaskTime)
      // Int has no "absent" bundle value of its own (unlike the nullable
      // String extras above, which naturally read back as null when
      // missing) -- omitting the extra entirely when null, and having
      // OverlayService read it back via hasExtra, is what lets a LATER
      // call that genuinely has no next task reset this back to null
      // rather than leaving a stale duration from a previous call.
      payload.nextScheduledTaskDurationMinutes?.let { putExtra(OverlayService.EXTRA_NEXT_SCHEDULED_TASK_DURATION_MINUTES, it) }
      putExtra(OverlayService.EXTRA_NEXT_SCHEDULED_TASK_IS_OVERDUE, payload.nextScheduledTaskIsOverdue)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }
}
