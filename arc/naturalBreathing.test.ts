import test from "node:test";
import assert from "node:assert/strict";

import { getFreeBreathingLine } from "./naturalBreathing.ts";

test("getFreeBreathingLine returns the exact fixed sentence, verbatim", () => {
  assert.equal(getFreeBreathingLine(), "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.");
});

test("getFreeBreathingLine never instructs to deepen/slow/control/extend the breath -- notice only", () => {
  const line = getFreeBreathingLine();
  for (const forbidden of ["האט", "העמק", "שלוט", "האריך", "שנה את הנשימה"]) {
    assert.ok(!line.includes(forbidden), `must never contain: "${forbidden}"`);
  }
  assert.match(line, /בלי לנסות לשנות אותה/, "must explicitly say not to try to change it");
});

test("getFreeBreathingLine is a pure, parameterless, always-identical function", () => {
  assert.equal(getFreeBreathingLine(), getFreeBreathingLine());
});
