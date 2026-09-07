/**
 * arc/triggerImagery.ts
 *
 * Extended ARC Link trigger system: the ONE shared trigger-imagery
 * wording helper reused by both arc/arcLink.ts (the "trigger" step in
 * buildArcLinkIntroSteps) and arc/bridgingArcLink.ts (the Bridging
 * Link's own trigger step) -- so the category-specific phrasing (plain
 * / observer-perspective / safe recognition-only) is defined exactly
 * once, never drifting between the two modules.
 *
 * "scheduled"/"routine" keep the same plain trigger-imagery wording
 * every ARC Link trigger step already used before this task existed.
 * "preventive" adds observer-perspective phrasing -- noticing the
 * situation from outside, before anything interfering has a chance to
 * build. "reactive" uses safe recognition-only wording for whatever
 * difficult sensation/state may already be present -- "שים לב למה
 * שכבר נמצא עכשיו" -- NEVER an instruction to create, intensify, or
 * remain inside it.
 */

import type { ArcLinkTriggerCategory } from "./routineLinks.ts";

export interface TriggerImageryContent {
  lines: string[];
  buttonLabel: string;
}

export function buildTriggerImageryContent(trigger: string, category: ArcLinkTriggerCategory, interferingLabel: string): TriggerImageryContent {
  const triggerLabel = trigger || "הטריגר שהגדרת";

  if (category === "preventive") {
    return {
      lines: [
        `דמיין שאתה רואה את עצמך מהצד בתוך הסיטואציה הבאה: ${triggerLabel}.`,
        "שים לב לעצמך מזהה את הרגע הזה מבעוד מועד, לפני שמשהו מפריע מתפתח.",
      ],
      buttonLabel: "דמיינתי את הטריגר",
    };
  }

  if (category === "reactive") {
    return {
      lines: [
        `דמיין את הרגע הבא: ${triggerLabel}.`,
        interferingLabel
          ? `שים לב למה שכבר נמצא עכשיו: ${interferingLabel}.`
          : "שים לב למה שכבר נמצא עכשיו, בלי להעצים אותו ובלי להילחם בו.",
        "אתה רק שם לב למה שקיים -- אין צורך לעורר אותו, להחזיק אותו או להעצים אותו.",
      ],
      buttonLabel: "המשך",
    };
  }

  return {
    lines: [
      "עצום עיניים ודמיין שהרגע הבא מתרחש:",
      triggerLabel,
      "דמיין היכן אתה נמצא, מה אתה רואה סביבך ומה אתה עושה באותו רגע. דמיין את הרגע כאילו הוא מתרחש עכשיו.",
    ],
    buttonLabel: "דמיינתי את הטריגר",
  };
}
