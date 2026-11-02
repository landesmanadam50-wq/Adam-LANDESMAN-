import test from "node:test";
import assert from "node:assert/strict";

import { containsInductionPattern } from "./instructions.ts";
import { PREDEFINED_EMOTIONS } from "./emotionIdentification.ts";
import { getPredefinedEmotionProtocolSteps } from "./predefinedEmotionProtocols.ts";

test("every predefined emotion has exactly 3 steps (the spec's own 'no more than three exercises' rule)", () => {
  for (const emotion of PREDEFINED_EMOTIONS) {
    const steps = getPredefinedEmotionProtocolSteps(emotion, "לפתוח את המחשב");
    assert.equal(steps.length, 3, `emotion ${emotion} must have exactly 3 steps`);
    for (const step of steps) assert.ok(step.trim().length > 0);
  }
});

test("every step for every emotion is safety-clean -- never trips the induction-pattern denylist", () => {
  for (const emotion of PREDEFINED_EMOTIONS) {
    const steps = getPredefinedEmotionProtocolSteps(emotion, "לכתוב פסקה אחת ולשלוח");
    for (const step of steps) {
      assert.equal(containsInductionPattern(step), false, `emotion ${emotion}'s step "${step}" must not trip the denylist`);
    }
  }
});

test("every protocol's final step imagines starting the task's own configured first action, using the sanctioned phrasing", () => {
  for (const emotion of PREDEFINED_EMOTIONS) {
    const steps = getPredefinedEmotionProtocolSteps(emotion, "לכתוב פסקה אחת");
    assert.match(steps[2], /^דמיין את עצמך מתחיל/);
    assert.ok(steps[2].includes("לכתוב פסקה אחת"));
  }
});

test("shame's middle step reads the task's own saved value verbatim when present, identity when only that is present, and a generic safe line when neither is set -- never invented content", () => {
  const withValue = getPredefinedEmotionProtocolSteps("shame", "לשלוח מייל", "כנות", null);
  assert.ok(withValue[1].includes("כנות"));

  const withIdentity = getPredefinedEmotionProtocolSteps("shame", "לשלוח מייל", null, "אדם אחראי");
  assert.ok(withIdentity[1].includes("אדם אחראי"));

  const withNeither = getPredefinedEmotionProtocolSteps("shame", "לשלוח מייל", null, null);
  assert.equal(containsInductionPattern(withNeither[1]), false);
  assert.ok(withNeither[1].length > 0);
});
