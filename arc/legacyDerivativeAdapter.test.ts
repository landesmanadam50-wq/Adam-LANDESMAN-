import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptBeliefArc,
  adaptBeliefArcToInterferenceItem,
  adaptPresenceArc,
  adaptThoughtArc,
  adaptThoughtArcToInterferenceItem,
  adaptUrgeArc,
  adaptUrgeArcToInterferenceItem,
  describeLegacyInterferenceCompatibility,
} from "./legacyDerivativeAdapter.ts";
import { createEmptyBeliefArc, createEmptyPresenceArc, createEmptyThoughtArc, createEmptyUrgeArc } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";

test("adaptUrgeArc: category is 'urge', unique fields and self-contained State are read directly from the record", () => {
  const urgeArc = { ...createEmptyUrgeArc("u1", "יוטיוב", NOW), interferingAction: "גלישה ביוטיוב", stopCue: "להניח את הטלפון", regulationAnchor: "נשימה עמוקה", beneficialAlternativeAction: "לפתוח את המשימה" };
  const adapted = adaptUrgeArc(urgeArc);
  assert.equal(adapted.category, "urge");
  assert.equal(adapted.id, "u1");
  assert.equal(adapted.name, "יוטיוב");
  assert.equal(adapted.uniqueFields.interferingAction, "גלישה ביוטיוב");
  assert.equal(adapted.uniqueFields.stopCue, "להניח את הטלפון");
  assert.equal(adapted.selfContainedState.regulationAnchor, "נשימה עמוקה");
  assert.equal(adapted.selfContainedState.action, "לפתוח את המשימה");
  assert.equal(adapted.legacySourceKind, "UrgeArc");
  assert.equal(adapted.legacySourceId, "u1");
});

test("adaptUrgeArc: an empty (never-filled-in) required action field degrades to null, never an empty string", () => {
  const urgeArc = createEmptyUrgeArc("u2", "חדש", NOW);
  assert.equal(urgeArc.beneficialAlternativeAction, "", "sanity check on the fixture -- createEmptyUrgeArc leaves this as an empty string");
  const adapted = adaptUrgeArc(urgeArc);
  assert.equal(adapted.selfContainedState.action, null);
});

test("adaptThoughtArc: category is 'thought', reads shortAction/encodingAnchor as the self-contained State", () => {
  const thoughtArc = { ...createEmptyThoughtArc("t1", "מחשבה", NOW), currentThought: "אני לא מספיק טוב", usefulInsight: "זו רק מחשבה, לא עובדה", encodingAnchor: "יד על החזה", shortAction: "לשלוח את המייל" };
  const adapted = adaptThoughtArc(thoughtArc);
  assert.equal(adapted.category, "thought");
  assert.equal(adapted.uniqueFields.thoughtText, "אני לא מספיק טוב");
  assert.equal(adapted.uniqueFields.usefulInsight, "זו רק מחשבה, לא עובדה");
  assert.equal(adapted.selfContainedState.regulationAnchor, "יד על החזה");
  assert.equal(adapted.selfContainedState.action, "לשלוח את המייל");
  assert.equal(adapted.legacySourceKind, "ThoughtArc");
});

test("adaptThoughtArc: a supportive-route record's supportiveThought is carried through separately from usefulInsight", () => {
  const thoughtArc = { ...createEmptyThoughtArc("t2", "מחשבה תומכת", NOW), supportiveThought: "אני מסוגל", usefulInsight: null };
  const adapted = adaptThoughtArc(thoughtArc);
  assert.equal(adapted.uniqueFields.supportiveThought, "אני מסוגל");
  assert.equal(adapted.uniqueFields.usefulInsight, null);
});

test("adaptBeliefArc: category is 'belief', reads regulationAnchor/shortAction as the self-contained State", () => {
  const beliefArc = { ...createEmptyBeliefArc("b1", "אמונה", NOW), limitingBelief: "אני לא מתמיד", replacementBelief: "אני יכול להתמיד בקטן", regulationAnchor: "כפות רגליים על הרצפה", shortAction: "לפתוח את היומן" };
  const adapted = adaptBeliefArc(beliefArc);
  assert.equal(adapted.category, "belief");
  assert.equal(adapted.uniqueFields.limitingBelief, "אני לא מתמיד");
  assert.equal(adapted.uniqueFields.replacementBelief, "אני יכול להתמיד בקטן");
  assert.equal(adapted.selfContainedState.regulationAnchor, "כפות רגליים על הרצפה");
  assert.equal(adapted.selfContainedState.action, "לפתוח את היומן");
  assert.equal(adapted.legacySourceKind, "BeliefArc");
});

test("adaptPresenceArc: produces a SEPARATE shape from AdaptedInterferenceSource -- Presence is never offered as a selectable derivative", () => {
  const presenceArc = { ...createEmptyPresenceArc("p1", "נוכחות", NOW), presenceColor: "כחול", presenceDwellSeconds: 45, beneficialAction: "לצאת להליכה" };
  const adapted = adaptPresenceArc(presenceArc);
  assert.equal(adapted.name, "נוכחות");
  assert.equal(adapted.presenceColor, "כחול");
  assert.equal(adapted.presenceDwellSeconds, 45);
  assert.equal(adapted.action, "לצאת להליכה");
  assert.equal(adapted.legacySourceId, "p1");
  // No `category` field at all -- structurally distinct from AdaptedInterferenceSource.
  assert.equal("category" in adapted, false);
});

test("every adapter is a pure read -- the original legacy record is never mutated", () => {
  const urgeArc = createEmptyUrgeArc("u3", "מקור", NOW);
  const snapshot = JSON.parse(JSON.stringify(urgeArc));
  adaptUrgeArc(urgeArc);
  assert.deepEqual(urgeArc, snapshot);
});

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 3 (data-layer foundations), spec
// section 8: the new InterferenceItem-shaped legacy compatibility
// adapters, built on top of the adapters above.
// ---------------------------------------------------------------------------

test("adaptUrgeArcToInterferenceItem: produces a forward-compatible UrgeInterferenceItem, id preserved, legacy marker set", () => {
  const urgeArc = { ...createEmptyUrgeArc("u1", "יוטיוב", NOW), interferingAction: "גלישה ביוטיוב", stopCue: "להניח את הטלפון", regulationAnchor: "נשימה עמוקה" };
  const result = adaptUrgeArcToInterferenceItem(urgeArc);
  assert.equal(result.item.category, "urge");
  assert.equal(result.item.id, "u1", "identifiers are preserved where safe, never re-generated");
  assert.equal(result.item.ownerProgramId, null, "legacy records predate the program-ownership concept -- never guessed");
  assert.equal((result.item as { urgeName: string | null }).urgeName, "גלישה ביוטיוב");
  assert.equal((result.item as { preventiveStoppingAction: string | null }).preventiveStoppingAction, "להניח את הטלפון");
  assert.equal((result.item as { regulationAnchor: string | null }).regulationAnchor, "נשימה עמוקה");
  assert.equal(result.legacyFallbackUsed, true);
  assert.equal(result.legacySourceKind, "UrgeArc");
  assert.equal(result.legacySourceId, "u1");
});

test("adaptThoughtArcToInterferenceItem: prefers usefulInsight, falls back to supportiveThought for alternativeInterpretation", () => {
  const withInsight = { ...createEmptyThoughtArc("t1", "x", NOW), usefulInsight: "זו רק מחשבה", supportiveThought: "אני מסוגל" };
  const resultWithInsight = adaptThoughtArcToInterferenceItem(withInsight);
  assert.equal((resultWithInsight.item as { alternativeInterpretation: string | null }).alternativeInterpretation, "זו רק מחשבה");

  const supportiveOnly = { ...createEmptyThoughtArc("t2", "y", NOW), usefulInsight: null, supportiveThought: "אני מסוגל" };
  const resultSupportiveOnly = adaptThoughtArcToInterferenceItem(supportiveOnly);
  assert.equal((resultSupportiveOnly.item as { alternativeInterpretation: string | null }).alternativeInterpretation, "אני מסוגל");
  assert.equal(resultSupportiveOnly.legacySourceKind, "ThoughtArc");
});

test("adaptBeliefArcToInterferenceItem: maps limitingBelief/replacementBelief/regulationAnchor into the belief variant", () => {
  const beliefArc = { ...createEmptyBeliefArc("b1", "x", NOW), limitingBelief: "אני לא מתמיד", replacementBelief: "אני יכול להתמיד בקטן", regulationAnchor: "כפות רגליים" };
  const result = adaptBeliefArcToInterferenceItem(beliefArc);
  assert.equal(result.item.category, "belief");
  assert.equal((result.item as { beliefText: string | null }).beliefText, "אני לא מתמיד");
  assert.equal((result.item as { supportiveBelief: string | null }).supportiveBelief, "אני יכול להתמיד בקטן");
  assert.equal((result.item as { regulationCue: string | null }).regulationCue, "כפות רגליים");
  assert.equal(result.legacySourceKind, "BeliefArc");
});

test("every InterferenceItem legacy adapter is a pure read -- the original legacy record is never mutated", () => {
  const urgeArc = createEmptyUrgeArc("u4", "מקור", NOW);
  const snapshot = JSON.parse(JSON.stringify(urgeArc));
  adaptUrgeArcToInterferenceItem(urgeArc);
  assert.deepEqual(urgeArc, snapshot);
});

test("adaptUrgeArcToInterferenceItem never writes anything back to storage -- it returns a plain value with no side effects", () => {
  // Nothing to assert beyond "it is a pure function returning a value" --
  // this test documents the guarantee explicitly (spec section 8: "Do
  // not write adapted data back to storage") since there is no I/O
  // surface in this module to spy on.
  const result = adaptUrgeArcToInterferenceItem(createEmptyUrgeArc("u5", "x", NOW));
  assert.equal(typeof result, "object");
});

// --- Missing legacy fields return typed compatibility results rather than crashing ---

test("adaptUrgeArcToInterferenceItem handles an entirely empty legacy record without crashing, degrading required-but-blank fields to null", () => {
  const urgeArc = createEmptyUrgeArc("u6", "ריק", NOW);
  assert.equal(urgeArc.interferingAction, "", "sanity check: createEmptyUrgeArc leaves required text fields as empty strings");
  const result = adaptUrgeArcToInterferenceItem(urgeArc);
  assert.equal((result.item as { urgeName: string | null }).urgeName, null);
  assert.equal((result.item as { regulationAnchor: string | null }).regulationAnchor, null);
});

// --- describeLegacyInterferenceCompatibility: safe compatibility status for a legacy record ---

test("describeLegacyInterferenceCompatibility is valid (source 'legacy') when the legacy record has usable self-contained content", () => {
  const urgeArc = { ...createEmptyUrgeArc("u7", "x", NOW), regulationAnchor: "נשימה" };
  const result = describeLegacyInterferenceCompatibility(adaptUrgeArc(urgeArc));
  assert.equal(result.valid, true);
  assert.equal(result.source, "legacy");
  assert.equal(result.reason, null);
});

test("describeLegacyInterferenceCompatibility returns a safe typed incomplete result (never throws) when a legacy record has no usable self-contained content", () => {
  const urgeArc = createEmptyUrgeArc("u8", "x", NOW);
  const result = describeLegacyInterferenceCompatibility(adaptUrgeArc(urgeArc));
  assert.equal(result.valid, false);
  assert.equal(result.source, "legacy");
  assert.equal(result.reason, "legacy_self_contained_state_empty");
});

// --- Traceability ---

test("every InterferenceItem legacy adaptation carries traceability back to the original record id and type", () => {
  const thoughtArc = createEmptyThoughtArc("t3", "x", NOW);
  const result = adaptThoughtArcToInterferenceItem(thoughtArc);
  assert.equal(result.legacySourceId, "t3");
  assert.equal(result.legacySourceKind, "ThoughtArc");
  assert.equal(result.item.id, "t3", "the projected item's own id also traces back to the original record");
});
