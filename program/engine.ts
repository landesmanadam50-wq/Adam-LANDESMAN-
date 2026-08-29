import { PROGRAM_DEFINITIONS } from "./config.ts";
import type { ProgramDefinition, ProgramWeekDefinition } from "./programTypes.ts";
import type { DevelopmentLayer } from "../arc/types.ts";

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
 * Pure and deterministic: called once when a Negative Action Timer run
 * actually starts (see live/screens.tsx), whose OWN persisted duration
 * then stays fixed for that run regardless of any later week change --
 * this function is never re-invoked to "correct" an already-running or
 * already-completed timer.
 */
export function resolveNegativeActionDuration(
  currentProgramWeek: number,
  program: ProgramDefinition,
  baseDurationMinutes: number | null
): number | null {
  if (baseDurationMinutes === null) return null;
  const weekDefinition = getCurrentWeekDefinition(program, currentProgramWeek);
  const scale = weekDefinition?.negativeActionDurationScale ?? 1;
  return Math.round(baseDurationMinutes * scale);
}
