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
  markAcceptanceCompleted,
  markAwarenessCompleted,
  markBridgeMantraCompleted,
  markComponentEncoded,
  markPresenceCompleted,
  markRegulationCompleted,
  markStayCompleted,
  resolveEffectiveArcStateComponents,
  seedEmbeddedBeliefLiveState,
  seedEmbeddedThoughtLiveState,
  seedEmbeddedUrgeLiveState,
  shouldShowSharedBridgeMantra,
} from "./arcStateComposer.ts";
import type { ArcStateComponentKind, ArcStateComposition } from "./types.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import { getFirstBeliefLiveStage, getFirstEmbeddedBeliefLiveStage } from "./beliefLive.ts";
import { getFirstEmbeddedThoughtLiveStage, getFirstThoughtLiveStage } from "./thoughtLive.ts";
import { getFirstEmbeddedUrgeLiveStage, getFirstUrgeLiveStage } from "./urgeLive.ts";

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
