import test from "node:test";
import assert from "node:assert/strict";

import {
  UNAVAILABLE_REASON_LABELS,
  buildCombinedSelectionSaveDraft,
  classifyConfiguredItem,
  classifyConfiguredItems,
  findExistingSelectionForState,
  groupAvailableItemsByCategory,
  removeSelectedItemId,
  resolveSaveEligibility,
  toggleSelectedItemId,
} from "./combinedSelectionBuild.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
} from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import { archiveLibraryItem, disableLibraryItem } from "./libraryItemStatus.ts";
import { createEmptyCombinedInterferenceSelection } from "./combinedInterferenceSelection.ts";
import type { CombinedInterferenceSelection } from "./combinedInterferenceSelection.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";
const STATE_ID = "state-1";

function thought(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem(id, `מחשבה ${id}`, null, NOW), primaryStateProfileId: STATE_ID, ...overrides } as InterferenceItem;
}
function belief(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyBeliefInterferenceItem(id, `אמונה ${id}`, null, NOW), primaryStateProfileId: STATE_ID, ...overrides } as InterferenceItem;
}
function emotion(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem(id, `רגש ${id}`, null, NOW), primaryStateProfileId: STATE_ID, ...overrides } as InterferenceItem;
}
function urge(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem(id, `דחף ${id}`, null, NOW), primaryStateProfileId: STATE_ID, ...overrides } as InterferenceItem;
}

// ---------------------------------------------------------------------------
// groupAvailableItemsByCategory
// ---------------------------------------------------------------------------

test("groupAvailableItemsByCategory groups enabled, linked items into the four categories", () => {
  const items = [thought("t1"), belief("b1"), emotion("e1"), urge("u1")];
  const groups = groupAvailableItemsByCategory(items, STATE_ID);
  assert.deepEqual(groups.thought.map((i) => i.id), ["t1"]);
  assert.deepEqual(groups.belief.map((i) => i.id), ["b1"]);
  assert.deepEqual(groups.emotion.map((i) => i.id), ["e1"]);
  assert.deepEqual(groups.urge.map((i) => i.id), ["u1"]);
});

test("groupAvailableItemsByCategory returns an EMPTY array for a category with nothing available -- the screen itself decides to omit it", () => {
  const groups = groupAvailableItemsByCategory([thought("t1")], STATE_ID);
  assert.deepEqual(groups.belief, []);
  assert.deepEqual(groups.emotion, []);
  assert.deepEqual(groups.urge, []);
});

test("groupAvailableItemsByCategory excludes disabled/archived/unrelated items", () => {
  const items = [
    disableLibraryItem(thought("t1"), NOW),
    archiveLibraryItem(belief("b1"), NOW),
    emotion("e1", { primaryStateProfileId: "other-state", alternativeStateProfileIds: [] }),
  ];
  const groups = groupAvailableItemsByCategory(items, STATE_ID);
  assert.deepEqual(groups.thought, []);
  assert.deepEqual(groups.belief, []);
  assert.deepEqual(groups.emotion, []);
});

test("groupAvailableItemsByCategory includes an item linked via alternativeStateProfileIds", () => {
  const item = urge("u1", { primaryStateProfileId: "other-state", alternativeStateProfileIds: [STATE_ID] });
  const groups = groupAvailableItemsByCategory([item], STATE_ID);
  assert.deepEqual(groups.urge.map((i) => i.id), ["u1"]);
});

// ---------------------------------------------------------------------------
// classifyConfiguredItem / classifyConfiguredItems
// ---------------------------------------------------------------------------

test("classifyConfiguredItem: an enabled, linked item is available", () => {
  const item = thought("t1");
  const result = classifyConfiguredItem("t1", [item], STATE_ID);
  assert.deepEqual(result, { id: "t1", classification: { kind: "available", item } });
});

test("classifyConfiguredItem: a disabled linked item is classified disabled", () => {
  const item = disableLibraryItem(belief("b1"), NOW);
  const result = classifyConfiguredItem("b1", [item], STATE_ID);
  assert.equal(result.classification.kind, "unavailable");
  assert.equal((result.classification as { reason: string }).reason, "disabled");
});

test("classifyConfiguredItem: an archived linked item is classified archived", () => {
  const item = archiveLibraryItem(urge("u1"), NOW);
  const result = classifyConfiguredItem("u1", [item], STATE_ID);
  assert.equal((result.classification as { reason: string }).reason, "archived");
});

test("classifyConfiguredItem: a missing configured id is classified not_found", () => {
  const result = classifyConfiguredItem("ghost", [thought("t1")], STATE_ID);
  assert.equal((result.classification as { reason: string }).reason, "not_found");
  assert.equal(result.classification.item, null);
});

test("classifyConfiguredItem: an enabled item whose relationship to this State was removed is classified not_linked", () => {
  const item = emotion("e1", { primaryStateProfileId: "other-state", alternativeStateProfileIds: [] });
  const result = classifyConfiguredItem("e1", [item], STATE_ID);
  assert.equal((result.classification as { reason: string }).reason, "not_linked");
});

test("classifyConfiguredItem: archived takes priority over not_linked (an archived, unrelated item is still classified archived first)", () => {
  const item = archiveLibraryItem(emotion("e1", { primaryStateProfileId: "other-state", alternativeStateProfileIds: [] }), NOW);
  const result = classifyConfiguredItem("e1", [item], STATE_ID);
  assert.equal((result.classification as { reason: string }).reason, "archived");
});

test("classifyConfiguredItems never discards any id -- every configured id produces exactly one classification, in order", () => {
  const items = [thought("t1"), disableLibraryItem(belief("b1"), NOW)];
  const results = classifyConfiguredItems(["t1", "b1", "ghost"], items, STATE_ID);
  assert.equal(results.length, 3);
  assert.deepEqual(
    results.map((r) => r.id),
    ["t1", "b1", "ghost"]
  );
});

test("UNAVAILABLE_REASON_LABELS carries the exact Hebrew label for every reason", () => {
  assert.equal(UNAVAILABLE_REASON_LABELS.disabled, "מושבת");
  assert.equal(UNAVAILABLE_REASON_LABELS.archived, "בארכיון");
  assert.equal(UNAVAILABLE_REASON_LABELS.not_found, "לא נמצא");
  assert.equal(UNAVAILABLE_REASON_LABELS.not_linked, "אינו מקושר עוד למצב הזה");
});

// ---------------------------------------------------------------------------
// Toggling / removing
// ---------------------------------------------------------------------------

test("toggleSelectedItemId adds an unselected id exactly once", () => {
  assert.deepEqual(toggleSelectedItemId(["a"], "b"), ["a", "b"]);
});

test("toggleSelectedItemId unchecking removes only that id, leaving the rest untouched", () => {
  assert.deepEqual(toggleSelectedItemId(["a", "b", "c"], "b"), ["a", "c"]);
});

test("toggleSelectedItemId rechecking an id appends it again -- stable order, never a duplicate", () => {
  const afterUncheck = toggleSelectedItemId(["a", "b"], "a");
  assert.deepEqual(afterUncheck, ["b"]);
  const afterRecheck = toggleSelectedItemId(afterUncheck, "a");
  assert.deepEqual(afterRecheck, ["b", "a"]);
});

test("toggleSelectedItemId never mutates the input array", () => {
  const original = ["a", "b"];
  const originalCopy = [...original];
  toggleSelectedItemId(original, "c");
  assert.deepEqual(original, originalCopy);
});

test("removeSelectedItemId removes only the given id", () => {
  assert.deepEqual(removeSelectedItemId(["a", "b", "c"], "b"), ["a", "c"]);
});

test("removeSelectedItemId never mutates the InterferenceItem records themselves -- it only ever operates on the plain id array", () => {
  const item = thought("t1");
  const itemCopy = JSON.parse(JSON.stringify(item));
  removeSelectedItemId(["t1"], "t1");
  assert.deepEqual(item, itemCopy);
});

// ---------------------------------------------------------------------------
// Save eligibility
// ---------------------------------------------------------------------------

test("resolveSaveEligibility: a disabled or archived StateProfile is never saveable", () => {
  const classified = classifyConfiguredItems(["t1"], [thought("t1")], STATE_ID);
  assert.equal(resolveSaveEligibility("disabled", ["t1"], classified).allowed, false);
  assert.equal(resolveSaveEligibility("archived", ["t1"], classified).allowed, false);
  assert.equal(resolveSaveEligibility("disabled", ["t1"], classified).blockedReason, "state_not_enabled");
});

test("resolveSaveEligibility: an empty selection is not saveable", () => {
  const result = resolveSaveEligibility("enabled", [], []);
  assert.equal(result.allowed, false);
  assert.equal(result.blockedReason, "no_available_item_selected");
});

test("resolveSaveEligibility: Presence-only (no items selected) is not saveable, regardless of presenceEnabled -- this function doesn't even take a presence flag, since it can never change the outcome", () => {
  const result = resolveSaveEligibility("enabled", [], []);
  assert.equal(result.allowed, false);
});

test("resolveSaveEligibility: at least one enabled, linked item selected is saveable", () => {
  const classified = classifyConfiguredItems(["t1"], [thought("t1")], STATE_ID);
  const result = resolveSaveEligibility("enabled", ["t1"], classified);
  assert.equal(result.allowed, true);
  assert.equal(result.blockedReason, null);
});

test("resolveSaveEligibility: an unavailable selected item does not satisfy the minimum", () => {
  const disabledItem = disableLibraryItem(thought("t1"), NOW);
  const classified = classifyConfiguredItems(["t1"], [disabledItem], STATE_ID);
  const result = resolveSaveEligibility("enabled", ["t1"], classified);
  assert.equal(result.allowed, false);
  assert.equal(result.blockedReason, "no_available_item_selected");
});

test("resolveSaveEligibility: a mix of one available and one unavailable selected item is saveable (the available one satisfies the minimum)", () => {
  const disabledItem = disableLibraryItem(belief("b1"), NOW);
  const classified = classifyConfiguredItems(["t1", "b1"], [thought("t1"), disabledItem], STATE_ID);
  const result = resolveSaveEligibility("enabled", ["t1", "b1"], classified);
  assert.equal(result.allowed, true);
});

// ---------------------------------------------------------------------------
// One-per-State resolution + save draft (status-agnostic)
// ---------------------------------------------------------------------------

function selection(overrides: Partial<CombinedInterferenceSelection> = {}): CombinedInterferenceSelection {
  return { ...createEmptyCombinedInterferenceSelection("sel1", STATE_ID, "prog1", NOW), ...overrides };
}

test("findExistingSelectionForState finds an enabled selection", () => {
  const s = selection();
  assert.equal(findExistingSelectionForState([s], STATE_ID), s);
});

test("findExistingSelectionForState finds a DISABLED selection too (not just enabled)", () => {
  const s = disableLibraryItem(selection(), NOW);
  assert.equal(findExistingSelectionForState([s], STATE_ID), s);
});

test("findExistingSelectionForState finds an ARCHIVED selection too -- this is the exact behavior Phase 12's own resolveCombinedInterferenceSelectionForState does NOT provide (see this module's own header doc)", () => {
  const s = archiveLibraryItem(selection(), NOW);
  assert.equal(findExistingSelectionForState([s], STATE_ID), s);
});

test("findExistingSelectionForState returns null when none exists for this State", () => {
  assert.equal(findExistingSelectionForState([], STATE_ID), null);
});

test("buildCombinedSelectionSaveDraft creates a fresh selection when none exists", () => {
  const draft = buildCombinedSelectionSaveDraft(null, STATE_ID, "prog1", ["t1"], true, NOW, () => "new-id");
  assert.equal(draft.id, "new-id");
  assert.equal(draft.stateProfileId, STATE_ID);
  assert.deepEqual(draft.configuredItemIds, ["t1"]);
  assert.equal(draft.presenceEnabled, true);
  assert.equal(draft.status, "enabled");
});

test("buildCombinedSelectionSaveDraft updates an EXISTING selection in place -- preserving id and createdAt, never creating a second record", () => {
  const existing = selection({ configuredItemIds: ["t1"], presenceEnabled: false });
  const draft = buildCombinedSelectionSaveDraft(existing, STATE_ID, "prog1", ["t1", "b1"], true, LATER, () => "should-not-be-used");
  assert.equal(draft.id, "sel1");
  assert.equal(draft.createdAt, NOW);
  assert.equal(draft.updatedAt, LATER);
  assert.deepEqual(draft.configuredItemIds, ["t1", "b1"]);
  assert.equal(draft.presenceEnabled, true);
});

test("buildCombinedSelectionSaveDraft: ordinary saving never silently changes status -- enabling/restoring is a separate, explicit action", () => {
  const disabledExisting = disableLibraryItem(selection(), NOW);
  const draft = buildCombinedSelectionSaveDraft(disabledExisting, STATE_ID, "prog1", ["t1"], false, LATER);
  assert.equal(draft.status, "disabled", "a plain save on a disabled configuration keeps it disabled -- enabling is its own explicit action, not implied by Save");
});

test("buildCombinedSelectionSaveDraft dedupes the saved configuredItemIds", () => {
  const draft = buildCombinedSelectionSaveDraft(null, STATE_ID, "prog1", ["a", "a", "b"], false, NOW, () => "id1");
  assert.deepEqual(draft.configuredItemIds, ["a", "b"]);
});

test("buildCombinedSelectionSaveDraft: an existing single-item configuration remains compatible -- adding a second item preserves the first, in order", () => {
  const existing = selection({ configuredItemIds: ["t1"] });
  const draft = buildCombinedSelectionSaveDraft(existing, STATE_ID, "prog1", ["t1", "b1"], false, LATER);
  assert.deepEqual(draft.configuredItemIds, ["t1", "b1"]);
});

test("buildCombinedSelectionSaveDraft never mutates the existing record it was given", () => {
  const existing = selection({ configuredItemIds: ["t1"] });
  const existingCopy = JSON.parse(JSON.stringify(existing));
  buildCombinedSelectionSaveDraft(existing, STATE_ID, "prog1", ["t1", "b1"], true, LATER);
  assert.deepEqual(existing, existingCopy);
});

// ---------------------------------------------------------------------------
// Reopening an existing configuration -- restoring checked state
// ---------------------------------------------------------------------------

test("reopening an existing configuration: all configured available items appear selected (the screen's own initial selectedItemIds is simply existing.configuredItemIds)", () => {
  const items = [thought("t1"), belief("b1")];
  const existing = selection({ configuredItemIds: ["t1", "b1"] });
  const classified = classifyConfiguredItems(existing.configuredItemIds, items, STATE_ID);
  assert.ok(classified.every((c) => c.classification.kind === "available"));
  assert.deepEqual(existing.configuredItemIds, ["t1", "b1"], "the initial selectedItemIds draft the screen seeds from");
});

test("unavailable configured ids remain in the draft until explicitly removed -- classifying them does not strip them from configuredItemIds", () => {
  const disabledItem = disableLibraryItem(belief("b1"), NOW);
  const existing = selection({ configuredItemIds: ["t1", "b1"] });
  const classified = classifyConfiguredItems(existing.configuredItemIds, [thought("t1"), disabledItem], STATE_ID);
  assert.deepEqual(
    classified.map((c) => c.id),
    ["t1", "b1"],
    "still present, now classified as unavailable rather than silently dropped"
  );
  assert.equal(classified[1].classification.kind, "unavailable");
});
