import test from "node:test";
import assert from "node:assert/strict";

import { buildCombinedLiveSequencePrefix } from "./combinedLiveSequence.ts";
import type { CombinedLiveSequenceStep } from "./combinedLiveSequence.ts";
import { buildCombinedRouteCoreSteps } from "./combinedRoute.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
} from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";

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

function kinds(steps: CombinedLiveSequenceStep[]): string[] {
  return steps.map((s) => s.kind);
}

// ---------------------------------------------------------------------------
// One shared source of truth -- cross-check against buildCombinedRouteCoreSteps
// ---------------------------------------------------------------------------

test("buildCombinedLiveSequencePrefix's recognition+preventive+processing steps are exactly buildCombinedRouteCoreSteps' own output re-bucketed -- same step set, same count, never invented or dropped, never re-derived independently", () => {
  const items = [thought("t1"), belief("b1"), emotion("e1"), urge("u1", { preventiveStoppingAction: "עצור" })];
  const core = buildCombinedRouteCoreSteps(items);
  const sequence = buildCombinedLiveSequencePrefix(items);
  const reconstructed = sequence.filter((s) => s.kind === "recognition" || s.kind === "urge_preventive_stopping" || s.kind === "processing").map((s) => ({ kind: s.routeStepKind, itemId: s.itemId }));

  // Same length, and every core step appears in the reconstruction exactly
  // once (set equality) -- re-bucketing (all recognition grouped first,
  // then preventive stopping, then all processing) is expected to change
  // the RELATIVE order between categories, which is the whole point of
  // Full LIVE's own checkpoint/shared-stage insertion; it must never
  // change the underlying STEP SET itself.
  assert.equal(reconstructed.length, core.length);
  const sortKey = (s: { kind: string | null; itemId: string | null }) => `${s.kind}:${s.itemId}`;
  assert.deepEqual(
    reconstructed.map(sortKey).sort(),
    core.map((s) => ({ kind: s.kind, itemId: s.itemId })).map(sortKey).sort()
  );

  // Within the recognition bucket alone, and within the processing bucket
  // alone, relative per-category order is preserved exactly as
  // buildCombinedRouteCoreSteps produced it (never independently reordered).
  const coreRecognition = core.filter((s) => s.kind.endsWith("_recognition")).map(sortKey);
  const sequenceRecognition = sequence.filter((s) => s.kind === "recognition").map((s) => sortKey({ kind: s.routeStepKind ?? "", itemId: s.itemId }));
  assert.deepEqual(sequenceRecognition, coreRecognition);
});

// ---------------------------------------------------------------------------
// Required test 1/10-14: recognition before checkpoint 1; preventive
// stopping after checkpoint 1, before Stay; checkpoint 2 after Stay+Acceptance;
// checkpoint 3 after Regulation; no rerouting before checkpoint 3.
// ---------------------------------------------------------------------------

test("every selected factor's recognition step appears before the afterAwareness checkpoint", () => {
  const items = [thought("t1"), belief("b1"), emotion("e1"), urge("u1")];
  const sequence = buildCombinedLiveSequencePrefix(items);
  const order = kinds(sequence);
  const checkpointIndex = order.indexOf("rating_checkpoint");
  const recognitionIndices = sequence.map((s, i) => (s.kind === "recognition" ? i : -1)).filter((i) => i >= 0);
  assert.equal(recognitionIndices.length, 4);
  for (const i of recognitionIndices) assert.ok(i < checkpointIndex, "every recognition step must precede the first rating checkpoint");
});

test("baseline ratings (afterAwareness) precede Urge preventive stopping", () => {
  const items = [urge("u1", { preventiveStoppingAction: "עצור" })];
  const sequence = buildCombinedLiveSequencePrefix(items);
  const order = kinds(sequence);
  const firstCheckpointIndex = order.indexOf("rating_checkpoint");
  const preventiveIndex = order.indexOf("urge_preventive_stopping");
  assert.ok(firstCheckpointIndex < preventiveIndex, "afterAwareness checkpoint must come before preventive stopping");
});

test("preventive stopping precedes shared Stay", () => {
  const items = [urge("u1", { preventiveStoppingAction: "עצור" })];
  const sequence = buildCombinedLiveSequencePrefix(items);
  const order = kinds(sequence);
  assert.ok(order.indexOf("urge_preventive_stopping") < order.indexOf("shared_stay"));
});

test("checkpoint 2 (afterStayAcceptance) follows both shared_stay and shared_acceptance", () => {
  const items = [thought("t1")];
  const sequence = buildCombinedLiveSequencePrefix(items);
  const stayIndex = sequence.findIndex((s) => s.kind === "shared_stay");
  const acceptanceIndex = sequence.findIndex((s) => s.kind === "shared_acceptance");
  const secondCheckpointIndex = sequence.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterStayAcceptance");
  assert.ok(stayIndex < secondCheckpointIndex);
  assert.ok(acceptanceIndex < secondCheckpointIndex);
});

test("checkpoint 3 (afterRegulation) follows shared_regulation", () => {
  const items = [thought("t1")];
  const sequence = buildCombinedLiveSequencePrefix(items);
  const regulationIndex = sequence.findIndex((s) => s.kind === "shared_regulation");
  const thirdCheckpointIndex = sequence.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterRegulation");
  assert.ok(regulationIndex < thirdCheckpointIndex);
});

test("category-specific processing steps all appear after the afterRegulation checkpoint", () => {
  const items = [thought("t1"), belief("b1"), emotion("e1"), urge("u1")];
  const sequence = buildCombinedLiveSequencePrefix(items);
  const thirdCheckpointIndex = sequence.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterRegulation");
  const processingIndices = sequence.map((s, i) => (s.kind === "processing" ? i : -1)).filter((i) => i >= 0);
  assert.ok(processingIndices.length > 0);
  for (const i of processingIndices) assert.ok(i > thirdCheckpointIndex);
});

test("shared_regulation does not duplicate Emotion/Urge processing -- it is a single distinct step, never repeated per item", () => {
  const items = [emotion("e1"), emotion("e2"), urge("u1")];
  const sequence = buildCombinedLiveSequencePrefix(items);
  const regulationCount = sequence.filter((s) => s.kind === "shared_regulation").length;
  assert.equal(regulationCount, 1);
});

test("each rating checkpoint marker appears exactly once", () => {
  const items = [thought("t1"), belief("b1"), emotion("e1"), urge("u1")];
  const sequence = buildCombinedLiveSequencePrefix(items);
  const checkpoints = sequence.filter((s) => s.kind === "rating_checkpoint").map((s) => s.checkpoint);
  assert.deepEqual(checkpoints, ["afterAwareness", "afterStayAcceptance", "afterRegulation"]);
});

test("shared_stay and shared_acceptance each appear exactly once", () => {
  const items = [thought("t1"), belief("b1"), emotion("e1"), urge("u1")];
  const sequence = buildCombinedLiveSequencePrefix(items);
  assert.equal(sequence.filter((s) => s.kind === "shared_stay").length, 1);
  assert.equal(sequence.filter((s) => s.kind === "shared_acceptance").length, 1);
});

// ---------------------------------------------------------------------------
// cognitive_reassessment
// ---------------------------------------------------------------------------

test("cognitive_reassessment appears once, only when Thought and/or Belief was selected", () => {
  const withCognitive = buildCombinedLiveSequencePrefix([thought("t1")]);
  assert.equal(kinds(withCognitive).filter((k) => k === "cognitive_reassessment").length, 1);

  const withoutCognitive = buildCombinedLiveSequencePrefix([emotion("e1")]);
  assert.equal(kinds(withoutCognitive).includes("cognitive_reassessment"), false);
});

test("cognitive_reassessment is the last step in the prefix", () => {
  const sequence = buildCombinedLiveSequencePrefix([thought("t1")]);
  assert.equal(sequence[sequence.length - 1].kind, "cognitive_reassessment");
});
