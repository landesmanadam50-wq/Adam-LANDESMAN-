import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyStateProfile, generateStateProfileId, isStateProfileCompleteForPractice, isStateProfileSaveable, normalizeStateProfile, upsertStateProfileInList } from "./stateProfile.ts";
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
  assert.equal(profile.mantraRepetitionMode, "once");
  assert.equal(profile.mantraFixedRepetitionCount, null);
  assert.equal(profile.mantraSpeakingMode, "silent");
  assert.equal(profile.mantraMinimumDwellSeconds, null);
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

// --- Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: mantra repetition fields ---

test("normalizeStateProfile backfills a missing mantraRepetitionMode to 'once' and mantraSpeakingMode to 'silent', never a stronger invented value", () => {
  const { mantraRepetitionMode, mantraFixedRepetitionCount, mantraSpeakingMode, mantraMinimumDwellSeconds, ...legacyShape } = stateProfile();
  const normalized = normalizeStateProfile(legacyShape as StateProfile);
  assert.equal(normalized.mantraRepetitionMode, "once");
  assert.equal(normalized.mantraFixedRepetitionCount, null);
  assert.equal(normalized.mantraSpeakingMode, "silent");
  assert.equal(normalized.mantraMinimumDwellSeconds, null);
});

test("normalizeStateProfile preserves an already-configured mantra repetition setup unchanged", () => {
  const configured = stateProfile({
    mantraRepetitionMode: "fixed_count",
    mantraFixedRepetitionCount: 5,
    mantraSpeakingMode: "aloud",
    mantraMinimumDwellSeconds: 20,
  });
  const normalized = normalizeStateProfile(configured);
  assert.equal(normalized.mantraRepetitionMode, "fixed_count");
  assert.equal(normalized.mantraFixedRepetitionCount, 5);
  assert.equal(normalized.mantraSpeakingMode, "aloud");
  assert.equal(normalized.mantraMinimumDwellSeconds, 20);
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

// --- isStateProfileSaveable (Phase 10) ---

test("isStateProfileSaveable accepts a name-only profile -- every other field left null, exactly like createEmptyStateProfile's own output", () => {
  assert.equal(isStateProfileSaveable(stateProfile()), true);
});

test("isStateProfileSaveable rejects a blank name", () => {
  assert.equal(isStateProfileSaveable(stateProfile({ name: "" })), false);
});

test("isStateProfileSaveable rejects a whitespace-only name", () => {
  assert.equal(isStateProfileSaveable(stateProfile({ name: "   " })), false);
});

test("isStateProfileSaveable accepts a null actionTimerConfig and a null durationMinutes", () => {
  assert.equal(isStateProfileSaveable(stateProfile({ actionTimerConfig: null })), true);
  assert.equal(isStateProfileSaveable(stateProfile({ actionTimerConfig: { durationMinutes: null } })), true);
});

test("isStateProfileSaveable accepts a positive, finite durationMinutes", () => {
  assert.equal(isStateProfileSaveable(stateProfile({ actionTimerConfig: { durationMinutes: 5 } })), true);
});

test("isStateProfileSaveable rejects a zero, negative, or non-finite durationMinutes", () => {
  assert.equal(isStateProfileSaveable(stateProfile({ actionTimerConfig: { durationMinutes: 0 } })), false);
  assert.equal(isStateProfileSaveable(stateProfile({ actionTimerConfig: { durationMinutes: -5 } })), false);
  assert.equal(isStateProfileSaveable(stateProfile({ actionTimerConfig: { durationMinutes: Number.NaN } })), false);
  assert.equal(isStateProfileSaveable(stateProfile({ actionTimerConfig: { durationMinutes: Number.POSITIVE_INFINITY } })), false);
});

test("isStateProfileSaveable never mutates the profile it validates", () => {
  const profile = stateProfile({ actionTimerConfig: { durationMinutes: 5 } });
  const before = JSON.parse(JSON.stringify(profile));
  isStateProfileSaveable(profile);
  assert.deepEqual(profile, before);
});

// --- Serialization round trip ---

test("a StateProfile survives a JSON.stringify/parse round trip with its status intact", () => {
  const archived = archiveLibraryItem(stateProfile({ primaryIdentityProfileId: "identity-1" }), LATER);
  const roundTripped = JSON.parse(JSON.stringify(archived)) as StateProfile;
  const normalized = normalizeStateProfile(roundTripped);
  assert.equal(normalized.status, "archived");
  assert.equal(normalized.primaryIdentityProfileId, "identity-1");
});

// --- Phase 14B-2: isStateProfileCompleteForPractice ---

test("isStateProfileCompleteForPractice is false for a name-only profile (same bar for an old or a new empty profile -- no schema-version distinction)", () => {
  assert.equal(isStateProfileCompleteForPractice(stateProfile()), false);
});

test("isStateProfileCompleteForPractice requires all three of regulationAnchor/encodingCue/action -- any one missing is incomplete", () => {
  assert.equal(isStateProfileCompleteForPractice(stateProfile({ regulationAnchor: "עוגן", encodingCue: "קידוד" })), false, "missing action");
  assert.equal(isStateProfileCompleteForPractice(stateProfile({ regulationAnchor: "עוגן", action: "פעולה" })), false, "missing encodingCue");
  assert.equal(isStateProfileCompleteForPractice(stateProfile({ encodingCue: "קידוד", action: "פעולה" })), false, "missing regulationAnchor");
});

test("isStateProfileCompleteForPractice is true once all three are set, regardless of schemaVersion", () => {
  const complete = stateProfile({ regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולה" });
  assert.equal(isStateProfileCompleteForPractice(complete), true);
  assert.equal(isStateProfileCompleteForPractice({ ...complete, schemaVersion: 1 }), true, "an old profile with the same three fields filled in is equally complete");
});

test("isStateProfileCompleteForPractice treats whitespace-only fields as missing", () => {
  assert.equal(isStateProfileCompleteForPractice(stateProfile({ regulationAnchor: "  ", encodingCue: "קידוד", action: "פעולה" })), false);
});

test("isStateProfileCompleteForPractice never mutates the profile it validates", () => {
  const profile = stateProfile({ regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולה" });
  const before = JSON.parse(JSON.stringify(profile));
  isStateProfileCompleteForPractice(profile);
  assert.deepEqual(profile, before);
});
