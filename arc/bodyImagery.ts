/**
 * arc/bodyImagery.ts
 *
 * ARC Link / Mini ARC Link task: shared, pure helpers used by BOTH new
 * rehearsal modes -- never imported by normal ARC, normal Mini ARC,
 * Proactive/Reactive ARC, Presence routing, timers, Success Focus,
 * Gratitude, or Negative Action, none of which read anything from this
 * file.
 *
 * BodyImagery is small, optional metadata attached to a regulation
 * anchor or encoding action: which body parts are involved and a short
 * imagery instruction. It is NEVER required -- a build/Mini ARC saved
 * before this feature existed simply has no BodyImagery anywhere, and
 * getBodyImageryForText below always produces a safe, displayable
 * result regardless (a known preset's own rich imagery, the trainee's
 * own saved custom imagery, or a generic fallback -- never a crash,
 * never "undefined"/"null").
 *
 * ArcLinkSettings is the ONLY Link-specific data stored on an
 * ArcBuildProfile/MiniArcBuild -- everything else a Link flow shows
 * (stage content, regulation/encoding text, actions, Presence Color)
 * is read directly from the linked protocol's own existing fields at
 * render time (see arc/arcLink.ts / arc/miniArcLink.ts), never copied
 * into a second, independent configuration.
 */

export interface BodyImagery {
  bodyParts: string[];
  imageryText: string;
}

export type ArcLinkTriggerType = "time" | "after_action" | "context" | "custom";

/**
 * Link-specific settings for ONE ARC or Mini ARC protocol -- a
 * reference-style companion to the protocol, never a copy of it.
 * Different protocols keep different triggers (data/storage.ts's own
 * "editing one build never touches another" guarantee already covers
 * this, since linkSettings lives directly on that protocol's own
 * record). Missing (undefined/null) is always treated as disabled,
 * exactly like a build saved before this feature existed.
 */
export interface ArcLinkSettings {
  enabled: boolean;
  triggerType: ArcLinkTriggerType;
  triggerText: string;
}

export function createEmptyArcLinkSettings(): ArcLinkSettings {
  return { enabled: false, triggerType: "time", triggerText: "" };
}

/** True only when a real, usable trigger is saved AND explicitly enabled -- never true for a blank/whitespace-only trigger, never true for a merely-present-but-disabled settings record. This is the ONE gate the entry-selection screens (build/LiveModeSelectScreen.tsx, build/MiniArcModeSelectScreen.tsx) use to decide whether to show/enable the Link option. */
export function hasConfiguredTrigger(settings: ArcLinkSettings | null | undefined): boolean {
  return !!settings && settings.enabled === true && typeof settings.triggerText === "string" && settings.triggerText.trim().length > 0;
}

/** Safe, defensive read of the saved trigger text -- never "undefined"/"null" even for a malformed/legacy record. */
export function safeTriggerText(settings: ArcLinkSettings | null | undefined): string {
  if (!settings || typeof settings.triggerText !== "string") return "";
  return settings.triggerText.trim();
}

export const ARC_LINK_TRIGGER_TYPE_LABELS: Record<ArcLinkTriggerType, string> = {
  time: "שעה קבועה",
  after_action: "לאחר פעולה קבועה",
  context: "מצב או הקשר מסוים",
  custom: "טריגר מותאם אישית",
};

// ---------------------------------------------------------------------------
// Body imagery derivation
// ---------------------------------------------------------------------------

/** Never invents meaning -- a plain, safe, always-displayable fallback when neither a known preset nor a saved custom imagery is available. actionLabel (the trainee's own saved text) is echoed back verbatim when present, never replaced by a generic description of it. */
export function getGenericBodyImagery(actionLabel: string | null | undefined): BodyImagery {
  const trimmed = (actionLabel ?? "").trim();
  return {
    bodyParts: [],
    imageryText: trimmed
      ? `דמיין שאתה מבצע את הפעולה הזו במלואה, בקצב טבעי ונוח: ${trimmed}.`
      : "דמיין שאתה מבצע את הפעולה הזו במלואה, בקצב טבעי ונוח.",
  };
}

/**
 * Known preset body imagery, keyed by the EXACT saved instruction text
 * -- covers Mini ARC's own predefined regulation-anchor/encoding-action
 * presets (arc/miniArc.ts's MINI_ARC_REGULATION_ANCHOR_PRESETS/
 * MINI_ARC_ENCODING_ACTION_PRESETS) plus the two named examples from
 * the ARC Link spec itself (belly_breathing, straight_back). A build
 * whose saved regulationTool/regulationAnchor or encoding text happens
 * to match one of these strings gets rich body imagery automatically,
 * with zero new BUILD questions -- "derive body imagery from the
 * existing option ID when possible" (matched here by its saved TEXT,
 * since that's what ArcBuildProfile/MiniArcBuild actually persist, not
 * a separate preset id).
 */
const KNOWN_BODY_IMAGERY: { matchText: string; bodyImagery: BodyImagery }[] = [
  {
    matchText: "הרגש את כפות הרגליים על הקרקע.",
    bodyImagery: { bodyParts: ["כפות הרגליים"], imageryText: "דמיין שאתה מרגיש את כפות הרגליים נוגעות בקרקע, יציבות ותומכות." },
  },
  {
    matchText: "הרפה את הכתפיים כלפי מטה.",
    bodyImagery: { bodyParts: ["הכתפיים"], imageryText: "דמיין את הכתפיים משתחררות ויורדות בעדינות כלפי מטה." },
  },
  {
    matchText: "שים לב לנשימה הטבעית שלך, בלי לשנות אותה.",
    bodyImagery: { bodyParts: ["האף", "הבטן"], imageryText: "דמיין שאתה שם לב לנשימה הטבעית שלך, נכנסת ויוצאת, בלי לשנות אותה." },
  },
  {
    matchText: "הרחב בעדינות את שדה הראייה.",
    bodyImagery: { bodyParts: ["העיניים"], imageryText: "דמיין את שדה הראייה שלך מתרחב בעדינות סביבך." },
  },
  {
    // spec's own "belly_breathing" example
    matchText: "נשימה דרך הבטן",
    bodyImagery: {
      bodyParts: ["האף", "הבטן"],
      imageryText: "דמיין שאתה מכניס אוויר בעדינות דרך האף. דמיין את הבטן מתרחבת בשאיפה ויורדת ברכות בנשיפה.",
    },
  },
  {
    matchText: "ליישר בעדינות את הגב",
    bodyImagery: {
      bodyParts: ["הגב", "עמוד השדרה"],
      imageryText: "דמיין את הגב מתיישר בהדרגה ואת עמוד השדרה מתארך. דמיין את הכתפיים מתמקמות בצורה טבעית.",
    },
  },
  {
    // spec's own "straight_back" example
    matchText: "יישור הגב",
    bodyImagery: {
      bodyParts: ["הגב", "עמוד השדרה"],
      imageryText: "דמיין את הגב מתיישר בהדרגה ואת עמוד השדרה מתארך. דמיין את הכתפיים מתמקמות בצורה טבעית.",
    },
  },
  {
    matchText: "לפתוח מעט את החזה",
    bodyImagery: { bodyParts: ["החזה"], imageryText: "דמיין את החזה נפתח מעט, בעדינות ובלי מאמץ." },
  },
  {
    matchText: "להרים את הראש",
    bodyImagery: { bodyParts: ["הראש", "הצוואר"], imageryText: "דמיין את הראש מתרומם בעדינות, בקו ישר עם הצוואר." },
  },
  {
    matchText: "לייצב את תנוחת הגוף",
    bodyImagery: { bodyParts: ["הגוף"], imageryText: "דמיין את תנוחת הגוף שלך מתייצבת, מאוזנת ותומכת." },
  },
];

/** True only for a real, non-blank, non-empty BodyImagery -- guards against a malformed/legacy record whose bodyImagery field parsed into an empty shell. */
function isUsableBodyImagery(imagery: BodyImagery | null | undefined): imagery is BodyImagery {
  return !!imagery && typeof imagery.imageryText === "string" && imagery.imageryText.trim().length > 0;
}

/**
 * The ONE lookup both ARC Link and Mini ARC Link use for a regulation
 * anchor OR an encoding action (same shape, same precedence, so this
 * one function covers both -- see the module doc). Precedence: (1) an
 * exact match against a known preset's saved instruction text, (2) the
 * trainee's own saved custom body imagery for THIS protocol, (3) a
 * safe generic fallback that always displays without a crash or an
 * invented meaning.
 */
export function getBodyImageryForText(savedText: string | null | undefined, custom: BodyImagery | null | undefined): BodyImagery {
  const trimmed = typeof savedText === "string" ? savedText.trim() : "";
  if (trimmed) {
    const preset = KNOWN_BODY_IMAGERY.find((entry) => entry.matchText === trimmed);
    if (preset) return preset.bodyImagery;
  }
  if (isUsableBodyImagery(custom)) return custom;
  return getGenericBodyImagery(trimmed || null);
}

/** Builds a BodyImagery from the two short custom BUILD fields (comma/newline-separated body parts + a free-text movement description) -- null when both are blank, so an unanswered custom-imagery step never produces an empty, misleading object. */
export function bodyImageryFromCustomFields(bodyPartsText: string, movementText: string): BodyImagery | null {
  const bodyParts = bodyPartsText
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const imageryText = movementText.trim();
  if (bodyParts.length === 0 && imageryText.length === 0) return null;
  return { bodyParts, imageryText };
}
