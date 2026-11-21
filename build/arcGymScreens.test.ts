import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcGymScreens.test.ts
 *
 * ARC GYM task: source-text regression guard for the screens, routes,
 * and engine wiring that sit on top of arc/arcGym.ts's own pure logic
 * (covered, independently and fully executed, by arc/arcGym.test.ts).
 * Same convention as data/emotionalCheckInRouting.test.ts and
 * live/miniArcEntry.test.ts -- these files depend on expo-router/
 * AsyncStorage/React Native and are not executed directly with
 * `node --test`.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const home = readSource("build/FlexibleDailyScreen.tsx");
const gymScreen = readSource("build/ArcGymScreen.tsx");
const behaviorScreen = readSource("build/ArcGymBehaviorScreen.tsx");
const situationEditor = readSource("build/ArcGymSituationEditorScreen.tsx");
const situationScreen = readSource("build/ArcGymSituationScreen.tsx");
const trainingScreen = readSource("live/ArcGymTrainingScreen.tsx");
const visualizeOnlyScreen = readSource("live/ArcGymVisualizationOnlyScreen.tsx");
const routing = readSource("data/emotionalCheckInRouting.ts");
const liveScreen = readSource("live/NewArcLiveScreen.tsx");
const newArcLiveTypes = readSource("arc/newArcLiveTypes.ts");
const newArcLiveSteps = readSource("arc/newArcLiveSteps.ts");
const newArcLiveCopy = readSource("arc/newArcLiveCopy.ts");
const layout = readSource("app/_layout.tsx");
const arcRoute = readSource("app/tasks/[id]/arc.tsx");
const visualizeOnlyRoute = readSource("app/arc-gym/visualize-only/[id].tsx");

// --- required test 1: ARC GYM entry on Home --------------------------------

test("required test 1: Home (isTodayMode only) shows a clearly visible ARC GYM entry card that opens /arc-gym, additive to (never gating out) the existing check-in bar and PersistentTaskControls", () => {
  const cardIndex = home.indexOf('router.push("/arc-gym")');
  assert.ok(cardIndex !== -1);
  const before = home.slice(Math.max(0, cardIndex - 200), cardIndex);
  assert.ok(before.includes("isTodayMode"), "the ARC GYM card must be gated the same way the check-in bar is -- Home only, never the fixed-date Weekly instance");
  assert.ok(home.includes("🏋️ ARC GYM"));
  const persistentIndex = home.indexOf("<PersistentTaskControls");
  assert.ok(cardIndex < persistentIndex, "the ARC GYM card must sit alongside, not replace, the existing screen content below it");
});

// --- required test 2: loading saved Manifest behaviors (screen wiring) ----

test("required test 2 (screen wiring): ArcGymScreen loads behaviors via the shared resolveArcGymBehaviorOptions over loadPurposeManifests -- never a second, hardcoded behavior list -- and guides to /purpose-manifests when none exist", () => {
  assert.ok(gymScreen.includes("resolveArcGymBehaviorOptions(manifests)"));
  assert.ok(gymScreen.includes('loadPurposeManifests()'));
  assert.ok(gymScreen.includes('router.push("/purpose-manifests")'));
  assert.ok(gymScreen.includes("איזו התנהגות מהמניפסט תרצה לתרגל?"));
});

// --- required test 3+4 (screen wiring): obstacles + situations list -------

test("required test 3 (screen wiring): ArcGymBehaviorScreen asks the obstacle question ONCE per behavior (not per situation) and persists every toggle immediately via upsertArcGymBehaviorObstaclesEntry", () => {
  assert.ok(behaviorScreen.includes("מה מונע ממך לפעול בצורה הזאת?"));
  assert.ok(behaviorScreen.includes("await upsertArcGymBehaviorObstaclesEntry(next);"));
  assert.ok(behaviorScreen.includes("ARC_GYM_OBSTACLE_OPTIONS.map"));
});

test("required test 4 (screen wiring): ArcGymBehaviorScreen lists every situation already saved under this behavior (listArcGymSituationsForBehavior) and offers '+ סיטואציה חדשה' to add another", () => {
  assert.ok(behaviorScreen.includes("listArcGymSituationsForBehavior(allSituations, manifestId, behaviorId)"));
  assert.ok(behaviorScreen.includes("סיטואציה חדשה"));
  assert.ok(behaviorScreen.includes('params: { id: "new", behaviorId, manifestId }'));
});

test("required test 4 continued (screen wiring): ArcGymSituationEditorScreen requires both situationDescription and desiredAction before saving -- 'מה בדיוק היית רוצה לעשות בסיטואציה הזאת?' is asked explicitly, never skipped", () => {
  assert.ok(situationEditor.includes("מה בדיוק היית רוצה לעשות בסיטואציה הזאת?"));
  assert.ok(situationEditor.includes('if (!situationDescription.trim()) validationErrors.push'));
  assert.ok(situationEditor.includes('if (!desiredAction.trim()) validationErrors.push'));
});

// --- required test 6: personalized situation visualization (screen) -------

test("required test 6 (screen wiring): ArcGymTrainingScreen walks resolveArcGymSituationVisualizationPrompts step by step, user-paced (back/continue), and explicitly offers a skip straight to the check-in", () => {
  assert.ok(trainingScreen.includes("resolveArcGymSituationVisualizationPrompts(situation)"));
  assert.ok(trainingScreen.includes("חזרה"));
  assert.ok(trainingScreen.includes("המשך"));
  assert.ok(trainingScreen.includes("לדלג על הדימיון ולהמשיך לבדיקה הרגשית"));
});

// --- required test 7: emotional check-in after situation visualization ----

test("required test 7: ArcGymTrainingScreen's post-visualization check-in asks the exact required question and offers all 3 smileys, each routed through the ONE shared handleArcGymCheckInChoice dispatcher", () => {
  assert.ok(trainingScreen.includes("איך אתה מרגיש עכשיו כשאתה מדמיין את הסיטואציה?"));
  assert.ok(trainingScreen.includes('handleArcGymCheckInChoice("full_arc", id)'));
  assert.ok(trainingScreen.includes('handleArcGymCheckInChoice("shortened_arc", id)'));
  assert.ok(trainingScreen.includes('handleArcGymCheckInChoice("visualization_only", id)'));
  assert.ok(trainingScreen.includes('import { handleArcGymCheckInChoice } from "../data/emotionalCheckInRouting.ts"'));
});

// --- required test 8/9: Full ARC / Shortened ARC routing -------------------

test("required test 8+9: handleArcGymCheckInChoice routes 'full_arc'/'shortened_arc' through the SAME openFullArc/openShortenedArc the Home check-in bar and widget already use -- never a second ARC implementation -- always standalone (taskId: null) with the situationId threaded through", () => {
  const fnIndex = routing.indexOf("export async function handleArcGymCheckInChoice(");
  const fnBody = routing.slice(fnIndex, routing.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('if (choice === "full_arc") return openFullArc(null, { arcGymSituationId: situationId });'));
  assert.ok(fnBody.includes('if (choice === "shortened_arc") return openShortenedArc(null, { arcGymSituationId: situationId });'));
});

test("required test 8+9 continued: openFullArc/openShortenedArc, when given an arcGymSituationId, ALWAYS use the standalone sentinel -- never silently attaching to some unrelated currently-active task", () => {
  const fullArcBody = routing.slice(routing.indexOf("export async function openFullArc("), routing.indexOf("\n}", routing.indexOf("export async function openFullArc(")));
  assert.ok(fullArcBody.includes("const id = options.arcGymSituationId || options.arcGymMemoryExerciseId ? STANDALONE_ARC_TASK_ID : taskId ?? (await resolveHomeCheckInTaskId());"));
  const shortenedArcBody = routing.slice(routing.indexOf("export async function openShortenedArc("), routing.indexOf("\n}", routing.indexOf("export async function openShortenedArc(")));
  assert.ok(shortenedArcBody.includes("const id = options.arcGymSituationId || options.arcGymMemoryExerciseId ? STANDALONE_ARC_TASK_ID : taskId ?? (await resolveHomeCheckInTaskId());"));
});

// --- required test 10: "מעולה" visualization-only routing -------------------

test("required test 10: handleArcGymCheckInChoice's third branch ('visualization_only') never touches openFullArc/openShortenedArc -- it opens the dedicated visualize-only route directly, skipping the ARC LIVE engine entirely", () => {
  const fnIndex = routing.indexOf("export async function handleArcGymCheckInChoice(");
  const fnBody = routing.slice(fnIndex, routing.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('router.push({ pathname: "/arc-gym/visualize-only/[id]", params: { id: situationId } });'));
});

test("required test 10 continued: ArcGymVisualizationOnlyScreen never IMPORTS the ARC LIVE screen/engine (NewArcLiveScreen, newArcLiveSteps, newArcLiveCopy) -- it is a self-contained screen that completes its own training record directly (a doc comment may still mention live/NewArcLiveScreen.tsx by name -- Nine Functional Improvements task, Improvement 4 -- since returnToTask() there now also routes here; that is not an import)", () => {
  assert.ok(!visualizeOnlyScreen.includes('from "../live/NewArcLiveScreen') && !visualizeOnlyScreen.includes('from "./NewArcLiveScreen'));
  assert.ok(!visualizeOnlyScreen.includes("newArcLiveSteps"));
  assert.ok(!visualizeOnlyScreen.includes("newArcLiveCopy"));
  assert.ok(visualizeOnlyScreen.includes('createArcGymTrainingRecord(generateArcGymTrainingRecordId(), id, "visualization_only", now)'));
  assert.ok(visualizeOnlyScreen.includes("completeArcGymTrainingRecord("));
});

test("required test 10 continued: ArcGymVisualizationOnlyScreen never auto-opens Task LIVE on completion -- it offers an optional invite to apply the behavior in real life, with its only button returning to the situation's own screen", () => {
  assert.ok(!visualizeOnlyScreen.includes('"/tasks/[id]"'));
  assert.ok(visualizeOnlyScreen.includes("תרצה להחיל את זה בסיטואציה האמיתית"));
  assert.ok(visualizeOnlyScreen.includes('router.replace({ pathname: "/arc-gym/situation/[id]", params: { id } })'));
});

// --- required test 11 (Nine Functional Improvements task, Improvement 4: superseded) --

test("Improvement 4 (supersedes the original required test 11): getEncodingContent/resolveEncodingMantra never special-case ARC GYM at all -- an ARC GYM session (always standalone, always goalType 'emotion_only') simply falls through to the SAME generic emotion_only branch every other standalone emotional session uses (Final ARC Flow & Body Animation task: this is now the ONE computed encoding mantra, never an arcGymSituationId-gated sub-screen count). The personalized positive-action visualization (arcGymVisualizationText) must happen strictly AFTER the ARC exercise ends, never interrupting Acceptance/Regulation/Encoding -- see live/NewArcLiveScreen.tsx's returnToTask(), which routes there instead", () => {
  const encodingIndex = newArcLiveCopy.indexOf("function getEncodingContent(");
  const fnBody = newArcLiveCopy.slice(encodingIndex, newArcLiveCopy.indexOf("\n}", encodingIndex));
  assert.ok(!fnBody.includes("if (state.arcGymSituationId)"), "Encoding must never branch on arcGymSituationId -- that used to render the visualization mid-exercise, which the spec explicitly forbids");
  assert.ok(!fnBody.includes("state.arcGymVisualizationText"), "Encoding must never read arcGymVisualizationText -- a doc comment may still mention the field by name");
  const mantraIndex = newArcLiveCopy.indexOf("export function resolveEncodingMantra(");
  const mantraBody = newArcLiveCopy.slice(mantraIndex, newArcLiveCopy.indexOf("\n}", mantraIndex));
  assert.ok(!mantraBody.includes("arcGymSituationId"), "resolveEncodingMantra must never special-case ARC GYM either");
  assert.ok(mantraBody.includes('if (state.goalType === "emotion_only")'), "an ARC GYM session must reach the ordinary emotion_only branch unmodified");
});

test("required test 11 continued: arcGymVisualizationText is resolved exactly ONCE, by the IO layer (NewArcLiveScreen.tsx's reload()), via the SAME shared resolveArcGymActionVisualization every other pathway uses -- the pure engine (newArcLiveCopy.ts) never re-looks-up the situation or re-derives the text itself", () => {
  assert.ok(liveScreen.includes("const arcGymVisualizationText = arcGymSituation ? resolveArcGymActionVisualization(arcGymSituation) : null;"));
  assert.ok(!newArcLiveCopy.includes("resolveArcGymActionVisualization("), "newArcLiveCopy.ts must only ever READ the already-resolved field, never CALL the resolver itself (a doc comment may still mention the function by name)");
});

// --- required test 19: Acceptance -> Regulation -> Encoding transitions ---

test("required test 19 (superseded by the Final ARC Flow & Body Animation task): 'encoding' is now exactly ONE page (stepSubCount 1) for EVERY session, ARC GYM included -- never an arcGymSituationId-specific override any more, since every session now gets the same one-page mantra circle", () => {
  const caseIndex = newArcLiveSteps.indexOf('case "encoding":');
  const nextCaseIndex = newArcLiveSteps.indexOf("case ", caseIndex + 20);
  const body = newArcLiveSteps.slice(caseIndex, nextCaseIndex);
  assert.ok(!body.includes("arcGymSituationId"), "encoding's sub-count must never special-case ARC GYM any more -- it is unconditionally 1");
  assert.match(body, /return 1;/);
});

test("required test 19 continued: Shortened ARC GYM reuses the EXACT same SHORTENED_ARC_SKIPPED_STEPS set as every other shortened session -- Acceptance/Regulation/Encoding are never in that skip set, so they are always reached, never special-cased per ARC-GYM-ness", () => {
  const skipSetDefIndex = newArcLiveSteps.indexOf("const SHORTENED_ARC_SKIPPED_STEPS = new Set");
  const setBody = newArcLiveSteps.slice(skipSetDefIndex, newArcLiveSteps.indexOf("]);", skipSetDefIndex));
  assert.ok(!setBody.includes('"stop_and_accept_urge"'));
  assert.ok(!setBody.includes('"reality_acceptance"'));
  assert.ok(!setBody.includes('"encoding"'));
  // ARCHI -- Move Action Selection into the Existing Regulation Screen
  // task: action_selection/mini_action_selection are now PERMANENTLY
  // unreachable (their own functionality moved into
  // regulation/mini_acceptance_transition) -- isStepReachable's own gate
  // on them is unconditional now, so it no longer references
  // arcGymSituationId at all (the prose above it may still mention the
  // field historically). Acceptance/Regulation/Encoding's own
  // reachability is untouched by that gate, so the original invariant
  // here narrows to exactly that: no arcGymSituationId check anywhere in
  // the function EXCEPT inside that one dedicated clause's own comment.
  const reachableFnIndex = newArcLiveSteps.indexOf("function isStepReachable(");
  const reachableFnBody = newArcLiveSteps.slice(reachableFnIndex, newArcLiveSteps.indexOf("\n}", reachableFnIndex));
  // The gate's own comment block (not just its code line) is excluded from
  // "before"/"after" -- it explains arcGymSituationId in prose, which is
  // expected; what must never happen is arcGymSituationId driving a DIFFERENT
  // reachability decision outside this one dedicated gate.
  const gateCommentStart = reachableFnBody.indexOf("// ARCHI -- Move Action Selection into the Existing Regulation Screen");
  const gateCodeIndex = reachableFnBody.indexOf('(step === "action_selection" || step === "mini_action_selection")');
  assert.ok(gateCommentStart !== -1 && gateCodeIndex !== -1, "the dedicated action_selection/mini_action_selection gate must exist");
  const afterGateEnd = reachableFnBody.indexOf("\n  }", gateCodeIndex);
  const beforeGate = reachableFnBody.slice(0, gateCommentStart);
  const afterGate = reachableFnBody.slice(afterGateEnd);
  assert.ok(!beforeGate.includes("arcGymSituationId"), "no reachability check before the dedicated gate may special-case arcGymSituationId -- Acceptance/Regulation/Encoding's own reachability must stay untouched");
  assert.ok(!afterGate.includes("arcGymSituationId"), "no reachability check after the dedicated gate may special-case arcGymSituationId either");
});

// --- required test 20 (Nine Functional Improvements task, Improvement 4: relocated) --

test("Improvement 4 (supersedes the original required test 20): the 'return to real present-moment body sensation' line lives ONLY on the dedicated visualization screen now -- newArcLiveCopy.ts's Encoding has no ARC GYM branch left at all to carry it (Encoding is identical to any other emotion_only session; the personalized visualization + return-to-body line both happen strictly AFTER the ARC exercise ends, on the one shared screen both the 😄 route and the post-ARC routes now land on)", () => {
  assert.ok(!newArcLiveCopy.includes("if (state.arcGymSituationId)"));
  assert.ok(visualizeOnlyScreen.includes("שים לב לתחושת הגוף האמיתית כרגע"));
});

// --- required test 21/22: training history, session recovery, no duplicates ---

test("required test 21 (screen wiring): ArcGymSituationScreen shows this situation's own training history (listArcGymTrainingRecordsForSituation) with its completion state, before the trainee starts a new run", () => {
  assert.ok(situationScreen.includes("listArcGymTrainingRecordsForSituation(trainingRecords, id)"));
  assert.ok(situationScreen.includes("היסטוריית אימונים"));
  assert.ok(situationScreen.includes('record.completedAt ? "הושלם" : "לא הושלם"'));
});

test("required test 22 (no duplicate ARC sessions): ArcSessionRequest/sessionMatchesRequest compare arcGymSituationId too -- two DIFFERENT ARC GYM situations, both otherwise 'spontaneous'/'shortened' with no plannedArcId, are never treated as the same request and never cross-resume each other's unfinished session", () => {
  const matchFnIndex = newArcLiveTypes.indexOf("export function sessionMatchesRequest(");
  const matchFnBody = newArcLiveTypes.slice(matchFnIndex, newArcLiveTypes.indexOf("\n}", matchFnIndex));
  assert.ok(matchFnBody.includes("session.arcGymSituationId === request.arcGymSituationId"));
});

test("required test 22 continued: a fresh ARC GYM training-history record is created ONLY inside reload()'s '!existingUnfinished' branch (a genuinely new session), never on a mere resume of an already-matching unfinished one -- so re-opening the same training screen twice in a row never doubles the history", () => {
  const reloadIndex = liveScreen.indexOf("const reload = useCallback");
  const reloadBody = liveScreen.slice(reloadIndex, reloadIndex + 10000);
  const freshBranchIndex = reloadBody.indexOf("if (!existingUnfinished) {");
  const resumeBranchIndex = reloadBody.indexOf("if (sessionMatchesRequest(existingUnfinished, request)) {");
  assert.ok(freshBranchIndex !== -1 && resumeBranchIndex !== -1 && freshBranchIndex < resumeBranchIndex);
  const freshBranchBody = reloadBody.slice(freshBranchIndex, resumeBranchIndex);
  const resumeBranchBody = reloadBody.slice(resumeBranchIndex, reloadBody.indexOf("\n      const existingPlannedArcName", resumeBranchIndex));
  assert.ok(freshBranchBody.includes("createArcGymTrainingRecord("), "the fresh-session branch must create the training record");
  assert.ok(!resumeBranchBody.includes("createArcGymTrainingRecord("), "the silent-resume branch must never create a second training record for the same run");
});

test("required test 22 continued: finishArcGymTraining is reached ONLY from returnToTask's own ARC-GYM-first branch -- never called for an abandoned/interrupted session, so a half-finished training session never writes memory or marks a record completed", () => {
  const finishFnIndex = liveScreen.indexOf("async function finishArcGymTraining(");
  assert.ok(finishFnIndex !== -1);
  const callSites = [...liveScreen.matchAll(/finishArcGymTraining\(/g)].length;
  assert.equal(callSites, 2, "exactly one definition + one call site");
  const returnToTaskIndex = liveScreen.indexOf("async function returnToTask(");
  const returnToTaskBody = liveScreen.slice(returnToTaskIndex, returnToTaskIndex + 1400);
  assert.ok(returnToTaskBody.includes("if (session?.arcGymSituationId) {"));
  assert.ok(returnToTaskBody.includes("await finishArcGymTraining(session);"));
});

// --- required test 23: preserving Mini ARC generation rules ---------------

test("required test 23: generateDraftsIfSpontaneous's own guard (arcInvocationMode !== 'spontaneous') is completely untouched by ARC GYM -- an ARC GYM Full ARC session (arcInvocationMode 'spontaneous') naturally gets the SAME existing auto-draft generation as any other spontaneous session, and an ARC GYM Shortened session ('shortened' mode) is excluded by that SAME pre-existing rule, never a new, parallel special case for arcGymSituationId", () => {
  const fnIndex = liveScreen.indexOf("async function generateDraftsIfSpontaneous(");
  const fnBody = liveScreen.slice(fnIndex, liveScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('if (finishedSession.arcInvocationMode !== "spontaneous") return;'));
  assert.ok(!fnBody.includes("arcGymSituationId"), "this guard must never special-case ARC GYM -- it already works correctly via arcInvocationMode alone");
});

test("required test 23 continued: ArcGymTrainingScreen's 'Shortened ARC' check-in choice routes through openShortenedArc (mode 'shortened'), which is explicitly NOT the Mini ARC entry point (mini=1) -- the route param it sets is shortened=1, never mini=1", () => {
  const fnBody = routing.slice(routing.indexOf("export async function openShortenedArc("), routing.indexOf("\n}", routing.indexOf("export async function openShortenedArc(")));
  assert.ok(fnBody.includes('shortened: "1"'));
  assert.ok(!fnBody.includes('mini: "1"'));
});

// --- required test 24: no regressions elsewhere (routing/registration) ----

test("required test 24: all 6 ARC GYM routes are registered in app/_layout.tsx with Hebrew titles, alongside (never replacing) the pre-existing check-in/postponement registrations", () => {
  assert.ok(layout.includes('<Stack.Screen name="arc-gym/index" options={{ title: "ARC GYM" }} />'));
  assert.ok(layout.includes('<Stack.Screen name="arc-gym/behavior/[behaviorId]"'));
  assert.ok(layout.includes('<Stack.Screen name="arc-gym/situation/[id]"'));
  assert.ok(layout.includes('<Stack.Screen name="arc-gym/situation/[id]/edit"'));
  assert.ok(layout.includes('<Stack.Screen name="arc-gym/train/[id]"'));
  assert.ok(layout.includes('<Stack.Screen name="arc-gym/visualize-only/[id]"'));
  assert.ok(layout.includes('name="check-in"'), "the pre-existing widget check-in route must still be registered");
});

test("required test 24 continued: the /tasks/[id]/arc route accepts arcGymSituationId as an independent, optional param and threads it straight through to NewArcLiveScreen, without disturbing the existing mini/spontaneous/shortened/plannedArcId/autoStartAfter params", () => {
  assert.match(arcRoute, /const \{ id, mini, spontaneous, shortened, skipEmotionSelection, plannedArcId, autoStartAfter, arcGymSituationId, arcFocusPracticeId, arcGymMemoryExerciseId, arcPerspectiveId, morningFlowCheckIn \} = useLocalSearchParams/);
  assert.ok(arcRoute.includes("arcGymSituationId={arcGymSituationId ?? null}"));
});

// --- Nine Functional Improvements task, Improvement 4: the 3 required routes ---
//
// Route A (😟 Less Good):  situation visualization -> Full ARC -> complete the
//   ENTIRE Full ARC exercise -> personalized positive-action visualization -> ARC GYM completion.
// Route B (🙂 Okay): same, with Shortened ARC instead of Full ARC.
// Route C (😄 Excellent): situation visualization -> personalized positive-action
//   visualization directly -> ARC GYM completion (no ARC LIVE engine at all).
//
// The critical rule the spec itself calls out: the visualization must happen
// strictly AFTER the ARC exercise ends, never during Acceptance/Regulation/
// Encoding, and never skipped, and never redirected to an unrelated Task LIVE
// screen first.

test("Route A/B: returnToTask's ARC-GYM branch (reached only once Full/Shortened ARC has already fully completed -- completeSession already ran) navigates to the SAME dedicated visualization screen Route C uses (/arc-gym/visualize-only/[id]) for a STANDALONE session, never straight to the situation screen -- the visualization step is never skipped for routes A/B", () => {
  const fnIndex = liveScreen.indexOf("async function returnToTask(autoStart: boolean)");
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 3200);
  const gymBranchIndex = fnBody.indexOf("if (session?.arcGymSituationId) {");
  assert.ok(gymBranchIndex !== -1);
  // ARC Gym + ARC Goal Integration task: this branch now splits on
  // taskId (standalone vs. the real-taskId combined-practice case, see
  // the next test below) -- the visualize-only destination lives in the
  // STANDALONE sub-branch. Scope the slice to the whole outer if-block,
  // bounded by the next sibling branch's own start (never a plain
  // "return;\n    }" search, which would match a nested brace first).
  const gymBranchBody = fnBody.slice(gymBranchIndex, fnBody.indexOf("if (session?.arcGymMemoryExerciseId) {", gymBranchIndex));
  assert.ok(gymBranchBody.includes("await finishArcGymTraining(session);"), "the real full_arc/shortened_arc training record must still be completed and memory recorded, exactly as before");
  assert.ok(
    gymBranchBody.includes('router.replace({ pathname: "/arc-gym/visualize-only/[id]", params: { id: session.arcGymSituationId, recordAlreadyFinished: "1" } });'),
    "must navigate to the dedicated visualization screen with recordAlreadyFinished=1, never directly to /arc-gym/situation/[id] (which would skip the visualization) and never to any Task LIVE route"
  );
  assert.ok(!gymBranchBody.includes('pathname: "/arc-gym/situation/[id]"'), "must never jump straight to the situation screen, skipping the visualization");
});

test("ARC Gym + ARC Goal Integration task: returnToTask's ARC-GYM branch, when the session carries a REAL (non-standalone) taskId -- the Behaviour+Success combined scheduled practice -- never routes to the standalone visualize-only screen, routing instead to the paired Success's own practice (if one is paired) or the ordinary real-task destination", () => {
  const fnIndex = liveScreen.indexOf("async function returnToTask(autoStart: boolean)");
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 3200);
  const gymBranchIndex = fnBody.indexOf("if (session?.arcGymSituationId) {");
  const realTaskIndex = fnBody.indexOf("if (taskId !== STANDALONE_ARC_TASK_ID) {", gymBranchIndex);
  assert.ok(realTaskIndex !== -1 && realTaskIndex > gymBranchIndex);
  const standaloneIndex = fnBody.indexOf('router.replace({ pathname: "/arc-gym/visualize-only/[id]"', gymBranchIndex);
  assert.ok(standaloneIndex > realTaskIndex, "the real-taskId branch must be checked, and return, BEFORE the standalone visualize-only destination");
  const realTaskBody = fnBody.slice(realTaskIndex, standaloneIndex);
  assert.ok(realTaskBody.includes("findPairedArcResultForSituation(resultExercises, session.arcGymSituationId)"));
  assert.ok(realTaskBody.includes('pathname: "/arc-result-practice/[id]"'), "a paired Success is practiced via the EXISTING shared practice screen, never a new/duplicated one");
  // No pair -> deliberately falls through (no explicit call here) all
  // the way to the function's own SINGLE, final
  // routeToTaskOrArcResultSuggestion(taskId, autoStart) call -- never a
  // second copy of that exact call duplicated inside this branch.
  assert.ok(!realTaskBody.includes("routeToTaskOrArcResultSuggestion"), "must never duplicate the final generic-destination call inside this branch -- it falls through to the one at the bottom of returnToTask instead");
  const callSites = [...liveScreen.matchAll(/routeToTaskOrArcResultSuggestion\(taskId, autoStart\);/g)].length;
  assert.equal(callSites, 1, "exactly one call to the final generic destination in the whole function");
});

test("Route A/B/C share ONE visualization screen and ONE personalized-text generator -- recordAlreadyFinished distinguishes 'a real training record already exists and was already completed' (routes A/B, via finishArcGymTraining) from 'no record exists yet' (route C) -- finish() must create+complete a fresh record ONLY in the second case, so routes A/B never get a duplicate completion record for the same training session", () => {
  const fnIndex = visualizeOnlyScreen.indexOf("async function finish()");
  const fnBody = visualizeOnlyScreen.slice(fnIndex, visualizeOnlyScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (!recordAlreadyFinished) {"));
  const guardedIndex = fnBody.indexOf("if (!recordAlreadyFinished) {");
  const guardedBody = fnBody.slice(guardedIndex, fnBody.indexOf("\n    }", guardedIndex));
  assert.ok(guardedBody.includes('createArcGymTrainingRecord(generateArcGymTrainingRecordId(), id, "visualization_only", now)'));
  assert.ok(guardedBody.includes("completeArcGymTrainingRecord("));
  assert.ok(fnBody.includes("setDone(true);"), "both cases must still reach the same completion confirmation screen");
});

test("Route A/B/C: the personalized visualization text itself (resolveArcGymActionVisualization) is read from the ONE shared pure resolver, using the situation's own saved behavior/situation/trigger/desired-action/details -- identical regardless of which route reached this screen", () => {
  assert.ok(visualizeOnlyScreen.includes("resolveArcGymActionVisualization(situation)"));
});

test("the /arc-gym/visualize-only/[id] route parses recordAlreadyFinished from its own query param (default false, so Route C's existing direct entry is completely unaffected) and threads it straight through", () => {
  assert.match(visualizeOnlyRoute, /const \{ id, recordAlreadyFinished \} = useLocalSearchParams/);
  assert.ok(visualizeOnlyRoute.includes('recordAlreadyFinished={recordAlreadyFinished === "1"}'));
});

test("Route A/B/C: ARC GYM's own completion step (the visualization screen's 'done' confirmation) is the ONE place all three routes converge, each then returning to the same situation screen -- no navigation loop back into ARC LIVE or into the visualization screen a second time", () => {
  const doneIndex = visualizeOnlyScreen.indexOf("if (done) {");
  const doneBody = visualizeOnlyScreen.slice(doneIndex, visualizeOnlyScreen.indexOf("\n  }", doneIndex));
  assert.ok(doneBody.includes('router.replace({ pathname: "/arc-gym/situation/[id]", params: { id } })'));
  assert.ok(!doneBody.includes("NewArcLiveScreen") && !doneBody.includes('"/tasks/[id]/arc"'), "the done screen must never loop back into ARC LIVE");
});
