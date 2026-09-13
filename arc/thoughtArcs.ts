/**
 * arc/thoughtArcs.ts
 *
 * Pure list-manipulation logic behind data/storage.ts's ThoughtArc CRUD
 * -- mirrors arc/urgeArcs.ts exactly: creating/editing/deleting one
 * ThoughtArc never touches another, two thoughts sharing the same name
 * stay fully independent, distinguished only by their own stable id.
 */

import type { ThoughtArc, ThoughtModalityPreference, ThoughtRoutePreference, ThoughtTimeOrientationPreference } from "./types.ts";
import { generateThoughtArcId } from "./types.ts";

function safeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

/** Updates the one ThoughtArc matching `thoughtArc.id` in place if found, otherwise appends it as new. Never reorders the rest of the list, and never matches by anything other than id. */
export function upsertThoughtArcInList(thoughtArcs: ThoughtArc[], thoughtArc: ThoughtArc): ThoughtArc[] {
  const index = thoughtArcs.findIndex((existing) => existing.id === thoughtArc.id);
  if (index === -1) return [...thoughtArcs, thoughtArc];
  return thoughtArcs.map((existing, i) => (i === index ? thoughtArc : existing));
}

/** Removes exactly the one ThoughtArc matching `id` -- every other row is returned as the exact same object it already was. A no-op if the id doesn't match any row. */
export function deleteThoughtArcFromList(thoughtArcs: ThoughtArc[], id: string): ThoughtArc[] {
  return thoughtArcs.filter((thoughtArc) => thoughtArc.id !== id);
}

/** A new, independent copy under a fresh id -- never shares an id with, or mutates, the original. */
export function duplicateThoughtArc(thoughtArc: ThoughtArc, now: string): ThoughtArc {
  return { ...thoughtArc, id: generateThoughtArcId(), name: `${thoughtArc.name} (עותק)`, createdAt: now, updatedAt: now };
}

// ---------------------------------------------------------------------------
// BUILD-facing draft shape -- mirrors arc/urgeArcs.ts's own
// UrgeArcDraft/createEmptyUrgeArcDraft/draftFromUrgeArc/
// isUrgeArcDraftComplete/buildUrgeArcFromDraft pattern exactly: ONE flat
// form (build/ThoughtArcEditorScreen.tsx), never a multi-step wizard.
// ---------------------------------------------------------------------------

export interface ThoughtArcDraft {
  name: string;
  defaultRoute: ThoughtRoutePreference;
  currentThought: string;
  modalityPreference: ThoughtModalityPreference;
  timeOrientationPreference: ThoughtTimeOrientationPreference;
  situationContext: string;
  associatedEmotion: string;
  stayMantra: string;
  acceptanceMantra: string;
  externalSoundAnchorEnabled: boolean;
  flexibleAttentionDwellSeconds: string;
  supportiveThought: string;
  usefulInsight: string;
  visualSupportiveImage: string;
  auditorySupportiveVoiceInstruction: string;
  encodingAnchor: string;
  gentleNodCue: string;
  futureInsight: string;
  shortAction: string;
  futureImageryDwellSeconds: string;
  /** Phase 8 (universal post-action completion retrofit). */
  postActionImageryDwellSeconds: string;
  gratitudePrompt: string;
}

export function createEmptyThoughtArcDraft(): ThoughtArcDraft {
  return {
    name: "",
    defaultRoute: "decide_in_live",
    currentThought: "",
    modalityPreference: "decide_in_live",
    timeOrientationPreference: "decide_in_live",
    situationContext: "",
    associatedEmotion: "",
    stayMantra: "",
    acceptanceMantra: "",
    externalSoundAnchorEnabled: false,
    flexibleAttentionDwellSeconds: "",
    supportiveThought: "",
    usefulInsight: "",
    visualSupportiveImage: "",
    auditorySupportiveVoiceInstruction: "",
    encodingAnchor: "",
    gentleNodCue: "",
    futureInsight: "",
    shortAction: "",
    futureImageryDwellSeconds: "",
    postActionImageryDwellSeconds: "",
    gratitudePrompt: "",
  };
}

export function draftFromThoughtArc(thoughtArc: ThoughtArc): ThoughtArcDraft {
  return {
    name: safeText(thoughtArc.name),
    defaultRoute: thoughtArc.defaultRoute ?? "decide_in_live",
    currentThought: safeText(thoughtArc.currentThought),
    modalityPreference: thoughtArc.modalityPreference ?? "decide_in_live",
    timeOrientationPreference: thoughtArc.timeOrientationPreference ?? "decide_in_live",
    situationContext: safeText(thoughtArc.situationContext),
    associatedEmotion: safeText(thoughtArc.associatedEmotion),
    stayMantra: safeText(thoughtArc.stayMantra),
    acceptanceMantra: safeText(thoughtArc.acceptanceMantra),
    externalSoundAnchorEnabled: thoughtArc.externalSoundAnchorEnabled ?? false,
    flexibleAttentionDwellSeconds: thoughtArc.flexibleAttentionDwellSeconds != null ? String(thoughtArc.flexibleAttentionDwellSeconds) : "",
    supportiveThought: safeText(thoughtArc.supportiveThought),
    usefulInsight: safeText(thoughtArc.usefulInsight),
    visualSupportiveImage: safeText(thoughtArc.visualSupportiveImage),
    auditorySupportiveVoiceInstruction: safeText(thoughtArc.auditorySupportiveVoiceInstruction),
    encodingAnchor: safeText(thoughtArc.encodingAnchor),
    gentleNodCue: safeText(thoughtArc.gentleNodCue),
    futureInsight: safeText(thoughtArc.futureInsight),
    shortAction: safeText(thoughtArc.shortAction),
    futureImageryDwellSeconds: thoughtArc.futureImageryDwellSeconds != null ? String(thoughtArc.futureImageryDwellSeconds) : "",
    postActionImageryDwellSeconds: thoughtArc.postActionImageryDwellSeconds != null ? String(thoughtArc.postActionImageryDwellSeconds) : "",
    gratitudePrompt: safeText(thoughtArc.gratitudePrompt),
  };
}

/** Only a name is truly required -- every other field is optional/decide-in-LIVE by design (spec sections 6, 22: "Do not require every field"). Mirrors MiniArcDraft's own minimal-completeness bar more than UrgeArcDraft's (Thought has no single "beneficial action"-equivalent required field). */
export function isThoughtArcDraftComplete(draft: ThoughtArcDraft): boolean {
  return draft.name.trim().length > 0;
}

function parseOptionalDwellSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

/** Builds a real, persistable ThoughtArc from a complete draft. Throws for an incomplete draft -- callers must gate on isThoughtArcDraftComplete first. */
export function buildThoughtArcFromDraft(draft: ThoughtArcDraft, id: string, createdAt: string, updatedAt: string): ThoughtArc {
  if (!isThoughtArcDraftComplete(draft)) {
    throw new Error("Cannot build a ThoughtArc from an incomplete draft");
  }
  const currentThought = draft.currentThought.trim();
  const situationContext = draft.situationContext.trim();
  const associatedEmotion = draft.associatedEmotion.trim();
  const stayMantra = draft.stayMantra.trim();
  const acceptanceMantra = draft.acceptanceMantra.trim();
  const supportiveThought = draft.supportiveThought.trim();
  const usefulInsight = draft.usefulInsight.trim();
  const visualSupportiveImage = draft.visualSupportiveImage.trim();
  const auditorySupportiveVoiceInstruction = draft.auditorySupportiveVoiceInstruction.trim();
  const encodingAnchor = draft.encodingAnchor.trim();
  const gentleNodCue = draft.gentleNodCue.trim();
  const futureInsight = draft.futureInsight.trim();
  const shortAction = draft.shortAction.trim();
  const gratitudePrompt = draft.gratitudePrompt.trim();
  return {
    id,
    name: draft.name.trim(),
    createdAt,
    updatedAt,
    defaultRoute: draft.defaultRoute,
    currentThought: currentThought.length > 0 ? currentThought : null,
    modalityPreference: draft.modalityPreference,
    timeOrientationPreference: draft.timeOrientationPreference,
    situationContext: situationContext.length > 0 ? situationContext : null,
    associatedEmotion: associatedEmotion.length > 0 ? associatedEmotion : null,
    stayMantra: stayMantra.length > 0 ? stayMantra : null,
    acceptanceMantra: acceptanceMantra.length > 0 ? acceptanceMantra : null,
    externalSoundAnchorEnabled: draft.externalSoundAnchorEnabled,
    flexibleAttentionDwellSeconds: parseOptionalDwellSeconds(draft.flexibleAttentionDwellSeconds),
    supportiveThought: supportiveThought.length > 0 ? supportiveThought : null,
    usefulInsight: usefulInsight.length > 0 ? usefulInsight : null,
    visualSupportiveImage: visualSupportiveImage.length > 0 ? visualSupportiveImage : null,
    auditorySupportiveVoiceInstruction: auditorySupportiveVoiceInstruction.length > 0 ? auditorySupportiveVoiceInstruction : null,
    encodingAnchor: encodingAnchor.length > 0 ? encodingAnchor : null,
    gentleNodCue: gentleNodCue.length > 0 ? gentleNodCue : null,
    futureInsight: futureInsight.length > 0 ? futureInsight : null,
    shortAction: shortAction.length > 0 ? shortAction : null,
    futureImageryDwellSeconds: parseOptionalDwellSeconds(draft.futureImageryDwellSeconds),
    postActionImageryDwellSeconds: parseOptionalDwellSeconds(draft.postActionImageryDwellSeconds),
    gratitudePrompt: gratitudePrompt.length > 0 ? gratitudePrompt : null,
  };
}

/**
 * Backward compatibility (spec section 27): backfills every ThoughtArc
 * saved before a later field existed -- mirrors arc/urgeArcs.ts's own
 * normalizeUrgeArc exactly (safe defaults, never invented content,
 * never overwrites an already-configured field). Applied once, at load
 * time (data/storage.ts's loadThoughtArcs).
 */
export function normalizeThoughtArc(thoughtArc: ThoughtArc): ThoughtArc {
  return {
    ...thoughtArc,
    defaultRoute: thoughtArc.defaultRoute ?? null,
    currentThought: thoughtArc.currentThought ?? null,
    modalityPreference: thoughtArc.modalityPreference ?? null,
    timeOrientationPreference: thoughtArc.timeOrientationPreference ?? null,
    situationContext: thoughtArc.situationContext ?? null,
    associatedEmotion: thoughtArc.associatedEmotion ?? null,
    stayMantra: thoughtArc.stayMantra ?? null,
    acceptanceMantra: thoughtArc.acceptanceMantra ?? null,
    externalSoundAnchorEnabled: thoughtArc.externalSoundAnchorEnabled ?? null,
    flexibleAttentionDwellSeconds: thoughtArc.flexibleAttentionDwellSeconds ?? null,
    supportiveThought: thoughtArc.supportiveThought ?? null,
    usefulInsight: thoughtArc.usefulInsight ?? null,
    visualSupportiveImage: thoughtArc.visualSupportiveImage ?? null,
    auditorySupportiveVoiceInstruction: thoughtArc.auditorySupportiveVoiceInstruction ?? null,
    encodingAnchor: thoughtArc.encodingAnchor ?? null,
    gentleNodCue: thoughtArc.gentleNodCue ?? null,
    futureInsight: thoughtArc.futureInsight ?? null,
    shortAction: thoughtArc.shortAction ?? null,
    futureImageryDwellSeconds: thoughtArc.futureImageryDwellSeconds ?? null,
    postActionImageryDwellSeconds: thoughtArc.postActionImageryDwellSeconds ?? null,
    gratitudePrompt: thoughtArc.gratitudePrompt ?? null,
  };
}

/**
 * Spec section 13-14/21: records (or clears) the useful insight found
 * during a LIVE disturbing-thought session onto its ThoughtArc, so a
 * later session -- Full or Mini -- can reuse it without asking again
 * (spec section 21: "Do not require the user to write a new useful
 * insight during a real-time Mini session"). Pure; the caller persists
 * the result. Never called for a "not now" answer (that never touches
 * the saved ThoughtArc at all -- spec section 3: "Do not overwrite
 * BUILD defaults unless the user explicitly saves a change").
 */
export function saveUsefulInsightToThoughtArc(thoughtArc: ThoughtArc, usefulInsight: string, now: string): ThoughtArc {
  const trimmed = usefulInsight.trim();
  return { ...thoughtArc, usefulInsight: trimmed.length > 0 ? trimmed : thoughtArc.usefulInsight, updatedAt: now };
}
