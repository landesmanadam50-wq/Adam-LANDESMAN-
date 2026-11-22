import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskSyncActionSelector.test.ts
 *
 * Weekly/Flexible-Daily/ARC-LIVE task-sync fix: source-text regression
 * guard for live/NewArcLiveScreen.tsx's renderActionSelector() and
 * resolveMinutesUntilNextTask(), matching this codebase's own
 * established convention for screens with no React Native renderer --
 * the real DECISION logic (arc/dailyPlan.ts's resolveCurrentTaskState)
 * has its own genuine, fully-executed unit tests in arc/dailyPlan.test.ts.
 * This file only guards that the screen reads through that ONE central
 * function -- never a second, competing lookup -- and renders the
 * required current-vs-next labels and empty state.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");

test("renderActionSelector resolves current/next through the ONE central resolveCurrentTaskState (via its Smart To-Do List wrapper, resolveCurrentTaskStateWithTodoSuggestion, which calls it UNCHANGED), never the superseded resolveNextScheduledTaskAfter/isScheduledPlanEntryOverdue pair", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.ok(fnBody.includes("resolveCurrentTaskStateWithTodoSuggestion(dailyPlanEntries, todoEntries, nowDate, null, taskId)"));
  assert.ok(!fnBody.includes("resolveNextScheduledTaskAfter("), "must never call the superseded lookup");
  assert.ok(!fnBody.includes("isScheduledPlanEntryOverdue("), "must never call the superseded overdue check");
});

test("renderActionSelector shows the genuinely active/current entry labeled 'המשימה כרגע', and only falls back to the nearest not-yet-started entry labeled 'המשימה הקרובה' when nothing is current", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.ok(fnBody.includes("{currentEntry && ("));
  assert.ok(fnBody.includes("המשימה כרגע"));
  assert.ok(fnBody.includes("{!currentEntry && nextEntry && ("));
  assert.ok(fnBody.includes("המשימה הקרובה"));
});

test("renderActionSelector shows an explicit 'nothing left today' message instead of silently showing nothing when neither current nor next exists", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.ok(fnBody.includes("{!currentEntry && !nextEntry && ("));
  assert.ok(fnBody.includes("אין משימות נוספות מתוכננות להיום."));
});

test("renderActionSelector's own 'other scheduled tasks today' list excludes whichever entry is already shown as current/next, never double-listing it", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.ok(fnBody.includes("const shownEntryId = currentEntry?.task.id ?? nextEntry?.task.id ?? null;"));
  assert.ok(fnBody.includes("const laterCandidates = shownEntryId ? candidates.filter((entry) => entry.task.id !== shownEntryId) : candidates;"));
});

test("resolveMinutesUntilNextTask (the temporary-action duration clamp) is now a one-line wrapper around arc/dailyPlan.ts's own exported resolveFreeMinutesUntilNextTask (promoted there so arc/todoList.ts's smart-fit engine shares the exact same computation), so it never clamps against an already-elapsed task", () => {
  const fnIndex = screen.indexOf("function resolveMinutesUntilNextTask(");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("resolveFreeMinutesUntilNextTask(scheduled, now, excludeTaskId)"));
});

// --- Smart To-Do List task, section 9: ARC LIVE action-selection sync with the To-Do engine ---

test("required test 6 (due scheduled task always wins): renderActionSelector reads todoSuggestion from the SAME resolveCurrentTaskStateWithTodoSuggestion call -- it is never computed/looked-up a second way", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 3000);
  assert.ok(fnBody.includes("todoSuggestion,"), "todoSuggestion must be destructured from the one central call");
  assert.ok(!fnBody.includes("resolveRecommendedTodoAction("), "must never call the lower-level suggestion function directly, bypassing the wrapper's due-task-always-wins guarantee");
});

test("required test 12 (ARC LIVE action-selection display): the To-Do suggestion block, when shown, displays the suggested task's name, first action, recommended duration, and the reason for the suggestion -- all 4 required pieces", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  const blockIndex = fnBody.indexOf("{!currentEntry && todoSuggestion?.entry && (");
  assert.ok(blockIndex >= 0);
  const blockBody = fnBody.slice(blockIndex, fnBody.indexOf("{!currentEntry && nextEntry && (", blockIndex));
  assert.ok(blockBody.includes("{todoSuggestion.entry.task.title}"), "suggested task name");
  assert.ok(blockBody.includes("פעולה ראשונה: ${todoSuggestion.entry.task.firstAction}"), "first action");
  assert.ok(blockBody.includes("משך מוצע: ${todoSuggestion.suggestedDurationMinutes} דק'"), "recommended duration");
  assert.ok(blockBody.includes("todoSuggestionReasonText[todoSuggestion.reason]"), "the reason for the suggestion");
});

test("the To-Do suggestion block sits ABOVE the existing 'המשימה הקרובה' (next scheduled task) block, so the next scheduled task's own display is reused verbatim, never replaced", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  const suggestionIndex = fnBody.indexOf("{!currentEntry && todoSuggestion?.entry && (");
  const nextEntryIndex = fnBody.indexOf("{!currentEntry && nextEntry && (");
  assert.ok(suggestionIndex >= 0 && nextEntryIndex > suggestionIndex);
});

test("a due scheduled task (currentEntry non-null) suppresses the To-Do suggestion block entirely -- !currentEntry gates it, matching resolveCurrentTaskStateWithTodoSuggestion's own 'current always wins' guarantee", () => {
  const fnIndex = screen.indexOf("function renderActionSelector() {");
  const fnBody = screen.slice(fnIndex, fnIndex + 9000);
  assert.match(fnBody, /\{!currentEntry && todoSuggestion\?\.entry && \(/);
});

test("accepting the suggestion (chooseTodoSuggestion) is just another 'scheduledTask' selection with the SAME shape every other option already uses -- taskId/title/firstAction from the suggested entry's own task -- and threads splitDurationMinutes ONLY when the suggestion is itself a split, never the full remaining duration otherwise", () => {
  const fnIndex = screen.indexOf("function chooseTodoSuggestion() {");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes('source: "scheduledTask"'));
  assert.ok(fnBody.includes("taskId: todoSuggestion.entry.task.id"));
  assert.ok(fnBody.includes("title: todoSuggestion.entry.task.title"));
  assert.ok(fnBody.includes("firstAction: todoSuggestion.entry.task.firstAction?.trim() || null"));
  assert.ok(fnBody.includes("splitDurationMinutes: todoSuggestion.isSplit ? todoSuggestion.suggestedDurationMinutes : null"));
});

test("required test 13 (real-time recompute): reload() loads todoEntries via data/todoList.ts's resolveTodaysTodoList, the SAME IO wrapper build/FlexibleDailyScreen.tsx's own reload() uses -- never a second, independently-resolved To-Do list", () => {
  assert.match(screen, /import \{ resolveTodaysTodoList \} from "\.\.\/data\/todoList\.ts";/);
  const reloadIndex = screen.indexOf("const reload = useCallback(() => {");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 1500);
  assert.ok(reloadBody.includes("resolveTodaysTodoList(nowDate),"));
  assert.ok(reloadBody.includes("setTodoEntries(todoList);"));
});

test("required test 10 (a To-Do task never silently becomes a scheduled task): accepting a To-Do suggestion still navigates through the SAME routeToTaskOrArcResultSuggestion path every other scheduled-task selection uses -- never a direct scheduling write", () => {
  const scheduledIndex = screen.indexOf('if (session?.selectedActionSource === "scheduledTask"');
  const temporaryIndex = screen.indexOf('if (session?.selectedActionSource === "temporaryAction"');
  const branchBody = screen.slice(scheduledIndex, temporaryIndex);
  assert.ok(branchBody.includes("routeToTaskOrArcResultSuggestion(session.selectedActionTaskId, false, session.selectedActionDurationMinutes)"));
  assert.ok(!branchBody.includes("upsertTask("), "must never write a scheduledTime/scheduling field onto the To-Do task itself");
});
