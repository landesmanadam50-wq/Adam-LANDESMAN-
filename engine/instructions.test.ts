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

test("Expand Presence instruction takes no parameters either", () => {
  assert.equal(getExpandPresenceInstruction.length, 0, "function must take no parameters");
  assert.equal(containsInductionPattern(getExpandPresenceInstruction()), false);
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
