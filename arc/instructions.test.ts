import test from "node:test";
import assert from "node:assert/strict";

import {
  getAwarenessInstruction,
  getCombinedAttentionInstruction,
  getExpandPresenceInstruction,
  getEncodingInstruction,
  getChallengeContextRecognitionPrompt,
  getInterferingStateRecognitionPrompt,
  containsInductionPattern,
} from "./instructions.ts";

test("Awareness instruction never mentions a specific interfering or desired state", () => {
  const text = getAwarenessInstruction();
  assert.equal(getAwarenessInstruction.length, 0, "function must take no parameters");
  assert.match(text, /שים לב למה שכבר נמצא עכשיו/);
});

test("Combined Attention instruction combines current-experience + visual anchor + body - never two named states", () => {
  assert.equal(getCombinedAttentionInstruction.length, 0, "function must take no parameters");
  const text = getCombinedAttentionInstruction();
  assert.equal(containsInductionPattern(text), false);
});

test("Combined Attention includes ambient sound as a passive additional anchor, alongside the visual point and the body", () => {
  const text = getCombinedAttentionInstruction();
  assert.match(text, /לצלילים מסביב/);
  assert.match(text, /לנקודה אחת מולך/);
  assert.match(text, /לתחושה של הגוף כולו/);
});

test("Expand Presence instruction takes no state parameters either", () => {
  assert.equal(getExpandPresenceInstruction.length, 0, "function must take no parameters");
});

test("Expand Presence lets sound stay in the background, not a new focal point", () => {
  assert.match(getExpandPresenceInstruction(), /אפשר לצלילים להישאר ברקע/);
});

test("Encoding instruction intentionally includes the desired state and identity", () => {
  const text = getEncodingInstruction({
    desiredState: "חמלה",
    identity: "אדם חומל ומשמעתי",
    encodingCue: "כתפיים משוחררות, מבט רך.",
    action: "לעצור ולשים יד על הלב",
  });
  assert.match(text, /חמלה/);
  assert.match(text, /אדם חומל ומשמעתי/);
  assert.match(text, /לעצור ולשים יד על הלב/);
});

test("Interfering state recognition prompt is a yes/no question, not an instruction to hold it", () => {
  const text = getInterferingStateRecognitionPrompt("ביקורת עצמית");
  assert.match(text, /\?/, "must be phrased as a question");
  assert.equal(containsInductionPattern(text), false);
});

test("Challenge context recognition prompt is a yes/no question", () => {
  const text = getChallengeContextRecognitionPrompt("אחרי טעות");
  assert.match(text, /\?/);
});

test("audit catches the exact old combined-attention bug string from the spec", () => {
  const oldBuggyInstruction = "תשומת לב משולבת — החזק בו־זמנית את המודעות לביקורת וגם לחמלה.";
  assert.equal(containsInductionPattern(oldBuggyInstruction), true);
});

test("audit catches the same bug written with a plain ASCII hyphen -- the character actually used in the shipped app", () => {
  const shippedBuggyInstruction = "החזק בו-זמנית את המודעות ל-ביקורת עצמית וגם ל-חמלה.";
  assert.equal(containsInductionPattern(shippedBuggyInstruction), true);
});

test("audit catches other induction-style phrasings", () => {
  assert.equal(containsInductionPattern("תיזכר ברגע שבו הרגשת ביקורת עצמית חזקה."), true);
  assert.equal(containsInductionPattern("דמיין את עצמך מרגיש חרדה."), true);
  assert.equal(containsInductionPattern("תחזק את תחושת הביקורת לרגע."), true);
});

test("audit does not flag the corrected awareness/encoding instructions", () => {
  assert.equal(containsInductionPattern(getAwarenessInstruction()), false);
  assert.equal(containsInductionPattern(getCombinedAttentionInstruction()), false);
  assert.equal(containsInductionPattern(getExpandPresenceInstruction()), false);
  assert.equal(
    containsInductionPattern(
      getEncodingInstruction({ desiredState: "חמלה", identity: "אדם חומל", action: "לעצור לרגע" })
    ),
    false
  );
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

test("audit catches 'remember the criticism' phrased as an imperative, not just the reflexive form", () => {
  assert.equal(containsInductionPattern("תזכור את הביקורת שהרגשת קודם."), true);
  assert.equal(containsInductionPattern("זכור את הרגע שבו הרגשת חרדה."), true);
});

test("audit catches an instruction to bring the interfering state into awareness", () => {
  assert.equal(containsInductionPattern("תביא את הביקורת העצמית למודעות."), true);
  assert.equal(containsInductionPattern("הבא את הרגש הקשה למודעות שלך."), true);
});

test("audit catches an instruction to keep the interfering state active", () => {
  assert.equal(containsInductionPattern("תשמור על המצב הזה פעיל."), true);
  assert.equal(containsInductionPattern("השאר את הביקורת פעילה."), true);
});

test("audit catches 'hold it in the head/consciousness', not only 'in awareness'", () => {
  assert.equal(containsInductionPattern("תחזיק את הביקורת בראש."), true);
  assert.equal(containsInductionPattern("תחזיק את החרדה בתודעה."), true);
});

test("audit catches an instruction claiming the trainee is now calmer -- Regulation/Encoding must stay neutral about outcome", () => {
  assert.equal(containsInductionPattern("שים לב כמה אתה רגוע יותר עכשיו."), true);
});

test("audit does not flag legitimate recognition prompts that simply name the mapped state or context", () => {
  assert.equal(containsInductionPattern(getInterferingStateRecognitionPrompt("ביקורת עצמית")), false);
  assert.equal(containsInductionPattern(getChallengeContextRecognitionPrompt("אחרי טעות")), false);
});
