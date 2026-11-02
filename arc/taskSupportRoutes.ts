/**
 * arc/taskSupportRoutes.ts
 *
 * Productivity roadmap, Stage U: presence/focus difficulty, low
 * energy, a task that's too large/unclear, and an external
 * interruption -- four short, practical, deterministic routes that
 * never route a merely practical difficulty into an emotional ARC
 * protocol ("do not automatically route practical difficulty into
 * emotional ARC").
 */

import { getFreeBreathingLine } from "./naturalBreathing.ts";

// --- Presence / focus difficulty -------------------------------------

/**
 * The product spec's own rating bands: 7-10 skips Presence entirely;
 * 4-6 runs stages 1-2; 1-3 runs stages 1-2-3. A standalone, task-
 * reactive embedded Presence -- deliberately NOT arc/presenceLive.ts's
 * own saved-PresenceArc 2-band split (7-10 vs 1-5), which stays
 * unchanged for its own existing screens; this is a different, simpler
 * context (no saved PresenceArc required) with the spec's own
 * literal 3-band rule.
 */
export function resolvePresenceStageCount(rating: number): 0 | 1 | 2 | 3 {
  if (rating >= 7) return 0;
  if (rating >= 4) return 2;
  return 3;
}

const PRESENCE_STAGE_LINES = [
  "אפשר להרחיב בעדינות את שדה הראייה.",
  "שים לב למגע של הגוף עם המשטח שעליו אתה נשען או יושב.",
  `${getFreeBreathingLine()} שים לב גם לסביבה -- לצלילים ולמרחב שסביבך.`,
];

/** Returns the first `stageCount` lines -- an empty array for 0 (skip). */
export function getEmbeddedPresenceSteps(stageCount: 0 | 1 | 2 | 3): string[] {
  return PRESENCE_STAGE_LINES.slice(0, stageCount);
}

// --- Low energy --------------------------------------------------------

export function getLowEnergySteps(firstOrCurrentAction: string): string[] {
  const trimmed = firstOrCurrentAction.trim();
  return [
    "שים לב לתחושת העייפות בגוף כרגע, בלי לנסות לשנות אותה.",
    "אפשר לבחור: תנועה קצרה, מנוחה קצרה עם זמן חזרה מוגדר, או פעולה קטנה יותר מהמתוכנן.",
    trimmed ? `אם בוחרים להתחיל, פעולה קטנה אפשרית היא: ${trimmed}.` : "אם בוחרים להתחיל, אפשר לבחור פעולה קטנה יותר מהמתוכנן.",
  ];
}

// --- Task too large / unclear (practical task support) -----------------

export interface PracticalTaskSupportAnswers {
  neededResult: string;
  unclearPart: string;
  missingPart: string;
  canDivide: boolean | null;
  smallestNextAction: string;
  startMinutes: number | null;
}

export function createEmptyPracticalTaskSupportAnswers(): PracticalTaskSupportAnswers {
  return { neededResult: "", unclearPart: "", missingPart: "", canDivide: null, smallestNextAction: "", startMinutes: null };
}

export const PRACTICAL_TASK_SUPPORT_START_MINUTES_OPTIONS = [2, 5, 10, 15, 25];

// --- External interruption ----------------------------------------------

export type ExternalInterruptionChoice = "resolveNow" | "reschedule" | "protectFocus" | "returnLater";

export const EXTERNAL_INTERRUPTION_CHOICES: ExternalInterruptionChoice[] = ["resolveNow", "reschedule", "protectFocus", "returnLater"];

export const EXTERNAL_INTERRUPTION_CHOICE_LABELS: Record<ExternalInterruptionChoice, string> = {
  resolveNow: "לפתור את ההפרעה עכשיו",
  reschedule: "לקבוע זמן אחר למשימה",
  protectFocus: "להגן על הריכוז ולהמשיך",
  returnLater: "לחזור בזמן מוגדר מאוחר יותר",
};
