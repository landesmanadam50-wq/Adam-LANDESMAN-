import test from "node:test";
import assert from "node:assert/strict";

import { adaptBeliefArc, adaptPresenceArc, adaptThoughtArc, adaptUrgeArc } from "./legacyDerivativeAdapter.ts";
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
