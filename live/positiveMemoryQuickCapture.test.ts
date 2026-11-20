import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/positiveMemoryQuickCapture.test.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, Stage C (quick
 * capture from the floating cube and the Android home-screen widget):
 * source-text regression guard for both native entry points and the
 * JS-side deep-link consumer. No React Native component test renderer
 * exists in this codebase, and the native sources are Kotlin, so this
 * checks the real source text, same convention as every other
 * screen/native-module test in this codebase.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const overlayKt = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/OverlayService.kt");
const widgetXml = readSource("modules/emotional-checkin-widget/android/src/main/res/layout/emotional_checkin_widget.xml");
const widgetProviderKt = readSource("modules/emotional-checkin-widget/android/src/main/java/expo/modules/emotionalcheckinwidget/EmotionalCheckInWidgetProvider.kt");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const taskRoute = readSource("app/tasks/[id].tsx");

test("section 3A: the floating cube's expanded panel gets a '✨ הוסף אירוע חיובי' row, added to the SAME expandedContent container as every other action row", () => {
  assert.ok(overlayKt.includes('text = "✨ הוסף אירוע חיובי"'));
  const expandedContentIndex = overlayKt.indexOf("val expandedContent = LinearLayout(this).apply {");
  const expandedContentBody = overlayKt.slice(expandedContentIndex, expandedContentIndex + 400);
  assert.ok(expandedContentBody.includes("addView(positiveEventTextView)"));
});

test("section 3A: a dedicated, source-level tap debounce guards this new action, same convention as every other tappable region", () => {
  assert.ok(overlayKt.includes("private const val ADD_POSITIVE_EVENT_TAP_DEBOUNCE_MS = 1500L"));
  assert.ok(overlayKt.includes("private var lastPositiveEventTapAtMs: Long = 0L"));
  const fnIndex = overlayKt.indexOf("private fun openAddPositiveEvent()");
  const fnBody = overlayKt.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("if (now - lastPositiveEventTapAtMs < ADD_POSITIVE_EVENT_TAP_DEBOUNCE_MS) return"));
});

test("section 3A/14: while a task is active/paused, the cube deep-links with addPositiveEvent=1 (preserving task context); while idle, it opens the entry screen directly -- never finishing/resetting the active task", () => {
  const fnIndex = overlayKt.indexOf("private fun openAddPositiveEvent()");
  const fnBody = overlayKt.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes('val uri = if (taskId.isEmpty()) "archi://positive-memories/new" else "archi://tasks/$taskId?addPositiveEvent=1"'));
});

test("section 3A: the tap dispatcher hit-tests and routes to the new action, without disturbing any pre-existing region's own dispatch order", () => {
  assert.ok(overlayKt.includes("positiveEventView: View,"));
  assert.ok(overlayKt.includes("var downOnPositiveEvent = false"));
  assert.ok(overlayKt.includes("downOnPositiveEvent = isPointInsideView(view, positiveEventView, event.x, event.y)"));
  assert.ok(overlayKt.includes("} else if (downOnPositiveEvent) {\n            openAddPositiveEvent()"));
});

test("section 3B: the Android widget layout gets its own always-visible '✨ הוסף אירוע חיובי' button, and every XML comment stays well-formed (no literal '--')", () => {
  assert.ok(widgetXml.includes('android:id="@+id/widget_button_positive_event"'));
  assert.ok(widgetXml.includes('android:text="✨ הוסף אירוע חיובי"'));
  const commentBodies = [...widgetXml.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]);
  for (const body of commentBodies) {
    assert.ok(!body.includes("--"), `XML comment body must never contain a literal '--': ${body.slice(0, 80)}`);
  }
});

test("section 3B: the widget provider wires the new button to its own PendingIntent, with the same idle/active destination convention as the insight button", () => {
  assert.ok(widgetProviderKt.includes("private const val REQUEST_CODE_POSITIVE_EVENT = 1008"));
  assert.ok(widgetProviderKt.includes("views.setOnClickPendingIntent(R.id.widget_button_positive_event, buildPositiveEventPendingIntent(context, state.taskId))"));
  const fnIndex = widgetProviderKt.indexOf("private fun buildPositiveEventPendingIntent(");
  const fnBody = widgetProviderKt.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('val uri = if (taskId.isEmpty()) "archi://positive-memories/new" else "archi://tasks/$taskId?addPositiveEvent=1"'));
  assert.ok(fnBody.includes("REQUEST_CODE_POSITIVE_EVENT"));
});

test("live/ActiveTaskScreen.tsx accepts addPositiveEvent, defaulting to false, and the auto-action effect opens the entry screen with returnToTaskId -- never finishing/canceling/resetting the active task", () => {
  assert.match(activeTaskScreen, /addPositiveEvent = false,/);
  assert.match(activeTaskScreen, /addPositiveEvent\?: boolean;/);
  const fnIndex = activeTaskScreen.indexOf("if (addPositiveEvent) {");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes('router.push({ pathname: "/positive-memories/new", params: { returnToTaskId: task.id } });'));
  assert.ok(activeTaskScreen.includes("addPositiveEvent, taskId]);"), "addPositiveEvent must be in the effect's own dependency array");
});

test("app/tasks/[id].tsx reads addPositiveEvent from the URL and threads it straight through, same convention as addInsight", () => {
  assert.ok(taskRoute.includes("addPositiveEvent"));
  assert.ok(taskRoute.includes('addPositiveEvent={addPositiveEvent === "1"}'));
});
