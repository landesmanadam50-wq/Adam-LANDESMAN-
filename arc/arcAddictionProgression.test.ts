import test from "node:test";
import assert from "node:assert/strict";
import { createAddictionEpisode, createAddictionProfile, MAX_WAIT_MINUTES } from "./arcAddiction.ts";
import type { AddictionEpisode, AddictionProfile } from "./arcAddiction.ts";
import {
  applyEpisodeToProfile,
  computeNextDurationTarget,
  computeNextWaitTarget,
  computeTrend,
  decreaseWaitTarget,
  setDurationProgression,
  setDurationTarget,
  setWaitProgression,
  setWaitTarget,
} from "./arcAddictionProgression.ts";

const NOW = "2026-11-27T10:00:00.000Z";

function profile(overrides: Partial<AddictionProfile> = {}): AddictionProfile {
  return { ...createAddictionProfile("p1", { name: "x", initialWaitMinutes: 3 }, NOW), ...overrides };
}

function episode(p: AddictionProfile, opts: { met?: boolean; early?: boolean; outcome?: AddictionEpisode["outcome"]; duration?: number | null }): AddictionEpisode {
  const base = createAddictionEpisode("e1", p, null, NOW);
  const rounds = opts.met === undefined && !opts.early ? [] : [
    {
      startedAt: NOW,
      targetMinutes: p.waitTargetMinutes,
      endsAt: "2026-11-27T10:03:00.000Z",
      endedEarlyAt: opts.early ? "2026-11-27T10:01:00.000Z" : null,
      elapsedAt: opts.met ? "2026-11-27T10:03:00.000Z" : null,
      answeredAt: null,
      choice: null,
      intensityAfter: null,
    },
  ];
  return {
    ...base,
    waitRounds: rounds,
    outcome: opts.outcome ?? "resisted",
    behavior: opts.duration === undefined ? null : { durationMinutes: opts.duration, loggedRetrospectively: true, stopwatchStartedAt: null, loggedAt: NOW },
  };
}

// ---------------------------------------------------------------------------
// Wait target
// ---------------------------------------------------------------------------

test("meeting the wait target grows the next target by one minute by default", () => {
  assert.equal(computeNextWaitTarget(profile(), true), 4);
});

test("a custom step is honored", () => {
  assert.equal(computeNextWaitTarget(setWaitProgression(profile(), "increase", 2, NOW), true), 5);
});

test("hold mode keeps the same target", () => {
  assert.equal(computeNextWaitTarget(setWaitProgression(profile(), "hold", 1, NOW), true), 3);
});

test("not meeting the target never resets or lowers it", () => {
  assert.equal(computeNextWaitTarget(profile({ waitTargetMinutes: 12 }), false), 12);
});

test("growth is capped at the maximum", () => {
  assert.equal(computeNextWaitTarget(profile({ waitTargetMinutes: MAX_WAIT_MINUTES }), true), MAX_WAIT_MINUTES);
});

test("explicit user edits are the only way down: decrease / set (minimum 1)", () => {
  assert.equal(decreaseWaitTarget(profile(), 1, NOW).waitTargetMinutes, 2);
  assert.equal(decreaseWaitTarget(profile(), 10, NOW).waitTargetMinutes, 1);
  assert.equal(setWaitTarget(profile(), 7, NOW).waitTargetMinutes, 7);
});

// ---------------------------------------------------------------------------
// Behavior duration target
// ---------------------------------------------------------------------------

test("the first logged duration seeds the gentle duration target", () => {
  assert.equal(computeNextDurationTarget(profile(), 10), 10);
});

test("a duration at or below the target lowers the next target by one step", () => {
  assert.equal(computeNextDurationTarget(profile({ behaviorDurationTargetMinutes: 10 }), 10), 9);
  assert.equal(computeNextDurationTarget(profile({ behaviorDurationTargetMinutes: 10 }), 4), 9);
});

test("a longer duration leaves the target untouched (no penalty)", () => {
  assert.equal(computeNextDurationTarget(profile({ behaviorDurationTargetMinutes: 10 }), 25), 10);
});

test("the duration target never drops below one minute", () => {
  assert.equal(computeNextDurationTarget(profile({ behaviorDurationTargetMinutes: 1 }), 0), 1);
});

test("an unstated duration leaves the target untouched", () => {
  assert.equal(computeNextDurationTarget(profile({ behaviorDurationTargetMinutes: 8 }), null), 8);
});

test("duration hold mode and custom step", () => {
  assert.equal(computeNextDurationTarget(setDurationProgression(profile({ behaviorDurationTargetMinutes: 8 }), "hold", 1, NOW), 2), 8);
  assert.equal(computeNextDurationTarget(setDurationProgression(profile({ behaviorDurationTargetMinutes: 8 }), "increase", 3, NOW), 2), 5);
  assert.equal(setDurationTarget(profile(), null, NOW).behaviorDurationTargetMinutes, null);
});

// ---------------------------------------------------------------------------
// applyEpisodeToProfile – both metrics, separately, exactly once
// ---------------------------------------------------------------------------

test("a resisted episode that met the wait grows the wait only", () => {
  const p = profile({ behaviorDurationTargetMinutes: 10 });
  const result = applyEpisodeToProfile(p, episode(p, { met: true }), NOW);
  assert.equal(result.profile.waitTargetMinutes, 4);
  assert.equal(result.profile.behaviorDurationTargetMinutes, 10);
  assert.equal(result.waitTargetChanged, true);
  assert.equal(result.durationTargetChanged, false);
  assert.equal(result.episode.waitTargetAfter, 4);
});

test("acting after meeting the wait still counts as wait progress, and the duration is tracked in parallel", () => {
  const p = profile({ behaviorDurationTargetMinutes: 10 });
  const result = applyEpisodeToProfile(p, episode(p, { met: true, outcome: "acted", duration: 6 }), NOW);
  assert.equal(result.profile.waitTargetMinutes, 4);
  assert.equal(result.profile.behaviorDurationTargetMinutes, 9);
});

test("acting before the wait ended keeps every target – no reset", () => {
  const p = profile({ waitTargetMinutes: 9, behaviorDurationTargetMinutes: 10 });
  const result = applyEpisodeToProfile(p, episode(p, { early: true, outcome: "acted", duration: 30 }), NOW);
  assert.equal(result.profile.waitTargetMinutes, 9);
  assert.equal(result.profile.behaviorDurationTargetMinutes, 10);
  assert.equal(result.profile, p);
});

test("progression is applied exactly once per episode", () => {
  const p = profile();
  const first = applyEpisodeToProfile(p, episode(p, { met: true }), NOW);
  const second = applyEpisodeToProfile(first.profile, first.episode, NOW);
  assert.equal(second.profile.waitTargetMinutes, 4);
  assert.equal(second.waitTargetChanged, false);
});

test("an episode of another profile is ignored", () => {
  const p = profile();
  const other = { ...episode(p, { met: true }), profileId: "someone-else" };
  assert.equal(applyEpisodeToProfile(p, other, NOW).profile, p);
});

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

test("trend: wait time going up is improving; duration going down is improving", () => {
  assert.equal(computeTrend([1, 1, 2, 3], false), "improving");
  assert.equal(computeTrend([10, 10, 6, 5], true), "improving");
});

test("trend: other direction is 'not_yet', never 'worse'; flat is steady", () => {
  assert.equal(computeTrend([10, 10, 12, 13], true), "not_yet");
  assert.equal(computeTrend([5, 5, 5, 5], true), "steady");
  assert.equal(computeTrend([5], true), "insufficient_data");
});
