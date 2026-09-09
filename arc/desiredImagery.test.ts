import test from "node:test";
import assert from "node:assert/strict";

import { getDesiredImageryLine } from "./desiredImagery.ts";

test("getDesiredImageryLine returns null for the habit layer regardless of what's configured -- habit has no imagery concept of its own", () => {
  const profile = { stateDesiredImageryDescription: "הצלחה", identityDesiredImageryDescription: "אדם ממושמע" };
  assert.equal(getDesiredImageryLine(profile, "habit", "מיקוד", "משמעת"), null);
});

test("getDesiredImageryLine returns null for the state layer when no state description is configured, even if identity has one", () => {
  const profile = { identityDesiredImageryDescription: "אדם ממושמע" };
  assert.equal(getDesiredImageryLine(profile, "state", "מיקוד", "משמעת"), null);
});

test("getDesiredImageryLine returns null for the identity layer when no identity description is configured, even if state has one", () => {
  const profile = { stateDesiredImageryDescription: "הצלחה" };
  assert.equal(getDesiredImageryLine(profile, "identity", "מיקוד", "משמעת"), null);
});

test("getDesiredImageryLine: state-only description produces the state-only template, referencing only the state label", () => {
  const profile = { stateDesiredImageryDescription: "הצלחה" };
  const line = getDesiredImageryLine(profile, "state", "מיקוד", "משמעת");
  assert.equal(line, "העלה בדמיונך את הצלחה. שים לב כיצד הדימוי מזכיר לך את תחושת מיקוד.");
  assert.ok(!line!.includes("משמעת"), "must never reference the identity label when only state is configured");
});

test("getDesiredImageryLine: identity-only description produces the identity-only template, referencing only the identity label and 'the person you practice being'", () => {
  const profile = { identityDesiredImageryDescription: "אדם ממושמע" };
  const line = getDesiredImageryLine(profile, "identity", "מיקוד", "משמעת");
  assert.equal(line, "העלה בדמיונך את אדם ממושמע. שים לב כיצד הדימוי מזכיר לך את הזהות משמעת ואת האדם שאתה מתרגל להיות.");
  assert.ok(!line!.includes("מיקוד"), "must never reference the state label when only identity is configured");
});

test("getDesiredImageryLine: SHARED image (both descriptions present and textually identical) uses the shared template referencing both labels, on whichever layer is resolved", () => {
  const profile = { stateDesiredImageryDescription: "רוגע ובהירות", identityDesiredImageryDescription: "רוגע ובהירות" };
  const stateLine = getDesiredImageryLine(profile, "state", "מיקוד", "משמעת");
  assert.equal(stateLine, "העלה בדמיונך את רוגע ובהירות. שים לב כיצד הוא מזכיר לך את תחושת מיקוד ואת הזהות משמעת.");
  const identityLine = getDesiredImageryLine(profile, "identity", "מיקוד", "משמעת");
  assert.equal(identityLine, "העלה בדמיונך את רוגע ובהירות. שים לב כיצד הוא מזכיר לך את תחושת מיקוד ואת הזהות משמעת.");
});

test("getDesiredImageryLine: two DIFFERENT descriptions never trigger the shared template -- each layer stays independent", () => {
  const profile = { stateDesiredImageryDescription: "הצלחה", identityDesiredImageryDescription: "אדם ממושמע" };
  const stateLine = getDesiredImageryLine(profile, "state", "מיקוד", "משמעת");
  assert.ok(!stateLine!.includes("משמעת"), "different descriptions must not produce the shared wording");
  const identityLine = getDesiredImageryLine(profile, "identity", "מיקוד", "משמעת");
  assert.ok(!identityLine!.includes("מיקוד"), "different descriptions must not produce the shared wording");
});

test("getDesiredImageryLine trims whitespace-only descriptions to null (same as unset)", () => {
  const profile = { stateDesiredImageryDescription: "   " };
  assert.equal(getDesiredImageryLine(profile, "state", "מיקוד", null), null);
});

test("getDesiredImageryLine never requires the trainee to feel the emotion immediately -- the fixed sentence only asks them to notice what the image reminds them of", () => {
  const profile = { stateDesiredImageryDescription: "הצלחה" };
  const line = getDesiredImageryLine(profile, "state", "מיקוד", null)!;
  assert.ok(!line.includes("תרגיש"), "must never say 'feel it now'");
  assert.match(line, /שים לב כיצד/, "must be phrased as passive noticing, not a demand to feel");
});
