import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/morningFlowIntegration.test.ts
 *
 * Nine Functional Improvements task, Improvement 10 ("Complete Expected
 * Morning Flow"): an ACCEPTANCE-level check of the full sequence the
 * other 9 improvements were each built into --
 *
 *   one-time alarm setup offer (Improvement 9)
 *   -> emotional check-in (Morning Flow Simplification task)
 *   -> psychology fact
 *   -> Manifest (Manifest Upgrade task)
 *   -> planning, with inline task creation (Improvement 7)
 *   -> per-task visualization + body-scan (Daily Visualization task)
 *   -> end-of-day visualization + reinforcing action (Daily Visualization task)
 *
 * Every individual transition is already covered, piecewise, by its
 * own improvement's test file (live/manifestUpgrade.test.ts,
 * live/morningFlowSimplification.test.ts, data/morningAlarm.test.ts,
 * etc.) -- this file's own job is ONLY to confirm the pieces actually
 * chain together into that one real order, end to end, which no single
 * piecewise test asserts by itself.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const overlay = readSource("live/DailyStartupSequenceOverlay.tsx");
const visualizationScreen = readSource("live/DailyVisualizationScreen.tsx");

test("step 1 (one-time alarm offer) -> step 2 (checkin): both finishAlarmOffer(true) and finishAlarmOffer(false) land on 'checkin', and the mount effect only ever reaches 'alarmOffer' before 'checkin' is even considered -- the offer can never come AFTER the check-in", () => {
  const effectIndex = overlay.indexOf('useEffect(() => {\n    logStartupStep("mount effect starting"');
  const alarmOfferIdx = overlay.indexOf('setStep("alarmOffer");', effectIndex);
  const checkinIdx = overlay.indexOf('setStep("checkin");', effectIndex);
  assert.ok(alarmOfferIdx !== -1 && checkinIdx !== -1 && alarmOfferIdx < checkinIdx, "the alarmOffer branch must be reached, and decided, strictly BEFORE the checkin branch in source order");

  const finishFnIndex = overlay.indexOf("async function finishAlarmOffer(enabled: boolean)");
  const finishFnBody = overlay.slice(finishFnIndex, finishFnIndex + 900);
  assert.ok(finishFnBody.includes('setStep("checkin");'));
});

test("step 2 (checkin) -> step 3 (fact): the 😄 'Excellent' choice (handleCheckInContinue) goes DIRECTLY to 'fact' -- it is a plain local setStep, never a call into handleEmotionalCheckInChoice/resolveNextTaskEntry, so it can never redirect to 'next task' the way the Home check-in bar's own 😄 choice deliberately does", () => {
  const fnIndex = overlay.indexOf("function handleCheckInContinue()");
  const fnBody = overlay.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes('setStep("fact");'));
  assert.ok(!fnBody.includes("handleEmotionalCheckInChoice"), "must never route through the shared (next-task-resolving) check-in dispatcher");
  assert.ok(!fnBody.includes("resolveNextTaskEntry"), "must never resolve or jump to a next task while still inside the morning sequence");
  assert.ok(overlay.includes('<Pressable style={styles.checkInButton} onPress={handleCheckInContinue}>'));
});

test("step 2 (checkin) -> 😟/🙂 ARC branches -> back to step 3 (fact): choosing Full/Shortened ARC pauses the sequence (step -> 'none'), and the pathname-resume effect brings it back to 'fact' (never re-asking the check-in, never skipping straight to planning) ONLY once the ARC exercise has genuinely finished -- never merely because the trainee is back on '/' for any reason", () => {
  const fnIndex = overlay.indexOf("function handleCheckInArc(");
  const fnEnd = overlay.indexOf("handleEmotionalCheckInChoice(choice, null", fnIndex);
  const fnBody = overlay.slice(fnIndex, fnEnd);
  assert.ok(fnBody.includes("setAwaitingCheckInReturn(true);"));
  assert.ok(fnBody.includes('setStep("none");'));

  const resumeEffectIndex = overlay.indexOf("if (!awaitingCheckInReturn) return;");
  const resumeEffectBody = overlay.slice(resumeEffectIndex, resumeEffectIndex + 2700);
  // Full ARC Sequence Update + Morning Flow Navigation Correction task:
  // genuine completion is told apart from mid-session abandonment by
  // re-checking the persisted ARC session itself (returnToTask() always
  // clears it on real completion, before navigating back here) --
  // never an unconditional "we're on '/', so it must be done."
  assert.ok(resumeEffectBody.includes("arcSession = await loadNewArcLiveSession();"));
  assert.ok(resumeEffectBody.includes("const arcStillActive = arcSession !== null && !isNewArcLiveSessionStale(arcSession, new Date());"));
  assert.ok(resumeEffectBody.includes("if (arcStillActive) {"));
  const stillActiveBranch = resumeEffectBody.slice(resumeEffectBody.indexOf("if (arcStillActive) {"), resumeEffectBody.indexOf("if (arcStillActive) {") + 250);
  assert.ok(!stillActiveBranch.includes('setStep("fact")'), "must NOT advance to 'fact' while the ARC session is still active/unfinished");
  assert.ok(stillActiveBranch.includes("return;"));
  assert.ok(resumeEffectBody.includes('setStep("fact");'), "the genuine-completion path (after the still-active check) must still land on 'fact'");
});

test("checkpoint (Part 2, rule 3/12): abandoning ARC mid-session (back button or any other way to leave without finishing) never marks the morning check-in completed and never discards the resumable ARC session -- the pathname-resume effect's own 'still active' branch leaves awaitingCheckInReturn untouched (still true) so it re-checks again next time, and never calls clearNewArcLiveSession/completeSession itself", () => {
  const resumeEffectIndex = overlay.indexOf("if (!awaitingCheckInReturn) return;");
  const resumeEffectBody = overlay.slice(resumeEffectIndex, resumeEffectIndex + 2700);
  assert.ok(!resumeEffectBody.includes("clearNewArcLiveSession"), "this effect must never itself clear the ARC session -- only returnToTask() does that, on genuine completion");
  assert.ok(!resumeEffectBody.includes("setAwaitingCheckInReturn(false)") || resumeEffectBody.indexOf("setAwaitingCheckInReturn(false)") > resumeEffectBody.indexOf("if (arcStillActive) {"), "setAwaitingCheckInReturn(false) must only run on the genuine-completion path, after the still-active check has already returned early");
});

test("step 3 (fact) -> step 4 (manifest): the fact card's own 'המשך' button calls continueToManifest, which always lands on 'manifest' (success or failure alike -- the catch branch still sets the step in its finally block, so a failed Manifest resolution can never leave the sequence stuck on the fact card)", () => {
  const factCardIndex = overlay.indexOf('step === "fact" && fact ?');
  const factCardBody = overlay.slice(factCardIndex, factCardIndex + 400);
  assert.ok(factCardBody.includes("onPress={continueToManifest}"));

  const fnIndex = overlay.indexOf("async function continueToManifest()");
  const fnBody = overlay.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("} finally {"));
  assert.ok(fnBody.includes('setStep("manifest");'));
});

test("step 4 (manifest) -> step 5 (planning): every Manifest-step exit path (ManifestVisualizationCard's own onClose, the 'create a manifest' button, and its own skip link) converges on continueToPlanning, which always lands on 'planning' -- the Manifest step can never be a dead end", () => {
  assert.ok(overlay.includes("onClose={continueToPlanning}"));
  const noManifestCardIndex = overlay.indexOf('<Text style={styles.title}>עדיין אין מניפסט</Text>');
  const noManifestCardBody = overlay.slice(noManifestCardIndex, noManifestCardIndex + 700);
  assert.ok(noManifestCardBody.includes("continueToPlanning();"));
  assert.ok(noManifestCardBody.includes("onPress={continueToPlanning}"));

  const fnIndex = overlay.indexOf("function continueToPlanning()");
  const fnBody = overlay.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes('setStep("planning");'));
});

test("step 5 (planning, WITH inline task creation) -> step 6/7 (per-task visualization + body-scan, end-of-day visualization + reinforcement): every planning-step exit path (the suitable card's 'המשך להכנה', the unsuitable card's 'המשך לוויזואליזציה', and its own skip link) converges on finish(), which opens /daily-visualization whenever it's still needed today -- both planning cards also offer the Improvement 7 add-task form, so task creation and the hand-off to visualization are available from the SAME step", () => {
  const planningStepIndex = overlay.indexOf('step === "planning" && planEntries &&');
  const planningStepBody = overlay.slice(planningStepIndex, overlay.indexOf('{(step === "fact" || step === "manifest")'));
  const finishOnPressCount = (planningStepBody.match(/onPress=\{finish\}/g) ?? []).length;
  assert.equal(finishOnPressCount, 3, "all three exit buttons across both planning cards (suitable: 'המשך להכנה'; unsuitable: 'המשך לוויזואליזציה' and the skip link) must call finish()");
  assert.ok(planningStepBody.includes("➕ הוסף משימה להיום"));
  assert.ok(planningStepBody.includes("{addTaskForm}"));

  const finishFnIndex = overlay.indexOf("async function finish()");
  const finishFnBody = overlay.slice(finishFnIndex, finishFnIndex + 500);
  assert.ok(finishFnBody.includes("await isDailyVisualizationNeededNow(new Date());"));
  assert.ok(finishFnBody.includes('router.push("/daily-visualization");'));
});

test("step 6/7: the Daily Visualization screen itself (reached from finish() above) covers both a PER-TASK visualization+body-scan step and an END-OF-DAY visualization + reinforcing-action step -- the full remainder of the expected sequence, never truncated after planning", () => {
  assert.ok(visualizationScreen.includes('step.kind !== "task_body_scan"'), "per-task body-scan step must exist");
  assert.ok(visualizationScreen.includes('step.kind === "reinforcement_action"'), "end-of-day reinforcing-action step must exist");
  assert.ok(visualizationScreen.includes("saveDailyVisualizationReinforcement("));
});

test("full chain, source order: alarmOffer, checkin, fact, manifest, planning, and complete appear in the Step union in exactly the expected sequence (never reordered), with 'none'/'checking'/'done' as the non-content states around them", () => {
  const stepUnionMatch = overlay.match(/type Step = "([^"]+)"(?: \| "([^"]+)")*;/);
  assert.ok(stepUnionMatch, "the Step union must be a plain string-literal union on one line");
  const steps = overlay.match(/type Step = (.+);/)![1].split(" | ").map((s) => s.replace(/"/g, ""));
  assert.deepEqual(steps, ["checking", "none", "alarmOffer", "checkin", "fact", "manifest", "planning", "done"]);
});
