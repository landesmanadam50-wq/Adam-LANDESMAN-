/**
 * arc/arcStateComposer.ts
 *
 * Phase 7 (ARC State composition), per the saved specification: ARC
 * State already exists (arc/arcEngine.ts's regular reactive_emotion/
 * proactive session, driven by live/LiveSessionScreen.tsx and
 * live/ArcLiveRenderer.tsx) -- this module does NOT replace or
 * reimplement it. It is the pure orchestration layer that lets that
 * existing session optionally COMBINE the "emotion" (state layer's own
 * existing recognition/Encoding, unmodified), "urge", "thought" and
 * "belief" components into three shared blocks instead of running
 * several complete protocols one after another:
 *
 *   1. Combined Recognition + preventive stopping + Awareness + Stay +
 *      Acceptance (arc/arcEngine.ts's EXISTING trigger_selection ->
 *      trigger_context -> observer_pause -> presence_check chain,
 *      unmodified -- this module only decides which ADDITIONAL
 *      component-recognition sub-screens run alongside it, via
 *      getNextRecognitionSubStage below)
 *   2. One shared Presence/Regulation block (arc/arcEngine.ts's
 *      EXISTING arc_thought_* / regulate stages, unmodified)
 *   3. Combined, protocol-specific Encoding (arc/urgeLive.ts's/
 *      arc/thoughtLive.ts's/arc/beliefLive.ts's own EMBEDDED entry
 *      points -- getFirstEmbeddedUrgeLiveStage/
 *      getFirstEmbeddedThoughtLiveStage/getFirstEmbeddedBeliefLiveStage
 *      -- run in sequence, via getNextEncodingComponent below, each
 *      contributing ONLY its own Encoding-tail screens; the existing
 *      "encode" ArcStage still runs for "emotion"/Desired State, per
 *      spec section 9.1: "The desired state begins here, not during
 *      Recognition, Stay or Acceptance")
 *
 * Presence is deliberately never a selectable component (see
 * ArcStateComponentKind's own doc) -- it IS the shared block, already
 * fully implemented by the existing engine.
 *
 * Central rule (the spec's own words): "All selected interfering
 * components are recognized and accepted together before Regulation.
 * Regulation runs once. After Regulation, each selected component
 * receives only its relevant Encoding work." Every dedup guard below
 * exists to enforce exactly that -- a shared stage's own "completed"
 * flag, once true, must never let the caller render that shared stage
 * again for this session.
 *
 * Backward compatibility (spec sections 19/26/34): an ArcBuild with no
 * stateComposition configured (every "state" build saved before this
 * phase, and any coach who never opts a build into composition) must
 * continue through the EXISTING, single-component route unchanged --
 * resolveEffectiveArcStateComponents returns exactly ["emotion"] in
 * that case, which makes getNextEncodingComponent immediately resolve
 * to null (no embedded component ever runs) and every recognition/
 * encoding sub-stage function below a no-op pass-through. Nothing in
 * arc/arcEngine.ts, live/ArcLiveRenderer.tsx or live/LiveSessionScreen.tsx
 * is modified by this file -- composition is purely additive branching
 * a caller opts into.
 *
 * Adaptive ARC architecture task, Phase 2 (pure logic only -- no screen
 * in this repository calls anything below this point yet):
 *
 * 1. Three-way Presence routing (decision 1 of that task) --
 *    resolveArcStatePresenceRoute below is a NEW, standalone routing
 *    function. It intentionally does NOT replace or call
 *    arc/engine.ts's existing shouldRunArcThought/arc/config.ts's
 *    presence.threshold (the two-way split every CURRENT production
 *    session still runs on, via arc/arcEngine.ts's own "presence_check"
 *    case) -- that pair remains completely untouched, still driving
 *    today's real LIVE sessions unchanged, exactly as "do not modify
 *    existing production routing" requires. This new function expresses
 *    the ADAPTIVE architecture's own three-way rule (7-10 skip / 4-6
 *    short / 1-3 full) for the composer to use once a future phase
 *    wires it in; until then it is exercised only by its own tests.
 *
 * 2. Zero-or-one derivative validation (decision "zero-or-one derivative
 *    validation") -- resolveSingleOptionalArcStateComponent/
 *    validateOptionalComponentSelection below are NEW, additive
 *    functions alongside (never replacing) resolveEffectiveArcStateComponents
 *    above, which live/ArcLiveRenderer.tsx's ComposedEncodingScreen
 *    still calls today with its own, still-multi-component-capable
 *    signature -- that existing call site is left completely alone.
 *    The new functions give a future, single-derivative-only caller a
 *    type-level guarantee ("at most one") the array-based function
 *    above cannot express on its own.
 */

import type { ArcBuildProfile, ArcStateComponentKind, ArcStateComposition, DevelopmentLayer, ThoughtModality, ThoughtTimeOrientation, UrgeRepresentation } from "./types.ts";
import { resolveTargetPreventiveAction } from "./arcEngine.ts";
import { createEmptyBeliefLiveState } from "./beliefLive.ts";
import type { BeliefLiveState } from "./beliefLive.ts";
import { createEmptyThoughtLiveState } from "./thoughtLive.ts";
import type { ThoughtLiveState } from "./thoughtLive.ts";
import { createEmptyUrgeLiveState } from "./urgeLive.ts";
import type { UrgeLiveState } from "./urgeLive.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import type { BeliefInterferenceItem, InterferenceItem, InterferenceUrgeRepresentation, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { resolveEffectiveIdentityForInterferenceItem } from "./libraryRelationships.ts";

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The fixed order every "which selected component is next" resolver
 * below walks -- "emotion" is deliberately excluded (it is the state
 * layer's own EXISTING recognition/Encoding, always handled by
 * arc/arcEngine.ts's own unmodified stages, never something this
 * module sequences). Order matches spec section 18's own routing
 * examples exactly (Urge before Thought before Belief throughout).
 */
type OptionalComponentKind = "urge" | "thought" | "belief";
const COMPONENT_ORDER: OptionalComponentKind[] = ["urge", "thought", "belief"];

// ---------------------------------------------------------------------------
// Component selection (spec sections 2, 17, 19, 26)
// ---------------------------------------------------------------------------

/**
 * Resolves which components a combined ARC State session actually
 * recognizes/encodes THIS session -- "emotion" is always included,
 * whether or not it appears in either input (spec: "Do not require all
 * components," but the state layer's own recognition is never itself
 * optional). `sessionSelection` (the LIVE "מה מעורב במצב הזה כרגע?"
 * answer) wins when provided -- session-only, per spec section 2's
 * "Do not overwrite BUILD defaults with temporary LIVE selections":
 * this function never mutates or persists `composition`, it only reads
 * from it as the fallback default. A null/undefined `composition`
 * (spec section 19/26: "Missing component configuration uses the
 * current legacy ARC State route") resolves to ["emotion"] alone --
 * the existing, single-component route, byte-for-byte.
 */
export function resolveEffectiveArcStateComponents(composition: ArcStateComposition | null | undefined, sessionSelection: ArcStateComponentKind[] | null): ArcStateComponentKind[] {
  const withEmotion = (components: ArcStateComponentKind[]): ArcStateComponentKind[] => (components.includes("emotion") ? components : ["emotion", ...components]);
  if (sessionSelection !== null) {
    return withEmotion(COMPONENT_ORDER.filter((kind) => sessionSelection.includes(kind)));
  }
  if (composition && composition.defaultSelected.length > 0) {
    return withEmotion(COMPONENT_ORDER.filter((kind) => composition.defaultSelected.includes(kind)));
  }
  return ["emotion"];
}

/** Whether this ArcBuild's composition offers at least one optional component beyond "emotion" -- the BUILD/LIVE gate for whether "מה מעורב במצב הזה כרגע?" is ever asked at all (spec section 2: "ask, when appropriate"). A legacy/unconfigured build never asks it. */
export function hasComposableComponents(composition: ArcStateComposition | null | undefined): boolean {
  return Boolean(composition && composition.available.some((kind) => kind !== "emotion"));
}

// ---------------------------------------------------------------------------
// Session state + dedup guards (spec section 10)
// ---------------------------------------------------------------------------

export interface ArcStateComposedSessionState {
  selectedComponents: ArcStateComponentKind[];
  awarenessCompleted: boolean;
  stayCompleted: boolean;
  acceptanceCompleted: boolean;
  presenceCompleted: boolean;
  regulationCompleted: boolean;
  bridgeMantraCompleted: boolean;
  encodedComponents: ArcStateComponentKind[];
}

export function createEmptyArcStateComposedSession(selectedComponents: ArcStateComponentKind[]): ArcStateComposedSessionState {
  return {
    selectedComponents,
    awarenessCompleted: false,
    stayCompleted: false,
    acceptanceCompleted: false,
    presenceCompleted: false,
    regulationCompleted: false,
    bridgeMantraCompleted: false,
    encodedComponents: [],
  };
}

/** Idempotent -- calling this after the flag is already true is a harmless no-op, never a re-trigger. Each shared-stage renderer checks the resulting flag BEFORE rendering, so a shared stage's own screen is never shown twice regardless of how many times the caller re-enters this function. */
export function markAwarenessCompleted(state: ArcStateComposedSessionState): ArcStateComposedSessionState {
  return state.awarenessCompleted ? state : { ...state, awarenessCompleted: true };
}
export function markStayCompleted(state: ArcStateComposedSessionState): ArcStateComposedSessionState {
  return state.stayCompleted ? state : { ...state, stayCompleted: true };
}
export function markAcceptanceCompleted(state: ArcStateComposedSessionState): ArcStateComposedSessionState {
  return state.acceptanceCompleted ? state : { ...state, acceptanceCompleted: true };
}
export function markPresenceCompleted(state: ArcStateComposedSessionState): ArcStateComposedSessionState {
  return state.presenceCompleted ? state : { ...state, presenceCompleted: true };
}
export function markRegulationCompleted(state: ArcStateComposedSessionState): ArcStateComposedSessionState {
  return state.regulationCompleted ? state : { ...state, regulationCompleted: true };
}
export function markBridgeMantraCompleted(state: ArcStateComposedSessionState): ArcStateComposedSessionState {
  return state.bridgeMantraCompleted ? state : { ...state, bridgeMantraCompleted: true };
}

/** A component is never encoded twice (spec section 10's own last requirement) -- appending an already-present kind is a no-op. */
export function markComponentEncoded(state: ArcStateComposedSessionState, kind: ArcStateComponentKind): ArcStateComposedSessionState {
  if (state.encodedComponents.includes(kind)) return state;
  return { ...state, encodedComponents: [...state.encodedComponents, kind] };
}

export function isComponentSelected(state: ArcStateComposedSessionState, kind: ArcStateComponentKind): boolean {
  return state.selectedComponents.includes(kind);
}

export function isComponentEncoded(state: ArcStateComposedSessionState, kind: ArcStateComponentKind): boolean {
  return state.encodedComponents.includes(kind);
}

// ---------------------------------------------------------------------------
// Combined Recognition sub-sequencing (spec section 4's "recognition of
// all selected components", section 5's per-component field lists)
// ---------------------------------------------------------------------------

export type ArcStateRecognitionSubStage = "state" | "urge" | "thought" | "belief" | "done";

/** "state" (the existing base recognition -- what happened/current emotion/body/situation, always first) -> each SELECTED optional component in COMPONENT_ORDER -> "done". An unselected component's own sub-stage is skipped entirely -- never shown, never asked about. */
export function getNextRecognitionSubStage(current: ArcStateRecognitionSubStage, selectedComponents: ArcStateComponentKind[]): ArcStateRecognitionSubStage {
  const sequence: ArcStateRecognitionSubStage[] = ["state", ...COMPONENT_ORDER.filter((kind) => selectedComponents.includes(kind))];
  const index = sequence.indexOf(current === "done" ? sequence[sequence.length - 1] : current);
  if (current === "done" || index === -1 || index === sequence.length - 1) return "done";
  return sequence[index + 1];
}

/** Free-text recognition answers for every component -- never required, never used to intensify/recreate anything (spec section 4: "Do not ask the user to deliberately recreate... Work only with what the user reports is already present"). Mirrors each embedded engine's OWN recognition field shape so seedEmbedded*LiveState below can seed them directly, with zero re-typing. */
export interface ArcStateRecognitionAnswers {
  emotionText: string | null;
  bodyLocationText: string | null;
  situationText: string | null;
  urgeText: string | null;
  urgeNeedText: string | null;
  urgeTriggerText: string | null;
  urgeRepresentation: UrgeRepresentation | null;
  thoughtText: string | null;
  thoughtModality: ThoughtModality | null;
  thoughtTimeOrientation: ThoughtTimeOrientation | null;
  beliefText: string | null;
  beliefConnectionText: string | null;
  beliefFeelingText: string | null;
}

export function createEmptyArcStateRecognitionAnswers(): ArcStateRecognitionAnswers {
  return {
    emotionText: null,
    bodyLocationText: null,
    situationText: null,
    urgeText: null,
    urgeNeedText: null,
    urgeTriggerText: null,
    urgeRepresentation: null,
    thoughtText: null,
    thoughtModality: null,
    thoughtTimeOrientation: null,
    beliefText: null,
    beliefConnectionText: null,
    beliefFeelingText: null,
  };
}

/** Seeds the embedded Urge engine's own state from the combined-Recognition answer, so its Encoding stage's representation branch reads the SAME answer the trainee already gave -- never re-asked. */
export function seedEmbeddedUrgeLiveState(answers: ArcStateRecognitionAnswers): UrgeLiveState {
  return { ...createEmptyUrgeLiveState(), representation: answers.urgeRepresentation };
}

/** Seeds the embedded Thought engine's own state -- modality feeds its Encoding stage's visual/auditory/both branch; thoughtText is carried for display/logging parity, never re-asked. */
export function seedEmbeddedThoughtLiveState(answers: ArcStateRecognitionAnswers): ThoughtLiveState {
  return { ...createEmptyThoughtLiveState(), modality: answers.thoughtModality, thoughtText: answers.thoughtText, timeOrientation: answers.thoughtTimeOrientation };
}

/** Seeds the embedded Belief engine's own state -- limitingBeliefText carried for display/logging parity; the actual replacement-belief resolution still comes from the linked BeliefArc (arc/beliefArcs.ts's own fallback chain), never invented here. */
export function seedEmbeddedBeliefLiveState(answers: ArcStateRecognitionAnswers): BeliefLiveState {
  return { ...createEmptyBeliefLiveState(), limitingBeliefText: answers.beliefText };
}

// ---------------------------------------------------------------------------
// Preventive stopping (spec section 5): shown once, right after
// Recognition and before shared Stay -- reuses the EXISTING per-layer
// Preventive Action configuration (resolveTargetPreventiveAction),
// never a new field. Relevant only when an urge/automatic behavior is
// actually part of THIS session.
// ---------------------------------------------------------------------------

export function isPreventiveStoppingRelevant(selectedComponents: ArcStateComponentKind[], layer: DevelopmentLayer, profile: ArcBuildProfile): boolean {
  if (!selectedComponents.includes("urge")) return false;
  return safeText(resolveTargetPreventiveAction(layer, profile)).length > 0;
}

// ---------------------------------------------------------------------------
// Combined Encoding sequencing (spec sections 9, 10)
// ---------------------------------------------------------------------------

/** The next selected-but-not-yet-encoded component, in the fixed urge -> thought -> belief order -- null once every selected optional component has been encoded (the caller then continues into the EXISTING "encode" ArcStage for Desired State Encoding, spec section 9.1: "begins here, not during Recognition, Stay or Acceptance"). "emotion" is never returned -- see COMPONENT_ORDER's own doc. */
export function getNextEncodingComponent(state: ArcStateComposedSessionState): ArcStateComponentKind | null {
  for (const kind of COMPONENT_ORDER) {
    if (state.selectedComponents.includes(kind) && !state.encodedComponents.includes(kind)) return kind;
  }
  return null;
}

export function isArcStateEncodingComplete(state: ArcStateComposedSessionState): boolean {
  return getNextEncodingComponent(state) === null;
}

// ---------------------------------------------------------------------------
// Integrating the encoded responses (spec section 11)
// ---------------------------------------------------------------------------

export interface ArcStateIntegrationSummaryItem {
  label: string;
  text: string;
}

/** Summarizes only the SELECTED components' already-resolved outputs (never re-derives or invents them) -- the caller passes in whatever text each embedded engine/Desired-State-Encoding actually resolved. A null/empty value for a given input is simply omitted, never shown as a blank row. */
export function buildArcStateIntegrationSummary(inputs: {
  desiredState?: string | null;
  urgeResponse?: string | null;
  thoughtResponse?: string | null;
  beliefResponse?: string | null;
}): ArcStateIntegrationSummaryItem[] {
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "המצב הרצוי", value: inputs.desiredState },
    { label: "התגובה המיועדת לדחף", value: inputs.urgeResponse },
    { label: "תובנה או מחשבה תומכת", value: inputs.thoughtResponse },
    { label: "אמונה תומכת", value: inputs.beliefResponse },
  ];
  return rows
    .filter((row) => safeText(row.value).length > 0)
    .map((row) => ({ label: row.label, text: safeText(row.value) }));
}

export const ARC_STATE_ACTION_CHOICE_QUESTION = "כיצד אתה רוצה לפעול עכשיו מתוך מה שבחרת?";

// ---------------------------------------------------------------------------
// Re-check (spec section 13): only the checks relevant to what was
// actually selected -- never all four unconditionally.
// ---------------------------------------------------------------------------

export type ArcStateRecheckKind = "emotion" | "urge" | "whatChanged";

export interface ArcStateRecheckItem {
  kind: ArcStateRecheckKind;
  question: string;
}

export function getRelevantArcStateRecheckItems(selectedComponents: ArcStateComponentKind[]): ArcStateRecheckItem[] {
  const items: ArcStateRecheckItem[] = [{ kind: "emotion", question: "מה עוצמת הרגש עכשיו?" }];
  if (selectedComponents.includes("urge")) items.push({ kind: "urge", question: "מה עוצמת הדחף עכשיו?" });
  items.push({ kind: "whatChanged", question: "מה השתנה?" });
  return items;
}

// ---------------------------------------------------------------------------
// Bridge Mantra display gate (spec section 9's own "never repeat later
// unless a protocol-specific mantra has a different necessary purpose")
// ---------------------------------------------------------------------------

/** True only while the shared Regulation block's own Bridge Mantra hasn't been shown yet THIS session -- the one gate every embedded component's own Bridge-Mantra-adjacent copy (arc/beliefLive.ts's getFirstEmbeddedBeliefLiveStage's own bridgeMantraAlreadyShown parameter) should be driven from. */
export function shouldShowSharedBridgeMantra(state: ArcStateComposedSessionState): boolean {
  return !state.bridgeMantraCompleted;
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, decision 1: three-way Presence routing.
// A NEW routing function, deliberately separate from arc/engine.ts's
// existing shouldRunArcThought/arc/config.ts's presence.threshold pair --
// see this file's own module doc above for why the old pair is left
// completely untouched. Not called by any production code in this phase.
// ---------------------------------------------------------------------------

/**
 * "skip" -- no Presence exercise at all, continue directly (rating 7-10).
 * "short" -- the short Presence route (rating 4-6).
 * "full" -- the full Presence route (rating 1-3, and any missing/invalid
 * rating -- see resolveArcStatePresenceRoute's own doc for why "full" is
 * the safe default for unknown input, never "skip").
 */
export type ArcStatePresenceRouteDecision = "skip" | "short" | "full";

/**
 * Adaptive ARC architecture task, decision 1 (Presence entry routing):
 * "עד כמה אתה נוכח כרגע?", 1-10, routed as:
 *   7-10 -> "skip" (continue directly -- no Presence exercise at all)
 *   4-6  -> "short" (the short Presence route)
 *   1-3  -> "full" (the full Presence route)
 *
 * There is deliberately no "Micro Presence" step before this rating --
 * the rating question is always the first thing asked, never preceded
 * by a separate warm-up exercise (decision 1's own explicit "do not add
 * a separate Micro Presence exercise" and "Incorrect: Micro Presence ->
 * Presence rating -> Presence again").
 *
 * A missing or invalid rating (null, not a finite number, not an integer,
 * or outside 1-10 -- e.g. a corrupted/legacy value) always resolves to
 * "full": the safe, most-supportive default, matching the existing
 * production engine's own null-rating behavior (arc/engine.ts's
 * shouldRunArcThought(null) is also true, i.e. "run the full route" --
 * see arc/config.ts's presence.threshold). Never silently "skip" on
 * unknown/bad input -- that would be the one unsafe direction (skipping
 * support the trainee may actually need).
 */
export function resolveArcStatePresenceRoute(presenceRating: number | null): ArcStatePresenceRouteDecision {
  if (presenceRating === null || !Number.isInteger(presenceRating) || presenceRating < 1 || presenceRating > 10) {
    return "full";
  }
  if (presenceRating >= 7) return "skip";
  if (presenceRating >= 4) return "short";
  return "full";
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, "zero-or-one derivative validation".
// Additive alongside resolveEffectiveArcStateComponents above -- that
// function (and its still-multi-component-capable ArcStateComponentKind[]
// signature) is left completely untouched, since live/ArcLiveRenderer.tsx's
// ComposedEncodingScreen still calls it today. The functions below give a
// future, single-derivative-only caller a type-level "at most one"
// guarantee the array-based function above cannot express.
// ---------------------------------------------------------------------------

/**
 * Whether a raw (possibly legacy/multi-select-shaped) selection array
 * satisfies the adaptive architecture's "zero or one selected main
 * derivative" rule (decision: "In LIVE... Only one interfering item may
 * be active in one session. Do not combine several Thought, Belief,
 * Urge, or Emotion protocols in one sequence."). "emotion" is never
 * counted as an optional derivative here (it is the always-included base
 * state itself, exactly like COMPONENT_ORDER's own exclusion above) --
 * only urge/thought/belief count toward the at-most-one limit.
 */
export function validateOptionalComponentSelection(selection: ArcStateComponentKind[]): { valid: boolean; selectedCount: number } {
  const optionalCount = selection.filter((kind) => (COMPONENT_ORDER as ArcStateComponentKind[]).includes(kind)).length;
  return { valid: optionalCount <= 1, selectedCount: optionalCount };
}

/**
 * The single-derivative-only counterpart to resolveEffectiveArcStateComponents
 * above -- takes at most ONE optional component (or null for "None") at
 * the type level, rather than an array a caller could accidentally widen.
 * Returns just that one selected derivative kind, or null when none is
 * selected ("None" -- decision "The selected main derivative may be:
 * Thought / Belief / Urge / Emotion / None"). "Emotion" as an explicit
 * selection is treated identically to null here: the base state/emotion
 * layer is always included regardless (see resolveEffectiveArcStateComponents's
 * own doc), so there is no functional difference between "the trainee
 * explicitly chose Emotion as the derivative" and "the trainee chose
 * None" -- both mean "no urge/thought/belief component this session."
 *
 * `composition`'s own defaultSelected is used as the BUILD-configured
 * fallback exactly like resolveEffectiveArcStateComponents -- only the
 * first non-emotion entry is honored here (the composition itself may
 * still list several `available` options for the trainee to choose
 * between at session time; only the session's own eventual choice must
 * collapse to at most one).
 */
export function resolveSingleOptionalArcStateComponent(
  composition: ArcStateComposition | null | undefined,
  sessionSelection: ArcStateComponentKind | null
): ArcStateComponentKind | null {
  if (sessionSelection !== null && sessionSelection !== "emotion") {
    return COMPONENT_ORDER.includes(sessionSelection) ? sessionSelection : null;
  }
  if (sessionSelection === null && composition && composition.defaultSelected.length > 0) {
    const firstOptional = composition.defaultSelected.find((kind) => (COMPONENT_ORDER as ArcStateComponentKind[]).includes(kind));
    return firstOptional ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 4: generalizing this composer to
// compose from the Phase 3 libraries (arc/stateProfile.ts,
// arc/identityProfile.ts, arc/interferenceItem.ts) instead of
// ArcBuildProfile's own linkedUrgeArcId/linkedThoughtArcId/linkedBeliefArcId
// fields. Every function below is NEW and purely additive -- nothing
// above this section is modified, and every existing production call
// site (live/ArcLiveRenderer.tsx's ComposedEncodingScreen, still calling
// resolveEffectiveArcStateComponents with its own ArcBuildProfile-backed
// signature) is completely untouched. Pure logic only: no storage I/O,
// no navigation, deterministic, and every StateProfile/IdentityProfile/
// InterferenceItem input is read-only -- see each function's own "not
// mutated" test in arc/arcStateComposer.test.ts. Nothing here is wired
// into any screen in this phase.
//
// Emotion clarification: an EmotionInterferenceItem never becomes an
// ADDITIONAL selected optional component (resolveArcStateComponentFromInterferenceItem
// returns null for it, exactly like null/no-item -- the base "emotion"
// component this composer already always includes IS the structural
// slot an Emotion item's content flows into; adding it as a second,
// selectable component would duplicate that slot). Its own saved content
// is never discarded because of this: resolveArcStateEncodingContentFromLibrary
// below still folds an Emotion item's own emotionName/situationContext/
// triggerInfo/description/regulationCue in exactly like it would for any
// other category, and its primaryStateProfileId/identityProfileIdOverride
// still drive which State/Identity the composition resolves, unaffected
// by the component-mapping result.
//
// Reported gap (per explicit instruction: report rather than silently
// broaden Phase 3 types): EmotionInterferenceItem -- like
// BeliefInterferenceItem and ThoughtInterferenceItem -- has no field of
// its own equivalent to the base StateProfile's `action` or
// `encodingCue`. Only UrgeInterferenceItem has an Encoding-cue-equivalent
// pair (visualEncodingConfig/sensoryEncodingConfig), and NO category has
// an "action" field of its own -- see arc/interferenceItem.ts's own doc:
// "Do not copy the entire State or Identity data into an
// InterferenceItem... Store stable references to the linked profiles."
// So for an Emotion item, `action` and `encodingCue` below always
// resolve from the base StateProfile (or an explicit MiniOverrideConfig
// field, which IS available to every category since it lives on the
// shared InterferenceItemBase) -- never from the item itself.
// `regulationCue` is the one field EmotionInterferenceItem DOES carry
// its own value for (its `regulationCue` field), and it participates
// fully in that field's precedence below. This is not a Phase 4 gap to
// work around -- it is Phase 3's own intended "lightweight item, full
// State" shape, surfaced here exactly as instructed rather than patched
// over or used as a reason to add fields to Phase 3 types.
// ---------------------------------------------------------------------------

/**
 * Maps a resolved (0-or-1, per arc/libraryRelationships.ts's
 * isValidInterferenceSelection) InterferenceItem to the optional
 * ArcStateComponentKind it represents in this composer's own existing
 * vocabulary -- "thought"/"belief"/"urge" map directly onto themselves
 * (InterferenceCategory and ArcStateComponentKind share the same string
 * values for these three). An "emotion"-category item maps to null,
 * exactly like a null/absent item -- see this section's own "Emotion
 * clarification" above for why that is correct (no duplicate component)
 * and never a loss of the item's own content (still read in full by
 * resolveArcStateEncodingContentFromLibrary below).
 */
export function resolveArcStateComponentFromInterferenceItem(item: InterferenceItem | null): ArcStateComponentKind | null {
  if (!item) return null;
  if (item.category === "emotion") return null;
  return item.category;
}

function mapInterferenceUrgeRepresentationToLive(preference: InterferenceUrgeRepresentation): UrgeRepresentation | null {
  switch (preference) {
    case "visual":
      return "visual";
    case "sensory":
      return "bodily";
    case "both":
      return "both";
    case "decide_in_live":
      return null;
  }
}

/**
 * Library-backed counterpart to seedEmbeddedUrgeLiveState above -- seeds
 * the embedded Urge engine's own state directly from a saved
 * UrgeInterferenceItem's own representationPreference, translated onto
 * UrgeLiveState's own vocabulary (see mapInterferenceUrgeRepresentationToLive's
 * own doc for the "sensory"->"bodily"/"decide_in_live"->null mapping --
 * neither this library's nor the LIVE engine's own representation type
 * is broadened or changed to make them match). Never re-asks anything
 * the item already has an answer for.
 */
export function seedEmbeddedUrgeLiveStateFromInterferenceItem(item: UrgeInterferenceItem): UrgeLiveState {
  return { ...createEmptyUrgeLiveState(), representation: mapInterferenceUrgeRepresentationToLive(item.representationPreference) };
}

/**
 * Library-backed counterpart to seedEmbeddedThoughtLiveState above --
 * seeds only thoughtText, since ThoughtInterferenceItem (deliberately
 * lightweight, per arc/interferenceItem.ts's own doc) carries no
 * modality/timeOrientation fields of its own the way the legacy
 * free-text ArcStateRecognitionAnswers does. Those two stay at
 * createEmptyThoughtLiveState()'s own defaults (null) -- asked fresh,
 * exactly like a build with no BUILD-configured preference already
 * behaves today, never guessed.
 */
export function seedEmbeddedThoughtLiveStateFromInterferenceItem(item: ThoughtInterferenceItem): ThoughtLiveState {
  return { ...createEmptyThoughtLiveState(), thoughtText: item.thoughtText };
}

/** Library-backed counterpart to seedEmbeddedBeliefLiveState above. */
export function seedEmbeddedBeliefLiveStateFromInterferenceItem(item: BeliefInterferenceItem): BeliefLiveState {
  return { ...createEmptyBeliefLiveState(), limitingBeliefText: item.beliefText };
}

/**
 * Library-backed counterpart to isPreventiveStoppingRelevant above --
 * true only for a selected UrgeInterferenceItem with a real, non-blank
 * preventiveStoppingAction; false for null, for any non-urge category
 * (Emotion included), and for an urge item whose own action is
 * blank/unset. Never reads ArcBuildProfile or a DevelopmentLayer at all
 * -- the item's own field is the sole source, unlike
 * isPreventiveStoppingRelevant's ArcBuildProfile-backed lookup.
 */
export function isPreventiveStoppingRelevantForInterferenceItem(item: InterferenceItem | null): boolean {
  if (!item || item.category !== "urge") return false;
  return safeText(item.preventiveStoppingAction).length > 0;
}

/** The item's own free-text "headline" -- the one category-specific field closest to a short label, used only to build recognitionContext below. Every category has exactly one such field. */
function resolveCategoryHeadline(item: InterferenceItem): string | null {
  switch (item.category) {
    case "thought":
      return item.thoughtText;
    case "belief":
      return item.beliefText;
    case "urge":
      return item.urgeName;
    case "emotion":
      return item.emotionName;
  }
}

/** The item's own Regulation-cue-equivalent -- every category has one (Urge's is named regulationAnchor rather than regulationCue, but the concept is identical; see arc/interferenceItem.ts's own field docs). */
function resolveCategoryRegulationCue(item: InterferenceItem): string | null {
  switch (item.category) {
    case "thought":
      return item.regulationCue;
    case "belief":
      return item.regulationCue;
    case "urge":
      return item.regulationAnchor;
    case "emotion":
      return item.regulationCue;
  }
}

/**
 * The item's own Encoding-cue-equivalent, when its category has one --
 * only UrgeInterferenceItem does today (its representation-based visual/
 * sensory Encoding configuration, preferring whichever its own
 * representationPreference points at, falling back to the other when
 * only one is configured). Every other category (Thought/Belief/Emotion)
 * returns null here -- see this section's own "Reported gap" doc above
 * for why that is Phase 3's own intended shape, not a bug to route
 * around.
 */
function resolveCategoryEncodingCue(item: InterferenceItem): string | null {
  if (item.category !== "urge") return null;
  if (item.representationPreference === "sensory") return item.sensoryEncodingConfig ?? item.visualEncodingConfig;
  return item.visualEncodingConfig ?? item.sensoryEncodingConfig;
}

/** The item's own recognition/context text -- its category headline plus situationContext/triggerInfo/description (common to every category), joined. Never invents content: a field left unset by the trainee simply contributes nothing to the joined text. null when the item has none of these set at all. */
function resolveInterferenceItemRecognitionContext(item: InterferenceItem): string | null {
  const parts = [resolveCategoryHeadline(item), item.situationContext, item.triggerInfo, item.description].map((part) => safeText(part)).filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * Picks the first non-blank value, trying in order: the Mini override
 * (most specific, only when explicitly set), then the InterferenceItem's
 * own category-specific field, then the base StateProfile field -- "Mini
 * values... fall back to the Full State/Interference/Identity
 * configuration" (arc/interferenceItem.ts's own MiniOverrideConfig doc).
 *
 * A blank/whitespace-only string at any step is treated identically to
 * null/absent, and so never erases a meaningful earlier-resolved value.
 * None of Phase 3's optional text fields distinguish "deliberately
 * cleared" from "never set" -- every normalize* function (arc/stateProfile.ts,
 * arc/identityProfile.ts, arc/interferenceItem.ts) collapses both to
 * null identically -- so there is no signal this resolver could use to
 * treat an explicit blank override differently from an absent one; safe
 * blank-handling is therefore this function's own documented, tested
 * behavior rather than something the type system distinguishes.
 */
function resolveWithMiniFallback(miniValue: string | null | undefined, itemValue: string | null, stateValue: string | null): string | null {
  const mini = safeText(miniValue);
  if (mini.length > 0) return mini;
  const item = safeText(itemValue);
  if (item.length > 0) return item;
  const state = safeText(stateValue);
  return state.length > 0 ? state : null;
}

export interface ArcStateLibraryEncodingContent {
  /** The selected item's own recognition/context text -- see resolveInterferenceItemRecognitionContext's own doc. Always null when `item` is null. */
  recognitionContext: string | null;
  /** Mini override -> item's own category-specific field -> base StateProfile.regulationAnchor -> null. */
  regulationCue: string | null;
  /** Mini override -> item's own category-specific field (Urge only -- see this section's own "Reported gap" doc) -> base StateProfile.encodingCue -> null. */
  encodingCue: string | null;
  /** Mini override -> base StateProfile.action -> null. No category has its own "action" field -- see this section's own "Reported gap" doc. */
  action: string | null;
  /** The Identity id actually resolved for this item/State pair, via arc/libraryRelationships.ts's resolveEffectiveIdentityForInterferenceItem (never reimplemented here). null is a normal, valid outcome (Self Development allows no Identity). */
  resolvedIdentityId: string | null;
  /** The resolved Identity's own encodingCue -- populated only when `identity` is non-null AND `identity.id === resolvedIdentityId` (never from a stale/mismatched candidate the caller happened to pass in). */
  identityEncodingCue: string | null;
  /** The resolved Identity's own action -- same gating as identityEncodingCue. */
  identityAction: string | null;
}

/**
 * The Phase 4 content resolver: combines a base StateProfile, an
 * optionally-selected InterferenceItem (0 or 1 -- see
 * resolveArcStateComponentFromInterferenceItem's own doc; `item` here is
 * whichever ONE item a caller already resolved, e.g. via
 * arc/libraryRelationships.ts's validateInterferenceItemPrimaryState),
 * and a candidate IdentityProfile into the fields a future Encoding-
 * facing caller needs. Pure -- takes already-loaded records, performs no
 * I/O, never mutates any of its three inputs (state/item/identity).
 *
 * Field-by-field precedence for regulationCue/encodingCue/action: see
 * resolveWithMiniFallback's own doc. Identity resolution: see
 * resolveEffectiveIdentityForInterferenceItem (arc/libraryRelationships.ts)
 * -- called here, never reimplemented.
 */
export function resolveArcStateEncodingContentFromLibrary(state: StateProfile, item: InterferenceItem | null, identity: IdentityProfile | null): ArcStateLibraryEncodingContent {
  const miniOverride = item?.miniOverride ?? null;
  const regulationCue = resolveWithMiniFallback(miniOverride?.regulationAnchorOverride ?? null, item ? resolveCategoryRegulationCue(item) : null, state.regulationAnchor);
  const encodingCue = resolveWithMiniFallback(miniOverride?.encodingCueOverride ?? null, item ? resolveCategoryEncodingCue(item) : null, state.encodingCue);
  const action = resolveWithMiniFallback(miniOverride?.stateActionOverride ?? null, null, state.action);
  const resolvedIdentityId = item ? resolveEffectiveIdentityForInterferenceItem(item, state) : (state.primaryIdentityProfileId ?? null);

  let identityEncodingCue: string | null = null;
  let identityAction: string | null = null;
  if (identity !== null && identity.id === resolvedIdentityId) {
    identityEncodingCue = identity.encodingCue;
    identityAction = identity.action;
  }

  return {
    recognitionContext: item ? resolveInterferenceItemRecognitionContext(item) : null,
    regulationCue,
    encodingCue,
    action,
    resolvedIdentityId,
    identityEncodingCue,
    identityAction,
  };
}
