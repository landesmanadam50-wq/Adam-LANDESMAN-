import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBeliefArcFromDraft,
  createEmptyBeliefArcDraft,
  deleteBeliefArcFromList,
  draftFromBeliefArc,
  duplicateBeliefArc,
  isBeliefArcDraftComplete,
  normalizeBeliefArc,
  resolveBeliefFallbackBridgeMantra,
  resolveBeliefFallbackLimitingBelief,
  resolveBeliefFallbackReplacementBelief,
  upsertBeliefArcInList,
} from "./beliefArcs.ts";
import type { BeliefArcDraft } from "./beliefArcs.ts";
import { createEmptyArcBuildProfile, createEmptyBeliefArc } from "./types.ts";
import type { ArcBuildProfile, BeliefArc } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

function beliefArc(overrides: Partial<BeliefArc> = {}): BeliefArc {
  return { ...createEmptyBeliefArc("b1", "אמונה", "2024-01-01T00:00:00.000Z"), ...overrides };
}

function miniBuild(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "Mini Belief",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    presenceColor: "סגול",
    regulationAnchor: "נשימה טבעית",
    encodingAction: "עוגן קידוד",
    beneficialAction: "פעולה קצרה",
    protocolKind: "belief",
    ...overrides,
  };
}

// --- List CRUD ---

test("upsertBeliefArcInList updates the matching BeliefArc in place by id, never touching another", () => {
  const list = [beliefArc({ id: "a", name: "א" }), beliefArc({ id: "b", name: "ב" })];
  const updated = upsertBeliefArcInList(list, beliefArc({ id: "a", name: "א מעודכן" }));
  assert.equal(updated.find((b) => b.id === "a")!.name, "א מעודכן");
  assert.equal(updated.find((b) => b.id === "b")!.name, "ב");
  assert.equal(updated.length, 2);
});

test("upsertBeliefArcInList appends a new BeliefArc when the id doesn't match any existing one", () => {
  const list = [beliefArc({ id: "a" })];
  const updated = upsertBeliefArcInList(list, beliefArc({ id: "new" }));
  assert.equal(updated.length, 2);
});

test("deleteBeliefArcFromList removes exactly the matching BeliefArc, leaving every other one untouched", () => {
  const a = beliefArc({ id: "a" });
  const b = beliefArc({ id: "b" });
  const updated = deleteBeliefArcFromList([a, b], "a");
  assert.deepEqual(updated, [b]);
});

test("duplicateBeliefArc generates a new unique id, adjusts the name, and never mutates the original", () => {
  const original = beliefArc({ id: "orig", name: "אמונה" });
  const copy = duplicateBeliefArc(original, "2024-06-01T00:00:00.000Z");
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, "אמונה (עותק)");
  assert.equal(original.name, "אמונה");
});

// --- Draft ---

test("createEmptyBeliefArcDraft is never itself complete unless a name is filled in -- only name is required", () => {
  assert.equal(isBeliefArcDraftComplete(createEmptyBeliefArcDraft()), false);
  assert.equal(isBeliefArcDraftComplete({ ...createEmptyBeliefArcDraft(), name: "אמונה" }), true);
});

test("isBeliefArcDraftComplete treats whitespace-only name as incomplete", () => {
  assert.equal(isBeliefArcDraftComplete({ ...createEmptyBeliefArcDraft(), name: "   " }), false);
});

test("buildBeliefArcFromDraft throws for an incomplete draft -- never silently saves a partial BeliefArc", () => {
  assert.throws(() => buildBeliefArcFromDraft(createEmptyBeliefArcDraft(), "b1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"));
});

test("buildBeliefArcFromDraft converts blank optional fields to null, never an empty string", () => {
  const draft: BeliefArcDraft = { ...createEmptyBeliefArcDraft(), name: "אמונה" };
  const built = buildBeliefArcFromDraft(draft, "b1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  assert.equal(built.limitingBelief, null);
  assert.equal(built.replacementBelief, null);
  assert.equal(built.bridgeMantra, null);
  assert.equal(built.futureImageryDwellSeconds, null);
  assert.equal(built.postActionImageryDwellSeconds, null);
});

test("buildBeliefArcFromDraft persists every filled-in field, trimmed", () => {
  const draft: BeliefArcDraft = {
    ...createEmptyBeliefArcDraft(),
    name: "  אמונה  ",
    limitingBelief: "  אני לא מספיק טוב  ",
    replacementBelief: "אני מתפתח בכל יום",
    bridgeMantra: "אני לא חייב לפעול לפי האמונה הזאת",
    futureImageryDwellSeconds: "12",
    postActionImageryDwellSeconds: "8",
  };
  const built = buildBeliefArcFromDraft(draft, "b1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  assert.equal(built.name, "אמונה");
  assert.equal(built.limitingBelief, "אני לא מספיק טוב");
  assert.equal(built.replacementBelief, "אני מתפתח בכל יום");
  assert.equal(built.bridgeMantra, "אני לא חייב לפעול לפי האמונה הזאת");
  assert.equal(built.futureImageryDwellSeconds, 12);
  assert.equal(built.postActionImageryDwellSeconds, 8);
});

test("buildBeliefArcFromDraft ignores a non-numeric/zero/negative dwell duration, falling back to null rather than an invalid value", () => {
  for (const value of ["abc", "0", "-5", ""]) {
    const draft: BeliefArcDraft = { ...createEmptyBeliefArcDraft(), name: "אמונה", futureImageryDwellSeconds: value };
    const built = buildBeliefArcFromDraft(draft, "b1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    assert.equal(built.futureImageryDwellSeconds, null, `value "${value}" must not produce an invalid dwell`);
  }
});

test("draftFromBeliefArc round-trips a saved BeliefArc back into editable text", () => {
  const real = beliefArc({ limitingBelief: "אני אכשל", replacementBelief: "אני מוכן" });
  const draft = draftFromBeliefArc(real);
  assert.equal(draft.limitingBelief, "אני אכשל");
  assert.equal(draft.replacementBelief, "אני מוכן");
});

test("draftFromBeliefArc safely defaults a malformed/legacy record's missing fields to empty text rather than crashing", () => {
  const malformed = { id: "b1", name: "x", createdAt: "t", updatedAt: "t" } as unknown as BeliefArc;
  assert.doesNotThrow(() => draftFromBeliefArc(malformed));
  const draft = draftFromBeliefArc(malformed);
  assert.equal(draft.replacementBelief, "");
  assert.equal(draft.bridgeMantra, "");
});

// --- normalizeBeliefArc (backward compatibility / test #40, #34) ---

test("normalizeBeliefArc backfills every field missing from a genuinely legacy record to null, never inventing content", () => {
  const full = beliefArc({ replacementBelief: "x", bridgeMantra: "y" });
  const { limitingBelief, replacementBelief, bridgeMantra, regulationAnchor, futureImageryDwellSeconds, postActionImageryDwellSeconds, ...legacyShape } = full;
  const normalized = normalizeBeliefArc(legacyShape as BeliefArc);
  assert.equal(normalized.replacementBelief, null);
  assert.equal(normalized.bridgeMantra, null);
  assert.equal(normalized.limitingBelief, null);
});

test("normalizeBeliefArc never overwrites an already-configured field", () => {
  const configured = beliefArc({ replacementBelief: "אמונה תומכת", bridgeMantra: "מנטרת גשר" });
  const normalized = normalizeBeliefArc(configured);
  assert.equal(normalized.replacementBelief, "אמונה תומכת");
  assert.equal(normalized.bridgeMantra, "מנטרת גשר");
});

test("a JSON round trip (JSON.stringify then JSON.parse, exactly what data/storage.ts does) preserves every field intact", () => {
  const original = beliefArc({ replacementBelief: "x", bridgeMantra: "y", limitingBelief: "z" });
  const roundTripped = JSON.parse(JSON.stringify(original)) as BeliefArc;
  assert.deepEqual(roundTripped, original);
});

// --- resolveBeliefFallback* (spec sections 20/26) ---

test("resolveBeliefFallbackLimitingBelief prefers the BeliefArc's own value over anything else", () => {
  const arc = beliefArc({ limitingBelief: "אני לא מספיק טוב" });
  const profile: ArcBuildProfile = { ...createEmptyArcBuildProfile(), identityLimitingBelief: "profile belief" };
  assert.equal(resolveBeliefFallbackLimitingBelief(arc, profile), "אני לא מספיק טוב");
});

test("resolveBeliefFallbackLimitingBelief falls back to profile.identityLimitingBelief, then stateLimitingBelief, when the BeliefArc's own is missing", () => {
  const empty = beliefArc({ limitingBelief: null });
  const identityOnly: ArcBuildProfile = { ...createEmptyArcBuildProfile(), identityLimitingBelief: "identity belief" };
  assert.equal(resolveBeliefFallbackLimitingBelief(empty, identityOnly), "identity belief");
  const stateOnly: ArcBuildProfile = { ...createEmptyArcBuildProfile(), stateLimitingBelief: "state belief" };
  assert.equal(resolveBeliefFallbackLimitingBelief(empty, stateOnly), "state belief");
});

test("resolveBeliefFallbackLimitingBelief returns null (never invents) when nothing is configured anywhere", () => {
  assert.equal(resolveBeliefFallbackLimitingBelief(beliefArc({ limitingBelief: null }), null), null);
  assert.equal(resolveBeliefFallbackLimitingBelief(null, null), null);
});

test("resolveBeliefFallbackReplacementBelief order: own -> linked Mini -> identityBridgeBelief -> stateBridgeBelief", () => {
  const own = beliefArc({ replacementBelief: "own" });
  assert.equal(resolveBeliefFallbackReplacementBelief(own, miniBuild({ replacementBelief: "mini" }), null), "own");

  const empty = beliefArc({ replacementBelief: null });
  assert.equal(resolveBeliefFallbackReplacementBelief(empty, miniBuild({ replacementBelief: "mini" }), null), "mini");

  const profileIdentity: ArcBuildProfile = { ...createEmptyArcBuildProfile(), identityBridgeBelief: "identity bridge" };
  assert.equal(resolveBeliefFallbackReplacementBelief(empty, null, profileIdentity), "identity bridge");

  const profileState: ArcBuildProfile = { ...createEmptyArcBuildProfile(), stateBridgeBelief: "state bridge" };
  assert.equal(resolveBeliefFallbackReplacementBelief(empty, null, profileState), "state bridge");

  assert.equal(resolveBeliefFallbackReplacementBelief(empty, null, null), null);
});

test("resolveBeliefFallbackBridgeMantra order: own -> linked Mini's bridgeMantraText -> null", () => {
  const own = beliefArc({ bridgeMantra: "own bridge" });
  assert.equal(resolveBeliefFallbackBridgeMantra(own, miniBuild({ bridgeMantraText: "mini bridge" })), "own bridge");

  const empty = beliefArc({ bridgeMantra: null });
  assert.equal(resolveBeliefFallbackBridgeMantra(empty, miniBuild({ bridgeMantraText: "mini bridge" })), "mini bridge");
  assert.equal(resolveBeliefFallbackBridgeMantra(empty, null), null);
});
