import test from "node:test";
import assert from "node:assert/strict";

import { resolveSuggestedSupportiveAreas, resolveSuggestedUnpleasantAreas, resolveSupportiveMovementSuggestionsForAreas } from "./supportiveAnchorSuggestions.ts";

// ARC LIVE emotion-based body suggestions task, section 5's own exact mapping table:
// Calmness -> Shoulders/Stomach/Chest, Confidence -> Chest/Back/Shoulders/Legs.
test("resolveSuggestedSupportiveAreas matches a known keyword even inside a longer free-text sentence", () => {
  assert.deepEqual(resolveSuggestedSupportiveAreas("אני רוצה להרגיש רוגע בסוף היום"), ["shoulders", "abdomen", "chest"]);
});

test("resolveSuggestedSupportiveAreas is case/whitespace-insensitive for the keyword match", () => {
  assert.deepEqual(resolveSuggestedSupportiveAreas("  ביטחון  "), ["chest", "back", "shoulders", "legs_feet"]);
});

test("resolveSuggestedSupportiveAreas falls back to a reasonable default for free text matching no known keyword", () => {
  assert.deepEqual(resolveSuggestedSupportiveAreas("משהו שלא מופיע ברשימה בכלל"), ["chest", "abdomen", "shoulders"]);
});

test("resolveSuggestedSupportiveAreas falls back to the same default when no desired feeling was ever set", () => {
  assert.deepEqual(resolveSuggestedSupportiveAreas(null), ["chest", "abdomen", "shoulders"]);
  assert.deepEqual(resolveSuggestedSupportiveAreas(""), ["chest", "abdomen", "shoulders"]);
});

test("resolveSupportiveMovementSuggestionsForAreas pools presets across multiple chosen regions, not just the first", () => {
  const suggestions = resolveSupportiveMovementSuggestionsForAreas(["chest", "shoulders"], 5);
  assert.ok(suggestions.includes("פתיחה עדינה באמצעות שינוי תנוחה נוח"), "chest's own preset must be included");
  assert.ok(suggestions.includes("הורדה עדינה של הכתפיים"), "shoulders' own preset must be included");
});

test("resolveSupportiveMovementSuggestionsForAreas deduplicates and respects the limit", () => {
  const suggestions = resolveSupportiveMovementSuggestionsForAreas(["shoulders", "shoulders"], 1);
  assert.equal(suggestions.length, 1);
});

test("resolveSupportiveMovementSuggestionsForAreas falls back to a generic, always-available list when no region was chosen at all", () => {
  const suggestions = resolveSupportiveMovementSuggestionsForAreas([], 3);
  assert.equal(suggestions.length, 3);
});

test("resolveSupportiveMovementSuggestionsForAreas falls back to the generic list when every chosen region has no authored presets", () => {
  const suggestions = resolveSupportiveMovementSuggestionsForAreas(["neck", "face"], 3);
  assert.ok(suggestions.length > 0, "must never return an empty list, even for regions with no authored presets");
});

// --- ARC LIVE emotion-based body suggestions task, section 10 test 5: the exact
// positive-feeling -> body-region mapping table (section 5 of the spec) ----------

test("resolveSuggestedSupportiveAreas matches every remaining named positive feeling from the spec's own mapping table", () => {
  assert.deepEqual(resolveSuggestedSupportiveAreas("יציבות"), ["legs_feet", "back"], "Stability -> Feet/Legs/Back (feet+legs are one combined region in this app)");
  assert.deepEqual(resolveSuggestedSupportiveAreas("אנרגיה"), ["chest", "arms", "legs_feet"], "Energy -> Chest/Arms/Legs");
  assert.deepEqual(resolveSuggestedSupportiveAreas("מיקוד"), ["head", "neck", "shoulders"], "Focus -> Head/Neck/Shoulders");
  assert.deepEqual(resolveSuggestedSupportiveAreas("פתיחות"), ["chest", "shoulders", "arms"], "Openness -> Chest/Shoulders/Arms");
  assert.deepEqual(resolveSuggestedSupportiveAreas("נינוחות"), ["shoulders", "jaw", "abdomen"], "Relaxation -> Shoulders/Jaw/Stomach");
  assert.deepEqual(resolveSuggestedSupportiveAreas("מוטיבציה"), ["chest", "legs_feet", "arms"], "Motivation -> Chest/Legs/Arms");
});

// --- ARC LIVE emotion-based body suggestions task, section 10 test 4: the exact
// negative-emotion -> body-region mapping table (section 3 of the spec) ----------

test("resolveSuggestedUnpleasantAreas matches every negative emotion from the spec's own mapping table", () => {
  assert.deepEqual(resolveSuggestedUnpleasantAreas("פחד"), ["chest", "abdomen", "neck", "shoulders"], "Fear -> Chest/Stomach/Throat/Shoulders");
  assert.deepEqual(resolveSuggestedUnpleasantAreas("חרדה"), ["chest", "abdomen", "neck", "legs_feet"], "Anxiety -> Chest/Stomach/Throat/Legs");
  assert.deepEqual(resolveSuggestedUnpleasantAreas("כעס"), ["jaw", "shoulders", "chest", "hands"], "Anger -> Jaw/Shoulders/Chest/Hands");
  assert.deepEqual(resolveSuggestedUnpleasantAreas("עצב"), ["chest", "neck", "abdomen"], "Sadness -> Chest/Throat/Stomach");
  assert.deepEqual(resolveSuggestedUnpleasantAreas("תסכול"), ["jaw", "shoulders", "chest"], "Frustration -> Jaw/Shoulders/Chest");
  assert.deepEqual(resolveSuggestedUnpleasantAreas("בושה"), ["face", "chest", "abdomen"], "Shame -> Face/Chest/Stomach");
  assert.deepEqual(resolveSuggestedUnpleasantAreas("שעמום"), ["head", "shoulders", "back"], "Boredom -> Head/Shoulders/Back");
});

test("resolveSuggestedUnpleasantAreas matches a known keyword even inside a longer free-text sentence, is case/whitespace-insensitive, and falls back to a reasonable default for unmatched or absent text", () => {
  assert.deepEqual(resolveSuggestedUnpleasantAreas("אני מרגיש פחד גדול כרגע"), ["chest", "abdomen", "neck", "shoulders"]);
  assert.deepEqual(resolveSuggestedUnpleasantAreas("  כעס  "), ["jaw", "shoulders", "chest", "hands"]);
  assert.deepEqual(resolveSuggestedUnpleasantAreas("משהו שלא מופיע ברשימה בכלל"), ["chest", "abdomen", "shoulders"]);
  assert.deepEqual(resolveSuggestedUnpleasantAreas(null), ["chest", "abdomen", "shoulders"]);
  assert.deepEqual(resolveSuggestedUnpleasantAreas(""), ["chest", "abdomen", "shoulders"]);
});
