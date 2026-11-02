/**
 * arc/preparationStates.ts
 *
 * Productivity roadmap, Stage K: the proactive route -- "strengthen a
 * supportive state before starting a task." Pure content only; no
 * React, no storage, no navigation (live/PreparationScreen.tsx renders
 * what this module decides).
 *
 * Two distinct sources of content, per the product spec's own
 * predefined-vs-saved distinction (see arc/stateProfile.ts's "no
 * built-in presets exist" gap this module fills):
 * - 8 PREDEFINED states (focus/confidence/calm/energy/patience/
 *   curiosity/determination/creativity) -- fixed, deterministic,
 *   built into the app, never user-editable. The spec's own worked
 *   examples (focus/confidence/calm/energy) are reproduced verbatim as
 *   5-step sequences; the other 4 (patience/curiosity/determination/
 *   creativity) are a reasonable, consistent extension built from the
 *   exact same step categories (body contact, natural breath, posture,
 *   mantra/energy color, first-action imagery) per this task's own
 *   "make reasonable implementation decisions" instruction.
 * - A SAVED, personal StateProfile (arc/stateProfile.ts) -- its own
 *   already-authored mantra/regulationAnchor/bodyLanguageCue/
 *   energyColor/action fields are read directly, never replaced or
 *   invented.
 *
 * Every step is reused/shared content where it already exists
 * (arc/naturalBreathing.ts's getFreeBreathingLine, arc/presenceColor.ts's
 * getEnergyColorLine) rather than re-authored. The final "imagine
 * starting the first action" step reuses the EXACT sanctioned
 * "דמיין את עצמך מתחיל" phrasing arc/instructions.ts's
 * containsInductionPattern denylist already whitelists for Action
 * Imagery -- never a new, unreviewed "imagine" phrasing.
 */

import { getFreeBreathingLine } from "./naturalBreathing.ts";
import { getEnergyColorLine, hasPresenceColor } from "./presenceColor.ts";
import type { StateProfile } from "./stateProfile.ts";

export type PreparationStateId = "focus" | "confidence" | "calm" | "energy" | "patience" | "curiosity" | "determination" | "creativity";

export const PREPARATION_STATE_IDS: PreparationStateId[] = [
  "focus",
  "confidence",
  "calm",
  "energy",
  "patience",
  "curiosity",
  "determination",
  "creativity",
];

export const PREPARATION_STATE_LABELS: Record<PreparationStateId, string> = {
  focus: "ריכוז",
  confidence: "ביטחון",
  calm: "רוגע",
  energy: "אנרגיה",
  patience: "סבלנות",
  curiosity: "סקרנות",
  determination: "נחישות",
  creativity: "יצירתיות",
};

function imagineStartingAction(firstAction: string, flavor: string): string {
  const trimmed = firstAction.trim();
  const target = trimmed ? `: ${trimmed}` : ".";
  return `דמיין את עצמך מתחיל ${flavor ? `${flavor} ` : ""}את הפעולה הראשונה${target}`.trim();
}

const MANTRA_INVITATION = "אם יש לך מילה או משפט תומך קבוע -- זה הזמן לחזור עליו בשקט, בלי למהר.";

/** Deterministic, fixed step text for one of the 8 predefined states. Never reads anything from a saved StateProfile -- see getPreparationStepsForStateProfile below for the linked-profile path. */
export function getPredefinedPreparationSteps(stateId: PreparationStateId, firstAction: string): string[] {
  switch (stateId) {
    case "focus":
      return [
        "אפשר להרחיב בעדינות את שדה הראייה, מעבר לנקודה אחת.",
        "שים לב למגע של כפות הרגליים עם הרצפה.",
        getFreeBreathingLine(),
        "אפשר לכוון את הגוף לעמידה או ישיבה פנויה וממוקדת.",
        imagineStartingAction(firstAction, ""),
      ];
    case "confidence":
      return [
        MANTRA_INVITATION,
        "אפשר להזדקף -- לישר מעט את הגב.",
        "אפשר לפתוח את כפות הידיים ולהנמיך את הכתפיים.",
        "שים לב לעדות ממשית מהעבר ליכולת שלך להתמודד עם משימות כאלה.",
        imagineStartingAction(firstAction, ""),
      ];
    case "calm":
      return [
        "שים לב למגע של הגוף עם המשטח שעליו אתה נשען או יושב.",
        getFreeBreathingLine(),
        "אפשר להנמיך את הכתפיים.",
        "שים לב לתחושה הפיזית של רוגע בגוף, אם היא קיימת כרגע.",
        imagineStartingAction(firstAction, "בתחושת רוגע"),
      ];
    case "energy":
      return [
        "אפשר לבצע תנועה קצרה -- למתוח, לנענע או לקום לרגע.",
        "אפשר לכוון את הגוף לעמידה פתוחה.",
        "שים לב לצבע אנרגיה שבחרת, אם יש לך כזה.",
        MANTRA_INVITATION,
        imagineStartingAction(firstAction, "באנרגיה"),
      ];
    case "patience":
      return [
        getFreeBreathingLine(),
        "אפשר להנמיך את הכתפיים ולשחרר את החזקה בידיים.",
        "שים לב למגע של כפות הרגליים עם הרצפה.",
        MANTRA_INVITATION,
        imagineStartingAction(firstAction, "בקצב שלך, שלב אחר שלב"),
      ];
    case "curiosity":
      return [
        "אפשר להרחיב בעדינות את שדה הראייה.",
        "אפשר לכוון את הגוף לעמידה פתוחה ורכה.",
        getFreeBreathingLine(),
        MANTRA_INVITATION,
        imagineStartingAction(firstAction, "בסקרנות"),
      ];
    case "determination":
      return [
        "אפשר להזדקף -- לישר מעט את הגב.",
        getFreeBreathingLine(),
        MANTRA_INVITATION,
        "שים לב לעדות ממשית מהעבר ליכולת שלך להתמודד עם משימות כאלה.",
        imagineStartingAction(firstAction, "בנחישות"),
      ];
    case "creativity":
      return [
        "אפשר לשנות תנוחה או לבצע תנועה קצרה.",
        "אפשר להרחיב בעדינות את שדה הראייה.",
        "שים לב לתחושה הפיזית בגוף כרגע, בלי לשנות אותה.",
        MANTRA_INVITATION,
        imagineStartingAction(firstAction, "בפתיחות וביצירתיות"),
      ];
  }
}

export type PreparationSource = { kind: "predefined"; id: PreparationStateId } | { kind: "profile"; profile: StateProfile };

/**
 * Resolves Task.defaultSupportiveStateId (a plain id string -- either
 * one of the 8 fixed PreparationStateId values, chosen via
 * build/TaskEditorScreen.tsx's own chip picker, or a saved
 * StateProfile's own id) against the trainee's currently saved
 * profiles. Returns null for a blank id OR an id that no longer
 * resolves to anything (e.g. the linked StateProfile was since
 * deleted) -- callers fall back to the ordinary chooser rather than
 * crash or silently invent a default, matching this product's own
 * "linked ids must tolerate a deleted/archived target" rule.
 */
export function resolvePreparationSource(defaultSupportiveStateId: string | null, stateProfiles: StateProfile[]): PreparationSource | null {
  if (!defaultSupportiveStateId) return null;
  if ((PREPARATION_STATE_IDS as string[]).includes(defaultSupportiveStateId)) {
    return { kind: "predefined", id: defaultSupportiveStateId as PreparationStateId };
  }
  // Productivity roadmap, Stage AC: a disabled/archived StateProfile is treated exactly like a deleted one -- never silently offered as if it were still a live, active choice (the library's own disable-only convention still applies: the record itself is untouched, only no longer surfaced here).
  const profile = stateProfiles.find((candidate) => candidate.id === defaultSupportiveStateId && candidate.status === "enabled");
  return profile ? { kind: "profile", profile } : null;
}

export function getPreparationStepsForSource(source: PreparationSource, firstAction: string): string[] {
  return source.kind === "predefined" ? getPredefinedPreparationSteps(source.id, firstAction) : getPreparationStepsForStateProfile(source.profile, firstAction);
}

export function getPreparationSourceLabel(source: PreparationSource): string {
  return source.kind === "predefined" ? PREPARATION_STATE_LABELS[source.id] : source.profile.name;
}

/**
 * The LINKED-saved-StateProfile path -- every line is built directly
 * from that profile's own already-authored fields, never invented;
 * a field left blank at BUILD time simply produces no line for it
 * (never a placeholder/fallback sentence pretending content exists).
 */
export function getPreparationStepsForStateProfile(profile: StateProfile, firstAction: string): string[] {
  const steps: string[] = [];
  if (profile.stateMantra && profile.stateMantra.trim()) steps.push(profile.stateMantra.trim());
  if (profile.bodyLanguageCue && profile.bodyLanguageCue.trim()) steps.push(profile.bodyLanguageCue.trim());
  if (profile.naturalBreathingAwareness && profile.naturalBreathingAwareness.trim()) {
    steps.push(profile.naturalBreathingAwareness.trim());
  } else {
    steps.push(getFreeBreathingLine());
  }
  if (profile.regulationAnchor && profile.regulationAnchor.trim()) steps.push(profile.regulationAnchor.trim());
  if (hasPresenceColor(profile.energyColor)) {
    const line = getEnergyColorLine(profile.energyColor);
    if (line) steps.push(line);
  }
  if (profile.action && profile.action.trim()) steps.push(profile.action.trim());
  steps.push(imagineStartingAction(firstAction, ""));
  return steps;
}
