/**
 * arc/presenceArcs.ts
 *
 * Pure list-manipulation logic behind data/storage.ts's PresenceArc CRUD
 * -- mirrors arc/urgeArcs.ts/arc/thoughtArcs.ts exactly: creating/
 * editing/deleting one PresenceArc never touches another.
 */

import type { PresenceArc } from "./types.ts";
import { generatePresenceArcId } from "./types.ts";

function safeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

/** Updates the one PresenceArc matching `presenceArc.id` in place if found, otherwise appends it as new. */
export function upsertPresenceArcInList(presenceArcs: PresenceArc[], presenceArc: PresenceArc): PresenceArc[] {
  const index = presenceArcs.findIndex((existing) => existing.id === presenceArc.id);
  if (index === -1) return [...presenceArcs, presenceArc];
  return presenceArcs.map((existing, i) => (i === index ? presenceArc : existing));
}

/** Removes exactly the one PresenceArc matching `id` -- every other row is returned as the exact same object it already was. */
export function deletePresenceArcFromList(presenceArcs: PresenceArc[], id: string): PresenceArc[] {
  return presenceArcs.filter((presenceArc) => presenceArc.id !== id);
}

/** A new, independent copy under a fresh id -- never shares an id with, or mutates, the original. */
export function duplicatePresenceArc(presenceArc: PresenceArc, now: string): PresenceArc {
  return { ...presenceArc, id: generatePresenceArcId(), name: `${presenceArc.name} (עותק)`, createdAt: now, updatedAt: now };
}

// ---------------------------------------------------------------------------
// BUILD-facing draft shape -- mirrors ThoughtArcDraft/UrgeArcDraft's own
// pattern, ONE flat form (build/PresenceArcEditorScreen.tsx).
// ---------------------------------------------------------------------------

export interface PresenceArcDraft {
  name: string;
  presenceColor: string;
  presenceDwellSeconds: string;
}

export function createEmptyPresenceArcDraft(): PresenceArcDraft {
  return { name: "", presenceColor: "", presenceDwellSeconds: "" };
}

export function draftFromPresenceArc(presenceArc: PresenceArc): PresenceArcDraft {
  return {
    name: safeText(presenceArc.name),
    presenceColor: safeText(presenceArc.presenceColor),
    presenceDwellSeconds: presenceArc.presenceDwellSeconds != null ? String(presenceArc.presenceDwellSeconds) : "",
  };
}

/** Only a name is required -- Energy Color and the dwell override both stay optional, exactly like the existing ArcBuildProfile.presenceColor field always has been. */
export function isPresenceArcDraftComplete(draft: PresenceArcDraft): boolean {
  return draft.name.trim().length > 0;
}

function parseOptionalDwellSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

/** Builds a real, persistable PresenceArc from a complete draft. Throws for an incomplete draft -- callers must gate on isPresenceArcDraftComplete first. */
export function buildPresenceArcFromDraft(draft: PresenceArcDraft, id: string, createdAt: string, updatedAt: string): PresenceArc {
  if (!isPresenceArcDraftComplete(draft)) {
    throw new Error("Cannot build a PresenceArc from an incomplete draft");
  }
  const presenceColor = draft.presenceColor.trim();
  return {
    id,
    name: draft.name.trim(),
    createdAt,
    updatedAt,
    presenceColor: presenceColor.length > 0 ? presenceColor : null,
    presenceDwellSeconds: parseOptionalDwellSeconds(draft.presenceDwellSeconds),
  };
}

/**
 * Backward compatibility: backfills every PresenceArc saved before a
 * later field existed -- mirrors normalizeUrgeArc/normalizeThoughtArc
 * exactly (safe defaults, never invented content, never overwrites an
 * already-configured field). Applied once, at load time.
 */
export function normalizePresenceArc(presenceArc: PresenceArc): PresenceArc {
  return {
    ...presenceArc,
    presenceColor: presenceArc.presenceColor ?? null,
    presenceDwellSeconds: presenceArc.presenceDwellSeconds ?? null,
  };
}
