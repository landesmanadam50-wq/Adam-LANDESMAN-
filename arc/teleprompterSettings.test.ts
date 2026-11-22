import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultTeleprompterSettings,
  isValidTeleprompterFontSize,
  isValidTeleprompterScrollSpeed,
  isValidTeleprompterTextPositionOffset,
  normalizeTeleprompterSettings,
  validateTeleprompterSettings,
  DEFAULT_TELEPROMPTER_FONT_SIZE,
  DEFAULT_TELEPROMPTER_SCROLL_SPEED_SECONDS_PER_LINE,
  DEFAULT_TELEPROMPTER_TEXT_POSITION_OFFSET,
} from "./teleprompterSettings.ts";

test("createDefaultTeleprompterSettings returns the documented defaults", () => {
  assert.deepEqual(createDefaultTeleprompterSettings(), {
    fontSize: DEFAULT_TELEPROMPTER_FONT_SIZE,
    scrollSpeedSecondsPerLine: DEFAULT_TELEPROMPTER_SCROLL_SPEED_SECONDS_PER_LINE,
    textPositionOffset: DEFAULT_TELEPROMPTER_TEXT_POSITION_OFFSET,
  });
});

test("isValidTeleprompterFontSize accepts only integers in [12, 72]", () => {
  assert.ok(isValidTeleprompterFontSize(24));
  assert.ok(isValidTeleprompterFontSize(12));
  assert.ok(isValidTeleprompterFontSize(72));
  assert.ok(!isValidTeleprompterFontSize(11));
  assert.ok(!isValidTeleprompterFontSize(73));
  assert.ok(!isValidTeleprompterFontSize(20.5));
});

test("isValidTeleprompterScrollSpeed accepts only positive finite numbers up to 30", () => {
  assert.ok(isValidTeleprompterScrollSpeed(3));
  assert.ok(isValidTeleprompterScrollSpeed(0.5));
  assert.ok(isValidTeleprompterScrollSpeed(30));
  assert.ok(!isValidTeleprompterScrollSpeed(0));
  assert.ok(!isValidTeleprompterScrollSpeed(-1));
  assert.ok(!isValidTeleprompterScrollSpeed(31));
  assert.ok(!isValidTeleprompterScrollSpeed(Number.NaN));
});

test("isValidTeleprompterTextPositionOffset accepts only [0, 0.6]", () => {
  assert.ok(isValidTeleprompterTextPositionOffset(0));
  assert.ok(isValidTeleprompterTextPositionOffset(0.1));
  assert.ok(isValidTeleprompterTextPositionOffset(0.6));
  assert.ok(!isValidTeleprompterTextPositionOffset(-0.01));
  assert.ok(!isValidTeleprompterTextPositionOffset(0.61));
});

test("validateTeleprompterSettings returns no errors for valid settings", () => {
  assert.deepEqual(validateTeleprompterSettings(createDefaultTeleprompterSettings()), []);
});

test("validateTeleprompterSettings flags each invalid field independently", () => {
  const errors = validateTeleprompterSettings({ fontSize: 5, scrollSpeedSecondsPerLine: -1, textPositionOffset: 2 });
  assert.equal(errors.length, 3);
});

test("normalizeTeleprompterSettings returns defaults for null/undefined", () => {
  assert.deepEqual(normalizeTeleprompterSettings(null), createDefaultTeleprompterSettings());
  assert.deepEqual(normalizeTeleprompterSettings(undefined), createDefaultTeleprompterSettings());
});

test("normalizeTeleprompterSettings falls back to the default for any individually invalid/missing field, keeping the rest", () => {
  const defaults = createDefaultTeleprompterSettings();
  assert.deepEqual(normalizeTeleprompterSettings({ fontSize: 9999 }), defaults);
  assert.deepEqual(normalizeTeleprompterSettings({ scrollSpeedSecondsPerLine: -5 }), defaults);
  assert.deepEqual(normalizeTeleprompterSettings({ textPositionOffset: 99 }), defaults);
  assert.deepEqual(normalizeTeleprompterSettings({ fontSize: 32, scrollSpeedSecondsPerLine: 2, textPositionOffset: 0.2 }), {
    fontSize: 32,
    scrollSpeedSecondsPerLine: 2,
    textPositionOffset: 0.2,
  });
});

test("normalizeTeleprompterSettings never throws on a malformed partial object", () => {
  assert.doesNotThrow(() => normalizeTeleprompterSettings({ fontSize: "big" as unknown as number }));
});
