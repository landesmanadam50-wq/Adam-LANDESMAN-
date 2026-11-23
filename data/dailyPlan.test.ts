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

test("resolveNextScheduledTaskDisplay keeps its exact exported name and signature (activeTaskId, now) so every existing call site -- live/ActiveTaskScreen.tsx, build/FlexibleDailyScreen.tsx -- needed zero edits", () => {
  assert.match(
    source,
    /export async function resolveNextScheduledTaskDisplay\(activeTaskId: string \| null, now: Date = new Date\(\)\): Promise<NextScheduledTaskDisplay \| null>/
  );
});

test("resolveNextScheduledTaskDisplay builds today's To-Do list and layers it onto the scheduled plan via resolveCurrentTaskStateWithTodoSuggestion, passing activeTaskId through so a task never reports itself as its own next/current task", () => {
  const fnMatch = source.match(/export async function resolveNextScheduledTaskDisplay[\s\S]*?\n}\n/);
  assert.ok(fnMatch, "resolveNextScheduledTaskDisplay function body not found");
  const fnBody = fnMatch[0];
  assert.ok(fnBody.includes("const todoEntries = resolveTodoList(tasks, dateLocal);"));
  assert.ok(
    fnBody.includes("const withSuggestion = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todoEntries, now, null, activeTaskId);")
  );
});

test("resolveNextScheduledTaskDisplay prioritizes a due-now/overdue/upcoming FIXED task over any To-Do suggestion, via resolveMostUrgentScheduledEntry -- so a fixed task whose window has started but has no TaskTimerRun yet is shown, never silently skipped past", () => {
  const fnMatch = source.match(/export async function resolveNextScheduledTaskDisplay[\s\S]*?\n}\n/);
  assert.ok(fnMatch);
  const fnBody = fnMatch[0];
  assert.ok(fnBody.includes("const dueNow = resolveMostUrgentScheduledEntry(withSuggestion);"));
  assert.ok(fnBody.includes("if (dueNow) {"));
  assert.ok(fnBody.includes("return { task: dueNow.task, effectiveStartTime: dueNow.effectiveStartTime, isOverdue: dueNow === withSuggestion.overdue[0] };"));
});

test("resolveNextScheduledTaskDisplay falls back to the To-Do suggestion -- never overdue, since a To-Do item has no fixed clock window to be late against -- only when nothing fixed is due/overdue/upcoming", () => {
  const fnMatch = source.match(/export async function resolveNextScheduledTaskDisplay[\s\S]*?\n}\n/);
  assert.ok(fnMatch);
  const fnBody = fnMatch[0];
  assert.ok(fnBody.includes("if (withSuggestion.todoSuggestion?.entry) {"));
  assert.ok(fnBody.includes("return { task: withSuggestion.todoSuggestion.entry.task, effectiveStartTime: null, isOverdue: false };"));
  assert.ok(fnBody.includes("return null;"));
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
