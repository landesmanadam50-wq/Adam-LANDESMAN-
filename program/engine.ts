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
