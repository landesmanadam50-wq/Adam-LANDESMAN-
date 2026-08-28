export function getAwarenessInstruction(): string {
  return "שים לב למה שכבר נמצא עכשיו בתודעה ובגוף שלך.";
}

export function getCombinedAttentionInstruction(): string {
  return "שים לב למה שכבר נמצא עכשיו בתודעה. במקביל, שים לב לנקודה אחת מולך, לצלילים מסביב ולתחושה של הגוף כולו.";
}

export function getExpandPresenceInstruction(): string {
  return "הרחב בעדינות את שדה הראייה, אפשר לצלילים להישאר ברקע והעבר יותר תשומת לב לתחושות הגוף.";
}

export interface EncodingInstructionInput {
  desiredState: string;
  identity: string;
  encodingCue?: string | null;
  action: string;
}

export function getEncodingInstruction(input: EncodingInstructionInput): string {
  const cuePart = input.encodingCue ? ` ${input.encodingCue}.` : "";
  return `התחבר עכשיו ל${input.desiredState}, מתוך הזהות שלך כ${input.identity}.${cuePart} כשאתה מוכן, בצע: ${input.action}.`;
}

export function getChallengeContextRecognitionPrompt(challengeContext: string): string {
  return `האם אתה נמצא כרגע במצב הזה: ${challengeContext}?`;
}

export function getInterferingStateRecognitionPrompt(interferingState: string): string {
  return `האם ${interferingState} נמצא/ת אצלך כרגע?`;
}

export const INDUCTION_PATTERN_DENYLIST: RegExp[] = [
  /תיזכר/,
  /דמיין/,
  /תחזק את/,
  /תחזיק את .* במודעות/,
  // Matches "בו-זמנית"/"בו־זמנית"/"בו זמנית"/"בוזמנית" -- the actual
  // shipped bug used a plain ASCII hyphen (U+002D), not the Hebrew
  // maqaf (U+05BE) the original pattern only accounted for.
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
