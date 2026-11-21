import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceArcPerspectiveFromMoodCheckIn,
  advanceArcPerspectiveToLinkBehaviour,
  advanceArcPerspectiveToMoodCheckIn,
  advanceArcPerspectiveToNewInterpretation,
  canAdvanceFromArcPerspectiveEvent,
  canAdvanceFromArcPerspectiveNewInterpretation,
  chooseArcPerspectiveMood,
  completeArcPerspectiveSession,
  createArcPerspectiveEvent,
  createArcPerspectiveSession,
  deleteArcPerspectiveEventFromList,
  findArcPerspectiveSessionById,
  generateArcPerspectiveEventId,
  generateArcPerspectiveSessionId,
  goToPreviousArcPerspectiveStep,
  linkArcGymSituationToArcPerspectiveSession,
  listArcPerspectiveSessionsForEvent,
  resolveArcPerspectiveDesiredInterpretationPreset,
  seedArcPerspectiveSessionFromEvent,
  setArcPerspectiveDesiredInterpretationPreset,
  setArcPerspectiveEventDescription,
  setArcPerspectiveInitialInterpretation,
  setArcPerspectiveNewInterpretation,
  unlinkArcGymSituationFromArcPerspectiveSession,
  updateArcPerspectiveEvent,
  upsertArcPerspectiveEventInList,
  upsertArcPerspectiveSessionInList,
} from "./arcPerspective.ts";

const NOW = "2026-02-01T09:00:00.000Z";
const LATER = "2026-02-01T10:00:00.000Z";

test("generateArcPerspectiveEventId/generateArcPerspectiveSessionId return distinct ids on successive calls", () => {
  assert.notEqual(generateArcPerspectiveEventId(), generateArcPerspectiveEventId());
  assert.notEqual(generateArcPerspectiveSessionId(), generateArcPerspectiveSessionId());
});

// --- Event (template) CRUD ---

test("createArcPerspectiveEvent starts blank -- no desired interpretation invented", () => {
  const event = createArcPerspectiveEvent("e1", NOW);
  assert.equal(event.eventDescription, "");
  assert.equal(event.initialInterpretation, "");
  assert.equal(event.desiredInterpretationPreset, null);
});

test("updateArcPerspectiveEvent trims and bumps updatedAt, never touching createdAt", () => {
  const event = createArcPerspectiveEvent("e1", NOW);
  const updated = updateArcPerspectiveEvent(event, { eventDescription: "  מישהו אמר שהכול בסדר  ", initialInterpretation: "  הוא חושב שמשהו לא בסדר  " }, LATER);
  assert.equal(updated.eventDescription, "מישהו אמר שהכול בסדר");
  assert.equal(updated.initialInterpretation, "הוא חושב שמשהו לא בסדר");
  assert.equal(updated.updatedAt, LATER);
  assert.equal(updated.createdAt, NOW);
});

test("updateArcPerspectiveEvent's desiredInterpretationPreset: a blank string clears it back to null, never leaving an empty-but-truthy string", () => {
  const event = updateArcPerspectiveEvent(createArcPerspectiveEvent("e1", NOW), { desiredInterpretationPreset: "יכול להיות שהוא מנסה לעזור" }, NOW);
  assert.equal(event.desiredInterpretationPreset, "יכול להיות שהוא מנסה לעזור");
  const cleared = updateArcPerspectiveEvent(event, { desiredInterpretationPreset: "   " }, LATER);
  assert.equal(cleared.desiredInterpretationPreset, null);
});

test("upsertArcPerspectiveEventInList adds new, replaces existing by id", () => {
  const e1 = createArcPerspectiveEvent("e1", NOW);
  const e2 = createArcPerspectiveEvent("e2", NOW);
  const list = upsertArcPerspectiveEventInList([e1], e2);
  assert.equal(list.length, 2);
  const renamed = updateArcPerspectiveEvent(e1, { eventDescription: "אירוע מעודכן" }, LATER);
  const replaced = upsertArcPerspectiveEventInList(list, renamed);
  assert.equal(replaced.length, 2);
  assert.equal(replaced.find((e) => e.id === "e1")?.eventDescription, "אירוע מעודכן");
});

test("deleteArcPerspectiveEventFromList removes only the matching event", () => {
  const e1 = createArcPerspectiveEvent("e1", NOW);
  const e2 = createArcPerspectiveEvent("e2", NOW);
  assert.deepEqual(deleteArcPerspectiveEventFromList([e1, e2], "e1").map((e) => e.id), ["e2"]);
});

// --- Session creation, the "event" step, scenario 1/2/3/4 ---

test("1. createArcPerspectiveSession('planned', ...) starts a blank, in-progress session at the 'event' step, activeTaskId null", () => {
  const session = createArcPerspectiveSession("planned", "e1", null, NOW);
  assert.equal(session.mode, "planned");
  assert.equal(session.eventId, "e1");
  assert.equal(session.activeTaskId, null);
  assert.equal(session.currentStep, "event");
  assert.equal(session.completedAt, null);
});

test("2. createArcPerspectiveSession('real_time', ...) captures the active task id once, at creation time", () => {
  const session = createArcPerspectiveSession("real_time", "e2", "task-9", NOW);
  assert.equal(session.mode, "real_time");
  assert.equal(session.activeTaskId, "task-9");
});

test("3. the event step requires BOTH the event description and the initial interpretation -- the optional desired-interpretation field is never part of the gate", () => {
  let session = createArcPerspectiveSession("real_time", "e1", null, NOW);
  assert.equal(canAdvanceFromArcPerspectiveEvent(session), false);
  session = setArcPerspectiveEventDescription(session, "מישהו אומר לי שהכול בסדר.");
  assert.equal(canAdvanceFromArcPerspectiveEvent(session), false, "the event alone is not enough");
  session = setArcPerspectiveInitialInterpretation(session, "הוא חושב שמשהו לא בסדר איתי.");
  assert.equal(canAdvanceFromArcPerspectiveEvent(session), true);
  const advanced = advanceArcPerspectiveToMoodCheckIn(session);
  assert.equal(advanced.currentStep, "mood_check_in");
});

test("advanceArcPerspectiveToMoodCheckIn refuses to advance while the gate is unmet", () => {
  const session = setArcPerspectiveEventDescription(createArcPerspectiveSession("planned", "e1", null, NOW), "אירוע בלבד, בלי פרשנות");
  const result = advanceArcPerspectiveToMoodCheckIn(session);
  assert.equal(result.currentStep, "event");
});

test("4. the desired-interpretation field is entirely optional -- leaving it blank still allows advancing, and resolveArcPerspectiveDesiredInterpretationPreset reads it as null rather than inventing one", () => {
  let session = createArcPerspectiveSession("planned", "e1", null, NOW);
  session = setArcPerspectiveEventDescription(session, "אירוע");
  session = setArcPerspectiveInitialInterpretation(session, "פרשנות ראשונית");
  assert.equal(resolveArcPerspectiveDesiredInterpretationPreset(session), null);
  session = advanceArcPerspectiveToMoodCheckIn(session);
  assert.equal(session.currentStep, "mood_check_in");
  const withPreset = setArcPerspectiveDesiredInterpretationPreset(createArcPerspectiveSession("planned", "e1", null, NOW), "  יכול להיות שהוא מנסה לעזור  ");
  assert.equal(resolveArcPerspectiveDesiredInterpretationPreset(withPreset), "יכול להיות שהוא מנסה לעזור");
});

// --- Mood check-in + routing back from ARC, scenario 5/6 ---

test("5. chooseArcPerspectiveMood records the choice without itself performing any ARC routing -- that's the caller's job", () => {
  let session = createArcPerspectiveSession("planned", "e1", null, NOW);
  session = { ...session, currentStep: "mood_check_in" };
  session = chooseArcPerspectiveMood(session, "full_arc");
  assert.equal(session.moodCheckInChoice, "full_arc");
  assert.equal(session.currentStep, "mood_check_in", "choosing a mood never itself advances the step -- 😄 advances in place via a separate call, 😟/🙂 advance only once the ARC round-trip actually finishes");
});

test("6. advanceArcPerspectiveFromMoodCheckIn moves from mood_check_in to perspective_shift -- called either in place (😄) or by returnToTask() once the preliminary ARC finishes (😟/🙂)", () => {
  let session = chooseArcPerspectiveMood(createArcPerspectiveSession("planned", "e1", null, NOW), "excellent");
  session = advanceArcPerspectiveFromMoodCheckIn(session);
  assert.equal(session.currentStep, "perspective_shift");
});

// --- New interpretation, scenario 9/10 ---

test("advanceArcPerspectiveToNewInterpretation is always self-paced -- never gated on anything (imagination/attention have no completion condition)", () => {
  const session = advanceArcPerspectiveToNewInterpretation(createArcPerspectiveSession("real_time", "e1", null, NOW));
  assert.equal(session.currentStep, "new_interpretation");
});

test("9. a new interpretation is required to leave the new_interpretation step -- never invented, never auto-filled from the preset", () => {
  let session = createArcPerspectiveSession("planned", "e1", null, NOW);
  session = { ...session, currentStep: "new_interpretation" };
  assert.equal(canAdvanceFromArcPerspectiveNewInterpretation(session), false);
  assert.equal(advanceArcPerspectiveToLinkBehaviour(session).currentStep, "new_interpretation", "must not advance while blank");
  session = setArcPerspectiveNewInterpretation(session, "יכול להיות שהוא מנסה לעזור לי, ואני יכול להסביר לו מה אני באמת מרגיש.");
  assert.equal(canAdvanceFromArcPerspectiveNewInterpretation(session), true);
  assert.equal(advanceArcPerspectiveToLinkBehaviour(session).currentStep, "link_behaviour");
});

test("10. the desired-interpretation preset is never auto-filled into newInterpretation by the engine itself -- adopting it is a UI-level, explicit action (a prefill, not a default)", () => {
  let session = createArcPerspectiveSession("planned", "e1", null, NOW);
  session = setArcPerspectiveDesiredInterpretationPreset(session, "פרשנות מוצעת");
  session = { ...session, currentStep: "new_interpretation" };
  assert.equal(session.newInterpretation, "", "the engine itself never copies the preset in automatically");
});

// --- Linking to ARC Behaviour, scenario 11/13/17/19 ---

test("11. linkArcGymSituationToArcPerspectiveSession/unlinkArcGymSituationFromArcPerspectiveSession set and clear the session's own link", () => {
  let session = createArcPerspectiveSession("planned", "e1", null, NOW);
  session = linkArcGymSituationToArcPerspectiveSession(session, "sit-1");
  assert.equal(session.linkedArcGymSituationId, "sit-1");
  session = unlinkArcGymSituationFromArcPerspectiveSession(session);
  assert.equal(session.linkedArcGymSituationId, null);
});

test("13. the session's own newInterpretation is exactly what gets snapshotted onto the linked ArcGymSituation (verified from the session side -- see arc/arcGym.test.ts for the ArcGymSituation-side snapshot itself)", () => {
  let session = createArcPerspectiveSession("planned", "e1", null, NOW);
  session = setArcPerspectiveNewInterpretation(session, "יכול להיות שהוא מנסה לעזור לי.");
  session = linkArcGymSituationToArcPerspectiveSession(session, "sit-1");
  assert.equal(session.newInterpretation, "יכול להיות שהוא מנסה לעזור לי.");
  assert.equal(session.linkedArcGymSituationId, "sit-1");
});

test("17. completeArcPerspectiveSession never requires a linked Behaviour -- completing without ever linking is a fully valid finish", () => {
  const session = createArcPerspectiveSession("planned", "e1", null, NOW);
  assert.equal(session.linkedArcGymSituationId, null);
  const completed = completeArcPerspectiveSession(session, LATER);
  assert.equal(completed.completedAt, LATER);
  assert.equal(completed.linkedArcGymSituationId, null);
});

test("19. upsertArcPerspectiveSessionInList replaces only the matching session by id -- updating one session's own link later never touches a different session's history row", () => {
  const s1 = completeArcPerspectiveSession(createArcPerspectiveSession("planned", "e1", null, NOW), NOW);
  const s2 = completeArcPerspectiveSession(createArcPerspectiveSession("planned", "e2", null, NOW), NOW);
  let history = upsertArcPerspectiveSessionInList([s1], s2);
  assert.equal(history.length, 2);
  const relinkedS1 = linkArcGymSituationToArcPerspectiveSession(s1, "sit-9");
  history = upsertArcPerspectiveSessionInList(history, relinkedS1);
  assert.equal(history.length, 2);
  assert.equal(history.find((s) => s.id === s1.id)?.linkedArcGymSituationId, "sit-9");
  assert.equal(history.find((s) => s.id === s2.id)?.linkedArcGymSituationId, null, "the other session's own history row must be completely untouched");
});

// --- Back navigation preserves data ---

test("goToPreviousArcPerspectiveStep moves one step back, floor at 'event', never dropping already-typed data", () => {
  let session = createArcPerspectiveSession("planned", "e1", null, NOW);
  session = setArcPerspectiveEventDescription(session, "אירוע");
  session = setArcPerspectiveInitialInterpretation(session, "פרשנות");
  session = advanceArcPerspectiveToMoodCheckIn(session);
  session = goToPreviousArcPerspectiveStep(session);
  assert.equal(session.currentStep, "event");
  assert.equal(session.eventDescription, "אירוע", "back navigation must never lose the typed event description");
  assert.equal(session.initialInterpretation, "פרשנות");
  const flooredAgain = goToPreviousArcPerspectiveStep(session);
  assert.equal(flooredAgain.currentStep, "event", "never below 'event'");
});

// --- 18: re-practicing a saved event ---

test("18. seedArcPerspectiveSessionFromEvent snapshots the event's own fields into a fresh session, letting the trainee re-practice without mutating the template", () => {
  const event = updateArcPerspectiveEvent(createArcPerspectiveEvent("e1", NOW), { eventDescription: "אירוע שמור", initialInterpretation: "פרשנות שמורה", desiredInterpretationPreset: "פרשנות רצויה" }, NOW);
  const fresh = createArcPerspectiveSession("planned", "e1", null, LATER);
  const seeded = seedArcPerspectiveSessionFromEvent(fresh, event);
  assert.equal(seeded.eventDescription, "אירוע שמור");
  assert.equal(seeded.initialInterpretation, "פרשנות שמורה");
  assert.equal(seeded.desiredInterpretationPreset, "פרשנות רצויה");
  assert.equal(seeded.currentStep, "event", "the trainee can still tweak the per-practice copy before continuing");
  assert.equal(event.eventDescription, "אירוע שמור", "seeding a new session must never mutate the event's own saved record");
});

test("listArcPerspectiveSessionsForEvent/findArcPerspectiveSessionById resolve correctly, in insertion order, never inventing or duplicating rows", () => {
  const s1 = createArcPerspectiveSession("planned", "e1", null, NOW);
  const s2 = createArcPerspectiveSession("planned", "e1", null, LATER);
  const s3 = createArcPerspectiveSession("planned", "e2", null, NOW);
  assert.deepEqual(listArcPerspectiveSessionsForEvent([s1, s2, s3], "e1"), [s1, s2]);
  assert.equal(findArcPerspectiveSessionById([s1, s2, s3], s3.id)?.id, s3.id);
  assert.equal(findArcPerspectiveSessionById([s1, s2, s3], "missing"), null);
});
