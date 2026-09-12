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
import { resolveMiniArcProtocolKind, safeText } from "./miniArc.ts";
import type { ArcMiniProtocolKind, MiniArcBuild } from "./miniArc.ts";
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
  | "reinforce"
  /** Coherent-architecture task (#22/#24 "With ARCHI"): the short ending used ONLY in "with_archi" mode -- see buildMiniArcLinkStartConfirmationStep's own doc. */
  | "archi_start_confirmation"
  /** Protocol-specific ARC Mini Link rehearsal task (spec section 6): the "preventive or attention response" step -- Urge/State kinds' own preventive stopping/response action. */
  | "preventive_response"
  /** Protocol-specific ARC Mini Link rehearsal task: Belief Mini's own Bridge Mantra step, rehearsed right after recognizing the belief, before the replacement belief. */
  | "bridge_mantra";

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

/**
 * Coherent-architecture task (#22/#24 "With ARCHI"): "With ARCHI,
 * Mini ARC Link should finish after imagining opening ARCHI, selecting
 * the correct Mini ARC and pressing Start" -- never the full Presence
 * Color / naming / regulation / encoding / beneficial-action sequence,
 * which only without_archi mode rehearses. Used by the Routine-page
 * Practice flow (live/MiniArcLinkScreen.tsx) as the step appended
 * right after intro/trigger/enter_archi in with_archi mode, in place
 * of the rest of buildMiniArcLinkSteps' own sequence -- that function
 * itself is untouched and still produces its full sequence regardless
 * of mode (its own with_archi reinforce wording included), the same
 * caller-level, additive relationship arc/arcLink.ts's
 * buildArcLinkStartConfirmationStep has with buildArcLinkProtocolSteps.
 */
export function buildMiniArcLinkStartConfirmationStep(ctx: MiniArcLinkRehearsalContext = {}): MiniArcLinkStep {
  const trigger = (ctx.triggerText ?? "").trim();
  return {
    id: "archi_start_confirmation",
    title: "דמיין שאתה לוחץ על התחלה",
    lines: [
      "דמיין את עצמך לוחץ על הכפתור ומתחיל את ה-Mini ARC.",
      "מכאן, ARCHI ידריך אותך דרך התהליך המדויק שלך.",
      `כש${trigger || "הטריגר שלך"}, אני נכנס ל-ARCHI ומתחיל את ה-Mini ARC שלי.`,
    ],
    buttonLabel: "סיום Mini ARC Link",
    bodyImagery: null,
  };
}

// ---------------------------------------------------------------------------
// Protocol-specific ARC Mini Link rehearsal (spec section 6): a separate,
// SHORTER content builder per ArcMiniProtocolKind -- reuses the same
// MiniArcLinkStep shape and the same intro/trigger/beneficial_action/
// reinforce framing as buildMiniArcLinkSteps above, but never its middle
// content (no presence_color/name_state/regulation/encoding sequence,
// which is that function's own generic-Mini-ARC content). Never adds
// full Stay/Acceptance/Presence rating/Success Focus/Gratitude -- every
// builder below is exactly the "General rehearsal" template from spec
// section 6, customized per kind.
// ---------------------------------------------------------------------------

interface ProtocolMiniArcLinkPieces {
  /** The step shown for "imagine recognizing the trigger" -- kind-specific title/line. */
  recognitionLine: string;
  /** null when this kind has no preventive/attention response step (spec: only urge REQUIRES it; state has it "if configured"; thought/presence/belief never show this step at all). */
  preventiveResponseLine: string | null;
  regulationAnchorLabel: string;
  regulationBodyImagery: BodyImagery | null;
  /** null when this kind's own Bridge Mantra step doesn't apply (belief only). */
  bridgeMantraLine: string | null;
  encodingTitle: string;
  encodingLines: string[];
}

function resolvePiecesForKind(kind: ArcMiniProtocolKind, build: MiniArcBuild): ProtocolMiniArcLinkPieces {
  const regulationText = safeText(build.regulationAnchor);
  const regulationImagery = getBodyImageryForText(regulationText, build.regulationBodyImagery ?? null);
  const preventive = safeText(build.preventiveStoppingAction);

  switch (kind) {
    case "state":
      return {
        recognitionLine: "דמיין שאתה שם לב בקצרה למצב הפנימי שנמצא עכשיו.",
        preventiveResponseLine: preventive.length > 0 ? preventive : null,
        regulationAnchorLabel: regulationText,
        regulationBodyImagery: regulationImagery,
        bridgeMantraLine: null,
        encodingTitle: "דמיין את רמז המצב הרצוי",
        encodingLines: [safeText(build.encodingAction) || "רמז המצב הרצוי שהגדרת"],
      };
    case "urge": {
      const representation = build.representationPreference ?? "decide_in_live";
      const representationLine =
        representation === "visual"
          ? "דמיין התאמה קלה של הדימוי שכבר נמצא."
          : representation === "bodily"
            ? "אפשר לתחושה הרצויה להתפשט בהדרגה לצד התחושה שכבר קיימת."
            : representation === "both"
              ? "דמיין התאמה קלה של הדימוי, ואפשר לתחושה הרצויה להתפשט לצד התחושה שכבר קיימת."
              : "דמיין את ההתאמה שמתאימה לך יותר -- בדימוי או בתחושת הגוף.";
      return {
        recognitionLine: "דמיין שאתה שם לב בקצרה לדחף שנמצא עכשיו, בלי להעצים אותו ובלי להילחם בו.",
        preventiveResponseLine: preventive.length > 0 ? preventive : "דמיין פעולת עצירה קצרה שיוצרת מרחק מהדחף.",
        regulationAnchorLabel: regulationText,
        regulationBodyImagery: regulationImagery,
        bridgeMantraLine: null,
        encodingTitle: "דמיין את הקידוד המותאם לדחף",
        encodingLines: [representationLine],
      };
    }
    case "thought":
      return {
        recognitionLine: "דמיין שאתה שם לב בקצרה למחשבה שנמצאת עכשיו, בלי להתווכח איתה.",
        preventiveResponseLine: null,
        regulationAnchorLabel: regulationText,
        regulationBodyImagery: regulationImagery,
        bridgeMantraLine: null,
        encodingTitle: "דמיין את המחשבה התומכת",
        encodingLines: [safeText(build.supportiveThought) || "המחשבה התומכת שהגדרת"],
      };
    case "presence":
      return {
        recognitionLine: "דמיין שאתה שם לב לרגע הנוכחי, ומאפשר לנשימה להמשיך בחופשיות בלי לנסות לשנות אותה.",
        preventiveResponseLine: null,
        regulationAnchorLabel: regulationText,
        regulationBodyImagery: regulationImagery,
        bridgeMantraLine: null,
        encodingTitle: "דמיין את צבע הנוכחות",
        encodingLines: [safeText(build.presenceColor) || "צבע הנוכחות שבחרת"],
      };
    case "belief":
      return {
        recognitionLine: "דמיין שאתה מזהה בקצרה שיש בך כרגע את האמונה הזאת, בלי להתייחס אליה כאל אמת.",
        preventiveResponseLine: null,
        regulationAnchorLabel: regulationText,
        regulationBodyImagery: regulationImagery,
        bridgeMantraLine: safeText(build.bridgeMantraText) || null,
        encodingTitle: "דמיין את האמונה התומכת",
        encodingLines: [safeText(build.replacementBelief) || "האמונה התומכת שהגדרת"],
      };
  }
}

/**
 * Protocol-specific ARC Mini Link rehearsal task (spec section 6): the
 * kind-aware entry point -- reads resolveMiniArcProtocolKind(build) and
 * builds the matching SHORT rehearsal ("General rehearsal" template,
 * customized per kind). "generic" (every Mini ARC saved before
 * protocolKind existed, or genuinely built as a standalone one) falls
 * straight through to buildMiniArcLinkSteps above -- this function never
 * changes that existing, unmodified behavior. Never adds full Stay/
 * Acceptance/Presence rating/Success Focus/Gratitude for any kind.
 */
export function buildProtocolSpecificMiniArcLinkSteps(build: MiniArcBuild, ctx: MiniArcLinkRehearsalContext = {}): MiniArcLinkStep[] {
  const kind = resolveMiniArcProtocolKind(build);
  if (kind === "generic") return buildMiniArcLinkSteps(build, ctx);

  const trigger = (ctx.triggerText ?? safeTriggerText(build.linkSettings)).trim();
  const mode: ArcLinkMode = ctx.mode ?? "with_archi";
  const actionLabel = safeText(build.beneficialAction);
  const pieces = resolvePiecesForKind(kind, build);

  const steps: MiniArcLinkStep[] = [
    {
      id: "intro",
      title: "Mini ARC Link",
      lines: ["בתרגול הקצר הזה תחזק את הקישור בין הטריגר שלך לבין התגובה המיועדת שלך."],
      buttonLabel: "התחלת התרגול",
      bodyImagery: null,
    },
    {
      id: "trigger",
      title: "דמיין את הטריגר",
      lines: [trigger || "הטריגר שהגדרת"],
      buttonLabel: "דמיינתי את הטריגר",
      bodyImagery: null,
    },
  ];

  if (mode === "with_archi") {
    steps.push({
      id: "enter_archi",
      title: "דמיין את הכניסה ל-ARCHI",
      lines: ["דמיין שאתה פותח את ARCHI ובוחר את ה-Mini ARC שלך."],
      buttonLabel: "נכנסתי ל-ARCHI בדמיון",
      bodyImagery: null,
    });
  }

  steps.push({ id: "name_state", title: "זיהוי קצר", lines: [pieces.recognitionLine], buttonLabel: "המשך", bodyImagery: null });

  if (pieces.preventiveResponseLine) {
    steps.push({ id: "preventive_response", title: "תגובת עצירה", lines: [pieces.preventiveResponseLine], buttonLabel: "המשך", bodyImagery: null });
  }

  steps.push({
    id: "regulation",
    title: "דמיין את הוויסות",
    lines: [],
    buttonLabel: "המשך",
    bodyImagery: { anchorLabel: pieces.regulationAnchorLabel, imagery: pieces.regulationBodyImagery ?? getBodyImageryForText(pieces.regulationAnchorLabel, null) },
  });

  if (pieces.bridgeMantraLine) {
    steps.push({ id: "bridge_mantra", title: "גשר המנטרה", lines: [pieces.bridgeMantraLine], buttonLabel: "המשך", bodyImagery: null });
  }

  steps.push({ id: "encoding", title: pieces.encodingTitle, lines: pieces.encodingLines, buttonLabel: "המשך", bodyImagery: null });

  steps.push({
    id: "beneficial_action",
    title: "דמיין את הפעולה",
    lines: [`דמיין שאתה מתחיל מיד ב${actionLabel || "הפעולה המיועדת שלך"}.`],
    buttonLabel: "המשך",
    bodyImagery: null,
  });

  steps.push({
    id: "reinforce",
    title: "חיזוק הקישור",
    lines: [`כש${trigger || "הטריגר שלך"}, אני מתחיל מיד ב${actionLabel || "הפעולה המיועדת שלי"}.`],
    buttonLabel: "סיום Mini ARC Link",
    bodyImagery: null,
  });

  return steps;
}
