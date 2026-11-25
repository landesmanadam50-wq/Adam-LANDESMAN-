import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/identityInsightPrompt.test.ts
 *
 * ARC-system upgrade task, Part I ("אם ARC ספונטני מקושר למשימה שעדיין
 * מתבצעת, שאלת אמונת הזהות תופיע רק לאחר שהמשימה הושלמה בפועל"):
 * source-text regression guard for the identity-insight prompt shown at
 * real task completion, gated by a pending marker set only by
 * live/NewArcLiveScreen.tsx's Task/Combined-track handoff -- never for
 * an ordinary task that never went through ARC.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const newArcLiveScreen = readSource("live/NewArcLiveScreen.tsx");
const storage = readSource("data/storage.ts");

test("the pending-identity-insight marker is a single-slot store, exported from data/storage.ts", () => {
  for (const fn of ["loadPendingIdentityInsightTaskId", "savePendingIdentityInsightTaskId", "clearPendingIdentityInsightTaskId"]) {
    assert.match(storage, new RegExp(`export async function ${fn}\\(`));
  }
  assert.match(storage, /const PENDING_IDENTITY_INSIGHT_KEY = "archi\.pendingIdentityInsightTaskId\.v1";/);
});

test("the Task track ('action') marks the pending marker exactly once, via the single shared automatic completion effect -- the old manual 'start now'/'return without timer' menu (and its own two separate call sites) is gone entirely, superseded by Part 5 of the ARCHI Unified 7-Part Update", () => {
  assert.ok(!newArcLiveScreen.includes('if (session!.goalType !== "action")'), "the old manual Task-track menu block is gone -- see the sibling test below for the current single call site");
  const occurrences = newArcLiveScreen.match(/savePendingIdentityInsightTaskId\(taskId\)/g) ?? [];
  assert.equal(occurrences.length, 1, "exactly one call site now -- the automatic completeConsumedRef effect, reached identically whether the trainee's timer auto-starts or not");
});

test("the Combined and Task tracks both mark the pending marker when reaching 'complete' (Mini ARC's 'mini_action' routes the Task track through this shared case too), but the Emotional track never does (it has no identity action)", () => {
  // Part 5 of the ARCHI Unified 7-Part Update moved this check out of
  // the "complete" render case's own button into the automatic
  // completeConsumedRef effect, fired as soon as the session reaches
  // "complete" on its own.
  const completeIndex = newArcLiveScreen.indexOf("const completeConsumedRef = useRef(false);");
  const completeBlock = newArcLiveScreen.slice(completeIndex, completeIndex + 2000);
  assert.ok(completeBlock.includes('if (session.goalType !== "emotion_only") await savePendingIdentityInsightTaskId(taskId);'));
});

test("handleComplete checks the pending marker for THIS exact task id before deciding whether to show the prompt -- never for a different task's marker", () => {
  const fnIndex = activeTaskScreen.indexOf("async function handleComplete()");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 8000);
  assert.ok(fnBody.includes("const pendingTaskId = await loadPendingIdentityInsightTaskId();"));
  assert.ok(fnBody.includes("if (pendingTaskId === task.id) {"));
});

test("finishIdentityInsight always clears the pending marker (but, per the ARC Reminders task's requirement 8, no longer force-navigates to reflect -- it recomputes the one transition notification and stays put, same as handleComplete's own non-continuous ending), and only persists an insight (and optional belief) when NOT skipped and real text was typed", () => {
  const fnIndex = activeTaskScreen.indexOf("async function finishIdentityInsight");
  const fnBody = activeTaskScreen.slice(fnIndex, fnIndex + 1450);
  assert.ok(fnBody.includes("await clearPendingIdentityInsightTaskId();"));
  assert.ok(fnBody.includes("if (!skip && identityInsightDraft.trim()) {"));
  assert.ok(fnBody.includes('beliefKind: "identity"'));
  assert.ok(fnBody.includes("if (identityBeliefDraft.trim()) {"));
  assert.ok(fnBody.includes("await recomputeTaskTransitionNotification(task.id);"));
  assert.ok(!fnBody.includes('router.replace({ pathname: "/tasks/[id]/reflect"'), "must never force-navigate to reflect any more");
});

test("the prompt offers a real skip path, never forcing an answer", () => {
  assert.ok(activeTaskScreen.includes("onPress={() => finishIdentityInsight(true)}"));
  assert.ok(activeTaskScreen.includes(">דלג<"));
});

test("Part F step 10: the prompt shows a reinforcement + gratitude line, right after the identity action actually happened", () => {
  const promptIndex = activeTaskScreen.indexOf("{showIdentityInsightPrompt && (");
  const promptBlock = activeTaskScreen.slice(promptIndex, promptIndex + 500);
  assert.ok(promptBlock.includes("שווה לשים לב שהפעולה הזו קרה. על מה אתה מודה לעצמך כרגע?"));
});

test("the prompt's Continue button is disabled until real text is typed, but the belief field stays optional", () => {
  const promptIndex = activeTaskScreen.indexOf("{showIdentityInsightPrompt && (");
  const promptBlock = activeTaskScreen.slice(promptIndex, promptIndex + 1400);
  assert.ok(promptBlock.includes("disabled={!identityInsightDraft.trim()}"));
  assert.ok(promptBlock.includes("placeholder=\"אמונת זהות מחזקת (רשות) -- אפשר להשאיר ריק\""));
});

test("the normal bottom action row (Complete/Next/Skip) and the 'completed' label are both suppressed while the identity-insight prompt is showing, so they never appear stacked together", () => {
  const index = activeTaskScreen.indexOf("{!showIdentityInsightPrompt && (task.status ===");
  assert.ok(index !== -1);
});

// --- Reflection Appearing Before Task Completion fix ------------------------
//
// Root cause: `showIdentityInsightPrompt` was a bare "set once in
// handleComplete, cleared once in finishIdentityInsight" flag -- never
// reset or re-derived when this screen reloaded (every focus, or a
// taskId change). Two consequences, both now fixed:
//   1. Right after handleComplete cleared the timer and marked the
//      insight pending, the pre-start Start/Postpone block -- the ONE
//      block that never excluded itself on `showIdentityInsightPrompt`,
//      unlike every other post-completion block -- rendered right
//      alongside the reflection question.
//   2. A trainee who left the prompt unanswered (Android Back, app
//      kill, or simply navigating away) would see it resurface on a
//      LATER, otherwise-fresh visit to the task, stacked above its own
//      Start/Postpone buttons -- because nothing ever recomputed
//      whether the prompt was still genuinely warranted.

test("regression 1/2 (no reflection before starting or during an active task): the pre-start Start/Postpone block excludes itself while the identity-insight prompt is showing, exactly like every other post-completion block already does", () => {
  const index = activeTaskScreen.indexOf("{!showIdentityInsightPrompt && !timerRun && !restRun && !timerEnded && !continuationLoop && (");
  assert.ok(index !== -1, "the Start/Postpone block must exclude itself when the identity-insight prompt is showing");
});

test("regression 3 (reflection appears only after actual completion): reload() re-derives showIdentityInsightPrompt from the PERSISTED pending marker compared against the CURRENT taskId on every load/focus -- never a bare flag left over from a previous render or a previous task", () => {
  const reloadIndex = activeTaskScreen.indexOf("const reload = useCallback");
  const reloadBody = activeTaskScreen.slice(reloadIndex, reloadIndex + 3700);
  assert.ok(reloadBody.includes("loadPendingIdentityInsightTaskId()"), "reload's own Promise.all must load the pending marker itself, not assume whatever showIdentityInsightPrompt already was");
  assert.ok(reloadBody.includes("const stillPendingForThisTask = pendingInsightTaskId === taskId;"));
  assert.ok(reloadBody.includes("setShowIdentityInsightPrompt(stillPendingForThisTask);"));
});

test("regression (never invents unsaved draft text): reload() blanks identityInsightDraft/identityBeliefDraft whenever there is no genuinely pending insight for this exact task", () => {
  const reloadIndex = activeTaskScreen.indexOf("const reload = useCallback");
  const reloadBody = activeTaskScreen.slice(reloadIndex, reloadIndex + 3700);
  const guardIndex = reloadBody.indexOf("if (!stillPendingForThisTask) {");
  assert.ok(guardIndex !== -1);
  const guardBody = reloadBody.slice(guardIndex, guardIndex + 150);
  assert.ok(guardBody.includes('setIdentityInsightDraft("");'));
  assert.ok(guardBody.includes('setIdentityBeliefDraft("");'));
});

test("regression (Android Back must never reopen obsolete completion controls): reload() resets taskCompleting/taskCompletingRef/identityInsightFinishingRef on every load -- a completion from an earlier visit is never still considered 'in flight' on a fresh focus", () => {
  const reloadIndex = activeTaskScreen.indexOf("const reload = useCallback");
  const reloadBody = activeTaskScreen.slice(reloadIndex, reloadIndex + 3700);
  assert.ok(reloadBody.includes("taskCompletingRef.current = false;"));
  assert.ok(reloadBody.includes("setTaskCompleting(false);"));
  assert.ok(reloadBody.includes("identityInsightFinishingRef.current = false;"));
});

test("regression (no cross-task leak): the pending-marker comparison uses the route's own `taskId`, never the possibly-stale `task.id` from a previous render -- a marker left pending for a DIFFERENT task can never surface this task's reflection prompt", () => {
  const reloadIndex = activeTaskScreen.indexOf("const reload = useCallback");
  const reloadBody = activeTaskScreen.slice(reloadIndex, reloadIndex + 3700);
  assert.ok(reloadBody.includes("pendingInsightTaskId === taskId"));
  assert.ok(!reloadBody.includes("pendingInsightTaskId === task.id"), "must compare against the route param, never a stale closure over the previous task");
});
