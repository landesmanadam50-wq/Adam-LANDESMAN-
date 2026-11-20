/**
 * arc/arcInsightBelief.ts
 *
 * ARC-system upgrade task, Part E ("מערכת אמונות חדשה ב-ARC המתוכנן") and
 * the shared "תובנות ועדכון אמונות" mechanism parts B.3/B.4, C, F step 9,
 * and I rely on: the data model for an insight captured after an action,
 * and a belief built from -- or independent of -- one.
 *
 * Pure types + pure constructors only, no storage, no React -- CRUD
 * lives in data/storage.ts (loadArcInsights/appendArcInsight,
 * loadArcBeliefs/saveArcBeliefs/upsertArcBelief), matching every other
 * collection's own load/save/get/upsert split already established there.
 *
 * Central rules this module exists to enforce structurally, never just
 * by convention at a call site:
 * - An insight is NEVER invented: every ArcInsight.text is the
 *   trainee's own words, captured once, frozen.
 * - A belief's origin is always exactly one of three kinds (spec Part
 *   E.1): "learned" (built from a real insight), "new" (added by the
 *   trainee ahead of any action, not yet evidenced), "updated" (built
 *   after a further action, referencing the belief and insight it grew
 *   from). The type itself (BeliefOrigin) makes "a brand-new belief
 *   marked as already proven" unrepresentable in the common case: a
 *   fresh `createNewPlannedBelief` always starts unproven, and only
 *   `createUpdatedBelief` (run after a real action) can mark one newly
 *   evidenced.
 * - Updating a belief NEVER mutates or deletes the original record
 *   (spec rules 15: "אמונה חדשה אינה מוחקת את האמונה המקורית") --
 *   createUpdatedBelief always returns a BRAND NEW record with its own
 *   id; the caller appends it alongside the old one (upsertBeliefInList
 *   only ever replaces a row with the SAME id, so there is no code path
 *   that overwrites a prior belief in place).
 */

import { STANDALONE_ARC_TASK_ID } from "./newArcLiveTypes.ts";

export type BeliefKind = "emotional" | "identity";
export type BeliefOrigin = "learned" | "new" | "updated";

/**
 * ARCHI -- Unified Development Specification task, Part 3 ("ADD
 * INSIGHTS FROM THE HOME SCREEN"): a third kind, for an ArcInsight
 * ONLY -- never for ArcBelief, which stays grounded in a real ARC
 * exercise and keeps exactly its original two kinds. "general" marks a
 * freeform insight the trainee wrote directly (Home screen/Settings),
 * with no originating exercise or task at all.
 */
export type ArcInsightKind = BeliefKind | "general";

/**
 * One captured answer to "מה התובנה שלמדת על עצמך?" -- normally always
 * tied to the real exercise/action it followed. `taskId` is null for
 * an emotional-track exercise with no linked task, OR for a standalone
 * insight (beliefKind "general") never linked to one. `taskId` is also
 * this insight's own link to a task for Part 6 ("CREATE TASKS FROM
 * INSIGHTS")/Part 8 ("LINK INSIGHTS TO EXISTING TASKS") -- never a
 * second, separate link field; several insights may share one taskId,
 * and changing or clearing it (createArcInsight is never re-called for
 * that) is a plain field update via data/storage.ts's own
 * upsertArcInsight.
 */
export interface ArcInsight {
  id: string;
  /** The spontaneous or planned ARC exercise instance this insight was captured during -- never re-resolved, just a frozen reference. STANDALONE_ARC_TASK_ID (arc/newArcLiveTypes.ts) for a standalone insight with no real exercise behind it at all. */
  sourceExerciseId: string;
  taskId: string | null;
  beliefKind: ArcInsightKind;
  /** The trainee's own words, verbatim. Never generated. */
  text: string;
  occurredAt: string;
  createdAt: string;
}

export interface ArcBelief {
  id: string;
  beliefKind: BeliefKind;
  origin: BeliefOrigin;
  text: string;
  /** The insight this was formulated from -- null for a freely-added "new" belief with no prior evidence yet. */
  insightId: string | null;
  sourceExerciseId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Same stable-id-string pattern as arc/tasks.ts's generateTaskId -- not cryptographically unique; collision odds are astronomically low at this single-device, trainee-authored scale. */
export function generateArcInsightId(): string {
  return `arc-insight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateArcBeliefId(): string {
  return `arc-belief-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcInsight(fields: Pick<ArcInsight, "id" | "sourceExerciseId" | "taskId" | "beliefKind" | "text" | "occurredAt" | "createdAt">): ArcInsight {
  return { ...fields, text: fields.text.trim() };
}

/**
 * ARCHI -- Unified Development Specification task, Part 3: a freeform
 * insight the trainee writes directly (Home screen or Settings "הוסף
 * תובנה"), never captured during or re-derived from any real ARC
 * exercise. Reuses the existing STANDALONE_ARC_TASK_ID sentinel for
 * sourceExerciseId -- "not a real exercise," exactly its established
 * meaning elsewhere -- rather than inventing a second placeholder
 * concept. taskId starts null; Part 6/8's own task-creation/linking
 * flows set it afterward via a plain field update, never by re-calling
 * this constructor.
 */
export function createStandaloneInsight(id: string, text: string, now: string): ArcInsight {
  return createArcInsight({ id, sourceExerciseId: STANDALONE_ARC_TASK_ID, taskId: null, beliefKind: "general", text, occurredAt: now, createdAt: now });
}

/** Part E.1.a: a belief formulated FROM a real insight -- the ordinary case right after an emotional/identity action. */
export function createLearnedBelief(id: string, beliefKind: BeliefKind, text: string, insightId: string, sourceExerciseId: string, now: string): ArcBelief {
  return { id, beliefKind, origin: "learned", text: text.trim(), insightId, sourceExerciseId, createdAt: now, updatedAt: now };
}

/** Part E.1.b: a belief the trainee adds ahead of any action, to develop through the exercise -- never required to match, and never treated as already-proven (spec rule 14). */
export function createNewPlannedBelief(id: string, beliefKind: BeliefKind, text: string, now: string): ArcBelief {
  return { id, beliefKind, origin: "new", text: text.trim(), insightId: null, sourceExerciseId: null, createdAt: now, updatedAt: now };
}

/**
 * Part E.1.c/E.4: a belief built AFTER an action, in light of what
 * actually happened -- always a brand-new record (never mutates
 * `previous`), always tied to the insight that prompted it. The
 * trainee's own choice to keep/update/rewrite happens before this is
 * called; this function only ever records the outcome of that choice,
 * never decides it.
 */
export function createUpdatedBelief(id: string, previous: ArcBelief, newText: string, insightId: string, now: string): ArcBelief {
  return {
    id,
    beliefKind: previous.beliefKind,
    origin: "updated",
    text: newText.trim(),
    insightId,
    sourceExerciseId: previous.sourceExerciseId,
    createdAt: now,
    updatedAt: now,
  };
}

/** Replaces a belief with the same id, or appends a new one -- never drops an existing row, never merges two different ids into one. */
export function upsertBeliefInList(beliefs: ArcBelief[], belief: ArcBelief): ArcBelief[] {
  const index = beliefs.findIndex((existing) => existing.id === belief.id);
  if (index === -1) return [...beliefs, belief];
  const next = [...beliefs];
  next[index] = belief;
  return next;
}

/** All beliefs of the given kind, most recently updated first -- for an editor/picker to choose an "active" belief from (the active choice itself is a planned-ARC-draft field, never stored on the belief; see arc/plannedArc.ts). */
export function beliefsOfKind(beliefs: ArcBelief[], beliefKind: BeliefKind): ArcBelief[] {
  return beliefs.filter((belief) => belief.beliefKind === beliefKind).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The original insight text a "learned" or "updated" belief grew from, for an editor that wants to show "this is the experience this came from" -- null for a "new" belief, which by definition has none yet. */
export function resolveOriginatingInsight(belief: ArcBelief, insights: ArcInsight[]): ArcInsight | null {
  if (!belief.insightId) return null;
  return insights.find((insight) => insight.id === belief.insightId) ?? null;
}
