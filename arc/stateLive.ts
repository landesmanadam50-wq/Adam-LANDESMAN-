/**
 * arc/stateLive.ts
 *
 * Phase 7 (ARC State composition), spec section 16 ("ARC Mini State...
 * Prevent ARC Mini State from becoming a full ARC State with shorter
 * text... allow a primary component to be configured for the Mini
 * route"): the ONE, minimal addition ARC Mini State needs on top of
 * the existing, unmodified generic Mini ARC engine (arc/miniArc.ts's
 * own MINI_ARC_STAGE_ORDER: pause -> name_state -> regulation ->
 * encoding -> imagery -> action -> complete) -- never a second Mini
 * engine, never combining several components' worth of content the
 * way Full ARC State's own multi-component Encoding sequence does.
 *
 * When a MiniArcBuild's protocolKind is "state" and
 * miniStatePrimaryComponent names one non-"emotion" component, this
 * module resolves that component's OWN short encoding line (reusing
 * the linked UrgeArc/ThoughtArc/BeliefArc's already-resolved content,
 * never inventing anything) for the generic engine's existing
 * "encoding" stage to show INSTEAD of build.encodingAction -- a purely
 * additive substitution live/MiniArcLiveScreen.tsx opts into only for
 * this specific case. Every other Mini ARC (protocolKind "state" with
 * no primary component configured, or any other kind entirely) is
 * completely unaffected: resolveMiniStateEncodingBody falls back to
 * build.encodingAction unchanged.
 */

import type { ArcStateComponentKind, BeliefArc, ThoughtArc, UrgeArc } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";
import { resolveMiniUrgeEncoding } from "./urgeLive.ts";

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface MiniStateEncodingContent {
  body: string;
  secondaryBody: string | null;
}

/**
 * The short encoding line ARC Mini State's own "encoding" stage shows
 * when a primary component other than "emotion" (or none) is
 * configured. Reuses each linked record's own already-established
 * priority order (never re-derives it independently):
 * resolveMiniUrgeEncoding's own representation-based line for "urge"
 * (including its "both" quick-switch secondary action, gated on the
 * linked UrgeArc's OWN representationPreference -- the one genuine
 * behavioral difference from the generic Mini engine's plain encoding
 * line, which never reads a secondary action at all), the linked
 * ThoughtArc's supportiveThought for "thought", the linked BeliefArc's
 * replacementBelief for "belief". Falls back to build.encodingAction
 * (with no secondary) whenever the primary component is null/
 * "emotion", or when the linked record is missing/has nothing
 * resolved -- never invents content, never crashes.
 */
export function resolveMiniStateEncodingContent(
  build: MiniArcBuild,
  linkedUrgeArc: UrgeArc | null,
  linkedThoughtArc: ThoughtArc | null,
  linkedBeliefArc: BeliefArc | null
): MiniStateEncodingContent {
  const primary: ArcStateComponentKind | null = build.miniStatePrimaryComponent ?? null;
  const fallback = safeText(build.encodingAction);

  if (primary === "urge") {
    const preference = linkedUrgeArc?.representationPreference;
    const representation = preference && preference !== "decide_in_live" ? preference : "unsure";
    const { body, secondaryAction } = resolveMiniUrgeEncoding(build, representation);
    return { body: safeText(body) || fallback, secondaryBody: secondaryAction };
  }
  if (primary === "thought") {
    const supportive = safeText(linkedThoughtArc?.supportiveThought) || safeText(linkedThoughtArc?.usefulInsight);
    return { body: supportive || fallback, secondaryBody: null };
  }
  if (primary === "belief") {
    const replacement = safeText(linkedBeliefArc?.replacementBelief);
    return { body: replacement || fallback, secondaryBody: null };
  }
  return { body: fallback, secondaryBody: null };
}

/**
 * The short "what's present" recognition line ARC Mini State's own
 * "name_state" stage can optionally show alongside its existing free-
 * text prompt, reflecting which primary component this Mini is about
 * -- purely informational, never gating progression, never replacing
 * the existing free-text entry.
 */
export function resolveMiniStateRecognitionHint(primary: ArcStateComponentKind | null): string | null {
  switch (primary) {
    case "urge":
      return "לדוגמה: דחף";
    case "thought":
      return "לדוגמה: מחשבה חוזרת";
    case "belief":
      return "לדוגמה: אמונה מגבילה";
    case "emotion":
    case null:
      return null;
  }
}
