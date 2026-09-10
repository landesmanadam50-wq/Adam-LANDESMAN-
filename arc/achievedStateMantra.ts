/**
 * arc/achievedStateMantra.ts
 *
 * Life Manifest visualization task: the Achieved-State Mantra --
 * "the desired goal is experienced in imagery as an already achieved
 * reality" (spec section 4). Structurally distinct from every other
 * mantra in this app: Identity Mantra (EncodingProfile.mantra), Success
 * Mantra (arc/successfulPerformance.ts's identitySuccessMantra),
 * Future-Oriented Mantra (state/identityFutureOrientedMantra), and the
 * four in arc/mantras.ts (Stay/Acceptance/Regulation/Bridge) -- never
 * merged into or confused with any of them; this one lives entirely
 * inside arc/lifeManifest.ts's AchievedStateMantra type, never on
 * ArcBuildProfile.
 *
 * Mirrors arc/mantras.ts's own shape exactly: a pure line-builder, a
 * fixed framing sentence, `null` (never invented/blank) when unset or
 * disabled. Tense-aware -- present tense frames it as an existing
 * identity ("I am..."), past tense as an achieved milestone
 * ("I achieved/became..."); the trainee's own typed text is quoted
 * as-is either way, never rewritten to match the chosen tense.
 */

import type { AchievedStateMantra } from "./lifeManifest.ts";

/** `null` when disabled or the text is blank -- "the user must be able to... disable it/skip it." */
export function getAchievedStateMantraLine(mantra: AchievedStateMantra): string | null {
  if (!mantra.enabled) return null;
  const text = typeof mantra.text === "string" ? mantra.text.trim() : "";
  if (!text) return null;
  const frame = mantra.tense === "past" ? "מה שהשגת" : "מי שאתה כבר";
  return `${frame}: "${text}".`;
}
