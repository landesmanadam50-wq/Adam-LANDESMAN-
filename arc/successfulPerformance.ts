/**
 * arc/successfulPerformance.ts
 *
 * ARC Goal task: pure helpers for the optional Successful Performance
 * section (spec section 4), which extends the existing Identity Build
 * and the existing Action Imagery page (spec section 5) rather than
 * introducing a new stage or screen. Identity-only -- see
 * ArcBuildProfile.identitySuccessfulPerformance-prefixed fields' own
 * doc (arc/types.ts) for why this lives on the general-purpose Identity
 * Build rather than on ArcGoal itself: any identity-layer session that
 * configures it gets the extended sequence "for free", both a regular
 * ARC identity session and ARC Goal's own referenced identity protocol,
 * through the exact same unmodified live/screens.tsx's
 * ActionImageryScreen -- never a goal-specific code path, and
 * arc/stageCopy.ts's own "act" case (the ORIGINAL, single-step Action
 * Imagery copy) is completely untouched by this file.
 *
 * Reuses the exact same primitives arc/stageCopy.ts's own "act" case
 * already uses for the original Action Imagery step (resolveDwellSecondsFor,
 * withTrailingDwellSegment, INSTRUCTION_TIMING, getPresenceColorReminder)
 * -- this is a second, parallel composition of the same building blocks
 * for the two NEW steps, never a duplicate timing/dwell mechanism.
 */

import type { ArcBuildProfile, DevelopmentLayer } from "./types.ts";
import type { ArcStageCopy } from "./stageCopy.ts";
import type { InstructionSegment } from "./instructionTiming.ts";
import { INSTRUCTION_TIMING } from "./instructionTiming.ts";
import { resolveDwellSecondsFor, withTrailingDwellSegment } from "./dwellTimes.ts";
import { getPresenceColorReminder } from "./presenceColor.ts";

/** Suggested execution qualities (spec section 4) -- feminine adjective form, matching "אתה מבצע את הפעולה בצורה ___" grammatically. */
export const EXECUTION_QUALITY_PRESETS = ["מדויקת", "עקבית", "יציבה", "מקצועית", "בטוחה", "רגועה"];

/**
 * Whether ANY part of the Successful Performance section was configured
 * for this profile's identity target -- the single gate the extended
 * Action Imagery sequence uses to decide whether to show anything
 * beyond the existing, unchanged single-step Action Imagery. false for
 * every profile that never touched this section (every legacy profile
 * included) -- "do not force goal fields into regular ARC".
 */
export function hasSuccessfulPerformanceConfigured(profile: ArcBuildProfile): boolean {
  return (
    Boolean(profile.identitySuccessfulPerformanceAction?.trim()) ||
    (profile.identitySuccessfulPerformanceQualities?.length ?? 0) > 0 ||
    Boolean(profile.identitySuccessfulPerformanceCustomQuality?.trim()) ||
    Boolean(profile.identitySuccessfulPerformanceResult?.trim()) ||
    Boolean(profile.identitySuccessMantra?.trim())
  );
}

/** The section's own optional override for which action is imagined -- null when never configured, so callers fall back to whatever action the session already resolved (currentAction), never inventing one. */
export function resolveSuccessfulPerformanceActionOverride(profile: ArcBuildProfile): string | null {
  return profile.identitySuccessfulPerformanceAction?.trim() || null;
}

/** Every configured execution quality, presets first, the trainee's own custom quality appended last -- never duplicated. */
export function resolveExecutionQualities(profile: ArcBuildProfile): string[] {
  const presets = profile.identitySuccessfulPerformanceQualities ?? [];
  const custom = profile.identitySuccessfulPerformanceCustomQuality?.trim();
  const qualities = [...presets];
  if (custom && !qualities.includes(custom)) qualities.push(custom);
  return qualities;
}

/**
 * Joins qualities into the fixed Hebrew clause from spec section 5's
 * own worked example ("אתה מבצע את הפעולה בצורה מדויקת, עקבית
 * ומקצועית.") -- Hebrew list joining: every item but the last separated
 * by ", ", the last joined with " ו-". null when no qualities were
 * configured at all -- the clause is then omitted entirely, never
 * rendered empty.
 */
export function formatExecutionQualitiesClause(qualities: string[]): string | null {
  if (qualities.length === 0) return null;
  if (qualities.length === 1) return `אתה מבצע את הפעולה בצורה ${qualities[0]}.`;
  const allButLast = qualities.slice(0, -1).join(", ");
  const last = qualities[qualities.length - 1];
  return `אתה מבצע את הפעולה בצורה ${allButLast} ו${last}.`;
}

/** Whether the Result Imagery step has anything to show -- nothing to imagine without a configured desired result, so the whole step is skipped when this is false. */
export function hasResultImageryConfigured(profile: ArcBuildProfile): boolean {
  return Boolean(profile.identitySuccessfulPerformanceResult?.trim());
}

/**
 * The Success Mantra text, or null when never configured -- "Do not
 * display a mantra that the user did not configure." Distinct from
 * EncodingProfile.mantra (Identity Mantra) and
 * stateFutureOrientedMantra/identityFutureOrientedMantra
 * (Future-Oriented Mantra) -- see ArcBuildProfile.identitySuccessMantra's
 * own doc for the full three-mantra-type distinction.
 */
export function resolveSuccessMantra(profile: ArcBuildProfile): string | null {
  return profile.identitySuccessMantra?.trim() || null;
}

/**
 * Process + Action Imagery's own instruction segment (spec section
 * 5.A): names the imagined action (this section's own override, else
 * whatever action the session already resolved -- never invented),
 * carries the action's own Action Body Cue when configured (same
 * "maintained while performing" role as the original Action Imagery
 * step), and appends the execution-quality clause when any were
 * configured. Sanctioned "דמיין" usage #4 in
 * arc/instructions.ts's containsInductionPattern denylist -- the
 * imagined content is always the trainee's own configured action, never
 * the interfering state.
 */
export function buildProcessActionImagerySegments(
  profile: ArcBuildProfile,
  currentAction: string | null,
  actionBodyCue: string | null
): InstructionSegment[] {
  const action = resolveSuccessfulPerformanceActionOverride(profile) ?? currentAction;
  const actionLine = action ? `הפעולה: ${action}. ` : "";
  const instruction = "דמיין את עצמך מבצע את הפעולה. שים לב לא רק למה שאתה עושה, אלא גם לדרך שבה אתה עושה אותה.";
  const bodyCueSentence = actionBodyCue ? ` תוך שמירה על ${actionBodyCue}.` : "";
  const clause = formatExecutionQualitiesClause(resolveExecutionQualities(profile));
  const clauseSentence = clause ? ` ${clause}` : "";
  const reminder = getPresenceColorReminder(profile.presenceColor, "actionImagery");
  const reminderSentence = reminder ? ` ${reminder}` : "";
  return [{ text: `${actionLine}${instruction}${bodyCueSentence}${clauseSentence}${reminderSentence}`, durationSeconds: INSTRUCTION_TIMING.actionImagery }];
}

/**
 * Result Imagery's own instruction segment (spec section 5.B): the
 * fixed instruction, naming the configured desired result. Sanctioned
 * "דמיין" usage #5 -- the imagined content is always the trainee's own
 * configured desired result, never anything interfering. Only ever
 * rendered when hasResultImageryConfigured is true.
 */
export function buildResultImagerySegments(profile: ArcBuildProfile): InstructionSegment[] {
  const result = profile.identitySuccessfulPerformanceResult?.trim() ?? "";
  const instruction = "עכשיו דמיין שהפעולה מצליחה ואתה משיג את התוצאה הרצויה. איך המצב נראה? מה אתה רואה, שומע ומרגיש?";
  const resultLine = result ? ` התוצאה הרצויה: ${result}.` : "";
  const reminder = getPresenceColorReminder(profile.presenceColor, "actionImagery");
  const reminderSentence = reminder ? ` ${reminder}` : "";
  return [{ text: `${instruction}${resultLine}${reminderSentence}`, durationSeconds: INSTRUCTION_TIMING.resultImagery }];
}

/** Process + Action Imagery's own full ArcStageCopy -- its own configured dwell (actionImageryDwellSeconds, same field the original single-step Action Imagery already used), appended via the same withTrailingDwellSegment every other dwell-gated stage uses. */
export function getProcessActionImageryCopy(
  profile: ArcBuildProfile,
  layer: DevelopmentLayer,
  currentAction: string | null,
  actionBodyCue: string | null
): ArcStageCopy {
  const segments = buildProcessActionImagerySegments(profile, currentAction, actionBodyCue);
  const dwellSeconds = resolveDwellSecondsFor("actionImageryDwellSeconds", layer, profile);
  return {
    title: "דמיון הפעולה",
    body: segments.map((segment) => segment.text).join(" "),
    segments: withTrailingDwellSegment(segments, dwellSeconds),
  };
}

/** Result Imagery's own full ArcStageCopy -- its own separately configured dwell (resultImageryDwellSeconds). Only ever built when hasResultImageryConfigured is true. */
export function getResultImageryCopy(profile: ArcBuildProfile, layer: DevelopmentLayer): ArcStageCopy {
  const segments = buildResultImagerySegments(profile);
  const dwellSeconds = resolveDwellSecondsFor("resultImageryDwellSeconds", layer, profile);
  return {
    title: "דמיון התוצאה",
    body: segments.map((segment) => segment.text).join(" "),
    segments: withTrailingDwellSegment(segments, dwellSeconds),
  };
}

/** The optional Success Mantra's own plain (untimed, no dwell) display copy -- null when never configured, so the caller shows nothing at all rather than an empty screen. */
export function getSuccessMantraCopy(profile: ArcBuildProfile): ArcStageCopy | null {
  const mantra = resolveSuccessMantra(profile);
  if (!mantra) return null;
  return { title: "משפט הצלחה", body: `"${mantra}"`, segments: null };
}
