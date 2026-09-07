/**
 * arc/futureOrientedMantra.ts
 *
 * Coherent-architecture task (#7/#8): pure copy helper for the ONE new
 * ArcBuildProfile field this piece adds per layer (stateFutureOrientedMantra/
 * identityFutureOrientedMantra) -- "the direction I'm moving toward
 * right now", surfaced once, between Presence and Encoding (see
 * arc/stageCopy.ts's "regulate" case), the same placement/mechanism
 * pattern as arc/presenceColor.ts's getPresenceColorReminder.
 *
 * Distinct from Presence ("this is what's here now") and from Identity
 * Mantra (EncodingProfile.mantra -- "the person I'm practicing
 * becoming", said during Encoding): this is the trainee's own saved,
 * forward-looking sentence, always echoed back verbatim inside one
 * fixed frame, never invented or reworded. Returns null (never a blank/
 * invented line) when nothing is saved for the resolved layer, or for
 * the habit layer (which has no future-oriented-mantra field of its
 * own -- see ArcBuildProfile's doc) -- callers then leave the existing
 * text completely unchanged, exactly as if this feature didn't exist
 * for that build.
 */

import type { DevelopmentLayer } from "./types.ts";

export function getFutureOrientedMantraLine(
  profile: { stateFutureOrientedMantra?: string | null; identityFutureOrientedMantra?: string | null },
  layer: DevelopmentLayer
): string | null {
  const text =
    layer === "state" ? profile.stateFutureOrientedMantra : layer === "identity" ? profile.identityFutureOrientedMantra : null;
  if (typeof text !== "string" || text.trim().length === 0) return null;
  return `הכיוון שאליו אתה מתקדם עכשיו: "${text.trim()}".`;
}
