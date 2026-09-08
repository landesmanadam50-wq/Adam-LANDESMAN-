import test from "node:test";
import assert from "node:assert/strict";

import { containsInductionPattern } from "./instructions.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import type { ArcBuildProfile } from "./types.ts";
import {
  EXECUTION_QUALITY_PRESETS,
  buildProcessActionImagerySegments,
  buildResultImagerySegments,
  formatExecutionQualitiesClause,
  getProcessActionImageryCopy,
  getResultImageryCopy,
  getSuccessMantraCopy,
  hasResultImageryConfigured,
  hasSuccessfulPerformanceConfigured,
  resolveExecutionQualities,
  resolveSuccessMantra,
  resolveSuccessfulPerformanceActionOverride,
} from "./successfulPerformance.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return { ...createEmptyArcBuildProfile(), ...overrides };
}

test("hasSuccessfulPerformanceConfigured is false for a completely untouched profile -- every legacy profile included", () => {
  assert.equal(hasSuccessfulPerformanceConfigured(profile()), false);
});

test("hasSuccessfulPerformanceConfigured is true when ANY one field is set", () => {
  assert.equal(hasSuccessfulPerformanceConfigured(profile({ identitySuccessfulPerformanceAction: "לרוץ" })), true);
  assert.equal(hasSuccessfulPerformanceConfigured(profile({ identitySuccessfulPerformanceQualities: ["מדויקת"] })), true);
  assert.equal(hasSuccessfulPerformanceConfigured(profile({ identitySuccessfulPerformanceCustomQuality: "בשמחה" })), true);
  assert.equal(hasSuccessfulPerformanceConfigured(profile({ identitySuccessfulPerformanceResult: "סיום המרתון" })), true);
  assert.equal(hasSuccessfulPerformanceConfigured(profile({ identitySuccessMantra: "אני אצליח" })), true);
});

test("hasSuccessfulPerformanceConfigured is false for an empty-array/whitespace-only configuration -- never mistaken for real content", () => {
  const p = profile({
    identitySuccessfulPerformanceAction: "   ",
    identitySuccessfulPerformanceQualities: [],
    identitySuccessfulPerformanceCustomQuality: "  ",
    identitySuccessfulPerformanceResult: "",
    identitySuccessMantra: null,
  });
  assert.equal(hasSuccessfulPerformanceConfigured(p), false);
});

test("resolveSuccessfulPerformanceActionOverride returns the trimmed override, or null when never configured", () => {
  assert.equal(resolveSuccessfulPerformanceActionOverride(profile()), null);
  assert.equal(resolveSuccessfulPerformanceActionOverride(profile({ identitySuccessfulPerformanceAction: "  לרוץ  " })), "לרוץ");
});

test("resolveExecutionQualities combines presets and the custom quality, presets first, never duplicated", () => {
  const p = profile({ identitySuccessfulPerformanceQualities: ["מדויקת", "עקבית"], identitySuccessfulPerformanceCustomQuality: "בשמחה" });
  assert.deepEqual(resolveExecutionQualities(p), ["מדויקת", "עקבית", "בשמחה"]);
});

test("resolveExecutionQualities never appends the custom quality if it exactly duplicates a preset already selected", () => {
  const p = profile({ identitySuccessfulPerformanceQualities: ["מדויקת"], identitySuccessfulPerformanceCustomQuality: "מדויקת" });
  assert.deepEqual(resolveExecutionQualities(p), ["מדויקת"]);
});

test("formatExecutionQualitiesClause returns null for zero qualities -- the clause is omitted entirely, never rendered empty", () => {
  assert.equal(formatExecutionQualitiesClause([]), null);
});

test("formatExecutionQualitiesClause phrases a single quality without a list joiner", () => {
  assert.equal(formatExecutionQualitiesClause(["מדויקת"]), "אתה מבצע את הפעולה בצורה מדויקת.");
});

test("formatExecutionQualitiesClause matches spec section 5's own worked example exactly for three qualities", () => {
  assert.equal(
    formatExecutionQualitiesClause(["מדויקת", "עקבית", "מקצועית"]),
    "אתה מבצע את הפעולה בצורה מדויקת, עקבית ומקצועית."
  );
});

test("EXECUTION_QUALITY_PRESETS has exactly the six spec-suggested qualities", () => {
  assert.equal(EXECUTION_QUALITY_PRESETS.length, 6);
});

test("hasResultImageryConfigured is true only when a desired result was actually configured", () => {
  assert.equal(hasResultImageryConfigured(profile()), false);
  assert.equal(hasResultImageryConfigured(profile({ identitySuccessfulPerformanceResult: "   " })), false);
  assert.equal(hasResultImageryConfigured(profile({ identitySuccessfulPerformanceResult: "סיום המרתון" })), true);
});

test("resolveSuccessMantra returns null when never configured -- 'do not display a mantra the user did not configure'", () => {
  assert.equal(resolveSuccessMantra(profile()), null);
  assert.equal(resolveSuccessMantra(profile({ identitySuccessMantra: "   " })), null);
});

test("resolveSuccessMantra returns the trimmed mantra when configured", () => {
  assert.equal(resolveSuccessMantra(profile({ identitySuccessMantra: " אני אצליח לבצע את הפעולה. " })), "אני אצליח לבצע את הפעולה.");
});

test("getSuccessMantraCopy is null when unconfigured, and carries the exact mantra text (quoted) when configured, with no timing/dwell segments", () => {
  assert.equal(getSuccessMantraCopy(profile()), null);
  const copy = getSuccessMantraCopy(profile({ identitySuccessMantra: "אני אצליח" }));
  assert.ok(copy);
  assert.equal(copy!.body, '"אני אצליח"');
  assert.equal(copy!.segments, null);
});

test("buildProcessActionImagerySegments names the resolved action, and falls back to currentAction when no override was configured", () => {
  const withOverride = buildProcessActionImagerySegments(profile({ identitySuccessfulPerformanceAction: "לכתוב שיר" }), "ללמוד", null);
  assert.match(withOverride[0].text, /הפעולה: לכתוב שיר\./);
  const withoutOverride = buildProcessActionImagerySegments(profile(), "ללמוד", null);
  assert.match(withoutOverride[0].text, /הפעולה: ללמוד\./);
});

test("buildProcessActionImagerySegments carries the exact spec instruction sentence and appends the Action Body Cue and quality clause when present", () => {
  const p = profile({ identitySuccessfulPerformanceQualities: ["מדויקת", "עקבית"] });
  const [segment] = buildProcessActionImagerySegments(p, "ללמוד", "נשימה עמוקה");
  assert.match(segment.text, /דמיין את עצמך מבצע את הפעולה\. שים לב לא רק למה שאתה עושה, אלא גם לדרך שבה אתה עושה אותה\./);
  assert.match(segment.text, /תוך שמירה על נשימה עמוקה\./);
  assert.match(segment.text, /אתה מבצע את הפעולה בצורה מדויקת ועקבית\./);
});

test("buildProcessActionImagerySegments omits the quality clause entirely when no qualities are configured", () => {
  const [segment] = buildProcessActionImagerySegments(profile(), "ללמוד", null);
  assert.ok(!segment.text.includes("בצורה"));
});

test("buildResultImagerySegments carries the exact spec instruction sentence and names the configured desired result", () => {
  const [segment] = buildResultImagerySegments(profile({ identitySuccessfulPerformanceResult: "לסיים את המרתון" }));
  assert.match(segment.text, /עכשיו דמיין שהפעולה מצליחה ואתה משיג את התוצאה הרצויה\. איך המצב נראה\? מה אתה רואה, שומע ומרגיש\?/);
  assert.match(segment.text, /התוצאה הרצויה: לסיים את המרתון\./);
});

test("neither Process/Action Imagery nor Result Imagery text ever trips the induction-pattern audit, across a fully-configured profile", () => {
  // presenceColor is deliberately left unset here: its own "actionImagery"
  // reminder line (arc/presenceColor.ts, "דמיין זאת כש...") is pre-existing
  // text already appended by arc/stageCopy.ts's ORIGINAL, unmodified "act"
  // imagery case -- a latent gap in that pre-existing text/denylist
  // combination, unrelated to and unchanged by this task, out of scope
  // here. This test covers exactly the new text this task adds.
  const p = profile({
    identitySuccessfulPerformanceAction: "לרוץ מרתון",
    identitySuccessfulPerformanceQualities: EXECUTION_QUALITY_PRESETS,
    identitySuccessfulPerformanceCustomQuality: "בגאווה",
    identitySuccessfulPerformanceResult: "לחצות את קו הסיום",
    identitySuccessMantra: "אני אצליח",
  });
  for (const segment of buildProcessActionImagerySegments(p, "לרוץ מרתון", "כתפיים משוחררות")) {
    assert.equal(containsInductionPattern(segment.text), false, `action imagery text flagged: "${segment.text}"`);
  }
  for (const segment of buildResultImagerySegments(p)) {
    assert.equal(containsInductionPattern(segment.text), false, `result imagery text flagged: "${segment.text}"`);
  }
});

test("getProcessActionImageryCopy/getResultImageryCopy each carry a trailing dwell segment sized from their own separately configured duration", () => {
  const p = profile({
    identityDwellTimes: { actionImageryDwellSeconds: 12, resultImageryDwellSeconds: 20 },
    identitySuccessfulPerformanceResult: "תוצאה",
  });
  const actionCopy = getProcessActionImageryCopy(p, "identity", "לרוץ", null);
  const resultCopy = getResultImageryCopy(p, "identity");
  assert.ok(actionCopy.segments);
  assert.ok(resultCopy.segments);
  const actionDwell = actionCopy.segments![actionCopy.segments!.length - 1];
  const resultDwell = resultCopy.segments![resultCopy.segments!.length - 1];
  assert.equal(actionDwell.text, "");
  assert.equal(actionDwell.durationSeconds, 12);
  assert.equal(resultDwell.text, "");
  assert.equal(resultDwell.durationSeconds, 20);
});
