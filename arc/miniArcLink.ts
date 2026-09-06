/**
 * arc/miniArcLink.ts
 *
 * ARC Link task: Mini ARC's own rehearsal mode, following the same Link
 * principle as arc/arcLink.ts but for the existing short Mini ARC
 * structure only (arc/miniArc.ts) -- never adds normal-ARC stages
 * (no Presence rating, no full Presence stages, no long Awareness, no
 * separate Acceptance, no Updated Sensation, no Action Imagery, no
 * Success Focus/Gratitude, no additional timers). Reads directly from
 * the linked MiniArcBuild's own fields, exactly like arc/arcLink.ts
 * does for a full ArcBuild -- never a second, independent copy.
 */

import { getBodyImageryForText, safeTriggerText } from "./bodyImagery.ts";
import type { BodyImagery } from "./bodyImagery.ts";
import { safeText } from "./miniArc.ts";
import type { MiniArcBuild } from "./miniArc.ts";
import type { ArcLinkMode } from "./routineLinks.ts";

export type MiniArcLinkStepId =
  | "intro"
  | "trigger"
  | "enter_archi"
  | "presence_color"
  | "name_state"
  | "regulation"
  | "encoding"
  | "beneficial_action"
  | "reinforce";

export interface MiniArcLinkStep {
  id: MiniArcLinkStepId;
  title: string;
  lines: string[];
  buttonLabel: string;
  bodyImagery: { anchorLabel: string; imagery: BodyImagery } | null;
}

export interface MiniArcLinkRehearsalContext {
  triggerText?: string;
  mode?: ArcLinkMode;
}

/**
 * Builds the full, ordered Mini ARC Link screen sequence for one
 * MiniArcBuild -- pure and total: never throws, never renders
 * "undefined"/"null"/"[object Object]".
 *
 * `ctx` is entirely OPTIONAL, for backward compatibility with the
 * original entry point (build/MiniArcModeSelectScreen.tsx via
 * live/MiniArcLinkScreen.tsx's old, linkId-less path), which never
 * passes it: omitted, this reads the trigger straight from
 * build.linkSettings (as it always has) and defaults to mode
 * "with_archi" (the only mode that existed before this task). The new
 * Routine-page Practice area passes an explicit ctx sourced from an
 * ArcLink entity + its own RoutineTrigger instead (arc/routineLinks.ts).
 */
export function buildMiniArcLinkSteps(build: MiniArcBuild, ctx: MiniArcLinkRehearsalContext = {}): MiniArcLinkStep[] {
  const trigger = (ctx.triggerText ?? safeTriggerText(build.linkSettings)).trim();
  const mode: ArcLinkMode = ctx.mode ?? "with_archi";
  const color = safeText(build.presenceColor);
  const regulationText = safeText(build.regulationAnchor);
  const encodingText = safeText(build.encodingAction);
  const actionLabel = safeText(build.beneficialAction);

  const connectionDiagram =
    mode === "with_archi"
      ? `${trigger || "הטריגר שלך"} ← כניסה ל-ARCHI ← Mini ARC ← הפעולה המיטיבה`
      : `${trigger || "הטריגר שלך"} ← Mini ARC מהזיכרון ← הפעולה המיטיבה`;
  const introText =
    mode === "with_archi"
      ? "בתרגול הזה תחזק את הקישור בין הטריגר שלך לבין הכניסה ל-ARCHI וביצוע ה-Mini ARC האישי שלך."
      : "בתרגול הזה תחזק את הקישור בין הטריגר שלך לבין ביצוע ה-Mini ARC האישי שלך מהזיכרון.";

  const steps: MiniArcLinkStep[] = [];

  steps.push({
    id: "intro",
    title: "Mini ARC Link",
    lines: [introText, connectionDiagram],
    buttonLabel: "התחלת התרגול",
    bodyImagery: null,
  });

  steps.push({
    id: "trigger",
    title: "דמיין את הטריגר",
    lines: [
      "עצום עיניים ודמיין שהרגע הבא מתרחש:",
      trigger || "הטריגר שהגדרת",
      "דמיין היכן אתה נמצא, מה אתה רואה סביבך ומה אתה עושה באותו רגע.",
    ],
    buttonLabel: "דמיינתי את הטריגר",
    bodyImagery: null,
  });

  if (mode === "with_archi") {
    steps.push({
      id: "enter_archi",
      title: "דמיין את הכניסה ל-ARCHI",
      lines: [
        "דמיין שאתה מזהה את הטריגר ונזכר:",
        "זה הזמן שלי לעשות Mini ARC.",
        "דמיין שאתה לוקח את הטלפון, פותח את ARCHI, בוחר את ה-Mini ARC שלך ולוחץ על התחלה.",
      ],
      buttonLabel: "נכנסתי ל-ARCHI בדמיון",
      bodyImagery: null,
    });
  }

  const colorLines = color
    ? [
        "דמיין את צבע הנוכחות שבחרת:",
        color,
        "דמיין שהצבע מופיע ומתפשט בגוף, מחבר אותך לרגע הנוכחי ומכין אותך להמשך.",
      ]
    : ["דמיין את צבע הנוכחות שבחרת, מופיע ומתפשט בגוף, מחבר אותך לרגע הנוכחי ומכין אותך להמשך."];
  steps.push({ id: "presence_color", title: "דמיין את צבע הנוכחות", lines: colorLines, buttonLabel: "דמיינתי את הנוכחות", bodyImagery: null });

  steps.push({
    id: "name_state",
    title: "דמיין שאתה שם לב למה שנמצא",
    lines: ["דמיין שאתה שם לב בקצרה לתחושה, לדחף או למצב שנמצאים עכשיו, בלי להעצים אותם ובלי להילחם בהם."],
    buttonLabel: "המשך",
    bodyImagery: null,
  });

  // "lines" for a bodyImagery-carrying step holds ONLY content beyond
  // what live/BodyImageryStep.tsx already renders from `bodyImagery`
  // itself -- neither Mini ARC step has anything extra.
  const regulationImagery = getBodyImageryForText(regulationText, build.regulationBodyImagery ?? null);
  steps.push({
    id: "regulation",
    title: "דמיין את הוויסות",
    lines: [],
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: regulationText, imagery: regulationImagery },
  });

  const encodingImagery = getBodyImageryForText(encodingText, build.encodingBodyImagery ?? null);
  steps.push({
    id: "encoding",
    title: "דמיין את הקידוד",
    lines: [],
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: encodingText, imagery: encodingImagery },
  });

  steps.push({
    id: "beneficial_action",
    title: "דמיין את הפעולה המיטיבה",
    lines: [
      "דמיין שאתה מסיים את ה-Mini ARC ומתחיל לבצע:",
      actionLabel || "הפעולה המיטיבה שלך",
      "דמיין בבירור את הצעד הראשון.",
    ],
    buttonLabel: "המשך",
    bodyImagery: null,
  });

  const reinforceLines =
    mode === "with_archi"
      ? [
          `${trigger || "הטריגר שלך"} ← אני פותח את ARCHI ← אני מבצע Mini ARC ← אני מתחיל את ${actionLabel || "הפעולה המיטיבה שלי"}.`,
          `כש${trigger || "הטריגר שלך"}, אני נכנס ל-ARCHI ומתחיל את ה-Mini ARC שלי.`,
        ]
      : [
          `${trigger || "הטריגר שלך"} ← אני מתחיל Mini ARC מהזיכרון ← אני מתחיל את ${actionLabel || "הפעולה המיטיבה שלי"}.`,
          `כש${trigger || "הטריגר שלך"}, אני מתחיל את ה-Mini ARC שלי מהזיכרון.`,
        ];
  steps.push({
    id: "reinforce",
    title: "חיזוק הקישור",
    lines: reinforceLines,
    buttonLabel: "סיום Mini ARC Link",
    bodyImagery: null,
  });

  return steps;
}
