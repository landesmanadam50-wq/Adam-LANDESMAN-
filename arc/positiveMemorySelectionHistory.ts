/**
 * arc/positiveMemorySelectionHistory.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, section 8/9
 * ("variety: avoid repeatedly selecting the same memory... avoid
 * unnecessary immediate repetition") + section 16
 * ("PositiveMemorySelectionHistory"): a small, append/update-in-place
 * log of "which memory was last automatically selected for which
 * context" -- the ONE piece of state arc/positiveMemorySelection.ts's
 * rotation logic needs across sessions (a single in-memory session
 * cannot remember "what was shown three days ago"). Pure data model +
 * logic only, no AsyncStorage/navigation/React.
 */

/** Section 13: the two reusable ranking strategies -- "encoding_feeling" scopes rotation to a feeling word, "arc_success" scopes it to a taskId. */
export type PositiveMemorySelectionContext = "encoding_feeling" | "arc_success";

export interface PositiveMemorySelectionHistoryEntry {
  memoryId: string;
  selectionContext: PositiveMemorySelectionContext;
  /** The feeling word (encoding_feeling) or taskId (arc_success) this selection was scoped to -- rotation only ever compares entries sharing the SAME context + contextKey, never across unrelated feelings/tasks. */
  contextKey: string;
  lastSelectedAt: string;
}

/** Records (or refreshes) that this memory was just the one automatically selected for this exact context/key -- upserts by (selectionContext, contextKey) so there is always at most ONE "last selected" entry per context/key, never an ever-growing log. */
export function recordPositiveMemorySelection(
  history: PositiveMemorySelectionHistoryEntry[],
  memoryId: string,
  selectionContext: PositiveMemorySelectionContext,
  contextKey: string,
  now: string
): PositiveMemorySelectionHistoryEntry[] {
  const index = history.findIndex((entry) => entry.selectionContext === selectionContext && entry.contextKey === contextKey);
  const entry: PositiveMemorySelectionHistoryEntry = { memoryId, selectionContext, contextKey, lastSelectedAt: now };
  if (index === -1) return [...history, entry];
  const next = [...history];
  next[index] = entry;
  return next;
}

export function resolveLastSelectedMemoryId(
  history: PositiveMemorySelectionHistoryEntry[],
  selectionContext: PositiveMemorySelectionContext,
  contextKey: string
): string | null {
  return history.find((entry) => entry.selectionContext === selectionContext && entry.contextKey === contextKey)?.memoryId ?? null;
}
