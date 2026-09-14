import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
  generateInterferenceItemId,
  normalizeInterferenceItem,
  upsertInterferenceItemInList,
} from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import { archiveLibraryItem, disableLibraryItem, restoreLibraryItem } from "./libraryItemStatus.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

// --- Thought variant ---

test("createEmptyThoughtInterferenceItem: category is 'thought', category-specific fields are typed and null by default", () => {
  const item = createEmptyThoughtInterferenceItem("i1", "מחשבה מטרידה", "prog1", NOW);
  assert.equal(item.category, "thought");
  assert.equal(item.thoughtText, null);
  assert.equal(item.acceptanceMantra, null);
  assert.equal(item.alternativeInterpretation, null);
  assert.equal(item.regulationCue, null);
  assert.equal(item.existingNodCue, null);
  // Common fields
  assert.equal(item.ownerProgramId, "prog1");
  assert.equal(item.primaryStateProfileId, null);
  assert.deepEqual(item.alternativeStateProfileIds, []);
  assert.equal(item.identityProfileIdOverride, null);
  assert.equal(item.miniOverride, null);
  assert.equal(item.status, "enabled");
});

// --- Belief variant ---

test("createEmptyBeliefInterferenceItem: category is 'belief', category-specific fields are typed and null by default", () => {
  const item = createEmptyBeliefInterferenceItem("i2", "אמונה מגבילה", "prog1", NOW);
  assert.equal(item.category, "belief");
  assert.equal(item.beliefText, null);
  assert.equal(item.supportiveBelief, null);
  assert.equal(item.regulationCue, null);
});

// --- Urge variant ---

test("createEmptyUrgeInterferenceItem: category is 'urge', representationPreference defaults to decide_in_live", () => {
  const item = createEmptyUrgeInterferenceItem("i3", "דחף לעישון", "prog1", NOW);
  assert.equal(item.category, "urge");
  assert.equal(item.urgeName, null);
  assert.equal(item.preventiveStoppingAction, null);
  assert.equal(item.representationPreference, "decide_in_live");
  assert.equal(item.visualEncodingConfig, null);
  assert.equal(item.sensoryEncodingConfig, null);
  assert.equal(item.regulationAnchor, null);
  assert.equal(item.recheckEnabled, false);
  assert.equal(item.recheckPrompt, null);
});

// --- Emotion variant ---

test("createEmptyEmotionInterferenceItem: category is 'emotion', category-specific fields are typed and null by default", () => {
  const item = createEmptyEmotionInterferenceItem("i4", "תסכול", "prog1", NOW);
  assert.equal(item.category, "emotion");
  assert.equal(item.emotionName, null);
  assert.equal(item.regulationCue, null);
});

// --- Only one category discriminator per item ---

test("each factory produces exactly one category value -- never a mix", () => {
  const thought = createEmptyThoughtInterferenceItem("t", "x", null, NOW);
  const belief = createEmptyBeliefInterferenceItem("b", "x", null, NOW);
  const urge = createEmptyUrgeInterferenceItem("u", "x", null, NOW);
  const emotion = createEmptyEmotionInterferenceItem("e", "x", null, NOW);
  const categories = [thought, belief, urge, emotion].map((i) => i.category);
  assert.deepEqual(categories, ["thought", "belief", "urge", "emotion"]);
  assert.equal(new Set(categories).size, 4, "every category is distinct");
});

// --- Primary State relationship ---

test("primaryStateProfileId is null by default and can be set on any category", () => {
  const item = { ...createEmptyThoughtInterferenceItem("i1", "x", null, NOW), primaryStateProfileId: "state-1" };
  assert.equal(item.primaryStateProfileId, "state-1");
});

// --- Optional Identity override ---

test("identityProfileIdOverride is null by default and independent of the item's category", () => {
  const item = { ...createEmptyUrgeInterferenceItem("i1", "x", null, NOW), identityProfileIdOverride: "identity-1" };
  assert.equal(item.identityProfileIdOverride, "identity-1");
});

// --- Optional alternative States ---

test("alternativeStateProfileIds defaults to an empty array and accepts multiple ids", () => {
  const item = { ...createEmptyBeliefInterferenceItem("i1", "x", null, NOW), alternativeStateProfileIds: ["s1", "s2"] };
  assert.deepEqual(item.alternativeStateProfileIds, ["s1", "s2"]);
});

// --- Enabled/disabled/archived behavior ---

test("disableLibraryItem/archiveLibraryItem/restoreLibraryItem all operate correctly on an InterferenceItem", () => {
  const item = createEmptyThoughtInterferenceItem("i1", "x", null, NOW);
  const disabled = disableLibraryItem(item, LATER);
  assert.equal(disabled.status, "disabled");
  const archived = archiveLibraryItem(item, LATER);
  assert.equal(archived.status, "archived");
  const restored = restoreLibraryItem(archived, LATER);
  assert.equal(restored.status, "enabled");
});

// --- generateInterferenceItemId ---

test("generateInterferenceItemId produces distinct ids across calls", () => {
  assert.notEqual(generateInterferenceItemId(), generateInterferenceItemId());
});

// --- Create / Read / Update via upsertInterferenceItemInList ---

test("upsertInterferenceItemInList works across mixed categories, matching only by id", () => {
  const thought = createEmptyThoughtInterferenceItem("a", "x", null, NOW);
  const urge = createEmptyUrgeInterferenceItem("b", "y", null, NOW);
  const result = upsertInterferenceItemInList([thought], urge);
  assert.equal(result.length, 2);
  assert.equal(result[1].category, "urge");
});

test("upsertInterferenceItemInList updates the one matching item in place, leaving every other row untouched", () => {
  const other: InterferenceItem = createEmptyBeliefInterferenceItem("other", "x", null, NOW);
  const original = createEmptyThoughtInterferenceItem("a", "ישן", null, NOW);
  const updated = { ...original, thoughtText: "מעודכן" };
  const result = upsertInterferenceItemInList([other, original], updated);
  assert.equal(result[0], other);
  assert.equal((result[1] as typeof updated).thoughtText, "מעודכן");
});

// --- Safe defaults / normalize ---

test("normalizeInterferenceItem backfills common fields to safe defaults without touching category-specific fields", () => {
  const { alternativeStateProfileIds, status, schemaVersion, ...legacyShape } = createEmptyUrgeInterferenceItem("i1", "x", "prog1", NOW);
  const normalized = normalizeInterferenceItem(legacyShape as InterferenceItem);
  assert.deepEqual(normalized.alternativeStateProfileIds, []);
  assert.equal(normalized.status, "enabled");
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.category, "urge");
});

test("normalizeInterferenceItem never reclassifies an item's category", () => {
  const belief = createEmptyBeliefInterferenceItem("i1", "x", null, NOW);
  const normalized = normalizeInterferenceItem(belief);
  assert.equal(normalized.category, "belief");
});

// --- Mini override placeholder ---

test("miniOverride is null by default and accepts a partial override configuration", () => {
  const item = {
    ...createEmptyUrgeInterferenceItem("i1", "x", null, NOW),
    miniOverride: {
      shortRecognitionCue: "שים לב לדחף",
      preventiveStoppingActionOverride: "עצור",
      regulationAnchorOverride: null,
      encodingCueOverride: null,
      stateActionOverride: null,
      stateActionDurationOverrideMinutes: null,
      identityCueOverride: null,
      identityActionOverride: null,
    },
  };
  assert.equal(item.miniOverride.shortRecognitionCue, "שים לב לדחף");
  assert.equal(item.miniOverride.preventiveStoppingActionOverride, "עצור");
});

// --- Input is not mutated ---

test("upsertInterferenceItemInList never mutates the input array", () => {
  const original = [createEmptyThoughtInterferenceItem("a", "x", null, NOW)];
  const originalCopy = JSON.parse(JSON.stringify(original));
  upsertInterferenceItemInList(original, createEmptyBeliefInterferenceItem("b", "y", null, NOW));
  assert.deepEqual(original, originalCopy);
});
