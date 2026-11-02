/**
 * arc/reactiveFactorChooser.ts
 *
 * Productivity roadmap, Stage L: the reactive entry's deterministic
 * routing -- "what is interfering right now?" The trainee picks one of
 * 9 fixed categories (an exhaustive discriminated union, never free
 * text, never classified) and this module decides, as a pure function,
 * which screen handles it. No React, no storage, no navigation.
 */

export type InterferingFactorCategory =
  | "urge"
  | "emotion"
  | "thought"
  | "belief"
  | "presence"
  | "energy"
  | "taskTooLarge"
  | "externalInterruption"
  | "unknown";

export const INTERFERING_FACTOR_CATEGORIES: InterferingFactorCategory[] = [
  "urge",
  "emotion",
  "thought",
  "belief",
  "presence",
  "energy",
  "taskTooLarge",
  "externalInterruption",
  "unknown",
];

export const INTERFERING_FACTOR_CATEGORY_LABELS: Record<InterferingFactorCategory, string> = {
  urge: "דחף לעשות משהו אחר",
  emotion: "רגש או תחושה גופנית לא נוחה",
  thought: "מחשבה",
  belief: "אמונה",
  presence: "חוסר נוכחות או ריכוז",
  energy: "אנרגיה נמוכה",
  taskTooLarge: "המשימה גדולה מדי או לא ברורה",
  externalInterruption: "הפרעה חיצונית",
  unknown: "לא יודע",
};

/**
 * Where each category's own screen lives -- an exhaustive switch (TS
 * enforces every InterferingFactorCategory is handled) over a plain
 * discriminated union, never a chain of string comparisons. Every
 * destination kind named here has a REAL screen by the time this
 * module routes to it (see each kind's own route for which stage built
 * it): "savedFactorChooser" (Stages P/R/S, params.factorKind selects
 * urge/thought/belief), "emotionIdentification" (Stage M),
 * "presenceProtocol"/"lowEnergy"/"practicalTaskSupport"/
 * "externalInterruption" (Stage U), "neutralRegulation" (Stage O).
 */
export type ReactiveFactorDestination =
  | { kind: "savedFactorChooser"; factorKind: "urge" | "thought" | "belief" }
  | { kind: "emotionIdentification" }
  | { kind: "presenceProtocol" }
  | { kind: "lowEnergy" }
  | { kind: "practicalTaskSupport" }
  | { kind: "externalInterruption" }
  | { kind: "neutralRegulation" };

export function resolveReactiveFactorDestination(category: InterferingFactorCategory): ReactiveFactorDestination {
  switch (category) {
    case "urge":
      return { kind: "savedFactorChooser", factorKind: "urge" };
    case "emotion":
      return { kind: "emotionIdentification" };
    case "thought":
      return { kind: "savedFactorChooser", factorKind: "thought" };
    case "belief":
      return { kind: "savedFactorChooser", factorKind: "belief" };
    case "presence":
      return { kind: "presenceProtocol" };
    case "energy":
      return { kind: "lowEnergy" };
    case "taskTooLarge":
      return { kind: "practicalTaskSupport" };
    case "externalInterruption":
      return { kind: "externalInterruption" };
    case "unknown":
      return { kind: "neutralRegulation" };
  }
}
