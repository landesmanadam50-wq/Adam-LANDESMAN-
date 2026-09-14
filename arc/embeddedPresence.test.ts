import test from "node:test";
import assert from "node:assert/strict";

import {
  EMBEDDED_PRESENCE_STAGE_ORDER,
  getEmbeddedPresenceStageCopy,
  getFirstEmbeddedPresenceStage,
  getNextEmbeddedPresenceStage,
  isEmbeddedPresenceComplete,
} from "./embeddedPresence.ts";
import type { EmbeddedPresenceStage } from "./embeddedPresence.ts";
import { getFreeBreathingLine } from "./naturalBreathing.ts";

test("getFirstEmbeddedPresenceStage starts at visual_field", () => {
  assert.equal(getFirstEmbeddedPresenceStage(), "visual_field");
});

test("EMBEDDED_PRESENCE_STAGE_ORDER is the exact four steps plus complete, in order", () => {
  assert.deepEqual(EMBEDDED_PRESENCE_STAGE_ORDER, ["visual_field", "body_contact", "natural_breathing", "present_environment", "complete"]);
});

test("getNextEmbeddedPresenceStage walks the full sequence linearly, matching EMBEDDED_PRESENCE_STAGE_ORDER", () => {
  let stage: EmbeddedPresenceStage = getFirstEmbeddedPresenceStage();
  const visited: EmbeddedPresenceStage[] = [stage];
  for (let i = 0; i < EMBEDDED_PRESENCE_STAGE_ORDER.length - 1; i++) {
    stage = getNextEmbeddedPresenceStage(stage);
    visited.push(stage);
  }
  assert.deepEqual(visited, EMBEDDED_PRESENCE_STAGE_ORDER);
});

test("getNextEmbeddedPresenceStage never advances past complete, and never loops back to an earlier stage", () => {
  assert.equal(getNextEmbeddedPresenceStage("complete"), "complete");
});

test("isEmbeddedPresenceComplete is true only for the complete stage", () => {
  assert.equal(isEmbeddedPresenceComplete("visual_field"), false);
  assert.equal(isEmbeddedPresenceComplete("body_contact"), false);
  assert.equal(isEmbeddedPresenceComplete("natural_breathing"), false);
  assert.equal(isEmbeddedPresenceComplete("present_environment"), false);
  assert.equal(isEmbeddedPresenceComplete("complete"), true);
});

// --- Exact Hebrew copy ---

test("visual_field copy matches exactly", () => {
  assert.equal(getEmbeddedPresenceStageCopy("visual_field"), "אפשר למבט להתרחב בעדינות ולשים לב גם למה שנמצא סביבך.");
});

test("body_contact copy matches exactly", () => {
  assert.equal(getEmbeddedPresenceStageCopy("body_contact"), "שים לב לנקודות המגע של הגוף עם הרצפה, הכיסא או המשטח.");
});

test("present_environment copy matches exactly", () => {
  assert.equal(getEmbeddedPresenceStageCopy("present_environment"), "שים לב לדבר אחד שאתה רואה, לדבר אחד שאתה שומע ולתחושה אחת בגוף.");
});

test("natural_breathing copy reuses getFreeBreathingLine() verbatim -- never a duplicated literal", () => {
  assert.equal(getEmbeddedPresenceStageCopy("natural_breathing"), getFreeBreathingLine());
  assert.equal(getEmbeddedPresenceStageCopy("natural_breathing"), "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.");
});

test("complete has no instruction copy", () => {
  assert.equal(getEmbeddedPresenceStageCopy("complete"), null);
});
