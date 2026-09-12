import test from "node:test";
import assert from "node:assert/strict";

import { buildMiniArcLinkStartConfirmationStep, buildMiniArcLinkSteps, buildProtocolSpecificMiniArcLinkSteps } from "./miniArcLink.ts";
import type { MiniArcLinkStepId } from "./miniArcLink.ts";
import type { ArcMiniProtocolKind, MiniArcBuild } from "./miniArc.ts";
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

// ---------------------------------------------------------------------------
// Weekly Routine + ARC Link management task: the optional ctx (mode +
// externally-sourced trigger text), used by the new Routine-page Practice
// area. Omitted entirely, buildMiniArcLinkSteps behaves exactly as before
// (already covered by every test above, none of which pass a ctx).
// ---------------------------------------------------------------------------

test("ctx.mode 'without_archi' skips enter_archi entirely and reroutes intro/reinforce text away from ARCHI", () => {
  const b = build();
  const steps = buildMiniArcLinkSteps(b, { mode: "without_archi" });
  assert.ok(!steps.some((s) => s.id === "enter_archi"));
  const intro = steps.find((s) => s.id === "intro")!;
  assert.match(intro.lines.join(" "), /Mini ARC האישי שלך מהזיכרון/);
  assert.ok(!intro.lines.join(" ").includes("כניסה ל-ARCHI"));
  const reinforce = steps.find((s) => s.id === "reinforce")!;
  assert.match(reinforce.lines.join(" "), /Mini ARC מהזיכרון/);
  assert.ok(!reinforce.lines.join(" ").includes("אני פותח את ARCHI"));
});

test("ctx.mode 'with_archi' (or omitted) keeps enter_archi -- identical to the default, backward-compatible behavior", () => {
  const b = build();
  const defaultSteps = buildMiniArcLinkSteps(b);
  const explicitSteps = buildMiniArcLinkSteps(b, { mode: "with_archi" });
  assert.deepEqual(defaultSteps, explicitSteps);
  assert.ok(defaultSteps.some((s) => s.id === "enter_archi"));
});

test("ctx.triggerText overrides build.linkSettings' own trigger -- the new Routine-page Practice area sources its trigger from a RoutineTrigger, not the legacy embedded linkSettings", () => {
  const b = build({ linkSettings: { enabled: true, triggerType: "time", triggerText: "בשעה 10:00" } });
  const steps = buildMiniArcLinkSteps(b, { triggerText: "אחרי ארוחת הערב" });
  const trigger = steps.find((s) => s.id === "trigger")!;
  assert.match(trigger.lines.join(" "), /אחרי ארוחת הערב/);
  assert.ok(!trigger.lines.join(" ").includes("בשעה 10:00"));
});

// ---------------------------------------------------------------------------
// Coherent-architecture task (#22/#24 "With ARCHI"): "With ARCHI, Mini ARC
// Link should finish after imagining opening ARCHI, selecting the correct
// Mini ARC and pressing Start" -- buildMiniArcLinkStartConfirmationStep is
// the short ending live/MiniArcLinkScreen.tsx appends after intro/trigger/
// enter_archi for with_archi mode, INSTEAD of the rest of buildMiniArcLinkSteps'
// own sequence. buildMiniArcLinkSteps itself is untouched (already covered
// above) -- purely an additive, caller-level piece.
// ---------------------------------------------------------------------------

test("buildMiniArcLinkStartConfirmationStep produces exactly one step, mentioning pressing Start and the saved trigger, never the full protocol content", () => {
  const step = buildMiniArcLinkStartConfirmationStep({ triggerText: "בשעה 10:00", mode: "with_archi" });
  assert.equal(step.id, "archi_start_confirmation");
  assert.match(step.lines.join(" "), /בשעה 10:00/);
  assert.match(step.title, /התחלה/);
  assert.equal(step.bodyImagery, null);
  assert.equal(step.buttonLabel, "סיום Mini ARC Link");
});

test("buildMiniArcLinkStartConfirmationStep is safe (never 'undefined'/'null') when ctx is omitted or the trigger text is blank", () => {
  const defaultStep = buildMiniArcLinkStartConfirmationStep();
  const blankStep = buildMiniArcLinkStartConfirmationStep({ triggerText: "" });
  for (const step of [defaultStep, blankStep]) {
    const text = `${step.title} ${step.lines.join(" ")}`;
    assert.ok(!text.includes("undefined"));
    assert.ok(!text.includes("null"));
  }
});

// ---------------------------------------------------------------------------
// Phase 2 correction: protocol-specific ARC Mini Link rehearsal (spec section 6)
// ---------------------------------------------------------------------------

test("buildProtocolSpecificMiniArcLinkSteps falls back unchanged to buildMiniArcLinkSteps for a generic (legacy/undifferentiated) Mini ARC", () => {
  const b = build();
  assert.deepEqual(buildProtocolSpecificMiniArcLinkSteps(b), buildMiniArcLinkSteps(b));
  const ctx = { triggerText: "בשעה 10:00", mode: "without_archi" as const };
  assert.deepEqual(buildProtocolSpecificMiniArcLinkSteps(b, ctx), buildMiniArcLinkSteps(b, ctx));
});

const PROTOCOL_KINDS: ArcMiniProtocolKind[] = ["state", "urge", "thought", "presence", "belief"];

test("buildProtocolSpecificMiniArcLinkSteps produces a distinct, protocol-specific rehearsal for each of the five kinds, never the generic presence_color/name_state sequence", () => {
  for (const kind of PROTOCOL_KINDS) {
    const b = build({ protocolKind: kind });
    const steps = buildProtocolSpecificMiniArcLinkSteps(b);
    const ids = steps.map((s) => s.id);
    assert.ok(!ids.includes("presence_color"), `${kind}: must never use the generic presence_color step`);
    assert.ok(ids.includes("intro") && ids.includes("trigger") && ids.includes("regulation") && ids.includes("encoding") && ids.includes("beneficial_action") && ids.includes("reinforce"));
  }
});

test("ARC Mini Urge Link includes a preventive stopping response, before the regulation anchor, and encodes a representation-based action", () => {
  const b = build({ protocolKind: "urge", preventiveStoppingAction: "לספור עד חמש", representationPreference: "visual" });
  const ids = buildProtocolSpecificMiniArcLinkSteps(b).map((s) => s.id);
  assert.ok(ids.includes("preventive_response"));
  assert.ok(ids.indexOf("preventive_response") < ids.indexOf("regulation"));
  assert.ok(ids.indexOf("regulation") < ids.indexOf("encoding"));
});

test("ARC Mini Urge Link still offers a default preventive response even when none was configured (urge REQUIRES this step, unlike state)", () => {
  const b = build({ protocolKind: "urge" });
  const steps = buildProtocolSpecificMiniArcLinkSteps(b);
  const preventive = steps.find((s) => s.id === "preventive_response");
  assert.ok(preventive, "urge kind must always include a preventive_response step");
});

test("ARC Mini State Link includes the preventive response step only when configured, and never a bridge_mantra step", () => {
  const withPreventive = buildProtocolSpecificMiniArcLinkSteps(build({ protocolKind: "state", preventiveStoppingAction: "לעצור לרגע" }));
  assert.ok(withPreventive.map((s) => s.id).includes("preventive_response"));

  const withoutPreventive = buildProtocolSpecificMiniArcLinkSteps(build({ protocolKind: "state" }));
  assert.ok(!withoutPreventive.map((s) => s.id).includes("preventive_response"));

  for (const steps of [withPreventive, withoutPreventive]) {
    assert.ok(!steps.map((s) => s.id).includes("bridge_mantra"));
  }
});

test("ARC Mini Thought Link never includes preventive_response or bridge_mantra, and encodes the supportive replacement thought", () => {
  const b = build({ protocolKind: "thought", supportiveThought: "אני יכול להתמודד עם זה." });
  const steps = buildProtocolSpecificMiniArcLinkSteps(b);
  const ids = steps.map((s) => s.id);
  assert.ok(!ids.includes("preventive_response"));
  assert.ok(!ids.includes("bridge_mantra"));
  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.match(encoding.lines.join(" "), /אני יכול להתמודד עם זה/);
});

test("ARC Mini Presence Link never includes preventive_response or bridge_mantra, and encodes the saved Energy Color", () => {
  const b = build({ protocolKind: "presence", presenceColor: "תכלת" });
  const steps = buildProtocolSpecificMiniArcLinkSteps(b);
  const ids = steps.map((s) => s.id);
  assert.ok(!ids.includes("preventive_response"));
  assert.ok(!ids.includes("bridge_mantra"));
  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.match(encoding.lines.join(" "), /תכלת/);
});

test("ARC Mini Belief Link includes a bridge_mantra step (after recognition, before the replacement belief), and never a preventive_response step", () => {
  const b = build({ protocolKind: "belief", bridgeMantraText: "אני בתהליך של שינוי.", replacementBelief: "אני מסוגל." });
  const steps = buildProtocolSpecificMiniArcLinkSteps(b);
  const ids = steps.map((s) => s.id);
  assert.ok(!ids.includes("preventive_response"));
  assert.ok(ids.includes("bridge_mantra"));
  assert.ok(ids.indexOf("name_state") < ids.indexOf("bridge_mantra"));
  assert.ok(ids.indexOf("bridge_mantra") < ids.indexOf("encoding"));
  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.match(encoding.lines.join(" "), /אני מסוגל/);
});

test("ARC Mini Belief Link omits the bridge_mantra step entirely when no Bridge Mantra text was configured, rather than rendering an empty step", () => {
  const steps = buildProtocolSpecificMiniArcLinkSteps(build({ protocolKind: "belief" }));
  assert.ok(!steps.map((s) => s.id).includes("bridge_mantra"));
});

test("no protocol-specific ARC Mini Link kind ever adds full Stay/Acceptance/Presence-rating/Success Focus/Gratitude stages", () => {
  const forbiddenIds = ["stay", "acceptance", "presence_rating", "success_focus", "gratitude"];
  for (const kind of PROTOCOL_KINDS) {
    const ids = buildProtocolSpecificMiniArcLinkSteps(build({ protocolKind: kind })).map((s) => s.id);
    for (const forbidden of forbiddenIds) {
      assert.ok(!ids.includes(forbidden as MiniArcLinkStepId), `${kind} must never include "${forbidden}"`);
    }
  }
});

test("every protocol-specific ARC Mini Link kind is safe (never renders 'undefined'/'null'/'[object Object]') even with all optional fields missing", () => {
  for (const kind of PROTOCOL_KINDS) {
    const steps = buildProtocolSpecificMiniArcLinkSteps(build({ protocolKind: kind }));
    for (const step of steps) {
      const text = `${step.title} ${step.lines.join(" ")} ${step.bodyImagery?.anchorLabel ?? ""}`;
      for (const forbidden of ["undefined", "null", "[object Object]"]) {
        assert.ok(!text.includes(forbidden), `${kind}/${step.id} must never render "${forbidden}": "${text}"`);
      }
    }
  }
});

test("protocol-specific ARC Mini Link's with_archi/without_archi mode controls the enter_archi step exactly like the generic builder", () => {
  const withArchi = buildProtocolSpecificMiniArcLinkSteps(build({ protocolKind: "state" }), { mode: "with_archi" });
  const withoutArchi = buildProtocolSpecificMiniArcLinkSteps(build({ protocolKind: "state" }), { mode: "without_archi" });
  assert.ok(withArchi.map((s) => s.id).includes("enter_archi"));
  assert.ok(!withoutArchi.map((s) => s.id).includes("enter_archi"));
});

test("fast rehearsal of a full ARC Link differs from an ARC Mini Link -- the two step sets share no common builder output, confirming they remain distinct concepts", () => {
  // arc/arcLink.ts's fast-mode steps are built from an ArcBuildProfile via
  // buildArcLinkFastSteps; arc/miniArcLink.ts's protocol-specific steps are
  // built from a MiniArcBuild. They are structurally different functions
  // over different input types -- this test asserts the Mini Link's own
  // step id vocabulary never overlaps with full-ARC-only step ids like
  // "protocol_full" or "linking_mantra", which would indicate accidental
  // convergence into one shared representation.
  const steps = buildProtocolSpecificMiniArcLinkSteps(build({ protocolKind: "urge" }));
  const ids = steps.map((s) => s.id);
  assert.ok(!ids.includes("protocol_full" as MiniArcLinkStepId));
  assert.ok(!ids.includes("linking_mantra" as MiniArcLinkStepId));
});

// ---------------------------------------------------------------------------
// Phase 4 (ARC Thought and ARC Mini Thought), spec section 24: "ARC Mini
// Thought Link should rehearse... useful insight or supportive thought."
// ---------------------------------------------------------------------------

test("ctx.thoughtInsightOverride, when provided, is used as the encoding content for a Thought Mini Link, taking priority over build.supportiveThought", () => {
  const b = build({ protocolKind: "thought", supportiveThought: "מחשבה תומכת מה-Mini" });
  const steps = buildProtocolSpecificMiniArcLinkSteps(b, { thoughtInsightOverride: "תובנה שנשמרה מהפרוטוקול המלא" });
  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.match(encoding.lines.join(" "), /תובנה שנשמרה מהפרוטוקול המלא/);
  assert.ok(!encoding.lines.join(" ").includes("מחשבה תומכת מה-Mini"));
});

test("without a thoughtInsightOverride, a Thought Mini Link falls back to build.supportiveThought unchanged -- Phase 2 behavior preserved", () => {
  const b = build({ protocolKind: "thought", supportiveThought: "מחשבה תומכת מה-Mini" });
  const steps = buildProtocolSpecificMiniArcLinkSteps(b);
  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.match(encoding.lines.join(" "), /מחשבה תומכת מה-Mini/);
});
