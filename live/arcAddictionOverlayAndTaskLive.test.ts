/**
 * ARC Addiction × Task LIVE × floating overlay: the waiting timer runs
 * on its own second line, independently of the task timer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAddictionProfile } from "../arc/arcAddiction.ts";
import { createAddictionSession, reduceAddictionSession } from "../arc/arcAddictionFlow.ts";
import { resolveAddictionOverlaySecondary } from "../arc/arcAddictionWaitPlan.ts";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
}

const KT_DIR = "modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay";
const service = read(`${KT_DIR}/OverlayService.kt`);
const module_ = read(`${KT_DIR}/FloatingTimerOverlayModule.kt`);
const bridge = read("data/floatingTimerOverlay.ts");
const sessionService = read("data/arcAddictionSession.ts");
const activeTask = read("live/ActiveTaskScreen.tsx");
const entry = read("live/components/ArcAddictionTaskLiveEntry.tsx");

const T0 = Date.parse("2026-11-27T10:00:00.000Z");
const profile = createAddictionProfile("p1", { name: "חיטוט באוזניים", initialWaitMinutes: 5 }, new Date(T0).toISOString());

test("second line shows only a running wait, with the profile name and the absolute end time", () => {
  const intro = createAddictionSession("e1", profile, "task-1", new Date(T0).toISOString());
  assert.equal(resolveAddictionOverlaySecondary(null), null);
  assert.equal(resolveAddictionOverlaySecondary(intro), null);
  const waiting = reduceAddictionSession(intro, { type: "SKIP_TO_WAIT", initialIntensity: null }, { now: new Date(T0).toISOString(), profile });
  assert.deepEqual(resolveAddictionOverlaySecondary(waiting), { label: "חיטוט באוזניים", endsAtMs: T0 + 5 * 60_000 });
  const decided = reduceAddictionSession(waiting, { type: "END_WAIT_EARLY" }, { now: new Date(T0 + 1000).toISOString(), profile });
  assert.equal(resolveAddictionOverlaySecondary(decided), null);
});

test("native: separate set/clear commands for the second line", () => {
  assert.match(module_, /Function\("setSecondaryTimer"\) \{ label: String, endsAtMs: Double ->/);
  assert.match(module_, /Function\("clearSecondaryTimer"\)/);
  assert.match(service, /const val ACTION_SET_SECONDARY = "setSecondary"/);
  assert.match(service, /const val ACTION_CLEAR_SECONDARY = "clearSecondary"/);
});

test("native: the second-line command returns BEFORE any task field is read from the intent (the two timers never overwrite each other)", () => {
  const onStart = service.slice(service.indexOf("override fun onStartCommand"));
  const branch = onStart.indexOf("handleSecondaryCommand(intent)");
  const firstTaskRead = onStart.indexOf("taskId = intent.getStringExtra(EXTRA_TASK_ID)");
  assert.ok(branch > 0 && branch < firstTaskRead);
  const handler = service.slice(service.indexOf("private fun handleSecondaryCommand"), service.indexOf("private fun secondaryRemainingSeconds"));
  for (const field of ["taskId =", "anchorRemainingSeconds =", "anchorEpochMs =", "paused =", "stopTicking()"]) {
    assert.ok(!handler.includes(field), `second-line handler must not touch ${field}`);
  }
});

test("native: the second line has its own wall-clock countdown and ticker", () => {
  assert.match(service, /\(secondaryEndsAtMs - System\.currentTimeMillis\(\)\) \/ 1000\.0/);
  assert.match(service, /private fun startSecondaryTicking\(\)/);
  assert.match(service, /stopSecondaryTicking\(\)/);
  // the task ticker is untouched by the second line
  const taskTicker = service.slice(service.indexOf("private fun startTicking()"), service.indexOf("private fun stopTicking()"));
  assert.ok(!taskTicker.includes("secondary"));
});

test("native: the second line is visible in collapsed and expanded modes and opens the session", () => {
  assert.match(service, /addView\(pillTextView\)\n\s+addView\(secondaryView\)\n\s+addView\(expandedContent\)/);
  assert.match(service, /archi:\/\/arc-addiction\/session/);
  const up = service.slice(service.indexOf("MotionEvent.ACTION_UP ->"));
  assert.ok(up.indexOf("downOnSecondary") < up.indexOf("} else if (collapsed) {"));
});

test("native: startForeground always runs for the second-line command; a clear-only start stops itself", () => {
  const handler = service.slice(service.indexOf("private fun handleSecondaryCommand"), service.indexOf("private fun secondaryRemainingSeconds"));
  assert.ok(handler.indexOf("startForeground(") < handler.indexOf("stopSelf()"));
  assert.match(handler, /if \(!primaryActive && \(secondaryLabel == null \|\| !canDraw\)\)/);
});

test("JS bridge: optional native methods (older APKs keep working), preference respected, re-applied after the task overlay hides", () => {
  assert.match(bridge, /setSecondaryTimer\?\(label: string, endsAtMs: number\): void;/);
  assert.match(bridge, /native\.setSecondaryTimer\?\.\(timer\.label, timer\.endsAtMs\)/);
  assert.match(bridge, /if \(!preferences\.enabled \|\| !\(await hasFloatingOverlayPermissionAsync\(\)\)\) next = null;/);
  const hide = bridge.slice(bridge.indexOf("export async function hideFloatingTimerOverlay"));
  assert.match(hide.slice(0, 600), /if \(currentSecondaryTimer\) applySecondaryTimer\(currentSecondaryTimer\);/);
});

test("session side effects drive the second line from the stored session", () => {
  assert.match(sessionService, /syncFloatingSecondaryTimer\(resolveAddictionOverlaySecondary\(session\)\)/);
});

test("Task LIVE: entry point with returnToTaskId, active countdown shown, and the task timer is never paused by it", () => {
  assert.match(activeTask, /<ArcAddictionTaskLiveEntry taskId=\{task\.id\} \/>/);
  assert.match(entry, /params: \{ returnToTaskId: taskId \}/);
  assert.match(entry, /getWaitRemainingSeconds\(wait/);
  assert.ok(!entry.includes("handlePause"));
  assert.ok(!entry.includes("TaskTimerRun"));
});
