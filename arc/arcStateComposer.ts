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
 */

import type { ArcBuildProfile, ArcStateComponentKind, ArcStateComposition, DevelopmentLayer, ThoughtModality, ThoughtTimeOrientation, UrgeRepresentation } from "./types.ts";
import { resolveTargetPreventiveAction } from "./arcEngine.ts";
import { createEmptyBeliefLiveState } from "./beliefLive.ts";
import type { BeliefLiveState } from "./beliefLive.ts";
import { createEmptyThoughtLiveState } from "./thoughtLive.ts";
import type { ThoughtLiveState } from "./thoughtLive.ts";
import { createEmptyUrgeLiveState } from "./urgeLive.ts";
import type { UrgeLiveState } from "./urgeLive.ts";

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
