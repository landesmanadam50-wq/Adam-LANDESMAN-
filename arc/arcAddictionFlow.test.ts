import test from "node:test";
import assert from "node:assert/strict";
import { createAddictionProfile } from "./arcAddiction.ts";
import type { AddictionProfile } from "./arcAddiction.ts";
import { advanceArcState, setArcRating } from "./arcAddictionArc.ts";
import {
  closeStaleAddictionSession,
  createAddictionSession,
  getActiveWaitRound,
  getCurrentWaitRound,
  getWaitRemainingSeconds,
  isAddictionSessionStale,
  normalizeAddictionSession,
  reconcileAddictionSession,
  reduceAddictionSession,
  shouldShowGentleStopHint,
} from "./arcAddictionFlow.ts";
import type { AddictionSession, AddictionSessionEvent } from "./arcAddictionFlow.ts";

const T0 = Date.parse("2026-11-27T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

function profile(overrides: Partial<AddictionProfile> = {}): AddictionProfile {
  return { ...createAddictionProfile("p1", { name: "חיטוט באוזניים", initialWaitMinutes: 2, urgeBodyAreas: [{ region: "ears", side: null }] }, at(0)), ...overrides };
}

function start(p = profile()): AddictionSession {
  return createAddictionSession("e1", p, null, at(0));
}

function run(session: AddictionSession, events: [AddictionSessionEvent, number][], p = profile()): AddictionSession {
  return events.reduce((s, [event, seconds]) => reduceAddictionSession(s, event, { now: at(seconds), profile: p }), session);
}

/** intro -> efficacy ARC (skipped) -> wait running */
function toWait(p = profile()): AddictionSession {
  return run(start(p), [[{ type: "START", initialIntensity: 7 }, 1], [{ type: "ARC_SKIP" }, 2]], p);
}

/** ... -> wait elapsed -> decision */
function toDecision(p = profile()): AddictionSession {
  return run(toWait(p), [[{ type: "WAIT_ELAPSED" }, 2 + 120]], p);
}

function toIntensity(p = profile()): AddictionSession {
  return run(toDecision(p), [[{ type: "ANSWER", choice: "not_act" }, 130]], p);
}

// ---------------------------------------------------------------------------
// Main path
// ---------------------------------------------------------------------------

test("START opens the efficacy ARC and stores the initial intensity", () => {
  const s = run(start(), [[{ type: "START", initialIntensity: 7 }, 1]]);
  assert.equal(s.stage, "efficacy_arc");
  assert.equal(s.arc?.kind, "efficacy");
  assert.equal(s.episode.initialIntensity, 7);
  // the ARC starts from the profile's known urge areas
  assert.deepEqual(s.arc?.markedAreas, [{ region: "ears", side: null }]);
});

test("SKIP_TO_WAIT starts the timer without the exercise", () => {
  const s = run(start(), [[{ type: "SKIP_TO_WAIT", initialIntensity: null }, 1]]);
  assert.equal(s.stage, "wait");
  assert.equal(s.episode.arcRounds.length, 0);
});

test("completing the efficacy ARC records the round and starts a wait of the profile's CURRENT target", () => {
  let s = run(start(), [[{ type: "START", initialIntensity: null }, 1]]);
  const rated = setArcRating(s.arc!, "efficacyRating", 8);
  s = run(s, [[{ type: "ARC_COMPLETE", arc: rated }, 60]]);
  assert.equal(s.stage, "wait");
  assert.equal(s.episode.arcRounds[0].ratingAfter, 8);
  assert.equal(s.episode.arcRounds[0].skipped, false);
  const round = getCurrentWaitRound(s)!;
  assert.equal(round.targetMinutes, 2);
  assert.equal(round.endsAt, at(60 + 120));
});

test("skipping the efficacy ARC is recorded as skipped, never blocked", () => {
  const s = toWait();
  assert.equal(s.episode.arcRounds[0].skipped, true);
  assert.equal(s.stage, "wait");
});

test("WAIT_ELAPSED before endsAt is ignored; at endsAt it moves to the decision", () => {
  const s = toWait();
  assert.equal(run(s, [[{ type: "WAIT_ELAPSED" }, 60]]).stage, "wait");
  const due = run(s, [[{ type: "WAIT_ELAPSED" }, 122]]);
  assert.equal(due.stage, "decision");
  assert.equal(getCurrentWaitRound(due)!.elapsedAt, at(122));
});

test("remaining seconds are wall-clock based", () => {
  const round = getActiveWaitRound(toWait())!;
  assert.equal(getWaitRemainingSeconds(round, at(2)), 120);
  assert.equal(getWaitRemainingSeconds(round, at(62)), 60);
  assert.equal(getWaitRemainingSeconds(round, at(500)), 0);
});

test("ANSWER 'not_act' -> intensity question", () => {
  const s = toIntensity();
  assert.equal(s.stage, "intensity");
  assert.equal(getCurrentWaitRound(s)!.choice, "not_act");
});

test("ANSWER 'act' -> behavior log", () => {
  const s = run(toDecision(), [[{ type: "ANSWER", choice: "act" }, 130]]);
  assert.equal(s.stage, "behavior_log");
  assert.equal(s.episode.outcome, "acted");
});

// ---------------------------------------------------------------------------
// Intensity thresholds – boundary values 0, 4, 5, 10
// ---------------------------------------------------------------------------

test("intensity 0: finish_success closes as resisted", () => {
  const s = run(toIntensity(), [[{ type: "RATE_INTENSITY", intensity: 0 }, 131], [{ type: "CHOOSE", choice: "finish_success" }, 132]]);
  assert.equal(s.stage, "closing");
  assert.equal(s.episode.outcome, "resisted");
  assert.equal(getCurrentWaitRound(s)!.intensityAfter, 0);
});

test("intensity 0: extra ARC is not one of its choices", () => {
  const s = run(toIntensity(), [[{ type: "RATE_INTENSITY", intensity: 0 }, 131], [{ type: "CHOOSE", choice: "extra_arc" }, 132]]);
  assert.equal(s.stage, "intensity");
});

test("intensity 4: continue routine closes as resisted; extra wait starts a new round", () => {
  const rated = run(toIntensity(), [[{ type: "RATE_INTENSITY", intensity: 4 }, 131]]);
  assert.equal(run(rated, [[{ type: "CHOOSE", choice: "continue_routine" }, 132]]).episode.outcome, "resisted");
  const again = run(rated, [[{ type: "CHOOSE", choice: "extra_wait" }, 132]]);
  assert.equal(again.stage, "wait");
  assert.equal(again.episode.waitRounds.length, 2);
});

test("intensity 4: 'end' is not a low-route choice", () => {
  const rated = run(toIntensity(), [[{ type: "RATE_INTENSITY", intensity: 4 }, 131], [{ type: "CHOOSE", choice: "end" }, 132]]);
  assert.equal(rated.stage, "intensity");
});

test("intensity 5: extra ARC is offered and leads back to a wait afterwards", () => {
  let s = run(toIntensity(), [[{ type: "RATE_INTENSITY", intensity: 5 }, 131], [{ type: "CHOOSE", choice: "extra_arc" }, 132]]);
  assert.equal(s.stage, "efficacy_arc");
  s = run(s, [[{ type: "ARC_COMPLETE", arc: s.arc! }, 300]]);
  assert.equal(s.stage, "wait");
  assert.equal(s.episode.waitRounds.length, 2);
  assert.equal(s.episode.arcRounds.length, 2);
});

test("intensity 5: 'continue_routine' is not offered on the high route", () => {
  const s = run(toIntensity(), [[{ type: "RATE_INTENSITY", intensity: 5 }, 131], [{ type: "CHOOSE", choice: "continue_routine" }, 132]]);
  assert.equal(s.stage, "intensity");
});

test("intensity 10: extra wait and end are both allowed (the ARC is never forced)", () => {
  const rated = run(toIntensity(), [[{ type: "RATE_INTENSITY", intensity: 10 }, 131]]);
  assert.equal(run(rated, [[{ type: "CHOOSE", choice: "extra_wait" }, 132]]).stage, "wait");
  const ended = run(rated, [[{ type: "CHOOSE", choice: "end" }, 132]]);
  assert.equal(ended.stage, "closing");
  assert.equal(ended.episode.outcome, "resisted");
});

test("CHOOSE without a valid rating does nothing; invalid ratings are not stored", () => {
  const s = toIntensity();
  assert.equal(run(s, [[{ type: "CHOOSE", choice: "extra_wait" }, 131]]).stage, "intensity");
  for (const bad of [-1, 11, 4.5, Number.NaN]) {
    const r = run(s, [[{ type: "RATE_INTENSITY", intensity: bad }, 131]]);
    assert.equal(r.intensityDraft, null, String(bad));
    assert.equal(run(r, [[{ type: "CHOOSE", choice: "extra_wait" }, 132]]).stage, "intensity", String(bad));
  }
});

test("the loop can repeat: wait -> no -> extra wait -> no -> ...", () => {
  let s = toIntensity();
  for (let loop = 0; loop < 4; loop += 1) {
    const base = 200 + loop * 1000;
    s = run(s, [
      [{ type: "RATE_INTENSITY", intensity: 3 }, base],
      [{ type: "CHOOSE", choice: "extra_wait" }, base + 1],
      [{ type: "WAIT_ELAPSED" }, base + 1 + 120],
      [{ type: "ANSWER", choice: "not_act" }, base + 130],
    ]);
    assert.equal(s.stage, "intensity");
  }
  assert.equal(s.episode.waitRounds.length, 5);
  assert.equal(shouldShowGentleStopHint(s), true);
});

// ---------------------------------------------------------------------------
// Acting, behavior log, self-acceptance
// ---------------------------------------------------------------------------

test("ACTED during the wait (before it ended) marks the round as ended early and still leads to acceptance", () => {
  let s = run(toWait(), [[{ type: "ACTED" }, 30]]);
  assert.equal(s.stage, "behavior_log");
  assert.equal(getCurrentWaitRound(s)!.endedEarlyAt, at(30));
  s = run(s, [[{ type: "LOG_BEHAVIOR", durationMinutes: 4 }, 400]]);
  assert.equal(s.stage, "acceptance_arc");
  assert.equal(s.arc?.kind, "acceptance");
  assert.equal(s.episode.behavior?.durationMinutes, 4);
  assert.equal(s.episode.behavior?.loggedRetrospectively, true);
});

test("ACTED is also available from the efficacy ARC and from the intensity question", () => {
  const fromArc = run(start(), [[{ type: "START", initialIntensity: null }, 1], [{ type: "ACTED" }, 5]]);
  assert.equal(fromArc.stage, "behavior_log");
  const fromIntensity = run(toIntensity(), [[{ type: "ACTED" }, 140]]);
  assert.equal(fromIntensity.stage, "behavior_log");
});

test("harmful behaviors: the stopwatch can never start (retrospective logging only)", () => {
  const harmful = profile({ mayCauseBodilyHarm: true });
  let s = run(createAddictionSession("e1", harmful, null, at(0)), [[{ type: "SKIP_TO_WAIT", initialIntensity: null }, 1], [{ type: "ACTED" }, 10]], harmful);
  s = run(s, [[{ type: "START_STOPWATCH" }, 11]], harmful);
  assert.equal(s.stopwatchStartedAt, null);
  s = run(s, [[{ type: "LOG_BEHAVIOR", durationMinutes: 3 }, 12]], harmful);
  assert.equal(s.stage, "acceptance_arc");
  assert.equal(s.episode.behavior?.loggedRetrospectively, true);
});

test("non-harmful behaviors: optional count-up stopwatch logs the measured duration", () => {
  let s = run(toWait(), [[{ type: "ACTED" }, 10], [{ type: "START_STOPWATCH" }, 20]]);
  assert.equal(s.stopwatchStartedAt, at(20));
  s = run(s, [[{ type: "STOP_STOPWATCH" }, 20 + 5 * 60]]);
  assert.equal(s.episode.behavior?.durationMinutes, 5);
  assert.equal(s.episode.behavior?.loggedRetrospectively, false);
  assert.equal(s.stage, "acceptance_arc");
});

test("the duration can be left unstated", () => {
  const s = run(toWait(), [[{ type: "ACTED" }, 10], [{ type: "LOG_BEHAVIOR", durationMinutes: null }, 20]]);
  assert.equal(s.episode.behavior?.durationMinutes, null);
  assert.equal(s.stage, "acceptance_arc");
});

test("the acceptance ARC can be completed or skipped; both close as 'acted' (never a failure)", () => {
  const atAcceptance = run(toWait(), [[{ type: "ACTED" }, 10], [{ type: "LOG_BEHAVIOR", durationMinutes: 2 }, 20]]);
  const arc = setArcRating(setArcRating(atAcceptance.arc!, "acceptanceBefore", 2), "acceptanceAfter", 6);
  const done = run(atAcceptance, [[{ type: "ARC_COMPLETE", arc }, 400]]);
  assert.equal(done.stage, "closing");
  assert.equal(done.episode.outcome, "acted");
  const round = done.episode.arcRounds.at(-1)!;
  assert.equal(round.kind, "acceptance");
  assert.equal(round.ratingBefore, 2);
  assert.equal(round.ratingAfter, 6);
  const skipped = run(atAcceptance, [[{ type: "ARC_SKIP" }, 30]]);
  assert.equal(skipped.stage, "closing");
  assert.equal(skipped.episode.arcRounds.at(-1)!.skipped, true);
});

test("acceptance reactions named in the ARC are kept on the episode", () => {
  const s = run(toWait(), [[{ type: "ACTED" }, 10], [{ type: "LOG_BEHAVIOR", durationMinutes: 2 }, 20]]);
  const arc = { ...s.arc!, reactions: ["בושה", "אשמה"] };
  assert.deepEqual(run(s, [[{ type: "ARC_COMPLETE", arc }, 30]]).episode.acceptanceReactions, ["בושה", "אשמה"]);
});

// ---------------------------------------------------------------------------
// Ending early, ending the practice, closing
// ---------------------------------------------------------------------------

test("END_WAIT_EARLY moves to the decision and is recorded as an early end", () => {
  const s = run(toWait(), [[{ type: "END_WAIT_EARLY" }, 30]]);
  assert.equal(s.stage, "decision");
  assert.equal(getCurrentWaitRound(s)!.endedEarlyAt, at(30));
});

test("END_WAIT_EARLY after the end time counts as reaching the target", () => {
  const s = run(toWait(), [[{ type: "END_WAIT_EARLY" }, 500]]);
  assert.equal(getCurrentWaitRound(s)!.endedEarlyAt, null);
  assert.equal(getCurrentWaitRound(s)!.elapsedAt, at(122));
});

test("END_SESSION is possible from every open stage", () => {
  const stages: AddictionSession[] = [
    start(),
    run(start(), [[{ type: "START", initialIntensity: null }, 1]]),
    toWait(),
    toDecision(),
    toIntensity(),
    run(toWait(), [[{ type: "ACTED" }, 10]]),
    run(toWait(), [[{ type: "ACTED" }, 10], [{ type: "LOG_BEHAVIOR", durationMinutes: 1 }, 11]]),
  ];
  for (const s of stages) {
    const ended = run(s, [[{ type: "END_SESSION" }, 900]]);
    assert.equal(ended.stage, "closing", s.stage);
    assert.ok(ended.episode.endedAt, s.stage);
  }
});

test("END_SESSION outcomes: nothing chosen yet => ended_by_user; after a 'no' => resisted; after acting => acted", () => {
  assert.equal(run(toWait(), [[{ type: "END_SESSION" }, 30]]).episode.outcome, "ended_by_user");
  assert.equal(run(toIntensity(), [[{ type: "END_SESSION" }, 200]]).episode.outcome, "resisted");
  assert.equal(run(toWait(), [[{ type: "ACTED" }, 10], [{ type: "END_SESSION" }, 11]]).episode.outcome, "acted");
});

test("END_SESSION during a running wait stops that round (no orphan timer)", () => {
  const s = run(toWait(), [[{ type: "END_SESSION" }, 30]]);
  assert.equal(getActiveWaitRound(s), null);
  assert.equal(getCurrentWaitRound(s)!.endedEarlyAt, at(30));
});

test("MEMORY_SAVED only in closing; CLOSE -> done; done ignores everything", () => {
  let s = run(toIntensity(), [[{ type: "RATE_INTENSITY", intensity: 0 }, 131], [{ type: "CHOOSE", choice: "finish_success" }, 132]]);
  s = run(s, [[{ type: "MEMORY_SAVED", memoryId: "m1" }, 133], [{ type: "CLOSE" }, 134]]);
  assert.equal(s.episode.savedPositiveMemoryId, "m1");
  assert.equal(s.stage, "done");
  assert.equal(run(s, [[{ type: "START", initialIntensity: 1 }, 135]]), s);
});

// ---------------------------------------------------------------------------
// Notification answers, duplicates, reconcile
// ---------------------------------------------------------------------------

test("a notification answer while the app never ticked the timer first elapses the wait, then applies the answer", () => {
  const s = run(toWait(), [[{ type: "ANSWER", choice: "not_act", episodeId: "e1" }, 200]]);
  assert.equal(s.stage, "intensity");
  const round = getCurrentWaitRound(s)!;
  assert.equal(round.elapsedAt, at(122));
  assert.equal(round.choice, "not_act");
});

test("an answer before the wait is due is ignored", () => {
  const s = toWait();
  assert.equal(run(s, [[{ type: "ANSWER", choice: "act" }, 30]]), s);
});

test("a duplicate answer (second notification press) is ignored", () => {
  const once = run(toWait(), [[{ type: "ANSWER", choice: "not_act", episodeId: "e1" }, 200]]);
  const twice = run(once, [[{ type: "ANSWER", choice: "act", episodeId: "e1" }, 201]]);
  assert.equal(twice, once);
});

test("an answer for a different episode is ignored", () => {
  const s = toDecision();
  assert.equal(run(s, [[{ type: "ANSWER", choice: "act", episodeId: "other" }, 200]]), s);
});

test("reconcile on app open advances a wait that ended while the app was closed", () => {
  const s = reconcileAddictionSession(toWait(), profile(), at(3600));
  assert.equal(s.stage, "decision");
  const notYet = toWait();
  assert.equal(reconcileAddictionSession(notYet, profile(), at(10)), notYet);
});

test("invalid events for the stage return the identical session object", () => {
  const s = toWait();
  for (const event of [{ type: "CHOOSE", choice: "extra_wait" }, { type: "LOG_BEHAVIOR", durationMinutes: 1 }, { type: "CLOSE" }, { type: "START", initialIntensity: 1 }] as AddictionSessionEvent[]) {
    assert.equal(run(s, [[event, 10]]), s, event.type);
  }
});

test("staleness: idle sessions close after 12h, a running wait counts from its end time", () => {
  const s = toWait();
  assert.equal(isAddictionSessionStale(s, at(11 * 3600)), false);
  assert.equal(isAddictionSessionStale(s, at(13 * 3600)), true);
  const closed = closeStaleAddictionSession(s, at(13 * 3600));
  assert.equal(closed.stage, "done");
  assert.equal(closed.episode.outcome, "abandoned");
  const resisted = closeStaleAddictionSession(toIntensity(), at(13 * 3600));
  assert.equal(resisted.episode.outcome, "resisted");
});

test("normalizeAddictionSession: round-trips through JSON and rejects garbage", () => {
  const s = toWait();
  assert.deepEqual(normalizeAddictionSession(JSON.parse(JSON.stringify(s))), s);
  assert.equal(normalizeAddictionSession(null), null);
  assert.equal(normalizeAddictionSession({ version: 2 }), null);
  assert.equal(normalizeAddictionSession({ ...s, stage: "weird" }), null);
});

test("a harmful-behavior session never restores a stopwatch from storage", () => {
  const s = { ...toWait(profile({ mayCauseBodilyHarm: true })), mayCauseBodilyHarm: true, stopwatchStartedAt: at(5) };
  assert.equal(normalizeAddictionSession(JSON.parse(JSON.stringify(s)))!.stopwatchStartedAt, null);
});

test("ARC_UPDATE only accepts the running ARC kind", () => {
  const s = run(start(), [[{ type: "START", initialIntensity: null }, 1]]);
  const advanced = advanceArcState(s.arc!, { hasSuccessMemory: false })!;
  assert.equal(run(s, [[{ type: "ARC_UPDATE", arc: advanced }, 2]]).arc?.stepIndex, 1);
  assert.equal(run(s, [[{ type: "ARC_UPDATE", arc: { ...advanced, kind: "acceptance" } }, 2]]), s);
});
