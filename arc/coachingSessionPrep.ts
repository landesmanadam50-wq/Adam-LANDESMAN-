/**
 * arc/coachingSessionPrep.ts
 *
 * Productivity roadmap, Stage Z: "add a 'prepare for coaching session'
 * summary that the user can review and choose what to share... do not
 * automatically share the full journal." This module only ASSEMBLES
 * the summary (plain counts, same factual-only discipline as
 * arc/taskInsights.ts) -- live/CoachingSessionPrepScreen.tsx is the one
 * place that decides what is actually shown, via the trainee's own
 * per-section visibility choice; nothing here transmits anything
 * anywhere.
 */

import type { Task } from "./tasks.ts";
import type { TaskJournalEntry } from "../data/taskJournal.ts";
import type { ReviewLaterFactor } from "./reviewLaterFactor.ts";
import type { CoachingWorkspaceEntry } from "./coachingWorkspace.ts";
import { mostFrequentInterferenceCategories } from "./taskInsights.ts";
import type { FrequencyCount } from "./taskInsights.ts";

export interface CoachingSessionPrepSummary {
  completedTasksCount: number;
  postponedTasksCount: number;
  arcUsesCount: number;
  successfulTaskReturnsCount: number;
  recurringFactors: FrequencyCount<string>[];
  newUnbuiltFactorsCount: number;
  latestSuccess: string | null;
  latestDifficulty: string | null;
  latestQuestionForCoach: string | null;
}

export function buildCoachingSessionPrepSummary(
  tasks: Task[],
  journal: TaskJournalEntry[],
  reviewLaterFactors: ReviewLaterFactor[],
  latestEntry: CoachingWorkspaceEntry | null
): CoachingSessionPrepSummary {
  return {
    completedTasksCount: tasks.filter((task) => task.status === "completed").length,
    postponedTasksCount: tasks.filter((task) => task.status === "postponed").length,
    arcUsesCount: journal.filter((entry) => entry.kind === "protocol_run_completed").length,
    successfulTaskReturnsCount: journal.filter((entry) => entry.kind === "protocol_run_completed" && entry.returnedToTask === true).length,
    recurringFactors: mostFrequentInterferenceCategories(journal),
    newUnbuiltFactorsCount: reviewLaterFactors.length,
    latestSuccess: latestEntry?.success ?? null,
    latestDifficulty: latestEntry?.difficulty ?? null,
    latestQuestionForCoach: latestEntry?.questionForCoach ?? null,
  };
}

/** Which prep-summary sections the trainee has chosen to keep visible on screen -- "choose what to share" in this local-only pass means choosing what stays on screen (e.g. before showing a coach in person), since no export/transmission channel exists yet (see this module's own doc). Every section defaults to visible -- hiding one is always the trainee's own explicit action, never a default that silently withholds something. */
export type CoachingSessionPrepSection = "tasks" | "arcUses" | "recurringFactors" | "newFactors" | "latestEntry";

export const COACHING_SESSION_PREP_SECTIONS: CoachingSessionPrepSection[] = ["tasks", "arcUses", "recurringFactors", "newFactors", "latestEntry"];

export function createDefaultVisibleSections(): Record<CoachingSessionPrepSection, boolean> {
  return { tasks: true, arcUses: true, recurringFactors: true, newFactors: true, latestEntry: true };
}
