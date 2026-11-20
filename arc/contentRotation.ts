/**
 * arc/contentRotation.ts
 *
 * Psychology/Smiling/Positive-Reinforcement task: ONE shared, pure
 * "pick the next item in a fixed list, never immediately repeating the
 * last one" rule -- used by both arc/psychologyFacts.ts (one fact per
 * app launch) and arc/positiveImagery.ts (one prompt per completed
 * task), so the two independent rotation requirements ("a different
 * fact where possible" / "avoid repeating the same imagery
 * consecutively") are never two slightly-different reimplementations
 * of the same idea.
 *
 * Deliberately a plain sequential rotation (never a random shuffle):
 * given the same lastIndex and the same list length, the result is
 * always the same next index, which is what makes this trivially
 * testable and guarantees every item is eventually shown (a random
 * pick could keep re-rolling the same handful of items by chance).
 */

/**
 * `lastIndex` is the index shown last time (null if nothing has ever
 * been shown yet, e.g. first-ever app launch). Returns the next index
 * to show -- `0` for an empty or single-item list (nothing else to
 * rotate to), otherwise `(lastIndex + 1) % length`, which is
 * guaranteed to differ from `lastIndex` whenever `length > 1`.
 */
export function resolveNextRotationIndex(lastIndex: number | null, length: number): number {
  if (length <= 1) return 0;
  if (lastIndex === null || lastIndex < 0 || lastIndex >= length) return 0;
  return (lastIndex + 1) % length;
}
