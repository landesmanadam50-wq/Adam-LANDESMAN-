import test from "node:test";
import assert from "node:assert/strict";
import { containsInductionPattern } from "./instructions.ts";
import {
  createEmptyManifestMeditationProfile,
  DEFAULT_MANIFEST_MEDITATION_DURATION_MINUTES,
  getFirstManifestMeditationStage,
  getManifestMeditationStageCopy,
  getNextManifestMeditationStage,
  MANIFEST_MEDITATION_DURATION_OPTIONS_MINUTES,
  resolveManifestMeditationDwellSeconds,
} from "./manifestMeditation.ts";
import type { ManifestMeditationProfile, ManifestMeditationStage } from "./manifestMeditation.ts";

test("getFirstManifestMeditationStage is always settling", () => {
  assert.equal(getFirstManifestMeditationStage(), "settling");
});

test("the full stage order is linear, one-directional, and ends by holding at complete", () => {
  const order: ManifestMeditationStage[] = [
    "settling",
    "presence",
    "values_and_identities",
    "day_imagery",
    "personal_sentences",
    "todays_action",
    "gratitude",
    "complete",
  ];
  let stage: ManifestMeditationStage = getFirstManifestMeditationStage();
  for (const expected of order) {
    assert.equal(stage, expected);
    stage = getNextManifestMeditationStage(stage);
  }
  assert.equal(stage, "complete", "complete must hold itself -- there is nothing after it");
  assert.equal(getNextManifestMeditationStage("complete"), "complete");
});

test("createEmptyManifestMeditationProfile starts with every list empty and every optional field null", () => {
  const profile = createEmptyManifestMeditationProfile();
  assert.deepEqual(profile.values, []);
  assert.deepEqual(profile.identities, []);
  assert.deepEqual(profile.goalsAndHabits, []);
  assert.deepEqual(profile.personalSentences, []);
  assert.equal(profile.dayImageryDescription, null);
  assert.equal(profile.todaysAction, null);
});

test("resolveManifestMeditationDwellSeconds paces slower for a longer chosen duration, dividing evenly across the 7 content stages", () => {
  const five = resolveManifestMeditationDwellSeconds(5);
  const twenty = resolveManifestMeditationDwellSeconds(20);
  assert.ok(twenty > five, "20 minutes must pace slower (longer per-stage dwell) than 5 minutes");
  assert.equal(five, Math.round((5 * 60) / 7));
  assert.equal(twenty, Math.round((20 * 60) / 7));
});

test("resolveManifestMeditationDwellSeconds clamps into the same bounds every other dwell-bearing stage in this codebase uses", () => {
  const veryShort = resolveManifestMeditationDwellSeconds(0);
  assert.ok(veryShort >= 1, "must never clamp to zero/negative");
});

test("MANIFEST_MEDITATION_DURATION_OPTIONS_MINUTES includes the default option", () => {
  assert.ok(MANIFEST_MEDITATION_DURATION_OPTIONS_MINUTES.includes(DEFAULT_MANIFEST_MEDITATION_DURATION_MINUTES));
});

test("every stage carries the chosen per-stage dwell except the terminal complete stage, which carries none", () => {
  const profile = createEmptyManifestMeditationProfile();
  const dwell = resolveManifestMeditationDwellSeconds(10);
  for (const stage of ["settling", "presence", "values_and_identities", "day_imagery", "personal_sentences", "todays_action", "gratitude"] as ManifestMeditationStage[]) {
    assert.equal(getManifestMeditationStageCopy(stage, profile, dwell).dwellSeconds, dwell, `${stage} must carry the chosen dwell`);
  }
  assert.equal(getManifestMeditationStageCopy("complete", profile, dwell).dwellSeconds, null);
});

test("values_and_identities names every configured value/identity/goal, and falls back to a generic invitation when none are configured -- never an empty body", () => {
  const empty = getManifestMeditationStageCopy("values_and_identities", createEmptyManifestMeditationProfile(), 60);
  assert.ok(empty.body.length > 0);
  assert.ok(!empty.body.includes("undefined"));

  const filled: ManifestMeditationProfile = {
    ...createEmptyManifestMeditationProfile(),
    values: ["בריאות", "חופש"],
    identities: ["אדם ממושמע"],
    goalsAndHabits: ["ריצה יומית"],
  };
  const copy = getManifestMeditationStageCopy("values_and_identities", filled, 60);
  assert.match(copy.body, /בריאות, חופש/);
  assert.match(copy.body, /אדם ממושמע/);
  assert.match(copy.body, /ריצה יומית/);
});

test("day_imagery includes the trainee's own description when configured, and passes the safety denylist either way", () => {
  const withDescription = getManifestMeditationStageCopy(
    "day_imagery",
    { ...createEmptyManifestMeditationProfile(), dayImageryDescription: "קם מוקדם, מתאמן ועוזר למישהו" },
    60
  );
  assert.match(withDescription.body, /קם מוקדם, מתאמן ועוזר למישהו/);
  assert.equal(containsInductionPattern(withDescription.body), false);

  const withoutDescription = getManifestMeditationStageCopy("day_imagery", createEmptyManifestMeditationProfile(), 60);
  assert.ok(withoutDescription.body.length > 0);
  assert.equal(containsInductionPattern(withoutDescription.body), false);
});

test("personal_sentences joins every configured sentence, falling back to a generic line when none are configured", () => {
  const filled = getManifestMeditationStageCopy(
    "personal_sentences",
    { ...createEmptyManifestMeditationProfile(), personalSentences: ["אני מתקדם בקצב שלי.", "אני יכול לבחור מחדש."] },
    60
  );
  assert.match(filled.body, /אני מתקדם בקצב שלי\./);
  assert.match(filled.body, /אני יכול לבחור מחדש\./);

  const empty = getManifestMeditationStageCopy("personal_sentences", createEmptyManifestMeditationProfile(), 60);
  assert.ok(empty.body.length > 0);
});

test("todays_action names the configured action, and falls back to a generic invitation otherwise", () => {
  const withAction = getManifestMeditationStageCopy("todays_action", { ...createEmptyManifestMeditationProfile(), todaysAction: "להתקשר לחבר" }, 60);
  assert.match(withAction.body, /להתקשר לחבר/);

  const withoutAction = getManifestMeditationStageCopy("todays_action", createEmptyManifestMeditationProfile(), 60);
  assert.ok(withoutAction.body.length > 0);
});

test("every stage's copy passes the safety denylist, with a fully-configured profile and with a completely empty one", () => {
  const profiles: ManifestMeditationProfile[] = [
    createEmptyManifestMeditationProfile(),
    {
      values: ["בריאות", "חופש"],
      identities: ["אדם ממושמע"],
      goalsAndHabits: ["ריצה יומית"],
      personalSentences: ["אני מתקדם בקצב שלי."],
      dayImageryDescription: "קם מוקדם ומתאמן",
      todaysAction: "להתקשר לחבר",
    },
  ];
  const stages: ManifestMeditationStage[] = ["settling", "presence", "values_and_identities", "day_imagery", "personal_sentences", "todays_action", "gratitude", "complete"];
  for (const profile of profiles) {
    for (const stage of stages) {
      const copy = getManifestMeditationStageCopy(stage, profile, 60);
      assert.equal(containsInductionPattern(copy.body), false, `${stage} must pass the safety denylist`);
    }
  }
});
