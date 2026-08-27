import { TRAINING_CONFIG } from "./config.ts";
import { getProgramDefinition, getCurrentWeekDefinition, getNextWeekDefinition, hasNextProgramWeek } from "./engine.ts";
import type { ArcProgramProgress } from "../arc/types.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY);
}

export function recordTrainingDay(
  progress: ArcProgramProgress,
  localDate: string
): ArcProgramProgress {
  if (progress.weekStartDate === null) {
    return { ...progress, weekStartDate: localDate, trainingDatesThisWeek: [localDate] };
  }

  const dayIndex = daysBetween(progress.weekStartDate, localDate);
  const withinWindow = dayIndex >= 0 && dayIndex < TRAINING_CONFIG.arcWeekWindowDays;

  if (withinWindow) {
    if (progress.trainingDatesThisWeek.includes(localDate)) {
      return progress;
    }
    return { ...progress, trainingDatesThisWeek: [...progress.trainingDatesThisWeek, localDate] };
  }

  return { ...progress, weekStartDate: localDate, trainingDatesThisWeek: [localDate] };
}

export function isArcWeekComplete(progress: ArcProgramProgress): boolean {
  return progress.trainingDatesThisWeek.length >= TRAINING_CONFIG.requiredTrainingDaysPerArcWeek;
}

export function completeProgramWeek(progress: ArcProgramProgress): ArcProgramProgress {
  const program = getProgramDefinition(progress.programPath);
  const nextWeek = getNextWeekDefinition(program, progress.currentProgramWeek);
  const isFinalWeek = !hasNextProgramWeek(program, progress.currentProgramWeek);

  return {
    ...progress,
    completedProgramWeeks: progress.completedProgramWeeks + 1,
    buildExtensionRequired: nextWeek !== null,
    nextLayerToBuild: nextWeek ? nextWeek.layersToBuild : null,
    programCompleted: isFinalWeek,
  };
}

export function unlockBuildExtension(progress: ArcProgramProgress): ArcProgramProgress {
  const program = getProgramDefinition(progress.programPath);
  const nextWeek = getNextWeekDefinition(program, progress.currentProgramWeek);

  return {
    ...progress,
    activeLayers: nextWeek?.activeLayers ?? progress.activeLayers,
    currentProgramWeek: progress.currentProgramWeek + 1,
    weekStartDate: null,
    trainingDatesThisWeek: [],
    buildExtensionRequired: false,
    nextLayerToBuild: null,
  };
}

export function createInitialProgress(programPath: string): ArcProgramProgress {
  const program = getProgramDefinition(programPath);
  const week1 = getCurrentWeekDefinition(program, 1);

  return {
    programPath,
    currentProgramWeek: 1,
    completedProgramWeeks: 0,
    activeLayers: week1?.activeLayers ?? [],
    weekStartDate: null,
    trainingDatesThisWeek: [],
    buildExtensionRequired: false,
    nextLayerToBuild: null,
    programCompleted: false,
  };
}
