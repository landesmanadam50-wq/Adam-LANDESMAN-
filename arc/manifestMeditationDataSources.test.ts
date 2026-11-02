import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import {
  suggestHabitsFromRecurringTasks,
  suggestIdentitiesFromIdentityProfiles,
  suggestPersonalSentencesFromIdentityProfiles,
  suggestValuesFromIdentityProfiles,
} from "./manifestMeditationDataSources.ts";
import type { IdentityProfile } from "./identityProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function identityProfile(overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return {
    id: "ip1",
    ownerProgramId: null,
    name: "אדם יצרני",
    value: "יצירתיות",
    identityMantra: "אני אדם שמתחיל",
    desiredIdentityState: null,
    bodyLanguageCue: null,
    futureMantra: "אני הופך למי שאני רוצה להיות",
    encodingCue: null,
    status: "enabled",
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as IdentityProfile;
}

test("suggestValuesFromIdentityProfiles/suggestIdentitiesFromIdentityProfiles pull real, already-saved fields, deduplicated", () => {
  const profiles = [identityProfile({ id: "a", name: "אדם יצרני", value: "יצירתיות" }), identityProfile({ id: "b", name: "אדם נחוש", value: "יצירתיות" })];
  assert.deepEqual(suggestValuesFromIdentityProfiles(profiles), ["יצירתיות"]);
  assert.deepEqual(suggestIdentitiesFromIdentityProfiles(profiles), ["אדם יצרני", "אדם נחוש"]);
});

test("suggestPersonalSentencesFromIdentityProfiles pulls both mantra fields, deduplicated and never blank", () => {
  const profiles = [identityProfile({ identityMantra: "אני מתחיל", futureMantra: null })];
  assert.deepEqual(suggestPersonalSentencesFromIdentityProfiles(profiles), ["אני מתחיל"]);
});

test("disabled/archived IdentityProfiles never contribute a suggestion", () => {
  const profiles = [identityProfile({ status: "disabled", value: "ביטחון" })];
  assert.deepEqual(suggestValuesFromIdentityProfiles(profiles), []);
});

test("suggestHabitsFromRecurringTasks returns only recurring, non-archived task titles", () => {
  const recurring = { ...createEmptyTask("t1", "לכתוב יומן", "לפתוח מחברת", NOW), recurrence: { kind: "recurring" as const, daysOfWeek: [1] } };
  const oneTime = createEmptyTask("t2", "לקנות מתנה", "לנסוע לחנות", NOW);
  const archivedRecurring = { ...createEmptyTask("t3", "לרוץ", "לנעול נעליים", NOW), recurrence: { kind: "recurring" as const, daysOfWeek: [2] }, status: "archived" as const };
  assert.deepEqual(suggestHabitsFromRecurringTasks([recurring, oneTime, archivedRecurring]), ["לכתוב יומן"]);
});
