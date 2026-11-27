package expo.modules.floatingtimeroverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Point
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Floating task timer task, requirements 1+3+7: ONE foreground service
 * for the entire lifetime of an active task timer, hosting both the
 * draggable floating overlay (WindowManager) and the required ongoing
 * notification (the service's own foreground notification -- Android
 * requires a foreground service to show one, so this never needs a
 * second, separate notification object).
 *
 * Floating ARC button task: the overlay itself is a single LinearLayout
 * container holding two children -- the timer text and a small "ARC"
 * button -- added to WindowManager as ONE view with ONE set of
 * LayoutParams, so dragging either child moves both together. Only the
 * container has a touch listener; a tap (never a drag) is routed to
 * either child by hit-testing the ARC button's own bounds.
 *
 * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: the
 * container is now a VERTICAL stack of rows -- the mood row (😟/🙂/😄,
 * the 3rd hidden whenever a task is active/paused), the pre-existing
 * current-task row above (hidden entirely while idle), the next-task
 * section ("המשימה הבאה" + "עבור למשימה הבאה", or the required empty
 * state), and "💡 הוסף תובנה" -- still ONE view, ONE set of
 * LayoutParams, ONE touch listener; see isPointInsideView()'s own doc
 * for why hit-testing had to become nesting-aware once rows were
 * introduced. "No current task at all" (idle) is represented the same
 * way it already was for openTaskLive()/openArcForTask()/
 * completeStageForTask() above: an empty taskId -- never a second
 * "is this idle" signal.
 *
 * The displayed countdown is derived every tick from an absolute
 * "end-of-remaining-time" anchor computed once per show()/update() call
 * (ANCHOR = now + remainingSeconds, i.e. System.currentTimeMillis() at
 * the moment JS called this, plus the remaining duration it reported) --
 * never an independently-incrementing local counter. This is what keeps
 * the countdown correct across app switches without needing JS to stay
 * alive and tick every second (requirement 7: "להשתמש בזמן הסיום ובמצב
 * הטיימר השמור כמקור האמת"). Pausing freezes the shown value (JS passes
 * paused=true with the already-frozen remainingSeconds); resuming simply
 * computes a fresh anchor from whatever remainingSeconds JS reports at
 * that moment -- exactly mirroring arc/taskTimer.ts's own
 * accumulatedPauseSeconds model one level up, without this service
 * needing to know anything about pause history itself.
 *
 * Floating Timer Position/Touch Accessibility fix: the root cause of
 * "the overlay reappears somewhere unclickable" was that the saved
 * (x, y) was restored, and updated while dragging, with NO bounds
 * check at all -- WindowManager with Gravity.TOP|START places the
 * view's top-left corner at exactly (x, y), and FLAG_LAYOUT_NO_LIMITS
 * lets it go fully off-screen, under the status bar, or behind the
 * nav bar with no clipping/adjustment of its own. A position saved on
 * one screen size/orientation/density can easily be invalid after a
 * rotation, a display-size change, or just a drag that went too close
 * to an edge. clampToSafeArea below is the one place both restore and
 * drag funnel through, so a position can never be SET (interactively
 * or on restore) outside the current touchable area in the first
 * place -- "move to the nearest valid position" is simply "clamp".
 */
class OverlayService : Service() {
  companion object {
    const val ACTION_SHOW = "show"
    const val ACTION_UPDATE = "update"
    // ARC Addiction: an INDEPENDENT second line (the urge waiting timer).
    // It has its own commands and state and never reads or writes any of
    // the task timer's fields below, so the two timers can never pause,
    // reset or overwrite each other.
    const val ACTION_SET_SECONDARY = "setSecondary"
    const val ACTION_CLEAR_SECONDARY = "clearSecondary"
    const val EXTRA_SECONDARY_LABEL = "secondaryLabel"
    const val EXTRA_SECONDARY_ENDS_AT_MS = "secondaryEndsAtMs"
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_TITLE = "title"
    const val EXTRA_REMAINING_SECONDS = "remainingSeconds"
    const val EXTRA_PAUSED = "paused"
    const val EXTRA_OVERLAY_ENABLED = "overlayEnabled"
    // Unified Task Stages task.
    const val EXTRA_ACTION_TITLE = "actionTitle"
    const val EXTRA_NEXT_ACTION_TITLE = "nextActionTitle"
    const val EXTRA_SHOW_COMPLETE_BUTTON = "showCompleteButton"
    // Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict
    // Management task, requirement 1: EXTRA_RESTING distinguishes the
    // "I need rest" sub-timer from a plain paused task timer (never
    // confused with EXTRA_PAUSED above). EXTRA_NEXT_SCHEDULED_TASK_*
    // name a DIFFERENT task entirely -- never the same concept as
    // EXTRA_NEXT_ACTION_TITLE above (that one is THIS task's own next
    // STAGE).
    const val EXTRA_RESTING = "resting"
    const val EXTRA_NEXT_SCHEDULED_TASK_TITLE = "nextScheduledTaskTitle"
    const val EXTRA_NEXT_SCHEDULED_TASK_TIME = "nextScheduledTaskTime"
    // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task:
    // the next scheduled task's own planned duration, shown alongside
    // its name/time -- see FloatingTimerOverlayModule.kt's own doc on
    // why this one extra is conditionally omitted rather than always
    // present (unlike every String extra above, which naturally reads
    // back null when absent).
    const val EXTRA_NEXT_SCHEDULED_TASK_DURATION_MINUTES = "nextScheduledTaskDurationMinutes"
    // ARCHI -- Home-Screen Widget Sync task, section 4: whether the next
    // scheduled task's own start time has already passed "now" --
    // computed upstream by data/dailyPlan.ts's own
    // isScheduledPlanEntryOverdue, never re-derived natively (this
    // service has no notion of wall-clock "now" for a task it didn't
    // start itself). Read back via getBooleanExtra (never hasExtra),
    // since the JS side always sends a concrete false when there's no
    // next task, never omits this extra.
    const val EXTRA_NEXT_SCHEDULED_TASK_IS_OVERDUE = "nextScheduledTaskIsOverdue"

    private const val NOTIFICATION_CHANNEL_ID = "archi-task-timer-ongoing"
    private const val NOTIFICATION_ID = 7421
    private const val TICK_INTERVAL_MS = 1000L
    private const val DRAG_CLICK_THRESHOLD_PX = 12
    private const val PREFS_NAME = "floating_timer_overlay"
    private const val PREF_X = "overlay_x"
    private const val PREF_Y = "overlay_y"
    // ARCHI -- Collapsible and Expandable Modes task: the overlay's own
    // collapsed-vs-expanded state, persisted the SAME way its position
    // already is (SharedPreferences, read once at service creation,
    // written back on every toggle) -- so a trainee's choice survives
    // exactly like their chosen position does, across app restarts and
    // cold starts. Defaults to true ("Collapsed mode (default)").
    private const val PREF_COLLAPSED = "overlay_collapsed"
    // Floating ARC button task, requirement "יש למנוע פתיחה כפולה של ARC
    // מלחיצות חוזרות": a cheap, UI-independent debounce at the SOURCE of
    // repeated taps -- never relies solely on the JS side's own one-shot
    // guard (live/ActiveTaskScreen.tsx's autoActionConsumed ref), since a
    // cold-started app has no shared state yet to dedupe against.
    private const val ARC_OPEN_DEBOUNCE_MS = 1500L
    // Unified Task Stages task, requirement 4: the SAME debounce
    // protection, at the SAME native source, for the ✓ button -- mirrors
    // the ARC button's own guard exactly, so a rapid double-tap on ✓ can
    // never fire two completeStage deep-links.
    private const val COMPLETE_STAGE_DEBOUNCE_MS = 1500L
    // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task:
    // the SAME source-level debounce discipline as the two constants
    // above, one per new tappable region (the 3-mood row, "עבור
    // למשימה הבאה", and "💡 הוסף תובנה") -- never a shared counter
    // across unrelated actions, so tapping one right after another is
    // never incorrectly suppressed.
    private const val MOOD_TAP_DEBOUNCE_MS = 1500L
    private const val NEXT_TASK_TAP_DEBOUNCE_MS = 1500L
    private const val ADD_INSIGHT_TAP_DEBOUNCE_MS = 1500L
    // ARC Questions task, section 2: the SAME source-level debounce
    // discipline as ADD_INSIGHT_TAP_DEBOUNCE_MS right above, for the
    // new "+ שאלה" shortcut.
    private const val ADD_QUESTION_TAP_DEBOUNCE_MS = 1500L
    // ARCHI -- Add Direct ARC Gym Access from Home and the Floating
    // Timer task: the SAME source-level debounce discipline as every
    // other tappable region above, for the new "🏋️ ARC Gym" shortcut.
    private const val ARC_GYM_OPEN_DEBOUNCE_MS = 1500L
    // Positive Memory, Success Recall & Quick Capture task, section 3A:
    // the SAME source-level debounce discipline, for the new "✨ הוסף
    // אירוע חיובי" shortcut.
    private const val ADD_POSITIVE_EVENT_TAP_DEBOUNCE_MS = 1500L
    // ARC Saving, Trigger Management & Quick-Action Buttons task,
    // section 7: the SAME source-level debounce discipline, for the two
    // new quick-action shortcuts ("➕ משימה"/"💾 ARC Save").
    private const val ADD_TASK_TAP_DEBOUNCE_MS = 1500L
    private const val ARC_SAVING_OPEN_DEBOUNCE_MS = 1500L
    private const val SECONDARY_TAP_DEBOUNCE_MS = 1500L
    private const val SECONDARY_BACKGROUND = "#CC2E7D32"
    // Section 7's own "רקע ירוק מלא ואחיד" requirement: the ONE shared
    // solid (fully opaque, never translucent like every other row's own
    // #CC... background) green hex for all four quick-action buttons --
    // the SAME value Home's own build/FlexibleDailyScreen.tsx
    // (quickActionButton style) and the widget's own
    // widget_quick_action_background.xml drawable use.
    private const val QUICK_ACTION_BACKGROUND = "#FF2E7D32"
  }

  private val handler = Handler(Looper.getMainLooper())
  private var tickRunnable: Runnable? = null

  private var windowManager: WindowManager? = null
  // Floating ARC button task, requirement "הטיימר והכפתור יוכלו לזוז יחד":
  // both the timer text and the ARC button are children of ONE container
  // view, added to WindowManager as a single unit with a single set of
  // LayoutParams -- dragging the container moves both together, with no
  // need to separately synchronize two independent overlay views.
  private var overlayContainer: LinearLayout? = null
  // Unified Task Stages task: the timer cell is now its own small
  // vertical sub-container (current action/timer text, then the
  // optional smaller next-action line) -- the OUTER container stays a
  // single horizontal row of [timer cell | ARC | ✓?], still added to
  // WindowManager as ONE view with ONE set of LayoutParams, so dragging
  // any part of it still moves the whole thing together, unchanged.
  private var timerTextView: TextView? = null
  private var nextActionTextView: TextView? = null
  private var completeButtonView: TextView? = null
  // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: the
  // ONE unified panel's own remaining rows/children, all added to the
  // SAME outer container alongside the pre-existing current-task row
  // above -- never a second, independently-positioned overlay view.
  private var currentTaskRowView: View? = null
  private var moodLessGoodView: TextView? = null
  private var moodOkView: TextView? = null
  private var moodDirectToTaskView: TextView? = null
  // ARCHI -- Two Additions to the Existing Floating Cube task.
  private var urgeView: TextView? = null
  private var nextTaskInfoView: TextView? = null
  private var nextTaskActionView: TextView? = null
  private var insightView: TextView? = null
  // ARCHI -- Add Direct ARC Gym Access from Home and the Floating Timer
  // task: a new tappable row inside the SAME expanded panel, same
  // precedent as insightView right above it -- task-independent, never
  // threading taskId through its deep link, since opening ARC Gym must
  // never touch the active task/timer in any way.
  private var arcGymView: TextView? = null
  // Positive Memory, Success Recall & Quick Capture task, section 3A:
  // the same precedent as insightView/arcGymView above -- "✨ הוסף
  // אירוע חיובי," always available, both idle and active/paused.
  private var positiveEventView: TextView? = null
  // ARC Saving, Trigger Management & Quick-Action Buttons task, section
  // 7: the two new quick-action rows -- "➕ משימה" (task-independent,
  // same convention as arcGymView) and "💾 ARC Save" (opens the
  // trigger-activation picker). Both share the SAME solid-green
  // background as insightView/positiveEventView above, which this task
  // also restyles in place.
  private var addTaskView: TextView? = null
  private var arcSavingView: TextView? = null
  // ARCHI -- Collapsible and Expandable Modes task: `pillView` is the
  // tiny collapsed-mode summary (timer or next-task time); `expandedContentView`
  // wraps EVERYTHING this task already built (the collapse button's own
  // row, then the mood row, current-task row, next-task section and
  // insight action, completely unchanged) -- exactly one of the two is
  // ever VISIBLE, the other GONE, so the WRAP_CONTENT container (and
  // therefore the actual touchable/visible area) shrinks to just the
  // pill while collapsed, never leaving dead touchable space around it.
  private var pillView: TextView? = null
  private var expandedContentView: View? = null
  private var collapseButtonView: TextView? = null
  private var overlayParams: WindowManager.LayoutParams? = null
  private var lastArcOpenAtMs: Long = 0L
  private var lastCompleteStageAtMs: Long = 0L
  private var lastMoodTapAtMs: Long = 0L
  private var lastNextTaskTapAtMs: Long = 0L
  private var lastInsightTapAtMs: Long = 0L
  private var lastQuestionTapAtMs: Long = 0L
  private var lastArcGymOpenAtMs: Long = 0L
  private var lastPositiveEventTapAtMs: Long = 0L
  private var lastAddTaskTapAtMs: Long = 0L
  private var lastArcSavingOpenAtMs: Long = 0L

  private var taskId: String = ""
  private var title: String = ""
  private var actionTitle: String = ""
  private var nextActionTitle: String? = null
  private var showCompleteButton: Boolean = false
  private var anchorEpochMs: Long = 0L
  private var anchorRemainingSeconds: Double = 0.0
  private var paused: Boolean = false
  private var overlayEnabled: Boolean = true
  private var resting: Boolean = false
  private var nextScheduledTaskTitle: String? = null
  private var nextScheduledTaskTime: String? = null
  private var nextScheduledTaskDurationMinutes: Int? = null
  private var nextScheduledTaskIsOverdue: Boolean = false
  // ARCHI -- Collapsible and Expandable Modes task: loaded once in
  // onCreate (below), BEFORE ensureOverlayAdded ever runs for this
  // service instance -- never re-read from prefs on every
  // onStartCommand, so a trainee's in-session toggle (setCollapsed)
  // is never silently overwritten by the stale value that was true
  // when the service first started.
  private var collapsed: Boolean = true

  // ARC Addiction second line -- see ACTION_SET_SECONDARY.
  private var secondaryLabel: String? = null
  private var secondaryEndsAtMs: Long = 0L
  private var secondaryTextView: TextView? = null
  private var secondaryTickRunnable: Runnable? = null
  private var lastSecondaryTapAtMs: Long = 0L
  // True once a task/idle payload (ACTION_SHOW/UPDATE) arrived -- a
  // service started ONLY to clear the second line stops itself again.
  private var primaryActive: Boolean = false

  override fun onCreate() {
    super.onCreate()
    collapsed = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(PREF_COLLAPSED, true)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) return START_NOT_STICKY

    if (intent.action == ACTION_SET_SECONDARY || intent.action == ACTION_CLEAR_SECONDARY) {
      handleSecondaryCommand(intent)
      return START_NOT_STICKY
    }
    primaryActive = true

    taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: taskId
    title = intent.getStringExtra(EXTRA_TITLE) ?: title
    actionTitle = intent.getStringExtra(EXTRA_ACTION_TITLE) ?: title
    nextActionTitle = intent.getStringExtra(EXTRA_NEXT_ACTION_TITLE)
    showCompleteButton = intent.getBooleanExtra(EXTRA_SHOW_COMPLETE_BUTTON, false)
    anchorRemainingSeconds = intent.getDoubleExtra(EXTRA_REMAINING_SECONDS, anchorRemainingSeconds)
    paused = intent.getBooleanExtra(EXTRA_PAUSED, paused)
    overlayEnabled = intent.getBooleanExtra(EXTRA_OVERLAY_ENABLED, overlayEnabled)
    resting = intent.getBooleanExtra(EXTRA_RESTING, resting)
    nextScheduledTaskTitle = intent.getStringExtra(EXTRA_NEXT_SCHEDULED_TASK_TITLE)
    nextScheduledTaskTime = intent.getStringExtra(EXTRA_NEXT_SCHEDULED_TASK_TIME)
    nextScheduledTaskDurationMinutes = if (intent.hasExtra(EXTRA_NEXT_SCHEDULED_TASK_DURATION_MINUTES)) {
      intent.getIntExtra(EXTRA_NEXT_SCHEDULED_TASK_DURATION_MINUTES, 0)
    } else {
      null
    }
    nextScheduledTaskIsOverdue = intent.getBooleanExtra(EXTRA_NEXT_SCHEDULED_TASK_IS_OVERDUE, false)
    anchorEpochMs = System.currentTimeMillis()

    startForeground(NOTIFICATION_ID, buildNotification(formatRemaining(currentRemainingSeconds())))

    if (overlayEnabled && hasOverlayPermission()) {
      ensureOverlayAdded()
    } else {
      removeOverlayIfAdded()
    }

    stopTicking()
    if (!paused) startTicking()
    renderNow()

    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopTicking()
    stopSecondaryTicking()
    removeOverlayIfAdded()
    super.onDestroy()
  }

  /**
   * Floating Timer Position/Touch Accessibility fix, Android Recovery
   * requirement: a rotation or a display-size/density change can
   * invalidate an already-showing overlay's position WITHOUT the
   * service restarting at all (onStartCommand never re-runs for this),
   * so the restore-time clamp alone isn't enough -- this re-clamps the
   * CURRENT position the moment the system reports the change, and
   * persists the correction immediately, same as the restore path.
   */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    val container = overlayContainer ?: return
    val params = overlayParams ?: return
    val wm = windowManager ?: return
    val (clampedX, clampedY) = clampToSafeArea(params.x, params.y, container.width, container.height)
    if (clampedX == params.x && clampedY == params.y) return
    params.x = clampedX
    params.y = clampedY
    try {
      wm.updateViewLayout(container, params)
    } catch (_: Exception) {
      return
    }
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
      .putInt(PREF_X, clampedX)
      .putInt(PREF_Y, clampedY)
      .apply()
  }

  // --- ARC Addiction second line ----------------------------------------

  private fun handleSecondaryCommand(intent: Intent) {
    // Started via startForegroundService: startForeground must always run.
    startForeground(NOTIFICATION_ID, buildNotification(formatRemaining(currentRemainingSeconds())))
    if (intent.action == ACTION_SET_SECONDARY) {
      secondaryLabel = intent.getStringExtra(EXTRA_SECONDARY_LABEL)
      secondaryEndsAtMs = intent.getLongExtra(EXTRA_SECONDARY_ENDS_AT_MS, 0L)
    } else {
      secondaryLabel = null
      secondaryEndsAtMs = 0L
    }
    stopSecondaryTicking()
    val canDraw = overlayEnabled && hasOverlayPermission()
    if (!primaryActive && (secondaryLabel == null || !canDraw)) {
      // Nothing else is showing: this service was only started for the
      // second line, which is being cleared or cannot be drawn -- never
      // leave an empty foreground service running.
      stopSelf()
      return
    }
    if (secondaryLabel != null && canDraw) ensureOverlayAdded()
    // Re-renders the (unchanged) primary state too, so a panel created here
    // shows the correct idle/task rows -- reads the task fields, never writes them.
    renderNow()
    renderSecondary()
    if (secondaryLabel != null && secondaryRemainingSeconds() > 0.0) startSecondaryTicking()
  }

  private fun secondaryRemainingSeconds(): Double {
    return ((secondaryEndsAtMs - System.currentTimeMillis()) / 1000.0).coerceAtLeast(0.0)
  }

  private fun renderSecondary() {
    val view = secondaryTextView ?: return
    val label = secondaryLabel
    if (label == null) {
      view.visibility = View.GONE
      return
    }
    val remaining = secondaryRemainingSeconds()
    view.text = if (remaining > 0.0) "🌱 $label  ⏳ " + formatRemaining(remaining) else "🌱 $label  · זמן ההמתנה הסתיים"
    view.visibility = View.VISIBLE
  }

  private fun startSecondaryTicking() {
    val runnable = object : Runnable {
      override fun run() {
        renderSecondary()
        if (secondaryLabel != null && secondaryRemainingSeconds() > 0.0) handler.postDelayed(this, TICK_INTERVAL_MS)
      }
    }
    secondaryTickRunnable = runnable
    handler.postDelayed(runnable, TICK_INTERVAL_MS)
  }

  private fun stopSecondaryTicking() {
    secondaryTickRunnable?.let { handler.removeCallbacks(it) }
    secondaryTickRunnable = null
  }

  private fun openArcAddictionSession() {
    val now = System.currentTimeMillis()
    if (now - lastSecondaryTapAtMs < SECONDARY_TAP_DEBOUNCE_MS) return
    lastSecondaryTapAtMs = now
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://arc-addiction/session")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity -- nothing more this side can do.
    }
  }

  private fun hasOverlayPermission(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(this) else true
  }

  private fun currentRemainingSeconds(): Double {
    if (paused) return anchorRemainingSeconds
    val elapsedSeconds = (System.currentTimeMillis() - anchorEpochMs) / 1000.0
    return (anchorRemainingSeconds - elapsedSeconds).coerceAtLeast(0.0)
  }

  private fun startTicking() {
    val runnable = object : Runnable {
      override fun run() {
        renderNow()
        if (currentRemainingSeconds() > 0.0) {
          handler.postDelayed(this, TICK_INTERVAL_MS)
        }
      }
    }
    tickRunnable = runnable
    handler.postDelayed(runnable, TICK_INTERVAL_MS)
  }

  private fun stopTicking() {
    tickRunnable?.let { handler.removeCallbacks(it) }
    tickRunnable = null
  }

  private fun renderNow() {
    val remaining = currentRemainingSeconds()
    val text = formatRemaining(remaining)
    val isIdle = taskId.isEmpty()
    // Unified Task Stages task, requirement 6: the overlay's own
    // prominent text is the current concrete action (actionTitle),
    // never the bare countdown alone -- the glyph+timer stays alongside
    // it on the same line.
    timerTextView?.text = actionTitle + "  " + overlayGlyph(remaining) + " " + text
    nextActionTextView?.let { view ->
      val next = nextActionTitle
      if (next != null) {
        view.text = "הבא: " + next
        view.visibility = View.VISIBLE
      } else {
        view.visibility = View.GONE
      }
    }
    completeButtonView?.visibility = if (showCompleteButton) View.VISIBLE else View.GONE
    // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
    // sections 2+3: ONE unified panel adapting to its own two states --
    // the current-task row (timer/ARC/✓) exists only while a real task
    // session is active (running OR paused; this is never a THIRD,
    // separate "paused" layout), and "😄 ישר למשימה" is hidden the
    // instant that row appears, exactly mirroring it.
    currentTaskRowView?.visibility = if (isIdle) View.GONE else View.VISIBLE
    moodDirectToTaskView?.visibility = if (isIdle) View.VISIBLE else View.GONE
    nextTaskInfoView?.text = nextScheduledTaskSummaryLine()
    nextTaskActionView?.let { view ->
      view.visibility = if (nextScheduledTaskTitle != null) View.VISIBLE else View.GONE
    }
    // ARCHI -- Collapsible and Expandable Modes task: the pill's own
    // text is recomputed on every render, same as everything else here --
    // collapsing/expanding itself never goes through this function (see
    // setCollapsed), so toggling never races with a tick updating the
    // pill's content underneath it.
    pillView?.text = pillSummaryText(remaining, isIdle)
    updateNotificationText(text)
  }

  /**
   * ARCHI -- Collapsible and Expandable Modes task: "Collapsed mode...
   * when a task is active, show its remaining timer; when no task is
   * active, show the next task's scheduled start time" -- exactly the
   * same two pieces of information the expanded panel already shows
   * (the current-task row's countdown, and nextScheduledTaskTime in the
   * next-task section), never a second/duplicate data source. No
   * scheduled task at all is a real, expected state (never invented) --
   * the pill falls back to the plain app name.
   */
  private fun pillSummaryText(remaining: Double, isIdle: Boolean): String {
    if (!isIdle) return overlayGlyph(remaining) + " " + formatRemaining(remaining)
    // ARCHI -- Floating timer / current-task-title sync task: the
    // collapsed pill is the FIRST thing seen while idle -- it now shows
    // the task's own NAME (never only a bare clock time), so the exact
    // same task the "המשימות שלי" cube calls "המשימה הנוכחית" is
    // readable here too without expanding the panel. nextScheduledTaskTitle
    // is, by construction (data/dailyPlan.ts's resolveNextScheduledTaskDisplay),
    // already a due-now/overdue fixed task when one exists, else a
    // genuinely upcoming one, else a To-Do suggestion -- never a second,
    // independent pick. An overdue one gets its own distinct glyph (⚠
    // instead of ⏰), same as before this task.
    return nextScheduledTaskTitle?.let { if (nextScheduledTaskIsOverdue) "⚠ $it" else "⏰ $it" } ?: "ARCHI"
  }

  /**
   * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
   * sections 2+3: the unified panel's own "next scheduled task" line --
   * name, start time (if known) and planned duration (if known), or
   * the required empty-state text when nothing is scheduled. Shared
   * verbatim between both states (idle and active/paused), so the
   * trainee reads the exact same information regardless of which one
   * is currently showing.
   */
  private fun nextScheduledTaskSummaryLine(): String {
    val nextTitle = nextScheduledTaskTitle ?: return "אין משימה נוספת מתוכננת"
    val parts = mutableListOf(nextTitle)
    nextScheduledTaskTime?.let { parts.add(it) }
    nextScheduledTaskDurationMinutes?.let { parts.add("$it דק'") }
    // ARCHI -- Home-Screen Widget Sync task, section 4: an overdue next
    // task is never shown as a plain upcoming one -- "⚠ באיחור" is
    // appended as its own trailing part, same join convention as every
    // other optional part above, so this line never silently implies
    // the task is still ahead of schedule.
    if (nextScheduledTaskIsOverdue) parts.add("⚠ באיחור")
    return "המשימה הבאה: " + parts.joinToString(" · ")
  }

  private fun overlayGlyph(remaining: Double): String {
    if (remaining <= 0.0) return "✓" // ✓ -- time is up, waiting for the trainee's own next choice.
    return if (paused) "⏸" else "⏱" // ⏸ paused, ⏱ running.
  }

  private fun formatRemaining(remainingSeconds: Double): String {
    val total = Math.ceil(remainingSeconds.coerceAtLeast(0.0)).toInt()
    val minutes = total / 60
    val seconds = total % 60
    return String.format("%d:%02d", minutes, seconds)
  }

  // --- Ongoing notification (requirement 3) -------------------------------

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null) return
    val channel = NotificationChannel(NOTIFICATION_CHANNEL_ID, "טיימר משימה פעיל", NotificationManager.IMPORTANCE_LOW)
    channel.setSound(null, null)
    channel.enableVibration(false)
    manager.createNotificationChannel(channel)
  }

  /**
   * Lock-Screen Timer task, requirement 1: the status word
   * (running/paused/resting), PLUS the next-scheduled-task line, are
   * ADDED to this exact same ongoing notification -- never a second,
   * separate notification/countdown mechanism. `remaining` (not just
   * the pre-formatted `remainingText`) is read fresh here too, purely
   * to decide the "הסתיים" (ended) status word -- the single
   * currentRemainingSeconds() anchor-based read every other display in
   * this service already uses, never a second countdown engine.
   */
  private fun statusWord(remaining: Double): String {
    // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task:
    // the idle state (no current task at all) has no timer to report
    // on -- a dedicated status word, checked first, rather than
    // reporting a stale/zero countdown as "הסתיים" (which specifically
    // means "this task's own timer just finished," not "nothing is
    // running").
    if (taskId.isEmpty()) return "ממתין"
    if (remaining <= 0.0) return "הסתיים"
    if (resting) return "מנוחה"
    if (paused) return "מושהה"
    return "פעיל"
  }

  /** Null when there is nothing else scheduled today -- the notification simply omits this line, same "never invent an empty state" convention as the overlay's own nextActionTextView. */
  private fun nextScheduledTaskLine(): String? {
    val nextTitle = nextScheduledTaskTitle ?: return null
    val nextTime = nextScheduledTaskTime
    val base = if (nextTime != null) "המשימה הבאה: $nextTitle — $nextTime" else "המשימה הבאה: $nextTitle"
    // ARCHI -- Home-Screen Widget Sync task, section 4: the lock-screen
    // notification gets the SAME overdue flag as the overlay's own
    // next-task line -- never a surface that silently stays "on time".
    return if (nextScheduledTaskIsOverdue) "$base ⚠ באיחור" else base
  }

  private fun buildNotification(remainingText: String): Notification {
    ensureNotificationChannel()
    // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task:
    // idle (no taskId at all) opens plain Home instead of a task that
    // doesn't exist -- the one existing deep-link scheme, same as every
    // other idle-state tap below.
    val openUri = if (taskId.isEmpty()) "archi://" else "archi://tasks/$taskId"
    val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(openUri)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val status = statusWord(currentRemainingSeconds())
    val collapsedText = if (taskId.isEmpty()) status else "$status · נותרו $remainingText"
    val nextLine = nextScheduledTaskLine()
    builder
      .setContentTitle(if (title.isNotEmpty()) title else "ARCHI")
      .setContentText(collapsedText)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(pendingIntent)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      // Lock-Screen Timer task, requirement 1 ("show the timer on the
      // lock screen, even before unlocking"): without this, Android's
      // own default (VISIBILITY_PRIVATE) already shows title+text on
      // most lock screens, but a device/user setting that hides
      // notification content on the lock screen would otherwise replace
      // it with a generic "content hidden" placeholder. VISIBILITY_PUBLIC
      // asks for the real content to show regardless -- the closest
      // supported behavior; exactly how a given OEM's lock screen (e.g.
      // Xiaomi/MIUI) actually renders it is outside this app's control,
      // never bypassed or forced past the user's own OS-level choice.
      .setVisibility(Notification.VISIBILITY_PUBLIC)
    if (nextLine != null) {
      builder.setStyle(Notification.BigTextStyle().bigText("$collapsedText\n$nextLine"))
    }
    return builder.build()
  }

  private fun updateNotificationText(remainingText: String) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    try {
      manager.notify(NOTIFICATION_ID, buildNotification(remainingText))
    } catch (_: Exception) {
      // Best-effort -- the floating overlay (if shown) is still accurate either way.
    }
  }

  // --- Floating overlay (requirements 1+2+7) ------------------------------

  /**
   * Floating Timer Position/Touch Accessibility fix: the touchable
   * screen area, in the SAME coordinate space as WindowManager.LayoutParams.x/y
   * (top-left origin), with the status bar/nav bar/display cutout
   * already excluded. API 30+ asks WindowManager itself (the only
   * fully correct source, since it already matches whatever insets are
   * actually showing right now); below that there's no equivalent
   * query, so this falls back to the legacy display size plus a
   * best-effort status-bar-height resource lookup -- an approximation,
   * but still always SOME margin rather than none, which is what the
   * bug actually was.
   */
  private fun computeSafeAreaBounds(): Rect {
    val wm = windowManager ?: (getSystemService(Context.WINDOW_SERVICE) as WindowManager)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = wm.currentWindowMetrics
      val bounds = metrics.bounds
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars() or WindowInsets.Type.displayCutout()
      )
      return Rect(
        bounds.left + insets.left,
        bounds.top + insets.top,
        bounds.right - insets.right,
        bounds.bottom - insets.bottom
      )
    }
    @Suppress("DEPRECATION")
    val display = wm.defaultDisplay
    val size = Point()
    @Suppress("DEPRECATION")
    display.getSize(size)
    val statusBarHeight = resources.getIdentifier("status_bar_height", "dimen", "android").let {
      if (it > 0) resources.getDimensionPixelSize(it) else (24 * resources.displayMetrics.density).toInt()
    }
    return Rect(0, statusBarHeight, size.x, size.y)
  }

  /**
   * Clamps a (x, y, width, height) rectangle so it lands ENTIRELY
   * inside the current safe area -- "move to the nearest valid
   * position" is exactly this: the closest point inside the bounds.
   * If the overlay itself is somehow wider/taller than the safe area
   * (shouldn't happen for this small a view, but a tiny/cut-down
   * display is possible), it's pinned to the safe area's own
   * top-left rather than left centered-but-still-overflowing.
   */
  private fun clampToSafeArea(x: Int, y: Int, width: Int, height: Int): Pair<Int, Int> {
    val safe = computeSafeAreaBounds()
    val maxX = (safe.right - width).coerceAtLeast(safe.left)
    val maxY = (safe.bottom - height).coerceAtLeast(safe.top)
    return Pair(x.coerceIn(safe.left, maxX), y.coerceIn(safe.top, maxY))
  }

  private fun ensureOverlayAdded() {
    if (overlayContainer != null) return // Requirement 7: never a second overlay view.
    try {
      val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
      windowManager = wm

      val timerView = TextView(this).apply {
        setTextColor(Color.WHITE)
        textSize = 14f
        text = actionTitle.ifEmpty { title } + "  " + overlayGlyph(currentRemainingSeconds()) + " " + formatRemaining(currentRemainingSeconds())
      }
      // Unified Task Stages task, requirement 6: "next action... in
      // smaller text toward the left side" -- Gravity.LEFT explicitly
      // (never START), matching the trainee's own literal instruction
      // regardless of RTL layout direction elsewhere in the app. Starts
      // GONE; renderNow() toggles it based on whether there IS a next
      // stage to show.
      val nextActionView = TextView(this).apply {
        setTextColor(Color.parseColor("#DDFFFFFF"))
        textSize = 11f
        gravity = Gravity.LEFT
        visibility = View.GONE
        text = nextActionTitle?.let { "הבא: $it" } ?: ""
      }
      val timerCell = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(Color.parseColor("#CC0A7EA4"))
        setPadding(20, 14, 20, 14)
        addView(timerView)
        addView(nextActionView)
      }
      // ARCHI -- Consolidated Implementation Request, Part 11 ("Remove
      // standalone ARC"): the small "ARC" quick-button that used to sit
      // next to the timer inside the expanded cube's current-task row
      // is now permanently unreachable -- "the user should not need a
      // redundant standalone ARC button" (the mood row below already
      // offers 😟/🙂/😄, and task-specific entry still works via
      // openTaskLive()'s existing deep links). openArcForTask() itself,
      // and its debounce state, are deliberately kept, unremoved, below
      // -- never wired to any tap target any more, same "never delete,
      // just stop reaching it" convention this app's own ARC step ids
      // already use.
      // Unified Task Stages task, requirement 4: the overlay's own ✓
      // "Complete Action" button -- same compact styling convention as
      // the ARC button, its own distinct color, shown only while
      // showCompleteButton is true (a task with a configured, still
      // in-progress stage breakdown); GONE otherwise, so a legacy task's
      // overlay is visually unchanged.
      val completeView = TextView(this).apply {
        text = "✓"
        setBackgroundColor(Color.parseColor("#CCB8860B"))
        setTextColor(Color.WHITE)
        textSize = 14f
        setPadding(18, 10, 18, 10)
        visibility = if (showCompleteButton) View.VISIBLE else View.GONE
      }
      val spacer2 = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(6, LinearLayout.LayoutParams.MATCH_PARENT)
      }
      // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
      // requirement 1: "משימה נוכחית" -- the pre-existing timer/ARC/✓
      // row above, now wrapped in its own HORIZONTAL row, hidden
      // entirely (View.GONE) while idle -- see renderNow()'s own
      // `currentTaskRowView?.visibility` toggle, the one place that
      // decides this, never duplicated here.
      val currentTaskRow = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(timerCell)
        addView(spacer2)
        addView(completeView)
      }

      // --- Unified panel, sections 2+3+5+8: the mood row -- "😟 פחות
      // טוב" and "🙂 סבבה" always present; "😄 ישר למשימה" only while
      // idle (toggled in renderNow()). Tapping any of the three reuses
      // the EXACT SAME archi://check-in?choice=... deep link the
      // Android Home Screen Widget's own PendingIntents already use
      // (app/check-in.tsx -> data/emotionalCheckInRouting.ts's shared
      // handleEmotionalCheckInChoice) -- never a second decision layer.
      val moodLessGoodTextView = TextView(this).apply {
        text = "😟 פחות טוב"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(10, 8, 10, 8)
      }
      val moodOkTextView = TextView(this).apply {
        text = "🙂 סבבה"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(10, 8, 10, 8)
      }
      val moodDirectTextView = TextView(this).apply {
        text = "😄 ישר למשימה"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(10, 8, 10, 8)
      }
      val moodRow = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setBackgroundColor(Color.parseColor("#CC0A7EA4"))
        addView(moodLessGoodTextView)
        addView(moodOkTextView)
        addView(moodDirectTextView)
      }

      // --- ARCHI -- Unified Final Specification task, section 1
      // (combined "מחשבה / דחף" shortcut -- supersedes the earlier
      // urge-only row of the same position/dispatch; the internal
      // "urge" choice string/openCheckIn("urge") call are kept
      // unrenamed, see data/emotionalCheckInRouting.ts): its own row
      // directly below moodRow -- "place the button directly below 😟
      // פחות טוב" -- gravity START lands it on the same side moodRow's
      // first child (😟) renders on. Reuses the EXACT SAME
      // openCheckIn("urge") dispatch every other mood tap already
      // goes through (data/emotionalCheckInRouting.ts's own shared
      // handleEmotionalCheckInChoice), never a second decision layer --
      // and is available regardless of taskId (active, paused, or no
      // task at all), same as every other mood button.
      val urgeTextView = TextView(this).apply {
        text = "🧠 מחשבה / דחף"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(10, 8, 10, 8)
      }
      val urgeRow = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.START
        setBackgroundColor(Color.parseColor("#CC0A7EA4"))
        addView(urgeTextView)
      }

      // --- Unified panel, sections 2+3+4: the next-task section --
      // "המשימה הבאה" (or the required empty state), plus "עבור למשימה
      // הבאה" -- hidden whenever there's nothing to advance to
      // (renderNow() toggles this from nextScheduledTaskTitle alone,
      // never a second signal).
      val nextTaskInfoTextView = TextView(this).apply {
        setTextColor(Color.parseColor("#DDFFFFFF"))
        textSize = 11f
        setPadding(10, 6, 10, 2)
      }
      // ARCHI -- Consolidated Implementation Request, Part 11 ("Center
      // Start Task"): this is the cube's own closest equivalent to a
      // "start/resume task" control (the standalone ARC button removed
      // above never was one) -- centered now that it is the row's one
      // remaining action, instead of the old left-aligned default.
      val nextTaskActionTextView = TextView(this).apply {
        text = "עבור למשימה הבאה"
        setTextColor(Color.WHITE)
        textSize = 12f
        gravity = Gravity.CENTER
        setPadding(10, 2, 10, 6)
      }
      val nextTaskSection = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(Color.parseColor("#CC14506B"))
        addView(nextTaskInfoTextView)
        addView(nextTaskActionTextView)
      }

      // --- Unified panel, section 7: "+ תובנה" -- always available,
      // both idle and active/paused, per the spec's own explicit
      // requirement. ARC Saving, Trigger Management & Quick-Action
      // Buttons task, section 7: restyled with the shared SOLID green
      // background (never translucent/text-only) and a shortened label
      // -- same hex/label as Home's own quickActionButton style and the
      // widget's own drawable; the underlying deep link/destination is
      // completely unchanged.
      val insightTextView = TextView(this).apply {
        text = "+ תובנה"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(14, 10, 14, 10)
        setBackgroundColor(Color.parseColor(QUICK_ACTION_BACKGROUND))
      }

      // --- ARC Questions task, section 2: "+ שאלה" -- the exact same
      // row style and always-available-idle-or-active/paused precedent
      // as insightTextView right above.
      val questionTextView = TextView(this).apply {
        text = "+ שאלה"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(14, 10, 14, 10)
        setBackgroundColor(Color.parseColor(QUICK_ACTION_BACKGROUND))
      }

      // --- Add Direct ARC Gym Access from Home and the Floating Timer
      // task, section 2: a single, always-available "🏋️ ARC Gym"
      // shortcut -- same row style as insightTextView above, but its
      // own deep link never includes taskId: opening ARC Gym must never
      // stop/reset the active timer, complete/postpone the task, or
      // auto-start anything, so it is deliberately task-independent in
      // both idle and active/paused states.
      val arcGymTextView = TextView(this).apply {
        text = "🏋️ ARC Gym"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(10, 8, 10, 8)
      }

      // --- Positive Memory, Success Recall & Quick Capture task,
      // section 3A: "+ אירוע חיובי" -- same row style as
      // insightTextView, always available idle or active/paused. ARC
      // Saving task, section 7: restyled with the same solid-green
      // background + shortened label as insightTextView above.
      val positiveEventTextView = TextView(this).apply {
        text = "+ אירוע חיובי"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(14, 10, 14, 10)
        setBackgroundColor(Color.parseColor(QUICK_ACTION_BACKGROUND))
      }

      // --- ARC Saving, Trigger Management & Quick-Action Buttons task,
      // section 7: "+ משימה" -- the cube's own first quick-action for
      // task creation (the widget already has one; the cube never did).
      // Task-independent, same precedent as arcGymView -- opening the
      // task editor must never touch the active task/timer.
      val addTaskTextView = TextView(this).apply {
        text = "+ משימה"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(14, 10, 14, 10)
        setBackgroundColor(Color.parseColor(QUICK_ACTION_BACKGROUND))
      }

      // --- ARC Saving, Trigger Management & Quick-Action Buttons task,
      // section 8+12: "+ ARC Save" -- the fourth quick-action, opening
      // the trigger-activation picker. Task-independent at the deep-link
      // level (no taskId threaded through) -- the destination screen
      // itself resolves the real-or-standalone task, same convention as
      // every other ARC Saving entry point.
      val arcSavingTextView = TextView(this).apply {
        text = "+ ARC Save"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(14, 10, 14, 10)
        setBackgroundColor(Color.parseColor(QUICK_ACTION_BACKGROUND))
      }

      // --- Collapsible and Expandable Modes task: a clearly visible
      // collapse button, its own distinct row at the TOP of the
      // expanded panel (so it's the first thing seen, never buried
      // under the rest of the content it collapses away).
      val collapseButtonTextView = TextView(this).apply {
        text = "▾ כווץ"
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(10, 6, 10, 6)
        setBackgroundColor(Color.parseColor("#CC444444"))
      }
      val collapseRow = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.END
        addView(collapseButtonTextView)
      }

      // --- Collapsible and Expandable Modes task: everything this
      // panel already showed (collapse button, mood row, current-task
      // row, next-task section, insight action) is now wrapped in ONE
      // sub-container -- never rebuilt, never duplicated, just nested
      // one level deeper so it can be hidden/shown as a single unit.
      val expandedContent = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(collapseRow)
        addView(moodRow)
        addView(urgeRow)
        addView(currentTaskRow)
        addView(nextTaskSection)
        addView(insightTextView)
        addView(questionTextView)
        addView(addTaskTextView)
        addView(positiveEventTextView)
        addView(arcSavingTextView)
        addView(arcGymTextView)
      }

      // --- Collapsible and Expandable Modes task: the collapsed-mode
      // pill -- "very small", shown at the top of the screen by the
      // SAME position persistence/clamping this overlay already has
      // (unchanged below), never a second floating view.
      val pillTextView = TextView(this).apply {
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(14, 8, 14, 8)
        setBackgroundColor(Color.parseColor("#CC0A7EA4"))
        text = pillSummaryText(currentRemainingSeconds(), taskId.isEmpty())
      }

      // ARC Addiction second line: visible in BOTH collapsed and expanded
      // modes (it sits outside expandedContent), GONE while inactive.
      val secondaryView = TextView(this).apply {
        setTextColor(Color.WHITE)
        textSize = 12f
        setPadding(14, 8, 14, 8)
        setBackgroundColor(Color.parseColor(SECONDARY_BACKGROUND))
        visibility = View.GONE
      }

      val container = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(pillTextView)
        addView(secondaryView)
        addView(expandedContent)
      }
      // Exactly one of the two is ever visible -- set BEFORE the
      // container is measured below, so the very first measured/clamped
      // size (and therefore the actual touchable window size) already
      // reflects whichever mode this trainee was last in, never a
      // one-frame flash of the wrong size.
      pillTextView.visibility = if (collapsed) View.VISIBLE else View.GONE
      expandedContent.visibility = if (collapsed) View.GONE else View.VISIBLE

      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }
      val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT
      )
      params.gravity = Gravity.TOP or Gravity.START
      val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val savedX = prefs.getInt(PREF_X, 0)
      val savedY = prefs.getInt(PREF_Y, 200)
      // Floating Timer Position/Touch Accessibility fix, requirements
      // 1.1-1.4 + 2: measure the container's real size BEFORE it's
      // attached to WindowManager (no layout pass needed yet for a
      // WRAP_CONTENT view of plain TextViews), so the restored position
      // is clamped to the CURRENT safe area -- never shown even for one
      // frame at an inaccessible spot -- and the correction (if any) is
      // persisted immediately, so the trainee's own last manually
      // chosen position is only ever adjusted the minimum necessary and
      // that correction sticks (never re-drifts back to the stale,
      // invalid value on the next restore).
      container.measure(
        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
      )
      val (clampedX, clampedY) = clampToSafeArea(savedX, savedY, container.measuredWidth, container.measuredHeight)
      params.x = clampedX
      params.y = clampedY
      if (clampedX != savedX || clampedY != savedY) {
        prefs.edit().putInt(PREF_X, clampedX).putInt(PREF_Y, clampedY).apply()
      }

      attachDragAndTapHandling(
        container,
        completeView,
        moodLessGoodTextView,
        moodOkTextView,
        moodDirectTextView,
        nextTaskActionTextView,
        insightTextView,
        questionTextView,
        arcGymTextView,
        positiveEventTextView,
        collapseButtonTextView,
        urgeTextView,
        addTaskTextView,
        arcSavingTextView,
        secondaryView,
        params
      )

      wm.addView(container, params)
      overlayContainer = container
      timerTextView = timerView
      nextActionTextView = nextActionView
      completeButtonView = completeView
      currentTaskRowView = currentTaskRow
      moodLessGoodView = moodLessGoodTextView
      moodOkView = moodOkTextView
      moodDirectToTaskView = moodDirectTextView
      urgeView = urgeTextView
      nextTaskInfoView = nextTaskInfoTextView
      nextTaskActionView = nextTaskActionTextView
      insightView = insightTextView
      arcGymView = arcGymTextView
      positiveEventView = positiveEventTextView
      addTaskView = addTaskTextView
      arcSavingView = arcSavingTextView
      pillView = pillTextView
      expandedContentView = expandedContent
      collapseButtonView = collapseButtonTextView
      secondaryTextView = secondaryView
      overlayParams = params
      renderSecondary()
      // Visibility for the mood row's 3rd smile, the current-task row,
      // and the next-task action is set by onStartCommand's own
      // unconditional renderNow() call right after this function
      // returns -- never duplicated here. The pill-vs-expanded-content
      // visibility is the one exception: it was already set ABOVE,
      // before measuring, and renderNow() never touches it again (only
      // setCollapsed does) -- collapsed/expanded is a user choice, never
      // something a tick/update silently reverts.
    } catch (_: Exception) {
      // Requirement 2: a denied/unavailable overlay permission (or any
      // OEM-specific restriction) must never block the regular timer --
      // the ongoing notification above already started successfully and
      // keeps working completely independently of this.
      overlayContainer = null
      secondaryTextView = null
      timerTextView = null
      nextActionTextView = null
      completeButtonView = null
      currentTaskRowView = null
      moodLessGoodView = null
      moodOkView = null
      moodDirectToTaskView = null
      urgeView = null
      nextTaskInfoView = null
      nextTaskActionView = null
      insightView = null
      arcGymView = null
      positiveEventView = null
      addTaskView = null
      arcSavingView = null
      pillView = null
      expandedContentView = null
      collapseButtonView = null
      overlayParams = null
    }
  }

  /**
   * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task:
   * a tappable child is no longer always a DIRECT child of the
   * container that owns the touch listener -- the unified panel nests
   * rows (moodRow, currentTaskRow, nextTaskSection) inside the outer
   * VERTICAL container -- so `childView.left/top` alone (relative to
   * its own immediate parent) is no longer the same as "relative to
   * the listener's own view," which is what every hit-test below
   * compares against `event.x`/`event.y`. This walks up the view tree
   * from `target` to `root`, summing each ancestor's own left/top, to
   * get a true root-relative rectangle regardless of nesting depth --
   * the exact same hit-testing OUTCOME the pre-existing single-level
   * checks already relied on, just correct now that the tree is
   * deeper. A GONE/INVISIBLE view is never a hit target, matching the
   * pre-existing `completeView.visibility == View.VISIBLE` guard.
   */
  private fun isPointInsideView(root: View, target: View, x: Float, y: Float): Boolean {
    if (target.visibility != View.VISIBLE) return false
    var left = 0
    var top = 0
    var current: View = target
    while (current !== root) {
      left += current.left
      top += current.top
      current = current.parent as? View ?: return false
    }
    return x >= left && x <= left + target.width && y >= top && y <= top + target.height
  }

  /**
   * Floating ARC button task: ONE touch listener on the whole container
   * handles dragging (requirement: "הטיימר והכפתור יוכלו לזוז יחד") --
   * no sub-view ever gets its own competing touch listener, which would
   * otherwise swallow the drag the moment a finger lands on it. Instead,
   * a plain tap (never a drag) is routed by hit-testing each button's
   * own bounds at ACTION_DOWN time, in priority order: while collapsed,
   * any tap expands (see the ACTION_UP branch below -- the pill is the
   * only visible child, so no hit-test is even needed); while expanded,
   * the collapse button, ✓ (complete stage), the three mood
   * buttons, "🧠 מחשבה / דחף", "עבור למשימה הבאה", the four uniform solid-
   * green quick-action buttons ("+ תובנה", "🏋️ ARC Gym", "+ אירוע חיובי",
   * "+ משימה", "+ ARC Save" -- ARC Saving, Trigger Management & Quick-
   * Action Buttons task section 7/12), and finally -- anywhere else on
   * the container -- Task LIVE (a no-op while idle, since openTaskLive()
   * itself already guards on an empty taskId) -- exactly preserving the
   * pre-existing tap-to-open behavior for every pre-existing region,
   * extended with the new ones. Dragging itself works identically
   * whether collapsed or expanded, since it's still the same one
   * container/one set of LayoutParams either way.
   */
  private fun attachDragAndTapHandling(
    view: View,
    completeView: View,
    moodLessGoodView: View,
    moodOkView: View,
    moodDirectView: View,
    nextTaskActionView: View,
    insightView: View,
    questionView: View,
    arcGymView: View,
    positiveEventView: View,
    collapseButtonView: View,
    urgeView: View,
    addTaskView: View,
    arcSavingView: View,
    secondaryView: View,
    params: WindowManager.LayoutParams
  ) {
    var initialX = 0
    var initialY = 0
    var initialTouchX = 0f
    var initialTouchY = 0f
    var moved = false
    var downOnCompleteButton = false
    var downOnMoodLessGood = false
    var downOnMoodOk = false
    var downOnMoodDirect = false
    var downOnNextTaskAction = false
    var downOnInsight = false
    var downOnQuestion = false
    var downOnArcGym = false
    var downOnPositiveEvent = false
    var downOnCollapseButton = false
    var downOnUrge = false
    var downOnAddTask = false
    var downOnArcSaving = false
    var downOnSecondary = false

    view.setOnTouchListener { _, event ->
      val wm = windowManager ?: return@setOnTouchListener false
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = params.x
          initialY = params.y
          initialTouchX = event.rawX
          initialTouchY = event.rawY
          moved = false
          downOnCompleteButton = isPointInsideView(view, completeView, event.x, event.y)
          downOnMoodLessGood = isPointInsideView(view, moodLessGoodView, event.x, event.y)
          downOnMoodOk = isPointInsideView(view, moodOkView, event.x, event.y)
          downOnMoodDirect = isPointInsideView(view, moodDirectView, event.x, event.y)
          downOnNextTaskAction = isPointInsideView(view, nextTaskActionView, event.x, event.y)
          downOnInsight = isPointInsideView(view, insightView, event.x, event.y)
          downOnQuestion = isPointInsideView(view, questionView, event.x, event.y)
          downOnArcGym = isPointInsideView(view, arcGymView, event.x, event.y)
          downOnPositiveEvent = isPointInsideView(view, positiveEventView, event.x, event.y)
          downOnCollapseButton = isPointInsideView(view, collapseButtonView, event.x, event.y)
          downOnUrge = isPointInsideView(view, urgeView, event.x, event.y)
          downOnAddTask = isPointInsideView(view, addTaskView, event.x, event.y)
          downOnArcSaving = isPointInsideView(view, arcSavingView, event.x, event.y)
          downOnSecondary = isPointInsideView(view, secondaryView, event.x, event.y)
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - initialTouchX).toInt()
          val dy = (event.rawY - initialTouchY).toInt()
          if (Math.abs(dx) > DRAG_CLICK_THRESHOLD_PX || Math.abs(dy) > DRAG_CLICK_THRESHOLD_PX) moved = true
          // Floating Timer Position/Touch Accessibility fix: clamp the
          // LIVE drag position too, not just the restored one -- the
          // overlay (and both its buttons) can then never be dragged
          // off-screen, under the status bar, or behind the nav bar in
          // the first place, so whatever ACTION_UP saves below is
          // already guaranteed valid.
          val (clampedX, clampedY) = clampToSafeArea(initialX + dx, initialY + dy, view.width, view.height)
          params.x = clampedX
          params.y = clampedY
          try {
            wm.updateViewLayout(view, params)
          } catch (_: Exception) {
            // Requirement 7: a permission revoked mid-drag must never crash the host app.
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (moved) {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
              .putInt(PREF_X, params.x)
              .putInt(PREF_Y, params.y)
              .apply()
          } else if (downOnSecondary) {
            // ARC Addiction: checked before the collapsed->expand rule --
            // the second line is visible while collapsed and opens the
            // ARC Addiction session.
            openArcAddictionSession()
          } else if (collapsed) {
            // ARCHI -- Collapsible and Expandable Modes task: "Tapping
            // the pill expands the floating cube" -- while collapsed,
            // the pill is the ONLY visible child, so any non-drag tap
            // anywhere on the (tiny) container expands it; there is
            // nothing else it could have meant to hit.
            setCollapsed(false)
          } else if (downOnCollapseButton) {
            setCollapsed(true)
          } else if (downOnCompleteButton) {
            completeStageForTask()
          } else if (downOnMoodLessGood) {
            openCheckIn("full_arc")
          } else if (downOnMoodOk) {
            openCheckIn("shortened_arc")
          } else if (downOnMoodDirect) {
            openCheckIn("next_task")
          } else if (downOnUrge) {
            openCheckIn("urge")
          } else if (downOnNextTaskAction) {
            openNextTask()
          } else if (downOnInsight) {
            openAddInsight()
          } else if (downOnQuestion) {
            openAddQuestion()
          } else if (downOnArcGym) {
            openArcGym()
          } else if (downOnPositiveEvent) {
            openAddPositiveEvent()
          } else if (downOnAddTask) {
            openAddTask()
          } else if (downOnArcSaving) {
            openArcSaving()
          } else {
            openTaskLive()
          }
          true
        }
        MotionEvent.ACTION_CANCEL -> {
          // Robustness: a gesture the system aborts mid-way (e.g. an
          // interrupting system dialog) must never leave the next
          // ACTION_DOWN reading a stale `moved`/button-hit state --
          // ACTION_DOWN already resets all of these itself, but
          // handling CANCEL explicitly (rather than falling through to
          // `else -> false`) means this touch stream is fully consumed,
          // never partially handled by some other listener mid-drag.
          moved = false
          true
        }
        else -> false
      }
    }
  }

  /**
   * ARCHI -- Collapsible and Expandable Modes task: the ONE place that
   * switches between the pill and the full panel. "Collapsing must
   * never pause, reset or interrupt the task timer" -- this function
   * touches ONLY view visibility, the persisted collapsed flag, and the
   * container's own window position/size; it never reads or writes
   * taskId/anchorEpochMs/anchorRemainingSeconds/paused, never calls
   * stopTicking()/startTicking(), and never deep-links anywhere -- the
   * countdown (currentRemainingSeconds, driven by the SAME anchor it
   * always was) keeps advancing in memory and on the pill's own text
   * exactly as if nothing happened.
   *
   * Re-measuring and re-clamping here (not just on the next drag/restore)
   * matters most going collapsed -> expanded: the panel is now much
   * taller, and a position that was perfectly valid for the tiny pill
   * near the edge of the safe area could otherwise push the expanded
   * panel partly off-screen for one frame until something else happened
   * to reposition it.
   */
  private fun setCollapsed(value: Boolean) {
    if (collapsed == value) return
    collapsed = value
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putBoolean(PREF_COLLAPSED, value).apply()
    pillView?.visibility = if (collapsed) View.VISIBLE else View.GONE
    expandedContentView?.visibility = if (collapsed) View.GONE else View.VISIBLE
    val container = overlayContainer ?: return
    val params = overlayParams ?: return
    val wm = windowManager ?: return
    container.measure(
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
    )
    val (clampedX, clampedY) = clampToSafeArea(params.x, params.y, container.measuredWidth, container.measuredHeight)
    params.x = clampedX
    params.y = clampedY
    try {
      wm.updateViewLayout(container, params)
    } catch (_: Exception) {
      // Requirement 2: a denied/unavailable overlay permission must never crash the host app.
    }
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
      .putInt(PREF_X, clampedX)
      .putInt(PREF_Y, clampedY)
      .apply()
  }

  private fun openTaskLive() {
    if (taskId.isEmpty()) return
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://tasks/$taskId")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * Floating ARC button task: opens the app's own existing spontaneous-
   * ARC flow for the active task, deep-linking into Task LIVE with
   * needArc=1 -- live/ActiveTaskScreen.tsx is what actually pauses the
   * work timer (via its own existing handlePause()) and then forwards to
   * the task's existing ARC chooser (live/ArcWindowScreen.tsx), never
   * duplicated here. The debounce guards the one explicit requirement
   * this native side alone can enforce regardless of JS/app state: never
   * launching two ARC-open intents from two rapid taps.
   */
  private fun openArcForTask() {
    if (taskId.isEmpty()) return
    val now = System.currentTimeMillis()
    if (now - lastArcOpenAtMs < ARC_OPEN_DEBOUNCE_MS) return
    lastArcOpenAtMs = now
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://tasks/$taskId?needArc=1")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * Unified Task Stages task, requirement 4: deep-links into Task LIVE
   * with completeStage=1 -- live/ActiveTaskScreen.tsx's own
   * handleCompleteStage (the SAME function the full screen's own ✓
   * button calls) does the actual completion/advance; never duplicated
   * here. Same source-level debounce convention as openArcForTask
   * above, for the same reason: a rapid double-tap must never fire two
   * completeStage deep-links.
   */
  private fun completeStageForTask() {
    if (taskId.isEmpty()) return
    val now = System.currentTimeMillis()
    if (now - lastCompleteStageAtMs < COMPLETE_STAGE_DEBOUNCE_MS) return
    lastCompleteStageAtMs = now
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://tasks/$taskId?completeStage=1")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
   * sections 2+3+5: the mood row's own tap -- reuses the EXACT SAME
   * archi://check-in?choice=... deep link the Android Home Screen
   * Widget's own PendingIntents already use (app/check-in.tsx ->
   * data/emotionalCheckInRouting.ts's shared handleEmotionalCheckInChoice),
   * never a second decision layer: "😟 פחות טוב" -> choice=full_arc (now
   * opens the Mini-vs-Full-ARC choice screen, per that module's own
   * updated branch), "🙂 סבבה" -> choice=shortened_arc (Shortened ARC,
   * directly, unchanged), "😄 ישר למשימה" -> choice=next_task (the
   * existing "מעולה" behavior, relabeled). Available regardless of
   * taskId -- the shared routing module resolves its own target fresh
   * every time, so this never needs to know which state the panel is
   * currently in.
   */
  private fun openCheckIn(choice: String) {
    val now = System.currentTimeMillis()
    if (now - lastMoodTapAtMs < MOOD_TAP_DEBOUNCE_MS) return
    lastMoodTapAtMs = now
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://check-in?choice=$choice")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
   * sections 2+3+4: "עבור למשימה הבאה" -- while a real task session is
   * active (running OR paused), deep-links into Task LIVE with
   * nextTask=1; live/ActiveTaskScreen.tsx's own existing handleNextTask()
   * (the SAME function its own "המשימה הבאה" button already calls) does
   * the actual pause-then-advance, never duplicated here. While idle
   * (no current task at all), there is nothing to advance FROM, so this
   * reuses the exact same choice=next_task deep link as "😄 ישר למשימה"
   * above -- intentionally the same destination, never a second
   * "what's next" decision.
   */
  private fun openNextTask() {
    val now = System.currentTimeMillis()
    if (now - lastNextTaskTapAtMs < NEXT_TASK_TAP_DEBOUNCE_MS) return
    lastNextTaskTapAtMs = now
    val uri = if (taskId.isEmpty()) "archi://check-in?choice=next_task" else "archi://tasks/$taskId?nextTask=1"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
   * section 7: "💡 הוסף תובנה" -- while a task is active/paused,
   * deep-links into Task LIVE with addInsight=1 so
   * live/ActiveTaskScreen.tsx can open the existing insight editor WITH
   * this task's own id as its return context (never a second insight
   * editor); while idle, opens the editor directly with no task
   * context to return to.
   */
  private fun openAddInsight() {
    val now = System.currentTimeMillis()
    if (now - lastInsightTapAtMs < ADD_INSIGHT_TAP_DEBOUNCE_MS) return
    lastInsightTapAtMs = now
    val uri = if (taskId.isEmpty()) "archi://insights/new" else "archi://tasks/$taskId?addInsight=1"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * ARC Questions task, section 2: "+ שאלה" -- the EXACT same
   * destination convention as openAddInsight() right above: while a
   * task is active/paused, deep-links into Task LIVE with
   * addQuestion=1 so live/ActiveTaskScreen.tsx can open the ARC
   * Questions composer WITH this task's own id as its return context
   * (never finishing, canceling, resetting or restarting the active
   * task/timer); while idle, opens the composer directly with no task
   * context to return to.
   */
  private fun openAddQuestion() {
    val now = System.currentTimeMillis()
    if (now - lastQuestionTapAtMs < ADD_QUESTION_TAP_DEBOUNCE_MS) return
    lastQuestionTapAtMs = now
    val uri = if (taskId.isEmpty()) "archi://questions/new" else "archi://tasks/$taskId?addQuestion=1"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * Positive Memory, Success Recall & Quick Capture task, section 3A:
   * "✨ הוסף אירוע חיובי" -- the exact same destination convention as
   * openAddInsight() right above: while a task is active/paused,
   * deep-links into Task LIVE with addPositiveEvent=1 so
   * live/ActiveTaskScreen.tsx can open the documentation entry screen
   * WITH this task's own id as its return context (never finishing,
   * canceling, resetting or restarting the active task/timer); while
   * idle, opens the entry screen directly with no task context.
   */
  private fun openAddPositiveEvent() {
    val now = System.currentTimeMillis()
    if (now - lastPositiveEventTapAtMs < ADD_POSITIVE_EVENT_TAP_DEBOUNCE_MS) return
    lastPositiveEventTapAtMs = now
    val uri = if (taskId.isEmpty()) "archi://positive-memories/new" else "archi://tasks/$taskId?addPositiveEvent=1"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * ARCHI -- Add Direct ARC Gym Access from Home and the Floating Timer
   * task, section 2: "🏋️ ARC Gym" -- deliberately NEVER threads taskId
   * through its deep link, unlike openAddInsight() right above -- the
   * exact same plain "archi://arc-gym" URI whether a task is active,
   * paused, or there is none at all. expo-router's own default
   * scheme-based linking resolves this straight to app/arc-gym/index.tsx
   * (identical mechanism already proven safe by archi://insights/new
   * above and the Home Screen Widget's archi://check-in deep links --
   * no new native routing of any kind). This is what guarantees the
   * active task timer is never stopped, reset, completed, or postponed,
   * and no ARC exercise is ever auto-started: this service keeps
   * running completely unaware that the user navigated anywhere, the
   * exact same way it already stays running while the trainee opens
   * the insight editor, Task LIVE, or any other screen from here.
   */
  private fun openArcGym() {
    val now = System.currentTimeMillis()
    if (now - lastArcGymOpenAtMs < ARC_GYM_OPEN_DEBOUNCE_MS) return
    lastArcGymOpenAtMs = now
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://arc-gym")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * ARC Saving, Trigger Management & Quick-Action Buttons task, section
   * 7: "+ משימה" -- opens the existing Add Task flow (TaskEditorScreen
   * via app/tasks/[id]/edit.tsx), the SAME route the widget's own
   * buildAddTaskPendingIntent and Home's own build/FlexibleDailyScreen.tsx
   * quick-action already use -- never a second task-creation screen.
   * Task-independent: no taskId to carry, this is always a brand-new
   * task.
   */
  private fun openAddTask() {
    val now = System.currentTimeMillis()
    if (now - lastAddTaskTapAtMs < ADD_TASK_TAP_DEBOUNCE_MS) return
    lastAddTaskTapAtMs = now
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://tasks/new/edit")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  /**
   * ARC Saving, Trigger Management & Quick-Action Buttons task, sections
   * 8+12: "+ ARC Save" -- opens build/ArcSavingActivateScreen.tsx (the
   * same trigger-activation picker the Home screen's own "+ ARC Save"
   * button and trigger chips open), never starting ARC automatically on
   * its own (section 8) -- this deep link only ever opens the picker.
   */
  private fun openArcSaving() {
    val now = System.currentTimeMillis()
    if (now - lastArcSavingOpenAtMs < ARC_SAVING_OPEN_DEBOUNCE_MS) return
    lastArcSavingOpenAtMs = now
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://arc-saving/activate")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      startActivity(intent)
    } catch (_: Exception) {
      // No matching activity to resolve to -- nothing more this side can do.
    }
  }

  private fun removeOverlayIfAdded() {
    val container = overlayContainer ?: return
    try {
      windowManager?.removeView(container)
    } catch (_: Exception) {
      // Already removed/detached -- nothing left to clean up.
    }
    overlayContainer = null
    timerTextView = null
    nextActionTextView = null
    completeButtonView = null
    currentTaskRowView = null
    moodLessGoodView = null
    moodOkView = null
    moodDirectToTaskView = null
    urgeView = null
    nextTaskInfoView = null
    nextTaskActionView = null
    insightView = null
    arcGymView = null
    positiveEventView = null
    addTaskView = null
    arcSavingView = null
    pillView = null
    expandedContentView = null
    collapseButtonView = null
    secondaryTextView = null
    overlayParams = null
  }
}
