/**
 * arc/arcLinkPreview.ts
 *
 * Updated ARC Link BUILD preview task: a pure, total Hebrew paragraph
 * builder used by build/ArcLinkBuildForm.tsx to show a live preview of
 * the trainee's ARC Link before saving -- "The preview should update
 * immediately when the user changes one of the components." Takes
 * already-resolved strings (from arc/arcLinkContent.ts's resolvers, or
 * arc/bridgingArcLink.ts's own field resolution for a Bridging Link) --
 * never reads an ArcBuildProfile directly, so the same builder serves
 * both a standard ARC Link (one profile) and a Bridging ARC Link (two
 * profiles) without knowing anything about that distinction.
 */

export interface ArcLinkPreviewInputs {
  triggerText: string;
  /** The short supportive-state cue/action -- e.g. "נשימה אחת". */
  cueText: string;
  /** The internal condition the cue leads into -- "How do I need to feel to express this identity now?" (or the state layer's own Desired State). */
  supportiveStateText: string;
  /** The identity itself -- "Who am I practicing becoming?" */
  identityText: string;
  valueText: string;
  futureMantraText: string;
  actionText: string;
}

/**
 * Example structure (from the spec):
 * "כאשר [הטריגר] מופיע, אני מבצע [הפעולה הקצרה של המצב התומך].
 *  הפעולה מחברת אותי ל־[המצב התומך הרצוי].
 *  מתוך המצב הזה אני מבטא את הזהות [הזהות הרצויה], מתוך הערך [הערך].
 *  אני משתמש במנטרה העתידית: [המנטרה העתידית].
 *  ואז מתחיל את הפעולה: [הפעולה המיטיבה]."
 *
 * Every line beyond the first (trigger+cue, always shown) and the last
 * (action, always shown) is OMITTED when its own component isn't
 * configured -- never a line reading "כאשר X מופיע... מתוך המצב הזה
 * אני מבטא את הזהות ." with a trailing blank. Safe/total: never throws,
 * never renders "undefined"/"null".
 */
export function buildArcLinkPreviewText(inputs: ArcLinkPreviewInputs): string {
  const lines: string[] = [];

  lines.push(`כאשר ${inputs.triggerText || "הטריגר שלך"} מופיע, אני מבצע ${inputs.cueText || "את הפעולה הקצרה של המצב התומך"}.`);

  if (inputs.supportiveStateText) {
    lines.push(`הפעולה מחברת אותי ל־${inputs.supportiveStateText}.`);
  }

  if (inputs.identityText && inputs.valueText) {
    lines.push(`מתוך המצב הזה אני מבטא את הזהות ${inputs.identityText}, מתוך הערך ${inputs.valueText}.`);
  } else if (inputs.identityText) {
    lines.push(`מתוך המצב הזה אני מבטא את הזהות ${inputs.identityText}.`);
  } else if (inputs.valueText) {
    lines.push(`אני פועל מתוך הערך ${inputs.valueText}.`);
  }

  if (inputs.futureMantraText) {
    lines.push(`אני משתמש במנטרה העתידית: "${inputs.futureMantraText}".`);
  }

  lines.push(`ואז מתחיל את הפעולה: ${inputs.actionText || "הפעולה המיטיבה שלי"}.`);

  return lines.join("\n");
}
