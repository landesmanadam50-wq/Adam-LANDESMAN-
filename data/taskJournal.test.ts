import test from "node:test";
import assert from "node:assert/strict";

import { createTaskJournalEntry, normalizeTaskJournalEntry } from "./taskJournal.ts";
import type { TaskJournalEntry } from "./taskJournal.ts";

const BASE = { id: "e1", taskId: "t1", kind: "attempt_started" as const, occurredAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" };

test("createTaskJournalEntry defaults every optional field to null", () => {
  const entry = createTaskJournalEntry(BASE);
  assert.equal(entry.attemptId, null);
  assert.equal(entry.interferenceCategory, null);
  assert.equal(entry.confirmedEmotion, null);
  assert.equal(entry.savedFactorKind, null);
  assert.equal(entry.savedFactorId, null);
  assert.equal(entry.reviewLaterFactorId, null);
  assert.equal(entry.returnedToTask, null);
  assert.equal(entry.reflectionReturnedAfterArc, null);
  assert.equal(entry.reflectionWhatHelped, null);
  assert.equal(entry.reflectionWhatToReuse, null);
  assert.equal(entry.usedPreparationStateLabel, null);
});

test("createTaskJournalEntry keeps every field the caller explicitly passed", () => {
  const entry = createTaskJournalEntry({ ...BASE, kind: "protocol_run_completed", interferenceCategory: "emotion", confirmedEmotion: "fear", returnedToTask: true });
  assert.equal(entry.interferenceCategory, "emotion");
  assert.equal(entry.confirmedEmotion, "fear");
  assert.equal(entry.returnedToTask, true);
});

test("normalizeTaskJournalEntry backfills every Stage-Y field missing on a pre-Stage-Y row, without touching fields already present", () => {
  const legacy = { ...BASE, attemptOutcome: null, interferenceReason: null, returnedToTask: true, postponementReason: null, returnAt: null } as unknown as TaskJournalEntry;
  const normalized = normalizeTaskJournalEntry(legacy);
  assert.equal(normalized.interferenceCategory, null);
  assert.equal(normalized.confirmedEmotion, null);
  assert.equal(normalized.savedFactorKind, null);
  assert.equal(normalized.reviewLaterFactorId, null);
  assert.equal(normalized.returnedToTask, true, "an already-present field must survive normalization untouched");
  assert.equal(normalized.reflectionReturnedAfterArc, null);
  assert.equal(normalized.reflectionWhatHelped, null);
  assert.equal(normalized.reflectionWhatToReuse, null);
  assert.equal(normalized.usedPreparationStateLabel, null);
});
