/**
 * arc/lastEncodingFeeling.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, section 10
 * ("personalized to the actual feeling if one was selected during
 * encoding; never assume the expected feeling occurred"): a minimal,
 * additive record of the real supportive feeling resolved during a
 * task-linked ARC encoding step, so the post-completion reflection
 * screen can personalize its own question 2 to what ACTUALLY happened
 * in encoding -- never an assumed/guessed feeling. One record per
 * task (the most recent encoding overwrites any earlier one for that
 * same task), never a history -- this is a display convenience only,
 * never a source of truth for memory selection (which lives entirely
 * in arc/positiveMemorySelection.ts + arc/positiveMemorySelectionHistory.ts).
 */

export interface LastEncodingFeelingRecord {
  taskId: string;
  feeling: string;
  recordedAt: string;
}

export function upsertLastEncodingFeeling(records: LastEncodingFeelingRecord[], taskId: string, feeling: string, now: string): LastEncodingFeelingRecord[] {
  const next: LastEncodingFeelingRecord = { taskId, feeling, recordedAt: now };
  const withoutExisting = records.filter((record) => record.taskId !== taskId);
  return [...withoutExisting, next];
}

export function resolveLastEncodingFeelingForTask(records: LastEncodingFeelingRecord[], taskId: string): string | null {
  const match = records.find((record) => record.taskId === taskId);
  return match ? match.feeling : null;
}
