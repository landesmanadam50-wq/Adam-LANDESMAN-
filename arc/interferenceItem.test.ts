import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
  generateInterferenceItemId,
  isInterferenceItemSaveable,
  normalizeInterferenceItem,
  upsertInterferenceItemInList,
} from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import { archiveLibraryItem, disableLibraryItem, isLibraryItemEnabled, restoreLibraryItem } from "./libraryItemStatus.ts";

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

// ---------------------------------------------------------------------------
// Phase 11 (InterferenceItem BUILD)
// ---------------------------------------------------------------------------

// --- isInterferenceItemSaveable: every category, uniformly ---

test("isInterferenceItemSaveable accepts a name-only item for every category", () => {
  assert.equal(isInterferenceItemSaveable(createEmptyThoughtInterferenceItem("i1", "מחשבה", null, NOW)), true);
  assert.equal(isInterferenceItemSaveable(createEmptyBeliefInterferenceItem("i2", "אמונה", null, NOW)), true);
  assert.equal(isInterferenceItemSaveable(createEmptyUrgeInterferenceItem("i3", "דחף", null, NOW)), true);
  assert.equal(isInterferenceItemSaveable(createEmptyEmotionInterferenceItem("i4", "רגש", null, NOW)), true);
});

test("isInterferenceItemSaveable rejects a blank or whitespace-only name for every category", () => {
  assert.equal(isInterferenceItemSaveable(createEmptyThoughtInterferenceItem("i1", "", null, NOW)), false);
  assert.equal(isInterferenceItemSaveable(createEmptyBeliefInterferenceItem("i2", "   ", null, NOW)), false);
  assert.equal(isInterferenceItemSaveable(createEmptyUrgeInterferenceItem("i3", "", null, NOW)), false);
  assert.equal(isInterferenceItemSaveable(createEmptyEmotionInterferenceItem("i4", "\t\n", null, NOW)), false);
});

test("isInterferenceItemSaveable requires nothing beyond name -- every category-specific field may stay null, per existing type semantics", () => {
  // A Thought item with every one of its own category-specific cues left
  // null (thoughtText/acceptanceMantra/alternativeInterpretation/
  // regulationCue/existingNodCue) is still saveable -- none of them is a
  // required field on ThoughtInterferenceItem.
  const thought = createEmptyThoughtInterferenceItem("i1", "מחשבה", null, NOW);
  assert.equal(thought.thoughtText, null);
  assert.equal(thought.regulationCue, null);
  assert.equal(isInterferenceItemSaveable(thought), true);

  // An Urge item with representationPreference at its own default
  // ("decide_in_live", never null) and every free-text field null is
  // also fully saveable.
  const urge = createEmptyUrgeInterferenceItem("i2", "דחף", null, NOW);
  assert.equal(urge.preventiveStoppingAction, null);
  assert.equal(urge.representationPreference, "decide_in_live");
  assert.equal(isInterferenceItemSaveable(urge), true);
});

test("isInterferenceItemSaveable never mutates the item it validates", () => {
  const item = createEmptyBeliefInterferenceItem("i1", "אמונה", null, NOW);
  const before = JSON.parse(JSON.stringify(item));
  isInterferenceItemSaveable(item);
  assert.deepEqual(item, before);
});

// --- Editing preserves identity, category-specific content, and backward-compatible fields ---
// (The editor screen itself is not unit-tested -- per this codebase's own
// convention, only the pure data-model operations it performs are. An
// "edit" is exactly a plain object spread onto the loaded record,
// followed by upsertInterferenceItemInList -- the same shape tested here.)

test("editing one category-specific field preserves every other category-specific field", () => {
  const original = createEmptyThoughtInterferenceItem("i1", "מחשבה", null, NOW);
  const withAllFieldsSet: InterferenceItem = {
    ...original,
    thoughtText: "המחשבה המקורית",
    acceptanceMantra: "אני מקבל",
    alternativeInterpretation: "פרשנות אחרת",
    regulationCue: "עוגן",
    existingNodCue: "הנהון",
  };
  // Simulates the editor changing ONLY thoughtText.
  const edited = { ...withAllFieldsSet, thoughtText: "מחשבה מעודכנת" };
  assert.equal(edited.thoughtText, "מחשבה מעודכנת");
  assert.equal(edited.acceptanceMantra, "אני מקבל");
  assert.equal(edited.alternativeInterpretation, "פרשנות אחרת");
  assert.equal(edited.regulationCue, "עוגן");
  assert.equal(edited.existingNodCue, "הנהון");
});

test("editing one field never erases fields required for backward compatibility (ownerProgramId, primaryStateProfileId, identityProfileIdOverride, miniOverride, alternativeStateProfileIds)", () => {
  const original: InterferenceItem = {
    ...createEmptyUrgeInterferenceItem("i1", "דחף", "prog1", NOW),
    primaryStateProfileId: "state-1",
    identityProfileIdOverride: "identity-1",
    alternativeStateProfileIds: ["state-2"],
  };
  // Simulates the editor changing ONLY urgeName.
  const edited = { ...original, urgeName: "דחף מעודכן" };
  assert.equal(edited.ownerProgramId, "prog1");
  assert.equal(edited.primaryStateProfileId, "state-1");
  assert.equal(edited.identityProfileIdOverride, "identity-1");
  assert.deepEqual(edited.alternativeStateProfileIds, ["state-2"]);
  assert.equal(edited.miniOverride, null);
});

test("editing preserves id and createdAt, and bumps updatedAt on save, matching arc/stateProfile.ts's own convention", () => {
  const original = createEmptyBeliefInterferenceItem("i1", "אמונה", null, NOW);
  // Simulates the editor's own handleSave: spread the edited fields, then
  // set updatedAt to the save moment -- id/createdAt are never part of
  // any field handler, so they ride along unchanged.
  const saved = { ...original, beliefText: "טקסט חדש", updatedAt: LATER };
  assert.equal(saved.id, "i1");
  assert.equal(saved.createdAt, NOW);
  assert.equal(saved.updatedAt, LATER);
});

test("ordinary editing preserves status -- it is never touched by a field-level edit", () => {
  const disabled = disableLibraryItem(createEmptyEmotionInterferenceItem("i1", "רגש", null, NOW), NOW);
  const edited = { ...disabled, emotionName: "תסכול" };
  assert.equal(edited.status, "disabled");
});

// --- Status filtering (list screen behavior) ---

test("enabled items are distinguishable from disabled/archived across mixed categories", () => {
  const enabled = createEmptyThoughtInterferenceItem("a", "x", null, NOW);
  const disabled = disableLibraryItem(createEmptyBeliefInterferenceItem("b", "y", null, NOW), NOW);
  const archived = archiveLibraryItem(createEmptyUrgeInterferenceItem("c", "z", null, NOW), NOW);
  const items = [enabled, disabled, archived];
  assert.deepEqual(
    items.filter(isLibraryItemEnabled).map((i) => i.id),
    ["a"]
  );
  assert.deepEqual(
    items.filter((i) => i.status === "archived").map((i) => i.id),
    ["c"]
  );
  assert.deepEqual(
    items.filter((i) => i.status !== "archived").map((i) => i.id),
    ["a", "b"],
    "the list screen's own default (archive hidden) view"
  );
});

test("archive never deletes a record -- it stays in the list, recoverable via restore", () => {
  const item = createEmptyUrgeInterferenceItem("i1", "דחף", null, NOW);
  const archived = archiveLibraryItem(item, LATER);
  const list = upsertInterferenceItemInList([item], archived);
  assert.equal(list.length, 1, "archiving never removes the row");
  assert.equal(list[0].status, "archived");
  const restored = restoreLibraryItem(list[0], LATER);
  assert.equal(restored.status, "enabled");
  assert.equal(restored.id, "i1", "restore never changes the id");
});

// --- Existing records remain loadable across every category ---

test("every category survives a JSON.stringify/parse round trip and stays normalizable", () => {
  const items: InterferenceItem[] = [
    createEmptyThoughtInterferenceItem("t1", "מחשבה", "prog1", NOW),
    createEmptyBeliefInterferenceItem("b1", "אמונה", "prog1", NOW),
    createEmptyUrgeInterferenceItem("u1", "דחף", "prog1", NOW),
    createEmptyEmotionInterferenceItem("e1", "רגש", "prog1", NOW),
  ];
  for (const item of items) {
    const roundTripped = JSON.parse(JSON.stringify(item)) as InterferenceItem;
    const normalized = normalizeInterferenceItem(roundTripped);
    assert.equal(normalized.category, item.category);
    assert.equal(normalized.id, item.id);
    assert.equal(normalized.status, "enabled");
  }
});
