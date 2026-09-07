/**
 * arc/arcLink.ts
 *
 * ARC Link task: a NEW, independent imagery-rehearsal mode -- "Trigger
 * -> Open ARCHI -> Start the selected protocol -> Perform the exact
 * personalized protocol -> Begin the beneficial action", entirely in
 * imagination. Deliberately separate from normal ARC's own engine
 * (arc/arcEngine.ts/arc/stageCopy.ts) and its ArcStage/ArcLiveState
 * machinery -- ARC Link never runs the real stage sequencer, never
 * collects a live Presence/sensation/desired-state rating, and never
 * starts the real Action/Success Focus/Gratitude/Negative Action
 * timers. It reads its content directly from the SAME ArcBuildProfile
 * BUILD already produced ("Do not create a second independent ARC
 * configuration") -- every screen below is generated straight from that
 * profile's own fields, so any BUILD edit is automatically reflected
 * the next time ARC Link is opened.
 *
 * Reuses the exact fixed Presence instruction text normal ARC's own
 * Presence stages use (arc/instructions.ts's getAwarenessInstruction/
 * getCombinedAttentionInstruction/getExpandPresenceInstruction) and the
 * shared body-imagery lookup (arc/bodyImagery.ts) also used by Mini ARC
 * Link -- never a duplicated or drifted copy of either.
 *
 * A trainee's ArcBuild can target state, identity, or habit (or, rarely,
 * more than one) -- ARC Link rehearses ONE primary target at a time,
 * resolved with the same state > identity > habit priority
 * build/arcBuildSave.ts's inferTarget already uses for reopening BUILD,
 * duplicated here (not imported) to keep arc/ independent of build/
 * (arc/ is a lower layer; build/ depends on it, never the reverse).
 */

import { resolveFutureMantra, resolveIdentityLabel, resolveSupportiveStateLabel, resolveValueLabel } from "./arcLinkContent.ts";
import { getAwarenessInstruction, getCombinedAttentionInstruction, getExpandPresenceInstruction } from "./instructions.ts";
import { getBodyImageryForText, safeTriggerText } from "./bodyImagery.ts";
import type { BodyImagery } from "./bodyImagery.ts";
import type { ArcLinkMode, ArcLinkTriggerCategory } from "./routineLinks.ts";
import { buildTriggerImageryContent } from "./triggerImagery.ts";
import type { ArcBuildProfile } from "./types.ts";

export type ArcLinkTarget = "state" | "identity" | "habit";

/** Same priority as build/arcBuildSave.ts's inferTarget (state > identity > habit) -- duplicated, not imported, to keep arc/ independent of build/. null only for a genuinely empty/unbuilt profile. */
export function resolveArcLinkTarget(profile: ArcBuildProfile): ArcLinkTarget | null {
  if (profile.stateEncoding !== null || profile.internalAction !== null) return "state";
  if (profile.identityEncoding !== null || profile.identityAction !== null) return "identity";
  if (profile.beneficialAction !== null) return "habit";
  return null;
}

export type ArcLinkStepId =
  | "intro"
  | "trigger"
  | "enter_archi"
  | "route_intro"
  | "awareness"
  | "sensation"
  | "acceptance"
  | "presence"
  | "regulation"
  | "updated_sensation"
  | "encoding"
  | "beneficial_action"
  | "reinforce"
  /** Coherent-architecture task (#22 "With ARCHI"): the short ending used ONLY in "with_archi" mode -- see buildArcLinkStartConfirmationStep's own doc. */
  | "archi_start_confirmation";

export interface ArcLinkStep {
  id: ArcLinkStepId;
  title: string;
  /** Body lines, always non-empty, always safe to render one per line -- never "undefined"/"null"/"[object Object]". */
  lines: string[];
  buttonLabel: string;
  /** Only present on the "regulation"/"encoding" steps -- the reusable live/BodyImageryStep.tsx component's own input. null for every other step. */
  bodyImagery: { anchorLabel: string; imagery: BodyImagery } | null;
}

function safe(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The one action label ARC Link rehearses for a target -- mirrors resolveEncodingTarget's own per-target action resolution (arc/arcEngine.ts), simplified for a rehearsal with no live selectedAction/alternative-action state. */
function resolveActionLabel(profile: ArcBuildProfile, target: ArcLinkTarget): string {
  if (target === "state") return safe(profile.internalAction) || safe(profile.beneficialAction);
  if (target === "identity") return safe(profile.identityAction) || safe(profile.beneficialAction);
  return safe(profile.beneficialAction);
}

function resolveDesiredStateLabel(profile: ArcBuildProfile, target: ArcLinkTarget): string {
  if (target === "state") return safe(profile.supportiveState);
  if (target === "identity") return safe(profile.desiredIdentity);
  return safe(profile.beneficialAction);
}

function resolveInterferingLabel(profile: ArcBuildProfile, target: ArcLinkTarget): string {
  if (target === "state") return safe(profile.interferingState);
  if (target === "identity") return safe(profile.identityInterferingEmotion);
  return "";
}

function resolveEncodingBodyLanguage(profile: ArcBuildProfile, target: ArcLinkTarget): { cue: string; bodyImagery: BodyImagery | null } {
  const encoding = target === "state" ? profile.stateEncoding : target === "identity" ? profile.identityEncoding : null;
  return { cue: safe(encoding?.bodyLanguageCue), bodyImagery: encoding?.bodyImagery ?? null };
}

function resolveMantra(profile: ArcBuildProfile, target: ArcLinkTarget): string {
  const encoding = target === "state" ? profile.stateEncoding : target === "identity" ? profile.identityEncoding : null;
  return safe(encoding?.mantra);
}

/**
 * Builds the full, ordered ARC Link screen sequence for one ArcBuild --
 * pure and total: never throws, never renders "undefined"/"null"/
 * "[object Object]", and degrades safely (generic wording, a step
 * simply omitting a line) for a profile with little or nothing
 * configured yet, exactly like a legacy/incomplete build must never
 * crash this rehearsal mode.
 */
export function buildArcLinkSteps(profile: ArcBuildProfile): ArcLinkStep[] {
  const trigger = safeTriggerText(profile.linkSettings);
  const target = resolveArcLinkTarget(profile);
  const actionLabel = target ? resolveActionLabel(profile, target) : safe(profile.beneficialAction);
  const desiredStateLabel = target ? resolveDesiredStateLabel(profile, target) : "";
  const interferingLabel = target ? resolveInterferingLabel(profile, target) : "";
  const presenceColor = safe(profile.presenceColor);
  const regulationText = safe(profile.regulationTool);
  const encodingBodyLanguage = target ? resolveEncodingBodyLanguage(profile, target) : { cue: "", bodyImagery: null };
  const mantra = target ? resolveMantra(profile, target) : "";

  const connectionDiagram = `${trigger || "הטריגר שלך"} ← כניסה ל-ARCHI ← ביצוע ARC ← הפעולה המיטיבה`;

  const steps: ArcLinkStep[] = [];

  steps.push({
    id: "intro",
    title: "ARC Link",
    lines: ["בתרגול הזה תחזק את הקישור בין הטריגר שלך לבין הכניסה ל-ARCHI וביצוע ה-ARC האישי שלך.", connectionDiagram],
    buttonLabel: "התחלת התרגול",
    bodyImagery: null,
  });

  steps.push({
    id: "trigger",
    title: "דמיין את הטריגר",
    lines: [
      "עצום עיניים ודמיין שהרגע הבא מתרחש:",
      trigger || "הטריגר שהגדרת",
      "דמיין היכן אתה נמצא, מה אתה רואה סביבך ומה אתה עושה באותו רגע. דמיין את הרגע כאילו הוא מתרחש עכשיו.",
    ],
    buttonLabel: "דמיינתי את הטריגר",
    bodyImagery: null,
  });

  steps.push({
    id: "enter_archi",
    title: "דמיין את הכניסה ל-ARCHI",
    lines: [
      "דמיין שאתה מזהה את הטריגר ונזכר:",
      "זה הזמן שלי לעשות ARC.",
      "דמיין שאתה לוקח את הטלפון, פותח את ARCHI, בוחר את תוכנית ה-ARC שלך ולוחץ על “התחלת ARC רגיל”.",
      "ראה את עצמך מתחיל בלי לדחות ובלי לעבור לאפליקציה אחרת.",
    ],
    buttonLabel: "נכנסתי ל-ARCHI בדמיון",
    bodyImagery: null,
  });

  steps.push({
    id: "awareness",
    title: "דמיין את המודעות",
    lines: ["דמיין שאתה שם לב למה שכבר נמצא באותו רגע, בלי להעצים אותו ובלי להילחם בו."],
    buttonLabel: "המשך",
    bodyImagery: null,
  });

  // "the current interfering sensation or state" -- shown only when this
  // target actually has one mapped (BUILD's own recognition data), never
  // invented. Safe, neutral, recognition-only wording -- never an
  // instruction to evoke/strengthen it.
  if (interferingLabel) {
    steps.push({
      id: "sensation",
      title: "דמיין את התחושה הנוכחית",
      lines: [
        `דמיין שאתה שם לב לתחושה או למצב שנוטים להופיע: ${interferingLabel}.`,
        "דמיין שאתה רק שם לב אליו, כפי שהוא, בלי להעצים אותו ובלי להילחם בו.",
      ],
      buttonLabel: "המשך",
      bodyImagery: null,
    });
  }

  steps.push({
    id: "acceptance",
    title: "דמיין את הקבלה",
    lines: ["דמיין שאתה מוכן לקבל את מה שנמצא כרגע כמו שהוא, בלי להילחם בו."],
    buttonLabel: "המשך",
    bodyImagery: null,
  });

  // Presence: the exact same fixed instruction text normal ARC's own
  // three Presence stages use, in their correct order, plus the
  // dynamic Presence Color imagery (spec Section 4). Never a live
  // Presence rating, never the routing that decides whether to run
  // full/partial Presence in normal ARC -- ARC Link always rehearses
  // the complete configured Presence process.
  const presenceLines = [
    "דמיין שאתה מבצע את שלבי הנוכחות שמופיעים ב-ARC הרגיל שלך.",
    getAwarenessInstruction(),
    getCombinedAttentionInstruction(),
    getExpandPresenceInstruction(),
  ];
  if (presenceColor) {
    presenceLines.push(
      "כעת דמיין את צבע הנוכחות שלך:",
      presenceColor,
      "דמיין שהצבע מתפשט בהדרגה וממלא את הגוף. אפשר לצבע להתפשט בקצב טבעי, בזמן שאתה נעשה נוכח, יציב ומחובר יותר לכאן ולעכשיו."
    );
  }
  steps.push({ id: "presence", title: "דמיין את הנוכחות", lines: presenceLines, buttonLabel: "דמיינתי את הנוכחות", bodyImagery: null });

  // "lines" for a bodyImagery-carrying step holds ONLY content beyond
  // what live/BodyImageryStep.tsx already renders from `bodyImagery`
  // itself (the anchor line + body parts + imagery text) -- Regulation
  // has nothing extra.
  const regulationImagery = getBodyImageryForText(regulationText, profile.regulationBodyImagery ?? null);
  steps.push({
    id: "regulation",
    title: "דמיין את הוויסות",
    lines: [],
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: regulationText, imagery: regulationImagery },
  });

  steps.push({
    id: "updated_sensation",
    title: "דמיין את התחושה המתעדכנת",
    lines: ["דמיין שאתה שם לב לתחושה שלך עכשיו, ולכל שינוי שקרה, אם קרה."],
    buttonLabel: "המשך",
    bodyImagery: null,
  });

  const encodingImagery = getBodyImageryForText(encodingBodyLanguage.cue, encodingBodyLanguage.bodyImagery);
  const encodingLines: string[] = [];
  if (desiredStateLabel && mantra) {
    encodingLines.push(`דמיין שאתה מתחבר ל-${desiredStateLabel} ואומר לעצמך: “${mantra}”.`);
  } else if (desiredStateLabel) {
    encodingLines.push(`דמיין שאתה מתחבר ל-${desiredStateLabel}.`);
  } else if (mantra) {
    encodingLines.push(`דמיין שאתה אומר לעצמך: “${mantra}”.`);
  }
  steps.push({
    id: "encoding",
    title: "דמיין את הקידוד",
    lines: encodingLines,
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: encodingBodyLanguage.cue, imagery: encodingImagery },
  });

  steps.push({
    id: "beneficial_action",
    title: "דמיין את הפעולה המיטיבה",
    lines: [
      "דמיין שאתה מסיים את ה-ARC ומתחיל לבצע:",
      actionLabel || "הפעולה המיטיבה שלך",
      "דמיין בבירור את הצעד הראשון. אין צורך לדמיין ביצוע מושלם -- רק את עצמך מתחיל.",
    ],
    buttonLabel: "חיזוק הקישור",
    bodyImagery: null,
  });

  steps.push({
    id: "reinforce",
    title: "חיזוק הקישור",
    lines: [
      `${trigger || "הטריגר שלך"} ← אני פותח את ARCHI ← אני מבצע את ה-ARC שלי ← אני מתחיל את ${actionLabel || "הפעולה המיטיבה שלי"}.`,
      "חזור על הרצף פעם נוספת בדמיון.",
      `כש${trigger || "הטריגר שלך"}, אני נכנס ל-ARCHI ומתחיל את ה-ARC שלי.`,
    ],
    buttonLabel: "סיום ARC Link",
    bodyImagery: null,
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Weekly Routine + ARC Link management task: route choice (interfering vs
// supportive) + with/without ARCHI mode, used by the NEW Routine-page
// Practice area (live/ArcLinkScreen.tsx, reached with a `linkId` param).
// buildArcLinkSteps above is left completely UNCHANGED for the original
// entry point (build/LiveModeSelectScreen.tsx, no route/mode choice, always
// "with_archi") -- these are new, additive exports, not a replacement.
// ---------------------------------------------------------------------------

export interface ArcLinkRouteOption {
  target: ArcLinkTarget;
  label: string;
}

/**
 * Both of normal ARC's own main route choices ("something interfering"
 * vs "create a supportive state"), collected from whichever of the
 * state/identity layers this build actually has built out (mirrors
 * resolveArcLinkTarget's own "state"/"identity" availability check --
 * a bare interferingState/supportiveState typed in with no encoding/
 * action ever configured is not offered as a rehearsable route). Never
 * invents a target habit doesn't have: the habit layer has no
 * interfering/supportive STATE of its own (only a beneficial action),
 * so it never appears in either list.
 */
export function resolveArcLinkRouteOptions(profile: ArcBuildProfile): { interfering: ArcLinkRouteOption[]; supportive: ArcLinkRouteOption[] } {
  const stateConfigured = profile.stateEncoding !== null || profile.internalAction !== null;
  const identityConfigured = profile.identityEncoding !== null || profile.identityAction !== null;

  const interfering: ArcLinkRouteOption[] = [];
  const stateInterfering = safe(profile.interferingState);
  if (stateConfigured && stateInterfering) interfering.push({ target: "state", label: stateInterfering });
  const identityInterfering = safe(profile.identityInterferingEmotion);
  if (identityConfigured && identityInterfering) interfering.push({ target: "identity", label: identityInterfering });

  const supportive: ArcLinkRouteOption[] = [];
  const stateSupportive = safe(profile.supportiveState);
  if (stateConfigured && stateSupportive) supportive.push({ target: "state", label: stateSupportive });
  const identitySupportive = safe(profile.desiredIdentity);
  if (identityConfigured && identitySupportive) supportive.push({ target: "identity", label: identitySupportive });

  return { interfering, supportive };
}

/** null = no explicit choice was made (or none was available) -- protocol steps fall back to the same automatic state > identity > habit priority buildArcLinkSteps has always used, with "sensation" included only when that target has an interfering label, exactly reproducing the original, unconditional behavior. */
export type ArcLinkRouteChoice = { kind: "interfering" | "supportive"; target: ArcLinkTarget } | null;

export interface ArcLinkRehearsalContext {
  triggerText: string;
  mode: ArcLinkMode;
  /**
   * Extended ARC Link trigger system: steers ONLY the trigger-imagery
   * wording (arc/triggerImagery.ts) -- optional, defaulting to
   * "scheduled" (the original, unconditional trigger-imagery wording)
   * so every existing caller of buildArcLinkIntroSteps that doesn't
   * pass this keeps producing exactly the same text as before this
   * field existed.
   */
  triggerCategory?: ArcLinkTriggerCategory;
  /**
   * Updated-ARC-structure task: ArcLink.futureMantraOverride
   * (arc/routineLinks.ts) -- see arc/arcLinkContent.ts's
   * resolveFutureMantra for the full resolution order (override -> the
   * referenced ARC's own Future Mantra -> its older Identity Mantra ->
   * ""). Only read by buildArcLinkProtocolSteps' own encoding step;
   * buildArcLinkSteps (the original, legacy entry point) never reads
   * this field, so its behavior is completely unaffected.
   */
  futureMantraOverride?: string | null;
}

/**
 * The fixed opening screens shared by every rehearsal, regardless of
 * which route is chosen afterward: intro, trigger imagery, and (only
 * for "with_archi") entering ARCHI. For "without_archi", the trainee
 * proceeds directly from imagining the trigger to imagining the
 * remembered protocol -- the "enter_archi" screen never appears.
 */
export function buildArcLinkIntroSteps(profile: ArcBuildProfile, ctx: ArcLinkRehearsalContext): ArcLinkStep[] {
  const trigger = ctx.triggerText.trim();
  const connectionDiagram =
    ctx.mode === "with_archi"
      ? `${trigger || "הטריגר שלך"} ← כניסה ל-ARCHI ← ביצוע ARC ← הפעולה המיטיבה`
      : `${trigger || "הטריגר שלך"} ← ביצוע ARC מהזיכרון ← הפעולה המיטיבה`;
  const introText =
    ctx.mode === "with_archi"
      ? "בתרגול הזה תחזק את הקישור בין הטריגר שלך לבין הכניסה ל-ARCHI וביצוע ה-ARC האישי שלך."
      : "בתרגול הזה תחזק את הקישור בין הטריגר שלך לבין ביצוע ה-ARC האישי שלך מהזיכרון.";

  const triggerCategory = ctx.triggerCategory ?? "scheduled";
  const interferingLabel = triggerCategory === "reactive" ? (() => {
    const target = resolveArcLinkTarget(profile);
    return target ? resolveInterferingLabel(profile, target) : "";
  })() : "";
  const triggerContent = buildTriggerImageryContent(trigger, triggerCategory, interferingLabel);

  const steps: ArcLinkStep[] = [
    {
      id: "intro",
      title: "ARC Link",
      lines: [introText, connectionDiagram],
      buttonLabel: "התחלת התרגול",
      bodyImagery: null,
    },
    {
      id: "trigger",
      title: "דמיין את הטריגר",
      lines: triggerContent.lines,
      buttonLabel: triggerContent.buttonLabel,
      bodyImagery: null,
    },
  ];

  if (ctx.mode === "with_archi") {
    steps.push({
      id: "enter_archi",
      title: "דמיין את הכניסה ל-ARCHI",
      lines: [
        "דמיין שאתה מזהה את הטריגר ונזכר:",
        "זה הזמן שלי לעשות ARC.",
        "דמיין שאתה לוקח את הטלפון, פותח את ARCHI, בוחר את תוכנית ה-ARC שלך ולוחץ על התחלה.",
        "ראה את עצמך מתחיל בלי לדחות ובלי לעבור לאפליקציה אחרת.",
      ],
      buttonLabel: "נכנסתי ל-ARCHI בדמיון",
      bodyImagery: null,
    });
  }

  return steps;
}

/**
 * The rest of the rehearsal (Awareness through the final connection),
 * shaped by which route was chosen: "interfering" adds the safe
 * recognition wording for the chosen interfering state (never an
 * instruction to evoke/strengthen it) plus Awareness/Acceptance;
 * "supportive" skips Awareness/Acceptance/the interfering-state step/
 * Updated Sensation entirely -- normal ARC's own proactive route never
 * has them either. `choice: null` reproduces buildArcLinkSteps' own
 * original, unconditional behavior exactly (Awareness and Acceptance
 * always included; "sensation" only when the resolved target has an
 * interfering label) for full backward compatibility.
 */
export function buildArcLinkProtocolSteps(profile: ArcBuildProfile, choice: ArcLinkRouteChoice, ctx: ArcLinkRehearsalContext): ArcLinkStep[] {
  const trigger = ctx.triggerText.trim();
  const target = choice?.target ?? resolveArcLinkTarget(profile);
  const routeKind: "interfering" | "supportive" | "legacy" = choice?.kind ?? "legacy";

  const actionLabel = target ? resolveActionLabel(profile, target) : safe(profile.beneficialAction);
  const interferingLabel = target ? resolveInterferingLabel(profile, target) : "";
  const presenceColor = safe(profile.presenceColor);
  const regulationText = safe(profile.regulationTool);
  const encodingBodyLanguage = target ? resolveEncodingBodyLanguage(profile, target) : { cue: "", bodyImagery: null };
  // Updated-ARC-structure task: identityLabel is the identity/state NAME
  // itself (desiredIdentity for "identity", the state layer's own
  // Desired State for "state" -- it has no separate identity concept);
  // supportiveStateLabel is the SEPARATE internal condition that
  // supports expressing it (identityDesiredState, identity-layer only).
  // Never merged -- "preserve the conceptual separation between all of
  // these components."
  const identityLabel = target ? resolveIdentityLabel(profile, target) : "";
  const supportiveStateLabel = target ? resolveSupportiveStateLabel(profile, target) : "";
  const valueLabel = resolveValueLabel(profile);
  const futureMantra = target ? resolveFutureMantra(profile, target, ctx.futureMantraOverride) : "";

  const steps: ArcLinkStep[] = [];

  if (routeKind === "interfering") {
    steps.push({
      id: "route_intro",
      title: "דמיין את המצב המפריע",
      lines: [
        `דמיין שהטריגר מתרחש ושבאותו רגע אתה מזהה ש-${interferingLabel || "המצב המפריע"} כבר נמצא. אין צורך לעורר או להעצים אותו.`,
        "דמיין שאתה מתחיל את הפרוטוקול ועובר בין השלבים שלו.",
      ],
      buttonLabel: "המשך",
      bodyImagery: null,
    });
  }

  if (routeKind !== "supportive") {
    steps.push({
      id: "awareness",
      title: "דמיין את המודעות",
      lines: ["דמיין שאתה שם לב למה שכבר נמצא באותו רגע, בלי להעצים אותו ובלי להילחם בו."],
      buttonLabel: "המשך",
      bodyImagery: null,
    });
  }

  // "the current interfering sensation or state" -- shown for the
  // explicit interfering route, or (legacy, choice === null) only when
  // this target actually has one mapped, never invented. Safe, neutral,
  // recognition-only wording -- never an instruction to evoke/strengthen it.
  if (routeKind === "interfering" || (routeKind === "legacy" && interferingLabel)) {
    steps.push({
      id: "sensation",
      title: "דמיין את התחושה הנוכחית",
      lines: [
        `דמיין שאתה שם לב לתחושה או למצב שנוטים להופיע: ${interferingLabel}.`,
        "דמיין שאתה רק שם לב אליו, כפי שהוא, בלי להעצים אותו ובלי להילחם בו.",
      ],
      buttonLabel: "המשך",
      bodyImagery: null,
    });
  }

  if (routeKind !== "supportive") {
    steps.push({
      id: "acceptance",
      title: "דמיין את הקבלה",
      lines: ["דמיין שאתה מוכן לקבל את מה שנמצא כרגע כמו שהוא, בלי להילחם בו."],
      buttonLabel: "המשך",
      bodyImagery: null,
    });
  }

  // Presence -- identical for every route kind, the exact same fixed
  // instruction text normal ARC's own three Presence stages use.
  const presenceLines = [
    "דמיין שאתה מבצע את שלבי הנוכחות שמופיעים ב-ARC הרגיל שלך.",
    getAwarenessInstruction(),
    getCombinedAttentionInstruction(),
    getExpandPresenceInstruction(),
  ];
  if (presenceColor) {
    presenceLines.push(
      "כעת דמיין את צבע הנוכחות שלך:",
      presenceColor,
      "דמיין שהצבע מתפשט בהדרגה וממלא את הגוף. אפשר לצבע להתפשט בקצב טבעי, בזמן שאתה נעשה נוכח, יציב ומחובר יותר לכאן ולעכשיו."
    );
  }
  steps.push({ id: "presence", title: "דמיין את הנוכחות", lines: presenceLines, buttonLabel: "דמיינתי את הנוכחות", bodyImagery: null });

  const regulationImagery = getBodyImageryForText(regulationText, profile.regulationBodyImagery ?? null);
  steps.push({
    id: "regulation",
    title: "דמיין את הוויסות",
    lines: [],
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: regulationText, imagery: regulationImagery },
  });

  if (routeKind !== "supportive") {
    steps.push({
      id: "updated_sensation",
      title: "דמיין את התחושה המתעדכנת",
      lines: ["דמיין שאתה שם לב לתחושה שלך עכשיו, ולכל שינוי שקרה, אם קרה."],
      buttonLabel: "המשך",
      bodyImagery: null,
    });
  }

  const encodingImagery = getBodyImageryForText(encodingBodyLanguage.cue, encodingBodyLanguage.bodyImagery);
  const encodingLines: string[] = [];
  if (supportiveStateLabel) {
    encodingLines.push(`דמיין שאתה מתחבר למצב התומך הפנימי שלך: ${supportiveStateLabel}.`);
  }
  if (target === "identity" && identityLabel) {
    encodingLines.push(valueLabel ? `מתוך המצב הזה אתה מבטא את הזהות ${identityLabel}, מתוך הערך ${valueLabel}.` : `מתוך המצב הזה אתה מבטא את הזהות ${identityLabel}.`);
  } else if (target === "state" && identityLabel) {
    encodingLines.push(valueLabel ? `דמיין שאתה מתחבר ל-${identityLabel}, מתוך הערך ${valueLabel}.` : `דמיין שאתה מתחבר ל-${identityLabel}.`);
  } else if (valueLabel) {
    encodingLines.push(`אתה פועל מתוך הערך ${valueLabel}.`);
  }
  if (futureMantra) {
    encodingLines.push(`דמיין שאתה אומר לעצמך את המנטרה העתידית: “${futureMantra}”.`);
  }
  steps.push({
    id: "encoding",
    title: "דמיין את הקידוד",
    lines: encodingLines,
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: encodingBodyLanguage.cue, imagery: encodingImagery },
  });

  steps.push({
    id: "beneficial_action",
    title: "דמיין את הפעולה המיטיבה",
    lines: [
      "דמיין שאתה מסיים את הפרוטוקול ומתחיל לבצע:",
      actionLabel || "הפעולה המיטיבה שלך",
      "דמיין בבירור את הצעד הראשון. אין צורך לדמיין ביצוע מושלם -- רק את עצמך מתחיל.",
    ],
    buttonLabel: "חיזוק הקישור",
    bodyImagery: null,
  });

  const reinforceLines =
    ctx.mode === "with_archi"
      ? [
          `${trigger || "הטריגר שלך"} ← אני פותח את ARCHI ← אני מבצע את ה-ARC שלי ← אני מתחיל את ${actionLabel || "הפעולה המיטיבה שלי"}.`,
          "חזור על הרצף פעם נוספת בדמיון.",
          `כש${trigger || "הטריגר שלך"}, אני נכנס ל-ARCHI ומתחיל את ה-ARC שלי.`,
        ]
      : [
          `${trigger || "הטריגר שלך"} ← אני מתחיל ARC מהזיכרון ← אני מבצע את הפרוטוקול שלי ← אני מתחיל את ${actionLabel || "הפעולה המיטיבה שלי"}.`,
          "חזור על הרצף פעם נוספת בדמיון.",
          `כש${trigger || "הטריגר שלך"}, אני מתחיל את ה-ARC שלי ועובר לפעולה המיטיבה.`,
        ];
  steps.push({ id: "reinforce", title: "חיזוק הקישור", lines: reinforceLines, buttonLabel: "סיום ARC Link", bodyImagery: null });

  return steps;
}

/**
 * Coherent-architecture task (#22 "With ARCHI"): "Once the trainee
 * imagines pressing 'התחלת ARC', finish the Link rehearsal. Do not
 * require imagining the remaining full protocol in With ARCHI mode
 * because ARCHI will guide the real execution." Used by the
 * Routine-page Practice flow (live/ArcLinkScreen.tsx) as the ENTIRE
 * "protocol phase" in with_archi mode, in place of
 * buildArcLinkProtocolSteps -- the route choice (interfering/
 * supportive + which target) is still shown first, since Section 22
 * itself says to imagine SELECTING the correct route in the app before
 * pressing Start; only the full stage-by-stage rehearsal after that is
 * skipped. buildArcLinkProtocolSteps itself is untouched and still
 * supports being called with mode "with_archi" directly (its own
 * tests cover that) -- this is an additive, caller-level choice, not a
 * change to that function's own behavior.
 */
export function buildArcLinkStartConfirmationStep(ctx: ArcLinkRehearsalContext): ArcLinkStep {
  const trigger = ctx.triggerText.trim();
  return {
    id: "archi_start_confirmation",
    title: "דמיין שאתה לוחץ על 'התחלת ARC'",
    lines: [
      "דמיין את עצמך לוחץ על הכפתור ומתחיל את ה-ARC.",
      "מכאן, ARCHI ידריך אותך דרך התהליך המדויק שלך.",
      `כש${trigger || "הטריגר שלך"}, אני נכנס ל-ARCHI ומתחיל את ה-ARC שלי.`,
    ],
    buttonLabel: "סיום ARC Link",
    bodyImagery: null,
  };
}

