/**
 * program/validation.ts
 *
 * Structural validation for a ProgramDefinition. Returns a list of
 * human-readable issues (empty = valid) rather than throwing, so it
 * can be used both as a runtime guard and asserted directly in tests.
 *
 * Development Layers are cumulative in ARCHI today: once a layer is
 * active in a week, it stays active in every following week of that
 * program. validateProgramDefinition enforces that; a future
 * non-cumulative program type would need an explicit opt-out, not a
 * silent exception here.
 */

import type { DevelopmentLayer } from "../arc/types.ts";
import type { ProgramDefinition } from "./programTypes.ts";

function hasDuplicates<T>(items: T[]): boolean {
  return new Set(items).size !== items.length;
}

export function validateProgramDefinition(program: ProgramDefinition): string[] {
  const issues: string[] = [];
  const id = program.id;

  if (program.totalWeeks !== program.weeks.length) {
    issues.push(`${id}: totalWeeks (${program.totalWeeks}) does not match weeks.length (${program.weeks.length})`);
  }

  const weekNumbers = program.weeks.map((w) => w.week);
  if (hasDuplicates(weekNumbers)) {
    issues.push(`${id}: duplicate week numbers (${weekNumbers.join(", ")})`);
  }
  const sortedWeekNumbers = [...weekNumbers].sort((a, b) => a - b);
  const expectedWeekNumbers = Array.from({ length: program.totalWeeks }, (_, i) => i + 1);
  if (JSON.stringify(sortedWeekNumbers) !== JSON.stringify(expectedWeekNumbers)) {
    issues.push(`${id}: week numbers are not exactly 1..${program.totalWeeks} (got ${sortedWeekNumbers.join(", ")})`);
  }

  let previousActiveLayers: DevelopmentLayer[] = [];
  for (const week of [...program.weeks].sort((a, b) => a.week - b.week)) {
    if (hasDuplicates(week.activeLayers)) {
      issues.push(`${id} week ${week.week}: duplicate entries in activeLayers`);
    }
    if (hasDuplicates(week.layersToBuild)) {
      issues.push(`${id} week ${week.week}: duplicate entries in layersToBuild`);
    }
    for (const layer of week.layersToBuild) {
      if (!week.activeLayers.includes(layer)) {
        issues.push(`${id} week ${week.week}: layersToBuild has "${layer}" but activeLayers does not`);
      }
    }
    if (
      week.negativeActionDurationScale !== undefined &&
      (week.negativeActionDurationScale <= 0 || week.negativeActionDurationScale > 1)
    ) {
      issues.push(`${id} week ${week.week}: negativeActionDurationScale (${week.negativeActionDurationScale}) must be > 0 and <= 1`);
    }
    for (const layer of previousActiveLayers) {
      if (!week.activeLayers.includes(layer)) {
        issues.push(
          `${id} week ${week.week}: lost previously-active layer "${layer}" -- layers are cumulative and should never disappear`
        );
      }
    }
    previousActiveLayers = week.activeLayers;
  }

  return issues;
}

export function validateAllProgramDefinitions(definitions: Record<string, ProgramDefinition>): string[] {
  return Object.values(definitions).flatMap(validateProgramDefinition);
}
