/**
 * engine/instructions.ts
 *
 * Parameterless, safe ARC Thought instructions, plus a denylist-based
 * audit for the class of bug this file exists to fix: an instruction
 * that names a specific Interfering State and/or Desired State and
 * asks the trainee to hold both in awareness simultaneously, or that
 * asks them to evoke/imagine/strengthen/reproduce a state rather than
 * simply notice what's already present.
 *
 * live/stageCopy.ts's ArcThoughtAwareness/ArcThoughtCombinedAttention/
 * ArcThoughtExpansion cases call these instead of interpolating
 * profile.interferingState/profile.supportiveState directly.
 */

export function getAwarenessInstruction(): string {
  return "שים לב למה שכבר נמצא עכשיו בתודעה ובגוף שלך.";
}

export function getCombinedAttentionInstruction(): string {
  return "שים לב למה שכבר נמצא עכשיו בתודעה. במקביל, שים לב לנקודה אחת מולך ולתחושה של הגוף כולו.";
}

export function getExpandPresenceInstruction(): string {
  return "הרחב בעדינות את שדה הראייה והעבר יותר תשומת לב לתחושות הגוף.";
}

export const INDUCTION_PATTERN_DENYLIST: RegExp[] = [
  /תיזכר/,
  /דמיין/,
  /תחזק את/,
  /תחזיק את .* במודעות/,
  // Matches "בו-זמנית"/"בו־זמנית"/"בו זמנית"/"בוזמנית" -- the actual
  // shipped bug used a plain ASCII hyphen (U+002D), not the Hebrew
  // maqaf (U+05BE).
  /בו[-־\s]?זמנית את המודעות ל.+וגם ל/,
];

export function containsInductionPattern(instructionText: string): boolean {
  return INDUCTION_PATTERN_DENYLIST.some((pattern) => pattern.test(instructionText));
}
