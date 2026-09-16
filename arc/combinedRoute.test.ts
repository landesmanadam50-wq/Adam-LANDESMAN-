import test from "node:test";
import assert from "node:assert/strict";

import {
  SHARED_SESSION_STAGE_NAMES,
  buildCombinedRouteCoreSteps,
  buildCombinedRoutePlan,
  createEmptyCombinedRouteSessionFacts,
  deriveCompletedInterferenceTypes,
  resolveFinalPresenceMode,
  resolveInterferenceSelectionForSession,
  resolvePresenceRoute,
} from "./combinedRoute.ts";
import type { CombinedRoutePlanResult, CombinedRouteStep } from "./combinedRoute.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
} from "./interferenceItem.ts";
import type { InterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { archiveLibraryItem, disableLibraryItem } from "./libraryItemStatus.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function thought(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem(id, `מחשבה ${id}`, null, NOW), ...overrides } as InterferenceItem;
}
function belief(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyBeliefInterferenceItem(id, `אמונה ${id}`, null, NOW), ...overrides } as InterferenceItem;
}
function emotion(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem(id, `רגש ${id}`, null, NOW), ...overrides } as InterferenceItem;
}
function urge(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem(id, `דחף ${id}`, null, NOW), ...overrides } as InterferenceItem;
}

function kinds(steps: CombinedRouteStep[]): string[] {
  return steps.map((step) => step.kind);
}

function expectPlan(result: CombinedRoutePlanResult): Extract<CombinedRoutePlanResult, { kind: "plan" }> {
  assert.equal(result.kind, "plan");
  return result as Extract<CombinedRoutePlanResult, { kind: "plan" }>;
}

// ---------------------------------------------------------------------------
// resolveInterferenceSelectionForSession
// ---------------------------------------------------------------------------

test("resolveInterferenceSelectionForSession: enabled items resolve to active, in dedup order", () => {
  const t1 = thought("t1");
  const b1 = belief("b1");
  const result = resolveInterferenceSelectionForSession(["t1", "b1", "t1"], [t1, b1]);
  assert.deepEqual(
    result.active.map((i) => i.id),
    ["t1", "b1"]
  );
  assert.deepEqual(result.excluded, []);
});

test("resolveInterferenceSelectionForSession: disabled/archived/missing are excluded with the correct reason, never practiced", () => {
  const enabled = thought("t1");
  const disabled = disableLibraryItem(belief("b1"), NOW);
  const archived = archiveLibraryItem(urge("u1"), NOW);
  const result = resolveInterferenceSelectionForSession(["t1", "b1", "u1", "missing1"], [enabled, disabled, archived]);
  assert.deepEqual(
    result.active.map((i) => i.id),
    ["t1"]
  );
  assert.deepEqual(result.excluded, [
    { id: "b1", reason: "disabled" },
    { id: "u1", reason: "archived" },
    { id: "missing1", reason: "not_found" },
  ]);
});

test("resolveInterferenceSelectionForSession: duplicate ids removed first-occurrence-wins", () => {
  const t1 = thought("t1");
  const result = resolveInterferenceSelectionForSession(["t1", "t1", "t1"], [t1]);
  assert.equal(result.active.length, 1);
});

test("resolveInterferenceSelectionForSession: never mutates the selectedItemIds array or the known-items array", () => {
  const items = [thought("t1"), belief("b1")];
  const itemsCopy = JSON.parse(JSON.stringify(items));
  const selectedIds = ["t1", "b1", "missing1"];
  const selectedIdsCopy = [...selectedIds];
  resolveInterferenceSelectionForSession(selectedIds, items);
  assert.deepEqual(items, itemsCopy);
  assert.deepEqual(selectedIds, selectedIdsCopy);
});

test("resolveInterferenceSelectionForSession: the stored/known item list itself is never rewritten -- a disabled item's own fields (e.g. urge visual/sensory config) ride through unchanged, correctly attached to its own id", () => {
  const u1 = urge("u1", { visualEncodingConfig: "דימוי A", sensoryEncodingConfig: "תחושה A" });
  const u2 = urge("u2", { visualEncodingConfig: "דימוי B", sensoryEncodingConfig: "תחושה B" });
  const result = resolveInterferenceSelectionForSession(["u2", "u1"], [u1, u2]);
  const resolvedU1 = result.active.find((i) => i.id === "u1") as UrgeInterferenceItem;
  const resolvedU2 = result.active.find((i) => i.id === "u2") as UrgeInterferenceItem;
  assert.equal(resolvedU1.visualEncodingConfig, "דימוי A");
  assert.equal(resolvedU2.visualEncodingConfig, "דימוי B");
  assert.equal(resolvedU1.sensoryEncodingConfig, "תחושה A");
});

// ---------------------------------------------------------------------------
// buildCombinedRoutePlan -- ordering
// ---------------------------------------------------------------------------

test("Thought only: recognition -> alternative -> future_insight -> reassessment -> presence decision", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  assert.deepEqual(kinds(plan.steps), ["thought_recognition", "thought_alternative", "thought_future_insight", "cognitive_reassessment", "beneficial_action_boundary"]);
});

test("Thought only, still stuck, Presence not configured: embedded Presence step appears", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1")], presenceEnabled: false, reassessmentAnswer: "still_stuck", fullPresenceAccepted: null }));
  assert.deepEqual(kinds(plan.steps), ["thought_recognition", "thought_alternative", "thought_future_insight", "cognitive_reassessment", "presence_embedded", "beneficial_action_boundary"]);
  assert.equal(plan.finalPresenceMode, "embedded");
});

test("Belief only, not stuck: recognition -> alternative -> reassessment -> skip, no future_insight (Thought-only concept)", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [belief("b1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  assert.deepEqual(kinds(plan.steps), ["belief_recognition", "belief_alternative", "cognitive_reassessment", "beneficial_action_boundary"]);
  assert.equal(plan.finalPresenceMode, "skipped");
});

test("Belief only, still stuck: embedded Presence appears", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [belief("b1")], presenceEnabled: false, reassessmentAnswer: "still_stuck", fullPresenceAccepted: null }));
  assert.deepEqual(kinds(plan.steps), ["belief_recognition", "belief_alternative", "cognitive_reassessment", "presence_embedded", "beneficial_action_boundary"]);
});

test("Thought + Belief: thought_recognition precedes belief_recognition", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1"), belief("b1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  const order = kinds(plan.steps);
  assert.ok(order.indexOf("thought_recognition") < order.indexOf("belief_recognition"));
});

test("Thought + Belief: belief_alternative precedes thought_alternative", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1"), belief("b1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  const order = kinds(plan.steps);
  assert.ok(order.indexOf("belief_alternative") < order.indexOf("thought_alternative"));
});

test("Thought + Belief: exact canonical step sequence -- one coherent route, never two complete protocols", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1"), belief("b1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  // No thought_future_insight (Thought+Belief's own literal worked example omits it), no repeated
  // recognition/reassessment, and critically: no Stay/Acceptance/Regulation/Success Focus/Gratitude
  // anywhere -- those belong to the surrounding pipeline, never emitted twice (or at all) here.
  assert.deepEqual(kinds(plan.steps), [
    "thought_recognition",
    "belief_recognition",
    "belief_alternative",
    "thought_alternative",
    "cognitive_reassessment",
    "beneficial_action_boundary",
  ]);
});

test("Thought + Belief + Emotion + Urge: Emotion/Urge recognition+support falls between cognitive recognition and alternative meaning", () => {
  const plan = expectPlan(
    buildCombinedRoutePlan({
      selectedItems: [thought("t1"), belief("b1"), emotion("e1"), urge("u1", { preventiveStoppingAction: "עצור" })],
      presenceEnabled: false,
      reassessmentAnswer: "not_stuck",
      fullPresenceAccepted: null,
    })
  );
  const order = kinds(plan.steps);
  const afterRecognition = order.indexOf("belief_recognition");
  const beforeAlternative = order.indexOf("belief_alternative");
  assert.ok(order.indexOf("emotion_recognition") > afterRecognition && order.indexOf("emotion_recognition") < beforeAlternative);
  assert.ok(order.indexOf("emotion_support") > afterRecognition && order.indexOf("emotion_support") < beforeAlternative);
  assert.ok(order.indexOf("urge_recognition") > afterRecognition && order.indexOf("urge_recognition") < beforeAlternative);
  assert.ok(order.indexOf("urge_support") > afterRecognition && order.indexOf("urge_support") < beforeAlternative);
  assert.ok(order.indexOf("emotion_recognition") < order.indexOf("emotion_support"));
  assert.ok(order.indexOf("urge_recognition") < order.indexOf("urge_preventive_stopping"));
  assert.ok(order.indexOf("urge_preventive_stopping") < order.indexOf("urge_support"));
});

test("Emotion + Thought: canonical rank places thought before emotion", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [emotion("e1"), thought("t1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  const order = kinds(plan.steps);
  assert.ok(order.indexOf("thought_recognition") < order.indexOf("emotion_support"));
});

test("Urge + Thought: canonical rank places thought before urge", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [urge("u1"), thought("t1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  const order = kinds(plan.steps);
  assert.ok(order.indexOf("thought_recognition") < order.indexOf("urge_support"));
});

test("Emotion + Urge + Belief (no Thought): canonical rank places belief before emotion before urge", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [emotion("e1"), urge("u1"), belief("b1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  const order = kinds(plan.steps);
  assert.ok(order.indexOf("belief_recognition") < order.indexOf("emotion_support"));
  assert.ok(order.indexOf("emotion_support") < order.indexOf("urge_support"));
  assert.equal(order.includes("thought_recognition"), false);
});

test("Same-category order is stable across both the recognition pass and the alternative pass", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t2"), thought("t1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  const recognitionIds = plan.steps.filter((s) => s.kind === "thought_recognition").map((s) => s.itemId);
  const alternativeIds = plan.steps.filter((s) => s.kind === "thought_alternative").map((s) => s.itemId);
  assert.deepEqual(recognitionIds, ["t2", "t1"]);
  assert.deepEqual(alternativeIds, ["t2", "t1"]);
});

// ---------------------------------------------------------------------------
// Urge-specific preservation
// ---------------------------------------------------------------------------

test("urge_preventive_stopping appears only when the item's own preventiveStoppingAction is set", () => {
  const withStop = urge("u1", { preventiveStoppingAction: "עצור עכשיו" });
  const planWith = expectPlan(buildCombinedRoutePlan({ selectedItems: [withStop], presenceEnabled: false, reassessmentAnswer: null, fullPresenceAccepted: null }));
  assert.ok(kinds(planWith.steps).includes("urge_preventive_stopping"));

  const withoutStop = urge("u2");
  const planWithout = expectPlan(buildCombinedRoutePlan({ selectedItems: [withoutStop], presenceEnabled: false, reassessmentAnswer: null, fullPresenceAccepted: null }));
  assert.equal(kinds(planWithout.steps).includes("urge_preventive_stopping"), false);
});

test("urge_support always appears for a selected Urge item, regardless of preventive stopping", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [urge("u1")], presenceEnabled: false, reassessmentAnswer: null, fullPresenceAccepted: null }));
  assert.ok(kinds(plan.steps).includes("urge_support"));
});

// ---------------------------------------------------------------------------
// Phase 14B: buildCombinedRouteCoreSteps -- the single shared core-step
// builder, consumed as-is by buildCombinedRoutePlan (never a second,
// independently-derived category loop).
// ---------------------------------------------------------------------------

test("buildCombinedRouteCoreSteps: every selected Emotion item gets its own emotion_recognition immediately before its own emotion_support", () => {
  const steps = buildCombinedRouteCoreSteps([emotion("e1")]);
  const order = kinds(steps);
  assert.deepEqual(order, ["emotion_recognition", "emotion_support"]);
});

test("buildCombinedRouteCoreSteps: every selected Urge item gets its own urge_recognition immediately before preventive stopping/support", () => {
  const steps = buildCombinedRouteCoreSteps([urge("u1", { preventiveStoppingAction: "עצור" })]);
  const order = kinds(steps);
  assert.deepEqual(order, ["urge_recognition", "urge_preventive_stopping", "urge_support"]);
});

test("buildCombinedRouteCoreSteps: buildCombinedRoutePlan consumes this exact output verbatim for its own core steps", () => {
  const items = [thought("t1"), belief("b1"), emotion("e1"), urge("u1")];
  const core = buildCombinedRouteCoreSteps(items);
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: items, presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  assert.deepEqual(plan.steps.slice(0, core.length), core);
});

// ---------------------------------------------------------------------------
// Shared stages never appear
// ---------------------------------------------------------------------------

test("no combined route ever contains a shared-session stage name (Stay/Acceptance/Regulation/Success Focus/Gratitude)", () => {
  const combos: InterferenceItem[][] = [
    [thought("t1")],
    [belief("b1")],
    [thought("t1"), belief("b1")],
    [thought("t1"), belief("b1"), emotion("e1"), urge("u1")],
    [emotion("e1"), urge("u1")],
  ];
  for (const selectedItems of combos) {
    for (const reassessmentAnswer of ["not_stuck", "still_stuck", null] as const) {
      for (const presenceEnabled of [true, false]) {
        const result = buildCombinedRoutePlan({ selectedItems, presenceEnabled, reassessmentAnswer, fullPresenceAccepted: true });
        if (result.kind !== "plan") continue;
        for (const step of result.steps) {
          assert.equal((SHARED_SESSION_STAGE_NAMES as readonly string[]).includes(step.kind), false, `step kind "${step.kind}" must never be a shared-stage name`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Presence routing
// ---------------------------------------------------------------------------

test("Thought/Belief practiced + not stuck + Presence not selected -> skip", () => {
  assert.equal(resolvePresenceRoute({ cognitiveWorkSelected: true, emotionOrUrgeOnlySelected: false, presenceEnabled: false, reassessmentAnswer: "not_stuck" }), "skip");
});

test("Thought/Belief practiced + still stuck + Presence not selected -> embedded", () => {
  assert.equal(resolvePresenceRoute({ cognitiveWorkSelected: true, emotionOrUrgeOnlySelected: false, presenceEnabled: false, reassessmentAnswer: "still_stuck" }), "embedded");
});

test("Thought/Belief practiced + not stuck + Presence selected -> full_optional", () => {
  assert.equal(resolvePresenceRoute({ cognitiveWorkSelected: true, emotionOrUrgeOnlySelected: false, presenceEnabled: true, reassessmentAnswer: "not_stuck" }), "full_optional");
});

test("Thought/Belief practiced + still stuck + Presence selected -> full_required", () => {
  assert.equal(resolvePresenceRoute({ cognitiveWorkSelected: true, emotionOrUrgeOnlySelected: false, presenceEnabled: true, reassessmentAnswer: "still_stuck" }), "full_required");
});

test("Emotion/Urge only + Presence selected -> full_required, and the plan never emits cognitive_reassessment", () => {
  assert.equal(resolvePresenceRoute({ cognitiveWorkSelected: false, emotionOrUrgeOnlySelected: true, presenceEnabled: true, reassessmentAnswer: null }), "full_required");
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [emotion("e1"), urge("u1")], presenceEnabled: true, reassessmentAnswer: null, fullPresenceAccepted: null }));
  assert.equal(kinds(plan.steps).includes("cognitive_reassessment"), false);
  assert.equal(plan.finalPresenceMode, "full");
  assert.ok(kinds(plan.steps).includes("presence_full"));
});

test("no cognitive work, no Emotion/Urge, Presence not selected -> not_applicable", () => {
  assert.equal(resolvePresenceRoute({ cognitiveWorkSelected: false, emotionOrUrgeOnlySelected: false, presenceEnabled: false, reassessmentAnswer: null }), "not_applicable");
});

test("embedded is reachable only when cognitive work was selected and the answer is still_stuck -- never for Emotion/Urge-only", () => {
  assert.notEqual(resolvePresenceRoute({ cognitiveWorkSelected: false, emotionOrUrgeOnlySelected: true, presenceEnabled: false, reassessmentAnswer: "still_stuck" }), "embedded");
  assert.equal(resolvePresenceRoute({ cognitiveWorkSelected: false, emotionOrUrgeOnlySelected: true, presenceEnabled: false, reassessmentAnswer: "still_stuck" }), "not_applicable");
});

test("embedded and full Presence steps never both appear in the same plan, across every decision", () => {
  const decisions: Array<{ presenceEnabled: boolean; reassessmentAnswer: "not_stuck" | "still_stuck" | null; fullPresenceAccepted: boolean | null }> = [
    { presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null },
    { presenceEnabled: false, reassessmentAnswer: "still_stuck", fullPresenceAccepted: null },
    { presenceEnabled: true, reassessmentAnswer: "not_stuck", fullPresenceAccepted: true },
    { presenceEnabled: true, reassessmentAnswer: "not_stuck", fullPresenceAccepted: false },
    { presenceEnabled: true, reassessmentAnswer: "still_stuck", fullPresenceAccepted: null },
  ];
  for (const d of decisions) {
    const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1")], ...d }));
    const stepKinds = kinds(plan.steps);
    const hasEmbedded = stepKinds.includes("presence_embedded");
    const hasFull = stepKinds.includes("presence_full");
    assert.equal(hasEmbedded && hasFull, false);
  }
});

test("full_optional declined -> final presenceMode is skipped, no presence_full step", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1")], presenceEnabled: true, reassessmentAnswer: "not_stuck", fullPresenceAccepted: false }));
  assert.equal(plan.presenceDecision, "full_optional");
  assert.equal(plan.finalPresenceMode, "skipped");
  assert.equal(kinds(plan.steps).includes("presence_full"), false);
});

test("full_optional accepted -> final presenceMode is full, presence_full step present", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1")], presenceEnabled: true, reassessmentAnswer: "not_stuck", fullPresenceAccepted: true }));
  assert.equal(plan.presenceDecision, "full_optional");
  assert.equal(plan.finalPresenceMode, "full");
  assert.ok(kinds(plan.steps).includes("presence_full"));
});

test("resolveFinalPresenceMode: not_applicable and skip both resolve to skipped", () => {
  assert.equal(resolveFinalPresenceMode("not_applicable", null), "skipped");
  assert.equal(resolveFinalPresenceMode("skip", null), "skipped");
});

// ---------------------------------------------------------------------------
// Presence-only delegation / empty selection
// ---------------------------------------------------------------------------

test("Presence-only (no items selected) is rejected as no_active_items -- delegated to the existing standalone Presence protocol, never composed here", () => {
  const result = buildCombinedRoutePlan({ selectedItems: [], presenceEnabled: true, reassessmentAnswer: null, fullPresenceAccepted: null });
  assert.deepEqual(result, { kind: "no_active_items" });
});

test("a genuinely empty selection with Presence disabled is also rejected, never fabricated into a route", () => {
  const result = buildCombinedRoutePlan({ selectedItems: [], presenceEnabled: false, reassessmentAnswer: null, fullPresenceAccepted: null });
  assert.deepEqual(result, { kind: "no_active_items" });
});

// ---------------------------------------------------------------------------
// Single-item backward compatibility
// ---------------------------------------------------------------------------

test("a single selected Thought item resolves to a minimal, correct plan -- no Belief/Emotion/Urge steps appear", () => {
  const plan = expectPlan(buildCombinedRoutePlan({ selectedItems: [thought("t1")], presenceEnabled: false, reassessmentAnswer: "not_stuck", fullPresenceAccepted: null }));
  for (const step of plan.steps) {
    assert.equal(
      ["belief_recognition", "belief_alternative", "emotion_recognition", "emotion_support", "urge_recognition", "urge_support", "urge_preventive_stopping"].includes(step.kind),
      false
    );
  }
});

// ---------------------------------------------------------------------------
// Session facts: configured / selected / practiced stay distinct
// ---------------------------------------------------------------------------

test("CombinedRouteSessionFacts keeps configuredItemIds, selectedItemIds, and practicedItemIds as independent fields", () => {
  const facts = createEmptyCombinedRouteSessionFacts(["a", "b", "c"]);
  const populated = { ...facts, selectedItemIds: ["a", "b"], practicedItemIds: ["a"] };
  assert.deepEqual(populated.configuredItemIds, ["a", "b", "c"]);
  assert.deepEqual(populated.selectedItemIds, ["a", "b"]);
  assert.deepEqual(populated.practicedItemIds, ["a"]);
  assert.notDeepEqual(populated.configuredItemIds, populated.selectedItemIds);
  assert.notDeepEqual(populated.selectedItemIds, populated.practicedItemIds);
});

test("createEmptyCombinedRouteSessionFacts dedupes the configured snapshot it's given", () => {
  const facts = createEmptyCombinedRouteSessionFacts(["a", "a", "b"]);
  assert.deepEqual(facts.configuredItemIds, ["a", "b"]);
});

// ---------------------------------------------------------------------------
// deriveCompletedInterferenceTypes: two items of the same category -> one type
// ---------------------------------------------------------------------------

test("two practiced Thought items still produce exactly one Thought completedType", () => {
  const types = deriveCompletedInterferenceTypes([thought("t1"), thought("t2")]);
  assert.deepEqual(types, ["thought"]);
});

test("deriveCompletedInterferenceTypes dedupes across mixed categories, preserving first-seen order", () => {
  const types = deriveCompletedInterferenceTypes([thought("t1"), belief("b1"), thought("t2"), urge("u1")]);
  assert.deepEqual(types, ["thought", "belief", "urge"]);
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

test("buildCombinedRoutePlan never mutates its input selectedItems", () => {
  const items = [thought("t1"), belief("b1")];
  const itemsCopy = JSON.parse(JSON.stringify(items));
  buildCombinedRoutePlan({ selectedItems: items, presenceEnabled: true, reassessmentAnswer: "still_stuck", fullPresenceAccepted: true });
  assert.deepEqual(items, itemsCopy);
});
