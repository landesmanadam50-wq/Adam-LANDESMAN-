import test from "node:test";
import assert from "node:assert/strict";

import { buildBridgingLinkSteps } from "./bridgingArcLink.ts";
import type { BridgingLinkRehearsalContext, BridgingLinkStepId } from "./bridgingArcLink.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import type { ArcBuildProfile } from "./types.ts";

// NOTE: see arc/arcLink.test.ts for why arc/instructions.ts's
// containsInductionPattern (which bans "דמיין" outright) is not reused
// here -- Bridging ARC Link is guided imagery by design. The actual
// safety property the spec asks for -- never create/strengthen/hold an
// interfering state -- is checked via this narrower pattern set, plus
// an explicit check that reactive phrasing never asks the trainee to
// evoke/produce/intensify anything.
const FORBIDDEN_INTERFERING_STATE_PATTERNS = [
  /תחזיק את .* (במודעות|בתודעה|בראש)/,
  /(תביא|הבא) .*למודעות/,
  /(תשמור|השאר) .* (פעיל|פעילה|פעילים)/,
  /(תעורר|עורר|תיצור|צור|תעצים|העצם) את .{0,12}(מצב|תחושה|רגש)/,
];

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return { ...createEmptyArcBuildProfile(), ...overrides };
}

function ctx(overrides: Partial<BridgingLinkRehearsalContext> = {}): BridgingLinkRehearsalContext {
  return { triggerText: "בשעה 08:00", triggerCategory: "scheduled", variant: "full", ...overrides };
}

function stepIds(supportive: ArcBuildProfile, identity: ArcBuildProfile, c: BridgingLinkRehearsalContext): BridgingLinkStepId[] {
  return buildBridgingLinkSteps(supportive, identity, c).map((s) => s.id);
}

function allText(supportive: ArcBuildProfile, identity: ArcBuildProfile, c: BridgingLinkRehearsalContext): string {
  return buildBridgingLinkSteps(supportive, identity, c)
    .map((s) => `${s.title} ${s.lines.join(" ")} ${s.bodyImagery?.imagery.imageryText ?? ""}`)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Full vs short variant step order
// ---------------------------------------------------------------------------

test("full variant includes trigger + supportive_state steps, in the correct order", () => {
  const supportive = profile({ supportiveState: "רוגע", regulationTool: "נשימה עמוקה" });
  const identity = profile({ desiredIdentity: "אדם רגוע", identityAction: "לעצור לפני שאני מגיב" });
  assert.deepEqual(stepIds(supportive, identity, ctx({ variant: "full" })), [
    "intro",
    "trigger",
    "cue",
    "supportive_state",
    "identity",
    "beneficial_action",
    "reinforce",
  ]);
});

test("short variant skips trigger + supportive_state -- only the essential transition: cue -> identity -> action", () => {
  const supportive = profile({ supportiveState: "רוגע", regulationTool: "נשימה עמוקה" });
  const identity = profile({ desiredIdentity: "אדם רגוע", identityAction: "לעצור לפני שאני מגיב" });
  assert.deepEqual(stepIds(supportive, identity, ctx({ variant: "short" })), ["intro", "cue", "identity", "beneficial_action", "reinforce"]);
});

test("never a separate duplicate engine -- both variants come from the exact same builder function", () => {
  const supportive = profile({ regulationTool: "עוגן" });
  const identity = profile({ desiredIdentity: "זהות" });
  const full = stepIds(supportive, identity, ctx({ variant: "full" }));
  const short = stepIds(supportive, identity, ctx({ variant: "short" }));
  for (const id of short) assert.ok(full.includes(id), `${id} should also be reachable via the full variant's own step set`);
});

// ---------------------------------------------------------------------------
// Reference-not-copy: the two supportive/identity profiles are read
// independently, never merged or duplicated
// ---------------------------------------------------------------------------

test("supportive cue/state is read from supportiveProfile and identity/action from identityProfile -- two DIFFERENT builds never bleed into each other", () => {
  const supportive = profile({
    supportiveState: "בטחון פנימי",
    stateEncoding: { target: "state", bodySensationCue: null, breathCue: null, bodyLanguageCue: "יד על הלב", mantra: null },
  });
  const identity = profile({
    desiredIdentity: "מנהיג רגוע",
    identityAction: "לדבר בקול יציב",
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: "גב זקוף", mantra: "אני יציב" },
  });
  const text = allText(supportive, identity, ctx({ variant: "full" }));
  assert.match(text, /בטחון פנימי/);
  assert.match(text, /יד על הלב/);
  assert.match(text, /מנהיג רגוע/);
  assert.match(text, /לדבר בקול יציב/);
  assert.match(text, /גב זקוף/);
  assert.match(text, /אני יציב/);
});

test("the supportive-state cue is echoed as the SAME cue that begins the identity transition -- 'identity' step explicitly names the bridge", () => {
  const supportive = profile({ regulationTool: "נשימה אחת" });
  const identity = profile({ desiredIdentity: "זהות רצויה" });
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full" }));
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.match(identityStep.lines.join(" "), /אותו רמז קצר הופך כעת להיות גם הטריגר/);
});

// ---------------------------------------------------------------------------
// Updated-ARC-structure task: Value + Future Mantra, read from the
// destination (identity) profile via arc/arcLinkContent.ts's shared
// resolvers -- never a second, parallel set of Bridging-only fields.
// ---------------------------------------------------------------------------

test("the identity step shows the destination ARC's own Value alongside the identity -- 'the value connected to the identity and action'", () => {
  const supportive = profile();
  const identity = profile({ desiredIdentity: "אדם ששומר על הגוף שלו", value: "בריאות וחופש" });
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full" }));
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.match(identityStep.lines.join(" "), /מבטא את הזהות אדם ששומר על הגוף שלו, מתוך הערך בריאות וחופש/);
});

test("Value alone (no identity configured) still shows a value-only line, never a dangling label", () => {
  const supportive = profile();
  const identity = profile({ value: "בריאות" });
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full" }));
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.match(identityStep.lines.join(" "), /פועל מתוך הערך בריאות/);
});

test("Future Mantra resolution order: an explicit ctx override wins over both the destination ARC's Future Mantra and its older Identity Mantra", () => {
  const supportive = profile();
  const identity = profile({
    identityFutureOrientedMantra: "אני מתחיל היום בצעד קטן",
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "מנטרת זהות ישנה" },
  });
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full", futureMantraOverride: "מנטרה מותאמת לגשר הזה" }));
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.match(identityStep.lines.join(" "), /מנטרה מותאמת לגשר הזה/);
  assert.ok(!identityStep.lines.join(" ").includes("אני מתחיל היום בצעד קטן"));
  assert.ok(!identityStep.lines.join(" ").includes("מנטרת זהות ישנה"));
});

test("Future Mantra resolution order: with no override, the destination ARC's own Future Mantra wins over its older Identity Mantra", () => {
  const supportive = profile();
  const identity = profile({
    identityFutureOrientedMantra: "אני מתחיל היום בצעד קטן",
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "מנטרת זהות ישנה" },
  });
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full" }));
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.match(identityStep.lines.join(" "), /אני מתחיל היום בצעד קטן/);
  assert.ok(!identityStep.lines.join(" ").includes("מנטרת זהות ישנה"));
});

test("Future Mantra resolution order: falls back to the older Identity Mantra only when no Future Mantra is configured", () => {
  const supportive = profile();
  const identity = profile({
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "מנטרת זהות ישנה" },
  });
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full" }));
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.match(identityStep.lines.join(" "), /מנטרת זהות ישנה/);
});

test("the short variant's identity step also carries Value + Future Mantra content -- not just the full variant", () => {
  const supportive = profile();
  const identity = profile({ desiredIdentity: "זהות", value: "ערך", identityFutureOrientedMantra: "מנטרה עתידית" });
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "short" }));
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.match(identityStep.lines.join(" "), /מתוך הערך ערך/);
  assert.match(identityStep.lines.join(" "), /מנטרה עתידית/);
});

// ---------------------------------------------------------------------------
// Category-specific trigger wording (observer-perspective / safe recognition)
// ---------------------------------------------------------------------------

test("'scheduled'/'routine' categories use plain trigger-imagery wording, no observer-perspective phrasing", () => {
  const supportive = profile();
  const identity = profile();
  for (const category of ["scheduled", "routine"] as const) {
    const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full", triggerCategory: category }));
    const triggerStep = steps.find((s) => s.id === "trigger")!;
    assert.ok(!triggerStep.lines.join(" ").includes("מהצד"));
  }
});

test("'preventive' category uses observer-perspective phrasing on the trigger step", () => {
  const supportive = profile();
  const identity = profile();
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full", triggerCategory: "preventive", triggerText: "לפני פגישה" }));
  const triggerStep = steps.find((s) => s.id === "trigger")!;
  assert.match(triggerStep.lines.join(" "), /רואה את עצמך מהצד/);
  assert.match(triggerStep.lines.join(" "), /לפני פגישה/);
});

test("'reactive' category uses safe recognition-only wording ('שים לב למה שכבר נמצא עכשיו'), never an instruction to evoke/intensify", () => {
  const supportive = profile({ interferingState: "מתח בבטן" });
  const identity = profile();
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full", triggerCategory: "reactive" }));
  const triggerStep = steps.find((s) => s.id === "trigger")!;
  assert.match(triggerStep.lines.join(" "), /שים לב למה שכבר נמצא עכשיו/);
  assert.match(triggerStep.lines.join(" "), /מתח בבטן/);
  assert.match(triggerStep.lines.join(" "), /אין צורך לעורר אותו, להחזיק אותו או להעצים אותו/);
});

test("'reactive' category with no configured interfering state still uses safe generic recognition wording, never invents a state", () => {
  const supportive = profile();
  const identity = profile();
  const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant: "full", triggerCategory: "reactive" }));
  const triggerStep = steps.find((s) => s.id === "trigger")!;
  assert.match(triggerStep.lines.join(" "), /שים לב למה שכבר נמצא עכשיו/);
});

test("no forbidden interfering-state create/strengthen/hold pattern anywhere in Bridging Link's copy, for any category or variant", () => {
  const supportive = profile({ interferingState: "חרדה קלה", supportiveState: "רוגע", regulationTool: "נשימה" });
  const identity = profile({ desiredIdentity: "זהות", identityAction: "פעולה" });
  for (const category of ["scheduled", "routine", "preventive", "reactive"] as const) {
    for (const variant of ["full", "short"] as const) {
      const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant, triggerCategory: category }));
      for (const step of steps) {
        const text = `${step.title} ${step.lines.join(" ")}`;
        for (const pattern of FORBIDDEN_INTERFERING_STATE_PATTERNS) {
          assert.equal(pattern.test(text), false, `${category}/${variant}/${step.id}: ${pattern}`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Multiple Bridging Links coexisting -- pure function, no shared state
// ---------------------------------------------------------------------------

test("two different Bridging Link configurations never bleed into each other -- each call is pure and independent", () => {
  const supportiveA = profile({ supportiveState: "רוגע פנימי", regulationTool: "נשימה עמוקה" });
  const identityA = profile({ desiredIdentity: "המנהיג הנחוש", identityAction: "לדבר בבהירות" });
  const supportiveB = profile({ supportiveState: "תחושת ביטחון", regulationTool: "יד על הלב" });
  const identityB = profile({ desiredIdentity: "ההורה הסבלני", identityAction: "לנשום לפני תגובה" });

  const textA = allText(supportiveA, identityA, ctx());
  const textB = allText(supportiveB, identityB, ctx());

  assert.match(textA, /המנהיג הנחוש/);
  assert.ok(!textA.includes("ההורה הסבלני"));
  assert.match(textB, /ההורה הסבלני/);
  assert.ok(!textB.includes("המנהיג הנחוש"));
});

// ---------------------------------------------------------------------------
// Safety / never-crashes for minimally-filled profiles
// ---------------------------------------------------------------------------

test("never renders 'undefined'/'null'/'NaN'/'[object Object]' for two completely empty profiles, any category/variant", () => {
  const supportive = profile();
  const identity = profile();
  for (const category of ["scheduled", "routine", "preventive", "reactive"] as const) {
    for (const variant of ["full", "short"] as const) {
      const steps = buildBridgingLinkSteps(supportive, identity, ctx({ variant, triggerCategory: category, triggerText: "" }));
      for (const step of steps) {
        const text = `${step.title} ${step.lines.join(" ")} ${step.bodyImagery?.imagery.imageryText ?? ""}`;
        for (const forbidden of ["undefined", "null", "NaN", "[object Object]"]) {
          assert.ok(!text.includes(forbidden), `${category}/${variant}/${step.id}: "${text}"`);
        }
      }
    }
  }
});

test("the final reinforce step is always last, and always mentions completing the Bridging Link", () => {
  const steps = buildBridgingLinkSteps(profile(), profile(), ctx());
  assert.equal(steps[steps.length - 1].id, "reinforce");
  assert.equal(steps[steps.length - 1].buttonLabel, "סיום ARC Link מגשר");
});

// ---------------------------------------------------------------------------
// Unified Presence/Mantra/Trigger/Imagery spec, section 9/10: desired
// identity imagery, inherited from identityProfile, appended to the
// identity-transition step -- this module never runs Presence/Awareness/
// Acceptance, so only the identity-layer imagery (never state/Stay/
// Acceptance/Regulation mantras) applies here.
// ---------------------------------------------------------------------------

test("desired identity imagery is inherited from identityProfile and appended to the 'identity' step when configured", () => {
  const identityProfile = profile({
    desiredIdentity: "משמעת עצמית",
    identityDesiredImageryType: "real",
    identityDesiredImageryDescription: "תמונה מהיום שסיימתי את המרתון",
  });
  const steps = buildBridgingLinkSteps(profile(), identityProfile, ctx());
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.ok(identityStep.lines.some((line) => line.includes("תמונה מהיום שסיימתי את המרתון")));
});

test("no desired-imagery line appears at all when identityDesiredImageryType/Description are unset -- never invented", () => {
  const steps = buildBridgingLinkSteps(profile(), profile({ desiredIdentity: "משמעת עצמית" }), ctx());
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.ok(!identityStep.lines.join(" ").includes("העלה בדמיונך"));
});

test("the supportive profile's OWN desired imagery is never used for the identity step -- only identityProfile's", () => {
  const supportiveProfile = profile({ stateDesiredImageryType: "real", stateDesiredImageryDescription: "should never appear here" });
  const identityProfile = profile({ desiredIdentity: "משמעת עצמית" });
  const steps = buildBridgingLinkSteps(supportiveProfile, identityProfile, ctx());
  const identityStep = steps.find((s) => s.id === "identity")!;
  assert.ok(!identityStep.lines.join(" ").includes("should never appear here"));
});
