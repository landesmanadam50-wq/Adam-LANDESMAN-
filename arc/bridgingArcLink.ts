/**
 * arc/bridgingArcLink.ts
 *
 * Extended ARC Link trigger system: the new Bridging ARC Link (ARC Link
 * מגשר) -- a rehearsed bridge between TWO already-built ARC components:
 *
 *   1. A supportive-state ARC (its own supportiveState + short cue).
 *   2. An identity-and-action ARC (its own desiredIdentity + identity
 *      body-language/mantra + beneficial action).
 *
 * The key principle: "the short action or body cue associated with the
 * supportive state becomes the trigger for beginning the identity ARC."
 * This is NOT a standalone protocol rehearsal (arc/arcLink.ts's
 * buildArcLinkProtocolSteps is never called here) -- it never runs
 * Presence/Awareness/Acceptance/Updated Sensation, and it never asks
 * the trainee to evoke or strengthen an interfering state. It reads
 * every piece of content live from the two referenced ArcBuildProfiles
 * ("Reuse existing program information... do not duplicate"), exactly
 * like arc/arcLink.ts / arc/miniArcLink.ts already do for their own
 * protocols.
 *
 * `supportiveProfile` and `identityProfile` may be the SAME
 * ArcBuildProfile (one build with both layers configured) or two
 * different ones -- this module never assumes either way.
 *
 * Two variants share this ONE builder ("Do not create an entirely
 * separate duplicate protocol engine"): "full" rehearses the entire
 * sequence (trigger -> cue -> supportive state -> identity -> action);
 * "short" practices only the essential transition (cue -> identity ->
 * action), skipping the standalone trigger-imagery and supportive-
 * state-recall steps.
 */

import { getBodyImageryForText } from "./bodyImagery.ts";
import type { BodyImagery } from "./bodyImagery.ts";
import type { ArcLinkTriggerCategory } from "./routineLinks.ts";
import { buildTriggerImageryContent } from "./triggerImagery.ts";
import type { ArcBuildProfile } from "./types.ts";

export type BridgingLinkStepId = "intro" | "trigger" | "cue" | "supportive_state" | "identity" | "beneficial_action" | "reinforce";

export interface BridgingLinkStep {
  id: BridgingLinkStepId;
  title: string;
  lines: string[];
  buttonLabel: string;
  /** Only present on "cue"/"identity" -- the reusable live/BodyImageryStep.tsx component's own input, exactly like arc/arcLink.ts's regulation/encoding steps. null for every other step. */
  bodyImagery: { anchorLabel: string; imagery: BodyImagery } | null;
}

export interface BridgingLinkRehearsalContext {
  triggerText: string;
  triggerCategory: ArcLinkTriggerCategory;
  variant: "full" | "short";
}

function safe(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The short supportive-state cue: the identity-layer's own lightweight body-language cue takes priority (a deliberately SHORT cue, the same "keep it short" intent as stateEncodingRegulationCue), falling back to the Full Regulation Cue -- both are candidates a trainee may have configured for exactly this purpose. */
function resolveSupportiveCue(profile: ArcBuildProfile): { label: string; bodyImagery: BodyImagery | null } {
  const label = safe(profile.stateEncoding?.bodyLanguageCue) || safe(profile.regulationTool);
  const bodyImagery = profile.stateEncoding?.bodyImagery ?? profile.regulationBodyImagery ?? null;
  return { label, bodyImagery };
}

function resolveIdentityBodyLanguage(profile: ArcBuildProfile): { cue: string; bodyImagery: BodyImagery | null } {
  return { cue: safe(profile.identityEncoding?.bodyLanguageCue), bodyImagery: profile.identityEncoding?.bodyImagery ?? null };
}

/** The trigger/context imagery step -- delegates its category-specific wording (plain/observer-perspective/safe-recognition) to arc/triggerImagery.ts's shared helper, also used by arc/arcLink.ts's own trigger step. */
function buildTriggerStep(trigger: string, category: ArcLinkTriggerCategory, interferingLabel: string): BridgingLinkStep {
  const content = buildTriggerImageryContent(trigger, category, interferingLabel);
  return { id: "trigger", title: "דמיין את הטריגר", lines: content.lines, buttonLabel: content.buttonLabel, bodyImagery: null };
}

/**
 * Builds the full, ordered Bridging ARC Link screen sequence -- pure
 * and total: never throws, never renders "undefined"/"null"/
 * "[object Object]", and degrades safely for a profile with little or
 * nothing configured yet.
 */
export function buildBridgingLinkSteps(
  supportiveProfile: ArcBuildProfile,
  identityProfile: ArcBuildProfile,
  ctx: BridgingLinkRehearsalContext
): BridgingLinkStep[] {
  const trigger = ctx.triggerText.trim();
  const isFull = ctx.variant === "full";

  const cue = resolveSupportiveCue(supportiveProfile);
  const cueImagery = getBodyImageryForText(cue.label, cue.bodyImagery);
  const supportiveStateLabel = safe(supportiveProfile.supportiveState);
  const interferingLabel = safe(supportiveProfile.interferingState);

  const identityLabel = safe(identityProfile.desiredIdentity);
  const identityBodyLanguage = resolveIdentityBodyLanguage(identityProfile);
  const identityImagery = getBodyImageryForText(identityBodyLanguage.cue, identityBodyLanguage.bodyImagery);
  const identityMantra = safe(identityProfile.identityEncoding?.mantra);
  const actionLabel = safe(identityProfile.identityAction) || safe(identityProfile.beneficialAction);

  const connectionDiagram = isFull
    ? `${trigger || "הטריגר שלך"} ← ${cue.label || "רמז הוויסות הקצר"} ← ${supportiveStateLabel || "המצב התומך"} ← ${identityLabel || "הזהות הרצויה"} ← ${actionLabel || "הפעולה המיטיבה"}`
    : `${cue.label || "רמז הוויסות הקצר"} ← ${identityLabel || "הזהות הרצויה"} ← ${actionLabel || "הפעולה המיטיבה"}`;

  const steps: BridgingLinkStep[] = [];

  steps.push({
    id: "intro",
    title: "ARC Link מגשר",
    lines: [
      "בתרגול הזה תחזק את הגשר בין הרמז התומך שלך לבין הזהות הרצויה והפעולה המיטיבה.",
      "הרמז הקצר שקשור למצב התומך הופך להיות הטריגר שמתחיל את מעבר הזהות.",
      connectionDiagram,
    ],
    buttonLabel: "התחלת התרגול",
    bodyImagery: null,
  });

  if (isFull) {
    steps.push(buildTriggerStep(trigger, ctx.triggerCategory, interferingLabel));
  }

  steps.push({
    id: "cue",
    title: "דמיין את הרמז התומך",
    lines: isFull ? ["דמיין שאתה מבצע כעת את הרמז הקצר הבא:"] : [`דמיין שאתה מבצע את הרמז הקצר הבא: ${cue.label || "הרמז שלך"}.`],
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: cue.label, imagery: cueImagery },
  });

  if (isFull) {
    steps.push({
      id: "supportive_state",
      title: "דמיין את המצב התומך",
      lines: [
        supportiveStateLabel ? `דמיין שהרמז הזה מעורר אצלך את ${supportiveStateLabel}.` : "דמיין שהרמז הזה מעורר אצלך את המצב התומך שאימנת.",
        "דמיין את המצב הזה נעשה זמין וברור.",
      ],
      buttonLabel: "המשך",
      bodyImagery: null,
    });
  }

  const identityLines: string[] = [
    "אותו רמז קצר הופך כעת להיות גם הטריגר שמתחיל את מעבר הזהות.",
  ];
  if (identityLabel && identityMantra) {
    identityLines.push(`דמיין שאתה מתחבר לזהות ${identityLabel} ואומר לעצמך: "${identityMantra}".`);
  } else if (identityLabel) {
    identityLines.push(`דמיין שאתה מתחבר לזהות ${identityLabel}.`);
  } else if (identityMantra) {
    identityLines.push(`דמיין שאתה אומר לעצמך: "${identityMantra}".`);
  }
  steps.push({
    id: "identity",
    title: "דמיין את מעבר הזהות",
    lines: identityLines,
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: identityBodyLanguage.cue, imagery: identityImagery },
  });

  steps.push({
    id: "beneficial_action",
    title: "דמיין את הפעולה המיטיבה",
    lines: [
      "דמיין שמתוך הזהות הזו אתה מתחיל לבצע:",
      actionLabel || "הפעולה המיטיבה שלך",
      "דמיין את הרצף הזה כחלק, חלק ומתגבר בהדרגה לאוטומטי -- לא כשלבים נפרדים.",
    ],
    buttonLabel: "חיזוק הגשר",
    bodyImagery: null,
  });

  const reinforceLines = isFull
    ? [connectionDiagram, "חזור על הרצף פעם נוספת בדמיון, כרצף אחד חלק.", `כש${trigger || "הטריגר שלך"} מופיע, אני מבצע את ${cue.label || "הרמז הקצר"} שלי -- וזה מתחיל את השאר.`]
    : [connectionDiagram, "חזור על הרצף פעם נוספת בדמיון, כרצף אחד חלק.", `${cue.label || "הרמז הקצר"} שלי הוא הכניסה למעבר הזהות שלי.`];
  steps.push({ id: "reinforce", title: "חיזוק הגשר", lines: reinforceLines, buttonLabel: "סיום ARC Link מגשר", bodyImagery: null });

  return steps;
}
