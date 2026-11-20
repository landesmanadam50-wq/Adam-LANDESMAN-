import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PRESENCE_COLOR, FOCUS_COLOR_HEX, resolveFocusColorHex } from "./focusColorPalette.ts";
import { FOCUS_COLOR_OPTIONS } from "./newArcLiveTypes.ts";

test("every FOCUS_COLOR_OPTIONS preset has its own distinct real color", () => {
  const seen = new Set<string>();
  for (const option of FOCUS_COLOR_OPTIONS) {
    const hex = FOCUS_COLOR_HEX[option];
    assert.ok(hex, `${option} must have a mapped color`);
    assert.ok(!seen.has(hex), `${option}'s color must be distinct from every other preset's`);
    seen.add(hex);
  }
});

test("resolveFocusColorHex resolves every preset to its own mapped color", () => {
  for (const option of FOCUS_COLOR_OPTIONS) {
    assert.equal(resolveFocusColorHex(option), FOCUS_COLOR_HEX[option]);
  }
});

test("resolveFocusColorHex falls back to the app's own default accent color for null, blank, or unrecognized free-typed text -- never inventing a color association", () => {
  assert.equal(resolveFocusColorHex(null), DEFAULT_PRESENCE_COLOR);
  assert.equal(resolveFocusColorHex(""), DEFAULT_PRESENCE_COLOR);
  assert.equal(resolveFocusColorHex("   "), DEFAULT_PRESENCE_COLOR);
  assert.equal(resolveFocusColorHex("ורוד זוהר"), DEFAULT_PRESENCE_COLOR);
});

test("the white preset ('לבן') resolves to a visible light gray, never pure white, so it is never invisible against the app's own white background", () => {
  assert.notEqual(resolveFocusColorHex("לבן"), "#FFFFFF");
  assert.notEqual(resolveFocusColorHex("לבן"), "#fff");
});
