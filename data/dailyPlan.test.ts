import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/dailyPlan.test.ts
 *
 * "הסדר של המשימות צריך לעקוב אחרי הזמן ... [ו]סדר המשימות בטו דו ליסט"
 * (floating-overlay/Task-LIVE/"current task" sync task): source-text
 * regression guard for data/dailyPlan.ts's resolveNextScheduledTaskDisplay,
 * which was broadened to read through resolveMostUrgentScheduledEntry +
 * resolveCurrentTaskStateWithTodoSuggestion instead of only picking the
 * chronologically-next untouched entry. Same convention as every other
 * data/*.test.ts file (data/taskAlarm.test.ts, data/floatingTimerOverlay.test.ts,
 * data/emotionalCheckInRouting.test.ts): this module depends on
 * data/storage.ts's AsyncStorage-backed loaders, so it isn't executed
 * directly with `node --test` -- the real DECISION logic it composes
 * (arc/dailyPlan.ts's resolveMostUrgentScheduledEntry, arc/todoList.ts's
 * resolveCurrentTaskStateWithTodoSuggestion) already has its own genuine,
 * fully-executed unit tests in arc/dailyPlan.test.ts and arc/todoList.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const source = readSource("data/dailyPlan.ts");

test("resolveNextScheduledTaskDisplay imports resolveMostUrgentScheduledEntry and resolveCurrentTaskState from arc/dailyPlan.ts -- the one central current/overdue/next decision, never a second independent pick", () => {
  assert.match(source, /import \{[^}]*\bresolveMostUrgentScheduledEntry\b[^}]*\} from "\.\.\/arc\/dailyPlan\.ts";/);
  assert.match(source, /import \{[^}]*\bresolveCurrentTaskState\b[^}]*\} from "\.\.\/arc\/dailyPlan\.ts";/);
});

test("resolveNextScheduledTaskDisplay imports resolveCurrentTaskStateWithTodoSuggestion and resolveTodoList from arc/todoList.ts -- the SAME To-Do fallback data/taskCubeData.ts's cube already uses, never a second To-Do priority calculation", () => {
  assert.match(source, /import \{[^}]*\bresolveCurrentTaskStateWithTodoSuggestion\b[^}]*\} from "\.\.\/arc\/todoList\.ts";/);
  assert.match(source, /import \{[^}]*\bresolveTodoList\b[^}]*\} from "\.\.\/arc\/todoList\.ts";/);
});

test("resolveNextScheduledTaskDisplay keeps its exact exported name, and takes a 3rd activeRun parameter (default null) so every existing call site -- live/ActiveTaskScreen.tsx, build/FlexibleDailyScreen.tsx, data/taskCubeData.ts -- can thread through the real TaskTimerRun", () => {
  assert.match(
    source,
    /export async function resolveNextScheduledTaskDisplay\(\s*activeTaskId: string \| null,\s*now: Date = new Date\(\),\s*activeRun: TaskTimerRun \| null = null\s*\): Promise<NextScheduledTaskDisplay \| null>/
  );
});

test("resolveNextScheduledTaskDisplay builds today's To-Do list and layers it onto the scheduled plan via resolveCurrentTaskStateWithTodoSuggestion, passing BOTH the real activeRun and activeTaskId through so a task never reports itself as its own next/current task, and a DIFFERENT task's stale status field can never hijack this slot either", () => {
  const fnMatch = source.match(/export async function resolveNextScheduledTaskDisplay[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "resolveNextScheduledTaskDisplay function body not found");
  const fnBody = fnMatch[0];
  assert.ok(fnBody.includes("const todoEntries = resolveTodoList(tasks, dateLocal);"));
  assert.ok(
    fnBody.includes("const withSuggestion = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todoEntries, now, activeRun, activeTaskId);"),
    "must thread the real activeRun parameter through -- never a hardcoded null, which would let a stale status==='active' field on a different task win this slot regardless of its own scheduled time (the exact reported floating-timer/Task-LIVE/next-task desync bug)"
  );
});

test("resolveNextScheduledTaskDisplay prioritizes a current/overdue FIXED task above all else -- a task whose window has started but has no TaskTimerRun yet is still shown, never silently skipped past", () => {
  const fnMatch = source.match(/export async function resolveNextScheduledTaskDisplay[\s\S]*?\n}\n/);
  assert.ok(fnMatch);
  const fnBody = fnMatch[0];
  assert.ok(fnBody.includes("if (withSuggestion.current) {"));
  assert.ok(fnBody.includes("return { task: withSuggestion.current.task, effectiveStartTime: withSuggestion.current.effectiveStartTime, isOverdue: false };"));
  assert.ok(fnBody.includes("const overdue = withSuggestion.overdue[0] ?? null;"));
  assert.ok(fnBody.includes("if (overdue) {"));
  assert.ok(fnBody.includes("return { task: overdue.task, effectiveStartTime: overdue.effectiveStartTime, isOverdue: true };"));
});

test("resolveNextScheduledTaskDisplay surfaces a To-Do item that FITS in the free gap before the next fixed task ahead of that fixed task itself -- never checking resolveMostUrgentScheduledEntry's own 'next' fallback first, which would make the To-Do suggestion dead code on any day with a later fixed task", () => {
  const fnMatch = source.match(/export async function resolveNextScheduledTaskDisplay[\s\S]*?\n}\n/);
  assert.ok(fnMatch);
  const fnBody = fnMatch[0];
  assert.ok(!fnBody.includes("resolveMostUrgentScheduledEntry("), "must not re-check resolveMostUrgentScheduledEntry before the To-Do suggestion");
  assert.ok(fnBody.includes("const suggestion = withSuggestion.todoSuggestion;"));
  assert.ok(fnBody.includes('if (suggestion?.entry && (suggestion.reason === "fits" || suggestion.reason === "split_suggested")) {'));
  assert.ok(fnBody.includes("return { task: suggestion.entry.task, effectiveStartTime: null, isOverdue: false };"));
});

test("resolveNextScheduledTaskDisplay falls back to the next fixed task itself when no To-Do item fits the gap (reason 'top_priority_does_not_fit'/'no_todo_items' still carry a non-null entry but mean nothing is actionable now), and to null when there is no next fixed task either", () => {
  const fnMatch = source.match(/export async function resolveNextScheduledTaskDisplay[\s\S]*?\n}\n/);
  assert.ok(fnMatch);
  const fnBody = fnMatch[0];
  assert.ok(fnBody.includes("if (withSuggestion.next) {"));
  assert.ok(fnBody.includes("return { task: withSuggestion.next.task, effectiveStartTime: withSuggestion.next.effectiveStartTime, isOverdue: false };"));
  assert.ok(fnBody.includes("return null;"));
});

test("resolveCurrentAndNextTaskForTransition returns a (current, next) pair through the exact same priority chain as resolveNextScheduledTaskDisplay, with `next` always the next FIXED task regardless of where `current` came from, and takes the same 3rd activeRun parameter (default null) threaded straight into resolveCurrentTaskStateWithTodoSuggestion", () => {
  const fnMatch = source.match(/export async function resolveCurrentAndNextTaskForTransition[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "resolveCurrentAndNextTaskForTransition function body not found");
  const fnBody = fnMatch[0];
  assert.match(
    source,
    /export async function resolveCurrentAndNextTaskForTransition\(\s*excludeTaskId: string \| null,\s*now: Date = new Date\(\),\s*activeRun: TaskTimerRun \| null = null\s*\): Promise<\{ current: Task \| null; next: Task \| null \}>/
  );
  assert.ok(
    fnBody.includes("const withSuggestion = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todoEntries, now, activeRun, excludeTaskId);"),
    "must thread the real activeRun parameter through -- never a hardcoded null"
  );
  assert.ok(fnBody.includes("const next = withSuggestion.next?.task ?? null;"));
  assert.ok(fnBody.includes("if (withSuggestion.current) return { current: withSuggestion.current.task, next };"));
  assert.ok(fnBody.includes("if (overdue) return { current: overdue.task, next };"));
  assert.ok(fnBody.includes("return { current: suggestion.entry.task, next };"));
  assert.ok(fnBody.includes("if (withSuggestion.next) return { current: withSuggestion.next.task, next: null };"));
  assert.ok(fnBody.includes("return { current: null, next: null };"));
});

test("every data/dailyPlan.ts call site that reaches resolveCurrentTaskStateWithTodoSuggestion threads a real, caller-resolved activeRun -- never a bare hardcoded `null` literal in that call's 4th argument position, which was the exact root cause of the floating-timer/Task-LIVE/next-task desync bug (a stale status==='active' field on an unrelated, hours-away task silently winning the 'next' slot)", () => {
  assert.ok(
    !/resolveCurrentTaskStateWithTodoSuggestion\(scheduled, todoEntries, now, null,/.test(source),
    "no call site in this file may hardcode a null activeRun into resolveCurrentTaskStateWithTodoSuggestion"
  );
});

test("resolveMostUrgentScheduledTask (the Task LIVE / To-Do / Flexible Day 'jump to or auto-start now' lookup) is untouched by this broadening -- still composed from resolveTodaysScheduledPlan + arc/dailyPlan.ts's own resolveCurrentTaskState/resolveMostUrgentScheduledEntry, with a real caller-supplied activeRun, never hardcoded null", () => {
  const fnMatch = source.match(/export async function resolveMostUrgentScheduledTask\([\s\S]*?\n}\n/);
  assert.ok(fnMatch, "resolveMostUrgentScheduledTask function body not found");
  const fnBody = fnMatch[0];
  assert.ok(fnBody.includes("const scheduled = await resolveTodaysScheduledPlan(now);"));
  assert.ok(fnBody.includes("const state = resolveCurrentTaskState(scheduled, now, activeRun, excludeTaskId);"));
  assert.ok(fnBody.includes("return resolveMostUrgentScheduledEntry(state);"));
});

test("resolveTodaysScheduledPlan (the shared five-call IO pipeline underneath both exports) is unchanged by this task -- tasks/overrides/completions/weekdaySettings/dateModeOverrides -> resolveEffectiveScheduleMode -> resolveDailyPlan -> applyScheduleMode", () => {
  const fnMatch = source.match(/export async function resolveTodaysScheduledPlan[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "resolveTodaysScheduledPlan function body not found");
  const fnBody = fnMatch[0];
  assert.ok(fnBody.includes("loadTasks(),"));
  assert.ok(fnBody.includes("loadTaskOccurrenceOverrides(),"));
  assert.ok(fnBody.includes("loadTaskOccurrenceCompletions(),"));
  assert.ok(fnBody.includes("loadWeeklyScheduleModeSettings(),"));
  assert.ok(fnBody.includes("loadDailyScheduleModeOverrides(),"));
  assert.ok(fnBody.includes("const plan = resolveDailyPlan(tasks, overrides, completions, dateLocal, dateObj);"));
  assert.ok(fnBody.includes("return applyScheduleMode(plan, effectiveMode);"));
});
