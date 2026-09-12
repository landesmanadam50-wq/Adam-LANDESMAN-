import test from "node:test";
import assert from "node:assert/strict";

import { formatLinkTimerSeconds, getLinkTimerStatus, LINK_TIMER_DEFAULT_DURATIONS } from "./linkTimer.ts";

// ---------------------------------------------------------------------------
// Required test #5: Guided Link count-up/no-timer behavior
// ---------------------------------------------------------------------------

test("getLinkTimerStatus: 'guided' style never has a target -- remainingSeconds is always null and reachedTarget is always false, regardless of elapsed time or a configured duration", () => {
  const early = getLinkTimerStatus("guided", 60, 5);
  assert.equal(early.remainingSeconds, null);
  assert.equal(early.reachedTarget, false);
  assert.equal(early.elapsedSeconds, 5);

  const late = getLinkTimerStatus("guided", 60, 500);
  assert.equal(late.remainingSeconds, null);
  assert.equal(late.reachedTarget, false, "guided style never marks a target reached, even far past any configured duration");
});

test("getLinkTimerStatus: 'guided' style with no duration configured behaves identically to one with a duration -- duration is simply irrelevant", () => {
  const status = getLinkTimerStatus("guided", null, 30);
  assert.equal(status.remainingSeconds, null);
  assert.equal(status.reachedTarget, false);
});

// ---------------------------------------------------------------------------
// Required test #6: Timer target exceeded without failure state
// ---------------------------------------------------------------------------

test("getLinkTimerStatus: 'speed' style counts down correctly and reachedTarget flips true once elapsed >= target -- purely informational, the caller decides what (if anything) to show", () => {
  const before = getLinkTimerStatus("speed", 60, 30);
  assert.equal(before.remainingSeconds, 30);
  assert.equal(before.reachedTarget, false);

  const exact = getLinkTimerStatus("speed", 60, 60);
  assert.equal(exact.remainingSeconds, 0);
  assert.equal(exact.reachedTarget, true);

  const after = getLinkTimerStatus("speed", 60, 90);
  assert.equal(after.remainingSeconds, 0, "remainingSeconds never goes negative");
  assert.equal(after.reachedTarget, true, "reaching/exceeding the target is never itself an error or a blocked state -- just a flag");
  assert.equal(after.elapsedSeconds, 90, "elapsed keeps counting past the target -- nothing stops or resets");
});

test("getLinkTimerStatus: 'speed' style with no configured duration falls back to guided-equivalent behavior (no target to count down to)", () => {
  const status = getLinkTimerStatus("speed", null, 45);
  assert.equal(status.remainingSeconds, null);
  assert.equal(status.reachedTarget, false);
});

test("getLinkTimerStatus never produces a negative elapsedSeconds even if called with one (defensive)", () => {
  const status = getLinkTimerStatus("speed", 30, -5);
  assert.equal(status.elapsedSeconds, 0);
});

test("getLinkTimerStatus treats a non-positive configured duration the same as no duration at all", () => {
  const zero = getLinkTimerStatus("speed", 0, 10);
  assert.equal(zero.remainingSeconds, null);
  const negative = getLinkTimerStatus("speed", -10, 10);
  assert.equal(negative.remainingSeconds, null);
});

test("formatLinkTimerSeconds formats as M:SS, rounding up fractional seconds, never negative", () => {
  assert.equal(formatLinkTimerSeconds(0), "0:00");
  assert.equal(formatLinkTimerSeconds(5), "0:05");
  assert.equal(formatLinkTimerSeconds(65), "1:05");
  assert.equal(formatLinkTimerSeconds(59.4), "1:00", "rounds up, never truncates a nearly-complete second to 0");
  assert.equal(formatLinkTimerSeconds(-3), "0:00");
});

test("LINK_TIMER_DEFAULT_DURATIONS matches the spec's suggested editable defaults for each Link type", () => {
  assert.deepEqual(LINK_TIMER_DEFAULT_DURATIONS.full_or_archi, [120, 180, 300]);
  assert.deepEqual(LINK_TIMER_DEFAULT_DURATIONS.fast_regular, [30, 60, 90]);
  assert.deepEqual(LINK_TIMER_DEFAULT_DURATIONS.mini_arc_link, [15, 30, 60]);
});
