import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/activeTaskScreen.todoSplit.test.ts
 *
 * Smart To-Do List task, section 6: source-text regression guard for the
 * split-task start/complete flow threaded through app/tasks/[id].tsx and
 * live/ActiveTaskScreen.tsx's performStart/handleComplete -- not callable
 * from a plain `node --test` run (React Native component, same convention
 * as every other screen test). The pure recordTodoSplitProgress logic is
 * exercised directly in arc/tasks.test.ts, and the suggestion engine in
 * arc/todoList.test.ts; this file covers only the LIVE wiring around them.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");
const route = readSource("app/tasks/[id].tsx");

test("required test 12 (split duration threading): app/tasks/[id].tsx reads splitMinutes from its route params and passes it through to ActiveTaskScreen as a number, never a raw string", () => {
  assert.match(route, /splitMinutes\?:\s*string;/);
  assert.ok(route.includes("splitMinutes={splitMinutes ? Number(splitMinutes) : null}"));
});

test("ActiveTaskScreen accepts splitMinutes as an optional prop defaulting to null, so every pre-existing call site (no split) is unaffected", () => {
  assert.match(screen, /splitMinutes = null,/);
  assert.match(screen, /splitMinutes\?:\s*number \| null;/);
});

test("required test 12 continued: performStart computes isTodoSplit ONLY when the task is itself a To-Do item AND a splitMinutes value was actually supplied -- never for an ordinary scheduled/one-off task even if splitMinutes were somehow present, and never for a To-Do item started without a split", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  const fnBody = screen.slice(fnIndex, fnIndex + 9100);
  assert.ok(fnBody.includes("const isTodoSplit = task.isTodoItem && splitMinutes !== null;"));
});

test("required test 12 continued: when isTodoSplit, the TaskTimerRun is created for EXACTLY splitMinutes -- never the task's full expectedDurationMinutes -- so the timer only ever runs for the confirmed split chunk", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  // Window widened (8500 -> 9000): the BodySensation task's own
  // markSupportiveBodySensationUsagesTaskOutcome call/comment, inserted
  // near the top of performStart, pushed every later line further from fnIndex.
  const fnBody = screen.slice(fnIndex, fnIndex + 9800);
  // ARCHI -- To-Do Bank + Duration/Split Selection task, section 3/4:
  // a pendingSplitSegment (the new "עבודה מחולקת" mode) now outranks
  // isTodoSplit (the "עבודה רציפה" splitMinutes reuse), which still
  // outranks the ordinary task.expectedDurationMinutes fallback.
  assert.ok(
    fnBody.includes(
      "const durationMinutes = firstStage\n      ? firstStage.durationMinutes\n      : pendingSplitSegment\n      ? pendingSplitSegment.durationMinutes\n      : isTodoSplit\n      ? splitMinutes\n      : task.expectedDurationMinutes ?? 25;"
    )
  );
  // Staged tasks still take priority over a split duration -- unaffected by this feature.
  const durationLine = fnBody.slice(fnBody.indexOf("const durationMinutes ="));
  assert.ok(durationLine.startsWith("const durationMinutes = firstStage"));
});

test("required test 8/9 (split session persisted at start): performStart saves a TodoSplitSession for this task/plannedMinutes pair ONLY when isTodoSplit -- an ordinary task start never creates one", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  // Window widened (9100 -> 9600 -> 10400 -> 10700): the BodySensation
  // task's own markSupportiveBodySensationUsagesTaskOutcome call/comment,
  // then ARCHI -- Replan Time task's own recomputeReplanTimeNotification
  // call/comment, both inserted near the top of performStart, pushed
  // every later line further from fnIndex.
  const fnBody = screen.slice(fnIndex, fnIndex + 10700);
  assert.ok(fnBody.includes("if (isTodoSplit) await saveTodoSplitSession(createTodoSplitSession(task.id, splitMinutes));"));
  assert.match(screen, /import\s*\{[^}]*createTodoSplitSession[^}]*\}\s*from\s*["']\.\.\/arc\/todoSplitSession\.ts["']/);
  assert.match(screen, /import\s*\{[^}]*saveTodoSplitSession[^}]*\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
});

test("required test 9 (no duplicate completion record, correct read ordering): handleComplete loads the TodoSplitSession BEFORE clearEndedTimer() runs -- clearEndedTimer's own clearTaskTimerRun() clears this exact single-slot key, so reading it after would always see 'none' and silently fall through to a full, premature completion", () => {
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 3600);
  const loadIndex = fnBody.indexOf("const todoSplitSession = await loadTodoSplitSession();");
  const clearIndex = fnBody.indexOf("await clearEndedTimer();");
  assert.ok(loadIndex !== -1 && clearIndex !== -1 && loadIndex < clearIndex);
  assert.match(screen, /import\s*\{[^}]*loadTodoSplitSession[^}]*\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
});

test("required test 9 continued: handleComplete only treats this as a split-progress completion when the loaded session's own taskId matches the CURRENT task -- a stale/foreign session can never be misapplied", () => {
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 5600);
  assert.ok(fnBody.includes("if (todoSplitSession && todoSplitSession.taskId === task.id) {"));
});

test("required test 9 continued: a split chunk that does NOT finish the task is persisted via recordTodoSplitProgress's own real-elapsed-time calculation (never the planned/requested duration) and navigates straight back to the To-Do list -- no reflection, no reward, no second completion record, and the task simply remains in resolveTodoList's results with its increased todoCompletedMinutes", () => {
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 5600);
  assert.ok(fnBody.includes("const elapsedMinutes = status ? status.elapsedSeconds / 60 : 0;"));
  assert.ok(fnBody.includes("const progressed = recordTodoSplitProgress(task, elapsedMinutes, now);"));
  const branchIndex = fnBody.indexOf('if (progressed.status !== "completed") {');
  assert.ok(branchIndex !== -1);
  const branchBody = fnBody.slice(branchIndex, branchIndex + 200);
  assert.ok(branchBody.includes("await persistTask(progressed);"));
  assert.ok(branchBody.includes('router.replace("/tasks");'));
  assert.ok(branchBody.includes("return;"));
  // Must never call completeTask, appendTaskJournalEntry, or open the reflection screen from inside this branch.
  assert.ok(!branchBody.includes("completeTask("));
});

test("required test 9 continued: when recordTodoSplitProgress's chunk DOES finish the task (the final split session), handleComplete falls through to the EXACT SAME shared completion flow every ordinary task already uses (journal entry, identity-insight check, continuous-routine check, reflect navigation) -- never a second, duplicated completion path", () => {
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 5600);
  assert.ok(fnBody.includes('completedTask = { ...progressed, notificationId: null, notificationScheduledFor: null };'));
  // The split branch sets completedTask and falls through -- it is one of exactly three branches
  // of the same if/else-if/else chain that all converge on a single `await persistTask(completedTask);` below.
  assert.match(screen, /if \(todoSplitSession && todoSplitSession\.taskId === task\.id\) \{[\s\S]*?\} else if \(task\.recurrence\.kind === "recurring"\) \{/);
});

test("recordTodoSplitProgress itself is imported from the pure arc/tasks.ts module -- never reimplemented inline here", () => {
  assert.match(screen, /import\s*\{[^}]*recordTodoSplitProgress[^}]*\}\s*from\s*["']\.\.\/arc\/tasks\.ts["']/);
});

test("Build/To-Do Action-Type Integration task, requirement 5: performStart's linkedAction branch (arc/taskLinkedAction.ts) is checked unconditionally, with no isTodoItem gate -- a To-Do item that was configured with a linkedAction opens the SAME internal action a fixed/weekly task would, through the exact same openLinkedAction() helper", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  // Window widened (13000 -> 13300): ARCHI -- Replan Time task's own
  // recomputeReplanTimeNotification call/comment, inserted near the top
  // of performStart, pushed every later line further from fnIndex.
  const fnBody = screen.slice(fnIndex, fnIndex + 13300);
  assert.ok(fnBody.includes('if (task.linkedAction && task.linkedAction.kind !== "none") {'));
  assert.ok(!fnBody.includes('task.isTodoItem && task.linkedAction'), "linkedAction routing must never be gated by isTodoItem -- it applies identically to every task");
  assert.ok(fnBody.includes("await openLinkedAction(task, task.linkedAction);"));
});

test("Build/To-Do Action-Type Integration task, requirement 5/7: a To-Do item with no duration/split chosen yet is redirected to the duration-selection screen FIRST (handleStart, preserving the existing Smart To-Do List scheduling behavior) -- but the SAME handleStart() call, once splitMinutes/a pending split plan is present, proceeds straight to performStart(), where the linkedAction branch then fires exactly as for any other task. The difference is purely in WHEN performStart runs, never in whether linkedAction is honored.", () => {
  const fnIndex = screen.indexOf("async function handleStart()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (task.isTodoItem && splitMinutes === null && !hasPendingSplitPlan) {"));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/duration", params: { id: task.id } });'));
  assert.ok(fnBody.includes("return;"));
  assert.ok(fnBody.includes("await performStart();"), "once the redirect condition no longer holds, the SAME handleStart() falls through to the real performStart()");
});

test("required test 13 (active task/timer never auto-touched by the suggestion layer): accepting a split suggestion ALWAYS requires this explicit navigation + an explicit 'start' tap -- performStart (and therefore the split session) is never created as a side effect of merely computing or displaying a TodoSuggestion", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  assert.ok(fnIndex !== -1);
  // performStart is reached only through handleStart() (the manual "התחלה" button / autoStart param)
  // and handleBypassVisualizationFromGate() (itself only reachable after handleStart's own gate) --
  // never from reload() or any other effect that runs merely from computing/displaying a suggestion.
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadEndIndex = screen.indexOf("\n  }, [", reloadIndex);
  const reloadBody = screen.slice(reloadIndex, reloadEndIndex);
  assert.ok(!reloadBody.includes("performStart()"));
  assert.match(screen, /async function handleStart\(\) \{[\s\S]*?await performStart\(\);/);
});
