import { PROGRAM_DEFINITIONS } from "./config.ts";
import type { ProgramDefinition, ProgramWeekDefinition } from "./programTypes.ts";
import type { ArcBuildProfile, DevelopmentLayer } from "../arc/types.ts";

export function getProgramDefinition(programPath: string): ProgramDefinition {
  const definition = PROGRAM_DEFINITIONS[programPath];
  if (!definition) {
    throw new Error(`Unknown program path: "${programPath}"`);
  }
  return definition;
}

export function getCurrentWeekDefinition(
  program: ProgramDefinition,
  currentWeek: number
): ProgramWeekDefinition | null {
  return program.weeks.find((item) => item.week === currentWeek) ?? null;
}

export function getActiveLayers(
  program: ProgramDefinition,
  currentWeek: number
): DevelopmentLayer[] {
  return getCurrentWeekDefinition(program, currentWeek)?.activeLayers ?? [];
}

export function getLayersToBuild(
  program: ProgramDefinition,
  currentWeek: number
): DevelopmentLayer[] {
  return getCurrentWeekDefinition(program, currentWeek)?.layersToBuild ?? [];
}

export function getNextWeekDefinition(
  program: ProgramDefinition,
  currentWeek: number
): ProgramWeekDefinition | null {
  return getCurrentWeekDefinition(program, currentWeek + 1);
}

export function hasNextProgramWeek(program: ProgramDefinition, currentWeek: number): boolean {
  return getNextWeekDefinition(program, currentWeek) !== null;
}

export function isLayerActive(
  activeLayers: DevelopmentLayer[],
  layer: DevelopmentLayer
): boolean {
  return activeLayers.includes(layer);
}

/**
 * The one place the Negative Action Timer's duration is computed: the
 * trainee's own BUILD-configured base allowance
 * (ArcBuildProfile.negativeActionBaseDurationMinutes), scaled by the
 * CURRENT program week's negativeActionDurationScale (0-1) -- never a
 * duration invented here, and never one the trainee selects manually
 * each session. A week with no scale configured (undefined) is treated
 * as 1 (the full base amount, unscaled) -- so extending only
 * standard_3_week with real values, as done here, leaves every other
 * program path's behavior exactly as if this feature didn't exist.
 *
 * baseDurationMinutes accepts `undefined` in addition to its declared
 * `number | null`, because this is a direct read of a persisted
 * ArcBuildProfile field -- data/storage.ts's loadProfile is a bare
 * JSON.parse with no migration step (see that file's own doc), so a
 * profile saved before this field existed has it genuinely absent
 * (`undefined`) once parsed, not `null`. Treating only `null` as "not
 * configured" let `undefined` fall through to `Math.round(undefined *
 * scale)` = NaN -- which then propagated into the Negative Action
 * Timer as a NaN duration (never completing: any comparison with NaN
 * is false) and into its "NaN:NaN" remaining-time display. Both
 * `null` and `undefined` now resolve the same way: no Negative Action
 * Timer duration configured, exactly as if the trainee never visited
 * this BUILD step -- never a crash, never NaN.
 *
 * Pure and deterministic: called once when a Negative Action Timer run
 * actually starts (see live/screens.tsx), whose OWN persisted duration
 * then stays fixed for that run regardless of any later week change --
 * this function is never re-invoked to "correct" an already-running or
 * already-completed timer.
 */
export const NEGATIVE_ACTION_MIN_DURATION_MINUTES = 1;
export const NEGATIVE_ACTION_MAX_DURATION_MINUTES = 15;

export function resolveNegativeActionDuration(
  currentProgramWeek: number,
  program: ProgramDefinition,
  baseDurationMinutes: number | null | undefined
): number | null {
  if (baseDurationMinutes === null || baseDurationMinutes === undefined) return null;
  const weekDefinition = getCurrentWeekDefinition(program, currentProgramWeek);
  const scale = weekDefinition?.negativeActionDurationScale ?? 1;
  const resolved = Math.round(baseDurationMinutes * scale);
  // Negative Action reduction task: every resolved weekly duration must
  // stay within the valid 1-15 minute range BUILD now restricts entry
  // to -- clamped here (not just at BUILD entry time) so a legacy
  // profile whose base allowance was configured before this 1-15
  // restriction existed (e.g. 20 or 30 minutes) can never resolve to an
  // out-of-range weekly duration either, at any scale/week.
  return Math.min(Math.max(resolved, NEGATIVE_ACTION_MIN_DURATION_MINUTES), NEGATIVE_ACTION_MAX_DURATION_MINUTES);
}

/**
 * Negative Action reduction task: whether this OPTIONAL habit-reduction
 * tool is enabled for this program at all -- decoupled from any
 * DevelopmentLayer/activeLayers routing (see arc/types.ts's
 * ArcBuildProfile.negativeActionReductionEnabled doc). A profile stored
 * before this field existed has it genuinely absent (`undefined`, not
 * `false`) once JSON.parse'd -- data/storage.ts's loadProfile is a bare
 * parse with no migration step, the same class of legacy-absent-field
 * situation resolveNegativeActionDuration's own baseDurationMinutes
 * parameter already handles. Rather than silently treating that legacy
 * absence as "disabled" (which would take the tool away from a trainee
 * who had already configured and been using it), it falls back to the
 * OLD implicit signal: a base duration was already configured. A
 * genuinely fresh profile that never configured a duration either
 * falls back to false -- never enabled by default.
 */
export function isNegativeActionReductionEnabled(profile: ArcBuildProfile): boolean {
  const explicit = profile.negativeActionReductionEnabled;
  if (explicit === true || explicit === false) return explicit;
  return profile.negativeActionBaseDurationMinutes !== null && profile.negativeActionBaseDurationMinutes !== undefined;
}

/**
 * Whether the standalone Negative Action Timer (app/negative-action.tsx)
 * should be offered at all: the tool must be enabled AND a real,
 * non-empty negative action must actually be configured (habit) --
 * mirrors "Show the action... before starting", never a timer with
 * nothing to name. Deliberately does NOT require a configured duration:
 * a null/unresolved duration still resolves safely (NegativeActionScreen
 * treats it as immediately complete, exactly like every other timed
 * screen in this app), so the tool stays available and legacy-safe
 * either way.
 */
export function isNegativeActionAvailable(profile: ArcBuildProfile): boolean {
  return isNegativeActionReductionEnabled(profile) && profile.habit !== null && profile.habit.trim().length > 0;
}
