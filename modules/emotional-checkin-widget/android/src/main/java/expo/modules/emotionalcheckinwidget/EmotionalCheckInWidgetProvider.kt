package expo.modules.emotionalcheckinwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

/**
 * Unified Emotional Check-In and Task Postponement System, section 2:
 * a genuine native Android Home Screen Widget -- AppWidgetProvider IS
 * a plain BroadcastReceiver (declared in this module's own
 * AndroidManifest.xml, merged into the app's manifest the same way
 * modules/floating-timer-overlay's own Service already is).
 *
 * Each of the three (now five) tappable actions opens ARCHI directly
 * into its own flow via the SAME `archi://...` deep links
 * (check-in choices through app/check-in.tsx -> data/emotionalCheckInRouting.ts;
 * task/insight routes through the SAME archi://tasks/$taskId... scheme
 * modules/floating-timer-overlay's own OverlayService.kt already
 * uses) -- never a parallel decision mechanism baked into this
 * provider. Using Intent.ACTION_VIEW + FLAG_ACTIVITY_NEW_TASK against
 * this exact package is the same reliable, cold-start-safe mechanism
 * that overlay already relies on.
 *
 * ARCHI -- Home-Screen Widget Sync task: this provider is no longer
 * fully static. EmotionalCheckInWidgetModule.kt's own `update()`
 * function (called from the SAME JS call sites that already push to
 * the floating cube -- data/floatingTimerOverlay.ts -- never a second,
 * parallel data path) persists the latest current/next-task state via
 * [WidgetState] and immediately refreshes every placed widget.
 * [onUpdate] (the launcher's own periodic/boot-time/newly-placed-widget
 * callback) reads that SAME persisted state, so a widget that was just
 * added, or just survived a reboot, shows the last known REAL state
 * immediately -- never a blank/default placeholder and never a second,
 * independent "what's happening now" computation.
 */
class EmotionalCheckInWidgetProvider : AppWidgetProvider() {
  companion object {
    private const val REQUEST_CODE_FULL_ARC = 1001
    private const val REQUEST_CODE_SHORTENED_ARC = 1002
    private const val REQUEST_CODE_NEXT_TASK = 1003
    private const val REQUEST_CODE_COGNITIVE = 1004
    private const val REQUEST_CODE_NEXT_TASK_ACTION = 1005
    private const val REQUEST_CODE_INSIGHT = 1006
    private const val REQUEST_CODE_ADD_TASK = 1007
    private const val REQUEST_CODE_POSITIVE_EVENT = 1008

    /**
     * Called by EmotionalCheckInWidgetModule.update() -- persists the
     * new state and immediately refreshes every currently-placed
     * widget instance. Safe to call even when zero widgets are placed
     * (getAppWidgetIds then returns an empty array, so the loop below
     * is simply a no-op) -- the trainee may not have added the widget
     * at all, which must never be an error.
     */
    fun pushState(context: Context, state: WidgetState) {
      WidgetState.save(context, state)
      refreshAllWidgets(context)
    }

    private fun refreshAllWidgets(context: Context) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val provider = ComponentName(context, EmotionalCheckInWidgetProvider::class.java)
      val ids = appWidgetManager.getAppWidgetIds(provider)
      if (ids.isEmpty()) return
      val state = WidgetState.load(context)
      for (id in ids) {
        appWidgetManager.updateAppWidget(id, buildRemoteViews(context, state))
      }
    }

    private fun buildRemoteViews(context: Context, state: WidgetState): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.emotional_checkin_widget)
      views.setOnClickPendingIntent(R.id.widget_button_full_arc, buildCheckInPendingIntent(context, "full_arc", REQUEST_CODE_FULL_ARC))
      views.setOnClickPendingIntent(R.id.widget_button_shortened_arc, buildCheckInPendingIntent(context, "shortened_arc", REQUEST_CODE_SHORTENED_ARC))
      views.setOnClickPendingIntent(R.id.widget_button_next_task, buildCheckInPendingIntent(context, "next_task", REQUEST_CODE_NEXT_TASK))
      // ARCHI -- Unified Final Specification task's own combined
      // cognitive shortcut, reused verbatim here via the SAME
      // choice=urge dispatch the floating cube's urgeTextView already
      // uses (data/emotionalCheckInRouting.ts's shared
      // handleEmotionalCheckInChoice) -- never a second decision layer.
      // Available regardless of idle/active state, same as the cube.
      views.setOnClickPendingIntent(R.id.widget_button_cognitive, buildCheckInPendingIntent(context, "urge", REQUEST_CODE_COGNITIVE))

      val isIdle = state.taskId.isEmpty()
      // Section 2: "😄 ישר למשימה" only while idle -- hidden the instant
      // a real task session exists (running OR paused), exactly
      // mirroring the cube's own moodDirectToTaskView toggle.
      views.setViewVisibility(R.id.widget_button_next_task, if (isIdle) View.VISIBLE else View.GONE)

      // Section 2+3: the current-task row -- GONE while idle, VISIBLE
      // (name + a live Chronometer) while active/paused.
      views.setViewVisibility(R.id.widget_current_task_section, if (isIdle) View.GONE else View.VISIBLE)
      if (!isIdle) {
        views.setTextViewText(R.id.widget_current_task_title, state.actionTitle)
        val remaining = state.currentRemainingSeconds()
        // Chronometer counts up from `base` using SystemClock.elapsedRealtime();
        // a base set in the FUTURE (now + remaining) therefore starts
        // negative and counts toward zero, which Chronometer renders
        // with its own built-in leading "-" -- the officially supported
        // RemoteViews mechanism for a ticking display with no service
        // of this provider's own needed to keep it moving. `started =
        // !paused` freezes the displayed value (no further ticking)
        // the same way the cube's own paused state freezes its shown
        // countdown, without this provider needing its own tick loop.
        val base = SystemClock.elapsedRealtime() + (remaining * 1000).toLong()
        views.setChronometer(R.id.widget_current_task_timer, base, null, !state.paused)
      }

      // Section 1+2+3+4: the next-task section -- same empty-state and
      // overdue-flagging convention as the cube's own
      // nextScheduledTaskSummaryLine, never a second "what's next"
      // computation (the text is built from the SAME upstream resolver
      // output the cube's own payload already carries).
      views.setTextViewText(R.id.widget_next_task_info, state.nextScheduledTaskSummaryLine())
      views.setViewVisibility(R.id.widget_button_next_task_action, if (state.nextScheduledTaskTitle != null) View.VISIBLE else View.GONE)
      views.setOnClickPendingIntent(R.id.widget_button_next_task_action, buildNextTaskActionPendingIntent(context, state.taskId))

      // Section 7: "💡 הוסף תובנה" -- always available.
      views.setOnClickPendingIntent(R.id.widget_button_insight, buildInsightPendingIntent(context, state.taskId))

      // ARCHI -- Consolidated Implementation Request, Part 13.1: "➕
      // הוסף משימה" -- always available, idle or active/paused alike,
      // same convention as the insight button right next to it.
      views.setOnClickPendingIntent(R.id.widget_button_add_task, buildAddTaskPendingIntent(context))

      // Positive Memory, Success Recall & Quick Capture task, section
      // 3B: "✨ הוסף אירוע חיובי" -- always available, idle or
      // active/paused alike, same convention as the insight button.
      views.setOnClickPendingIntent(R.id.widget_button_positive_event, buildPositiveEventPendingIntent(context, state.taskId))

      return views
    }

    /** Every instance of this widget on the home screen shares the exact same PendingIntents (there is no per-widget configuration) -- distinct request codes per BUTTON (never per widget instance) are what keeps the choices from colliding with each other in Android's PendingIntent cache. */
    private fun buildCheckInPendingIntent(context: Context, choice: String, requestCode: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://check-in?choice=$choice")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /**
     * Section 2+3+4: "עבור למשימה הבאה" -- while a real task session is
     * active/paused, deep-links into Task LIVE with nextTask=1 (its own
     * existing handleNextTask does the actual pause-then-advance,
     * never duplicated here); while idle, reuses the exact same
     * choice=next_task destination "😄 ישר למשימה" uses -- the SAME
     * priority/destination convention as the cube's own openNextTask().
     */
    private fun buildNextTaskActionPendingIntent(context: Context, taskId: String): PendingIntent {
      val uri = if (taskId.isEmpty()) "archi://check-in?choice=next_task" else "archi://tasks/$taskId?nextTask=1"
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(context, REQUEST_CODE_NEXT_TASK_ACTION, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /**
     * Section 7: "💡 הוסף תובנה" -- while active/paused, deep-links with
     * addInsight=1 so Task LIVE opens the existing insight editor with
     * this task's own id as its return context; while idle, opens the
     * editor directly -- the SAME destination convention as the
     * cube's own openAddInsight().
     */
    private fun buildInsightPendingIntent(context: Context, taskId: String): PendingIntent {
      val uri = if (taskId.isEmpty()) "archi://insights/new" else "archi://tasks/$taskId?addInsight=1"
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(context, REQUEST_CODE_INSIGHT, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /**
     * Positive Memory, Success Recall & Quick Capture task, section 3B:
     * "✨ הוסף אירוע חיובי" -- while active/paused, deep-links with
     * addPositiveEvent=1 so Task LIVE opens the documentation entry
     * screen with this task's own id as its return context; while
     * idle, opens the entry screen directly -- the SAME destination
     * convention as buildInsightPendingIntent above / the cube's own
     * openAddPositiveEvent().
     */
    private fun buildPositiveEventPendingIntent(context: Context, taskId: String): PendingIntent {
      val uri = if (taskId.isEmpty()) "archi://positive-memories/new" else "archi://tasks/$taskId?addPositiveEvent=1"
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(context, REQUEST_CODE_POSITIVE_EVENT, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /**
     * ARCHI -- Consolidated Implementation Request, Part 13.1: "➕ הוסף
     * משימה" -- opens the EXISTING Add Task flow (TaskEditorScreen via
     * app/tasks/[id]/edit.tsx, the same route build/TasksListScreen.tsx
     * and build/TodayScreen.tsx's own "+" buttons already navigate to
     * with id="new"), never a second task-creation screen/stack. No
     * task context to carry (this is a brand-new task, not tied to any
     * existing one), so it never needs the taskId-dependent branching
     * buildInsightPendingIntent above has.
     */
    private fun buildAddTaskPendingIntent(context: Context): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("archi://tasks/new/edit")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(context, REQUEST_CODE_ADD_TASK, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    val state = WidgetState.load(context)
    for (appWidgetId in appWidgetIds) {
      appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context, state))
    }
  }
}

/**
 * ARCHI -- Home-Screen Widget Sync task: the widget's own persisted
 * "latest known state" -- EXACTLY the subset of
 * arc/floatingTimerOverlayPayload.ts's FloatingTimerOverlayPayload
 * this widget actually renders (taskId/actionTitle/remainingSeconds/
 * paused/next-scheduled-task fields), never a second/different
 * resolution of what's current. Persisted to SharedPreferences (never
 * only an in-memory field) so a newly-placed widget, or one recreated
 * after the launcher process restarts, shows the real last-known state
 * via onUpdate rather than a blank default.
 *
 * `remainingSecondsAtPush` + `pushedAtEpochMs` is the SAME anchor
 * pattern OverlayService.kt's own anchorRemainingSeconds/anchorEpochMs
 * already uses (an absolute wall-clock epoch, so it survives a reboot
 * correctly -- SystemClock.elapsedRealtime() alone would not), letting
 * [currentRemainingSeconds] recompute the true remaining time at
 * render time instead of persisting an already-stale countdown.
 */
data class WidgetState(
  val taskId: String = "",
  val actionTitle: String = "",
  val remainingSecondsAtPush: Double = 0.0,
  val pushedAtEpochMs: Long = 0L,
  val paused: Boolean = false,
  val nextScheduledTaskTitle: String? = null,
  val nextScheduledTaskTime: String? = null,
  val nextScheduledTaskDurationMinutes: Int? = null,
  val nextScheduledTaskIsOverdue: Boolean = false
) {
  fun currentRemainingSeconds(): Double {
    if (paused) return remainingSecondsAtPush
    val elapsedSeconds = (System.currentTimeMillis() - pushedAtEpochMs) / 1000.0
    return (remainingSecondsAtPush - elapsedSeconds).coerceAtLeast(0.0)
  }

  /** Same empty-state + overdue-flagging text convention as OverlayService.kt's own nextScheduledTaskSummaryLine -- never a second, differently-worded "what's next" computation. */
  fun nextScheduledTaskSummaryLine(): String {
    val nextTitle = nextScheduledTaskTitle ?: return "אין משימה נוספת מתוכננת"
    val parts = mutableListOf(nextTitle)
    nextScheduledTaskTime?.let { parts.add(it) }
    nextScheduledTaskDurationMinutes?.let { parts.add("$it דק'") }
    if (nextScheduledTaskIsOverdue) parts.add("⚠ באיחור")
    return "המשימה הבאה: " + parts.joinToString(" · ")
  }

  companion object {
    private const val PREFS_NAME = "emotional_checkin_widget_state"
    private const val KEY_TASK_ID = "taskId"
    private const val KEY_ACTION_TITLE = "actionTitle"
    private const val KEY_REMAINING_SECONDS = "remainingSecondsAtPush"
    private const val KEY_PUSHED_AT = "pushedAtEpochMs"
    private const val KEY_PAUSED = "paused"
    private const val KEY_NEXT_TITLE = "nextScheduledTaskTitle"
    private const val KEY_NEXT_TIME = "nextScheduledTaskTime"
    private const val KEY_NEXT_DURATION = "nextScheduledTaskDurationMinutes"
    private const val KEY_NEXT_OVERDUE = "nextScheduledTaskIsOverdue"
    private const val NO_DURATION = -1

    private fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun save(context: Context, state: WidgetState) {
      prefs(context).edit()
        .putString(KEY_TASK_ID, state.taskId)
        .putString(KEY_ACTION_TITLE, state.actionTitle)
        .putFloat(KEY_REMAINING_SECONDS, state.remainingSecondsAtPush.toFloat())
        .putLong(KEY_PUSHED_AT, state.pushedAtEpochMs)
        .putBoolean(KEY_PAUSED, state.paused)
        .putString(KEY_NEXT_TITLE, state.nextScheduledTaskTitle)
        .putString(KEY_NEXT_TIME, state.nextScheduledTaskTime)
        .putInt(KEY_NEXT_DURATION, state.nextScheduledTaskDurationMinutes ?: NO_DURATION)
        .putBoolean(KEY_NEXT_OVERDUE, state.nextScheduledTaskIsOverdue)
        .apply()
    }

    fun load(context: Context): WidgetState {
      val p = prefs(context)
      val duration = p.getInt(KEY_NEXT_DURATION, NO_DURATION)
      return WidgetState(
        taskId = p.getString(KEY_TASK_ID, "") ?: "",
        actionTitle = p.getString(KEY_ACTION_TITLE, "") ?: "",
        remainingSecondsAtPush = p.getFloat(KEY_REMAINING_SECONDS, 0f).toDouble(),
        pushedAtEpochMs = p.getLong(KEY_PUSHED_AT, 0L),
        paused = p.getBoolean(KEY_PAUSED, false),
        nextScheduledTaskTitle = p.getString(KEY_NEXT_TITLE, null),
        nextScheduledTaskTime = p.getString(KEY_NEXT_TIME, null),
        nextScheduledTaskDurationMinutes = if (duration == NO_DURATION) null else duration,
        nextScheduledTaskIsOverdue = p.getBoolean(KEY_NEXT_OVERDUE, false)
      )
    }
  }
}
