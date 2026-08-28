import test from "node:test";
import assert from "node:assert/strict";

import {
  getAwarenessInstruction,
  getCombinedAttentionInstruction,
  getExpandPresenceInstruction,
  containsInductionPattern,
} from "./instructions.ts";

test("Awareness instruction takes no parameters and never names a specific state", () => {
  assert.equal(getAwarenessInstruction.length, 0, "function must take no parameters");
  assert.match(getAwarenessInstruction(), /שים לב למה שכבר נמצא עכשיו/);
});

test("Combined Attention instruction takes no parameters -- never two named states held at once", () => {
  assert.equal(getCombinedAttentionInstruction.length, 0, "function must take no parameters");
  assert.equal(containsInductionPattern(getCombinedAttentionInstruction()), false);
});

test("Combined Attention includes ambient sound as a passive additional anchor, alongside the visual point and the body", () => {
  const text = getCombinedAttentionInstruction();
  assert.match(text, /לצלילים מסביב/);
  assert.match(text, /לנקודה אחת מולך/);
  assert.match(text, /לתחושה של הגוף כולו/);
});

test("Expand Presence instruction takes no parameters either", () => {
  assert.equal(getExpandPresenceInstruction.length, 0, "function must take no parameters");
  assert.equal(containsInductionPattern(getExpandPresenceInstruction()), false);
});

test("Expand Presence lets sound stay in the background, not a new focal point", () => {
  assert.match(getExpandPresenceInstruction(), /אפשר לצלילים להישאר ברקע/);
});

test("audit catches the exact bug that shipped: a plain ASCII hyphen between בו and זמנית", () => {
  const shippedBuggyInstruction = "החזק בו-זמנית את המודעות ל-ביקורת עצמית וגם ל-חמלה.";
  assert.equal(containsInductionPattern(shippedBuggyInstruction), true);
});

test("audit also catches the Hebrew maqaf and plain-space variants", () => {
  assert.equal(containsInductionPattern("החזק בו־זמנית את המודעות לביקורת וגם לחמלה."), true);
  assert.equal(containsInductionPattern("החזק בו זמנית את המודעות לביקורת וגם לחמלה."), true);
});

test("audit catches other induction-style phrasings", () => {
  assert.equal(containsInductionPattern("תיזכר ברגע שבו הרגשת ביקורת עצמית חזקה."), true);
  assert.equal(containsInductionPattern("דמיין את עצמך מרגיש חרדה."), true);
  assert.equal(containsInductionPattern("תחזק את תחושת הביקורת לרגע."), true);
});

test("audit does not flag the corrected instructions", () => {
  assert.equal(containsInductionPattern(getAwarenessInstruction()), false);
  assert.equal(containsInductionPattern(getCombinedAttentionInstruction()), false);
  assert.equal(containsInductionPattern(getExpandPresenceInstruction()), false);
});

test("audit catches an instruction that tells the trainee to search for sound", () => {
  assert.equal(containsInductionPattern("חפש בכוונה צלילים בסביבה שלך."), true);
  assert.equal(containsInductionPattern("חפש קול ספציפי להתמקד בו."), true);
});

test("audit catches an instruction that tells the trainee to generate/create sound", () => {
  assert.equal(containsInductionPattern("צור בעצמך צליל בראש שלך."), true);
  assert.equal(containsInductionPattern("ייצר קול פנימי כדי להתמקד בו."), true);
});

test("audit catches an instruction that forces intense focus onto sound", () => {
  assert.equal(containsInductionPattern("התמקד בחוזקה בקול שאתה שומע."), true);
  assert.equal(containsInductionPattern("התמקד בכוח בצליל הזה."), true);
});
