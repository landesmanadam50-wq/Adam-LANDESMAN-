/**
 * arc/reviewLaterFactor.ts
 *
 * Productivity roadmap, Stages Q/R/S: "if a new thought/belief/urge
 * appears during a task and no saved protocol matches, allow a short
 * text label, do not force a full BUILD process, offer neutral
 * support, return to the task, and save the factor for later BUILD or
 * coaching review." This module models exactly that saved record --
 * an append-only side collection (same convention as
 * data/taskJournal.ts's TaskJournalEntry), never a second/competing
 * UrgeArc/ThoughtArc/BeliefArc record, and never auto-converted into
 * one -- turning a reviewed factor into a real saved protocol is
 * always a deliberate, later BUILD action.
 */

export type ReviewLaterFactorKind = "urge" | "thought" | "belief";

/** Stage P/Q's deterministic "need beneath the urge" options -- only ever meaningful for kind "urge"; a plain fixed choice, never inferred from the trainee's own typed label. */
export type UrgeNeed = "relief" | "rest" | "stimulation" | "pleasure" | "connection" | "safety" | "control" | "overload" | "other" | "unknown";

export const URGE_NEED_OPTIONS: UrgeNeed[] = ["relief", "rest", "stimulation", "pleasure", "connection", "safety", "control", "overload", "other", "unknown"];

export const URGE_NEED_LABELS: Record<UrgeNeed, string> = {
  relief: "הקלה",
  rest: "מנוחה",
  stimulation: "גירוי או עניין",
  pleasure: "הנאה",
  connection: "חיבור",
  safety: "ביטחון",
  control: "שליטה",
  overload: "בריחה מעומס",
  other: "צורך אחר",
  unknown: "לא יודע",
};

export interface ReviewLaterFactor {
  id: string;
  kind: ReviewLaterFactorKind;
  /** The trainee's own short, typed label -- never interpreted or classified, only stored and shown back verbatim at review time. */
  label: string;
  /** Only ever set for kind "urge". */
  need: UrgeNeed | null;
  /** The task this factor came up during, if any -- optional context for a later coaching/BUILD review, never required. */
  taskId: string | null;
  createdAt: string;
}

export function generateReviewLaterFactorId(): string {
  return `review-later-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createReviewLaterFactor(
  kind: ReviewLaterFactorKind,
  label: string,
  need: UrgeNeed | null,
  taskId: string | null,
  now: string
): ReviewLaterFactor {
  return { id: generateReviewLaterFactorId(), kind, label: label.trim(), need: kind === "urge" ? need : null, taskId, createdAt: now };
}
