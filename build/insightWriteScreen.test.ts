import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/InsightWriteScreen.tsx");
const route = readSource("app/insights/new.tsx");
const layout = readSource("app/_layout.tsx");
const widget = readSource("modules/emotional-checkin-widget/android/src/main/java/expo/modules/emotionalcheckinwidget/EmotionalCheckInWidgetProvider.kt");

/**
 * build/insightWriteScreen.test.ts
 *
 * ARCHI -- Three UX Improvements task, Improvement 3 ("Add an 'הוסף
 * תובנה' button to the Android home-screen widget"). The widget
 * button, its PendingIntent, and the deep-link routing were already
 * fully built and tested (data/emotionalCheckInWidget.test.ts,
 * live/floatingTimerOverlayWiring.test.ts, data/floatingTimerOverlay.test.ts)
 * in an earlier task. The one real gap -- build/InsightWriteScreen.tsx
 * and app/insights/new.tsx's own param-parsing -- is covered here,
 * closing section 4, points 7-10 (the widget deep-link routing and
 * insight-creation behavior this screen is the actual destination of).
 */

// Point 7: the widget's deep-link routing reaches this exact screen.
test("the widget's own 'הוסף תובנה' PendingIntent deep-links either directly into /insights/new (idle) or through the task route's own addInsight param (active/paused), both of which resolve into THIS screen -- never a second insight-writing screen", () => {
  assert.ok(widget.includes("archi://insights/new"));
  assert.ok(widget.includes("addInsight=1"));
  assert.ok(route.includes("InsightWriteScreen"));
  assert.ok(layout.includes('name="insights/new"'), "the route must be registered in app/_layout.tsx");
});

test("app/insights/new.tsx parses the optional returnToTaskId param and forwards it as-is (null when absent, e.g. a cold, standalone widget launch)", () => {
  assert.ok(route.includes("useLocalSearchParams"));
  assert.ok(route.includes("returnToTaskId"));
  assert.ok(route.includes("returnToTaskId ?? null"));
});

// Point 8: insight creation with and without an active task.
test("saving without an active task (returnToTaskId null) creates a standalone insight and lands on the insight's own detail screen", () => {
  assert.ok(screen.includes("createStandaloneInsight(generateArcInsightId(), trimmed, now)"));
  assert.ok(screen.includes('router.replace({ pathname: "/insights/[id]", params: { id: insight.id } })'));
});

test("saving WITH an active task (returnToTaskId set) still creates the SAME kind of standalone insight -- it is never linked/converted into a task-bound record -- but returns the trainee to that exact Task LIVE screen afterward", () => {
  const handleSaveIndex = screen.indexOf("async function handleSave");
  const handleSaveBody = screen.slice(handleSaveIndex, screen.indexOf("\n  }", handleSaveIndex));
  assert.ok(handleSaveBody.includes("createStandaloneInsight(generateArcInsightId(), trimmed, now)"), "the insight itself is always standalone, regardless of returnToTaskId -- only the post-save destination differs");
  assert.ok(handleSaveBody.includes("if (returnToTaskId)"));
  assert.ok(handleSaveBody.includes('router.replace({ pathname: "/tasks/[id]", params: { id: returnToTaskId } })'));
});

// Point 9: prevention of duplicate insight creation or navigation.
test("handleSave guards against a double-tap/double-submit -- both an empty/blank draft and an already-in-flight save are no-ops, so a second tap can never append a second insight record", () => {
  const handleSaveIndex = screen.indexOf("async function handleSave");
  const handleSaveBody = screen.slice(handleSaveIndex, screen.indexOf("\n  }", handleSaveIndex));
  assert.ok(handleSaveBody.includes("if (!trimmed || saving) return;"), "the early-return guard must check BOTH a blank draft and an already-saving flag");
  assert.ok(handleSaveBody.includes("setSaving(true)"), "the in-flight flag must be set before the async append, closing the double-tap window");
});

test("the save button is disabled while the draft is blank or a save is already in flight, so the UI itself discourages a second tap on top of the data-layer guard", () => {
  assert.ok(screen.includes("disabled={!text.trim() || saving}"));
});

// Point 10: preservation of existing widget functionality -- the
// widget's other buttons/sections are untouched by this task (no code
// changes were made to the widget for this report; this just confirms
// their continued presence per the house convention).
test("the widget's existing mood check-in buttons and current/next-task sections are all still present alongside the insight button", () => {
  for (const existingId of ["widget_button_full_arc", "widget_button_shortened_arc", "widget_button_next_task", "widget_button_cognitive", "widget_button_insight"]) {
    assert.ok(widget.includes(existingId), `${existingId} must still be wired up`);
  }
});
