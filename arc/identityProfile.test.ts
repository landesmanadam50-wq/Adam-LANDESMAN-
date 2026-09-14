import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyIdentityProfile, generateIdentityProfileId, normalizeIdentityProfile, upsertIdentityProfileInList } from "./identityProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import { archiveLibraryItem, disableLibraryItem, restoreLibraryItem, resolveEnabledLibraryItemsForProgram } from "./libraryItemStatus.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function identityProfile(overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return { ...createEmptyIdentityProfile("i1", "אדם ממושמע", "prog1", NOW), ...overrides };
}

test("createEmptyIdentityProfile produces every optional field null, compatibility flags true by default, status enabled", () => {
  const profile = createEmptyIdentityProfile("i1", "אדם ממושמע", "prog1", NOW);
  assert.equal(profile.id, "i1");
  assert.equal(profile.ownerProgramId, "prog1");
  assert.equal(profile.name, "אדם ממושמע");
  assert.equal(profile.value, null);
  assert.equal(profile.identityMantra, null);
  assert.equal(profile.desiredIdentityState, null);
  assert.equal(profile.bodyLanguageCue, null);
  assert.equal(profile.futureMantra, null);
  assert.equal(profile.encodingCue, null);
  assert.equal(profile.actionImageryConfig, null);
  assert.equal(profile.futureResultImageryConfig, null);
  assert.equal(profile.action, null);
  assert.equal(profile.actionTimerConfig, null);
  assert.equal(profile.resultReviewConfig, null);
  assert.equal(profile.successFocusCompatible, true);
  assert.equal(profile.postActionReplayCompatible, true);
  assert.equal(profile.gratitudeCompatible, true);
  assert.equal(profile.status, "enabled");
  assert.equal(profile.schemaVersion, 1);
});

test("generateIdentityProfileId produces distinct ids across calls", () => {
  assert.notEqual(generateIdentityProfileId(), generateIdentityProfileId());
});

// --- Create / Read / Update ---

test("upsertIdentityProfileInList appends a new IdentityProfile when its id isn't in the list yet", () => {
  const result = upsertIdentityProfileInList([], identityProfile());
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "i1");
});

test("upsertIdentityProfileInList updates the one matching IdentityProfile in place, leaving every other row untouched", () => {
  const other = identityProfile({ id: "i2", name: "אחר" });
  const updated = identityProfile({ name: "אדם נחוש" });
  const result = upsertIdentityProfileInList([other, identityProfile()], updated);
  assert.equal(result[0], other);
  assert.equal(result[1].name, "אדם נחוש");
});

// --- Archive / Restore ---

test("archiveLibraryItem on an IdentityProfile marks it archived without deleting it from a list", () => {
  const profile = identityProfile();
  const archived = archiveLibraryItem(profile, LATER);
  const list = upsertIdentityProfileInList([profile], archived);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "archived");
});

test("restoreLibraryItem on a disabled IdentityProfile returns it to enabled", () => {
  const disabled = disableLibraryItem(identityProfile(), NOW);
  const restored = restoreLibraryItem(disabled, LATER);
  assert.equal(restored.status, "enabled");
});

// --- List by program / Resolve enabled ---

test("resolveEnabledLibraryItemsForProgram returns only this program's enabled IdentityProfiles", () => {
  const enabled = identityProfile({ id: "a", ownerProgramId: "prog1" });
  const archived = archiveLibraryItem(identityProfile({ id: "b", ownerProgramId: "prog1" }), NOW);
  const otherProgram = identityProfile({ id: "c", ownerProgramId: "prog2" });
  const result = resolveEnabledLibraryItemsForProgram([enabled, archived, otherProgram], "prog1");
  assert.deepEqual(
    result.map((i) => i.id),
    ["a"]
  );
});

// --- Safe defaults / normalize ---

test("normalizeIdentityProfile backfills missing optional fields to safe defaults, including compatibility flags defaulting to true", () => {
  const { successFocusCompatible, postActionReplayCompatible, gratitudeCompatible, status, schemaVersion, ...legacyShape } = identityProfile();
  const normalized = normalizeIdentityProfile(legacyShape as IdentityProfile);
  assert.equal(normalized.successFocusCompatible, true);
  assert.equal(normalized.postActionReplayCompatible, true);
  assert.equal(normalized.gratitudeCompatible, true);
  assert.equal(normalized.status, "enabled");
  assert.equal(normalized.schemaVersion, 1);
});

test("normalizeIdentityProfile never overwrites an already-configured field, including an explicit false compatibility flag", () => {
  const configured = identityProfile({ identityMantra: "אני מתקדם צעד אחר צעד", successFocusCompatible: false });
  const normalized = normalizeIdentityProfile(configured);
  assert.equal(normalized.identityMantra, "אני מתקדם צעד אחר צעד");
  assert.equal(normalized.successFocusCompatible, false);
});

// --- Input is not mutated ---

test("upsertIdentityProfileInList never mutates the input array", () => {
  const original = [identityProfile({ id: "a" })];
  const originalCopy = JSON.parse(JSON.stringify(original));
  upsertIdentityProfileInList(original, identityProfile({ id: "b" }));
  assert.deepEqual(original, originalCopy);
});
