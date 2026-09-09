/**
 * arc/naturalBreathing.ts
 *
 * Unified Presence/Mantra/Trigger/Imagery spec, section 1: one fixed,
 * persistent instruction line, added to every Presence sub-stage, Stay,
 * and Acceptance (arc/stageCopy.ts), and to the corresponding sections
 * inside ARC Link where they already exist (arc/arcLink.ts). Deliberately
 * never an instruction to deepen/slow/control/otherwise modify the
 * breath -- the whole purpose is noticing the breathing already
 * happening on its own, nothing more.
 */

/** Fixed text, no parameters -- there is nothing session/profile-specific about this line. */
export function getFreeBreathingLine(): string {
  return "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.";
}
