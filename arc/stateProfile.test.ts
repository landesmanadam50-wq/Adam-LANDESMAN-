import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyStateProfile, generateStateProfileId, normalizeStateProfile, upsertStateProfileInList } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { archiveLibraryItem, disableLibraryItem, restoreLibraryItem, resolveEnabledLibraryItemsForProgram } from "./libraryItemStatus.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function stateProfile(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "רוגע", "prog1", NOW), ...overrides };
}

// --- Create / defaults ---

test("createEmptyStateProfile produces every optional field null/empty, status enabled, schemaVersion 1", () => {
  const profile = createEmptyStateProfile("s1", "רוגע", "prog1", NOW);
  assert.equal(profile.id, "s1");
  assert.equal(profile.ownerProgramId, "prog1");
  assert.equal(profile.name, "רוגע");
  assert.equal(profile.description, null);
  assert.equal(profile.purpose, null);
  assert.equal(profile.stateMantra, null);
  assert.equal(profile.regulationAnchor, null);
  assert.equal(profile.bodyLanguageCue, null);
  assert.equal(profile.gazeCue, null);
  assert.equal(profile.naturalBreathingAwareness, null);
  assert.equal(profile.desiredBodySensation, null);
  assert.equal(profile.bodySensationLocation, null);
  assert.equal(profile.energyColor, null);
  assert.equal(profile.encodingCue, null);
  assert.equal(profile.action, null);
  assert.equal(profile.actionTimerConfig, null);
  assert.equal(profile.primaryIdentityProfileId, null);
  assert.deepEqual(profile.alternativeIdentityProfileIds, []);
  assert.equal(profile.status, "enabled");
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.createdAt, NOW);
  assert.equal(profile.updatedAt, NOW);
});

test("generateStateProfileId produces distinct ids across calls", () => {
  const a = generateStateProfileId();
  const b = generateStateProfileId();
  assert.notEqual(a, b);
  assert.match(a, /^stateprofile-/);
});

// --- Create / Read / Update via upsertStateProfileInList ---

test("upsertStateProfileInList appends a new StateProfile when its id isn't in the list yet (Create)", () => {
  const result = upsertStateProfileInList([], stateProfile());
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "s1");
});

test("upsertStateProfileInList updates the one matching StateProfile in place, leaving every other row untouched (Update)", () => {
  const other = stateProfile({ id: "s2", name: "אחר" });
  const updated = stateProfile({ name: "רוגע עמוק" });
  const result = upsertStateProfileInList([other, stateProfile()], updated);
  assert.equal(result.length, 2);
  assert.equal(result[0], other, "the untouched row is the exact same object");
  assert.equal(result[1].name, "רוגע עמוק");
});

test("upsertStateProfileInList never reorders the rest of the list", () => {
  const a = stateProfile({ id: "a" });
  const b = stateProfile({ id: "b" });
  const c = stateProfile({ id: "c" });
  const result = upsertStateProfileInList([a, b, c], stateProfile({ id: "b", name: "עודכן" }));
  assert.deepEqual(
    result.map((s) => s.id),
    ["a", "b", "c"]
  );
});

// --- Archive / Restore (via the shared generic policy) ---

test("archiveLibraryItem on a StateProfile marks it archived without deleting it from a list", () => {
  const profile = stateProfile();
  const archived = archiveLibraryItem(profile, LATER);
  const list = upsertStateProfileInList([profile], archived);
  assert.equal(list.length, 1, "archiving never removes the row");
  assert.equal(list[0].status, "archived");
});

test("restoreLibraryItem on an archived StateProfile returns it to enabled", () => {
  const archived = archiveLibraryItem(stateProfile(), NOW);
  const restored = restoreLibraryItem(archived, LATER);
  assert.equal(restored.status, "enabled");
});

test("disableLibraryItem on a StateProfile marks it disabled without deleting it", () => {
  const disabled = disableLibraryItem(stateProfile(), LATER);
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.id, "s1");
});

// --- List by program / Resolve enabled ---

test("resolveEnabledLibraryItemsForProgram returns only this program's enabled StateProfiles", () => {
  const enabled = stateProfile({ id: "a", ownerProgramId: "prog1" });
  const disabled = disableLibraryItem(stateProfile({ id: "b", ownerProgramId: "prog1" }), NOW);
  const otherProgram = stateProfile({ id: "c", ownerProgramId: "prog2" });
  const result = resolveEnabledLibraryItemsForProgram([enabled, disabled, otherProgram], "prog1");
  assert.deepEqual(
    result.map((s) => s.id),
    ["a"]
  );
});

// --- Safe defaults / normalize ---

test("normalizeStateProfile backfills missing optional fields to safe defaults without inventing content", () => {
  // Simulate a genuinely legacy/malformed record: strip fields entirely,
  // as JSON.parse would for anything saved before they existed --
  // mirrors arc/urgeArcs.test.ts's own normalizeUrgeArc backfill test.
  const { alternativeIdentityProfileIds, status, schemaVersion, ...legacyShape } = stateProfile();
  const normalized = normalizeStateProfile(legacyShape as StateProfile);
  assert.deepEqual(normalized.alternativeIdentityProfileIds, []);
  assert.equal(normalized.status, "enabled");
  assert.equal(normalized.schemaVersion, 1);
});

test("normalizeStateProfile never overwrites an already-configured field", () => {
  const configured = stateProfile({ stateMantra: "אני רגוע", status: "archived", schemaVersion: 3 });
  const normalized = normalizeStateProfile(configured);
  assert.equal(normalized.stateMantra, "אני רגוע");
  assert.equal(normalized.status, "archived");
  assert.equal(normalized.schemaVersion, 3);
});

// --- Input is not mutated ---

test("upsertStateProfileInList never mutates the input array or its objects", () => {
  const original = [stateProfile({ id: "a" })];
  const originalCopy = JSON.parse(JSON.stringify(original));
  upsertStateProfileInList(original, stateProfile({ id: "b" }));
  assert.deepEqual(original, originalCopy);
});

// --- Identity reference preserved ---

test("a StateProfile's primaryIdentityProfileId is preserved unchanged through upsert/normalize round trips", () => {
  const profile = stateProfile({ primaryIdentityProfileId: "identity-1" });
  const normalized = normalizeStateProfile(profile);
  assert.equal(normalized.primaryIdentityProfileId, "identity-1");
  const list = upsertStateProfileInList([], normalized);
  assert.equal(list[0].primaryIdentityProfileId, "identity-1");
});

// --- Serialization round trip ---

test("a StateProfile survives a JSON.stringify/parse round trip with its status intact", () => {
  const archived = archiveLibraryItem(stateProfile({ primaryIdentityProfileId: "identity-1" }), LATER);
  const roundTripped = JSON.parse(JSON.stringify(archived)) as StateProfile;
  const normalized = normalizeStateProfile(roundTripped);
  assert.equal(normalized.status, "archived");
  assert.equal(normalized.primaryIdentityProfileId, "identity-1");
});
