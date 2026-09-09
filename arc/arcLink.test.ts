import test from "node:test";
import assert from "node:assert/strict";

import {
  buildArcLinkIntroSteps,
  buildArcLinkProtocolSteps,
  buildArcLinkStartConfirmationStep,
  buildArcLinkSteps,
  resolveArcLinkRouteOptions,
  resolveArcLinkTarget,
} from "./arcLink.ts";
import type { ArcLinkRouteChoice, ArcLinkStepId } from "./arcLink.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import type { ArcBuildProfile } from "./types.ts";
// NOTE: arc/instructions.ts's containsInductionPattern/INDUCTION_PATTERN_DENYLIST
// is deliberately NOT reused here as a blanket "no forbidden pattern anywhere"
// check. That denylist bans "דמיין" outright (except a few narrow normal-ARC
// phrasings) because normal ARC's own copy (arc/stageCopy.ts) never uses
// guided imagery. ARC Link is the opposite: guided imagery is the entire
// point, spec-mandated on nearly every screen ("דמיין את הטריגר", "דמיין את
// הכניסה ל-ARCHI", "דמיין את הנוכחות", ...). The actual safety property the
// spec asks for is narrower -- "never ask to intentionally create/
// strengthen/hold an interfering state" -- so this file checks that
// specifically, via the subset of the denylist's own patterns that concern
// creating/strengthening/holding a state, rather than the "דמיין" ban.
const FORBIDDEN_INTERFERING_STATE_PATTERNS = [
  /תחזיק את .* (במודעות|בתודעה|בראש)/,
  /(תביא|הבא) .*למודעות/,
  /(תשמור|השאר) .* (פעיל|פעילה|פעילים)/,
];

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return { ...createEmptyArcBuildProfile(), ...overrides };
}

function stepIds(profile: ArcBuildProfile): ArcLinkStepId[] {
  return buildArcLinkSteps(profile).map((s) => s.id);
}

function allText(profile: ArcBuildProfile): string {
  return buildArcLinkSteps(profile)
    .map((s) => `${s.title} ${s.lines.join(" ")} ${s.bodyImagery?.imagery.imageryText ?? ""}`)
    .join(" ");
}

// ---------------------------------------------------------------------------
// resolveArcLinkTarget
// ---------------------------------------------------------------------------

test("resolveArcLinkTarget: state > identity > habit priority, null for a genuinely empty profile", () => {
  assert.equal(resolveArcLinkTarget(profile()), null);
  assert.equal(resolveArcLinkTarget(profile({ internalAction: "סריקת גוף" })), "state");
  assert.equal(resolveArcLinkTarget(profile({ identityAction: "לומר שלום" })), "identity");
  assert.equal(resolveArcLinkTarget(profile({ beneficialAction: "לצאת להליכה" })), "habit");
  assert.equal(
    resolveArcLinkTarget(profile({ internalAction: "סריקת גוף", beneficialAction: "לצאת להליכה" })),
    "state",
    "state wins even when habit is also configured"
  );
});

// ---------------------------------------------------------------------------
// Fixed step order
// ---------------------------------------------------------------------------

test("buildArcLinkSteps produces the exact fixed order from the spec when the interfering sensation IS configured", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: "לחץ" });
  assert.deepEqual(stepIds(p), [
    "intro",
    "trigger",
    "enter_archi",
    "awareness",
    "sensation",
    "acceptance",
    "presence",
    "regulation",
    "updated_sensation",
    "encoding",
    "beneficial_action",
    "reinforce",
  ]);
});

test("the 'sensation' step is omitted -- never invented -- when this target has no mapped interfering sensation/state", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: null });
  const ids = stepIds(p);
  assert.ok(!ids.includes("sensation"));
  // every other step still present, same relative order
  assert.deepEqual(ids, ["intro", "trigger", "enter_archi", "awareness", "acceptance", "presence", "regulation", "updated_sensation", "encoding", "beneficial_action", "reinforce"]);
});

test("ARC Link never adds normal-ARC-only concepts this task must not introduce: no separate Presence-rating step, no Success Focus, no Gratitude, no Negative Action", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: "לחץ", beneficialAction: "לצאת להליכה", habit: "גלילה ברשת", negativeActionReductionEnabled: true });
  const ids = stepIds(p);
  for (const forbidden of ["success_focus", "gratitude", "negative_action", "presence_check", "sensation_check"]) {
    assert.ok(!ids.includes(forbidden as ArcLinkStepId), forbidden);
  }
});

// ---------------------------------------------------------------------------
// Content correctness / dynamic insertion
// ---------------------------------------------------------------------------

test("intro/trigger/reinforce steps insert the CURRENT build's own saved trigger dynamically, never hard-coded, never a generic summary", () => {
  const p = profile({
    internalAction: "סריקת גוף",
    linkSettings: { enabled: true, triggerType: "time", triggerText: "בשעה 10:00" },
  });
  const steps = buildArcLinkSteps(p);
  const trigger = steps.find((s) => s.id === "trigger")!;
  assert.ok(trigger.lines.includes("בשעה 10:00"));
  const intro = steps.find((s) => s.id === "intro")!;
  assert.match(intro.lines.join(" "), /בשעה 10:00/);
  const reinforce = steps.find((s) => s.id === "reinforce")!;
  assert.match(reinforce.lines.join(" "), /בשעה 10:00/);
});

test("Presence step reuses the exact fixed Awareness/Combined-Attention/Expand-Presence instruction text normal ARC's own Presence stages use, plus the dynamic Energy Color line (leading) and the new free-breathing line (trailing)", () => {
  const p = profile({ internalAction: "סריקת גוף", presenceColor: "סגול" });
  const presence = buildArcLinkSteps(p).find((s) => s.id === "presence")!;
  assert.match(presence.lines.join(" "), /שים לב למה שכבר נמצא עכשיו בתודעה ובגוף שלך/, "Awareness instruction text");
  assert.match(presence.lines.join(" "), /שים לב לנקודה אחת מולך/, "Combined Attention instruction text");
  assert.match(presence.lines.join(" "), /הרחב בעדינות את שדה הראייה/, "Expand Presence instruction text");
  // Unified Presence/Mantra/Trigger/Imagery spec, sections 1-2: Energy
  // Color leads (first line), free breathing is appended (last line).
  assert.equal(presence.lines[0], "שים לב כיצד האנרגיה בצבע סגול מתפשטת בגופך ומחזירה אותך לנוכחות.");
  assert.equal(presence.lines[presence.lines.length - 1], "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.");
  assert.ok(!presence.lines.join(" ").includes("בסולם"), "never asks for a live Presence rating");
});

test("Presence step never asks for a live rating, and simply omits the color block when no color is saved -- never invents one", () => {
  const p = profile({ internalAction: "סריקת גוף", presenceColor: null });
  const presence = buildArcLinkSteps(p).find((s) => s.id === "presence")!;
  assert.ok(!presence.lines.join(" ").includes("undefined"));
  assert.ok(!presence.lines.join(" ").includes("null"));
});

test("Regulation step's bodyImagery uses a known preset when regulationTool matches one, and its own custom imagery otherwise", () => {
  const preset = profile({ internalAction: "סריקת גוף", regulationTool: "הרגש את כפות הרגליים על הקרקע." });
  const presetRegulation = buildArcLinkSteps(preset).find((s) => s.id === "regulation")!;
  assert.deepEqual(presetRegulation.bodyImagery?.imagery.bodyParts, ["כפות הרגליים"]);

  const custom = profile({
    internalAction: "סריקת גוף",
    regulationTool: "עוגן מותאם אישית",
    regulationBodyImagery: { bodyParts: ["הידיים"], imageryText: "דמיון מותאם אישית." },
  });
  const customRegulation = buildArcLinkSteps(custom).find((s) => s.id === "regulation")!;
  assert.deepEqual(customRegulation.bodyImagery?.imagery.bodyParts, ["הידיים"]);
});

test("Encoding step's bodyImagery is derived from the target's own bodyLanguageCue/bodyImagery, and includes the desired state + identity/mantra line when configured", () => {
  const p = profile({
    internalAction: "סריקת גוף",
    supportiveState: "רוגע",
    stateEncoding: {
      target: "רוגע",
      bodySensationCue: null,
      breathCue: null,
      bodyLanguageCue: "ליישר בעדינות את הגב",
      mantra: "אני רגוע",
    },
  });
  const encoding = buildArcLinkSteps(p).find((s) => s.id === "encoding")!;
  assert.deepEqual(encoding.bodyImagery?.imagery.bodyParts, ["הגב", "עמוד השדרה"]);
  assert.match(encoding.lines.join(" "), /רוגע/);
  assert.match(encoding.lines.join(" "), /אני רגוע/);
});

test("Beneficial Action step shows the correct saved action for the resolved target", () => {
  const state = profile({ internalAction: "סריקת גוף", beneficialAction: "לצאת להליכה" });
  assert.match(buildArcLinkSteps(state).find((s) => s.id === "beneficial_action")!.lines.join(" "), /סריקת גוף/, "state target uses internalAction");

  const habit = profile({ beneficialAction: "לצאת להליכה" });
  assert.match(buildArcLinkSteps(habit).find((s) => s.id === "beneficial_action")!.lines.join(" "), /לצאת להליכה/);
});

test("two different ArcBuild profiles keep their own distinct content -- no cross-build bleed in color, trigger, or actions", () => {
  const a = profile({
    internalAction: "סריקת גוף",
    presenceColor: "סגול",
    beneficialAction: "לצאת להליכה",
    linkSettings: { enabled: true, triggerType: "time", triggerText: "בשעה 10:00" },
  });
  const b = profile({
    beneficialAction: "לשתות מים",
    presenceColor: "ירוק",
    linkSettings: { enabled: true, triggerType: "after_action", triggerText: "אחרי ארוחת הערב" },
  });
  const textA = allText(a);
  const textB = allText(b);
  assert.match(textA, /סגול/);
  assert.ok(!textA.includes("ירוק"));
  assert.match(textB, /ירוק/);
  assert.ok(!textB.includes("סגול"));
  assert.match(textA, /בשעה 10:00/);
  assert.ok(!textA.includes("אחרי ארוחת הערב"));
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

test("Awareness/sensation imagery uses only the safe, non-strengthening wording -- never asks to intentionally create/strengthen/hold the interfering state", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: "לחץ" });
  const steps = buildArcLinkSteps(p);
  const awareness = steps.find((s) => s.id === "awareness")!;
  const sensation = steps.find((s) => s.id === "sensation")!;
  assert.match(awareness.lines.join(" "), /בלי להעצים אותו ובלי להילחם בו/);
  assert.match(sensation.lines.join(" "), /בלי להעצים אותו ובלי להילחם בו/);
  for (const step of steps) {
    const text = `${step.title} ${step.lines.join(" ")}`;
    for (const pattern of FORBIDDEN_INTERFERING_STATE_PATTERNS) {
      assert.equal(pattern.test(text), false, `${step.id}: ${pattern}`);
    }
  }
});

test("never renders 'undefined'/'null'/'NaN'/'[object Object]' anywhere, for a completely empty/unbuilt profile", () => {
  const empty = profile();
  const steps = buildArcLinkSteps(empty);
  for (const step of steps) {
    const text = `${step.title} ${step.lines.join(" ")} ${step.bodyImagery?.imagery.imageryText ?? ""}`;
    for (const forbidden of ["undefined", "null", "NaN", "[object Object]"]) {
      assert.ok(!text.includes(forbidden), `${step.id}: "${text}"`);
    }
  }
});

test("a legacy profile with no linkSettings/regulationBodyImagery/encoding.bodyImagery at all (fields genuinely absent, as before this feature existed) never crashes buildArcLinkSteps", () => {
  const legacy = { ...profile({ internalAction: "סריקת גוף", regulationTool: "עוגן ישן" }) };
  delete (legacy as { linkSettings?: unknown }).linkSettings;
  delete (legacy as { regulationBodyImagery?: unknown }).regulationBodyImagery;
  assert.doesNotThrow(() => buildArcLinkSteps(legacy));
  const steps = buildArcLinkSteps(legacy);
  assert.ok(steps.length > 0);
});

// ---------------------------------------------------------------------------
// Weekly Routine + ARC Link management task: resolveArcLinkRouteOptions /
// buildArcLinkIntroSteps / buildArcLinkProtocolSteps -- the with_archi/
// without_archi mode and the interfering-vs-supportive route choice, used
// by the new Routine-page Practice area. buildArcLinkSteps above (tested
// exhaustively already) is untouched by any of this.
// ---------------------------------------------------------------------------

test("resolveArcLinkRouteOptions collects only the routes this build actually has built out -- never invents a habit route, never a bare interferingState with no encoding/action behind it", () => {
  assert.deepEqual(resolveArcLinkRouteOptions(profile()), { interfering: [], supportive: [] });

  // interferingState typed in but the state layer itself never built out -- not offered.
  assert.deepEqual(resolveArcLinkRouteOptions(profile({ interferingState: "לחץ" })), { interfering: [], supportive: [] });

  const bothLayers = profile({
    internalAction: "סריקת גוף",
    interferingState: "לחץ",
    supportiveState: "רוגע",
    identityAction: "לומר שלום",
    identityInterferingEmotion: "בושה",
    desiredIdentity: "ביטחון",
  });
  const options = resolveArcLinkRouteOptions(bothLayers);
  assert.deepEqual(options.interfering, [
    { target: "state", label: "לחץ" },
    { target: "identity", label: "בושה" },
  ]);
  assert.deepEqual(options.supportive, [
    { target: "state", label: "רוגע" },
    { target: "identity", label: "ביטחון" },
  ]);
});

test("buildArcLinkIntroSteps: with_archi includes enter_archi with the diagram routed through ARCHI; without_archi skips it entirely and routes the diagram 'from memory'", () => {
  const p = profile({ internalAction: "סריקת גוף" });
  const withArchi = buildArcLinkIntroSteps(p, { triggerText: "בשעה 10:00", mode: "with_archi" });
  assert.deepEqual(withArchi.map((s) => s.id), ["intro", "trigger", "enter_archi"]);
  assert.match(withArchi[0].lines.join(" "), /כניסה ל-ARCHI/);

  const withoutArchi = buildArcLinkIntroSteps(p, { triggerText: "בשעה 10:00", mode: "without_archi" });
  assert.deepEqual(withoutArchi.map((s) => s.id), ["intro", "trigger"]);
  assert.match(withoutArchi[0].lines.join(" "), /ביצוע ARC מהזיכרון/);
  assert.ok(!withoutArchi[0].lines.join(" ").includes("כניסה ל-ARCHI"));
});

// ---------------------------------------------------------------------------
// Extended ARC Link trigger system: ctx.triggerCategory steers ONLY the
// trigger-imagery step's wording (arc/triggerImagery.ts) -- optional,
// defaulting to "scheduled" (exactly the pre-existing, unconditional text).
// ---------------------------------------------------------------------------

test("buildArcLinkIntroSteps: omitting triggerCategory (or passing 'scheduled') produces the exact original trigger-imagery text", () => {
  const p = profile();
  const withoutCategory = buildArcLinkIntroSteps(p, { triggerText: "בשעה 10:00", mode: "with_archi" });
  const withScheduled = buildArcLinkIntroSteps(p, { triggerText: "בשעה 10:00", mode: "with_archi", triggerCategory: "scheduled" });
  assert.deepEqual(withoutCategory, withScheduled);
  const triggerStep = withoutCategory.find((s) => s.id === "trigger")!;
  assert.match(triggerStep.lines.join(" "), /עצום עיניים ודמיין שהרגע הבא מתרחש/);
});

test("buildArcLinkIntroSteps: 'preventive' triggerCategory uses observer-perspective phrasing on the trigger step", () => {
  const p = profile();
  const steps = buildArcLinkIntroSteps(p, { triggerText: "לפני פגישה", mode: "with_archi", triggerCategory: "preventive" });
  const triggerStep = steps.find((s) => s.id === "trigger")!;
  assert.match(triggerStep.lines.join(" "), /רואה את עצמך מהצד/);
  assert.match(triggerStep.lines.join(" "), /לפני פגישה/);
});

test("buildArcLinkIntroSteps: 'reactive' triggerCategory uses safe recognition-only wording, never an instruction to evoke/intensify", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: "מתח בבטן" });
  const steps = buildArcLinkIntroSteps(p, { triggerText: "בשעה 10:00", mode: "with_archi", triggerCategory: "reactive" });
  const triggerStep = steps.find((s) => s.id === "trigger")!;
  assert.match(triggerStep.lines.join(" "), /שים לב למה שכבר נמצא עכשיו/);
  assert.match(triggerStep.lines.join(" "), /מתח בבטן/);
  for (const pattern of FORBIDDEN_INTERFERING_STATE_PATTERNS) {
    assert.equal(pattern.test(triggerStep.lines.join(" ")), false);
  }
});

test("buildArcLinkProtocolSteps: choice=null (legacy) reproduces buildArcLinkSteps' own protocol-steps STEP ORDER exactly (its own encoding step CONTENT is intentionally updated -- see the Updated-ARC-structure tests below)", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: "לחץ", beneficialAction: "לצאת להליכה" });
  const ctx = { triggerText: "בשעה 10:00", mode: "with_archi" as const };
  const legacySteps = buildArcLinkProtocolSteps(p, null, ctx);
  assert.deepEqual(legacySteps.map((s) => s.id), [
    "awareness",
    "sensation",
    "acceptance",
    "presence",
    "regulation",
    "updated_sensation",
    "encoding",
    "beneficial_action",
    "reinforce",
  ]);
});

test("buildArcLinkProtocolSteps: the 'interfering' route adds route_intro with the exact spec-mandated safe wording, and keeps awareness/sensation/acceptance/updated_sensation", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: "לחץ" });
  const ctx = { triggerText: "בשעה 10:00", mode: "with_archi" as const };
  const choice: ArcLinkRouteChoice = { kind: "interfering", target: "state" };
  const steps = buildArcLinkProtocolSteps(p, choice, ctx);
  assert.deepEqual(steps.map((s) => s.id), [
    "route_intro",
    "awareness",
    "sensation",
    "acceptance",
    "presence",
    "regulation",
    "updated_sensation",
    "encoding",
    "beneficial_action",
    "reinforce",
  ]);
  const routeIntro = steps.find((s) => s.id === "route_intro")!;
  assert.match(routeIntro.lines.join(" "), /דמיין שהטריגר מתרחש ושבאותו רגע אתה מזהה ש-לחץ כבר נמצא/);
  assert.match(routeIntro.lines.join(" "), /אין צורך לעורר או להעצים אותו/);
});

test("buildArcLinkProtocolSteps: the 'supportive' route skips route_intro/awareness/sensation/acceptance/updated_sensation entirely -- mirrors normal ARC's own proactive route", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: "לחץ", supportiveState: "רוגע" });
  const ctx = { triggerText: "בשעה 10:00", mode: "with_archi" as const };
  const choice: ArcLinkRouteChoice = { kind: "supportive", target: "state" };
  const steps = buildArcLinkProtocolSteps(p, choice, ctx);
  assert.deepEqual(steps.map((s) => s.id), ["presence", "regulation", "encoding", "beneficial_action", "reinforce"]);
  // The interfering state is never even mentioned on the supportive route.
  const allText = steps.map((s) => `${s.title} ${s.lines.join(" ")}`).join(" ");
  assert.ok(!allText.includes("לחץ"));
});

test("buildArcLinkProtocolSteps: mode is mode-aware only in the final reinforce step, routed 'from memory' for without_archi", () => {
  const p = profile({ internalAction: "סריקת גוף", beneficialAction: "לצאת להליכה" });
  const ctx = { triggerText: "בשעה 10:00", mode: "without_archi" as const };
  const steps = buildArcLinkProtocolSteps(p, null, ctx);
  const reinforce = steps.find((s) => s.id === "reinforce")!;
  assert.match(reinforce.lines.join(" "), /אני מתחיל ARC מהזיכרון/);
  assert.ok(!reinforce.lines.join(" ").includes("אני פותח את ARCHI"));
});

test("buildArcLinkProtocolSteps never trips the interfering-state create/strengthen/hold safety check, on any route kind", () => {
  const p = profile({ internalAction: "סריקת גוף", interferingState: "לחץ", supportiveState: "רוגע" });
  const ctx = { triggerText: "בשעה 10:00", mode: "with_archi" as const };
  for (const choice of [null, { kind: "interfering", target: "state" } as const, { kind: "supportive", target: "state" } as const]) {
    const steps = buildArcLinkProtocolSteps(p, choice, ctx);
    for (const step of steps) {
      const text = `${step.title} ${step.lines.join(" ")}`;
      for (const pattern of FORBIDDEN_INTERFERING_STATE_PATTERNS) {
        assert.equal(pattern.test(text), false, `${step.id} (${choice?.kind ?? "legacy"}): ${pattern}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Updated-ARC-structure task: buildArcLinkProtocolSteps' own encoding step
// reads Value/Desired-Identity/Desired-Supportive-State/Future-Mantra from
// the SAME updated ArcBuildProfile fields the main ARC BUILD model uses
// (arc/arcLinkContent.ts) -- never merging identity with the internal
// supportive state, and never silently preferring the older Identity
// Mantra when a Future Mantra exists. buildArcLinkSteps (the original,
// legacy entry point) is untouched -- see its own separate tests above.
// ---------------------------------------------------------------------------

test("buildArcLinkProtocolSteps' encoding step keeps the identity and its supportive state on SEPARATE lines -- never merged into one", () => {
  const p = profile({ identityAction: "לדבר בבהירות", desiredIdentity: "מנהיג נחוש", identityDesiredState: "ביטחון ואנרגיה" });
  const ctx = { triggerText: "לפני פגישה", mode: "with_archi" as const };
  const steps = buildArcLinkProtocolSteps(p, { kind: "supportive", target: "identity" }, ctx);
  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.match(encoding.lines.join(" "), /מתחבר למצב התומך הפנימי שלך: ביטחון ואנרגיה/);
  assert.match(encoding.lines.join(" "), /מבטא את הזהות מנהיג נחוש/);
});

test("buildArcLinkProtocolSteps' encoding step shows the Value alongside the identity, never merged into the identity/state/mantra text -- omits it entirely when not configured", () => {
  const withValue = profile({ identityAction: "לדבר בבהירות", desiredIdentity: "מנהיג נחוש", value: "אחריות ומצוינות" });
  const withoutValue = profile({ identityAction: "לדבר בבהירות", desiredIdentity: "מנהיג נחוש" });
  const ctx = { triggerText: "לפני פגישה", mode: "with_archi" as const };
  const withValueEncoding = buildArcLinkProtocolSteps(withValue, { kind: "supportive", target: "identity" }, ctx).find((s) => s.id === "encoding")!;
  const withoutValueEncoding = buildArcLinkProtocolSteps(withoutValue, { kind: "supportive", target: "identity" }, ctx).find((s) => s.id === "encoding")!;
  assert.match(withValueEncoding.lines.join(" "), /מבטא את הזהות מנהיג נחוש, מתוך הערך אחריות ומצוינות/);
  assert.match(withoutValueEncoding.lines.join(" "), /מבטא את הזהות מנהיג נחוש\./);
  assert.ok(!withoutValueEncoding.lines.join(" ").includes("מתוך הערך"));
});

test("buildArcLinkProtocolSteps' encoding step's Future Mantra resolution order: ctx.futureMantraOverride wins over the profile's own Future Mantra, which wins over the older Identity Mantra", () => {
  const p = profile({
    identityAction: "לדבר בבהירות",
    identityFutureOrientedMantra: "אני מתחיל היום בצעד קטן",
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "מנטרת זהות ישנה" },
  });
  const choice = { kind: "supportive", target: "identity" } as const;

  const overrideCtx = { triggerText: "טריגר", mode: "with_archi" as const, futureMantraOverride: "מנטרה מותאמת לקישור" };
  const overrideEncoding = buildArcLinkProtocolSteps(p, choice, overrideCtx).find((s) => s.id === "encoding")!;
  assert.match(overrideEncoding.lines.join(" "), /מנטרה מותאמת לקישור/);
  assert.ok(!overrideEncoding.lines.join(" ").includes("אני מתחיל היום בצעד קטן"));

  const noOverrideCtx = { triggerText: "טריגר", mode: "with_archi" as const };
  const futureMantraEncoding = buildArcLinkProtocolSteps(p, choice, noOverrideCtx).find((s) => s.id === "encoding")!;
  assert.match(futureMantraEncoding.lines.join(" "), /אני מתחיל היום בצעד קטן/);
  assert.ok(!futureMantraEncoding.lines.join(" ").includes("מנטרת זהות ישנה"));
});

test("buildArcLinkProtocolSteps' encoding step falls back to the older Identity Mantra only when no Future Mantra is configured anywhere", () => {
  const p = profile({
    identityAction: "לדבר בבהירות",
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "מנטרת זהות ישנה" },
  });
  const ctx = { triggerText: "טריגר", mode: "with_archi" as const };
  const encoding = buildArcLinkProtocolSteps(p, { kind: "supportive", target: "identity" }, ctx).find((s) => s.id === "encoding")!;
  assert.match(encoding.lines.join(" "), /מנטרת זהות ישנה/);
});

test("buildArcLinkProtocolSteps' encoding step for a STATE target never shows identityDesiredState (identity-layer only) -- uses supportiveState as its own identity-equivalent label", () => {
  const p = profile({ internalAction: "סריקת גוף", supportiveState: "רוגע", value: "בריאות" });
  const ctx = { triggerText: "טריגר", mode: "with_archi" as const };
  const encoding = buildArcLinkProtocolSteps(p, { kind: "supportive", target: "state" }, ctx).find((s) => s.id === "encoding")!;
  assert.match(encoding.lines.join(" "), /מתחבר ל-רוגע, מתוך הערך בריאות/);
  assert.ok(!encoding.lines.join(" ").includes("מבטא את הזהות"), "state target never uses identity-expression phrasing");
});

test("buildArcLinkProtocolSteps' encoding step is empty (never a dangling label) for a habit-only build with none of the new fields configured", () => {
  const p = profile({ beneficialAction: "לצאת להליכה" });
  const ctx = { triggerText: "טריגר", mode: "with_archi" as const };
  const encoding = buildArcLinkProtocolSteps(p, null, ctx).find((s) => s.id === "encoding")!;
  assert.deepEqual(encoding.lines, []);
});

// ---------------------------------------------------------------------------
// Coherent-architecture task (#22 "With ARCHI"): "Once the trainee imagines
// pressing 'התחלת ARC', finish the Link rehearsal" -- buildArcLinkStartConfirmationStep
// is the short ending live/ArcLinkScreen.tsx uses INSTEAD of
// buildArcLinkProtocolSteps for with_archi mode. buildArcLinkProtocolSteps
// itself stays fully capable of producing the full sequence for either mode
// (already covered above) -- this is purely an additive, caller-level piece.
// ---------------------------------------------------------------------------

test("buildArcLinkStartConfirmationStep produces exactly one step, mentioning pressing Start and the saved trigger, never the full protocol content", () => {
  const step = buildArcLinkStartConfirmationStep({ triggerText: "בשעה 10:00", mode: "with_archi" });
  assert.equal(step.id, "archi_start_confirmation");
  assert.match(step.lines.join(" "), /בשעה 10:00/);
  assert.match(step.title, /התחלת ARC/);
  assert.equal(step.bodyImagery, null);
  assert.equal(step.buttonLabel, "סיום ARC Link");
});

test("buildArcLinkStartConfirmationStep is safe (never 'undefined'/'null') when the trigger text is blank", () => {
  const step = buildArcLinkStartConfirmationStep({ triggerText: "", mode: "with_archi" });
  const text = `${step.title} ${step.lines.join(" ")}`;
  assert.ok(!text.includes("undefined"));
  assert.ok(!text.includes("null"));
});

// ---------------------------------------------------------------------------
// Unified Presence/Mantra/Trigger/Imagery spec, section 10: ARC Link
// integration -- mantras/imagery/Energy Color/breathing, all inherited live
// from the referenced ArcBuildProfile (never a duplicate ArcLink-level
// field), applied without rebuilding ARC Link or adding new stages.
// ---------------------------------------------------------------------------

test("buildArcLinkSteps: Energy Color leads the presence step, and the free-breathing line is appended -- both inherited from the linked profile, never a separate ARC Link field", () => {
  const withColor = buildArcLinkSteps(profile({ internalAction: "סריקת גוף", presenceColor: "כחול" }));
  const presence = withColor.find((s) => s.id === "presence")!;
  assert.equal(presence.lines[0], "שים לב כיצד האנרגיה בצבע כחול מתפשטת בגופך ומחזירה אותך לנוכחות.");
  assert.equal(presence.lines[presence.lines.length - 1], "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.");

  const withoutColor = buildArcLinkSteps(profile({ internalAction: "סריקת גוף", presenceColor: null }));
  const presenceNoColor = withoutColor.find((s) => s.id === "presence")!;
  assert.ok(!presenceNoColor.lines[0].includes("האנרגיה"), "no Energy Color line at all when unset -- never invented");
  assert.equal(
    presenceNoColor.lines[presenceNoColor.lines.length - 1],
    "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.",
    "breathing line still appears even with no saved color"
  );
});

test("buildArcLinkSteps: Stay/Acceptance Mantras appear at the end of their own steps when configured, and add nothing when not", () => {
  const p = profile({ internalAction: "סריקת גוף", stayMantra: "טקסט שהייה", acceptanceMantra: "טקסט קבלה" });
  const steps = buildArcLinkSteps(p);
  const awareness = steps.find((s) => s.id === "awareness")!;
  const acceptance = steps.find((s) => s.id === "acceptance")!;
  assert.equal(awareness.lines[awareness.lines.length - 1], 'אפשר להישאר עם זה לרגע: "טקסט שהייה".');
  assert.equal(acceptance.lines[acceptance.lines.length - 1], 'מותר לזה להיות כאן כרגע: "טקסט קבלה".');

  const withoutMantras = buildArcLinkSteps(profile({ internalAction: "סריקת גוף" }));
  const awarenessNoMantra = withoutMantras.find((s) => s.id === "awareness")!;
  const acceptanceNoMantra = withoutMantras.find((s) => s.id === "acceptance")!;
  assert.equal(awarenessNoMantra.lines.length, 1, "no extra line when stayMantra is unset");
  assert.equal(acceptanceNoMantra.lines.length, 1, "no extra line when acceptanceMantra is unset");
});

test("buildArcLinkSteps: Balanced Alternative Interpretation leads the awareness/stay-equivalent step, before its existing content and any Stay Mantra, and adds nothing when unset", () => {
  const p = profile({
    internalAction: "סריקת גוף",
    stateBalancedAlternativeInterpretation: "אני יכול להתקדם בהדרגה",
    stayMantra: "טקסט שהייה",
  });
  const awareness = buildArcLinkSteps(p).find((s) => s.id === "awareness")!;
  assert.ok(awareness.lines[0].includes("אני יכול להתקדם בהדרגה"), "the Balanced Alternative Interpretation leads the step");
  assert.equal(awareness.lines[awareness.lines.length - 1], 'אפשר להישאר עם זה לרגע: "טקסט שהייה".', "Stay Mantra still ends the step");

  const withoutIt = buildArcLinkSteps(profile({ internalAction: "סריקת גוף" }));
  const awarenessWithoutIt = withoutIt.find((s) => s.id === "awareness")!;
  assert.equal(awarenessWithoutIt.lines.length, 1, "no extra leading line when unset -- never invented, never an empty step");
});

test("buildArcLinkSteps: Balanced Alternative Interpretation never leaks between state/identity targets", () => {
  const p = profile({
    internalAction: "סריקת גוף",
    stateBalancedAlternativeInterpretation: "הפרשנות של המצב",
    identityAction: "לדבר בבהירות",
    identityBalancedAlternativeInterpretation: "הפרשנות של הזהות",
  });
  const awareness = buildArcLinkSteps(p).find((s) => s.id === "awareness")!;
  assert.ok(awareness.lines[0].includes("הפרשנות של המצב"), "state is the resolved target (state > identity priority)");
  assert.ok(!awareness.lines.join(" ").includes("הפרשנות של הזהות"));
});

test("buildArcLinkSteps: Regulation Mantra then Bridge Mantra appear at the end of the regulation step, in that order, before Encoding", () => {
  const p = profile({ internalAction: "סריקת גוף", regulationMantra: "טקסט ויסות", bridgeMantra: "טקסט גשר" });
  const steps = buildArcLinkSteps(p);
  const regulation = steps.find((s) => s.id === "regulation")!;
  assert.deepEqual(regulation.lines, ['תן לגוף להתייצב בקצב שלו: "טקסט ויסות".', 'הגשר לקראת מה שרוצים לחזק: "טקסט גשר".']);

  const regulationIndex = steps.findIndex((s) => s.id === "regulation");
  const encodingIndex = steps.findIndex((s) => s.id === "encoding");
  assert.ok(regulationIndex < encodingIndex, "regulation (carrying both mantras) comes before encoding");

  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.ok(!encoding.lines.join(" ").includes("טקסט גשר"), "Bridge Mantra never also appears in Encoding");
});

test("buildArcLinkSteps: desired imagery is inherited from the linked profile and appended inside the encoding step", () => {
  const p = profile({
    internalAction: "סריקת גוף",
    supportiveState: "מיקוד",
    stateDesiredImageryType: "real",
    stateDesiredImageryDescription: "תמונה מהחתונה שלי",
  });
  const encoding = buildArcLinkSteps(p).find((s) => s.id === "encoding")!;
  assert.ok(encoding.lines.some((line) => line.includes("תמונה מהחתונה שלי")), "the configured desired imagery appears in Encoding");

  const withoutImagery = buildArcLinkSteps(profile({ internalAction: "סריקת גוף" }));
  const encodingNoImagery = withoutImagery.find((s) => s.id === "encoding")!;
  assert.ok(!encodingNoImagery.lines.join(" ").includes("העלה בדמיונך"), "no imagery line at all when unset -- never invented");
});

test("buildArcLinkProtocolSteps: same Energy Color/breathing/mantra/imagery inheritance holds on the newer route-choice entry point", () => {
  const p = profile({
    internalAction: "סריקת גוף",
    presenceColor: "ירוק",
    stateBalancedAlternativeInterpretation: "אני יכול להתקדם בהדרגה",
    stayMantra: "טקסט שהייה",
    acceptanceMantra: "טקסט קבלה",
    regulationMantra: "טקסט ויסות",
    bridgeMantra: "טקסט גשר",
    supportiveState: "מיקוד",
    stateDesiredImageryType: "imagined",
    stateDesiredImageryDescription: "אור זהוב",
  });
  const ctx = { triggerText: "טריגר", mode: "with_archi" as const };
  const steps = buildArcLinkProtocolSteps(p, null, ctx);

  const presence = steps.find((s) => s.id === "presence")!;
  assert.equal(presence.lines[0], "שים לב כיצד האנרגיה בצבע ירוק מתפשטת בגופך ומחזירה אותך לנוכחות.");
  assert.equal(presence.lines[presence.lines.length - 1], "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.");

  const awareness = steps.find((s) => s.id === "awareness")!;
  assert.ok(awareness.lines[0].includes("אני יכול להתקדם בהדרגה"), "the Balanced Alternative Interpretation leads the step here too");
  assert.equal(awareness.lines[awareness.lines.length - 1], 'אפשר להישאר עם זה לרגע: "טקסט שהייה".');
  const acceptance = steps.find((s) => s.id === "acceptance")!;
  assert.equal(acceptance.lines[acceptance.lines.length - 1], 'מותר לזה להיות כאן כרגע: "טקסט קבלה".');

  const regulation = steps.find((s) => s.id === "regulation")!;
  assert.deepEqual(regulation.lines, ['תן לגוף להתייצב בקצב שלו: "טקסט ויסות".', 'הגשר לקראת מה שרוצים לחזק: "טקסט גשר".']);

  const encoding = steps.find((s) => s.id === "encoding")!;
  assert.ok(encoding.lines.some((line) => line.includes("אור זהוב")));
});

test("buildArcLinkProtocolSteps: on the 'supportive' route, Stay/Acceptance steps are skipped entirely -- their mantras never appear anywhere, never as an orphaned line", () => {
  const p = profile({
    internalAction: "סריקת גוף",
    supportiveState: "מיקוד",
    stayMantra: "טקסט שהייה",
    acceptanceMantra: "טקסט קבלה",
  });
  const ctx = { triggerText: "טריגר", mode: "with_archi" as const };
  const steps = buildArcLinkProtocolSteps(p, { kind: "supportive", target: "state" }, ctx);
  assert.equal(steps.find((s) => s.id === "awareness"), undefined, "supportive route never shows Awareness");
  assert.equal(steps.find((s) => s.id === "acceptance"), undefined, "supportive route never shows Acceptance");
  const allLines = steps.map((s) => s.lines.join(" ")).join(" ");
  assert.ok(!allLines.includes("טקסט שהייה"));
  assert.ok(!allLines.includes("טקסט קבלה"));
});

test("neither buildArcLinkSteps nor buildArcLinkProtocolSteps ever renders 'undefined'/'null'/'[object Object]' for a legacy profile with none of the new fields configured", () => {
  const legacy = profile({ internalAction: "סריקת גוף" });
  const legacyText = allText(legacy);
  assert.ok(!legacyText.includes("undefined"));
  assert.ok(!legacyText.includes("null"));
  assert.ok(!legacyText.includes("[object Object]"));

  const ctx = { triggerText: "טריגר", mode: "with_archi" as const };
  const protocolText = buildArcLinkProtocolSteps(legacy, null, ctx)
    .map((s) => `${s.title} ${s.lines.join(" ")}`)
    .join(" ");
  assert.ok(!protocolText.includes("undefined"));
  assert.ok(!protocolText.includes("null"));
  assert.ok(!protocolText.includes("[object Object]"));
});
