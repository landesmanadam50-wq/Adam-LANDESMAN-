import test from "node:test";
import assert from "node:assert/strict";
import { ARC_CONFIG, validateArcConfig } from "./config.ts";

test("the shipped ARC_CONFIG passes its own invariant check", () => {
  assert.deepEqual(validateArcConfig(), []);
});

test("flags encodingMaxIntensity not being below regulationMinIntensity", () => {
  const broken = { ...ARC_CONFIG, reactive: { ...ARC_CONFIG.reactive, encodingMaxIntensity: 4, regulationMinIntensity: 4 } };
  const issues = validateArcConfig(broken);
  assert.ok(issues.some((i) => i.includes("encodingMaxIntensity")));
});

test("flags regulationMinIntensity not being below transitionMinIntensity", () => {
  const broken = { ...ARC_CONFIG, reactive: { ...ARC_CONFIG.reactive, regulationMinIntensity: 6, transitionMinIntensity: 6 } };
  const issues = validateArcConfig(broken);
  assert.ok(issues.some((i) => i.includes("regulationMinIntensity")));
});

test("flags transitionMinIntensity not being below stayMinIntensity", () => {
  const broken = { ...ARC_CONFIG, reactive: { ...ARC_CONFIG.reactive, transitionMinIntensity: 8, stayMinIntensity: 8 } };
  const issues = validateArcConfig(broken);
  assert.ok(issues.some((i) => i.includes("transitionMinIntensity")));
});

test("a fully out-of-order config surfaces all three issues", () => {
  const broken = { ...ARC_CONFIG, reactive: { stayMinIntensity: 2, transitionMinIntensity: 4, regulationMinIntensity: 6, encodingMaxIntensity: 8 } };
  assert.equal(validateArcConfig(broken).length, 3);
});
