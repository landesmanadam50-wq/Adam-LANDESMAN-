/**
 * arc/combinedPresenceLink.ts
 *
 * Adaptive ARC architecture task, Phase 14A: pure resolution of whether
 * -- and which -- saved PresenceArc (arc/types.ts) a State's combined
 * practice should run as its full Presence protocol, from a
 * CombinedInterferenceSelection's own presenceEnabled +
 * linkedPresenceArcId (arc/combinedInterferenceSelection.ts, Phase
 * 14A's own new field). This is the single source of truth both the
 * BUILD screen (build/CombinedInterferenceSelectionScreen.tsx) and, in a
 * later phase, a combined LIVE screen consult -- never re-derived
 * separately in either place.
 *
 * Exactly four outcomes, never a silent guess:
 *   - presenceEnabled is false: Presence isn't part of this State's
 *     combined practice at all, so a stale/leftover linkedPresenceArcId
 *     is never even inspected -- "not_requested" regardless of what that
 *     field currently holds (disabling Presence never deletes or
 *     invalidates a previously chosen link; re-enabling later remembers
 *     it, see arc/combinedInterferenceSelection.ts's own field doc).
 *   - presenceEnabled is true but linkedPresenceArcId is null: the
 *     trainee (or an old, pre-Phase-14A record) hasn't chosen one yet --
 *     "not_linked".
 *   - presenceEnabled is true and linkedPresenceArcId is set, but no
 *     PresenceArc in the current list has that exact id (deleted
 *     elsewhere, or never existed): "linked_not_found", carrying the
 *     stale id back to the caller so it can be shown/replaced -- NEVER
 *     falls back to the first PresenceArc in the list and NEVER matches
 *     by name; only an exact id match ever counts.
 *   - Otherwise: "available", carrying the one resolved PresenceArc.
 *
 * Pure and read-only: never mutates `presenceArcs` or fabricates a
 * PresenceArc that doesn't exist in the list passed in.
 */

import type { PresenceArc } from "./types.ts";

export type FullPresenceAvailability =
  | { kind: "not_requested" }
  | { kind: "not_linked" }
  | { kind: "linked_not_found"; linkedPresenceArcId: string }
  | { kind: "available"; presenceArc: PresenceArc };

/**
 * The one resolver both the BUILD screen and a later LIVE screen use.
 * Takes the two relevant fields directly (rather than a whole
 * CombinedInterferenceSelection) so a screen mid-edit -- holding draft
 * `presenceEnabled`/`linkedPresenceArcId` state that may not yet match
 * any saved record -- can call this without first assembling a fake
 * record; a caller that does have a real saved selection simply passes
 * `selection.presenceEnabled, selection.linkedPresenceArcId`.
 */
export function resolveFullPresenceAvailability(presenceEnabled: boolean, linkedPresenceArcId: string | null, presenceArcs: PresenceArc[]): FullPresenceAvailability {
  if (!presenceEnabled) return { kind: "not_requested" };
  if (!linkedPresenceArcId) return { kind: "not_linked" };
  const presenceArc = presenceArcs.find((candidate) => candidate.id === linkedPresenceArcId) ?? null;
  if (!presenceArc) return { kind: "linked_not_found", linkedPresenceArcId };
  return { kind: "available", presenceArc };
}
