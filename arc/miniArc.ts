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

import { bodyImageryFromCustomFields } from "./bodyImagery.ts";
import type { ArcLinkSettings, BodyImagery } from "./bodyImagery.ts";
import type { UrgeRepresentationPreference } from "./types.ts";

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
  /**
   * ARC Link task: this ONE Mini ARC's own optional trigger + Mini ARC
   * Link enablement -- parallel to ArcBuildProfile.linkSettings, never
   * read by normal Mini ARC LIVE. Optional so every existing MiniArcBuild
   * object literal keeps compiling unchanged; missing/undefined is
   * always disabled (arc/bodyImagery.ts's hasConfiguredTrigger).
   */
  linkSettings?: ArcLinkSettings | null;
  /** ARC Link task: optional custom body-imagery metadata for regulationAnchor -- used only by Mini ARC Link's regulation imagery step. */
  regulationBodyImagery?: BodyImagery | null;
  /** ARC Link task: optional custom body-imagery metadata for encodingAction -- used only by Mini ARC Link's encoding imagery step. */
  encodingBodyImagery?: BodyImagery | null;
  /**
   * ARC Mini for every protocol task (spec section 5): which independent
   * full protocol this Mini ARC is the SHORT counterpart of -- "state"/
   * "urge"/"thought"/"presence"/"belief". null/undefined (every
   * MiniArcBuild saved before this field existed, and any Mini ARC the
   * trainee built as a genuinely standalone/general one) means a plain,
   * generic Mini ARC exactly as this app has always had -- never
   * reinterpreted as belonging to one specific protocol. See
   * resolveMiniArcProtocolKind.
   */
  protocolKind?: ArcMiniProtocolKind | null;
  /**
   * Build ARC Mini together with full ARC task (spec section 9): the id
   * of the full protocol this Mini ARC was created FROM/linked to, when
   * any -- a reference only, never a copy of its content (same
   * "reference, never duplicate" convention as ArcLink.protocolId).
   * Named for the common case (an ArcBuild id, the "State" full
   * protocol), but a Mini ARC whose protocolKind is "urge" references a
   * UrgeArc id here instead -- Urge's own full protocol has no
   * ArcBuild-shaped BUILD entity of its own (arc/urgeArcs.ts). Callers
   * resolve the id against the collection matching this Mini's own
   * protocolKind. null/undefined means a standalone Mini ARC with no
   * parent full protocol (either built before this relationship
   * existed, or deliberately created independently) -- preserved
   * exactly as-is, never invalidated, and may be linked to a parent
   * later (see linkMiniArcToParent). Never silently inferred: only ever
   * set by an explicit "בניית ARC Mini" action or an explicit later
   * linking action.
   */
  parentArcBuildId?: string | null;
  /**
   * Protocol-specific ARC Mini Link rehearsal task (spec section 6):
   * fields meaningful only for a matching protocolKind, reused across
   * rehearsal content instead of the generic four fields above where no
   * generic field fits (regulationAnchor/encodingAction/beneficialAction/
   * presenceColor already double as each kind's own "one Regulation
   * anchor"/"one Encoding action"/beneficial action/Presence cue -- see
   * arc/miniArcLink.ts's per-kind builders for the exact mapping).
   * Optional and ignored for "generic"/any non-matching kind; a
   * protocolKind that needs one of these but doesn't have it configured
   * falls back to safe generic wording, never "undefined".
   */
  /** Urge Mini (required by spec) / State Mini (only "if configured"): the preventive stopping/response action. */
  preventiveStoppingAction?: string | null;
  /** Urge Mini: BUILD-configured representation preference, reusing arc/types.ts's UrgeRepresentationPreference -- decides which representation-based Encoding line arc/miniArcLink.ts's Urge builder shows. */
  representationPreference?: UrgeRepresentationPreference | null;
  /** Thought Mini: the supportive replacement thought rehearsed after recognition. */
  supportiveThought?: string | null;
  /** Belief Mini: the supportive/replacement belief rehearsed after the Bridge Mantra. */
  replacementBelief?: string | null;
  /** Belief Mini: this Mini's own Bridge Mantra text, rehearsed right after recognizing the belief -- never replaces replacementBelief, exactly like the full protocol's own Bridge Mantra never replaces the new supportive belief (arc/mantras.ts's own doc). */
  bridgeMantraText?: string | null;
}

/**
 * ARC Mini for every protocol task (spec section 5): the five
 * independent full protocols that may each have their own short Mini
 * counterpart. Deliberately NOT a DevelopmentLayer (state/identity/
 * habit, an ENCODING TARGET) and NOT a LiveProtocolKind member on its
 * own naming -- this specifically tags a MiniArcBuild record, never an
 * ArcLiveState/session.
 */
export type ArcMiniProtocolKind = "state" | "urge" | "thought" | "presence" | "belief";

/** Safe resolver, mirroring arc/routineLinks.ts's resolveArcLinkKind-style pattern -- "generic" (this app's original, undifferentiated Mini ARC) for every record that predates protocolKind or was never given one. Never guesses a protocol from other fields. */
export function resolveMiniArcProtocolKind(build: Pick<MiniArcBuild, "protocolKind">): ArcMiniProtocolKind | "generic" {
  const kind = build.protocolKind;
  return kind === "state" || kind === "urge" || kind === "thought" || kind === "presence" || kind === "belief" ? kind : "generic";
}

/**
 * Build ARC Mini together with full ARC task: the safe resolver for
 * parentArcBuildId -- null for every legacy/standalone Mini ARC, never
 * throws, never assumes the referenced ArcBuild still exists (a caller
 * that needs the actual parent record must still look it up and handle
 * "not found" itself, exactly like ArcLink.protocolId's own callers
 * already do).
 */
export function resolveMiniArcParentId(build: Pick<MiniArcBuild, "parentArcBuildId">): string | null {
  return build.parentArcBuildId ?? null;
}

/**
 * Build ARC Mini together with full ARC task: links a standalone (or
 * already-linked) Mini ARC to a full ArcBuild -- "Allow it to be linked
 * to a full ARC later" (spec section 11). Pure, never mutates the
 * input; the caller persists the result. Never touches any other field
 * -- linking never silently overwrites a customized regulationAnchor/
 * encodingAction/etc.
 */
export function linkMiniArcToParent(build: MiniArcBuild, parentArcBuildId: string): MiniArcBuild {
  return { ...build, parentArcBuildId };
}

/**
 * Build ARC Mini together with full ARC task: a pre-filled MiniArcDraft
 * for "בניית ARC Mini", seeded from whichever COMPATIBLE parent values
 * the caller already resolved (name/regulation anchor/encoding action/
 * beneficial action/presence color -- spec section 9's own list).
 * Deliberately takes plain strings, not an ArcBuildProfile/UrgeArc,
 * keeping this module independent of either type's own shape (arc/
 * miniArc.ts stays "deliberately NOT built on ArcBuildProfile" -- see
 * this file's own module doc); each protocol's own BUILD screen resolves
 * which of ITS fields map to these positions. Never copies the entire
 * parent protocol -- only these five short-form fields, and the
 * trainee still edits/replaces any of them before saving (this is a
 * starting point, never a forced value).
 */
export function createLinkedMiniArcDraft(
  parentName: string,
  presenceColor: string,
  regulationAnchor: string,
  encodingAction: string,
  beneficialAction: string
): MiniArcDraft {
  const trimmedParentName = parentName.trim();
  return {
    ...createEmptyMiniArcDraft(),
    name: trimmedParentName.length > 0 ? `${trimmedParentName} — גרסה קצרה` : "",
    presenceColor: presenceColor.trim(),
    regulationAnchor: regulationAnchor.trim(),
    encodingAction: encodingAction.trim(),
    beneficialAction: beneficialAction.trim(),
  };
}

/**
 * Inheritance and editing task (spec section 11): "Allow selected Mini
 * fields to be refreshed from the parent" -- merges ONLY the fields the
 * caller explicitly passes in `updates`, leaving every other field
 * (including any the trainee has since customized) completely
 * untouched. Never called automatically on a parent edit -- refreshing
 * is always an explicit, selective trainee action, never a silent
 * overwrite.
 */
export function refreshMiniArcFieldsFromParent(
  build: MiniArcBuild,
  updates: Partial<Pick<MiniArcBuild, "name" | "presenceColor" | "regulationAnchor" | "encodingAction" | "beneficialAction">>
): MiniArcBuild {
  return { ...build, ...updates };
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
  /** ARC Link task: draft fields for the optional trigger -- see MiniArcBuild.linkSettings. */
  linkTriggerType: ArcLinkSettings["triggerType"];
  linkTriggerText: string;
  /** ARC Link task: the two short custom-imagery fields (comma-separated body parts + a free-text movement description), only ever used when the saved regulationAnchor/encodingAction text doesn't match a known preset -- see arc/bodyImagery.ts's bodyImageryFromCustomFields. */
  regulationBodyParts: string;
  regulationMovementText: string;
  encodingBodyParts: string;
  encodingMovementText: string;
}

export function createEmptyMiniArcDraft(): MiniArcDraft {
  return {
    name: "",
    presenceColor: "",
    regulationAnchor: "",
    encodingAction: "",
    beneficialAction: "",
    linkTriggerType: "time",
    linkTriggerText: "",
    regulationBodyParts: "",
    regulationMovementText: "",
    encodingBodyParts: "",
    encodingMovementText: "",
  };
}

export function draftFromMiniArc(build: MiniArcBuild): MiniArcDraft {
  return {
    name: safeText(build.name),
    presenceColor: safeText(build.presenceColor),
    regulationAnchor: safeText(build.regulationAnchor),
    encodingAction: safeText(build.encodingAction),
    beneficialAction: safeText(build.beneficialAction),
    linkTriggerType: build.linkSettings?.triggerType ?? "time",
    linkTriggerText: safeText(build.linkSettings?.triggerText),
    regulationBodyParts: (build.regulationBodyImagery?.bodyParts ?? []).join(", "),
    regulationMovementText: safeText(build.regulationBodyImagery?.imageryText),
    encodingBodyParts: (build.encodingBodyImagery?.bodyParts ?? []).join(", "),
    encodingMovementText: safeText(build.encodingBodyImagery?.imageryText),
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

/** Builds a real, persistable MiniArcBuild from a complete draft. Throws for an incomplete draft -- callers must gate on isMiniArcDraftComplete first (this is defense-in-depth, matching the same "never silently save incomplete data" guarantee the rest of BUILD relies on). The Link trigger and custom body imagery are always OPTIONAL on top of the five required fields -- an empty trigger simply means Mini ARC Link stays unavailable for this build (never blocks saving the Mini ARC itself). */
export function buildMiniArcFromDraft(draft: MiniArcDraft, id: string, createdAt: string, updatedAt: string): MiniArcBuild {
  if (!isMiniArcDraftComplete(draft)) {
    throw new Error("Cannot build a MiniArcBuild from an incomplete draft");
  }
  const triggerText = draft.linkTriggerText.trim();
  return {
    id,
    name: draft.name.trim(),
    createdAt,
    updatedAt,
    presenceColor: draft.presenceColor.trim(),
    regulationAnchor: draft.regulationAnchor.trim(),
    encodingAction: draft.encodingAction.trim(),
    beneficialAction: draft.beneficialAction.trim(),
    linkSettings: { enabled: triggerText.length > 0, triggerType: draft.linkTriggerType, triggerText },
    regulationBodyImagery: bodyImageryFromCustomFields(draft.regulationBodyParts, draft.regulationMovementText),
    encodingBodyImagery: bodyImageryFromCustomFields(draft.encodingBodyParts, draft.encodingMovementText),
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
