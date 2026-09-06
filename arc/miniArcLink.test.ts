import test from "node:test";
import assert from "node:assert/strict";

import { buildMiniArcLinkSteps } from "./miniArcLink.ts";
import type { MiniArcLinkStepId } from "./miniArcLink.ts";
import type { MiniArcBuild } from "./miniArc.ts";
// NOTE: see arc/arcLink.test.ts for why arc/instructions.ts's
// containsInductionPattern (which bans "דמיין" outright) is not reused
// here -- Mini ARC Link's copy is guided imagery by design. The real
// safety property the spec asks for -- never create/strengthen/hold an
// interfering state -- is checked directly via this narrower pattern set.
const FORBIDDEN_INTERFERING_STATE_PATTERNS = [
  /תחזיק את .* (במודעות|בתודעה|בראש)/,
  /(תביא|הבא) .*למודעות/,
  /(תשמור|השאר) .* (פעיל|פעילה|פעילים)/,
];

function build(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "עצירה מול דחף",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "סגול",
    regulationAnchor: "הרגש את כפות הרגליים על הקרקע.",
    encodingAction: "ליישר בעדינות את הגב",
    beneficialAction: "להרחיק את היד מהאוזן ולהניח אותה על הרגל.",
    linkSettings: { enabled: true, triggerType: "time", triggerText: "בשעה 10:00" },
    ...overrides,
  };
}

function stepIds(b: MiniArcBuild): MiniArcLinkStepId[] {
  return buildMiniArcLinkSteps(b).map((s) => s.id);
}

test("buildMiniArcLinkSteps produces the exact fixed 9-step order from the spec, never adding normal-ARC stages", () => {
  assert.deepEqual(stepIds(build()), [
    "intro",
    "trigger",
    "enter_archi",
    "presence_color",
    "name_state",
    "regulation",
    "encoding",
    "beneficial_action",
    "reinforce",
  ]);
});

test("Mini ARC Link never includes Presence rating, full Presence stages, long Awareness, a separate Acceptance process, Updated Sensation, Action Imagery, Success Focus, or Gratitude", () => {
  const ids = stepIds(build());
  for (const forbidden of ["presence_rating", "awareness", "acceptance", "updated_sensation", "action_imagery", "success_focus", "gratitude"]) {
    assert.ok(!ids.includes(forbidden as MiniArcLinkStepId), forbidden);
  }
  const allText = buildMiniArcLinkSteps(build())
    .map((s) => `${s.title} ${s.lines.join(" ")}`)
    .join(" ");
  assert.ok(!allText.includes("בסולם"), "no rating question anywhere");
});

test("intro/trigger/reinforce insert the CURRENT build's own saved trigger dynamically", () => {
  const b = build({ linkSettings: { enabled: true, triggerType: "after_action", triggerText: "אחרי שאני מצחצח שיניים" } });
  const steps = buildMiniArcLinkSteps(b);
  assert.match(steps.find((s) => s.id === "trigger")!.lines.join(" "), /אחרי שאני מצחצח שיניים/);
  assert.match(steps.find((s) => s.id === "reinforce")!.lines.join(" "), /אחרי שאני מצחצח שיניים/);
});

test("Presence Color imagery step inserts the CURRENT build's own saved color dynamically -- never hard-coded", () => {
  const purple = build({ presenceColor: "סגול" });
  const green = build({ presenceColor: "ירוק" });
  const purpleText = buildMiniArcLinkSteps(purple).find((s) => s.id === "presence_color")!.lines.join(" ");
  const greenText = buildMiniArcLinkSteps(green).find((s) => s.id === "presence_color")!.lines.join(" ");
  assert.match(purpleText, /סגול/);
  assert.ok(!purpleText.includes("ירוק"));
  assert.match(greenText, /ירוק/);
});

test("regulation/encoding steps carry body imagery derived from the saved anchor/action text, matching presets when applicable", () => {
  const b = build({ regulationAnchor: "הרגש את כפות הרגליים על הקרקע.", encodingAction: "ליישר בעדינות את הגב" });
  const steps = buildMiniArcLinkSteps(b);
  const regulation = steps.find((s) => s.id === "regulation")!;
  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.deepEqual(regulation.bodyImagery?.imagery.bodyParts, ["כפות הרגליים"]);
  assert.deepEqual(encoding.bodyImagery?.imagery.bodyParts, ["הגב", "עמוד השדרה"]);
});

test("custom body parts appear in the correct regulation/encoding imagery step when the saved text doesn't match a preset", () => {
  const b = build({
    regulationAnchor: "עוגן מומצא",
    regulationBodyImagery: { bodyParts: ["הידיים"], imageryText: "דמיון מותאם לוויסות." },
    encodingAction: "קידוד מומצא",
    encodingBodyImagery: { bodyParts: ["הרגליים"], imageryText: "דמיון מותאם לקידוד." },
  });
  const steps = buildMiniArcLinkSteps(b);
  assert.deepEqual(steps.find((s) => s.id === "regulation")!.bodyImagery?.imagery.bodyParts, ["הידיים"]);
  assert.deepEqual(steps.find((s) => s.id === "encoding")!.bodyImagery?.imagery.bodyParts, ["הרגליים"]);
});

test("beneficial_action shows the correct saved action, and the trigger-to-action connection is reinforced at the end", () => {
  const b = build({ beneficialAction: "להרחיק את היד מהאוזן." });
  const steps = buildMiniArcLinkSteps(b);
  assert.match(steps.find((s) => s.id === "beneficial_action")!.lines.join(" "), /להרחיק את היד מהאוזן\./);
  assert.match(steps.find((s) => s.id === "reinforce")!.lines.join(" "), /להרחיק את היד מהאוזן\./);
  assert.equal(steps[steps.length - 1].id, "reinforce", "the final connection is always the last step");
});

test("no forbidden interfering-state create/strengthen/hold pattern anywhere in Mini ARC Link's copy", () => {
  const steps = buildMiniArcLinkSteps(build({ regulationAnchor: "עוגן כלשהו" }));
  for (const step of steps) {
    const text = `${step.title} ${step.lines.join(" ")}`;
    for (const pattern of FORBIDDEN_INTERFERING_STATE_PATTERNS) {
      assert.equal(pattern.test(text), false, `${step.id}: ${pattern}`);
    }
  }
});

test("never renders 'undefined'/'null'/'NaN'/'[object Object]' for a minimally-filled build", () => {
  const b = build({ presenceColor: "", regulationAnchor: "", encodingAction: "", beneficialAction: "" });
  const steps = buildMiniArcLinkSteps(b);
  for (const step of steps) {
    const text = `${step.title} ${step.lines.join(" ")} ${step.bodyImagery?.imagery.imageryText ?? ""}`;
    for (const forbidden of ["undefined", "null", "NaN", "[object Object]"]) {
      assert.ok(!text.includes(forbidden), `${step.id}: "${text}"`);
    }
  }
});

test("a legacy Mini ARC with no linkSettings/regulationBodyImagery/encodingBodyImagery at all (fields genuinely absent) never crashes buildMiniArcLinkSteps", () => {
  const legacy = build();
  delete (legacy as { linkSettings?: unknown }).linkSettings;
  delete (legacy as { regulationBodyImagery?: unknown }).regulationBodyImagery;
  delete (legacy as { encodingBodyImagery?: unknown }).encodingBodyImagery;
  assert.doesNotThrow(() => buildMiniArcLinkSteps(legacy));
});
