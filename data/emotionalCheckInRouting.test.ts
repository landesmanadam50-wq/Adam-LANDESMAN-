import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/emotionalCheckInRouting.test.ts
 *
 * Unified Emotional Check-In and Task Postponement System: this module
 * depends on expo-router's `router` and data/storage.ts's AsyncStorage-
 * backed loaders, so (same convention as data/taskAlarm.test.ts and
 * data/floatingTimerOverlay.test.ts) it isn't executed directly with
 * `node --test` -- this is a source-text regression guard for the
 * wiring itself. The real DECISION logic it calls into
 * (arc/tasks.ts's findActiveTask, arc/dailyPlan.ts's
 * resolveNextActionableTask) has its own genuine, fully-executed unit
 * tests in arc/tasks.test.ts and arc/dailyPlan.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/emotionalCheckInRouting.ts");

test("required test 4 (Full ARC routing): openFullArc opens the EXISTING /tasks/[id]/arc route with spontaneous=1 -- the exact same route the Home-screen's own Full Spontaneous ARC and live/SpontaneousArcEntryScreen.tsx's standalone button already use, never a second ARC implementation", () => {
  const fnIndex = module_.indexOf("export async function openFullArc(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('const params: Record<string, string> = { id, spontaneous: "1" };'));
  assert.ok(fnBody.includes('navigateTo({ pathname: "/tasks/[id]/arc", params }, options);'));
});

test("required test 5 (Shortened ARC routing): openShortenedArc opens the SAME /tasks/[id]/arc route with shortened=1 -- never a manually-created Mini ARC, never a second engine", () => {
  const fnIndex = module_.indexOf("export async function openShortenedArc(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('const params: Record<string, string> = { id, shortened: "1" };'));
  assert.ok(fnBody.includes('navigateTo({ pathname: "/tasks/[id]/arc", params }, options);'));
});

test("required test 6 (Next Task selection): resolveAndOpenNextTask checks an already-active task FIRST, before ever resolving today's Flexible Daily Timetable", () => {
  const fnIndex = module_.indexOf("export async function resolveAndOpenNextTask(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\nexport ", fnIndex + 50));
  const activeCheckIndex = fnBody.indexOf("findActiveTask(tasks)");
  const planIndex = fnBody.indexOf("resolveDailyPlan(");
  assert.ok(activeCheckIndex !== -1 && planIndex !== -1 && activeCheckIndex < planIndex, "the active-task short-circuit must be checked before the daily plan is ever resolved");
});

test("required test 6 continued: a next task found in the daily plan is opened WITHOUT autoStart -- 'open the task without automatically starting its timer'", () => {
  assert.ok(!module_.includes('autoStart: "1"'), "this module must never pass autoStart -- opening a task here is never the same as starting it");
  // ARCHI -- ARC Result task, section 4: resolved real tasks now go
  // through navigateToTaskOrArcResultSuggestion (which itself opens
  // "/tasks/[id]" verbatim when no result is linked -- see the
  // dedicated ARC Result tests below), never a bare navigateTo call.
  assert.ok(module_.includes("await navigateToTaskOrArcResultSuggestion(next.task.id, options);"));
});

test("required test 6 continued: when no active task and no actionable entry exists, falls back to Home ('/') -- today's own planning screen, never a dead end", () => {
  const fnIndex = module_.indexOf("export async function resolveAndOpenNextTask(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('navigateTo("/", options)'));
});

test("required test 6 continued: resolveAndOpenNextTask resolves the SAME Flexible Daily Timetable recipe (tasks/overrides/completions/weekday settings/date overrides -> resolveDailyPlan -> applyScheduleMode) that build/FlexibleDailyScreen.tsx's own reload() already uses -- never a second, parallel 'what's next' engine", () => {
  assert.ok(module_.includes("resolveEffectiveScheduleMode(weekday, dateLocal, weekdaySettings, dateModeOverrides)"));
  assert.ok(module_.includes("resolveDailyPlan(tasks, overrides, completions, dateLocal, dateObj)"));
  assert.ok(module_.includes("applyScheduleMode(plan, effectiveMode)"));
  assert.ok(module_.includes("resolveNextActionableTask(scheduled)"));
});

test("required test 14 (no duplicated ARC sessions): Full/Shortened ARC both route through the ONE existing /tasks/[id]/arc screen -- this module never constructs or writes a NewArcLiveSessionState itself, so the existing resume/conflict logic (live/NewArcLiveScreen.tsx's own reload()) is always what decides resume-vs-fresh, never bypassed", () => {
  assert.ok(!module_.includes("NewArcLiveSessionState"));
  assert.ok(!module_.includes("createNewArcLiveSessionState"));
  assert.ok(!module_.includes("saveNewArcLiveSession"));
});

test("required test 12 (no premature postponement recording) + required test 13 (preserving the smile reward system): this module never records a postponement and never touches the smile-reward state -- choosing a check-in option is never itself a postponement or a reward event", () => {
  assert.ok(!module_.includes("recordPostponement"));
  assert.ok(!module_.includes("postTaskRewards"));
  assert.ok(!module_.includes("PostTaskRewardsState"));
});

test("required test 11 (preserving recurring weekly templates): this module only ever READS weekly schedule-mode settings to resolve today's effective plan -- it never saves/writes the weekly template or weekly schedule-mode settings themselves", () => {
  assert.ok(module_.includes("loadWeeklyScheduleModeSettings"));
  assert.ok(!module_.includes("saveWeeklyScheduleModeSettings"));
  assert.ok(!module_.includes("setWeekdayScheduleMode"));
});

test("required test 16 (preserving active timers): this module never reads or writes a TaskTimerRun -- resolving/opening a route is never itself a pause/resume/stop action; that stays entirely live/ActiveTaskScreen.tsx's/live/NewArcLiveScreen.tsx's own existing job once the target screen itself loads", () => {
  assert.ok(!module_.includes("TaskTimerRun"));
  assert.ok(!module_.includes("loadTaskTimerRun"));
  assert.ok(!module_.includes("saveTaskTimerRun"));
});

test("required test 17 (correct navigation back to Task LIVE): a real taskId passed in (never resolved fresh) is used VERBATIM for Full/Shortened ARC -- the Postponement screen's own known task is never silently swapped for the active/standalone resolution Home and the widget use", () => {
  const fullArcIndex = module_.indexOf("export async function openFullArc(");
  const fullArcBody = module_.slice(fullArcIndex, module_.indexOf("\n}", fullArcIndex));
  assert.ok(fullArcBody.includes("const id = options.arcGymSituationId || options.arcGymMemoryExerciseId ? STANDALONE_ARC_TASK_ID : taskId ?? (await resolveHomeCheckInTaskId());"), "a non-null taskId must short-circuit resolveHomeCheckInTaskId entirely, via ?? (unless this is an ARC GYM session, which always runs standalone)");
});

test("widget navigation (archi://check-in) requests `replace: true` so its own momentary stub screen never duplicates navigation history -- every other caller (Home, Postponement) keeps the ordinary push", () => {
  assert.ok(module_.includes("interface NavigateOptions"));
  assert.ok(module_.includes("router.replace(target);"));
  assert.ok(module_.includes("router.push(target);"));
});

test("resolveHomeCheckInTaskId links to the already-active task when one exists, falling back to the standalone sentinel -- never inventing a task, matching 'preserve the existing active task' and the existing emotion-only standalone completion path", () => {
  const fnIndex = module_.indexOf("export async function resolveHomeCheckInTaskId(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("findActiveTask(tasks)?.id ?? STANDALONE_ARC_TASK_ID"));
});

test("handleEmotionalCheckInChoice is the one shared dispatcher every UI (Home, widget, Postponement, the unified floating panel) calls -- it never branches on WHICH caller invoked it, only on the trainee's own choice", () => {
  const fnIndex = module_.indexOf("export async function handleEmotionalCheckInChoice(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('if (choice === "full_arc") return openFullArc(taskId, options);'), "ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task: 'פחות טוב' opens Full ARC directly again -- the Mini-vs-Full-ARC choice screen is removed, depth is now decided automatically by the new time rating");
  assert.ok(fnBody.includes('if (choice === "shortened_arc") return openShortenedArc(taskId, options);'), "'סבבה' still opens Shortened ARC directly, never the Mini/Full choice");
  assert.ok(fnBody.includes('if (choice === "urge") return openUrgeArc(taskId, options);'), "ARCHI -- Two Additions to the Existing Floating Cube task: the independent 'דחף' choice routes to openUrgeArc, never to Full ARC's own choice/emotion gate");
  assert.ok(fnBody.includes("return resolveAndOpenNextTask(options);"));
});

// --- ARCHI -- Unified Final Specification task, section 1 (combined "מחשבה / דחף" shortcut) ---

test("openUrgeArc opens the SAME /tasks/[id]/arc route as openFullArc (spontaneous=1 -- a fresh, ad-hoc Full ARC session, never a planned draft or a second engine), with exactly one extra param -- skipEmotionSelection=1", () => {
  const fnIndex = module_.indexOf("export async function openUrgeArc(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('const params: Record<string, string> = { id, spontaneous: "1", skipEmotionSelection: "1" };'));
  assert.ok(fnBody.includes('navigateTo({ pathname: "/tasks/[id]/arc", params }, options);'));
});

test("openUrgeArc resolves the id with the EXACT SAME rule openFullArc/openShortenedArc already use -- a real taskId used verbatim (so it's available regardless of whether a task is active, paused, or not started), else resolveHomeCheckInTaskId(), else the ARC GYM standalone override", () => {
  const fnIndex = module_.indexOf("export async function openUrgeArc(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("const id = options.arcGymSituationId ? STANDALONE_ARC_TASK_ID : taskId ?? (await resolveHomeCheckInTaskId());"));
});

// --- ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task ---

test("openMiniOrFullArcChoice is fully removed -- the Mini-vs-Full-ARC choice screen no longer exists as an entry point anywhere", () => {
  assert.ok(!module_.includes("export async function openMiniOrFullArcChoice("));
  assert.ok(!module_.includes("/arc-mini-or-full-choice"));
});

test("openFullArc threads arcGymSituationId/morningFlowCheckIn through to Full ARC's own params, same convention as openShortenedArc", () => {
  const fnIndex = module_.indexOf("export async function openFullArc(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("if (options.arcGymSituationId) params.arcGymSituationId = options.arcGymSituationId;"));
  assert.ok(fnBody.includes('if (options.morningFlowCheckIn) params.morningFlowCheckIn = "1";'));
});

// --- ARC Perspective task ---

test("openFullArc/openShortenedArc both thread arcPerspectiveId through to their own params, same convention as arcFocusPracticeId -- and never force the id to the standalone sentinel on their own (unlike arcGymSituationId/arcGymMemoryExerciseId)", () => {
  for (const fnName of ["export async function openFullArc(", "export async function openShortenedArc("]) {
    const fnIndex = module_.indexOf(fnName);
    const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
    assert.ok(fnBody.includes("if (options.arcPerspectiveId) params.arcPerspectiveId = options.arcPerspectiveId;"));
    assert.ok(
      fnBody.includes("const id = options.arcGymSituationId || options.arcGymMemoryExerciseId ? STANDALONE_ARC_TASK_ID : taskId ?? (await resolveHomeCheckInTaskId());"),
      "arcPerspectiveId must never be added to the standalone-forcing condition"
    );
  }
});

test("5/22. handleArcPerspectiveCheckInChoice forwards the caller's own ALREADY-RESOLVED taskId verbatim to openFullArc/openShortenedArc -- it never re-resolves or overrides it (a real-time practice must keep linking to whichever task was already active; a planned/ARC Gym practice has already been given the standalone sentinel)", () => {
  const fnIndex = module_.indexOf("export async function handleArcPerspectiveCheckInChoice(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('if (choice === "full_arc") return openFullArc(options.taskId, { arcPerspectiveId: options.arcPerspectiveId });'));
  assert.ok(fnBody.includes("return openShortenedArc(options.taskId, { arcPerspectiveId: options.arcPerspectiveId });"));
});
