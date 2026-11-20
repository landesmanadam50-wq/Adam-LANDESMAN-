/**
 * arc/positiveFeelingOptions.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, section 2:
 * "reuse ARCHI's existing positive-feeling definitions wherever
 * possible." The app's one existing vocabulary of positive/supportive
 * feeling WORDS already lives in arc/supportiveFeelingMapping.ts (the
 * Encoding stage's own current-emotion -> supportive-feeling table) --
 * this just exposes its distinct feeling words for positive-memory
 * documentation's own feeling picker, never a second, separately-
 * authored list. Free-typed custom feelings are still supported by
 * every caller (PositiveMemoryFeelingEntry.feeling is a plain string),
 * exactly like Encoding's own customSupportiveFeelingText already
 * works -- this module only supplies the deterministic SUGGESTED set.
 */

import { listSupportiveFeelingAlternatives } from "./supportiveFeelingMapping.ts";

export function resolvePositiveFeelingOptions(): string[] {
  return listSupportiveFeelingAlternatives().map((mapping) => mapping.feeling);
}
