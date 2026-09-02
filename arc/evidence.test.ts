import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEvidenceIndex,
  buildSessionEvidenceContext,
  resolveEncodingEvidenceContext,
  resolveIdentityLabelForLayer,
  selectEncodingEvidence,
} from "./evidence.ts";
import type { EncodingEvidenceContext, EvidenceRecord } from "./evidence.ts";
import type { ArcBuildProfile, EncodingProfile } from "./types.ts";
import type { SessionLogEntry } from "../data/sessionLog.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    goal: "לחיות בהתאם לערכים שלי",
    interferingState: "פחד",
    challengeContext: "אחרי טעות",
    statePreventiveAction: null,
    stateEncodingRegulationCue: null,
    supportiveState: "חמלה",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" },
    internalAction: "סריקת גוף",
    internalActionBodyCue: null,
    stateDwellTimes: null,
    desiredIdentity: "משמעת עצמית",
    identityChallengeContext: "לפני שיחה קשה",
    identityInterferingEmotion: "היסוס",
    identityPreventiveAction: null,
    identityEncodingRegulationCue: null,
    identityEncoding: { target: "משמעת עצמית", bodySensationCue: null, breathCue: null, bodyLanguageCue: "ראש ישר", mantra: "אני ממושמע" },
    identityAction: "לגשת ולפתוח שיחה",
    identityActionBodyCue: null,
    identityDwellTimes: null,
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    beneficialActionBodyCue: null,
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    negativeActionBaseDurationMinutes: null,
    negativeActionReductionEnabled: true,
    ...overrides,
  };
}

function sessionEntry(overrides: Partial<SessionLogEntry> = {}): SessionLogEntry {
  return {
    id: "s1",
    startedAt: "2026-01-01T09:00:00.000Z",
    finishedAt: "2026-01-01T09:20:00.000Z",
    success: false,
    fall: false,
    ...overrides,
  };
}

const disciplineContext = {
  targetLayer: "identity" as const,
  identityLabel: "משמעת עצמית",
  goal: "לחיות בהתאם לערכים שלי",
  habit: "גלילה ברשת",
  currentAction: "התחלת את מה שתכננת",
  interferingState: "היסוס",
  challengeContext: "לפני שיחה קשה",
  triggerContext: null,
  triggerKnown: null,
};

const focusContext = {
  targetLayer: "state" as const,
  identityLabel: "חמלה",
  goal: "לחיות בהתאם לערכים שלי",
  habit: "גלילה ברשת",
  currentAction: null,
  interferingState: "פחד",
  challengeContext: "אחרי טעות",
  triggerContext: null,
  triggerKnown: null,
};

// --- Layer/context resolution ---------------------------------------------

test("resolveIdentityLabelForLayer resolves state/identity from the EncodingProfile target, and habit from beneficialAction directly (habit has no EncodingProfile of its own)", () => {
  const p = profile();
  const stateEncoding: EncodingProfile = { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: null };
  assert.equal(resolveIdentityLabelForLayer("state", stateEncoding, p), "חמלה");
  const identityEncoding: EncodingProfile = { target: "משמעת עצמית", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: null };
  assert.equal(resolveIdentityLabelForLayer("identity", identityEncoding, p), "משמעת עצמית");
  assert.equal(resolveIdentityLabelForLayer("habit", null, p), p.beneficialAction);
});

test("resolveEncodingEvidenceContext/buildSessionEvidenceContext resolve the exact same identityLabel for the same layer/encoding/profile inputs -- the two call sites can never silently drift apart", () => {
  const p = profile();
  const encoding = p.identityEncoding;
  const liveContext = resolveEncodingEvidenceContext("identity", encoding, p);
  const sessionContext = buildSessionEvidenceContext("identity", encoding, "פעולה כלשהי", p);
  assert.equal(liveContext.identityLabel, sessionContext.identityLabel);
  assert.equal(liveContext.targetLayer, sessionContext.targetLayer);
  assert.equal(liveContext.goal, sessionContext.goal);
  assert.equal(liveContext.habit, sessionContext.habit);
});

// --- Reactive-flow-strengthening task (#7, #8): buildSessionEvidenceContext's
// own optional triggerContext parameter -- the session-specific trigger
// text (ArcLiveState.triggerContext) carried straight through to storage,
// entirely separate from profile.challengeContext/identityChallengeContext.

test("buildSessionEvidenceContext carries the session-specific triggerContext straight through, verbatim, when provided", () => {
  const p = profile();
  const context = buildSessionEvidenceContext("state", p.stateEncoding, "פעולה כלשהי", p, "ראיתי סרטון בטלפון");
  assert.equal(context.triggerContext, "ראיתי סרטון בטלפון");
});

test("buildSessionEvidenceContext defaults triggerContext to null when omitted -- every existing call site (before this task) stays valid unchanged", () => {
  const p = profile();
  const context = buildSessionEvidenceContext("state", p.stateEncoding, "פעולה כלשהי", p);
  assert.equal(context.triggerContext, null);
});

test("triggerContext is never conflated with challengeContext -- the session-specific trigger and the BUILD-configured, reusable Challenge Context are always kept as two distinct fields", () => {
  const p = profile({ challengeContext: "אחרי טעות" });
  const context = buildSessionEvidenceContext("state", p.stateEncoding, "פעולה כלשהי", p, "ראיתי סרטון בטלפון");
  assert.equal(context.challengeContext, "אחרי טעות", "BUILD's own Challenge Context, unchanged");
  assert.equal(context.triggerContext, "ראיתי סרטון בטלפון", "the session-specific trigger, kept separate");
  assert.notEqual(context.challengeContext, context.triggerContext);
});

// --- buildEvidenceIndex: derived from the ONE existing history store -----

test("buildEvidenceIndex derives a beneficial_action record only when the session both succeeded (realActionCompleted) AND has a resolved currentAction in its context", () => {
  const withBoth = sessionEntry({ success: true, context: disciplineContext });
  const successNoContext = sessionEntry({ success: true, context: null });
  const contextNoSuccess = sessionEntry({ success: false, context: disciplineContext });
  const contextNoAction = sessionEntry({ success: true, context: { ...disciplineContext, currentAction: null } });

  assert.equal(buildEvidenceIndex([withBoth]).filter((r) => r.sourceType === "beneficial_action").length, 1);
  assert.equal(buildEvidenceIndex([successNoContext]).filter((r) => r.sourceType === "beneficial_action").length, 0);
  assert.equal(buildEvidenceIndex([contextNoSuccess]).filter((r) => r.sourceType === "beneficial_action").length, 0);
  assert.equal(buildEvidenceIndex([contextNoAction]).filter((r) => r.sourceType === "beneficial_action").length, 0);
});

test("buildEvidenceIndex derives a gratitude record only when Gratitude text is non-empty, trimming whitespace-only text to nothing", () => {
  const withGratitude = sessionEntry({ gratitude: "הצלחתי להישאר עם התחושה" });
  const emptyGratitude = sessionEntry({ gratitude: "" });
  const whitespaceOnly = sessionEntry({ gratitude: "   " });
  const noGratitude = sessionEntry({ gratitude: null });

  assert.equal(buildEvidenceIndex([withGratitude]).filter((r) => r.sourceType === "gratitude").length, 1);
  assert.equal(buildEvidenceIndex([emptyGratitude]).filter((r) => r.sourceType === "gratitude").length, 0);
  assert.equal(buildEvidenceIndex([whitespaceOnly]).filter((r) => r.sourceType === "gratitude").length, 0);
  assert.equal(buildEvidenceIndex([noGratitude]).filter((r) => r.sourceType === "gratitude").length, 0);
});

test("a single session with BOTH a completed action and written Gratitude yields two records sharing the SAME sourceSessionId and the SAME memoryDetail -- one real source, two facets", () => {
  const entry = sessionEntry({
    id: "shared-session",
    success: true,
    context: disciplineContext,
    gratitude: "הצלחתי להישאר עם התחושה",
    gratitudeMemoryDetail: "שמתי לב שהכתפיים שלי נרגעו",
  });
  const records = buildEvidenceIndex([entry]);
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.sourceSessionId === "shared-session"));
  assert.ok(records.every((r) => r.memoryDetail === "שמתי לב שהכתפיים שלי נרגעו"));
});

test("buildEvidenceIndex never fabricates a memoryDetail -- absent/empty gratitudeMemoryDetail on the source entry always yields null, never invented text", () => {
  const noDetail = sessionEntry({ success: true, context: disciplineContext, gratitudeMemoryDetail: null });
  const emptyDetail = sessionEntry({ success: true, context: disciplineContext, gratitudeMemoryDetail: "   " });
  for (const entry of [noDetail, emptyDetail]) {
    const [record] = buildEvidenceIndex([entry]);
    assert.equal(record.memoryDetail, null);
  }
});

test("legacy SessionLogEntry data (no context, no gratitudeMemoryDetail field at all -- as before this task existed) is handled safely: gratitude alone still yields a record with no context metadata and no fabricated memoryDetail, never a crash", () => {
  const legacy: SessionLogEntry = {
    id: "legacy",
    startedAt: "2025-01-01T00:00:00.000Z",
    finishedAt: "2025-01-01T00:30:00.000Z",
    success: true,
    fall: false,
    gratitude: "תודה על היום",
    // context and gratitudeMemoryDetail intentionally omitted entirely.
  };
  const records = buildEvidenceIndex([legacy]);
  // success:true but no context.currentAction -> no beneficial_action record; gratitude present -> one gratitude record.
  assert.equal(records.length, 1);
  assert.equal(records[0].sourceType, "gratitude");
  assert.equal(records[0].memoryDetail, null);
  assert.equal(records[0].targetLayer, null);
  assert.equal(records[0].identityLabel, null);
});

// --- selectEncodingEvidence: priority, relevance, same-source, caps ------

test("relevant behavioral evidence is preferred over relevant Gratitude, even when both are equally structurally relevant", () => {
  const index: EvidenceRecord[] = [
    {
      sourceType: "gratitude",
      sourceSessionId: "g1",
      timestamp: "2026-01-02T09:00:00.000Z",
      text: "אני מוקיר תודה שהצלחתי להישאר עם התחושה",
      memoryDetail: null,
      ...disciplineContext,
    },
    {
      sourceType: "beneficial_action",
      sourceSessionId: "b1",
      timestamp: "2026-01-01T09:00:00.000Z", // even though OLDER than the gratitude entry
      text: "התחלת את מה שתכננת",
      memoryDetail: null,
      ...disciplineContext,
    },
  ];
  const [selected] = selectEncodingEvidence(index, disciplineContext);
  assert.equal(selected.sourceType, "beneficial_action", "behavioral evidence wins the priority rule even over a more recent Gratitude entry");
});

test("relevant Gratitude is used when no behavioral evidence is available at all", () => {
  const index: EvidenceRecord[] = [
    {
      sourceType: "gratitude",
      sourceSessionId: "g1",
      timestamp: "2026-01-01T09:00:00.000Z",
      text: "אני מעריך את זה שהיום עצרתי והקשבתי לעצמי",
      memoryDetail: null,
      ...disciplineContext,
    },
  ];
  const [selected] = selectEncodingEvidence(index, disciplineContext);
  assert.equal(selected.sourceType, "gratitude");
});

test("unrelated Gratitude (captured for a DIFFERENT identity/target, and not naming the current identity/goal/habit) is rejected -- the spec's own 'weather' bad example", () => {
  const unrelatedContext = { targetLayer: "state" as const, identityLabel: "רוגע", goal: null, habit: null, currentAction: null, interferingState: null, challengeContext: null };
  const index: EvidenceRecord[] = [
    {
      sourceType: "gratitude",
      sourceSessionId: "g1",
      timestamp: "2026-01-01T09:00:00.000Z",
      text: "אני מודה על מזג האוויר",
      memoryDetail: null,
      ...unrelatedContext,
    },
  ];
  const selected = selectEncodingEvidence(index, disciplineContext);
  assert.deepEqual(selected, [], "no sufficiently relevant record -- must not be selected");
});

test("unrelated behavioral evidence (from a different target's session) is rejected, never selected just because it's positive", () => {
  const index: EvidenceRecord[] = [
    {
      sourceType: "beneficial_action",
      sourceSessionId: "b1",
      timestamp: "2026-01-01T09:00:00.000Z",
      text: "עשה מדיטציה של 10 דקות",
      memoryDetail: null,
      ...focusContext, // a DIFFERENT layer/identity than disciplineContext
    },
  ];
  assert.deepEqual(selectEncodingEvidence(index, disciplineContext), []);
});

test("a Gratitude entry that explicitly names the current identity (content match) is accepted even without a structural (same-session-target) link", () => {
  const noStructuralLink = { targetLayer: null, identityLabel: null, goal: null, habit: null, currentAction: null, interferingState: null, challengeContext: null };
  const index: EvidenceRecord[] = [
    {
      sourceType: "gratitude",
      sourceSessionId: "g1",
      timestamp: "2026-01-01T09:00:00.000Z",
      text: "היום התנהגתי כמו אדם עם משמעת עצמית",
      memoryDetail: null,
      ...noStructuralLink,
    },
  ];
  const [selected] = selectEncodingEvidence(index, disciplineContext);
  assert.equal(selected.sourceType, "gratitude");
});

test("no-match falls back cleanly to an empty selection (Identity/Mantra alone) when the index is empty or nothing clears the relevance bar", () => {
  assert.deepEqual(selectEncodingEvidence([], disciplineContext), []);
  const onlyUnrelated: EvidenceRecord[] = [
    { sourceType: "gratitude", sourceSessionId: "g1", timestamp: "t", text: "משהו כללי", memoryDetail: null, targetLayer: null, identityLabel: null, goal: null, habit: null, interferingState: null, challengeContext: null },
  ];
  assert.deepEqual(selectEncodingEvidence(onlyUnrelated, disciplineContext), []);
});

test("exactly one item is selected by default when only one relevant record exists", () => {
  const index: EvidenceRecord[] = [
    { sourceType: "beneficial_action", sourceSessionId: "b1", timestamp: "t", text: "התחלת את מה שתכננת", memoryDetail: null, ...disciplineContext },
  ];
  const selected = selectEncodingEvidence(index, disciplineContext);
  assert.equal(selected.length, 1);
});

test("at most two items can be selected, and only when BOTH are highly (structurally) relevant -- a strong item plus a merely content-matched one stays at one", () => {
  const strong: EvidenceRecord = { sourceType: "beneficial_action", sourceSessionId: "b1", timestamp: "2026-01-02T00:00:00.000Z", text: "התחלת את מה שתכננת", memoryDetail: null, ...disciplineContext };
  const secondStrong: EvidenceRecord = { sourceType: "beneficial_action", sourceSessionId: "b2", timestamp: "2026-01-01T00:00:00.000Z", text: "המשכת לפעול למרות הדחף", memoryDetail: null, ...disciplineContext };
  const weakContentOnly: EvidenceRecord = {
    sourceType: "gratitude",
    sourceSessionId: "g1",
    timestamp: "2026-01-03T00:00:00.000Z", // most recent, but only content-matched (score 1), not structural
    text: "היום התנהגתי כמו אדם עם משמעת עצמית",
    memoryDetail: null,
    targetLayer: null,
    identityLabel: null,
    goal: null,
    habit: null,
    interferingState: null,
    challengeContext: null,
  };

  const twoStrong = selectEncodingEvidence([strong, secondStrong], disciplineContext, 2);
  assert.equal(twoStrong.length, 2, "two structurally-strong items may both be kept when maxItems allows it");

  const oneStrongOneWeak = selectEncodingEvidence([strong, weakContentOnly], disciplineContext, 2);
  assert.equal(oneStrongOneWeak.length, 1, "the second item isn't itself highly relevant -- kept at one rather than padding");
  assert.equal(oneStrongOneWeak[0].sourceSessionId, "b1");
});

test("evidence is associated with, and selected for, the correct CURRENT identity/state -- Discipline's own evidence for a Discipline-targeted Encoding, Focus's own for a Focus-targeted one, never swapped", () => {
  const disciplineEvidence: EvidenceRecord = { sourceType: "beneficial_action", sourceSessionId: "b-discipline", timestamp: "t", text: "התחלת את מה שתכננת", memoryDetail: null, ...disciplineContext };
  const focusEvidence: EvidenceRecord = { sourceType: "beneficial_action", sourceSessionId: "b-focus", timestamp: "t", text: "שמרת על מיקוד לאורך כל הישיבה", memoryDetail: null, ...focusContext };
  const index = [disciplineEvidence, focusEvidence];

  const [selectedForDiscipline] = selectEncodingEvidence(index, disciplineContext);
  assert.equal(selectedForDiscipline.sourceSessionId, "b-discipline");

  const [selectedForFocus] = selectEncodingEvidence(index, focusContext);
  assert.equal(selectedForFocus.sourceSessionId, "b-focus");
});

test("evidence from another unrelated identity is not selected incorrectly even when it's the ONLY record available", () => {
  const focusEvidence: EvidenceRecord = { sourceType: "beneficial_action", sourceSessionId: "b-focus", timestamp: "t", text: "שמרת על מיקוד", memoryDetail: null, ...focusContext };
  assert.deepEqual(selectEncodingEvidence([focusEvidence], disciplineContext), []);
});

// --- Same-source rule (#13) ------------------------------------------------

test("the same-source rule holds by construction: a record's memoryDetail can only ever be the one stored on ITS OWN sourceSessionId, never mixed in from a different, merely-similar session", () => {
  const sessionA = sessionEntry({
    id: "A",
    success: true,
    context: disciplineContext,
    gratitudeMemoryDetail: "פרט מסשן A",
  });
  const sessionB = sessionEntry({
    id: "B",
    finishedAt: "2026-01-02T09:00:00.000Z",
    gratitude: "אני מוקיר תודה שלא ויתרתי", // same identity context as A, semantically similar
    context: disciplineContext,
    gratitudeMemoryDetail: "פרט מסשן B",
  });
  const index = buildEvidenceIndex([sessionA, sessionB]);
  for (const record of index) {
    if (record.sourceSessionId === "A") assert.equal(record.memoryDetail, "פרט מסשן A");
    if (record.sourceSessionId === "B") assert.equal(record.memoryDetail, "פרט מסשן B");
  }
});

// --- Provenance / no-fabrication (#8, #12) --------------------------------

test("every selected EvidenceRecord's text is verbatim from the stored source -- this module never generates or rephrases presentation text, so there is nothing that could later be mistaken for a new independent historical event", () => {
  const originalText = "אתמול, למרות שהיית עייף, התחלת את מה שתכננת.";
  const entry = sessionEntry({ success: true, context: { ...disciplineContext, currentAction: originalText } });
  const [record] = buildEvidenceIndex([entry]);
  assert.equal(record.text, originalText, "verbatim -- never paraphrased, shortened, or reworded by this module");
  assert.equal(record.sourceSessionId, entry.id, "provenance link back to the real source entry is always present");
});
