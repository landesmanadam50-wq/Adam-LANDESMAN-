/**
 * arc/coachingWorkspace.ts
 *
 * Productivity roadmap, Stage Z: an optional, entirely LOCAL coaching
 * workspace. "The user remains the owner of all information" -- every
 * field here is written by the trainee themselves (never auto-filled
 * from the journal or any other private record), and nothing in this
 * stage creates a coach account, cloud sharing, messaging, or any
 * permission system -- those are explicitly deferred until this local
 * workflow is itself approved. One entry per coaching session (never
 * a single, repeatedly-overwritten record), so history survives.
 */

export interface CoachingWorkspaceEntry {
  id: string;
  goal: string | null;
  weeklyTasks: string | null;
  value: string | null;
  identity: string | null;
  supportiveState: string | null;
  selectedBarriers: string | null;
  plannedExperiment: string | null;
  protocolsToPractice: string | null;
  newFactorsToReview: string | null;
  success: string | null;
  difficulty: string | null;
  questionForCoach: string | null;
  nextSessionPlan: string | null;
  createdAt: string;
  updatedAt: string;
}

export function generateCoachingWorkspaceEntryId(): string {
  return `coaching-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyCoachingWorkspaceEntry(id: string, now: string): CoachingWorkspaceEntry {
  return {
    id,
    goal: null,
    weeklyTasks: null,
    value: null,
    identity: null,
    supportiveState: null,
    selectedBarriers: null,
    plannedExperiment: null,
    protocolsToPractice: null,
    newFactorsToReview: null,
    success: null,
    difficulty: null,
    questionForCoach: null,
    nextSessionPlan: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertCoachingWorkspaceEntryInList(entries: CoachingWorkspaceEntry[], entry: CoachingWorkspaceEntry): CoachingWorkspaceEntry[] {
  const index = entries.findIndex((existing) => existing.id === entry.id);
  if (index === -1) return [...entries, entry];
  const next = [...entries];
  next[index] = entry;
  return next;
}
