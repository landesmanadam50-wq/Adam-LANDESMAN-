import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/emotionalCheckInWidget.test.ts
 *
 * Unified Emotional Check-In and Task Postponement System, section 2:
 * source-text regression guard for the local
 * modules/emotional-checkin-widget Expo Module -- the real native
 * AppWidgetProvider/RemoteViews/PendingIntent behavior (does tapping a
 * button on a real home screen actually cold-start ARCHI into the
 * right flow, does the widget survive a real device reboot) cannot
 * run under `node --test` (no Android runtime here at all, let alone
 * one with a real launcher) -- see the final report's own "requires a
 * physical Android device" list. This only verifies the wiring is
 * present and self-consistent: the SAME three choice ids
 * data/emotionalCheckInRouting.ts/app/check-in.tsx expect, the SAME
 * `archi` deep-link scheme the floating overlay already uses, and a
 * genuine <receiver>-based AppWidgetProvider (never a Service,
 * notification, or floating overlay -- the spec's own explicit "do
 * not implement this as" list).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const moduleConfig = JSON.parse(readSource("modules/emotional-checkin-widget/expo-module.config.json"));
const manifest = readSource("modules/emotional-checkin-widget/android/src/main/AndroidManifest.xml");
const providerKt = readSource("modules/emotional-checkin-widget/android/src/main/java/expo/modules/emotionalcheckinwidget/EmotionalCheckInWidgetProvider.kt");
const widgetInfo = readSource("modules/emotional-checkin-widget/android/src/main/res/xml/emotional_checkin_widget_info.xml");
const layout = readSource("modules/emotional-checkin-widget/android/src/main/res/layout/emotional_checkin_widget.xml");
const appJson = JSON.parse(readSource("app.json"));
const checkInRoute = readSource("app/check-in.tsx");

// ARCHI -- Universal ARC Routing, Emotion Identification & Android
// Shortcuts task, requirement 1: the widget PROVIDER itself (this
// AppWidgetProvider receiver) still needs no JS-facing module class of
// its own -- but the module now ALSO registers a SEPARATE module
// class, EmotionalCheckInWidgetModule, purely so the app can prompt
// "add to home screen" (AppWidgetManager.requestPinAppWidget) -- see
// data/emotionalCheckInWidget.test.ts's own dedicated tests below for
// that class's own contract.
test("the local widget module is android-only, and its registered JS-facing module list is exactly the new pin-widget module -- never a second, competing module", () => {
  assert.deepEqual(moduleConfig.platforms, ["android"]);
  assert.deepEqual(moduleConfig.android.modules, ["expo.modules.emotionalcheckinwidget.EmotionalCheckInWidgetModule"]);
});

test("required test: the widget is a genuine native AppWidgetProvider receiver -- never a floating overlay or a notification (the spec's own explicit 'do not implement as' list)", () => {
  assert.ok(manifest.includes('android:name=".EmotionalCheckInWidgetProvider"'));
  assert.ok(manifest.includes('<action android:name="android.appwidget.action.APPWIDGET_UPDATE" />'));
  assert.ok(manifest.includes('android:resource="@xml/emotional_checkin_widget_info"'));
  // Structural check, not a bare substring search -- this manifest's
  // own doc comment legitimately mentions a sibling module's foreground
  // service entry in prose, so a blunt !includes("<service") would
  // false-positive on that very sentence.
  assert.ok(!/<service\b/.test(manifest.replace(/<!--[\s\S]*?-->/g, "")), "this manifest must declare no Service element of its own, outside its doc comment");
  assert.ok(providerKt.includes(": AppWidgetProvider()"));
});

test("required test: the widget's own <receiver> is exported -- required for the launcher (a different app/process) to ever deliver it an update broadcast at all", () => {
  assert.ok(manifest.includes('android:exported="true"'));
});

test("required test: the widget provider info declares home_screen only (never a keyguard widget); clicks are still handled entirely by their own PendingIntents, never by the periodic update alone", () => {
  assert.ok(widgetInfo.includes('android:widgetCategory="home_screen"'));
  assert.ok(widgetInfo.includes('android:initialLayout="@layout/emotional_checkin_widget"'));
});

// ARCHI -- Home-Screen Widget Sync task: content is no longer fully
// static (current/next task info), so updatePeriodMillis is now a
// secondary, best-effort safety net (Android's practical floor,
// ~30 minutes) -- the PRIMARY refresh path is still the explicit
// update() push from JS, never this interval alone.
test("required test: the periodic update is a secondary safety net at Android's practical ~30-minute floor, documented as never a substitute for the explicit push", () => {
  assert.ok(widgetInfo.includes('android:updatePeriodMillis="1800000"'));
  assert.ok(widgetInfo.includes("secondary"));
});

test("required test 1/2: the widget's layout shows the required question text and all three smiley buttons with their own distinct view ids", () => {
  assert.ok(layout.includes("ARCHI — איך אתה מרגיש כרגע?"));
  assert.ok(layout.includes('android:id="@+id/widget_button_full_arc"') && layout.includes("😟"));
  assert.ok(layout.includes('android:id="@+id/widget_button_shortened_arc"') && layout.includes("🙂"));
  assert.ok(layout.includes('android:id="@+id/widget_button_next_task"') && layout.includes("😄"));
});

test("compact RTL-compatible interface: the root layout declares RTL layout direction, and only RemoteViews-safe view types (LinearLayout/TextView) are used", () => {
  assert.ok(layout.includes('android:layoutDirection="rtl"'));
  assert.ok(!/<(EditText|WebView|ScrollView|RecyclerView)/.test(layout), "RemoteViews does not support these view types -- using one would crash the widget host at render time");
});

test("every XML comment in the widget layout is well-formed: no comment body contains a literal '--' -- the XML spec forbids it inside <!-- --> comments, and a real Gradle 'parseReleaseLocalResources' build (not caught by this test suite's own non-XML-parsing checks) fails outright on one. Doc comments in this file must use an em dash (—), never the house '--' convention other (non-XML) source files use.", () => {
  const commentBodies = [...layout.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]);
  assert.ok(commentBodies.length > 0, "sanity check: this file must actually contain comments for this test to mean anything");
  for (const body of commentBodies) {
    assert.ok(!body.includes("--"), `an XML comment body contains a literal '--', which is illegal XML and fails a real build: ${body.slice(0, 120)}`);
  }
});

test("required test 2: each button gets its OWN PendingIntent, built from the SAME archi:// scheme (app.json) and the SAME /check-in route + choice value app/check-in.tsx/data/emotionalCheckInRouting.ts expect", () => {
  assert.equal(appJson.expo.scheme, "archi");
  for (const [viewId, choice] of [
    ["widget_button_full_arc", "full_arc"],
    ["widget_button_shortened_arc", "shortened_arc"],
    ["widget_button_next_task", "next_task"],
  ]) {
    assert.ok(providerKt.includes(`R.id.${viewId}`), `missing PendingIntent wiring for ${viewId}`);
    assert.ok(providerKt.includes(`"${choice}"`), `missing the exact choice value "${choice}" the shared routing module expects`);
  }
  assert.match(providerKt, /Uri\.parse\("archi:\/\/check-in\?choice=\$choice"\)/);
});

test("required test 3 (widget navigation when ARCHI is closed): each PendingIntent targets THIS app's own package via ACTION_VIEW + FLAG_ACTIVITY_NEW_TASK -- the exact same reliable cold-start mechanism modules/floating-timer-overlay's own OverlayService.kt already uses for archi://tasks/$taskId, proven to work from a killed app", () => {
  assert.ok(providerKt.includes("Intent.ACTION_VIEW"));
  assert.ok(providerKt.includes("setPackage(context.packageName)"));
  assert.ok(providerKt.includes("addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)"));
  assert.ok(providerKt.includes("PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE"));
});

test("each of the eight tappable widget actions uses its OWN PendingIntent request code -- never sharing one, which would let Android collapse two choices into the same cached Intent", () => {
  const codes = [...providerKt.matchAll(/REQUEST_CODE_\w+ = (\d+)/g)].map((match) => match[1]);
  assert.equal(
    codes.length,
    8,
    "the 3 original mood buttons plus cognitive/next-task-action/insight/add-task (ARCHI -- Consolidated Implementation Request, Part 13.1) plus positive-event (Positive Memory, Success Recall & Quick Capture task)"
  );
  assert.equal(new Set(codes).size, 8, "all eight request codes must be distinct");
});

test("required test 18 (Android widget behavior after device reboot): onUpdate is the only lifecycle method needed -- the launcher itself re-adds every already-placed widget and re-invokes onUpdate after boot (standard AppWidgetProvider behavior), so no custom boot-completed handling is required or present here", () => {
  assert.ok(providerKt.includes("override fun onUpdate("));
  assert.ok(!providerKt.includes("BOOT_COMPLETED"), "boot handling belongs to the existing alarm-rescheduling path, never duplicated here");
});

test("app/check-in.tsx only accepts the four valid choice values -- a malformed or missing `choice` param never reaches the shared routing module as an invented fifth option", () => {
  assert.ok(checkInRoute.includes('["full_arc", "shortened_arc", "next_task", "urge"]'));
  assert.ok(checkInRoute.includes("VALID_CHOICES.includes(raw as EmotionalCheckInChoice)"));
});

test("the check-in route is registered in app/_layout.tsx", () => {
  const layoutTsx = readSource("app/_layout.tsx");
  assert.match(layoutTsx, /<Stack\.Screen name="check-in"/);
});

// --- ARCHI -- Universal ARC Routing, Emotion Identification & Android
// Shortcuts task, requirement 1: the new pin-widget module (the ONE
// genuinely new native capability this task adds -- "add to home
// screen" without the trainee hunting for the widget manually). ------

const pinModuleKt = readSource(
  "modules/emotional-checkin-widget/android/src/main/java/expo/modules/emotionalcheckinwidget/EmotionalCheckInWidgetModule.kt"
);
const bridgeTs = readSource("data/emotionalCheckInWidget.ts");

test("EmotionalCheckInWidgetModule exposes exactly the two functions the JS bridge needs, both gated on API 26+ (AppWidgetManager.requestPinAppWidget itself requires Android 8.0)", () => {
  assert.ok(pinModuleKt.includes('Name("EmotionalCheckInWidget")'));
  assert.ok(pinModuleKt.includes('Function("isPinWidgetSupported")'));
  assert.ok(pinModuleKt.includes('Function("requestPinWidget")'));
  assert.ok(pinModuleKt.includes("Build.VERSION_CODES.O"));
});

test("requestPinWidget targets the SAME EmotionalCheckInWidgetProvider this module already registers -- never a second, separate widget definition", () => {
  assert.ok(pinModuleKt.includes("ComponentName(context, EmotionalCheckInWidgetProvider::class.java)"));
  assert.ok(pinModuleKt.includes("requestPinAppWidget"));
});

test("requestPinWidget never claims support unconditionally -- it checks isRequestPinAppWidgetSupported (launcher-dependent even on API 26+) before ever calling requestPinAppWidget, and catches a launcher that advertises support but rejects the call anyway", () => {
  assert.ok(pinModuleKt.includes("isRequestPinAppWidgetSupported"));
  assert.match(pinModuleKt, /if \(!appWidgetManager\.isRequestPinAppWidgetSupported\) return false/);
  assert.match(pinModuleKt, /catch \(_: Exception\)/);
});

test("the JS bridge (data/emotionalCheckInWidget.ts) follows the SAME lazy-cached, never-throwing, android-only convention as data/floatingTimerOverlay.ts -- a missing native module or non-android platform resolves to false, never throwing into the settings screen", () => {
  assert.ok(bridgeTs.includes('requireNativeModule("EmotionalCheckInWidget")'));
  assert.ok(bridgeTs.includes('Platform.OS !== "android"'));
  assert.match(bridgeTs, /export async function isHomeScreenWidgetPinSupported[\s\S]{0,200}catch \{\s*return false;/);
  assert.match(bridgeTs, /export async function requestHomeScreenWidgetPin[\s\S]{0,200}catch \{\s*return false;/);
});

// =====================================================================
// ARCHI -- Home-Screen Widget Sync task
//
// Extends the existing native AppWidgetProvider (never a second widget,
// never a React Native view) to mirror the floating cube's own unified
// panel. None of this can run under `node --test` (real AppWidgetHost/
// RemoteViews/Chronometer rendering) -- these remain source-text
// regression guards, same convention as every other test in this file;
// the final report calls out exactly which behaviors still need a real
// device.
// =====================================================================

const providerKtWidgetSync = providerKt;
const widgetModuleKt = pinModuleKt;

// --- 1. All required home-screen widget buttons ---

test("required test 1 (all buttons present): the layout declares all 8 tappable widget elements -- 3 moods, cognitive, current-task section (name+timer), next-task action, insight, and add-task -- each with its own distinct view id", () => {
  for (const id of [
    "widget_button_full_arc",
    "widget_button_shortened_arc",
    "widget_button_next_task",
    "widget_button_cognitive",
    "widget_current_task_section",
    "widget_current_task_title",
    "widget_current_task_timer",
    "widget_next_task_section",
    "widget_next_task_info",
    "widget_button_next_task_action",
    "widget_button_insight",
    "widget_button_add_task",
  ]) {
    assert.ok(layout.includes(`android:id="@+id/${id}"`), `missing view id ${id}`);
  }
  assert.ok(layout.includes("🧠 מחשבה / דחף"));
  assert.ok(layout.includes("עבור למשימה הבאה"));
  assert.ok(layout.includes("💡 הוסף תובנה"));
  assert.ok(layout.includes("➕ הוסף משימה"));
  assert.ok(layout.includes("Chronometer"), "the current-task timer must be a genuine RemoteViews-supported Chronometer, never a plain TextView this provider would need its own tick loop to update");
});

test("required test (preserving recognizable appearance): the original title + 3-mood-button row is unchanged in structure (same ids, same background/padding, same RTL root) -- everything new is additive, below it", () => {
  assert.ok(layout.includes('android:text="ARCHI — איך אתה מרגיש כרגע?"'));
  assert.ok(layout.includes('android:background="@drawable/widget_background"'));
  assert.ok(layout.includes('android:layoutDirection="rtl"'));
  const titleIndex = layout.indexOf("widget_title");
  const cognitiveIndex = layout.indexOf("widget_button_cognitive");
  assert.ok(titleIndex !== -1 && cognitiveIndex !== -1 && titleIndex < cognitiveIndex, "the new rows must come after the original title+mood row, never replace it");
});

test("the 😄 button's own label now reads 'ישר למשימה', matching the floating cube's own current wording (OverlayService.kt's moodDirectTextView) instead of the earlier, now-inconsistent 'מעולה'", () => {
  assert.ok(layout.includes("ישר למשימה"));
  assert.ok(!layout.includes("מעולה"));
});

// --- 2. Correct mood and thought/urge navigation ---

test("required test 2 (correct navigation): the cognitive button dispatches choice=urge -- the SAME combined 'מחשבה / דחף' shortcut destination the floating cube's own urgeTextView already uses, never a second decision layer", () => {
  assert.ok(providerKtWidgetSync.includes("R.id.widget_button_cognitive"));
  assert.ok(providerKtWidgetSync.includes('buildCheckInPendingIntent(context, "urge", REQUEST_CODE_COGNITIVE)'));
});

test("required test 2 continued: the 3 mood buttons still dispatch full_arc/shortened_arc/next_task through the SAME buildCheckInPendingIntent/archi://check-in?choice=... mechanism, completely unchanged by this task", () => {
  for (const [viewId, choice] of [
    ["widget_button_full_arc", "full_arc"],
    ["widget_button_shortened_arc", "shortened_arc"],
    ["widget_button_next_task", "next_task"],
  ]) {
    assert.ok(providerKtWidgetSync.includes(`R.id.${viewId}`));
    assert.ok(providerKtWidgetSync.includes(`"${choice}"`));
  }
});

test("'עבור למשימה הבאה' and 'הוסף תובנה' deep-link with the EXACT same URIs/priority as the floating cube's own openNextTask()/openAddInsight() -- never a second, differently-behaving destination choice", () => {
  assert.ok(providerKtWidgetSync.includes('val uri = if (taskId.isEmpty()) "archi://check-in?choice=next_task" else "archi://tasks/$taskId?nextTask=1"'));
  assert.ok(providerKtWidgetSync.includes('val uri = if (taskId.isEmpty()) "archi://insights/new" else "archi://tasks/$taskId?addInsight=1"'));
});

// --- ARCHI -- Consolidated Implementation Request, Part 13.1: "➕ הוסף
// משימה" -- opens the EXISTING Add Task flow (never a second,
// duplicate task-creation screen/stack), always available regardless
// of idle/active state, same convention as the insight button right
// next to it. ---------------------------------------------------------

test("required test (Part 13.1): '➕ הוסף משימה' deep-links to archi://tasks/new/edit -- the EXACT SAME route (app/tasks/[id]/edit.tsx with id='new') build/TasksListScreen.tsx/build/TodayScreen.tsx's own '+' buttons already navigate to, never a second task-creation screen", () => {
  assert.ok(providerKtWidgetSync.includes('Uri.parse("archi://tasks/new/edit")'));
  const editRoute = readSource("app/tasks/[id]/edit.tsx");
  assert.ok(editRoute.includes("TaskEditorScreen"));
});

test("required test (Part 13.1) continued: the add-task button has its OWN distinct PendingIntent wiring in buildRemoteViews, calling buildAddTaskPendingIntent with no taskId argument -- it is never tied to any particular existing task, unlike the insight/next-task-action buttons right next to it", () => {
  const fnIndex = providerKtWidgetSync.indexOf("private fun buildRemoteViews(");
  const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes("views.setOnClickPendingIntent(R.id.widget_button_add_task, buildAddTaskPendingIntent(context))"));
});

test("required test (Part 13.1) continued: the add-task and insight buttons sit together in one logically-grouped horizontal row, below the existing next-task section -- Part 13.3's 'logical grouping, no overlap', never two separate full-width rows stacked one on the other", () => {
  const rowStart = layout.lastIndexOf("<LinearLayout", layout.indexOf("widget_button_add_task"));
  const rowEnd = layout.indexOf("</LinearLayout>", layout.indexOf("widget_button_insight"));
  const row = layout.slice(rowStart, rowEnd);
  assert.ok(row.includes('android:orientation="horizontal"'));
  assert.ok(row.includes("widget_button_add_task"));
  assert.ok(row.includes("widget_button_insight"));
});

// --- 3. Active vs idle widget states ---

test("required test 3 (idle state): while idle (taskId empty), the current-task section is GONE and the 😄 mood button is VISIBLE -- all 3 original mood smiles still shown, never a fictitious active timer", () => {
  const fnIndex = providerKtWidgetSync.indexOf("private fun buildRemoteViews(");
  const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes("val isIdle = state.taskId.isEmpty()"));
  assert.ok(fnBody.includes('setViewVisibility(R.id.widget_button_next_task, if (isIdle) View.VISIBLE else View.GONE)'));
  assert.ok(fnBody.includes('setViewVisibility(R.id.widget_current_task_section, if (isIdle) View.GONE else View.VISIBLE)'));
});

test("required test 3 continued (active/paused state): while a task session is active/paused (taskId non-empty), the current-task section becomes VISIBLE and the 😄 button is hidden -- mirroring the cube's own currentTaskRowView/moodDirectToTaskView toggle in lockstep, never two independent flags", () => {
  const fnIndex = providerKtWidgetSync.indexOf("private fun buildRemoteViews(");
  const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes("if (!isIdle) {"));
  assert.ok(fnBody.includes("views.setTextViewText(R.id.widget_current_task_title, state.actionTitle)"));
});

// --- 4. Current and next task information ---

test("required test 4 (current task info): the current task's title and a live Chronometer (base computed from the persisted anchor, started only while not paused) are set whenever a session is active", () => {
  const fnIndex = providerKtWidgetSync.indexOf("private fun buildRemoteViews(");
  const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes("val remaining = state.currentRemainingSeconds()"));
  assert.ok(fnBody.includes("val base = SystemClock.elapsedRealtime() + (remaining * 1000).toLong()"));
  assert.ok(fnBody.includes("views.setChronometer(R.id.widget_current_task_timer, base, null, !state.paused)"));
});

test("required test 4 continued (next task info): the next-task section's text comes from the SAME empty-state/overdue-flagging summary convention as the floating cube's own nextScheduledTaskSummaryLine, and its action button is hidden exactly when there's nothing to advance to", () => {
  assert.ok(providerKtWidgetSync.includes('val nextTitle = nextScheduledTaskTitle ?: return "אין משימה נוספת מתוכננת"'));
  const fnIndex = providerKtWidgetSync.indexOf("private fun buildRemoteViews(");
  const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes("views.setTextViewText(R.id.widget_next_task_info, state.nextScheduledTaskSummaryLine())"));
  assert.ok(fnBody.includes("setViewVisibility(R.id.widget_button_next_task_action, if (state.nextScheduledTaskTitle != null) View.VISIBLE else View.GONE)"));
});

// --- 5. Widget updates after task transitions ---

test("required test 5 (updates after transitions): EmotionalCheckInWidgetModule exposes an update() function accepting the widget's own payload shape, and forwards it into WidgetState.pushState -- the ONE write path for all dynamic content", () => {
  assert.ok(widgetModuleKt.includes('Function("update") { payload: EmotionalCheckInWidgetPayload ->'));
  assert.ok(widgetModuleKt.includes("EmotionalCheckInWidgetProvider.pushState("));
});

test("required test 5 continued: pushState persists the new state THEN immediately refreshes every currently-placed widget instance -- never only one or the other", () => {
  const fnIndex = providerKtWidgetSync.indexOf("fun pushState(");
  const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes("WidgetState.save(context, state)"));
  assert.ok(fnBody.includes("refreshAllWidgets(context)"));
});

test("data/floatingTimerOverlay.ts pushes to the widget from the SAME call sites that already push to the cube -- never a new call site added to any screen for this task", () => {
  const overlayModule = readSource("data/floatingTimerOverlay.ts");
  assert.ok(overlayModule.includes('import { updateHomeScreenWidget } from "./emotionalCheckInWidget.ts";'));
});

// --- 6. Safe cold-start navigation ---

test("required test 6 (cold-start safety): every new PendingIntent (cognitive/next-task-action/insight/add-task) uses the EXACT SAME ACTION_VIEW + setPackage + FLAG_ACTIVITY_NEW_TASK + FLAG_UPDATE_CURRENT/FLAG_IMMUTABLE recipe already proven for the 3 original mood buttons and the floating cube", () => {
  for (const fnName of ["buildNextTaskActionPendingIntent", "buildInsightPendingIntent", "buildAddTaskPendingIntent"]) {
    const fnIndex = providerKtWidgetSync.indexOf(`private fun ${fnName}(`);
    assert.ok(fnIndex !== -1, `missing ${fnName}`);
    const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n    }", fnIndex));
    assert.ok(fnBody.includes("Intent.ACTION_VIEW"));
    assert.ok(fnBody.includes("setPackage(context.packageName)"));
    assert.ok(fnBody.includes("addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)"));
    assert.ok(fnBody.includes("PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE"));
  }
});

test("required test 6 continued: onUpdate (the launcher's own callback for a newly-placed widget, a reboot, or the periodic safety-net refresh) reads the SAME persisted WidgetState rather than showing a blank/default placeholder", () => {
  const fnIndex = providerKtWidgetSync.indexOf("override fun onUpdate(");
  const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("val state = WidgetState.load(context)"));
  assert.ok(fnBody.includes("buildRemoteViews(context, state)"));
});

test("WidgetState is persisted to SharedPreferences (survives this provider's own process death/reboot, never only an in-memory field)", () => {
  assert.ok(providerKtWidgetSync.includes('private const val PREFS_NAME = "emotional_checkin_widget_state"'));
  assert.ok(providerKtWidgetSync.includes("fun save(context: Context, state: WidgetState)"));
  assert.ok(providerKtWidgetSync.includes("fun load(context: Context): WidgetState"));
});

// --- 7. Correct handling of overdue tasks ---

test("required test 7 (overdue handling): WidgetState carries nextScheduledTaskIsOverdue and flags it in its own summary line -- a past task is never shown as plain upcoming", () => {
  assert.ok(providerKtWidgetSync.includes("val nextScheduledTaskIsOverdue: Boolean = false"));
  const fnIndex = providerKtWidgetSync.indexOf("fun nextScheduledTaskSummaryLine()");
  const fnBody = providerKtWidgetSync.slice(fnIndex, providerKtWidgetSync.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('if (nextScheduledTaskIsOverdue) parts.add("⚠ באיחור")'));
});

test("the widget payload's nextScheduledTaskIsOverdue flows from EmotionalCheckInWidgetModule's Function(\"update\") straight into the persisted WidgetState, never dropped", () => {
  const fnIndex = widgetModuleKt.indexOf('Function("update")');
  const fnBody = widgetModuleKt.slice(fnIndex, widgetModuleKt.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes("nextScheduledTaskIsOverdue = payload.nextScheduledTaskIsOverdue"));
});

// --- 8. Consistency between the widget and the floating cube ---

test("required test 8 (widget/cube consistency): the widget's own EmotionalCheckInWidgetPayload mirrors the cube's FloatingTimerOverlayPayload field names exactly (taskId/actionTitle/remainingSeconds/paused/nextScheduledTask*), and data/emotionalCheckInWidget.ts builds it directly from that SAME payload object -- never a second, independently-shaped/resolved state", () => {
  assert.ok(widgetModuleKt.includes("class EmotionalCheckInWidgetPayload : Record {"));
  for (const field of ["taskId", "actionTitle", "remainingSeconds", "paused", "nextScheduledTaskTitle", "nextScheduledTaskTime", "nextScheduledTaskDurationMinutes", "nextScheduledTaskIsOverdue"]) {
    assert.ok(widgetModuleKt.includes(field), `widget payload is missing field ${field}`);
  }
  assert.ok(bridgeTs.includes("export async function updateHomeScreenWidget(payload: FloatingTimerOverlayPayload)"));
  assert.ok(bridgeTs.includes("taskId: payload.taskId"));
  assert.ok(bridgeTs.includes("actionTitle: payload.actionTitle"));
});

test("updateHomeScreenWidget is best-effort/non-throwing, same convention as every other export in this bridge", () => {
  assert.match(bridgeTs, /export async function updateHomeScreenWidget[\s\S]{0,700}catch \{/);
});

// --- 9. Preservation of existing data and functionality ---

test("required test 9 (no regressions): the widget's pre-existing pin-to-home-screen contract (isPinWidgetSupported/requestPinWidget) and its underlying AppWidgetProvider receiver registration are completely untouched by this task", () => {
  assert.ok(widgetModuleKt.includes('Function("isPinWidgetSupported")'));
  assert.ok(widgetModuleKt.includes('Function("requestPinWidget")'));
  assert.ok(providerKtWidgetSync.includes("class EmotionalCheckInWidgetProvider : AppWidgetProvider() {"));
  assert.ok(manifest.includes('android:name=".EmotionalCheckInWidgetProvider"'));
});

test("required test 9 continued: the widget stays a single native AppWidgetProvider -- never a second widget definition, never a React-Native-only view standing in for it", () => {
  assert.deepEqual(moduleConfig.android.modules, ["expo.modules.emotionalcheckinwidget.EmotionalCheckInWidgetModule"]);
  assert.ok(!/<service\b/.test(manifest.replace(/<!--[\s\S]*?-->/g, "")));
});

test("the periodic updatePeriodMillis safety net is documented as secondary (never a substitute for the explicit push), and the practical minimum interval is used rather than an unrealistic sub-30-minute value", () => {
  assert.ok(widgetInfo.includes('android:updatePeriodMillis="1800000"'));
  assert.ok(widgetInfo.includes("safety net"));
});
