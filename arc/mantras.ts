/**
 * arc/mantras.ts
 *
 * Unified Presence/Mantra/Trigger/Imagery spec, section 5: four new,
 * separate, optional mantras -- Stay Mantra, Acceptance Mantra,
 * Regulation Mantra, and the brand-new Bridge Mantra (there was no
 * pre-existing "Bridge Mantra" field anywhere in this codebase; this is
 * built from scratch and lives at the end of Regulation from the start,
 * never Encoding). Each mirrors arc/futureOrientedMantra.ts's own
 * shape exactly: a pure line-builder, a fixed framing sentence, `null`
 * (never an invented/blank line) when unset.
 *
 * Unlike stateFutureOrientedMantra/identityFutureOrientedMantra, these
 * four are deliberately SINGLE, SHARED ArcBuildProfile fields, not
 * split per layer (state/identity) -- Stay/Acceptance/Regulation are
 * not per-layer stages today (regulationTool itself is a single shared
 * field; only Encoding and the Future-Oriented Mantras are per-layer),
 * so splitting these four would introduce an asymmetry the rest of
 * those stages don't have.
 *
 * Kept conceptually separate per their own distinct purposes (never
 * merged into one generic "mantra" concept):
 *   - Stay Mantra: supports gently remaining with what is already present.
 *   - Acceptance Mantra: allows the present experience to exist without
 *     immediate resistance.
 *   - Regulation Mantra: accompanies the body's natural stabilization.
 *   - Bridge Mantra: marks the transition from Regulation toward the
 *     desired state, identity, and action -- shown immediately after
 *     the Regulation Mantra, still inside "regulate"'s own copy, never
 *     "encode"'s.
 */

interface MantraProfile {
  stayMantra?: string | null;
  acceptanceMantra?: string | null;
  regulationMantra?: string | null;
  bridgeMantra?: string | null;
}

function safeMantraText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getStayMantraLine(profile: MantraProfile): string | null {
  const text = safeMantraText(profile.stayMantra);
  if (!text) return null;
  return `אפשר להישאר עם זה לרגע: "${text}".`;
}

export function getAcceptanceMantraLine(profile: MantraProfile): string | null {
  const text = safeMantraText(profile.acceptanceMantra);
  if (!text) return null;
  return `מותר לזה להיות כאן כרגע: "${text}".`;
}

export function getRegulationMantraLine(profile: MantraProfile): string | null {
  const text = safeMantraText(profile.regulationMantra);
  if (!text) return null;
  return `תן לגוף להתייצב בקצב שלו: "${text}".`;
}

export function getBridgeMantraLine(profile: MantraProfile): string | null {
  const text = safeMantraText(profile.bridgeMantra);
  if (!text) return null;
  return `הגשר לקראת מה שרוצים לחזק: "${text}".`;
}
