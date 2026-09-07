import test from "node:test";
import assert from "node:assert/strict";

import { buildArcLinkPreviewText } from "./arcLinkPreview.ts";
import type { ArcLinkPreviewInputs } from "./arcLinkPreview.ts";

function inputs(overrides: Partial<ArcLinkPreviewInputs> = {}): ArcLinkPreviewInputs {
  return {
    triggerText: "",
    cueText: "",
    supportiveStateText: "",
    identityText: "",
    valueText: "",
    futureMantraText: "",
    actionText: "",
    ...overrides,
  };
}

test("full example from the spec produces the exact 5-line structure", () => {
  const text = buildArcLinkPreviewText(
    inputs({
      triggerText: "רואה חטיף על השולחן",
      cueText: "נשימה אחת עמוקה",
      supportiveStateText: "אנרגיה ויציבות",
      identityText: "אדם ששומר על הגוף שלו",
      valueText: "בריאות וחופש",
      futureMantraText: "בריאות חשובה לי. אני אדם ששומר על הגוף שלו, ועכשיו אני מתחיל לפעול.",
      actionText: "להתחיל שתי דקות של פעילות גופנית",
    })
  );
  const lines = text.split("\n");
  assert.equal(lines.length, 5);
  assert.equal(lines[0], "כאשר רואה חטיף על השולחן מופיע, אני מבצע נשימה אחת עמוקה.");
  assert.equal(lines[1], "הפעולה מחברת אותי ל־אנרגיה ויציבות.");
  assert.equal(lines[2], "מתוך המצב הזה אני מבטא את הזהות אדם ששומר על הגוף שלו, מתוך הערך בריאות וחופש.");
  assert.equal(lines[3], 'אני משתמש במנטרה העתידית: "בריאות חשובה לי. אני אדם ששומר על הגוף שלו, ועכשיו אני מתחיל לפעול.".');
  assert.equal(lines[4], "ואז מתחיל את הפעולה: להתחיל שתי דקות של פעילות גופנית.");
});

test("omits the supportive-state / identity+value / mantra lines individually when not configured, never leaving a blank or dangling line", () => {
  const text = buildArcLinkPreviewText(inputs({ triggerText: "טריגר", cueText: "רמז", actionText: "פעולה" }));
  const lines = text.split("\n");
  assert.equal(lines.length, 2, "only the always-present trigger+cue line and the always-present action line remain");
  assert.equal(lines[0], "כאשר טריגר מופיע, אני מבצע רמז.");
  assert.equal(lines[1], "ואז מתחיל את הפעולה: פעולה.");
});

test("identity alone (no value) produces the identity-only sentence, never a dangling ', מתוך הערך .'", () => {
  const text = buildArcLinkPreviewText(inputs({ identityText: "אדם ממושמע" }));
  assert.ok(text.includes("מתוך המצב הזה אני מבטא את הזהות אדם ממושמע."));
  assert.ok(!text.includes("מתוך הערך"));
});

test("value alone (no identity) produces a value-only sentence", () => {
  const text = buildArcLinkPreviewText(inputs({ valueText: "בריאות" }));
  assert.ok(text.includes("אני פועל מתוך הערך בריאות."));
  assert.ok(!text.includes("מבטא את הזהות"));
});

test("completely empty inputs still produce safe, non-crashing generic text -- never 'undefined'/'null'", () => {
  const text = buildArcLinkPreviewText(inputs());
  for (const forbidden of ["undefined", "null", "NaN", "[object Object]"]) {
    assert.ok(!text.includes(forbidden));
  }
  assert.match(text, /כאשר הטריגר שלך מופיע/);
  assert.match(text, /ואז מתחיל את הפעולה: הפעולה המיטיבה שלי\./);
});

test("changing one component changes only its own line -- the preview reacts to each field independently", () => {
  const base = inputs({ triggerText: "טריגר", cueText: "רמז", identityText: "זהות א", actionText: "פעולה" });
  const changed = { ...base, identityText: "זהות ב" };
  const textBase = buildArcLinkPreviewText(base);
  const textChanged = buildArcLinkPreviewText(changed);
  assert.ok(textBase.includes("זהות א"));
  assert.ok(textChanged.includes("זהות ב"));
  assert.ok(!textChanged.includes("זהות א"));
  // Everything else stays identical.
  assert.equal(textBase.split("\n")[0], textChanged.split("\n")[0]);
});
