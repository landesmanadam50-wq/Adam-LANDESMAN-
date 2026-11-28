import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/dynamicPlanningConfirmScreen.test.ts
 *
 * ARCHI -- Rolling Dynamic Planning task, spec sections 1-4: source-text
 * regression guard for live/DynamicPlanningConfirmScreen.tsx (route
 * /tasks/[id]/plan-next) and its thin route wrapper -- same convention
 * as live/taskMoveConfirmationScreen.test.ts (notifee/expo-router pull
 * in react-native, so this screen is never imported directly here).
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const screen = readSource("live/DynamicPlanningConfirmScreen.tsx");
const route = readSource("app/tasks/[id]/plan-next.tsx");
const layout = readSource("app/_layout.tsx");

test("the route is registered and wires id straight through as precedingTaskId", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/plan-next"/);
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/DynamicPlanningConfirmScreen\.tsx["']/);
  assert.ok(route.includes("DynamicPlanningConfirmScreen precedingTaskId={id}"));
});

test("reload() re-resolves resolveDynamicPlanningAction completely fresh every time -- never trusts a notification's own stale snapshot -- against today's real scheduled plan and today's real To-Do list", () => {
  assert.ok(screen.includes('import { resolveDynamicPlanningAction } from "../arc/dynamicPlanning.ts";'));
  assert.ok(screen.includes('import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";'));
  const fnIndex = screen.indexOf("const reload = useCallback");
  const fnBody = screen.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("Promise.all([resolveTodaysScheduledPlan(now), loadTasks()]).then(([plan, tasks]) => {"));
  assert.ok(fnBody.includes("resolveDynamicPlanningAction(plan, todos, preceding, null)"));
});

test("required scenario (app fully closed / cold open): reload runs on every focus via useFocusEffect, never only on first mount", () => {
  assert.ok(screen.includes("useFocusEffect(reload);"));
});

test("when the preceding task can no longer be found in today's plan (removed/moved out), the screen shows a plain 'already planned' state with only a back button -- never crashes, never offers a stale action", () => {
  const fnIndex = screen.indexOf('if (!decision || decision.action === "none") {');
  assert.ok(fnIndex >= 0);
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes('router.replace("/")'));
});

test("required (spec section 3, the actual conversion): confirming writes isTodoItem:false plus the edited scheduledTime/expectedDurationMinutes onto the EXACT SAME Task record -- never a second/duplicate task -- then runs the full recompute chain and lands on Home", () => {
  const fnIndex = screen.indexOf("async function handleConfirm");
  const fnBody = screen.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes('if (!decision || decision.action !== "confirm_next_todo" || !decision.candidate || applying) return;'));
  assert.ok(fnBody.includes("await upsertTask({ ...decision.candidate.task, isTodoItem: false, scheduledTime: time, expectedDurationMinutes: duration, updatedAt: now.toISOString() });"));
  assert.ok(fnBody.includes("await recomputeEverything(now);"));
  assert.ok(fnBody.includes('router.replace("/");'));
});

test("confirming validates the edited start time (HH:MM) and duration (positive number) BEFORE writing anything -- an invalid draft shows errors and never calls upsertTask", () => {
  const fnIndex = screen.indexOf("async function handleConfirm");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("if (!SCHEDULED_TIME_PATTERN.test(time)) validationErrors.push"));
  assert.ok(fnBody.includes("if (!Number.isFinite(duration) || duration <= 0) validationErrors.push"));
  assert.ok(fnBody.includes("if (validationErrors.length > 0) return;"));
});

test("the recompute chain reuses the EXACT SAME sequence live/TaskMoveConfirmationScreen.tsx's own handleApplyMove already uses (reconcile alarms, then every notification kind, dynamic-planning last) -- never a parallel/partial recompute for this feature", () => {
  const fnIndex = screen.indexOf("async function recomputeEverything");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('const { reconcileTaskAlarms } = await import("../data/taskAlarm.ts");'));
  assert.ok(fnBody.includes("await reconcileTaskAlarms(now);"));
  assert.ok(fnBody.includes("await recomputeTaskNotStartedNotification(now);"));
  assert.ok(fnBody.includes("await recomputeReplanTimeNotification(now);"));
  assert.ok(fnBody.includes("await recomputeTaskMemoryReminderNotification(now);"));
  assert.ok(fnBody.includes("await recomputeFreeTimeWindowNotification(now);"));
  assert.ok(fnBody.includes("await recomputeDynamicPlanningNotification(now);"));
});

test("required (spec section 1, 'move an existing To-Do into the gap'): handleMoveIntoGap sets todoPinnedAfterTaskId to THIS preceding task on the chosen To-Do's own record, recomputes the dynamic-planning notification, then reloads IN PLACE (never navigates away) -- so the screen immediately re-renders as 'confirm_next_todo' for it, satisfying the rolling-chain requirement even for the very first step", () => {
  const fnIndex = screen.indexOf("async function handleMoveIntoGap");
  const fnBody = screen.slice(fnIndex, screen.indexOf("function handleAddNewTodo"));
  assert.ok(fnBody.includes("await upsertTask({ ...todo.task, todoPinnedAfterTaskId: precedingTaskId, updatedAt: now.toISOString() });"));
  assert.ok(fnBody.includes("await recomputeDynamicPlanningNotification(now);"));
  assert.ok(fnBody.includes("reload();"));
  assert.ok(!fnBody.includes("router.replace") && !fnBody.includes("router.push"), "moving a To-Do into the gap must stay on this same screen, never navigate away");
});

test("required (spec section 1, 'add new To-Do tasks'): the add-new action opens the EXISTING task editor (never a second creation form), prefilled as a To-Do already pinned into this exact gap", () => {
  const fnIndex = screen.indexOf("function handleAddNewTodo");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: "new", isTodoItem: "1", todoPinnedAfterTaskId: precedingTaskId } });'));
});

test("required (spec section 6, skipping planning must always stay possible): handleSkip records a dismissal keyed by (dateLocal, precedingTaskId, followingTaskId) through the EXISTING arc/freeTimeWindowDismissal.ts list -- never a second, parallel dismissal mechanism -- recomputes, then returns to Home", () => {
  assert.match(screen, /import \{ recordFreeTimeWindowDismissal \} from "\.\.\/arc\/freeTimeWindowDismissal\.ts";/);
  assert.ok(!screen.includes("DynamicPlanningDismissal"));
  const fnIndex = screen.indexOf("async function handleSkip");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("recordFreeTimeWindowDismissal(\n      dismissals,\n      dateLocal,\n      { precedingTaskId: decision.precedingEntry.task.id, followingTaskId: decision.window.followingTaskId },\n      now.toISOString()\n    );"));
  assert.ok(fnBody.includes("await saveFreeTimeWindowDismissals(updated);"));
  assert.ok(fnBody.includes("await recomputeDynamicPlanningNotification(now);"));
  assert.ok(fnBody.includes('router.replace("/");'));
});

test("skip is a safe no-op (straight to Home) when there is no real window left to dismiss -- never crashes on a decision that already resolved to nothing", () => {
  const fnIndex = screen.indexOf("async function handleSkip");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("if (!decision || !decision.window) {"));
});

test("required (duplicate-prevention / double-tap guard): confirm, move-into-gap, and skip are all no-ops while a previous action is still applying", () => {
  const confirmIndex = screen.indexOf("async function handleConfirm");
  assert.ok(screen.slice(confirmIndex, confirmIndex + 200).includes("applying) return;"));
  const moveIndex = screen.indexOf("async function handleMoveIntoGap");
  assert.ok(screen.slice(moveIndex, moveIndex + 100).includes("if (applying) return;"));
  const skipIndex = screen.indexOf("async function handleSkip");
  assert.ok(screen.slice(skipIndex, skipIndex + 100).includes("if (applying) return;"));
});

test("never builds a parallel reorder UI: wider To-Do priority reordering stays build/TimePlanningModal.tsx's own job -- this screen never imports or renders it", () => {
  assert.ok(!screen.includes("import TimePlanningModal") && !screen.includes("<TimePlanningModal"));
});
