import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcPerspectiveScreens.test.ts
 *
 * ARC Perspective task: source-text regression guard for everything the
 * pure-logic tests in arc/arcPerspective.test.ts, arc/arcGym.test.ts,
 * arc/newArcLiveTypes.test.ts and data/emotionalCheckInRouting.test.ts
 * can't reach on their own -- route registration, the shared flow
 * component's per-step UI, the flow screen's own wiring in/out of ARC,
 * the ARC Gym list/detail screens, the Home real-time button, and the
 * ARC Behaviour-side link section/reminder -- same convention as
 * build/insightArcLearningTopicLink.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const flowComponent = readSource("live/components/ArcPerspectiveFlow.tsx");
const flowScreen = readSource("build/ArcPerspectiveFlowScreen.tsx");
const flowRoute = readSource("app/arc-perspective/[id].tsx");
const listScreen = readSource("build/ArcGymPerspectiveListScreen.tsx");
const eventDetailScreen = readSource("build/ArcGymPerspectiveEventDetailScreen.tsx");
const arcGymScreen = readSource("build/ArcGymScreen.tsx");
const homeScreen = readSource("build/FlexibleDailyScreen.tsx");
// ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
// task, section 5: the "מחשבה / דחף" + "שינוי פרספקטיבה" rows moved
// from this screen's own former inline check-in block into the
// shared FeelingCube component both the home screen and the entry
// screen now mount -- this test now reads them from there.
const feelingCubeComponent = readSource("live/components/HomeCubes.tsx");
const situationScreen = readSource("build/ArcGymSituationScreen.tsx");
const trainingScreen = readSource("live/ArcGymTrainingScreen.tsx");
const layout = readSource("app/_layout.tsx");
const arcRoute = readSource("app/tasks/[id]/arc.tsx");
const liveScreen = readSource("live/NewArcLiveScreen.tsx");

// --- Route registration ---

test("1/2. every new route is registered in app/_layout.tsx", () => {
  assert.ok(layout.includes('name="arc-perspective/[id]"'));
  assert.ok(layout.includes('name="arc-gym/perspective/index"'));
  assert.ok(layout.includes('name="arc-gym/perspective/[id]"'));
});

test("/arc-perspective/[id] wraps ArcPerspectiveFlowScreen and parses mode/eventId alongside the required id param", () => {
  assert.ok(flowRoute.includes("ArcPerspectiveFlowScreen"));
  assert.ok(flowRoute.includes("mode?: string"));
  assert.ok(flowRoute.includes("eventId?: string"));
});

test("22. app/tasks/[id]/arc.tsx threads arcPerspectiveId straight through to NewArcLiveScreen, alongside (never replacing) the existing params", () => {
  assert.match(
    arcRoute,
    /arcGymSituationId,\s*arcFocusPracticeId,\s*arcGymMemoryExerciseId,\s*arcPerspectiveId,\s*arcSavingBodyOptionId,\s*arcSavingExerciseId,\s*arcSavingTriggerIdForNewOption,\s*morningFlowCheckIn,?\s*\}\s*=\s*useLocalSearchParams/
  );
  assert.ok(arcRoute.includes("arcPerspectiveId={arcPerspectiveId ?? null}"));
});

test("6. live/NewArcLiveScreen.tsx's own returnToTask() has a dedicated arcPerspectiveId branch that routes back to /arc-perspective/[id], never resolving it as a normal task completion", () => {
  const fnIndex = liveScreen.indexOf("async function returnToTask(autoStart: boolean)");
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 8700);
  assert.ok(fnBody.includes("if (session?.arcPerspectiveId) {"));
  assert.ok(fnBody.includes("loadArcPerspectiveInProgress()"));
  assert.ok(fnBody.includes("advanceArcPerspectiveFromMoodCheckIn(progress)"));
  assert.ok(fnBody.includes('router.replace({ pathname: "/arc-perspective/[id]", params: { id: session.arcPerspectiveId } });'));
});

// --- The shared flow component's per-step UI ---

test("3. the 'event' step requires both fields, labels the optional third one '(לא חובה)', and gates its own continue button on canAdvanceFromArcPerspectiveEvent", () => {
  assert.ok(flowComponent.includes("מה האירוע?"));
  assert.ok(flowComponent.includes("מה הפרשנות הראשונית שלך?"));
  assert.ok(flowComponent.includes("איזו פרשנות חדשה היית רוצה לאמץ? (לא חובה)"));
  assert.ok(flowComponent.includes("disabled={!canAdvance}"));
});

test("5. the 'mood_check_in' step reuses the shared EmotionalCheckInButtons component -- never a second, duplicated check-in markup", () => {
  assert.ok(flowComponent.includes('import EmotionalCheckInButtons from "./EmotionalCheckInButtons.tsx";'));
  assert.ok(flowComponent.includes("<EmotionalCheckInButtons"));
});

test("6. the mood_check_in step's own 😄 advances in place via onChange/advanceArcPerspectiveFromMoodCheckIn; 😟/🙂 call the onMoodCheckIn prop instead, since leaving this component unmounts it", () => {
  const stepIndex = flowComponent.indexOf('session.currentStep === "mood_check_in"');
  const stepBody = flowComponent.slice(stepIndex, stepIndex + 700);
  assert.ok(stepBody.includes("onExcellent={() => onChange(advanceArcPerspectiveFromMoodCheckIn(chooseArcPerspectiveMood(session, \"excellent\")))}"));
  assert.ok(stepBody.includes("onMoodCheckIn(\"full_arc\")"));
  assert.ok(stepBody.includes("onMoodCheckIn(\"shortened_arc\")"));
});

test("7. the planned-mode perspective_shift step shows the 5-point imagination copy and never blocks on an imagination-failure gate", () => {
  const stepIndex = flowComponent.indexOf('session.currentStep === "perspective_shift"');
  const stepBody = flowComponent.slice(stepIndex, stepIndex + 1600);
  assert.ok(stepBody.includes("תדמיין את האירוע."));
  assert.ok(stepBody.includes("הופכת בהדרגה לבהירה וצבעונית יותר"));
  assert.ok(stepBody.includes("אם אתה מתקשה לדמיין תמונה"));
});

test("8. the real_time-mode perspective_shift step shows the attention-to-colors copy, distinct from the imagination copy, and never requires inventing colors", () => {
  const stepIndex = flowComponent.indexOf('session.currentStep === "perspective_shift"');
  const stepBody = flowComponent.slice(stepIndex, stepIndex + 1600);
  assert.ok(stepBody.includes("שים לב לאירוע שמתרחש כרגע."));
  assert.ok(stepBody.includes("הפנה את תשומת הלב לצבעים הבהירים או הצבעוניים יותר"));
  assert.ok(stepBody.includes("אין צורך לדמיין שהתמונה משתנה"));
});

test("9/10. the new_interpretation step is gated on canAdvanceFromArcPerspectiveNewInterpretation, and offers the desired-interpretation preset only as an adoptable suggestion chip, never auto-filling it", () => {
  const stepIndex = flowComponent.indexOf('session.currentStep === "new_interpretation"');
  const stepBody = flowComponent.slice(stepIndex, stepIndex + 1200);
  assert.ok(stepBody.includes("איזו פרשנות חדשה אתה בוחר לתת לאירוע?"));
  assert.ok(stepBody.includes("onPress={() => onChange(setArcPerspectiveNewInterpretation(session, preset))}"));
  assert.ok(stepBody.includes("disabled={!canAdvance}"));
});

test("11/12. the link_behaviour step pickers every existing ArcGymSituation, offers skipping, and links to ARC Gym for creating a new Behaviour exercise -- never a second creation form", () => {
  const stepIndex = flowComponent.indexOf('// currentStep === "link_behaviour"');
  const stepBody = flowComponent.slice(stepIndex, stepIndex + 1600);
  assert.ok(stepBody.includes("situations.map((situation)"));
  assert.ok(stepBody.includes("linkArcGymSituationToArcPerspectiveSession(session, situation.id)"));
  assert.ok(stepBody.includes("onCreateNewBehaviour"));
  assert.ok(flowComponent.includes('"סיום" : "דלג וסיום"'));
});

test("25. the shared flow component follows this app's existing RTL convention throughout", () => {
  assert.ok(flowComponent.includes('textAlign: "right"'));
});

// --- The flow screen's own wiring ---

test("1/2/18. the flow screen seeds a fresh session from an existing event (planned reuse) or starts blank, and always overrides the newly-created session's own id with the route's own stable id", () => {
  assert.ok(flowScreen.includes("seedArcPerspectiveSessionFromEvent(fresh, existingEvent)"));
  assert.ok(flowScreen.includes("createArcPerspectiveSession(mode, eventId as string, null, new Date().toISOString()), id }"));
  assert.ok(flowScreen.includes("createArcPerspectiveSession(mode, freshEventId, activeTaskId, new Date().toISOString()), id }"));
});

test("resuming after the ARC round-trip: an in-progress record matching THIS route's own id is used as-is, never recreated", () => {
  assert.ok(flowScreen.includes("if (progress && progress.id === id) {"));
});

test("22. real_time mode resolves and captures the active task exactly once, via the same findActiveTask this app's other check-in entry points already use", () => {
  assert.ok(flowScreen.includes('mode === "real_time" ? findActiveTask(await loadTasks())?.id ?? null : null'));
});

test("5. onMoodCheckIn saves the session to the in-progress slot before calling handleArcPerspectiveCheckInChoice with the correctly-resolved taskId (standalone for planned, the captured activeTaskId for real_time)", () => {
  const fnIndex = flowScreen.indexOf("async function handleMoodCheckIn(");
  const fnBody = flowScreen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("await saveArcPerspectiveInProgress(withMood);"));
  assert.ok(fnBody.includes('session.mode === "planned" ? STANDALONE_ARC_TASK_ID : session.activeTaskId ?? STANDALONE_ARC_TASK_ID'));
});

test("13/17. onFinish snapshots the new interpretation onto the linked ArcGymSituation only when one is linked, completes and persists the session to history, and clears the in-progress slot either way", () => {
  const fnIndex = flowScreen.indexOf("async function handleFinish(");
  const fnBody = flowScreen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("if (finishedSession.linkedArcGymSituationId) {"));
  assert.ok(fnBody.includes("linkArcPerspectiveToArcGymSituation(situation, finishedSession.id, finishedSession.newInterpretation, now)"));
  assert.ok(fnBody.includes("completeArcPerspectiveSession(finishedSession, now)"));
  assert.ok(fnBody.includes("await upsertArcPerspectiveSessionEntry(completed);"));
  assert.ok(fnBody.includes("await clearArcPerspectiveInProgress();"));
});

test("16. the finished summary offers 'פתח ARC Behaviour' only when linked, 'תרגל שוב', and 'סיום' routed by mode", () => {
  assert.ok(flowScreen.includes("!!finished.linkedArcGymSituationId &&"));
  assert.ok(flowScreen.includes("פתח ARC Behaviour"));
  assert.ok(flowScreen.includes("תרגל שוב"));
  assert.ok(flowScreen.includes('finished.mode === "real_time" ? router.replace("/")'));
});

// --- ARC Gym list/detail screens ---

test("1/18. ArcGymScreen.tsx has a dedicated ARC Perspective entry card", () => {
  assert.ok(arcGymScreen.includes('router.push("/arc-gym/perspective")'));
  assert.ok(arcGymScreen.includes("ARC Perspective"));
});

test("1. the ARC Gym list screen's own '+ אירוע חדש' button opens the flow screen's own 'event' step directly -- that step IS the creation form, never a second one", () => {
  assert.ok(listScreen.includes('mode: "planned", eventId: "new"'));
});

test("18. the event detail screen's 'תרגל' button always creates a FRESH session id (never reusing/overwriting a previous practice's own id), while re-sending the same eventId so the trainee can practice the same event multiple times", () => {
  const fnIndex = eventDetailScreen.indexOf("function practice()");
  const fnBody = eventDetailScreen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("generateArcPerspectiveSessionId()"));
  assert.ok(fnBody.includes('mode: "planned", eventId: id'));
});

test("20. the event detail screen lists this event's own completed practice history, each row opening its own session's summary -- never a duplicated/invented row", () => {
  assert.ok(eventDetailScreen.includes("listArcPerspectiveSessionsForEvent(allSessions, id)"));
  assert.ok(eventDetailScreen.includes('filter((session) => session.completedAt !== null)'));
});

// --- Home real-time button ---

test("2. Home's own real-time ARC Perspective button sits in the exact same unconditional FeelingCube as the existing 'מחשבה / דחף' button -- available regardless of task state, never disturbing an active task's own timer", () => {
  const urgeRowIndex = feelingCubeComponent.indexOf("מחשבה / דחף");
  const afterUrgeRow = feelingCubeComponent.slice(urgeRowIndex, urgeRowIndex + 600);
  assert.ok(afterUrgeRow.includes("שינוי פרספקטיבה"));
  assert.ok(afterUrgeRow.includes('mode: "real_time"'));
  assert.ok(afterUrgeRow.includes("generateArcPerspectiveSessionId()"));
});

// --- ARC Behaviour-side link section + reminder ---

test("14/16. ArcGymSituationScreen.tsx shows the linked session's own snapshot text, a way to open it and unlink it, or (when unlinked) a picker over every completed ArcPerspectiveSession", () => {
  assert.ok(situationScreen.includes("ARC Perspective מקושר"));
  assert.ok(situationScreen.includes("situation.arcPerspectiveNewInterpretation"));
  assert.ok(situationScreen.includes('pathname: "/arc-perspective/[id]", params: { id: situation.linkedArcPerspectiveSessionId'));
  assert.ok(situationScreen.includes("unlinkPerspectiveSession"));
  assert.ok(situationScreen.includes("linkPerspectiveSession(item)"));
});

test("24. unlinking from ArcGymSituationScreen never deletes the situation -- it only ever calls unlinkArcPerspectiveFromArcGymSituation then reloads", () => {
  const fnIndex = situationScreen.indexOf("async function unlinkPerspectiveSession()");
  const fnBody = situationScreen.slice(fnIndex, fnIndex + 250);
  assert.ok(fnBody.includes("unlinkArcPerspectiveFromArcGymSituation(situation, new Date().toISOString())"));
  assert.ok(fnBody.includes("upsertArcGymSituationEntry"));
});

test("14/15. ArcGymTrainingScreen.tsx shows a non-blocking reminder of the linked perspective's new interpretation, never altering the existing visualization prompts/logic", () => {
  assert.ok(trainingScreen.includes("situation.arcPerspectiveNewInterpretation"));
  assert.ok(trainingScreen.includes("פרשנות חדשה שבחרת"));
  assert.ok(trainingScreen.includes("resolveArcGymSituationVisualizationPrompts(situation)"), "the existing prompt resolver must stay completely unchanged/untouched");
});
