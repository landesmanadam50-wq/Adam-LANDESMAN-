/**
 * arc/presenceColor.ts
 *
 * Unified Presence/Mantra/Trigger/Imagery spec, section 2: renames the
 * user-facing "Presence Color" concept to "Energy Color in the Body".
 * This is a wording/positioning change only -- arc/types.ts's
 * ArcBuildProfile.presenceColor field, its storage key, and every
 * already-saved value are completely untouched (no rename, no
 * migration, no invalidation of existing programs).
 *
 * getEnergyColorLine replaces the earlier getPresenceColorActivationLine/
 * getPresenceColorReminder pair: instead of one activation sentence at
 * Presence Stage 3 plus a different, appended reminder sentence per
 * later section, there is now ONE fixed, dynamically-colored template,
 * always PREPENDED before a stage's existing content (never appended
 * mid/end) -- see arc/stageCopy.ts's call sites for the exact
 * placement per stage (never shown at Presence stage 1; shown from
 * stage 2 onward, and at every later stage the old reminder used to
 * appear at).
 *
 * Every line here is built from a fixed, gender-neutral Hebrew template
 * around the trainee's own saved color text -- never an inflected
 * adjective agreeing with a noun (e.g. never "האנרגיה הסגולה"), because
 * that agreement can't be produced reliably for arbitrary free-typed
 * Hebrew. A missing/blank color is simply "say nothing" -- callers omit
 * the line entirely rather than ever rendering "undefined", "null", or
 * an empty sentence fragment. No color meaning/interpretation is ever
 * added -- the trainee's own text is only ever echoed back verbatim
 * inside this one fixed sentence frame.
 */

/** True only for a real, non-blank saved color -- never for null/undefined/whitespace-only. */
export function hasPresenceColor(color: string | null | undefined): color is string {
  return typeof color === "string" && color.trim().length > 0;
}

/**
 * The one Energy Color reminder line, reused everywhere it appears
 * (Presence stages 2-3, Stay, Acceptance, Regulation, Encoding, Action,
 * Completion) -- always meant to be placed BEFORE a stage's own existing
 * content, never appended after it. Returns null (never a blank/invented
 * line) when there's no saved color -- legacy ArcBuilds, or ones whose
 * trainee left the field genuinely blank, read exactly as if this
 * feature didn't exist for them.
 */
export function getEnergyColorLine(color: string | null | undefined): string | null {
  if (!hasPresenceColor(color)) return null;
  const trimmed = color.trim();
  return `שים לב כיצד האנרגיה בצבע ${trimmed} מתפשטת בגופך ומחזירה אותך לנוכחות.`;
}
