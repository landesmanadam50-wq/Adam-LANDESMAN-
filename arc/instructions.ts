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
  // "imagine" is banned EXCEPT seven sanctioned phrasings: (1) Action
  // Imagery ("imagine yourself starting/beginning [the desired
  // action]" -- Action Body Cue task: "מתחיל", not "מבצע את", to read
  // as natural Hebrew against an infinitive action like "ללמוד" -- see
  // arc/stageCopy.ts's "act" case) -- currentAction there only ever
  // sources from positive action fields (beneficialAction/
  // internalAction/identityAction) or the trainee's own alternative,
  // never interferingState, so it can never evoke a difficult state;
  // (2) the reactive-flow-strengthening task's KNOWN-trigger
  // observer_pause perspective-taking line ("imagine for a moment WHAT
  // HAPPENED as if seeing the situation from outside" --
  // arc/stageCopy.ts's "observer_pause" case) -- recognition of an
  // event that already occurred, from an observer's distance, never an
  // instruction to evoke/recreate/intensify the feeling itself; its own
  // very next segment explicitly says so ("no need to re-evoke or
  // strengthen"); (3) the unknown-trigger refinement's own shorter
  // observer_pause variant ("imagine YOURSELF for a moment as if seeing
  // yourself from the side") -- used precisely when no specific
  // trigger/situation is known at all, so it never references or
  // infers any event, only the trainee's own position, an even
  // lower-risk phrasing than (2); (4) ARC Goal task: the extended
  // Action Imagery's Process/Action Imagery step ("imagine yourself
  // PERFORMING the action" -- arc/successfulPerformance.ts) -- like the
  // existing Action Imagery exception, currentAction there only ever
  // sources from the trainee's own configured positive action, never
  // the interfering state; (5) that same sequence's Result Imagery
  // step ("imagine that the action succeeds and you achieve the
  // desired result") -- the imagined content is the trainee's own
  // configured desired result, never anything interfering; (6) the
  // ARC Goal Urge/Supportive-state route's own trigger-identification
  // prefix (spec sections 3-4, arc/arcGoalEngine.ts's
  // getThirdPersonImageryCopy) -- "imagine the situation from the
  // side, as if you're watching yourself in the situation. Notice
  // what triggered the feeling or urge, without trying to intensify
  // it" -- same observer's-distance recognition as (2)/(3), and its
  // own sentence explicitly says not to intensify it; and (7) that
  // same prefix's imagined-Stop line -- "imagine that you recognize
  // the moment the feeling or urge begins and stop before the
  // automatic reaction" -- recognition of the already-familiar Stop
  // moment, never an instruction to evoke or intensify anything. Any
  // other "imagine" usage -- e.g. imagining a feeling/craving/
  // distraction directly -- still trips this pattern.
  /דמיין(?! את עצמך מתחיל| לרגע את מה שקרה| את עצמך לרגע| את עצמך מבצע| שהפעולה מצליחה| את המצב מהצד| שאתה מזהה את הרגע)/,
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
