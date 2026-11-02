import test from "node:test";
import assert from "node:assert/strict";

import { createTaskJournalEntry } from "../data/taskJournal.ts";
import type { TaskJournalEntry } from "../data/taskJournal.ts";
import {
  arcToTaskReturnPercentage,
  buildTaskInsightsSummary,
  commonPostponementHours,
  mostFrequentConfirmedEmotions,
  mostFrequentInterferenceCategories,
  mostUsedPreparationStates,
} from "./taskInsights.ts";

const BASE = { taskId: "t1", occurredAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" };

function entry(overrides: Partial<TaskJournalEntry> & { id: string; kind: TaskJournalEntry["kind"] }): TaskJournalEntry {
  return createTaskJournalEntry({ ...BASE, ...overrides });
}

test("mostFrequentInterferenceCategories counts across both interference_reported and protocol_run_completed, excluding nulls, sorted most-frequent first", () => {
  const entries = [
    entry({ id: "1", kind: "interference_reported", interferenceCategory: "emotion" }),
    entry({ id: "2", kind: "protocol_run_completed", interferenceCategory: "emotion" }),
    entry({ id: "3", kind: "interference_reported", interferenceCategory: "energy" }),
    entry({ id: "4", kind: "attempt_started" }),
  ];
  const result = mostFrequentInterferenceCategories(entries);
  assert.deepEqual(result, [
    { value: "emotion", count: 2 },
    { value: "energy", count: 1 },
  ]);
});

test("mostFrequentConfirmedEmotions and mostUsedPreparationStates are plain frequency counts, never a diagnosis", () => {
  const entries = [
    entry({ id: "1", kind: "protocol_run_completed", confirmedEmotion: "fear" }),
    entry({ id: "2", kind: "protocol_run_completed", confirmedEmotion: "fear" }),
    entry({ id: "3", kind: "protocol_run_completed", confirmedEmotion: "anger" }),
    entry({ id: "4", kind: "protocol_run_completed", usedPreparationStateLabel: "ריכוז" }),
  ];
  assert.deepEqual(mostFrequentConfirmedEmotions(entries), [
    { value: "fear", count: 2 },
    { value: "anger", count: 1 },
  ]);
  assert.deepEqual(mostUsedPreparationStates(entries), [{ value: "ריכוז", count: 1 }]);
});

test("arcToTaskReturnPercentage is null with no answered entries -- never 0, never invented", () => {
  assert.equal(arcToTaskReturnPercentage([]), null);
  assert.equal(arcToTaskReturnPercentage([entry({ id: "1", kind: "attempt_started" })]), null);
});

test("arcToTaskReturnPercentage computes the real percentage only from entries with an explicit returnedToTask answer", () => {
  const entries = [
    entry({ id: "1", kind: "protocol_run_completed", returnedToTask: true }),
    entry({ id: "2", kind: "protocol_run_completed", returnedToTask: true }),
    entry({ id: "3", kind: "protocol_run_completed", returnedToTask: false }),
    entry({ id: "4", kind: "protocol_run_completed", returnedToTask: null }),
  ];
  assert.equal(arcToTaskReturnPercentage(entries), 67);
});

test("commonPostponementHours buckets by local hour, only for 'postponed' entries", () => {
  const entries = [
    entry({ id: "1", kind: "postponed", occurredAt: new Date(2026, 0, 1, 9, 30).toISOString() }),
    entry({ id: "2", kind: "postponed", occurredAt: new Date(2026, 0, 2, 9, 45).toISOString() }),
    entry({ id: "3", kind: "attempt_started", occurredAt: new Date(2026, 0, 1, 9, 30).toISOString() }),
  ];
  assert.deepEqual(commonPostponementHours(entries), [{ value: "9", count: 2 }]);
});

test("buildTaskInsightsSummary assembles every sub-aggregate plus a total entry count", () => {
  const entries = [entry({ id: "1", kind: "interference_reported", interferenceCategory: "urge" })];
  const summary = buildTaskInsightsSummary(entries);
  assert.equal(summary.totalEntries, 1);
  assert.deepEqual(summary.interferenceCategories, [{ value: "urge", count: 1 }]);
  assert.equal(summary.arcToTaskReturnPercentage, null);
});
