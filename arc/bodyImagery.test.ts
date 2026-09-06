import test from "node:test";
import assert from "node:assert/strict";

import {
  bodyImageryFromCustomFields,
  createEmptyArcLinkSettings,
  getBodyImageryForText,
  getGenericBodyImagery,
  hasConfiguredTrigger,
  safeTriggerText,
} from "./bodyImagery.ts";
import type { ArcLinkSettings, BodyImagery } from "./bodyImagery.ts";

// ---------------------------------------------------------------------------
// hasConfiguredTrigger / safeTriggerText
// ---------------------------------------------------------------------------

test("hasConfiguredTrigger is true only for an enabled settings record with real, non-blank trigger text", () => {
  assert.equal(hasConfiguredTrigger(null), false);
  assert.equal(hasConfiguredTrigger(undefined), false);
  assert.equal(hasConfiguredTrigger(createEmptyArcLinkSettings()), false, "empty trigger text -- disabled by construction");
  assert.equal(hasConfiguredTrigger({ enabled: false, triggerType: "time", triggerText: "בשעה 10:00" }), false, "enabled=false blocks it even with real text");
  assert.equal(hasConfiguredTrigger({ enabled: true, triggerType: "time", triggerText: "   " }), false, "whitespace-only never counts");
  assert.equal(hasConfiguredTrigger({ enabled: true, triggerType: "time", triggerText: "בשעה 10:00" }), true);
});

test("safeTriggerText never throws or returns undefined/null-ish text for a missing/malformed settings record", () => {
  assert.equal(safeTriggerText(null), "");
  assert.equal(safeTriggerText(undefined), "");
  assert.equal(safeTriggerText({ enabled: true, triggerType: "time", triggerText: "  בשעה 10:00  " }), "בשעה 10:00");
  const malformed = { enabled: true, triggerType: "time" } as unknown as ArcLinkSettings;
  assert.equal(safeTriggerText(malformed), "", "a genuinely missing triggerText field never crashes or renders 'undefined'");
});

test("different protocols keep different triggers -- two independent ArcLinkSettings records never bleed into each other", () => {
  const a: ArcLinkSettings = { enabled: true, triggerType: "time", triggerText: "בשעה 10:00" };
  const b: ArcLinkSettings = { enabled: true, triggerType: "after_action", triggerText: "אחרי שאני מצחצח שיניים" };
  assert.equal(safeTriggerText(a), "בשעה 10:00");
  assert.equal(safeTriggerText(b), "אחרי שאני מצחצח שיניים");
  assert.notEqual(safeTriggerText(a), safeTriggerText(b));
});

// ---------------------------------------------------------------------------
// Body imagery derivation
// ---------------------------------------------------------------------------

test("getGenericBodyImagery never invents meaning, echoes the trainee's own label verbatim, and is always safe/displayable", () => {
  const withLabel = getGenericBodyImagery("לגשת ולפתוח שיחה");
  assert.match(withLabel.imageryText, /לגשת ולפתוח שיחה/);
  assert.deepEqual(withLabel.bodyParts, []);

  const withoutLabel = getGenericBodyImagery(null);
  assert.ok(withoutLabel.imageryText.length > 0);
  assert.ok(!withoutLabel.imageryText.includes("undefined"));
  assert.ok(!withoutLabel.imageryText.includes("null"));
});

test("getBodyImageryForText matches a known preset by exact saved text -- both Mini ARC's own presets and the spec's own named examples", () => {
  const feet = getBodyImageryForText("הרגש את כפות הרגליים על הקרקע.", null);
  assert.deepEqual(feet.bodyParts, ["כפות הרגליים"]);

  const belly = getBodyImageryForText("נשימה דרך הבטן", null);
  assert.deepEqual(belly.bodyParts, ["האף", "הבטן"]);
  assert.match(belly.imageryText, /הבטן/);

  const straightBack = getBodyImageryForText("יישור הגב", null);
  assert.deepEqual(straightBack.bodyParts, ["הגב", "עמוד השדרה"]);

  const miniArcBack = getBodyImageryForText("ליישר בעדינות את הגב", null);
  assert.deepEqual(miniArcBack.bodyParts, ["הגב", "עמוד השדרה"]);
});

test("getBodyImageryForText falls back to the trainee's own custom body imagery when the saved text doesn't match any known preset", () => {
  const custom: BodyImagery = { bodyParts: ["הידיים"], imageryText: "דמיין את הידיים נרגעות." };
  const result = getBodyImageryForText("עוגן ויסות שהמצאתי בעצמי", custom);
  assert.deepEqual(result, custom);
});

test("getBodyImageryForText falls back to a safe generic instruction when there's no preset match and no custom imagery", () => {
  const result = getBodyImageryForText("עוגן ויסות שהמצאתי בעצמי", null);
  assert.match(result.imageryText, /עוגן ויסות שהמצאתי בעצמי/);
  assert.deepEqual(result.bodyParts, []);
});

test("getBodyImageryForText is always safe (never throws, never 'undefined'/'null') for blank or missing saved text", () => {
  for (const value of [null, undefined, "", "   "]) {
    const result = getBodyImageryForText(value, null);
    assert.ok(result.imageryText.length > 0);
    assert.ok(!result.imageryText.includes("undefined"));
    assert.ok(!result.imageryText.includes("null"));
  }
});

test("getBodyImageryForText ignores a custom BodyImagery that is present but genuinely empty (malformed/legacy shell)", () => {
  const emptyCustom: BodyImagery = { bodyParts: [], imageryText: "" };
  const result = getBodyImageryForText("עוגן לא ידוע", emptyCustom);
  assert.notDeepEqual(result, emptyCustom, "an empty custom imagery is never used as-is");
  assert.ok(result.imageryText.length > 0);
});

// ---------------------------------------------------------------------------
// bodyImageryFromCustomFields
// ---------------------------------------------------------------------------

test("bodyImageryFromCustomFields parses comma/newline-separated body parts and trims a free-text movement description", () => {
  const result = bodyImageryFromCustomFields("הבטן, האף\nהחזה", "  דמיין נשימה עמוקה.  ");
  assert.deepEqual(result?.bodyParts, ["הבטן", "האף", "החזה"]);
  assert.equal(result?.imageryText, "דמיין נשימה עמוקה.");
});

test("bodyImageryFromCustomFields returns null when both fields are blank -- never an empty, misleading object", () => {
  assert.equal(bodyImageryFromCustomFields("", ""), null);
  assert.equal(bodyImageryFromCustomFields("   ", "  "), null);
});

test("bodyImageryFromCustomFields returns a real object when only one field has content", () => {
  const onlyParts = bodyImageryFromCustomFields("הידיים", "");
  assert.deepEqual(onlyParts, { bodyParts: ["הידיים"], imageryText: "" });
  const onlyText = bodyImageryFromCustomFields("", "דמיין תנועה עדינה.");
  assert.deepEqual(onlyText, { bodyParts: [], imageryText: "דמיין תנועה עדינה." });
});

test("missing body-imagery metadata never causes a crash -- custom fields with only whitespace/empty entries are filtered out cleanly", () => {
  const result = bodyImageryFromCustomFields(",, ,", "");
  assert.equal(result, null);
});
