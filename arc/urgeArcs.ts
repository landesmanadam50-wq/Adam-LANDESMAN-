/**
 * arc/urgeArcs.ts
 *
 * Pure list-manipulation logic behind data/storage.ts's UrgeArc CRUD --
 * mirrors arc/arcGoals.ts/arc/arcBuilds.ts exactly: creating/editing/
 * deleting one UrgeArc never touches another, two urges sharing the
 * same name stay fully independent, distinguished only by their own
 * stable id.
 */

import type { UrgeArc } from "./types.ts";
import { generateUrgeArcId } from "./types.ts";

function safeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Updates the one UrgeArc matching `urgeArc.id` in place if found, otherwise appends it as new. Never reorders the rest of the list, and never matches by anything other than id. */
export function upsertUrgeArcInList(urgeArcs: UrgeArc[], urgeArc: UrgeArc): UrgeArc[] {
  const index = urgeArcs.findIndex((existing) => existing.id === urgeArc.id);
  if (index === -1) return [...urgeArcs, urgeArc];
  return urgeArcs.map((existing, i) => (i === index ? urgeArc : existing));
}

/** Removes exactly the one UrgeArc matching `id` -- every other row is returned as the exact same object it already was. A no-op if the id doesn't match any row. */
export function deleteUrgeArcFromList(urgeArcs: UrgeArc[], id: string): UrgeArc[] {
  return urgeArcs.filter((urgeArc) => urgeArc.id !== id);
}

/** A new, independent copy under a fresh id -- never shares an id with, or mutates, the original. Array fields (mappedTriggers/underlyingNeeds) are copied by value, never by reference. */
export function duplicateUrgeArc(urgeArc: UrgeArc, now: string): UrgeArc {
  return {
    ...urgeArc,
    id: generateUrgeArcId(),
    name: `${urgeArc.name} (עותק)`,
    mappedTriggers: [...urgeArc.mappedTriggers],
    underlyingNeeds: [...urgeArc.underlyingNeeds],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// BUILD-facing draft shape -- mirrors arc/miniArc.ts's own
// MiniArcDraft/createEmptyMiniArcDraft/draftFromMiniArc/
// isMiniArcDraftComplete/buildMiniArcFromDraft pattern exactly: ONE flat
// form (build/UrgeArcEditorScreen.tsx), never a multi-step wizard --
// UrgeArc has seven short fields total, not dozens. mappedTriggers/
// underlyingNeeds are edited as comma-separated free text, split into
// arrays only at save time (buildUrgeArcFromDraft), same convention
// already used for MiniArcDraft's own regulationBodyParts/
// encodingBodyParts.
// ---------------------------------------------------------------------------

export interface UrgeArcDraft {
  name: string;
  interferingAction: string;
  mappedTriggers: string;
  underlyingNeeds: string;
  stopCue: string;
  regulationAnchor: string;
  acceptanceContent: string;
  bodyLanguageCue: string;
  encodingMantra: string;
  beneficialAlternativeAction: string;
}

export function createEmptyUrgeArcDraft(): UrgeArcDraft {
  return {
    name: "",
    interferingAction: "",
    mappedTriggers: "",
    underlyingNeeds: "",
    stopCue: "",
    regulationAnchor: "",
    acceptanceContent: "",
    bodyLanguageCue: "",
    encodingMantra: "",
    beneficialAlternativeAction: "",
  };
}

export function draftFromUrgeArc(urgeArc: UrgeArc): UrgeArcDraft {
  return {
    name: safeText(urgeArc.name),
    interferingAction: safeText(urgeArc.interferingAction),
    mappedTriggers: urgeArc.mappedTriggers.join(", "),
    underlyingNeeds: urgeArc.underlyingNeeds.join(", "),
    stopCue: safeText(urgeArc.stopCue),
    regulationAnchor: safeText(urgeArc.regulationAnchor),
    acceptanceContent: safeText(urgeArc.acceptanceContent),
    bodyLanguageCue: safeText(urgeArc.bodyLanguageCue),
    encodingMantra: safeText(urgeArc.encodingMantra),
    beneficialAlternativeAction: safeText(urgeArc.beneficialAlternativeAction),
  };
}

/** "Do not treat the urge itself as an ordinary emotion" (spec section 9) still means the same completeness bar as any other protocol: a name, the interfering action itself, a regulation anchor, and the beneficial alternative action that bridges into Identity -- mappedTriggers/underlyingNeeds/stopCue/acceptanceContent stay optional, exactly like MiniArcDraft's own Link trigger/custom body imagery are optional on top of its five required fields. */
export function isUrgeArcDraftComplete(draft: UrgeArcDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    draft.interferingAction.trim().length > 0 &&
    draft.regulationAnchor.trim().length > 0 &&
    draft.beneficialAlternativeAction.trim().length > 0
  );
}

/** Builds a real, persistable UrgeArc from a complete draft. Throws for an incomplete draft -- callers must gate on isUrgeArcDraftComplete first, matching buildMiniArcFromDraft's own "never silently save incomplete data" guarantee. */
export function buildUrgeArcFromDraft(draft: UrgeArcDraft, id: string, createdAt: string, updatedAt: string): UrgeArc {
  if (!isUrgeArcDraftComplete(draft)) {
    throw new Error("Cannot build an UrgeArc from an incomplete draft");
  }
  const stopCue = draft.stopCue.trim();
  const acceptanceContent = draft.acceptanceContent.trim();
  const bodyLanguageCue = draft.bodyLanguageCue.trim();
  const encodingMantra = draft.encodingMantra.trim();
  return {
    id,
    name: draft.name.trim(),
    createdAt,
    updatedAt,
    interferingAction: draft.interferingAction.trim(),
    mappedTriggers: splitCommaList(draft.mappedTriggers),
    underlyingNeeds: splitCommaList(draft.underlyingNeeds),
    stopCue: stopCue.length > 0 ? stopCue : null,
    regulationAnchor: draft.regulationAnchor.trim(),
    acceptanceContent: acceptanceContent.length > 0 ? acceptanceContent : null,
    bodyLanguageCue: bodyLanguageCue.length > 0 ? bodyLanguageCue : null,
    encodingMantra: encodingMantra.length > 0 ? encodingMantra : null,
    beneficialAlternativeAction: draft.beneficialAlternativeAction.trim(),
  };
}

/**
 * ARC Urge Stop Action/Encoding task: backfills every UrgeArc saved
 * before this task's new optional fields existed -- mirrors
 * arc/arcGoals.ts's own normalizeArcGoal exactly (safe defaults, never
 * invented content, never overwrites an already-configured field).
 * Applied once, at load time (data/storage.ts's loadUrgeArcs), so every
 * other reader in this app can keep assuming a fully-populated record.
 */
export function normalizeUrgeArc(urgeArc: UrgeArc): UrgeArc {
  return {
    ...urgeArc,
    stopCue: urgeArc.stopCue ?? null,
    acceptanceContent: urgeArc.acceptanceContent ?? null,
    bodyLanguageCue: urgeArc.bodyLanguageCue ?? null,
    encodingMantra: urgeArc.encodingMantra ?? null,
  };
}
