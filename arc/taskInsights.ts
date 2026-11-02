/**
 * arc/taskInsights.ts
 *
 * Productivity roadmap, Stage Y: "build factual insights only... do
 * not present diagnoses or causal psychological claims." Every
 * function here is a plain count/aggregate over data/taskJournal.ts's
 * own TaskJournalEntry rows -- never an interpretation, a diagnosis, or
 * a trend claim beyond "you selected X in N sessions this week."
 *
 * Scoped to what the journal actually records (see data/taskJournal.ts's
 * own doc for which fields exist): most frequent interference
 * category, most frequent confirmed emotion, most-used preparation
 * state, the ARC-to-task return percentage, and common postponement
 * hours. "Regulation tool associated with task return" and "completion
 * after preparation" are NOT computed here -- no discrete "regulation
 * tool" field exists yet (each protocol's tools are fixed content, not
 * a separately logged choice), and correlating preparation-use with
 * eventual task completion needs a join this module doesn't have the
 * data to do honestly yet; inventing an approximate answer would risk
 * exactly the kind of overclaim this stage explicitly forbids.
 */

import type { TaskJournalEntry } from "../data/taskJournal.ts";

export interface FrequencyCount<T extends string> {
  value: T;
  count: number;
}

/** Plain frequency count over a list of (possibly null) values -- nulls are excluded entirely, never counted as their own "category". Sorted most-frequent first; ties keep the order first encountered (stable), never randomized. */
function countFrequencies<T extends string>(values: (T | null)[]): FrequencyCount<T>[] {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

export function mostFrequentInterferenceCategories(entries: TaskJournalEntry[]): FrequencyCount<string>[] {
  return countFrequencies(entries.filter((entry) => entry.kind === "interference_reported" || entry.kind === "protocol_run_completed").map((entry) => entry.interferenceCategory));
}

export function mostFrequentConfirmedEmotions(entries: TaskJournalEntry[]): FrequencyCount<string>[] {
  return countFrequencies(entries.map((entry) => entry.confirmedEmotion));
}

export function mostUsedPreparationStates(entries: TaskJournalEntry[]): FrequencyCount<string>[] {
  return countFrequencies(entries.map((entry) => entry.usedPreparationStateLabel));
}

/** Of every "protocol_run_completed" entry that recorded a real yes/no answer (returnedToTask !== null), what fraction returned to the task -- the spec's own "ARC-to-task return percentage". Returns null (never 0, never an invented number) when there is no such entry yet. */
export function arcToTaskReturnPercentage(entries: TaskJournalEntry[]): number | null {
  const withAnswer = entries.filter((entry) => entry.kind === "protocol_run_completed" && entry.returnedToTask !== null);
  if (withAnswer.length === 0) return null;
  const returned = withAnswer.filter((entry) => entry.returnedToTask === true).length;
  return Math.round((returned / withAnswer.length) * 100);
}

/** The spec's own "common postponement times" -- a plain count of postponement events by the LOCAL hour they occurred (device-local, never UTC, matching program/dateUtils.ts's own local-time convention), 0-23. */
export function commonPostponementHours(entries: TaskJournalEntry[]): FrequencyCount<string>[] {
  const hours = entries.filter((entry) => entry.kind === "postponed").map((entry) => String(new Date(entry.occurredAt).getHours()));
  return countFrequencies(hours);
}

export interface TaskInsightsSummary {
  interferenceCategories: FrequencyCount<string>[];
  confirmedEmotions: FrequencyCount<string>[];
  preparationStates: FrequencyCount<string>[];
  arcToTaskReturnPercentage: number | null;
  postponementHours: FrequencyCount<string>[];
  totalEntries: number;
}

export function buildTaskInsightsSummary(entries: TaskJournalEntry[]): TaskInsightsSummary {
  return {
    interferenceCategories: mostFrequentInterferenceCategories(entries),
    confirmedEmotions: mostFrequentConfirmedEmotions(entries),
    preparationStates: mostUsedPreparationStates(entries),
    arcToTaskReturnPercentage: arcToTaskReturnPercentage(entries),
    postponementHours: commonPostponementHours(entries),
    totalEntries: entries.length,
  };
}
