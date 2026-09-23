import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/personalDevelopmentInlineBuild.test.ts
 *
 * Personal Development consolidation task, step 2: permanent source-text
 * guard for the ONE dynamic BUILD screen
 * (build/PersonalDevelopmentRouteEditorScreen.tsx). This codebase has no
 * React Native component test renderer (see
 * build/selfDevelopmentEntryRoute.test.ts's own doc), so this asserts
 * directly on real source text, exactly like
 * build/personalDevelopmentSingleLiveEntry.test.ts does for the
 * navigation-boundary guard -- a distinct, separate concern from this
 * file's own (inline factor/State/Presence editing + the shared-item
 * safety gate), kept in its own file rather than appended there.
 *
 * The underlying pure logic (who-references-what, clone/repoint) is
 * already fully unit-tested in arc/libraryItemUsage.test.ts; this file
 * only verifies the SCREEN actually wires that logic in, and never
 * regresses back to navigating away to the legacy per-record editors.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const routeEditorScreen = readSource("build/PersonalDevelopmentRouteEditorScreen.tsx");
const routeListScreen = readSource("build/PersonalDevelopmentRouteListScreen.tsx");

test("the BUILD screen never navigates to any of the legacy per-record editors -- factor/State/Presence editing happens inline, in this same screen", () => {
  assert.ok(!routeEditorScreen.includes('"/interference-items'), "must never push to the legacy InterferenceItem editor route");
  assert.ok(!routeEditorScreen.includes('"/state-profiles'), "must never push to the legacy StateProfile editor route");
  assert.ok(!routeEditorScreen.includes('"/presence-arcs'), "must never push to the legacy PresenceArc editor route");
  // Only router.back() (Save/Cancel/notFound) may appear -- no router.push/router.replace anywhere in this screen.
  assert.ok(!routeEditorScreen.includes("router.push"), "the BUILD screen never pushes to any other route -- every edit happens inline");
  assert.ok(!routeEditorScreen.includes("router.replace"), "the BUILD screen never replaces to any other route");
});

test("selecting/creating a factor renders its own category fields inline via InlineFactorFields -- Thought/Belief/Emotion/Urge all dispatch through the same inline component", () => {
  assert.ok(routeEditorScreen.includes("function InlineFactorFields"), "the inline factor field-set component must exist");
  assert.ok(routeEditorScreen.includes('item.category === "thought"'), "Thought fields render inline");
  assert.ok(routeEditorScreen.includes('item.category === "belief"'), "Belief fields render inline");
  assert.ok(routeEditorScreen.includes('item.category === "emotion"'), "Emotion fields render inline");
  assert.ok(routeEditorScreen.includes('item.category === "urge"'), "Urge fields render inline");
});

test("choosing 'build a new State'/'new Presence protocol' shows fields inline immediately -- no navigate-away-and-return round trip", () => {
  assert.ok(routeEditorScreen.includes("function handleBuildNewStateInline"), "State creation must be the inline variant, not the legacy navigate-away flow");
  assert.ok(routeEditorScreen.includes("function InlineStateFields"), "the inline State field-set component must exist");
  assert.ok(routeEditorScreen.includes("function handleCreateNewPresenceInline"), "Presence creation must be the inline variant");
  assert.ok(routeEditorScreen.includes("function InlinePresenceFields"), "the inline Presence field-set component must exist");
});

test("the shared-item safety gate is wired to arc/libraryItemUsage.ts's own findRouteConfigsReferencing* helpers for every one of the three record kinds", () => {
  assert.ok(routeEditorScreen.includes("findRouteConfigsReferencingInterferenceItem"), "factor sharing must be checked");
  assert.ok(routeEditorScreen.includes("findRouteConfigsReferencingStateProfile"), "State sharing must be checked");
  assert.ok(routeEditorScreen.includes("findRouteConfigsReferencingPresenceArc"), "Presence sharing must be checked");
  assert.ok(routeEditorScreen.includes("function SharedItemGate"), "the gate component must exist");
});

test("the shared-item gate offers exactly the two approved choices -- continue editing (affects other programs) or copy for this program only -- and names the count, never a redirect to another screen", () => {
  const gateIndex = routeEditorScreen.indexOf("function SharedItemGate");
  assert.ok(gateIndex !== -1);
  const gateBody = routeEditorScreen.slice(gateIndex, gateIndex + 900);
  assert.ok(gateBody.includes("otherRoutesCount"), "the banner must surface the count of other linked programs");
  assert.ok(gateBody.includes("המשך לערוך"), "the 'continue editing' choice must exist");
  assert.ok(gateBody.includes("צור עותק לתוכנית זו בלבד"), "the 'copy for this program only' choice must exist");
  assert.ok(!gateBody.includes("router."), "the gate never navigates anywhere -- count alone is enough, no redirect to the legacy editors");
});

test("a brand-new locally-created factor is never gated behind the shared-item banner -- it always renders straight into InlineFactorFields with otherRoutesCount 0", () => {
  const newFactorBlockIndex = routeEditorScreen.indexOf("config.interferenceItemIds\n            .filter((itemId) => !items.some((existing) => existing.id === itemId))");
  assert.ok(newFactorBlockIndex !== -1, "the new-factor rendering block must exist");
  const block = routeEditorScreen.slice(newFactorBlockIndex, newFactorBlockIndex + 900);
  assert.ok(block.includes("otherRoutesCount={0}"), "a brand-new factor is passed otherRoutesCount 0 -- never shared, never gated");
  assert.ok(block.includes("acknowledged"), "and is rendered pre-acknowledged, so its fields show immediately");
});

test("copying delegates to arc/libraryItemUsage.ts's own pure clone/repoint functions for all three record kinds, rather than re-implementing the logic inline", () => {
  for (const fn of ["cloneInterferenceItemForProgram", "repointInterferenceItemReference", "cloneStateProfileForProgram", "repointStateProfileReference", "clonePresenceArcDraftForProgram", "repointPresenceArcReference"]) {
    assert.ok(routeEditorScreen.includes(fn), `must call arc/libraryItemUsage.ts's own ${fn}`);
  }
});

test("saving upserts every locally created/edited factor/State/Presence record before the route config itself, and never touches a record that was never locally edited", () => {
  const saveIndex = routeEditorScreen.indexOf("async function handleSave");
  assert.ok(saveIndex !== -1);
  const saveBody = routeEditorScreen.slice(saveIndex, routeEditorScreen.indexOf("\n  }\n", saveIndex));
  const itemsIndex = saveBody.indexOf("upsertInterferenceItem");
  const stateIndex = saveBody.indexOf("upsertStateProfile");
  const presenceIndex = saveBody.indexOf("upsertPresenceArc");
  const routeIndex = saveBody.indexOf("upsertPersonalDevelopmentRouteConfig");
  assert.ok(itemsIndex !== -1 && stateIndex !== -1 && presenceIndex !== -1 && routeIndex !== -1, "all four upserts must be present in handleSave");
  assert.ok(itemsIndex < routeIndex && stateIndex < routeIndex && presenceIndex < routeIndex, "factor/State/Presence records are saved before the route config that references them");
  assert.ok(saveBody.includes("for (const edited of Object.values(itemEdits))"), "only items actually present in local edit state are upserted -- an untouched item is never re-written");
  assert.ok(saveBody.includes("stateDraft && stateDraft.id === config.stateProfileId"), "the State draft is only upserted when it's the one currently linked and was actually edited");
  assert.ok(saveBody.includes("presenceDraft && presenceDraftId && presenceDraftId === config.linkedPresenceArcId"), "the Presence draft is only upserted when it's the one currently linked and was actually edited");
});

test("saving always upserts the SAME route id (config.id) -- editing and saving never creates a second, duplicate route", () => {
  assert.match(routeEditorScreen, /upsertPersonalDevelopmentRouteConfig\(\{ \.\.\.config, updatedAt: now \}\)/, "the route upsert always targets the currently loaded/created config's own id, never a freshly generated one");
});

test("the BUILD screen offers an optional program name field, blank writes back to null (never an empty string)", () => {
  assert.ok(routeEditorScreen.includes('label="שם התוכנית (רשות)"'), "an optional name field must exist");
  assert.match(routeEditorScreen, /onChangeText=\{\(text\) => setConfig\(\(current\) => \(\{ \.\.\.current, name: text\.trim\(\)\.length > 0 \? text : null \}\)\)\}/, "a blank name is stored as null, never an empty string");
});

test("My Routine's own reload runs the additive, idempotent System C auto-migration before rendering -- a leftover legacy CombinedInterferenceSelection becomes a real program automatically, without the old manual convert button", () => {
  assert.ok(routeListScreen.includes("autoMigrateAllLegacyCombinedSelections"), "the screen must call the auto-migration helper");
  assert.ok(routeListScreen.includes("loadCombinedInterferenceSelections()"), "the screen must load the legacy selections to migrate");
  assert.match(routeListScreen, /if \(createdCount > 0\) await savePersonalDevelopmentRouteConfigs\(migratedConfigs\)/, "the migrated configs are only saved back when something was actually created -- never an unconditional write");
});

test("My Routine's own card title shows config.name when set, falling back to the existing factor-count summary when it is null", () => {
  assert.match(
    routeListScreen,
    /config\.name \?\? `\$\{config\.interferenceItemIds\.length\} גורמים\$\{config\.presenceEnabled \? " \+ נוכחות" : ""\}`/,
    "the card title must prefer config.name, falling back to the unchanged factor-count summary"
  );
});

test("readiness/validation/saveability are computed from EFFECTIVE (baseline + local edits) collections, not stale baseline data -- readiness reflects in-progress inline edits live", () => {
  assert.ok(routeEditorScreen.includes("effectiveItems"), "effective items collection must exist");
  assert.ok(routeEditorScreen.includes("effectiveStateProfiles"), "effective State collection must exist");
  assert.ok(routeEditorScreen.includes("effectivePresenceArcs"), "effective Presence collection must exist");
  assert.match(routeEditorScreen, /isPersonalDevelopmentRouteConfigCompleteForPractice\(config, effectiveItems, effectiveStateProfiles, effectivePresenceArcs\)/, "readiness reads the effective collections");
});
