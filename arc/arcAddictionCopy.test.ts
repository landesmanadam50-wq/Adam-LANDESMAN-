import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as copy from "./arcAddictionCopy.ts";
import { createAddictionProfile } from "./arcAddiction.ts";
import { ACCEPTANCE_ARC_STEPS, createAddictionArcState, EFFICACY_ARC_STEPS, getArcStepCopy } from "./arcAddictionArc.ts";

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") return out;
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, out));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStrings(entry, out));
  return out;
}

function allArcStrings(): string[] {
  const profile = createAddictionProfile("p", { name: "x", urgeSensation: "עקצוץ" }, "2026-01-01T00:00:00.000Z");
  const out: string[] = [];
  for (const kind of ["efficacy", "acceptance"] as const) {
    const steps = kind === "efficacy" ? EFFICACY_ARC_STEPS : ACCEPTANCE_ARC_STEPS;
    steps.forEach((_, stepIndex) => collectStrings(getArcStepCopy({ ...createAddictionArcState(kind, profile, "2026-01-01T00:00:00.000Z"), stepIndex }, profile), out));
  }
  return out;
}

test("no judgmental wording anywhere in ARC Addiction copy", () => {
  const strings = [
    ...collectStrings(copy).filter((s) => !(copy.BANNED_COPY_WORDS as readonly string[]).includes(s) && !copy.BANNED_WORD_EXCEPTIONS.includes(s)),
    ...allArcStrings(),
    copy.describeWaitTargetChange(3, 3),
    copy.describeWaitTargetChange(3, 4),
    String(copy.describeDurationTargetChange(10, 9)),
    copy.getWaitNotificationTitle("x"),
    copy.buildSuccessMemoryTitle("x"),
  ];
  for (const text of strings) {
    for (const word of copy.BANNED_COPY_WORDS) {
      assert.ok(!text.includes(word), `"${word}" found in: ${text}`);
    }
  }
});

test("the only exception uses the word in negation", () => {
  assert.match(copy.BEHAVIOR_LOG_INTRO, /לא סימן לכישלון/);
});

test("disclaimer: not presented as a proven medical treatment", () => {
  assert.match(copy.ARC_ADDICTION_DISCLAIMER, /אינו טיפול רפואי/);
  assert.match(copy.ARC_ADDICTION_DISCLAIMER, /אינו תחליף לליווי מקצועי/);
});

test("the decision question and its two answers are exactly as specified", () => {
  assert.equal(copy.ARC_ADDICTION_DECISION_QUESTION, "האם אתה בוחר לפעול לפי הדחף כרגע?");
  assert.equal(copy.ARC_ADDICTION_ANSWER_YES, "כן");
  assert.equal(copy.ARC_ADDICTION_ANSWER_NO, "לא");
  assert.equal(copy.ARC_ADDICTION_INTENSITY_QUESTION, "מהי עוצמת התחושה או הדחף כרגע?");
});

test("the three principles: מסוגלות, זמן, קבלה", () => {
  assert.deepEqual(copy.ARC_ADDICTION_PRINCIPLES.map((p) => p.title), ["מסוגלות", "זמן", "קבלה"]);
  assert.match(copy.ARC_ADDICTION_PRINCIPLES[2].body, /אינה מותנית בהצלחה/);
});

test("acting on the urge closes with acceptance, and progress is never reset", () => {
  assert.match(copy.CLOSING_MESSAGES.acted, /ההתקדמות שלך נשמרת/);
  assert.match(copy.PROGRESS_NOT_RESET_NOTE, /לעולם לא מתאפסת/);
});

test("target change descriptions", () => {
  assert.equal(copy.describeWaitTargetChange(3, 4), "יעד ההמתנה הבא: 4 דק' (+1).");
  assert.equal(copy.describeWaitTargetChange(3, 3), "יעד ההמתנה נשאר 3 דק'.");
  assert.equal(copy.describeDurationTargetChange(null, null), null);
  assert.equal(copy.describeDurationTargetChange(null, 10), "יעד עדין למשך ההתנהגות: 10 דק'.");
  assert.equal(copy.describeDurationTargetChange(10, 9), "יעד משך ההתנהגות הבא: 9 דק' (−1).");
});

test("source files of the route never mention medical cure claims", () => {
  for (const rel of ["arcAddictionCopy.ts", "arcAddictionArc.ts"]) {
    const source = readFileSync(fileURLToPath(new URL(`./${rel}`, import.meta.url)), "utf8");
    for (const claim of ["מרפא", "ריפוי מוכח", "טיפול מוכח"]) assert.ok(!source.includes(claim), `${claim} in ${rel}`);
  }
});
