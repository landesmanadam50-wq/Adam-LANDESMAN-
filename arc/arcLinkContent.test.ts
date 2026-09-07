import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveActionLabel,
  resolveEncodingBodyLanguage,
  resolveFutureMantra,
  resolveIdentityLabel,
  resolveSupportiveStateLabel,
  resolveValueLabel,
} from "./arcLinkContent.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import type { ArcBuildProfile } from "./types.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return { ...createEmptyArcBuildProfile(), ...overrides };
}

test("resolveValueLabel reads the build-global value field, safe for a legacy/missing value", () => {
  assert.equal(resolveValueLabel(profile()), "");
  assert.equal(resolveValueLabel(profile({ value: "בריאות וחופש" })), "בריאות וחופש");
});

test("resolveIdentityLabel: identity target reads desiredIdentity, state target reads supportiveState, habit has neither", () => {
  const p = profile({ desiredIdentity: "אדם ממושמע", supportiveState: "רוגע" });
  assert.equal(resolveIdentityLabel(p, "identity"), "אדם ממושמע");
  assert.equal(resolveIdentityLabel(p, "state"), "רוגע");
  assert.equal(resolveIdentityLabel(p, "habit"), "");
});

test("resolveSupportiveStateLabel: only the identity layer has a separate internal-condition field (identityDesiredState) -- state/habit always return ''", () => {
  const p = profile({ identityDesiredState: "אנרגטיות ונחישות", supportiveState: "רוגע" });
  assert.equal(resolveSupportiveStateLabel(p, "identity"), "אנרגטיות ונחישות");
  assert.equal(resolveSupportiveStateLabel(p, "state"), "", "the state layer's own supportiveState (resolveIdentityLabel) already plays this role -- never duplicated here");
  assert.equal(resolveSupportiveStateLabel(p, "habit"), "");
});

test("resolveIdentityLabel and resolveSupportiveStateLabel never collapse into one field -- both can be configured independently and stay separate", () => {
  const p = profile({ desiredIdentity: "אדם ממושמע", identityDesiredState: "אנרגטיות ונחישות" });
  const identity = resolveIdentityLabel(p, "identity");
  const state = resolveSupportiveStateLabel(p, "identity");
  assert.equal(identity, "אדם ממושמע");
  assert.equal(state, "אנרגטיות ונחישות");
  assert.notEqual(identity, state);
});

test("resolveActionLabel: internalAction/identityAction take priority over beneficialAction, per target", () => {
  const p = profile({ internalAction: "סריקת גוף", identityAction: "לומר שלום", beneficialAction: "לצאת להליכה" });
  assert.equal(resolveActionLabel(p, "state"), "סריקת גוף");
  assert.equal(resolveActionLabel(p, "identity"), "לומר שלום");
  assert.equal(resolveActionLabel(p, "habit"), "לצאת להליכה");
});

test("resolveActionLabel falls back to beneficialAction when the per-target action is missing", () => {
  const p = profile({ beneficialAction: "לצאת להליכה" });
  assert.equal(resolveActionLabel(p, "state"), "לצאת להליכה");
  assert.equal(resolveActionLabel(p, "identity"), "לצאת להליכה");
});

test("resolveEncodingBodyLanguage reads the identity/state cue's own bodyLanguageCue + bodyImagery, per target", () => {
  const p = profile({
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: "גב זקוף", mantra: null, bodyImagery: { bodyParts: ["הגב"], imageryText: "x" } },
  });
  const result = resolveEncodingBodyLanguage(p, "identity");
  assert.equal(result.cue, "גב זקוף");
  assert.deepEqual(result.bodyImagery, { bodyParts: ["הגב"], imageryText: "x" });
  assert.equal(resolveEncodingBodyLanguage(p, "state").cue, "");
});

// ---------------------------------------------------------------------------
// resolveFutureMantra: override -> Future Mantra -> older Identity Mantra -> ""
// ---------------------------------------------------------------------------

test("resolveFutureMantra: an explicit override always wins, even when a Future Mantra and an Identity Mantra both exist", () => {
  const p = profile({
    identityFutureOrientedMantra: "אני מתחיל היום בצעד קטן",
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני משמעתי" },
  });
  assert.equal(resolveFutureMantra(p, "identity", "מנטרה מותאמת לקישור הזה"), "מנטרה מותאמת לקישור הזה");
});

test("resolveFutureMantra: with no override, the referenced ARC's own Future Mantra wins over the older Identity Mantra -- never silently prefers the older one", () => {
  const p = profile({
    identityFutureOrientedMantra: "אני מתחיל היום בצעד קטן",
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני משמעתי" },
  });
  assert.equal(resolveFutureMantra(p, "identity", null), "אני מתחיל היום בצעד קטן");
  assert.equal(resolveFutureMantra(p, "identity", undefined), "אני מתחיל היום בצעד קטן");
  assert.equal(resolveFutureMantra(p, "identity", ""), "אני מתחיל היום בצעד קטן", "a blank/whitespace override is treated as no override");
});

test("resolveFutureMantra: falls back to the older Identity/State Mantra when no Future Mantra is configured", () => {
  const p = profile({
    identityEncoding: { target: "identity", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני משמעתי" },
  });
  assert.equal(resolveFutureMantra(p, "identity", null), "אני משמעתי");
});

test("resolveFutureMantra: safe empty string when nothing is configured at all, for every target", () => {
  const p = profile();
  assert.equal(resolveFutureMantra(p, "identity", null), "");
  assert.equal(resolveFutureMantra(p, "state", null), "");
  assert.equal(resolveFutureMantra(p, "habit", null), "", "habit has no future-oriented-mantra field and no habit-layer EncodingProfile.mantra");
});

test("resolveFutureMantra: state target reads stateFutureOrientedMantra / stateEncoding.mantra, never identity's fields", () => {
  const p = profile({
    stateFutureOrientedMantra: "אני נושם ומתקדם",
    identityFutureOrientedMantra: "לא רלוונטי לפה",
  });
  assert.equal(resolveFutureMantra(p, "state", null), "אני נושם ומתקדם");
});
