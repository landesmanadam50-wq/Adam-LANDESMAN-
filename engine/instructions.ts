/**
 * engine/instructions.ts
 *
 * Parameterless, safe ARC Thought instructions, plus a denylist-based
 * audit for two classes of bug this file exists to guard against:
 *
 *   1. An instruction that names a specific Interfering State and/or
 *      Desired State and asks the trainee to hold both in awareness
 *      simultaneously, or that asks them to evoke/imagine/strengthen/
 *      reproduce a state rather than simply notice what's already
 *      present.
 *   2. (Ambient sound anchor) An instruction that asks the trainee to
 *      search for, generate, or forcefully focus on/intensify sound,
 *      rather than simply letting whatever sound is already present
 *      register as one more anchor alongside the visual point and the
 *      body.
 *
 * live/stageCopy.ts's ArcThoughtAwareness/ArcThoughtCombinedAttention/
 * ArcThoughtExpansion cases call these instead of interpolating
 * profile.interferingState/profile.supportiveState directly.
 */

export function getAwarenessInstruction(): string {
  return "שים לב למה שכבר נמצא עכשיו בתודעה ובגוף שלך.";
}

export function getCombinedAttentionInstruction(): string {
  return "שים לב למה שכבר נמצא עכשיו בתודעה. במקביל, שים לב לנקודה אחת מולך, לצלילים מסביב ולתחושה של הגוף כולו.";
}

export function getExpandPresenceInstruction(): string {
  return "הרחב בעדינות את שדה הראייה, אפשר לצלילים להישאר ברקע והעבר יותר תשומת לב לתחושות הגוף.";
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
  // Ambient sound must stay a passive, already-present anchor -- never
  // something the trainee is told to search for, create, or force
  // focus onto.
  /חפש.{0,3} .*(קול|צליל)/,
  /(צור|ייצר|תיצור).{0,3} .*(קול|צליל)/,
  /התמקד.{0,3} (בכוח|בחוזקה) .*(קול|צליל)/,
];

export function containsInductionPattern(instructionText: string): boolean {
  return INDUCTION_PATTERN_DENYLIST.some((pattern) => pattern.test(instructionText));
}
