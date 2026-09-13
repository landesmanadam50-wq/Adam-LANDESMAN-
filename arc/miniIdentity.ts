/**
 * arc/miniIdentity.ts
 *
 * ARC Goal four-week correction: "Mini Identity" -- the short, learned
 * identity sequence used inside Weeks 2-3 of the ARC Goal four-week
 * program, distinct from the full shared Identity Extension
 * (arc/identityExtension.ts, still used verbatim for Week 1 and
 * available on demand). Mini Identity does NOT replace the full engine
 * and never re-enters it -- it is a short prefix (identity recall ->
 * Identity Mantra -> one Encoding cue -> body-language cue -> Future
 * Mantra if configured -> imagine beginning the action) that then hands
 * off directly into the SAME "act" stage machinery Identity Extension
 * itself already uses (arc/arcEngine.ts's resolveActPhase/
 * applyPlannedActionConfirmed/applyAlternativeAction, reused verbatim by
 * the driving screen -- see live/ArcGoalMiniIdentityScreen.tsx).
 *
 * Every line here is resolved LIVE from the goal's own linked identity
 * build (goal.identityProtocolId's profile.identityEncoding/
 * identityFutureOrientedMantra/desiredIdentity), reusing the SAME pure
 * resolvers arc/arcLinkContent.ts already exposes for exactly this
 * purpose (resolveIdentityLabel/resolveActionLabel) -- never a second,
 * duplicated identity-resolution implementation. ArcGoal.miniIdentityConfig
 * (arc/types.ts) supplies OPTIONAL per-goal overrides for the encoding
 * cue / body-language cue / mantra / imagery duration; every override is
 * independent and never silently overwritten by editing the full
 * identity build afterward -- an unset override always just falls back
 * LIVE to that build's own current fields, so editing the full identity
 * naturally updates Mini Identity's own display too (never stale,
 * never duplicated storage).
 *
 * Nothing here is ever invented: a genuinely blank field is simply
 * omitted from the sequence (see resolveMiniIdentitySteps) rather than
 * shown as an empty screen or fabricated text.
 */

import { resolveActionLabel, resolveIdentityLabel } from "./arcLinkContent.ts";
import { resolveActiveSubGoal } from "./subGoalExecution.ts";
import type { ArcBuild, ArcBuildProfile, ArcGoal, ArcGoalMiniIdentityConfig } from "./types.ts";

export const MINI_IDENTITY_TITLE = "זהות קצרה לפעולה";

/** A short, safe default when no per-goal override is configured -- never a long dwell; this is deliberately brief (spec: "short body-language/identity cue"). */
const DEFAULT_MINI_IDENTITY_IMAGERY_SECONDS = 15;

function safe(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface MiniIdentityContent {
  /** "מי אתה בוחר להיות עכשיו?" -- the identity itself (profile.desiredIdentity). */
  identityLabel: string;
  identityMantra: string;
  /** The "one primary identity Encoding cue" (spec section 13) -- distinct from bodyLanguageCue below. */
  encodingCue: string;
  bodyLanguageCue: string;
  /** null means genuinely unconfigured (never shown as its own step) -- see resolveGenuineFutureMantra's own doc, distinct from arc/arcLinkContent.ts's resolveFutureMantra (which always falls back to the Identity Mantra for the FULL engine's own, always-shown Future Mantra line). */
  futureMantra: string | null;
  /** The goal's own action (goal.goalAction), falling back to the identity build's own identityAction/beneficialAction -- never invented. */
  actionLabel: string;
  actionImageryDurationSeconds: number;
}

/**
 * Future Mantra resolution for Mini Identity specifically: unlike
 * arc/arcLinkContent.ts's resolveFutureMantra (which always falls back
 * to the older Identity Mantra so the FULL Identity Extension's own
 * always-shown Future Mantra line is never blank), Mini Identity must
 * know whether a Future Mantra was genuinely configured, so it can skip
 * the step entirely rather than re-show the Identity Mantra a second
 * time under a different heading (spec section 6: "Show the Future
 * Mantra only if configured").
 */
function resolveGenuineFutureMantra(profile: ArcBuildProfile | null, overrideText: string | null): string | null {
  const override = safe(overrideText);
  if (override) return override;
  const raw = safe(profile?.identityFutureOrientedMantra);
  return raw.length > 0 ? raw : null;
}

function resolveIdentityMantra(profile: ArcBuildProfile | null, override: string | null): string {
  const trimmedOverride = safe(override);
  if (trimmedOverride) return trimmedOverride;
  return safe(profile?.identityEncoding?.mantra);
}

/** Falls back through bodySensationCue -> breathCue -- see MiniIdentityContent's own doc on why this differs from bodyLanguageCue. */
function resolveEncodingCue(profile: ArcBuildProfile | null, override: string | null): string {
  const trimmedOverride = safe(override);
  if (trimmedOverride) return trimmedOverride;
  const encoding = profile?.identityEncoding ?? null;
  const bodySensation = safe(encoding?.bodySensationCue);
  if (bodySensation) return bodySensation;
  return safe(encoding?.breathCue);
}

function resolveBodyLanguageCue(profile: ArcBuildProfile | null, override: string | null): string {
  const trimmedOverride = safe(override);
  if (trimmedOverride) return trimmedOverride;
  return safe(profile?.identityEncoding?.bodyLanguageCue);
}

/**
 * Resolves Mini Identity's own content for this goal + its linked
 * identity build. Returns null when CRITICAL data is missing (no
 * resolvable identity build, or no goal action to perform) -- callers
 * must show the safe setup route back to ARC Goal BUILD in that case,
 * never invent a build/action and never mark the weekly task complete
 * (spec section 14). A missing mantra/cue/body-language-cue/Future
 * Mantra individually is NOT critical -- resolveMiniIdentitySteps below
 * simply omits that one step.
 */
export function resolveMiniIdentityContent(goal: ArcGoal, identityBuild: ArcBuild | null): MiniIdentityContent | null {
  const profile = identityBuild?.profile ?? null;
  const actionLabel = safe(goal.goalAction) || (profile ? resolveActionLabel(profile, "identity") : "");
  if (!identityBuild || !profile || actionLabel.length === 0) return null;

  const config: ArcGoalMiniIdentityConfig | null = goal.miniIdentityConfig ?? null;
  return {
    identityLabel: resolveIdentityLabel(profile, "identity"),
    identityMantra: resolveIdentityMantra(profile, config?.identityMantraOverride ?? null),
    encodingCue: resolveEncodingCue(profile, config?.encodingCueOverride ?? null),
    bodyLanguageCue: resolveBodyLanguageCue(profile, config?.bodyLanguageCueOverride ?? null),
    futureMantra: resolveGenuineFutureMantra(profile, config?.futureMantraOverride ?? null),
    actionLabel,
    actionImageryDurationSeconds: config?.actionImageryDurationSeconds ?? DEFAULT_MINI_IDENTITY_IMAGERY_SECONDS,
  };
}

export interface MiniIdentityGoalContext {
  arcGoalId: string;
  activeSubGoalId: string | null;
}

/** Mirrors arc/identityExtension.ts's own resolveIdentityExtensionEntry activeSubGoalId derivation -- context only, never a second identity source (spec section 14: "Never load an unrelated identity"). */
export function resolveMiniIdentityGoalContext(goal: ArcGoal): MiniIdentityGoalContext {
  return { arcGoalId: goal.id, activeSubGoalId: resolveActiveSubGoal(goal)?.id ?? null };
}

// ---------------------------------------------------------------------------
// Stage sequencing -- fixed, linear order (spec section 6), never
// branching, mirroring arc/miniArc.ts's own "no branching, no
// engine-level state machine" shape. A step whose own content is blank
// is simply omitted (see module doc) -- never rendered empty, never
// invented.
// ---------------------------------------------------------------------------

export type MiniIdentityStage = "identity_recall" | "mantra" | "encoding_cue" | "body_language" | "future_mantra" | "begin_imagery";

/** The actual step order for THIS content -- omits any step whose own line is blank. Always includes "identity_recall" and "begin_imagery" (the two structural anchors: who you are, and beginning the action). */
export function resolveMiniIdentitySteps(content: MiniIdentityContent): MiniIdentityStage[] {
  const steps: MiniIdentityStage[] = ["identity_recall"];
  if (content.identityMantra.length > 0) steps.push("mantra");
  if (content.encodingCue.length > 0) steps.push("encoding_cue");
  if (content.bodyLanguageCue.length > 0) steps.push("body_language");
  if (content.futureMantra !== null && content.futureMantra.length > 0) steps.push("future_mantra");
  steps.push("begin_imagery");
  return steps;
}

export function getFirstMiniIdentityStage(): MiniIdentityStage {
  return "identity_recall";
}

/**
 * Walks `steps` (this content's own resolved sequence) forward one hop.
 * Returns null once "begin_imagery" (the last step) has been passed --
 * the driving screen then hands off directly into the shared "act"
 * stage machinery (see module doc), never a second terminal stage here.
 */
export function getNextMiniIdentityStage(current: MiniIdentityStage, steps: MiniIdentityStage[]): MiniIdentityStage | null {
  const index = steps.indexOf(current);
  if (index === -1 || index === steps.length - 1) return null;
  return steps[index + 1];
}

export interface MiniIdentityStageCopy {
  title: string;
  body: string;
  buttonLabel: string;
}

/** Never throws, never renders "undefined"/"null" -- every field is already a safe, trimmed string by the time it reaches here (resolveMiniIdentityContent). */
export function getMiniIdentityStageCopy(stage: MiniIdentityStage, content: MiniIdentityContent): MiniIdentityStageCopy {
  switch (stage) {
    case "identity_recall":
      return { title: "מי אתה בוחר להיות עכשיו?", body: content.identityLabel, buttonLabel: "המשך" };
    case "mantra":
      return { title: "מנטרת הזהות", body: content.identityMantra, buttonLabel: "המשך" };
    case "encoding_cue":
      return { title: "עוגן הקידוד", body: content.encodingCue, buttonLabel: "המשך" };
    case "body_language":
      return { title: "שפת גוף", body: content.bodyLanguageCue, buttonLabel: "המשך" };
    case "future_mantra":
      return { title: "מנטרת עתיד", body: content.futureMantra ?? "", buttonLabel: "המשך" };
    case "begin_imagery":
      return {
        title: "דמיין את תחילת הפעולה",
        body: `דמיין את עצמך מתחיל את "${content.actionLabel}", מתוך הזהות שבחרת.`,
        buttonLabel: "המשך לפעולה",
      };
  }
}

export const MINI_IDENTITY_NO_DATA_TITLE = "לא נמצאו נתוני זהות מספיקים";
export const MINI_IDENTITY_NO_DATA_BODY = "כדי להשתמש בזהות הקצרה, יש להגדיר תחילה זהות ופעולת מטרה בבניית ARC Goal.";
