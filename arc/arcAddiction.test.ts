import test from "node:test";
import assert from "node:assert/strict";
import {
  ADDICTION_RATING_VALUES,
  computeEpisodeWaitSeconds,
  countNotActChoices,
  createAddictionEpisode,
  createAddictionProfile,
  DEFAULT_INITIAL_WAIT_MINUTES,
  deleteAddictionProfileFromList,
  isEpisodeWaitTargetMet,
  isValidAddictionRating,
  MAX_WAIT_MINUTES,
  normalizeAddictionEpisode,
  normalizeAddictionProfile,
  pruneAddictionEpisodes,
  resolveAddictionSensationContextKey,
  resolveIntensityChoices,
  resolveIntensityRoute,
  toggleAddictionBodyArea,
  upsertAddictionProfileInList,
  validateAddictionProfile,
} from "./arcAddiction.ts";
import type { AddictionEpisode, AddictionProfile } from "./arcAddiction.ts";

const NOW = "2026-11-27T10:00:00.000Z";

function profile(overrides: Partial<AddictionProfile> = {}): AddictionProfile {
  return { ...createAddictionProfile("p1", { name: "חיטוט באוזניים", urgeSensation: "עקצוץ", urgeBodyAreas: [{ region: "ears", side: "left" }] }, NOW), ...overrides };
}

// ---------------------------------------------------------------------------
// Intensity routing – boundary values 0, 4, 5, 10 (and invalid input)
// ---------------------------------------------------------------------------

test("intensity 0 => zero route: may finish and document a success", () => {
  assert.equal(resolveIntensityRoute(0), "zero");
  assert.deepEqual(resolveIntensityChoices("zero"), ["finish_success", "extra_wait"]);
});

test("intensity 1 and 4 => low route (continue routine / another wait)", () => {
  assert.equal(resolveIntensityRoute(1), "low");
  assert.equal(resolveIntensityRoute(4), "low");
  assert.equal(resolveIntensityChoices("low")[0], "continue_routine");
  assert.ok(resolveIntensityChoices("low").includes("extra_wait"));
});

test("intensity 5 (inclusive) and 10 => high route: extra efficacy ARC is the offered (first) choice", () => {
  assert.equal(resolveIntensityRoute(5), "high");
  assert.equal(resolveIntensityRoute(10), "high");
  assert.equal(resolveIntensityChoices("high")[0], "extra_arc");
});

test("high route never forces the ARC: waiting and ending are always available", () => {
  const choices = resolveIntensityChoices("high");
  assert.ok(choices.includes("extra_wait"));
  assert.ok(choices.includes("end"));
});

test("every value 0..10 maps to exactly one route, monotonic", () => {
  const routes = ADDICTION_RATING_VALUES.map((value) => resolveIntensityRoute(value));
  assert.deepEqual(routes, ["zero", "low", "low", "low", "low", "high", "high", "high", "high", "high", "high"]);
});

test("invalid intensities resolve to null (continue stays disabled)", () => {
  for (const value of [-1, 11, 4.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, "5"]) {
    assert.equal(resolveIntensityRoute(value), null, String(value));
    assert.equal(isValidAddictionRating(value), false, String(value));
  }
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

test("createAddictionProfile: user-chosen initial wait, +1 default step, no duration target yet", () => {
  const p = createAddictionProfile("p", { name: "  גלילה  ", initialWaitMinutes: 3 }, NOW);
  assert.equal(p.name, "גלילה");
  assert.equal(p.waitTargetMinutes, 3);
  assert.deepEqual(p.waitProgression, { mode: "increase", stepMinutes: 1 });
  assert.equal(p.behaviorDurationTargetMinutes, null);
  assert.equal(p.mayCauseBodilyHarm, false);
});

test("createAddictionProfile: default initial wait is one minute", () => {
  assert.equal(DEFAULT_INITIAL_WAIT_MINUTES, 1);
  assert.equal(createAddictionProfile("p", { name: "x" }, NOW).waitTargetMinutes, 1);
});

test("initial wait is clamped into the valid range", () => {
  assert.equal(createAddictionProfile("p", { name: "x", initialWaitMinutes: 0 }, NOW).waitTargetMinutes, 1);
  assert.equal(createAddictionProfile("p", { name: "x", initialWaitMinutes: 9999 }, NOW).waitTargetMinutes, MAX_WAIT_MINUTES);
});

test("validateAddictionProfile requires a name and a valid wait", () => {
  assert.equal(validateAddictionProfile({ name: "", waitTargetMinutes: 1 }).valid, false);
  assert.equal(validateAddictionProfile({ name: "x", waitTargetMinutes: 0 }).valid, false);
  assert.equal(validateAddictionProfile({ name: "x", waitTargetMinutes: 1.5 }).valid, false);
  assert.equal(validateAddictionProfile({ name: "x", waitTargetMinutes: 1 }).valid, true);
});

test("body area toggling adds and removes, and duplicates are removed on create", () => {
  const once = toggleAddictionBodyArea([], "ears", "left");
  assert.deepEqual(once, [{ region: "ears", side: "left" }]);
  assert.deepEqual(toggleAddictionBodyArea(once, "ears", "left"), []);
  const p = createAddictionProfile("p", { name: "x", urgeBodyAreas: [{ region: "ears", side: "left" }, { region: "ears", side: "left" }] }, NOW);
  assert.equal(p.urgeBodyAreas.length, 1);
});

test("normalizeAddictionProfile repairs damaged / older records", () => {
  const repaired = normalizeAddictionProfile({
    id: "p",
    name: "x",
    urgeBodyAreas: [{ region: "not-a-region", side: "left" }, { region: "ears", side: "weird" }],
    supportiveSensations: [{ label: "  ", region: null, side: null, movementLabel: null }, { label: "רוגע", region: "scanChest", side: null, movementLabel: "" }],
    waitTargetMinutes: -4,
    waitProgression: { mode: "bogus", stepMinutes: 500 },
  } as unknown as AddictionProfile);
  assert.deepEqual(repaired.urgeBodyAreas, [{ region: "ears", side: null }]);
  assert.deepEqual(repaired.supportiveSensations, [{ label: "רוגע", region: "scanChest", side: null, movementLabel: null }]);
  assert.equal(repaired.waitTargetMinutes, 1);
  assert.deepEqual(repaired.waitProgression, { mode: "increase", stepMinutes: 30 });
  assert.deepEqual(repaired.durationProgression, { mode: "increase", stepMinutes: 1 });
  assert.equal(repaired.behaviorDurationTargetMinutes, null);
});

test("profile list upsert/delete only touch the matching profile", () => {
  const a = profile({ id: "a" });
  const b = profile({ id: "b" });
  const list = upsertAddictionProfileInList([a], b);
  assert.equal(list.length, 2);
  assert.equal(upsertAddictionProfileInList(list, { ...a, name: "changed" })[0].name, "changed");
  assert.deepEqual(deleteAddictionProfileFromList(list, "a").map((p) => p.id), ["b"]);
});

// ---------------------------------------------------------------------------
// Episode
// ---------------------------------------------------------------------------

function episodeWithRounds(rounds: Partial<AddictionEpisode["waitRounds"][number]>[]): AddictionEpisode {
  const base = createAddictionEpisode("e", profile(), null, NOW);
  return {
    ...base,
    waitRounds: rounds.map((r) => ({
      startedAt: NOW,
      targetMinutes: 1,
      endsAt: "2026-11-27T10:01:00.000Z",
      endedEarlyAt: null,
      elapsedAt: null,
      answeredAt: null,
      choice: null,
      intensityAfter: null,
      ...r,
    })),
  };
}

test("wait target met only when a round reached its end without being ended early", () => {
  assert.equal(isEpisodeWaitTargetMet(episodeWithRounds([{ elapsedAt: "2026-11-27T10:01:00.000Z" }])), true);
  assert.equal(isEpisodeWaitTargetMet(episodeWithRounds([{ endedEarlyAt: "2026-11-27T10:00:30.000Z" }])), false);
  assert.equal(isEpisodeWaitTargetMet(episodeWithRounds([])), false);
});

test("waited seconds count early ends up to the moment they ended", () => {
  const e = episodeWithRounds([{ endedEarlyAt: "2026-11-27T10:00:30.000Z" }, { startedAt: "2026-11-27T10:05:00.000Z", endsAt: "2026-11-27T10:06:00.000Z", elapsedAt: "2026-11-27T10:06:00.000Z" }]);
  assert.equal(computeEpisodeWaitSeconds(e, "2026-11-27T11:00:00.000Z"), 90);
});

test("a running round counts until now", () => {
  const e = episodeWithRounds([{}]);
  assert.equal(computeEpisodeWaitSeconds(e, "2026-11-27T10:00:20.000Z"), 20);
});

test("countNotActChoices", () => {
  assert.equal(countNotActChoices(episodeWithRounds([{ choice: "not_act" }, { choice: "not_act" }, { choice: "act" }])), 2);
});

test("normalizeAddictionEpisode tolerates garbage", () => {
  const e = normalizeAddictionEpisode({ id: "x", profileId: "p", waitRounds: [{ choice: "maybe", intensityAfter: 12 }], outcome: "fail" } as unknown as AddictionEpisode);
  assert.equal(e.outcome, null);
  assert.equal(e.waitRounds[0].choice, null);
  assert.equal(e.waitRounds[0].intensityAfter, null);
  assert.deepEqual(e.arcRounds, []);
});

test("pruneAddictionEpisodes keeps the newest N per profile and never mixes profiles", () => {
  const make = (id: string, profileId: string, minute: number) =>
    ({ ...createAddictionEpisode(id, profile({ id: profileId }), null, `2026-11-27T10:${String(minute).padStart(2, "0")}:00.000Z`) });
  const list = [make("a1", "a", 1), make("a2", "a", 2), make("a3", "a", 3), make("b1", "b", 1)];
  assert.deepEqual(pruneAddictionEpisodes(list, 2).map((e) => e.id), ["a2", "a3", "b1"]);
});

test("supportive-sensation context keys are per profile and per ARC kind", () => {
  assert.equal(resolveAddictionSensationContextKey("p1", "efficacy"), "addiction:p1");
  assert.equal(resolveAddictionSensationContextKey("p1", "acceptance"), "addictionAcceptance:p1");
});

test("a supportive sensation rated helpful (>= 6) is pinned to the profile once; lower ratings are not", async () => {
  const { mergeHelpfulSupportiveSensation } = await import("./arcAddiction.ts");
  const p = profile();
  const sensation = { region: "palms" as const, side: null, label: "חום", movementLabel: null };
  assert.equal(mergeHelpfulSupportiveSensation(p, sensation, 5, NOW), p);
  assert.equal(mergeHelpfulSupportiveSensation(p, sensation, null, NOW), p);
  const pinned = mergeHelpfulSupportiveSensation(p, sensation, 6, NOW);
  assert.equal(pinned.supportiveSensations.length, 1);
  assert.equal(mergeHelpfulSupportiveSensation(pinned, sensation, 9, NOW), pinned);
});
