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
  // "תזכור"/"זכור" -- imperative "remember [the difficult feeling]",
  // a different conjugation than the reflexive "תיזכר" above.
  /תזכור/,
  /^זכור /,
  / זכור /,
  // "imagine" is banned EXCEPT three sanctioned phrasings: (1) Action
  // Imagery ("imagine yourself performing [the desired action]",
  // arc/stageCopy.ts's "act" case) -- actionLabel there only ever
  // sources from positive action fields (beneficialAction/
  // internalAction/identityAction), never interferingState, so it can
  // never evoke a difficult state; (2) the reactive-flow-strengthening
  // task's KNOWN-trigger observer_pause perspective-taking line
  // ("imagine for a moment WHAT HAPPENED as if seeing the situation
  // from outside" -- arc/stageCopy.ts's "observer_pause" case) --
  // recognition of an event that already occurred, from an observer's
  // distance, never an instruction to evoke/recreate/intensify the
  // feeling itself; its own very next segment explicitly says so ("no
  // need to re-evoke or strengthen"); and (3) the unknown-trigger
  // refinement's own shorter observer_pause variant ("imagine YOURSELF
  // for a moment as if seeing yourself from the side") -- used
  // precisely when no specific trigger/situation is known at all, so it
  // never references or infers any event, only the trainee's own
  // position, an even lower-risk phrasing than (2). Any other "imagine"
  // usage -- e.g. imagining a feeling/craving/distraction directly --
  // still trips this pattern.
  /דמיין(?! את עצמך מבצע| לרגע את מה שקרה| את עצמך לרגע)/,
  /תחזק את/,
  // "hold/keep X in awareness/mind/the head" -- covers "בתודעה"/"בראש"
  // in addition to "במודעות".
  /תחזיק את .* (במודעות|בתודעה|בראש)/,
  // "bring the interfering state into awareness" -- evoking it, not
  // noticing it if it's already there.
  /(תביא|הבא) .*למודעות/,
  // "keep/leave the [interfering] state active"
  /(תשמור|השאר) .* (פעיל|פעילה|פעילים)/,
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
  // Regulation/transition instructions must never claim the trainee is
  // now calmer/better/more regulated -- only neutral present-state
  // noticing is allowed (see arc/stageCopy.ts's "regulate"/"encode").
  /כמה אתה רגוע יותר/,
];

export function containsInductionPattern(instructionText: string): boolean {
  return INDUCTION_PATTERN_DENYLIST.some((pattern) => pattern.test(instructionText));
}
