import test from "node:test";
import assert from "node:assert/strict";

import {
  ARC_STATE_ACTION_CHOICE_QUESTION,
  buildArcStateIntegrationSummary,
  createEmptyArcStateComposedSession,
  createEmptyArcStateRecognitionAnswers,
  getNextEncodingComponent,
  getNextRecognitionSubStage,
  getRelevantArcStateRecheckItems,
  hasComposableComponents,
  isArcStateEncodingComplete,
  isComponentEncoded,
  isComponentSelected,
  isPreventiveStoppingRelevant,
  isPreventiveStoppingRelevantForInterferenceItem,
  markAcceptanceCompleted,
  markAwarenessCompleted,
  markBridgeMantraCompleted,
  markComponentEncoded,
  markPresenceCompleted,
  markRegulationCompleted,
  markStayCompleted,
  resolveArcStateComponentFromInterferenceItem,
  resolveArcStateEncodingContentFromLibrary,
  resolveArcStatePresenceRoute,
  resolveEffectiveArcStateComponents,
  resolveSingleOptionalArcStateComponent,
  seedEmbeddedBeliefLiveState,
  seedEmbeddedBeliefLiveStateFromInterferenceItem,
  seedEmbeddedThoughtLiveState,
  seedEmbeddedThoughtLiveStateFromInterferenceItem,
  seedEmbeddedUrgeLiveState,
  seedEmbeddedUrgeLiveStateFromInterferenceItem,
  shouldShowSharedBridgeMantra,
  validateOptionalComponentSelection,
} from "./arcStateComposer.ts";
import type { ArcStateComponentKind, ArcStateComposition } from "./types.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import { getFirstBeliefLiveStage, getFirstEmbeddedBeliefLiveStage } from "./beliefLive.ts";
import { getFirstEmbeddedThoughtLiveStage, getFirstThoughtLiveStage } from "./thoughtLive.ts";
import { getFirstEmbeddedUrgeLiveStage, getFirstUrgeLiveStage } from "./urgeLive.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { createEmptyIdentityProfile } from "./identityProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyMiniOverrideConfig,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
} from "./interferenceItem.ts";
import { resolveEffectiveIdentityForInterferenceItem } from "./libraryRelationships.ts";

// --- #1/#2/#34: legacy/unconfigured route ---

test("#1 legacy route: no composition and no session selection resolves to emotion-only, with encoding immediately complete", () => {
  const selected = resolveEffectiveArcStateComponents(null, null);
  assert.deepEqual(selected, ["emotion"]);
  const session = createEmptyArcStateComposedSession(selected);
  assert.equal(isArcStateEncodingComplete(session), true);
  assert.equal(getNextEncodingComponent(session), null);
});

test("#34 an ArcBuildProfile with stateComposition undefined behaves exactly like one with it explicitly null", () => {
  const undefinedCase = resolveEffectiveArcStateComponents(undefined, null);
  const nullCase = resolveEffectiveArcStateComponents(null, null);
  assert.deepEqual(undefinedCase, nullCase);
});

test("#2 emotion-only explicit composition (defaultSelected empty) resolves to emotion-only", () => {
  const composition: ArcStateComposition = { available: ["urge", "thought", "belief"], defaultSelected: [] };
  assert.deepEqual(resolveEffectiveArcStateComponents(composition, null), ["emotion"]);
});

// --- #3-#7: composition combinations ---

function walkEncoding(selected: ArcStateComponentKind[]): ArcStateComponentKind[] {
  let session = createEmptyArcStateComposedSession(selected);
  const order: ArcStateComponentKind[] = [];
  let next = getNextEncodingComponent(session);
  while (next !== null) {
    order.push(next);
    session = markComponentEncoded(session, next);
    next = getNextEncodingComponent(session);
  }
  return order;
}

test("#3 emotion + urge: only urge is encoded as a component (emotion never appears in the component encoding sequence)", () => {
  assert.deepEqual(walkEncoding(["emotion", "urge"]), ["urge"]);
});

test("#4 emotion + thought", () => {
  assert.deepEqual(walkEncoding(["emotion", "thought"]), ["thought"]);
});

test("#5 emotion + belief", () => {
  assert.deepEqual(walkEncoding(["emotion", "belief"]), ["belief"]);
});

test("#6 thought + belief (no urge) walks thought then belief, in that order", () => {
  assert.deepEqual(walkEncoding(["emotion", "thought", "belief"]), ["thought", "belief"]);
});

test("#7 emotion + urge + thought + belief walks urge -> thought -> belief", () => {
  assert.deepEqual(walkEncoding(["emotion", "urge", "thought", "belief"]), ["urge", "thought", "belief"]);
});

// --- #8: preventive stopping before shared Stay ---

test("#8 preventive stopping is relevant only when urge is selected and a Preventive Action is configured for the target layer", () => {
  const withAction = { ...createEmptyArcBuildProfile(), statePreventiveAction: "עצור לרגע ונשום" };
  assert.equal(isPreventiveStoppingRelevant(["emotion", "urge"], "state", withAction), true);
  assert.equal(isPreventiveStoppingRelevant(["emotion"], "state", withAction), false, "no urge selected -- never relevant even with a configured action");

  const withoutAction = createEmptyArcBuildProfile();
  assert.equal(isPreventiveStoppingRelevant(["emotion", "urge"], "state", withoutAction), false, "nothing configured -- allow continuing safely, never invent a stop action");
});

// --- #9-#12: shared stages run once ---

test("#9 combined Awareness: marking it completed twice is idempotent (still exactly one completion)", () => {
  let session = createEmptyArcStateComposedSession(["emotion"]);
  assert.equal(session.awarenessCompleted, false);
  session = markAwarenessCompleted(session);
  assert.equal(session.awarenessCompleted, true);
  const again = markAwarenessCompleted(session);
  assert.equal(again, session, "re-marking an already-completed shared stage returns the exact same object, never a fresh 'completion'");
});

test("#10 combined Stay runs once", () => {
  let session = createEmptyArcStateComposedSession(["emotion"]);
  session = markStayCompleted(session);
  assert.equal(session.stayCompleted, true);
  assert.equal(markStayCompleted(session), session);
});

test("#11 combined Acceptance runs once", () => {
  let session = createEmptyArcStateComposedSession(["emotion"]);
  session = markAcceptanceCompleted(session);
  assert.equal(session.acceptanceCompleted, true);
  assert.equal(markAcceptanceCompleted(session), session);
});

test("#12 shared Regulation (Presence + Regulation) runs once", () => {
  let session = createEmptyArcStateComposedSession(["emotion"]);
  session = markPresenceCompleted(session);
  session = markRegulationCompleted(session);
  assert.equal(session.presenceCompleted, true);
  assert.equal(session.regulationCompleted, true);
  assert.equal(markPresenceCompleted(session), session);
  assert.equal(markRegulationCompleted(session), session);
});

// --- #13: Bridge Mantra not duplicated ---

test("#13 the Bridge Mantra is shown only until marked completed, then never again this session", () => {
  let session = createEmptyArcStateComposedSession(["emotion", "belief"]);
  assert.equal(shouldShowSharedBridgeMantra(session), true);
  session = markBridgeMantraCompleted(session);
  assert.equal(shouldShowSharedBridgeMantra(session), false);
  assert.equal(markBridgeMantraCompleted(session), session);
});

// --- #14-#16: embedded Encoding-only entry points ---

test("#14 Urge's embedded entry point starts directly at 'encode', skipping recognition/representation/preventive_action/stay/accept/regulate", () => {
  assert.equal(getFirstEmbeddedUrgeLiveStage(), "encode");
});

test("#15 Thought's embedded entry point starts directly at 'useful_insight_decision', skipping opening_decision/recognition/modality/emotion/time_orientation/breathing_stay/acceptance/flexible_attention", () => {
  assert.equal(getFirstEmbeddedThoughtLiveStage(), "useful_insight_decision");
});

test("#16 Belief's embedded entry point starts at bridge_mantra (or replacement_belief if the shared Bridge Mantra already ran), never the full standalone preparation", () => {
  assert.equal(getFirstEmbeddedBeliefLiveStage(false), "bridge_mantra");
  assert.equal(getFirstEmbeddedBeliefLiveStage(true), "replacement_belief");
});

// --- #17: Desired content never appears before Encoding ---

test("#17 'emotion' (Desired State Encoding) is never returned by getNextEncodingComponent -- it only ever runs via the existing 'encode' ArcStage, reached once every OTHER selected component is done", () => {
  const session = createEmptyArcStateComposedSession(["emotion", "urge", "thought", "belief"]);
  let current = session;
  for (let i = 0; i < 5; i++) {
    const next = getNextEncodingComponent(current);
    assert.notEqual(next, "emotion");
    if (next === null) break;
    current = markComponentEncoded(current, next);
  }
  assert.equal(isArcStateEncodingComplete(current), true);
});

// --- #18: unselected components never appear ---

test("#18a getNextRecognitionSubStage skips every unselected component entirely", () => {
  const selected: ArcStateComponentKind[] = ["emotion", "thought"];
  let stage = getNextRecognitionSubStage("state", selected);
  const visited = [stage];
  for (let i = 0; i < 5 && stage !== "done"; i++) {
    stage = getNextRecognitionSubStage(stage, selected);
    visited.push(stage);
  }
  assert.deepEqual(visited, ["thought", "done"]);
  assert.ok(!visited.includes("urge"));
  assert.ok(!visited.includes("belief"));
});

test("#18b getNextEncodingComponent never returns an unselected component", () => {
  assert.deepEqual(walkEncoding(["emotion", "belief"]), ["belief"]);
});

// --- #19: embedded component returns to the next selected component ---

test("#19 after one embedded component is marked encoded, the composer advances to the next selected one, then to null", () => {
  let session = createEmptyArcStateComposedSession(["emotion", "urge", "belief"]);
  assert.equal(getNextEncodingComponent(session), "urge");
  session = markComponentEncoded(session, "urge");
  assert.equal(getNextEncodingComponent(session), "belief");
  session = markComponentEncoded(session, "belief");
  assert.equal(getNextEncodingComponent(session), null);
});

// --- #20: Back navigation / immutability ---

test("#20 every state transition returns a NEW object rather than mutating in place, so a caller's own undo/back-navigation stack of snapshots stays valid", () => {
  const original = createEmptyArcStateComposedSession(["emotion", "urge"]);
  const afterAwareness = markAwarenessCompleted(original);
  assert.notEqual(afterAwareness, original);
  assert.equal(original.awarenessCompleted, false, "the original snapshot is never mutated");
  const afterEncode = markComponentEncoded(afterAwareness, "urge");
  assert.notEqual(afterEncode, afterAwareness);
  assert.deepEqual(afterAwareness.encodedComponents, [], "an earlier snapshot's own array is never mutated by a later call");
});

// --- #21-#23: standalone protocols unchanged ---

test("#21 standalone Full ARC Urge still starts at 'recognition'", () => {
  assert.equal(getFirstUrgeLiveStage(), "recognition");
});

test("#22 standalone Full ARC Thought still starts at 'opening_decision'", () => {
  assert.equal(getFirstThoughtLiveStage(), "opening_decision");
});

test("#23 standalone Full ARC Belief still starts at 'recognition'", () => {
  assert.equal(getFirstBeliefLiveStage(), "recognition");
});

// --- #33: Hebrew RTL copy ---

test("#33 every recheck question, the integration action question, and integration summary labels are real Hebrew text", () => {
  const hebrewPattern = /[֐-׿]/;
  assert.ok(hebrewPattern.test(ARC_STATE_ACTION_CHOICE_QUESTION));
  for (const item of getRelevantArcStateRecheckItems(["emotion", "urge"])) {
    assert.ok(hebrewPattern.test(item.question));
  }
  const summary = buildArcStateIntegrationSummary({ desiredState: "רוגע", urgeResponse: "לעצור", thoughtResponse: "תובנה", beliefResponse: "אמונה" });
  for (const item of summary) {
    assert.ok(hebrewPattern.test(item.label));
  }
});

// --- component selection helpers ---

test("resolveEffectiveArcStateComponents: a session override always wins over BUILD defaults, and never overwrites the composition object itself", () => {
  const composition: ArcStateComposition = { available: ["urge", "thought", "belief"], defaultSelected: ["urge"] };
  const withOverride = resolveEffectiveArcStateComponents(composition, ["thought"]);
  assert.deepEqual(withOverride, ["emotion", "thought"]);
  // The BUILD-configured object itself is never mutated by resolving a session override.
  assert.deepEqual(composition.defaultSelected, ["urge"]);
});

test("resolveEffectiveArcStateComponents always includes emotion even when neither input mentions it", () => {
  const composition: ArcStateComposition = { available: ["belief"], defaultSelected: ["belief"] };
  assert.deepEqual(resolveEffectiveArcStateComponents(composition, null), ["emotion", "belief"]);
});

test("hasComposableComponents is false for a legacy/unconfigured build, true once at least one optional component is available", () => {
  assert.equal(hasComposableComponents(null), false);
  assert.equal(hasComposableComponents({ available: ["emotion"], defaultSelected: [] }), false);
  assert.equal(hasComposableComponents({ available: ["emotion", "urge"], defaultSelected: [] }), true);
});

test("isComponentSelected / isComponentEncoded reflect the session's own arrays", () => {
  let session = createEmptyArcStateComposedSession(["emotion", "urge"]);
  assert.equal(isComponentSelected(session, "urge"), true);
  assert.equal(isComponentSelected(session, "thought"), false);
  assert.equal(isComponentEncoded(session, "urge"), false);
  session = markComponentEncoded(session, "urge");
  assert.equal(isComponentEncoded(session, "urge"), true);
});

test("markComponentEncoded never appends the same component twice", () => {
  let session = createEmptyArcStateComposedSession(["emotion", "urge"]);
  session = markComponentEncoded(session, "urge");
  session = markComponentEncoded(session, "urge");
  assert.deepEqual(session.encodedComponents, ["urge"]);
});

// --- seeding embedded engine state from Recognition answers ---

test("seedEmbeddedUrgeLiveState carries the Recognition-time representation answer, never re-asking it", () => {
  const answers = { ...createEmptyArcStateRecognitionAnswers(), urgeRepresentation: "bodily" as const };
  const seeded = seedEmbeddedUrgeLiveState(answers);
  assert.equal(seeded.representation, "bodily");
});

test("seedEmbeddedThoughtLiveState carries the Recognition-time modality and orientation answers", () => {
  const answers = { ...createEmptyArcStateRecognitionAnswers(), thoughtModality: "auditory" as const, thoughtTimeOrientation: "future" as const, thoughtText: "אני אכשל" };
  const seeded = seedEmbeddedThoughtLiveState(answers);
  assert.equal(seeded.modality, "auditory");
  assert.equal(seeded.timeOrientation, "future");
  assert.equal(seeded.thoughtText, "אני אכשל");
});

test("seedEmbeddedBeliefLiveState carries the Recognition-time belief text", () => {
  const answers = { ...createEmptyArcStateRecognitionAnswers(), beliefText: "אני לא מספיק טוב" };
  const seeded = seedEmbeddedBeliefLiveState(answers);
  assert.equal(seeded.limitingBeliefText, "אני לא מספיק טוב");
});

// --- integration summary ---

test("buildArcStateIntegrationSummary includes only the components that actually have resolved content", () => {
  const summary = buildArcStateIntegrationSummary({ desiredState: "רוגע", urgeResponse: null, thoughtResponse: "  ", beliefResponse: "אמונה תומכת" });
  const labels = summary.map((item) => item.label);
  assert.ok(labels.includes("המצב הרצוי"));
  assert.ok(labels.includes("אמונה תומכת"));
  assert.ok(!labels.includes("התגובה המיועדת לדחף"));
  assert.ok(!labels.includes("תובנה או מחשבה תומכת"));
});

// --- recheck relevance ---

test("getRelevantArcStateRecheckItems always includes emotion and 'what changed', and urge only when selected", () => {
  const withoutUrge = getRelevantArcStateRecheckItems(["emotion", "thought"]);
  assert.deepEqual(withoutUrge.map((i) => i.kind), ["emotion", "whatChanged"]);
  const withUrge = getRelevantArcStateRecheckItems(["emotion", "urge"]);
  assert.deepEqual(withUrge.map((i) => i.kind), ["emotion", "urge", "whatChanged"]);
});

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, decision 1: three-way Presence routing
// ---------------------------------------------------------------------------

test("resolveArcStatePresenceRoute: 7-10 skips Presence entirely", () => {
  assert.equal(resolveArcStatePresenceRoute(7), "skip");
  assert.equal(resolveArcStatePresenceRoute(8), "skip");
  assert.equal(resolveArcStatePresenceRoute(9), "skip");
  assert.equal(resolveArcStatePresenceRoute(10), "skip");
});

test("resolveArcStatePresenceRoute: 4-6 runs the short Presence route", () => {
  assert.equal(resolveArcStatePresenceRoute(4), "short");
  assert.equal(resolveArcStatePresenceRoute(5), "short");
  assert.equal(resolveArcStatePresenceRoute(6), "short");
});

test("resolveArcStatePresenceRoute: 1-3 runs the full Presence route", () => {
  assert.equal(resolveArcStatePresenceRoute(1), "full");
  assert.equal(resolveArcStatePresenceRoute(2), "full");
  assert.equal(resolveArcStatePresenceRoute(3), "full");
});

test("resolveArcStatePresenceRoute: exact required boundary values (1, 3, 4, 6, 7, 10)", () => {
  assert.equal(resolveArcStatePresenceRoute(1), "full");
  assert.equal(resolveArcStatePresenceRoute(3), "full");
  assert.equal(resolveArcStatePresenceRoute(4), "short");
  assert.equal(resolveArcStatePresenceRoute(6), "short");
  assert.equal(resolveArcStatePresenceRoute(7), "skip");
  assert.equal(resolveArcStatePresenceRoute(10), "skip");
});

test("resolveArcStatePresenceRoute: missing/invalid values always default to the safe 'full' route, never 'skip'", () => {
  assert.equal(resolveArcStatePresenceRoute(null), "full");
  assert.equal(resolveArcStatePresenceRoute(0), "full");
  assert.equal(resolveArcStatePresenceRoute(11), "full");
  assert.equal(resolveArcStatePresenceRoute(-3), "full");
  assert.equal(resolveArcStatePresenceRoute(5.5), "full");
  assert.equal(resolveArcStatePresenceRoute(Number.NaN), "full");
});

test("resolveArcStatePresenceRoute: never adds a Micro Presence step -- the rating alone determines the route with no additional prerequisite stage", () => {
  // There is no third input/prerequisite parameter -- the function's own
  // signature (rating only) is itself the proof that no separate warm-up
  // stage is consulted before routing.
  assert.equal(resolveArcStatePresenceRoute.length, 1);
});

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task: zero-or-one derivative validation
// ---------------------------------------------------------------------------

test("validateOptionalComponentSelection: zero or one optional component is valid", () => {
  assert.deepEqual(validateOptionalComponentSelection([]), { valid: true, selectedCount: 0 });
  assert.deepEqual(validateOptionalComponentSelection(["emotion"]), { valid: true, selectedCount: 0 });
  assert.deepEqual(validateOptionalComponentSelection(["urge"]), { valid: true, selectedCount: 1 });
  assert.deepEqual(validateOptionalComponentSelection(["emotion", "thought"]), { valid: true, selectedCount: 1 });
});

test("validateOptionalComponentSelection: two or more optional components is invalid", () => {
  assert.deepEqual(validateOptionalComponentSelection(["urge", "thought"]), { valid: false, selectedCount: 2 });
  assert.deepEqual(validateOptionalComponentSelection(["urge", "thought", "belief"]), { valid: false, selectedCount: 3 });
  assert.deepEqual(validateOptionalComponentSelection(["emotion", "urge", "belief"]), { valid: false, selectedCount: 2 });
});

test("resolveSingleOptionalArcStateComponent: an explicit session selection wins, 'emotion' and null both mean 'None'", () => {
  assert.equal(resolveSingleOptionalArcStateComponent(null, "urge"), "urge");
  assert.equal(resolveSingleOptionalArcStateComponent(null, "thought"), "thought");
  assert.equal(resolveSingleOptionalArcStateComponent(null, "belief"), "belief");
  assert.equal(resolveSingleOptionalArcStateComponent(null, "emotion"), null);
  assert.equal(resolveSingleOptionalArcStateComponent(null, null), null);
});

test("resolveSingleOptionalArcStateComponent: null session selection falls back to the BUILD-configured default's own first optional component", () => {
  const composition: ArcStateComposition = { available: ["emotion", "urge", "thought"], defaultSelected: ["emotion", "thought"] };
  assert.equal(resolveSingleOptionalArcStateComponent(composition, null), "thought");
});

test("resolveSingleOptionalArcStateComponent: null session selection with no configured default (or only 'emotion' default) resolves to 'None'", () => {
  assert.equal(resolveSingleOptionalArcStateComponent(null, null), null);
  assert.equal(resolveSingleOptionalArcStateComponent(undefined, null), null);
  const emotionOnly: ArcStateComposition = { available: ["emotion"], defaultSelected: ["emotion"] };
  assert.equal(resolveSingleOptionalArcStateComponent(emotionOnly, null), null);
});

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 4: generalizing this composer to
// the Phase 3 libraries (StateProfile/IdentityProfile/InterferenceItem)
// ---------------------------------------------------------------------------

const NOW = "2026-01-01T00:00:00.000Z";

function stateProfileFixture(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("state1", "רוגע", "prog1", NOW), ...overrides };
}

function identityProfileFixture(overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return { ...createEmptyIdentityProfile("identity1", "אדם רגוע", "prog1", NOW), ...overrides };
}

// --- resolveArcStateComponentFromInterferenceItem ---

test("resolveArcStateComponentFromInterferenceItem: null item maps to null", () => {
  assert.equal(resolveArcStateComponentFromInterferenceItem(null), null);
});

test("resolveArcStateComponentFromInterferenceItem: a Thought item maps to 'thought'", () => {
  assert.equal(resolveArcStateComponentFromInterferenceItem(createEmptyThoughtInterferenceItem("t1", "x", null, NOW)), "thought");
});

test("resolveArcStateComponentFromInterferenceItem: a Belief item maps to 'belief'", () => {
  assert.equal(resolveArcStateComponentFromInterferenceItem(createEmptyBeliefInterferenceItem("b1", "x", null, NOW)), "belief");
});

test("resolveArcStateComponentFromInterferenceItem: an Urge item maps to 'urge'", () => {
  assert.equal(resolveArcStateComponentFromInterferenceItem(createEmptyUrgeInterferenceItem("u1", "x", null, NOW)), "urge");
});

test("resolveArcStateComponentFromInterferenceItem: an Emotion item maps to null -- the base emotion component is already always included, never duplicated", () => {
  assert.equal(resolveArcStateComponentFromInterferenceItem(createEmptyEmotionInterferenceItem("e1", "x", null, NOW)), null);
});

// --- seedEmbeddedUrgeLiveStateFromInterferenceItem ---

test("seedEmbeddedUrgeLiveStateFromInterferenceItem: maps visual/sensory/both/decide_in_live onto the embedded engine's own vocabulary (populated records)", () => {
  const visual = { ...createEmptyUrgeInterferenceItem("u1", "x", null, NOW), representationPreference: "visual" as const };
  assert.equal(seedEmbeddedUrgeLiveStateFromInterferenceItem(visual).representation, "visual");
  const sensory = { ...createEmptyUrgeInterferenceItem("u2", "x", null, NOW), representationPreference: "sensory" as const };
  assert.equal(seedEmbeddedUrgeLiveStateFromInterferenceItem(sensory).representation, "bodily");
  const both = { ...createEmptyUrgeInterferenceItem("u3", "x", null, NOW), representationPreference: "both" as const };
  assert.equal(seedEmbeddedUrgeLiveStateFromInterferenceItem(both).representation, "both");
});

test("seedEmbeddedUrgeLiveStateFromInterferenceItem: a sparse (freshly created) item defaults to decide_in_live, which seeds a null representation", () => {
  const sparse = createEmptyUrgeInterferenceItem("u4", "x", null, NOW);
  assert.equal(sparse.representationPreference, "decide_in_live", "sanity check on the fixture");
  assert.equal(seedEmbeddedUrgeLiveStateFromInterferenceItem(sparse).representation, null);
});

// --- seedEmbeddedThoughtLiveStateFromInterferenceItem ---

test("seedEmbeddedThoughtLiveStateFromInterferenceItem: seeds thoughtText from a populated item", () => {
  const item = { ...createEmptyThoughtInterferenceItem("t1", "x", null, NOW), thoughtText: "אני לא מספיק טוב" };
  const seeded = seedEmbeddedThoughtLiveStateFromInterferenceItem(item);
  assert.equal(seeded.thoughtText, "אני לא מספיק טוב");
  assert.equal(seeded.modality, null, "ThoughtInterferenceItem carries no modality field of its own -- stays at the safe default, asked fresh");
});

test("seedEmbeddedThoughtLiveStateFromInterferenceItem: a sparse item seeds safe defaults, never crashes", () => {
  const sparse = createEmptyThoughtInterferenceItem("t2", "x", null, NOW);
  const seeded = seedEmbeddedThoughtLiveStateFromInterferenceItem(sparse);
  assert.equal(seeded.thoughtText, null);
  assert.equal(seeded.timeOrientation, null);
});

// --- seedEmbeddedBeliefLiveStateFromInterferenceItem ---

test("seedEmbeddedBeliefLiveStateFromInterferenceItem: seeds limitingBeliefText from a populated item, safe default from a sparse one", () => {
  const populated = { ...createEmptyBeliefInterferenceItem("b1", "x", null, NOW), beliefText: "אני לא מתמיד" };
  assert.equal(seedEmbeddedBeliefLiveStateFromInterferenceItem(populated).limitingBeliefText, "אני לא מתמיד");
  const sparse = createEmptyBeliefInterferenceItem("b2", "x", null, NOW);
  assert.equal(seedEmbeddedBeliefLiveStateFromInterferenceItem(sparse).limitingBeliefText, null);
});

// --- isPreventiveStoppingRelevantForInterferenceItem ---

test("isPreventiveStoppingRelevantForInterferenceItem: true only for a non-blank Urge preventiveStoppingAction", () => {
  const withAction = { ...createEmptyUrgeInterferenceItem("u1", "x", null, NOW), preventiveStoppingAction: "להניח את הטלפון" };
  assert.equal(isPreventiveStoppingRelevantForInterferenceItem(withAction), true);
});

test("isPreventiveStoppingRelevantForInterferenceItem: false for null, every non-urge category (Emotion included), and a blank urge action", () => {
  assert.equal(isPreventiveStoppingRelevantForInterferenceItem(null), false);
  assert.equal(isPreventiveStoppingRelevantForInterferenceItem(createEmptyThoughtInterferenceItem("t1", "x", null, NOW)), false);
  assert.equal(isPreventiveStoppingRelevantForInterferenceItem(createEmptyBeliefInterferenceItem("b1", "x", null, NOW)), false);
  assert.equal(isPreventiveStoppingRelevantForInterferenceItem(createEmptyEmotionInterferenceItem("e1", "x", null, NOW)), false);
  const blank = { ...createEmptyUrgeInterferenceItem("u2", "x", null, NOW), preventiveStoppingAction: "   " };
  assert.equal(isPreventiveStoppingRelevantForInterferenceItem(blank), false);
});

// --- resolveArcStateEncodingContentFromLibrary: base-only resolution ---

test("resolveArcStateEncodingContentFromLibrary: base-only resolution when there is no item and no identity", () => {
  const state = stateProfileFixture({ regulationAnchor: "נשימה", encodingCue: "יד על הלב", action: "לצאת להליכה" });
  const result = resolveArcStateEncodingContentFromLibrary(state, null, null);
  assert.equal(result.regulationCue, "נשימה");
  assert.equal(result.encodingCue, "יד על הלב");
  assert.equal(result.action, "לצאת להליכה");
  assert.equal(result.recognitionContext, null);
  assert.equal(result.resolvedIdentityId, null);
  assert.equal(result.identityEncodingCue, null);
  assert.equal(result.identityAction, null);
});

// --- Item override over base ---

test("resolveArcStateEncodingContentFromLibrary: a Thought item's own regulationCue overrides the base StateProfile's regulationAnchor", () => {
  const state = stateProfileFixture({ regulationAnchor: "נשימה בסיסית" });
  const item = { ...createEmptyThoughtInterferenceItem("t1", "x", null, NOW), regulationCue: "יד על החזה" };
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.equal(result.regulationCue, "יד על החזה");
});

test("resolveArcStateEncodingContentFromLibrary: an Urge item's own visual/sensory Encoding config overrides the base StateProfile's encodingCue", () => {
  const state = stateProfileFixture({ encodingCue: "יד על הלב" });
  const visual = { ...createEmptyUrgeInterferenceItem("u1", "x", null, NOW), representationPreference: "visual" as const, visualEncodingConfig: "להקטין את התמונה" };
  const result = resolveArcStateEncodingContentFromLibrary(state, visual, null);
  assert.equal(result.encodingCue, "להקטין את התמונה");
});

test("resolveArcStateEncodingContentFromLibrary: no InterferenceItem category has its own 'action' field -- action always resolves from the base StateProfile (or a Mini override)", () => {
  const state = stateProfileFixture({ action: "לצאת להליכה" });
  const urge = { ...createEmptyUrgeInterferenceItem("u1", "x", null, NOW), preventiveStoppingAction: "להניח את הטלפון" };
  const result = resolveArcStateEncodingContentFromLibrary(state, urge, null);
  assert.equal(result.action, "לצאת להליכה", "preventiveStoppingAction is a STOP action, never mistaken for the State's own beneficial action");
});

// --- Mini override over item and base, field-by-field ---

test("resolveArcStateEncodingContentFromLibrary: MiniOverrideConfig wins over both the item's own field and the base StateProfile, independently per field", () => {
  const state = stateProfileFixture({ regulationAnchor: "בסיס", encodingCue: "בסיס", action: "בסיס" });
  const item = {
    ...createEmptyThoughtInterferenceItem("t1", "x", null, NOW),
    regulationCue: "מרמת הפריט",
    miniOverride: { ...createEmptyMiniOverrideConfig(), regulationAnchorOverride: "מיני", encodingCueOverride: "מיני קידוד", stateActionOverride: "מיני פעולה" },
  };
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.equal(result.regulationCue, "מיני");
  assert.equal(result.encodingCue, "מיני קידוד");
  assert.equal(result.action, "מיני פעולה");
});

test("resolveArcStateEncodingContentFromLibrary: an unset Mini field falls back to the item's own field independently, not straight to base", () => {
  const state = stateProfileFixture({ regulationAnchor: "בסיס" });
  const item = {
    ...createEmptyThoughtInterferenceItem("t1", "x", null, NOW),
    regulationCue: "מרמת הפריט",
    miniOverride: createEmptyMiniOverrideConfig(),
  };
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.equal(result.regulationCue, "מרמת הפריט");
});

// --- Effective Identity resolution (via resolveEffectiveIdentityForInterferenceItem, never reimplemented) ---

test("resolveArcStateEncodingContentFromLibrary: Identity override precedence -- item override wins over the State's own primary Identity", () => {
  const state = stateProfileFixture({ primaryIdentityProfileId: "state-identity" });
  const item = { ...createEmptyThoughtInterferenceItem("t1", "x", null, NOW), identityProfileIdOverride: "item-identity" };
  const identity = identityProfileFixture({ id: "item-identity", encodingCue: "מנטרה", action: "לרוץ" });
  const expected = resolveEffectiveIdentityForInterferenceItem(item, state);
  const result = resolveArcStateEncodingContentFromLibrary(state, item, identity);
  assert.equal(result.resolvedIdentityId, expected, "matches the relationship helper's own output exactly -- never reimplemented here");
  assert.equal(result.resolvedIdentityId, "item-identity");
  assert.equal(result.identityEncodingCue, "מנטרה");
  assert.equal(result.identityAction, "לרוץ");
});

test("resolveArcStateEncodingContentFromLibrary: with no item override, falls back to the State's own primary Identity", () => {
  const state = stateProfileFixture({ primaryIdentityProfileId: "state-identity" });
  const item = createEmptyThoughtInterferenceItem("t1", "x", null, NOW);
  const identity = identityProfileFixture({ id: "state-identity" });
  const result = resolveArcStateEncodingContentFromLibrary(state, item, identity);
  assert.equal(result.resolvedIdentityId, "state-identity");
});

test("resolveArcStateEncodingContentFromLibrary: with no item at all, Identity falls back to the State's own primary Identity", () => {
  const state = stateProfileFixture({ primaryIdentityProfileId: "state-identity" });
  const identity = identityProfileFixture({ id: "state-identity" });
  const result = resolveArcStateEncodingContentFromLibrary(state, null, identity);
  assert.equal(result.resolvedIdentityId, "state-identity");
});

// --- Unresolved Identity safety ---

test("resolveArcStateEncodingContentFromLibrary: no Identity resolves (Self Development allows no Identity) -- safe null, never a crash", () => {
  const state = stateProfileFixture({ primaryIdentityProfileId: null });
  const item = createEmptyThoughtInterferenceItem("t1", "x", null, NOW);
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.equal(result.resolvedIdentityId, null);
  assert.equal(result.identityEncodingCue, null);
  assert.equal(result.identityAction, null);
});

test("resolveArcStateEncodingContentFromLibrary: a mismatched candidate Identity is never used, even when one happens to be passed in", () => {
  const state = stateProfileFixture({ primaryIdentityProfileId: "expected-identity" });
  const item = createEmptyThoughtInterferenceItem("t1", "x", null, NOW);
  const wrongIdentity = identityProfileFixture({ id: "some-other-identity", encodingCue: "לא רלוונטי" });
  const result = resolveArcStateEncodingContentFromLibrary(state, item, wrongIdentity);
  assert.equal(result.resolvedIdentityId, "expected-identity");
  assert.equal(result.identityEncodingCue, null, "the passed-in identity's id doesn't match what actually resolved, so its content is never used");
});

// --- Blank override behavior ---

test("resolveArcStateEncodingContentFromLibrary: a blank/whitespace-only item field never erases a meaningful base value", () => {
  const state = stateProfileFixture({ regulationAnchor: "נשימה משמעותית" });
  const item = { ...createEmptyThoughtInterferenceItem("t1", "x", null, NOW), regulationCue: "   " };
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.equal(result.regulationCue, "נשימה משמעותית");
});

test("resolveArcStateEncodingContentFromLibrary: a blank/whitespace-only Mini override never erases a meaningful item or base value", () => {
  const state = stateProfileFixture({ regulationAnchor: "בסיס" });
  const item = {
    ...createEmptyThoughtInterferenceItem("t1", "x", null, NOW),
    regulationCue: "מרמת הפריט",
    miniOverride: { ...createEmptyMiniOverrideConfig(), regulationAnchorOverride: "   " },
  };
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.equal(result.regulationCue, "מרמת הפריט");
});

// --- Emotion clarification: the item's content is still contributed, never discarded ---

test("Emotion clarification #1: an Emotion item does not add a duplicate Emotion component", () => {
  const emotionItem = createEmptyEmotionInterferenceItem("e1", "תסכול", "prog1", NOW);
  assert.equal(resolveArcStateComponentFromInterferenceItem(emotionItem), null);
});

test("Emotion clarification #2: an Emotion item's saved content (name/situation/trigger/description/regulationCue) still contributes to the composed session", () => {
  const state = stateProfileFixture({ regulationAnchor: "נשימה בסיסית" });
  const item = {
    ...createEmptyEmotionInterferenceItem("e1", "תסכול", "prog1", NOW),
    emotionName: "תסכול",
    situationContext: "בזמן עבודה מול לוח זמנים",
    triggerInfo: "הערה של מנהל",
    description: "מתעורר כשמרגיש לא נראה",
    regulationCue: "כפות רגליים על הרצפה",
  };
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.ok(result.recognitionContext !== null);
  assert.match(result.recognitionContext as string, /תסכול/);
  assert.match(result.recognitionContext as string, /בזמן עבודה מול לוח זמנים/);
  assert.match(result.recognitionContext as string, /הערה של מנהל/);
  assert.match(result.recognitionContext as string, /מתעורר כשמרגיש לא נראה/);
  assert.equal(result.regulationCue, "כפות רגליים על הרצפה", "the item's own regulationCue overrides the base State's regulationAnchor -- never discarded");
});

test("Emotion clarification #3: an Emotion item's primaryStateProfileId identifies the StateProfile resolveArcStateEncodingContentFromLibrary treats as its linked base State", () => {
  const state = stateProfileFixture({ id: "state1", encodingCue: "יד על החזה", action: "לצאת להליכה" });
  const item = { ...createEmptyEmotionInterferenceItem("e1", "תסכול", "prog1", NOW), primaryStateProfileId: state.id };
  assert.equal(item.primaryStateProfileId, state.id, "the item's own reference points at the State passed in as `state`");
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.equal(result.encodingCue, "יד על החזה", "resolved from the linked State, since Emotion has no encoding-cue field of its own -- see this section's own 'Reported gap' doc");
  assert.equal(result.action, "לצאת להליכה");
});

test("Emotion clarification #4: an Emotion item's identityProfileIdOverride is resolved through resolveEffectiveIdentityForInterferenceItem, never reimplemented", () => {
  const state = stateProfileFixture({ primaryIdentityProfileId: "state-identity" });
  const item = { ...createEmptyEmotionInterferenceItem("e1", "תסכול", "prog1", NOW), identityProfileIdOverride: "item-identity" };
  const expected = resolveEffectiveIdentityForInterferenceItem(item, state);
  const result = resolveArcStateEncodingContentFromLibrary(state, item, null);
  assert.equal(result.resolvedIdentityId, expected);
  assert.equal(result.resolvedIdentityId, "item-identity");
});

test("Emotion clarification #5: no input record (StateProfile, EmotionInterferenceItem, IdentityProfile) is mutated", () => {
  const state = stateProfileFixture();
  const item = { ...createEmptyEmotionInterferenceItem("e1", "תסכול", "prog1", NOW), regulationCue: "x", miniOverride: createEmptyMiniOverrideConfig() };
  const identity = identityProfileFixture();
  const stateCopy = JSON.parse(JSON.stringify(state));
  const itemCopy = JSON.parse(JSON.stringify(item));
  const identityCopy = JSON.parse(JSON.stringify(identity));
  resolveArcStateEncodingContentFromLibrary(state, item, identity);
  assert.deepEqual(state, stateCopy);
  assert.deepEqual(item, itemCopy);
  assert.deepEqual(identity, identityCopy);
});

// --- No input mutation (general, beyond Emotion) ---

test("seedEmbedded*LiveStateFromInterferenceItem functions never mutate their input item", () => {
  const urgeItem = createEmptyUrgeInterferenceItem("u1", "x", null, NOW);
  const urgeCopy = JSON.parse(JSON.stringify(urgeItem));
  seedEmbeddedUrgeLiveStateFromInterferenceItem(urgeItem);
  assert.deepEqual(urgeItem, urgeCopy);

  const thoughtItem = createEmptyThoughtInterferenceItem("t1", "x", null, NOW);
  const thoughtCopy = JSON.parse(JSON.stringify(thoughtItem));
  seedEmbeddedThoughtLiveStateFromInterferenceItem(thoughtItem);
  assert.deepEqual(thoughtItem, thoughtCopy);

  const beliefItem = createEmptyBeliefInterferenceItem("b1", "x", null, NOW);
  const beliefCopy = JSON.parse(JSON.stringify(beliefItem));
  seedEmbeddedBeliefLiveStateFromInterferenceItem(beliefItem);
  assert.deepEqual(beliefItem, beliefCopy);
});

test("isPreventiveStoppingRelevantForInterferenceItem never mutates its input item", () => {
  const item = { ...createEmptyUrgeInterferenceItem("u1", "x", null, NOW), preventiveStoppingAction: "x" };
  const copy = JSON.parse(JSON.stringify(item));
  isPreventiveStoppingRelevantForInterferenceItem(item);
  assert.deepEqual(item, copy);
});

// --- Existing composer-export regression parity ---

test("Phase 4 additions leave every existing composer export's behavior unchanged", () => {
  assert.deepEqual(resolveEffectiveArcStateComponents(null, null), ["emotion"]);
  assert.equal(resolveArcStatePresenceRoute(8), "skip");
  assert.equal(resolveArcStatePresenceRoute(5), "short");
  assert.equal(resolveArcStatePresenceRoute(2), "full");
  assert.deepEqual(validateOptionalComponentSelection(["urge", "thought"]), { valid: false, selectedCount: 2 });
  assert.equal(isPreventiveStoppingRelevant(["emotion", "urge"], "state", createEmptyArcBuildProfile()), false);
  const session = createEmptyArcStateComposedSession(["emotion", "urge"]);
  assert.equal(getNextEncodingComponent(session), "urge");
});
