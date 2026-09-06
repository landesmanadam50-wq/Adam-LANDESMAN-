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

import { getAwarenessInstruction, getCombinedAttentionInstruction, getExpandPresenceInstruction } from "./instructions.ts";
import { getBodyImageryForText, safeTriggerText } from "./bodyImagery.ts";
import type { BodyImagery } from "./bodyImagery.ts";
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
  | "awareness"
  | "sensation"
  | "acceptance"
  | "presence"
  | "regulation"
  | "updated_sensation"
  | "encoding"
  | "beneficial_action"
  | "reinforce";

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

