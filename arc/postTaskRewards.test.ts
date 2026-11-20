import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  createInitialPostTaskRewardsState,
  migratePostTaskRewardsState,
  recordPostponement,
  recordTaskCompletion,
  resolveNextStreakReward,
  resolveTaskCompletionEventId,
  rolloverToDate,
} from "./postTaskRewards.ts";
import type { PostTaskRewardsState } from "./postTaskRewards.ts";

const DAY1 = "2026-01-05";
const DAY2 = "2026-01-06";
const DAY3 = "2026-01-07";

function completeOnce(state: PostTaskRewardsState, taskId: string, dateLocal: string) {
  return recordTaskCompletion(state, resolveTaskCompletionEventId(taskId, dateLocal), dateLocal);
}

// --- Feature 2: the progressive smiling-exercise duration formula --------
// Smile Duration Update task: "SmileDuration = BASE + (DayNumber - 1) +
// (CompletedTaskIndex - 1)" -- +1 second per qualifying completion
// (same (DayNumber + CompletedTaskIndex - 1) quantity as before, now
// additive instead of x10), verified against the task's own exact
// example table (base 10 -> 11 -> 12 -> 13).

test("the exact example table: Day1 tasks 1-4 are 10/11/12/13 seconds -- the very first completion ever is exactly the base duration", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  const expected = [10, 11, 12, 13];
  for (let i = 0; i < 4; i++) {
    const outcome = completeOnce(state, `t${i}`, DAY1);
    assert.equal(outcome.smileDurationSeconds, expected[i], `Day1 task ${i + 1}`);
    state = outcome.nextState;
  }
});

test("the exact example table: Day2 tasks 1-4 are 11/12/13/14 seconds -- the daily starting duration increased by 1s, and the per-task index reset to 1", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "d1", DAY1).nextState; // establish the anchor on Day1
  const expected = [11, 12, 13, 14];
  for (let i = 0; i < 4; i++) {
    const outcome = completeOnce(state, `t${i}`, DAY2);
    assert.equal(outcome.smileDurationSeconds, expected[i], `Day2 task ${i + 1}`);
    state = outcome.nextState;
  }
});

test("the exact example table: Day3 tasks 1-4 are 12/13/14/15 seconds", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "d1", DAY1).nextState;
  state = completeOnce(state, "d2", DAY2).nextState;
  const expected = [12, 13, 14, 15];
  for (let i = 0; i < 4; i++) {
    const outcome = completeOnce(state, `t${i}`, DAY3);
    assert.equal(outcome.smileDurationSeconds, expected[i], `Day3 task ${i + 1}`);
    state = outcome.nextState;
  }
});

test("the per-task index resets every new day, but the daily starting duration keeps climbing -- skipping a day (no completions on Day2) still advances DayNumber on Day3 by real calendar distance", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "d1", DAY1).nextState;
  // No completion at all on DAY2 -- the user simply didn't open the app.
  const outcome = completeOnce(state, "d3", DAY3);
  // DayNumber = daysBetween(DAY1, DAY3) + 1 = 2 + 1 = 3; first task of the day: 10 + (3-1) + (1-1) = 12.
  assert.equal(outcome.smileDurationSeconds, 12);
});

test("the smiling-duration progression is never capped -- it keeps growing by exactly 1 second per completion, with no maximum, by design", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  for (let i = 0; i < 50; i++) {
    const outcome = completeOnce(state, `t${i}`, DAY1);
    state = outcome.nextState;
  }
  const last = completeOnce(state, "t-final", DAY1);
  assert.equal(last.smileDurationSeconds, 10 + 50, "the 51st completion of the day must be exactly BASE + 50 seconds, never clamped");
});

// --- Feature 3: the consecutive-completion smile-reward streak -----------

test("the exact example: completing five tasks in one uninterrupted streak earns 1+2+3+4+5 = 15 smiles", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const outcome = completeOnce(state, `t${i}`, DAY1);
    total += outcome.streakRewardSmiles;
    state = outcome.nextState;
  }
  assert.equal(total, 15);
  assert.equal(state.todaySmiles, 15);
  assert.equal(state.totalSmiles, 15, "the lifetime total grows by the same amount, immediately, with no separate settlement step");
});

test("resolveNextStreakReward previews the reward the NEXT completion would earn, without itself advancing anything", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  assert.equal(resolveNextStreakReward(state), 1);
  state = completeOnce(state, "t1", DAY1).nextState;
  assert.equal(resolveNextStreakReward(state), 2);
  state = completeOnce(state, "t2", DAY1).nextState;
  assert.equal(resolveNextStreakReward(state), 3);
});

test("an explicit postponement resets the streak to zero, but previously earned smiles (today's and lifetime) are untouched", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "t1", DAY1).nextState;
  state = completeOnce(state, "t2", DAY1).nextState;
  assert.equal(state.consecutiveStreak, 2);
  assert.equal(state.todaySmiles, 3); // 1 + 2
  assert.equal(state.totalSmiles, 3);
  state = recordPostponement(state, DAY1);
  assert.equal(state.consecutiveStreak, 0);
  assert.equal(state.todaySmiles, 3, "postponement must never claw back smiles already earned today");
  assert.equal(state.totalSmiles, 3, "postponement must never claw back the lifetime total either");
  // The very next completion starts the streak back at 1.
  const outcome = completeOnce(state, "t3", DAY1);
  assert.equal(outcome.streakRewardSmiles, 1);
  assert.equal(outcome.newStreak, 1);
  assert.equal(outcome.totalSmiles, 4, "the lifetime total keeps growing from where it was, never reset by the postponement");
});

test("postponement resets the reward streak but NEVER the physical smiling-duration progression -- the two systems stay independent", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "t1", DAY1).nextState;
  state = completeOnce(state, "t2", DAY1).nextState;
  state = recordPostponement(state, DAY1);
  // smileTaskIndexToday must still be 2 -- postponement never touches it.
  assert.equal(state.smileTaskIndexToday, 2);
  const outcome = completeOnce(state, "t3", DAY1);
  assert.equal(outcome.smileDurationSeconds, 12, "the 3rd smiling exercise of the day (10 + 0 + 2), duration unaffected by the postponement in between");
});

test("duplicate rewards for the same task completion are prevented -- recording the exact same completionEventId twice earns nothing the second time", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  const first = completeOnce(state, "t1", DAY1);
  assert.equal(first.alreadyProcessed, false);
  assert.equal(first.streakRewardSmiles, 1);
  const duplicate = recordTaskCompletion(first.nextState, resolveTaskCompletionEventId("t1", DAY1), DAY1);
  assert.equal(duplicate.alreadyProcessed, true);
  assert.equal(duplicate.streakRewardSmiles, 0, "a duplicate event must never earn a second reward");
  assert.equal(duplicate.newStreak, 1, "the streak must not advance again either");
  assert.equal(duplicate.todaySmiles, 1);
  assert.equal(duplicate.totalSmiles, 1, "a duplicate event must never grow the lifetime total either");
});

test("rest periods and ARC exercises never reset the streak -- only recordPostponement does; simply not calling it (as those flows don't) leaves the streak untouched", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "t1", DAY1).nextState;
  state = completeOnce(state, "t2", DAY1).nextState;
  // Simulate "time passes during a rest/ARC break, same day, no postponement call" -- nothing changes on its own.
  assert.equal(state.consecutiveStreak, 2);
  const outcome = completeOnce(state, "t3", DAY1);
  assert.equal(outcome.newStreak, 3, "the streak must continue growing uninterrupted across a rest/ARC break");
});

// --- Day rollover: no points conversion or settlement, ever ---------------
// Smiles are a positive-reinforcement symbol, not a currency: totalSmiles
// grows the instant each smile is earned (see the streak tests above), and
// a day boundary only ever resets the DAILY fields -- there is nothing left
// to fold, convert, or settle, and so nothing that could be double-awarded.

test("day rollover resets the daily streak and today's smile counter, but the lifetime total survives untouched and unchanged by repeated rollover calls", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "t1", DAY1).nextState;
  state = completeOnce(state, "t2", DAY1).nextState; // todaySmiles = 3, totalSmiles = 3 already (earned immediately)
  assert.equal(state.totalSmiles, 3);
  const rolledOnce = rolloverToDate(state, DAY2);
  assert.equal(rolledOnce.totalSmiles, 3, "the lifetime total is unaffected by the day boundary -- it was already correct");
  assert.equal(rolledOnce.todaySmiles, 0, "the daily counter resets for the new day");
  assert.equal(rolledOnce.consecutiveStreak, 0, "the streak also resets at the start of a new day");
  const rolledAgain = rolloverToDate(rolledOnce, DAY2);
  assert.equal(rolledAgain.totalSmiles, 3, "rolling over to the SAME date again must never change the total (no conversion step to repeat)");
  assert.deepEqual(rolledAgain, rolledOnce);
});

test("the lifetime total carries across a day boundary even when the rollover is triggered via recordTaskCompletion itself, not an explicit rolloverToDate call", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "t1", DAY1).nextState; // 1 smile earned on Day1, already in totalSmiles
  const outcome = completeOnce(state, "t2", DAY2); // first completion of Day2
  assert.equal(outcome.totalSmiles, 2, "Day1's smile plus Day2's own new smile, with no conversion step in between");
  assert.equal(outcome.todaySmiles, 1, "today's counter reflects only Day2's own completion");
  assert.equal(outcome.newStreak, 1, "Day2 starts its own fresh streak");
});

// --- Migration: existing saved reward data must survive the points removal ---

test("migratePostTaskRewardsState converts a legacy points-shaped record to the current smiles-only shape, folding the settled total and today's unsettled points together", () => {
  const legacy = {
    dateLocal: DAY1,
    smileAnchorDateLocal: DAY1,
    smileTaskIndexToday: 2,
    consecutiveStreak: 2,
    todaySmilePoints: 3, // 1 + 2, not yet settled
    totalPoints: 10, // settled from earlier days
    lastSettledDateLocal: "2026-01-04",
    processedCompletionIds: ["t1:2026-01-05", "t2:2026-01-05"],
  };
  const migrated = migratePostTaskRewardsState(legacy) as PostTaskRewardsState;
  assert.equal(migrated.todaySmiles, 3);
  assert.equal(migrated.totalSmiles, 13, "totalSmiles = old totalPoints + old todaySmilePoints -- no smile earned before is lost");
  assert.equal(migrated.dateLocal, DAY1);
  assert.equal(migrated.smileAnchorDateLocal, DAY1);
  assert.equal(migrated.smileTaskIndexToday, 2);
  assert.equal(migrated.consecutiveStreak, 2);
  assert.deepEqual(migrated.processedCompletionIds, ["t1:2026-01-05", "t2:2026-01-05"]);
  assert.ok(!("totalPoints" in migrated) && !("todaySmilePoints" in migrated) && !("lastSettledDateLocal" in migrated), "the old field names must not survive migration");
});

test("migratePostTaskRewardsState leaves an already-current-shape record untouched", () => {
  const current = createInitialPostTaskRewardsState(DAY1);
  const result = migratePostTaskRewardsState(current);
  assert.deepEqual(result, current);
});

test("migratePostTaskRewardsState passes through null/garbage unchanged, rather than inventing data -- the caller's own missing/corrupt handling still applies", () => {
  assert.equal(migratePostTaskRewardsState(null), null);
  assert.equal(migratePostTaskRewardsState("not an object"), "not an object");
  assert.deepEqual(migratePostTaskRewardsState({ unrelated: true }), { unrelated: true });
});

test("a migrated legacy record behaves correctly once fed back through the normal engine -- e.g. the next completion grows from the migrated totalSmiles, not from zero", () => {
  const legacy = {
    dateLocal: DAY1,
    smileAnchorDateLocal: DAY1,
    smileTaskIndexToday: 1,
    consecutiveStreak: 1,
    todaySmilePoints: 1,
    totalPoints: 5,
    lastSettledDateLocal: null,
    processedCompletionIds: ["t1:2026-01-05"],
  };
  const migrated = migratePostTaskRewardsState(legacy) as PostTaskRewardsState;
  const outcome = completeOnce(migrated, "t2", DAY1);
  assert.equal(outcome.streakRewardSmiles, 2, "the streak continues from where the legacy record left it");
  assert.equal(outcome.totalSmiles, 8, "6 (migrated) + 2 (this completion)");
});

test("data/storage.ts's own loadPostTaskRewardsState runs every record through this migration before returning it, so an existing saved record is never read back raw", () => {
  const storage = readFileSync(fileURLToPath(new URL("../data/storage.ts", import.meta.url)), "utf8");
  assert.match(storage, /import\s*\{\s*migratePostTaskRewardsState\s*\}\s*from\s*["']\.\.\/arc\/postTaskRewards\.ts["']/);
  const fnIndex = storage.indexOf("export async function loadPostTaskRewardsState()");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("migratePostTaskRewardsState(JSON.parse(raw))"));
});

test("a simulated app restart (state round-trips through JSON, as AsyncStorage would) produces identical results", () => {
  let state = createInitialPostTaskRewardsState(DAY1);
  state = completeOnce(state, "t1", DAY1).nextState;
  const restored = JSON.parse(JSON.stringify(state)) as PostTaskRewardsState;
  assert.deepEqual(restored, state);
  const outcome = completeOnce(restored, "t2", DAY1);
  assert.equal(outcome.streakRewardSmiles, 2);
});
