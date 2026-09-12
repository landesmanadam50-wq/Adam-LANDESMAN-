import test from "node:test";
import assert from "node:assert/strict";

import { resolveMiniStateEncodingContent, resolveMiniStateRecognitionHint } from "./stateLive.ts";
import { createEmptyBeliefArc, createEmptyThoughtArc, createEmptyUrgeArc } from "./types.ts";
import type { BeliefArc, ThoughtArc, UrgeArc } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

function miniBuild(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "Mini State",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "כחול",
    regulationAnchor: "נשימה טבעית",
    encodingAction: "עוגן הקידוד הגנרי",
    beneficialAction: "פעולה קצרה",
    protocolKind: "state",
    ...overrides,
  };
}

// --- #25/#26: ARC Mini State stays short and reuses ONE primary component ---

test("with no primary component configured (null), Mini State falls back to the existing generic encodingAction unchanged -- 100% backward compatible", () => {
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: null }), null, null, null);
  assert.equal(content.body, "עוגן הקידוד הגנרי");
  assert.equal(content.secondaryBody, null);
});

test("primary component 'emotion' also falls back to the generic encodingAction -- emotion is the existing state layer, never a special-cased override", () => {
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "emotion" }), null, null, null);
  assert.equal(content.body, "עוגן הקידוד הגנרי");
});

test("primary component 'urge' with representationPreference 'both' surfaces the secondary quick-switch action -- the one genuine behavioral difference from the plain generic encoding line", () => {
  const urgeArc: UrgeArc = { ...createEmptyUrgeArc("u1", "דחף", "2026-01-01T00:00:00.000Z"), representationPreference: "both" };
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "urge", secondaryEncodingAction: "עוגן משני" }), urgeArc, null, null);
  assert.equal(content.body, "עוגן הקידוד הגנרי");
  assert.equal(content.secondaryBody, "עוגן משני");
});

test("primary component 'urge' with a non-'both' representation never surfaces a secondary action, matching resolveMiniUrgeEncoding's own behavior", () => {
  const urgeArc: UrgeArc = { ...createEmptyUrgeArc("u1", "דחף", "2026-01-01T00:00:00.000Z"), representationPreference: "bodily" };
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "urge", secondaryEncodingAction: "עוגן משני" }), urgeArc, null, null);
  assert.equal(content.secondaryBody, null);
});

test("primary component 'urge' with no linked UrgeArc still falls back safely (treated as 'unsure'), never crashing", () => {
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "urge" }), null, null, null);
  assert.equal(content.body, "עוגן הקידוד הגנרי");
  assert.equal(content.secondaryBody, null);
});

test("primary component 'thought' resolves the linked ThoughtArc's supportiveThought", () => {
  const thoughtArc: ThoughtArc = { ...createEmptyThoughtArc("t1", "מחשבה", "2026-01-01T00:00:00.000Z"), supportiveThought: "אני מוכן" };
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "thought" }), null, thoughtArc, null);
  assert.equal(content.body, "אני מוכן");
});

test("primary component 'thought' falls back to the linked ThoughtArc's usefulInsight when supportiveThought is missing", () => {
  const thoughtArc: ThoughtArc = { ...createEmptyThoughtArc("t1", "מחשבה", "2026-01-01T00:00:00.000Z"), supportiveThought: null, usefulInsight: "אני יכול להתכונן" };
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "thought" }), null, thoughtArc, null);
  assert.equal(content.body, "אני יכול להתכונן");
});

test("primary component 'thought' with nothing resolved on the linked ThoughtArc falls back to the generic encodingAction", () => {
  const thoughtArc: ThoughtArc = createEmptyThoughtArc("t1", "מחשבה", "2026-01-01T00:00:00.000Z");
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "thought" }), null, thoughtArc, null);
  assert.equal(content.body, "עוגן הקידוד הגנרי");
});

test("primary component 'belief' resolves the linked BeliefArc's replacementBelief", () => {
  const beliefArc: BeliefArc = { ...createEmptyBeliefArc("b1", "אמונה", "2026-01-01T00:00:00.000Z"), replacementBelief: "אני מתפתח כל יום" };
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "belief" }), null, null, beliefArc);
  assert.equal(content.body, "אני מתפתח כל יום");
});

test("primary component 'belief' with no linked BeliefArc falls back to the generic encodingAction", () => {
  const content = resolveMiniStateEncodingContent(miniBuild({ miniStatePrimaryComponent: "belief" }), null, null, null);
  assert.equal(content.body, "עוגן הקידוד הגנרי");
});

test("resolveMiniStateRecognitionHint returns a component-specific hint for urge/thought/belief and null for emotion/unset -- never gates progression, purely informational", () => {
  assert.equal(typeof resolveMiniStateRecognitionHint("urge"), "string");
  assert.equal(typeof resolveMiniStateRecognitionHint("thought"), "string");
  assert.equal(typeof resolveMiniStateRecognitionHint("belief"), "string");
  assert.equal(resolveMiniStateRecognitionHint("emotion"), null);
  assert.equal(resolveMiniStateRecognitionHint(null), null);
});
