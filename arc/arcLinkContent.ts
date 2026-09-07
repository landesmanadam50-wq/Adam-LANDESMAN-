/**
 * arc/arcLinkContent.ts
 *
 * Updated-ARC-structure task: shared, pure resolvers used by BOTH
 * arc/arcLink.ts (the linkId/"Extended ARC Link" rehearsal path) and
 * arc/bridgingArcLink.ts, so ARC Link's own content is read from the
 * SAME fields the main ARC BUILD model already uses for Value/
 * Identity/Supportive-State/Future-Mantra -- never a second, parallel
 * set of ARC-Link-only fields with slightly different names.
 *
 *   Value                      -> profile.value (build-global)
 *   Desired identity           -> profile.desiredIdentity (identity layer)
 *   Desired supportive state   -> profile.identityDesiredState (identity
 *                                 layer only -- "how do I need to feel to
 *                                 express this identity now?", distinct
 *                                 from the identity itself). The state
 *                                 layer has no parallel field of its own:
 *                                 profile.supportiveState (its own
 *                                 Desired State) already plays this role
 *                                 for that layer -- see ArcBuildProfile's
 *                                 own doc on identityDesiredState.
 *   Future Mantra               -> profile.stateFutureOrientedMantra /
 *                                  identityFutureOrientedMantra
 *   Identity Mantra (older field, still a valid resolution fallback)
 *                                -> stateEncoding.mantra / identityEncoding.mantra
 *   Identity/state body-language cue -> stateEncoding.bodyLanguageCue /
 *                                       identityEncoding.bodyLanguageCue
 *   Beneficial action            -> internalAction/identityAction,
 *                                   falling back to beneficialAction
 *
 * Every resolver here is safe/total -- never throws, always returns ""
 * for a legacy or minimally-filled profile, and never invents content.
 */

import { getBodyImageryForText } from "./bodyImagery.ts";
import type { BodyImagery } from "./bodyImagery.ts";
import type { ArcBuildProfile } from "./types.ts";

export type ArcLinkContentTarget = "state" | "identity" | "habit";

function safe(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Build-global -- "why" the identity/action matter. Never merged with identity/state/mantra/action ("The value must remain separate"). */
export function resolveValueLabel(profile: ArcBuildProfile): string {
  return safe(profile.value);
}

/** The identity/state NAME itself -- "Who am I practicing becoming?" (identity), or the state layer's own Desired State (state, which has no separate identity concept). Never the internal condition that supports it -- see resolveSupportiveStateLabel. "habit" has neither, so it returns "". */
export function resolveIdentityLabel(profile: ArcBuildProfile, target: ArcLinkContentTarget): string {
  if (target === "identity") return safe(profile.desiredIdentity);
  if (target === "state") return safe(profile.supportiveState);
  return "";
}

/**
 * "How do I need to feel or position myself internally so that I can
 * express this identity now?" -- identity-layer only
 * (profile.identityDesiredState). The state layer's own supportiveState
 * already plays this role for that layer (resolveIdentityLabel returns
 * it there), so this returns "" for "state"/"habit" rather than
 * duplicating the same text under a second label.
 */
export function resolveSupportiveStateLabel(profile: ArcBuildProfile, target: ArcLinkContentTarget): string {
  if (target === "identity") return safe(profile.identityDesiredState);
  return "";
}

export function resolveActionLabel(profile: ArcBuildProfile, target: ArcLinkContentTarget): string {
  if (target === "state") return safe(profile.internalAction) || safe(profile.beneficialAction);
  if (target === "identity") return safe(profile.identityAction) || safe(profile.beneficialAction);
  return safe(profile.beneficialAction);
}

export function resolveEncodingBodyLanguage(profile: ArcBuildProfile, target: ArcLinkContentTarget): { cue: string; bodyImagery: BodyImagery | null } {
  const encoding = target === "state" ? profile.stateEncoding : target === "identity" ? profile.identityEncoding : null;
  return { cue: safe(encoding?.bodyLanguageCue), bodyImagery: encoding?.bodyImagery ?? null };
}

export function resolveEncodingImagery(profile: ArcBuildProfile, target: ArcLinkContentTarget): BodyImagery {
  const { cue, bodyImagery } = resolveEncodingBodyLanguage(profile, target);
  return getBodyImageryForText(cue, bodyImagery);
}

/**
 * Future Mantra resolution order (Updated-ARC-structure task):
 * ArcLink-level override -> the referenced ARC's own Future Mantra ->
 * the older Identity/State Mantra (EncodingProfile.mantra) -> "".
 * Never silently prefers the older mantra when a Future Mantra exists,
 * and never silently drops an explicit link-level override. "habit" has
 * no future-oriented-mantra field of its own, so it falls straight from
 * override to "" (no habit-layer EncodingProfile.mantra to fall back to
 * either -- habit has no identityEncoding/stateEncoding equivalent).
 */
export function resolveFutureMantra(profile: ArcBuildProfile, target: ArcLinkContentTarget, overrideText?: string | null): string {
  const override = safe(overrideText);
  if (override) return override;
  const futureMantra = target === "state" ? profile.stateFutureOrientedMantra : target === "identity" ? profile.identityFutureOrientedMantra : null;
  const safeFuture = safe(futureMantra);
  if (safeFuture) return safeFuture;
  const encoding = target === "state" ? profile.stateEncoding : target === "identity" ? profile.identityEncoding : null;
  return safe(encoding?.mantra);
}
