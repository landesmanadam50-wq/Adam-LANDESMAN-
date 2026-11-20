import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/dailyVisualization.test.ts
 *
 * Daily Visualization task: source-text regression guard for this
 * module's AsyncStorage-backed orchestration -- same convention as
 * every other data/*.test.ts file (AsyncStorage isn't a callable mock
 * under a plain `node --test` run). The pure step/progress/scheduling
 * logic itself is fully exercised in arc/dailyVisualization.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/dailyVisualization.ts");
const storageModule = readSource("data/storage.ts");

test("loadOrStartDailyVisualizationSession resumes an in-progress record for TODAY via resolveResumableProgress before ever snapshotting a fresh task list -- resuming never re-snapshots", () => {
  const fnIndex = module_.indexOf("export async function loadOrStartDailyVisualizationSession");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("resolveResumableProgress(existingProgress, todayDateLocal)"));
  const resumeIndex = fnBody.indexOf("if (resumable) {");
  const snapshotIndex = fnBody.indexOf("resolveTodaysVisualizationTasks(tasks, completions, now)");
  assert.ok(resumeIndex !== -1 && snapshotIndex !== -1 && resumeIndex < snapshotIndex, "the resume branch must return before the fresh-snapshot code is ever reached");
});

test("loadOrStartDailyVisualizationSession resolves a resumed session's tasks from progress.taskIds directly (never re-deriving today's schedule), safely skipping any task id that no longer exists", () => {
  const fnIndex = module_.indexOf("if (resumable) {");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("resumable.taskIds.map((id) => byId.get(id)).filter((task): task is Task => task !== undefined)"));
});

test("a fresh session snapshots today's tasks ONCE into progress.taskIds and persists immediately, and computes startedLate from the alarm's own stored scheduledFor via isVisualizationStartedLate", () => {
  const fnIndex = module_.indexOf("const todaysTasks = resolveTodaysVisualizationTasks");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("isVisualizationStartedLate(alarmFireAt, now)"));
  assert.ok(fnBody.includes("await saveDailyVisualizationDailyProgress(progress);"));
});

test("bypassDailyVisualizationForToday creates today's own record (even if none ever existed) rather than requiring the exercise to have been opened first, and never calls any task-deleting function", () => {
  const fnIndex = module_.indexOf("export async function bypassDailyVisualizationForToday");
  const fnBody = module_.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("createDailyVisualizationDailyProgress(todayDateLocal, [], now.toISOString(), false)"));
  assert.ok(!module_.includes("deleteTask("), "this module must never delete a Task");
});

test("isDailyVisualizationNeededNow is the single shared check -- both the startup overlay and the required-before-tasks gate call this same function, never two separately-derived definitions of 'done for today'", () => {
  assert.match(module_, /export async function isDailyVisualizationNeededNow\(now: Date = new Date\(\)\): Promise<boolean> \{\s*const progress = await loadDailyVisualizationDailyProgress\(\);\s*return !isDailyVisualizationDoneForToday\(progress, todayLocalDateString\(now\)\);\s*\}/);
});

// Nine Functional Improvements task, Improvement 6: a deliberately SEPARATE, narrower check for the Home entry's manual re-open -- "skipping means not now", so bypassed must not read as done here.
test("isDailyVisualizationCompletedNow wraps isDailyVisualizationCompletedForToday (completed ONLY), never isDailyVisualizationDoneForToday (completed OR bypassed) -- the Home entry's own re-open check must never conflate 'skipped' with 'completed'", () => {
  assert.match(module_, /export async function isDailyVisualizationCompletedNow\(now: Date = new Date\(\)\): Promise<boolean> \{\s*const progress = await loadDailyVisualizationDailyProgress\(\);\s*return isDailyVisualizationCompletedForToday\(progress, todayLocalDateString\(now\)\);\s*\}/);
});

test("the end-of-day feeling/movement profile is stored under its OWN dedicated key (archi.dailyVisualizationProfile.v1), completely separate from the Manifest's own long-term futureBodyMovement field -- saving one can never overwrite the other", () => {
  assert.match(storageModule, /const DAILY_VISUALIZATION_PROFILE_KEY = "archi\.dailyVisualizationProfile\.v1";/);
  assert.ok(!storageModule.includes('const DAILY_VISUALIZATION_PROFILE_KEY = "archi.purposeManifests'), "must never share the Manifest's own storage key");
  assert.ok(!module_.includes("futureBodyMovement"), "data/dailyVisualization.ts must never read or write the Manifest's own long-term body-movement field");
  assert.ok(!module_.includes('from "./purposeManifest.ts"'), "this module must never import the Manifest storage module -- the two movements are saved and loaded through entirely separate paths");
});

test("saveDailyVisualizationFeelingAndMovement writes ONLY the Daily Visualization profile (desiredFeeling/bodyMovement for the end of THIS day) -- it never touches any PurposeManifest record or its own long-term futureBodyMovement", () => {
  const fnIndex = module_.indexOf("export async function saveDailyVisualizationFeelingAndMovement");
  const fnBody = module_.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("await saveDailyVisualizationProfile(profile);"));
  assert.ok(!fnBody.includes("saveManifest") && !fnBody.includes("upsertPurposeManifest"));
});

test("resolveLateStartConflictsForSession only runs the real conflict detection when the session itself was flagged startedLate -- an on-time start is never flagged, matching 'only require schedule editing when there is a genuine conflict'", () => {
  const fnIndex = module_.indexOf("export function resolveLateStartConflictsForSession");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("if (!session.progress.startedLate) return [];"));
  assert.ok(fnBody.includes("detectLateStartConflicts(session.tasks, completedAt)"));
});
