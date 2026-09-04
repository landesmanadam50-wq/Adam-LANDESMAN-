/**
 * arc/miniArc.ts
 *
 * Mini ARC task: a new, INDEPENDENT feature -- a short, fixed-structure
 * protocol for moments that need immediate support without the full ARC
 * protocol. Deliberately NOT built on ArcBuild/ArcBuildProfile/ArcStage/
 * ArcLiveState or any of the full engine's routing, dwell, or timer
 * machinery (arc/arcEngine.ts, arc/stageCopy.ts, arc/dwellTimes.ts) --
 * this module is a small, self-contained, linear sequence with its own
 * types, its own id generator, and its own copy, so nothing about the
 * full ARC protocol (BUILD questions, Presence routing, Proactive/
 * Reactive ARC, timers, program/ week logic) is touched, reused
 * incorrectly, or put at risk of regressing.
 *
 * MiniArcBuild's five fields are ALL required once saved (see
 * isMiniArcDraftComplete/buildMiniArcFromDraft) -- there is no partial/
 * legacy-migrated state to reconcile, unlike ArcBuildProfile, because
 * Mini ARC has no prior data format to be backward compatible with.
 * Display code should still never assume a stored record is
 * well-formed (data/storage.ts's loadMiniArcBuilds already guards
 * against corrupt JSON/non-array data) -- safeText below is the single
 * place a possibly-missing/malformed field is coerced to a safe,
 * displayable string, so "undefined"/"null"/"[object Object]" can never
 * reach the screen.
 */

/** Never renders "undefined"/"null"/"[object Object]" for a value that -- despite MiniArcBuild's type -- turns out missing or malformed after JSON.parse of a corrupted/legacy record. Always returns a plain, trimmed string (possibly empty). */
export function safeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

export interface MiniArcBuild {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Chosen once here, during BUILD -- never asked again during LIVE. No psychological meaning is ever assigned to it; it is only ever echoed back verbatim. */
  presenceColor: string;
  /** The ONE regulation anchor for this Mini ARC -- a short, ready-to-read instruction (e.g. "הרגש את כפות הרגליים על הקרקע."), not just a label. */
  regulationAnchor: string;
  /** One brief physical action, not a full exercise (e.g. "ליישר בעדינות את הגב"). */
  encodingAction: string;
  /** The short free-text action this Mini ARC leads to. */
  beneficialAction: string;
}

/** Same stable-id-string pattern already used for ArcBuild (arc/types.ts's generateArcBuildId) -- unique per Mini ARC, independent of array position or any full ARC id. */
export function generateMiniArcId(): string {
  return `miniarc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// List CRUD -- pure, mirrors arc/arcBuilds.ts's upsertArcBuildInList/
// deleteArcBuildFromList exactly, so the same "editing/deleting one never
// touches another, matched only by id" guarantee holds for Mini ARC too.
// ---------------------------------------------------------------------------

/** Updates the one Mini ARC matching `build.id` in place if found (every other build's own object left completely untouched), otherwise appends it as new. Never matches by name/color text, only by id. */
export function upsertMiniArcInList(builds: MiniArcBuild[], build: MiniArcBuild): MiniArcBuild[] {
  const index = builds.findIndex((existing) => existing.id === build.id);
  if (index === -1) return [...builds, build];
  return builds.map((existing, i) => (i === index ? build : existing));
}

/** Removes exactly the one Mini ARC matching `id` -- every other build is returned as the exact same object it already was. A no-op if the id doesn't match any build. */
export function deleteMiniArcFromList(builds: MiniArcBuild[], id: string): MiniArcBuild[] {
  return builds.filter((build) => build.id !== id);
}

/** A new, independent copy with a fresh unique id and adjusted name -- never shares an id with, or mutates, the original. Timestamps are both reset to now, exactly like a fresh save. */
export function duplicateMiniArc(build: MiniArcBuild, now: string): MiniArcBuild {
  return {
    ...build,
    id: generateMiniArcId(),
    name: `${build.name} (עותק)`,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// BUILD MINI ARC -- draft + validation
// ---------------------------------------------------------------------------

export interface MiniArcDraft {
  name: string;
  presenceColor: string;
  regulationAnchor: string;
  encodingAction: string;
  beneficialAction: string;
}

export function createEmptyMiniArcDraft(): MiniArcDraft {
  return { name: "", presenceColor: "", regulationAnchor: "", encodingAction: "", beneficialAction: "" };
}

export function draftFromMiniArc(build: MiniArcBuild): MiniArcDraft {
  return {
    name: safeText(build.name),
    presenceColor: safeText(build.presenceColor),
    regulationAnchor: safeText(build.regulationAnchor),
    encodingAction: safeText(build.encodingAction),
    beneficialAction: safeText(build.beneficialAction),
  };
}

/** True only once every one of the five required fields is filled in -- never allows saving a partial Mini ARC. */
export function isMiniArcDraftComplete(draft: MiniArcDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    draft.presenceColor.trim().length > 0 &&
    draft.regulationAnchor.trim().length > 0 &&
    draft.encodingAction.trim().length > 0 &&
    draft.beneficialAction.trim().length > 0
  );
}

/** Builds a real, persistable MiniArcBuild from a complete draft. Throws for an incomplete draft -- callers must gate on isMiniArcDraftComplete first (this is defense-in-depth, matching the same "never silently save incomplete data" guarantee the rest of BUILD relies on). */
export function buildMiniArcFromDraft(draft: MiniArcDraft, id: string, createdAt: string, updatedAt: string): MiniArcBuild {
  if (!isMiniArcDraftComplete(draft)) {
    throw new Error("Cannot build a MiniArcBuild from an incomplete draft");
  }
  return {
    id,
    name: draft.name.trim(),
    createdAt,
    updatedAt,
    presenceColor: draft.presenceColor.trim(),
    regulationAnchor: draft.regulationAnchor.trim(),
    encodingAction: draft.encodingAction.trim(),
    beneficialAction: draft.beneficialAction.trim(),
  };
}

// ---------------------------------------------------------------------------
// BUILD MINI ARC -- reusable preset chips (quick-fill only; every field
// stays freely editable as plain text, so any custom entry -- the
// "preserve a custom-cue option" requirement -- always works).
// ---------------------------------------------------------------------------

export const MINI_ARC_COLOR_PRESETS: string[] = ["סגול", "כחול", "ירוק", "אדום", "צהוב", "כתום", "לבן", "שחור"];

/** label = what the chip shows; instruction = what actually gets saved as the regulation anchor once tapped -- a ready-to-read instruction, per the BUILD MINI ARC spec, not just the label text. */
export const MINI_ARC_REGULATION_ANCHOR_PRESETS: { label: string; instruction: string }[] = [
  { label: "תשומת לב לכפות הרגליים", instruction: "הרגש את כפות הרגליים על הקרקע." },
  { label: "הרפיית הכתפיים", instruction: "הרפה את הכתפיים כלפי מטה." },
  { label: "נשימה טבעית", instruction: "שים לב לנשימה הטבעית שלך, בלי לשנות אותה." },
  { label: "הרחבת שדה הראייה", instruction: "הרחב בעדינות את שדה הראייה." },
];

export const MINI_ARC_ENCODING_ACTION_PRESETS: string[] = ["ליישר בעדינות את הגב", "לפתוח מעט את החזה", "להרים את הראש", "לייצב את תנוחת הגוף"];

// ---------------------------------------------------------------------------
// LIVE MINI ARC -- fixed, linear stage sequence. No branching, no rating
// inputs, no dwell/timers -- see the module doc for why this is
// deliberately its own tiny state shape rather than ArcStage/ArcLiveState.
// ---------------------------------------------------------------------------

export type MiniArcStage = "pause" | "name_state" | "regulation" | "encoding" | "imagery" | "action" | "complete";

/** The ONE fixed order -- never reordered, never branches, matching the spec's fixed structure exactly. */
export const MINI_ARC_STAGE_ORDER: MiniArcStage[] = ["pause", "name_state", "regulation", "encoding", "imagery", "action", "complete"];

/** Walks forward exactly one step; "complete" is terminal (returns itself) -- there is nothing after it, and this sequence never loops back. */
export function getNextMiniArcStage(stage: MiniArcStage): MiniArcStage {
  const index = MINI_ARC_STAGE_ORDER.indexOf(stage);
  if (index === -1 || index === MINI_ARC_STAGE_ORDER.length - 1) return "complete";
  return MINI_ARC_STAGE_ORDER[index + 1];
}

export interface MiniArcStageCopy {
  title: string;
  body: string;
  /** A second, visually-separate line for stages that show two distinct sentences (e.g. imagery's "see yourself starting: X" after its own observer-perspective line). null when the stage has only one body line. */
  secondaryBody: string | null;
  /** Illustrative examples shown as a small helper line under the instruction -- currently only "name_state" ("דחף", "עייפות", "לחץ", "פיזור"), never a preset the trainee is required to pick from. null when the stage has no examples. */
  hint: string | null;
  buttonLabel: string;
}

/** The persistent top line, visible from the initial pause through completion -- always the CURRENT build's own saved color, never hard-coded, never invented when (defensively) absent. */
export function getMiniArcPersistentColorLine(build: MiniArcBuild): string {
  const color = safeText(build.presenceColor);
  return color ? `צבע הנוכחות שלך: ${color}` : "צבע הנוכחות שלך";
}

/**
 * Pure stage -> copy mapping, the ONE place LIVE MINI ARC's text lives.
 * The free text entered live at "name_state" (never predetermined
 * during BUILD, never a rating) is kept only as local component state
 * in live/MiniArcLiveScreen.tsx -- no fixed stage after it is required
 * to echo it back, matching the spec.
 */
export function getMiniArcStageCopy(stage: MiniArcStage, build: MiniArcBuild): MiniArcStageCopy {
  const color = safeText(build.presenceColor);

  switch (stage) {
    case "pause":
      return { title: "עצירה", body: "עצור לרגע את התגובה האוטומטית.", secondaryBody: null, hint: null, buttonLabel: "אני כאן" };

    case "name_state":
      return {
        title: "מה נמצא עכשיו?",
        body: "כתוב בקצרה את התחושה, הדחף או המצב שנמצאים עכשיו.",
        secondaryBody: null,
        hint: "לדוגמה: דחף, עייפות, לחץ, פיזור",
        buttonLabel: "המשך",
      };

    case "regulation": {
      const anchor = safeText(build.regulationAnchor);
      const colorLine = color ? `הצבע שבחרת, ${color}, ממשיך ללוות אותך.` : null;
      return { title: "עוגן ויסות", body: anchor, secondaryBody: colorLine, hint: null, buttonLabel: "המשך" };
    }

    case "encoding": {
      const action = safeText(build.encodingAction);
      const colorLine = color
        ? `הישאר בתנוחה הזאת לרגע, כשהצבע שבחרת, ${color}, ממשיך למלא את הנוכחות שלך.`
        : "הישאר בתנוחה הזאת לרגע.";
      return { title: "פעולת קידוד קצרה", body: action, secondaryBody: colorLine, hint: null, buttonLabel: "המשך" };
    }

    case "imagery": {
      const observerLine = color
        ? `לרגע אחד, ראה את עצמך מהצד בתנוחה שבחרת, כשהצבע שבחרת, ${color}, ממשיך ללוות אותך.`
        : "לרגע אחד, ראה את עצמך מהצד בתנוחה שבחרת.";
      const action = safeText(build.beneficialAction);
      return {
        title: "ראה את עצמך מהצד",
        body: observerLine,
        secondaryBody: action ? `ראה את עצמך מתחיל: ${action}` : null,
        hint: null,
        buttonLabel: "המשך לפעולה",
      };
    }

    case "action": {
      const action = safeText(build.beneficialAction);
      return {
        title: "פעולה מיטיבה",
        body: action ? `עכשיו: ${action}` : "עכשיו: הפעולה המיטיבה שלך.",
        secondaryBody: "קח איתך את צבע הנוכחות ואת שפת הגוף אל הפעולה.",
        hint: null,
        buttonLabel: "אני מתחיל לפעול",
      };
    }

    case "complete":
      return { title: "סיום", body: "יצרת מרווח ובחרת פעולה.", secondaryBody: null, hint: null, buttonLabel: "סיום" };
  }
}
