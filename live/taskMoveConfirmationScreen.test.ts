import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskMoveConfirmationScreen.test.ts
 *
 * ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
 * section 2/3: source-text regression guard for
 * live/TaskMoveConfirmationScreen.tsx (route /tasks/[id]/move-confirm)
 * -- approving (or cycling) a later-today window to move an overdue,
 * not-started task into, writing TODAY'S Flexible Daily schedule ONLY.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const screen = readSource("live/TaskMoveConfirmationScreen.tsx");
const route = readSource("app/tasks/[id]/move-confirm.tsx");
const layout = readSource("app/_layout.tsx");

test("the route is registered and wires taskId straight through", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/move-confirm"/);
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/TaskMoveConfirmationScreen\.tsx["']/);
  assert.ok(route.includes("TaskMoveConfirmationScreen taskId={id}"));
});

test("reload() reuses resolveTodaysScheduledPlan -- the SAME pipeline the notification itself used -- so the screen can never disagree with what was offered, then recomputes free-time windows excluding the task's own slot", () => {
  assert.ok(screen.includes('import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";'));
  const fnIndex = screen.indexOf("const reload = useCallback");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("resolveTodaysScheduledPlan(now).then((scheduled) => {"));
  assert.ok(fnBody.includes("const windows = resolveFreeTimeWindows(scheduled, found.task.id);"));
  assert.ok(fnBody.includes("resolveFreeTimeWindowsAfter(windows, nowMinutes, found.task.expectedDurationMinutes ?? 0)"));
});

test("candidates and selectedIndex are purely local/ephemeral state -- no persisted store of their own, so 'pick a different window' is just moving an index and cancelling writes nothing", () => {
  assert.ok(screen.includes("const [selectedIndex, setSelectedIndex] = useState(0);"));
  assert.ok(!screen.includes("saveTaskMoveConfirmation") && !screen.includes("MoveConfirmationState"), "no new persisted state for this screen's own selection");
  const fnIndex = screen.indexOf("function handlePickDifferentWindow");
  const fnBody = screen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("setSelectedIndex((index) => (index + 1) % candidates.length);"));
});

test("cancel is a pure router.back() with no storage write -- the move stays re-offerable, never recorded as a decline (that's Section 1's own, separate dismissal surface)", () => {
  const fnIndex = screen.indexOf("function handleCancel");
  const fnBody = screen.slice(fnIndex, fnIndex + 150);
  assert.ok(fnBody.includes("router.back();"));
  assert.ok(!fnBody.includes("upsertTask") && !fnBody.includes("Override") && !fnBody.includes("Dismissal"));
});

test("an empty candidate list renders a plain empty state with only a cancel action -- no approve button offered when there is nothing to approve", () => {
  const fnIndex = screen.indexOf("if (candidates.length === 0) {");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("לא נמצא חלון זמן פנוי מתאים היום"));
  assert.ok(fnBody.includes("onPress={handleCancel}"));
  assert.ok(!fnBody.includes("handleApplyMove"));
});

test("approving a WEEKLY-origin task writes a TaskOccurrenceOverride for today's date ONLY, snapshotting the existing override first -- never touching the recurring weekly template", () => {
  assert.ok(screen.includes('import { buildTaskOccurrenceOverride, findTaskOccurrenceOverride } from "../arc/taskOccurrenceOverride.ts";'));
  const fnIndex = screen.indexOf("async function handleApplyMove");
  const fnBody = screen.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes('if (entry.origin === "weekly") {'));
  assert.ok(fnBody.includes("const existing = findTaskOccurrenceOverride(entry.task.id, entry.occurrenceDateLocal, overrides);"));
  assert.ok(fnBody.includes("buildTaskOccurrenceOverride(entry.task, entry.occurrenceDateLocal, existing, { scheduledTime: newTime }, now.toISOString())"));
});

test("approving a ONE-OFF task edits the Task's own scheduledTime field directly instead -- never a TaskOccurrenceOverride for a task that has no template to diverge from", () => {
  const fnIndex = screen.indexOf("async function handleApplyMove");
  const fnBody = screen.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("} else {"));
  assert.ok(fnBody.includes("await upsertTask({ ...entry.task, scheduledTime: newTime, updatedAt: now.toISOString() });"));
});

test("the new time is always the selected candidate window's own start minute -- overlap with a neighbor is impossible by construction, since that candidate already came from a filtered free window", () => {
  const fnIndex = screen.indexOf("async function handleApplyMove");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("const candidate = candidates[selectedIndex];"));
  assert.ok(fnBody.includes("const newTime = formatMinutesToClockTime(candidate.startMinutes);"));
});

test("after applying the move, alarms and BOTH notification kinds are recomputed, then navigation lands on Home -- whose own reload() already resyncs the floating overlay/widget/notification unconditionally on every focus, so no third sync call is needed here", () => {
  const fnIndex = screen.indexOf("async function handleApplyMove");
  const fnBody = screen.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes('const { reconcileTaskAlarms } = await import("../data/taskAlarm.ts");'));
  assert.ok(fnBody.includes("await reconcileTaskAlarms(now);"));
  assert.ok(fnBody.includes("await recomputeTaskNotStartedNotification(now);"));
  assert.ok(fnBody.includes("await recomputeFreeTimeWindowNotification(now);"));
  assert.ok(fnBody.includes('router.replace("/");'));
});

test("a double-tap on approve is guarded -- handleApplyMove is a no-op while already applying", () => {
  const fnIndex = screen.indexOf("async function handleApplyMove");
  const fnBody = screen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("if (!entry || applying || candidates.length === 0) return;"));
});
