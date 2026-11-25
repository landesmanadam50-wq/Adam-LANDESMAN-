import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/supportiveActionFlowScreen.test.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
 * section 4: source-text regression guard for
 * live/SupportiveActionFlowScreen.tsx (route /tasks/[id]/supportive-action)
 * -- the real-time "I need a supportive action" flow: feeling -> action
 * -> mood -> ARC (skipped on 😄) -> perform -> rate (0-10) -> adapt.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const screen = readSource("live/SupportiveActionFlowScreen.tsx");
const route = readSource("app/tasks/[id]/supportive-action.tsx");
const layout = readSource("app/_layout.tsx");
const notification = readSource("data/taskNotStartedNotification.ts");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");

test("the route is registered and wires taskId straight through to the screen", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/supportive-action"/);
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/SupportiveActionFlowScreen\.tsx["']/);
  assert.ok(route.includes("SupportiveActionFlowScreen taskId={id}"));
});

test("this exact route is what the task-not-started notification's own 'אני צריך פעולה תומכת' button deep-links to (Phase 4, already built) -- confirming the two phases actually connect", () => {
  assert.ok(notification.includes('pathname: "/tasks/[id]/supportive-action"'));
});

test("step 1 (feeling): the task's own previously-linked feelings are offered first, via resolveFeelingsForTask, before every other saved feeling and before free-text", () => {
  const stepIndex = screen.indexOf('step === "feeling"');
  const stepBlock = screen.slice(stepIndex, stepIndex + 2000);
  const taskFeelingsChipIndex = stepBlock.indexOf("taskFeelings.map");
  const otherFeelingsChipIndex = stepBlock.indexOf("otherFeelings.map");
  const freeTextIndex = stepBlock.indexOf("newFeelingDraft");
  assert.ok(taskFeelingsChipIndex !== -1 && otherFeelingsChipIndex !== -1 && freeTextIndex !== -1);
  assert.ok(taskFeelingsChipIndex < otherFeelingsChipIndex && otherFeelingsChipIndex < freeTextIndex);
  assert.ok(screen.includes("resolveFeelingsForTask(taskId, taskFeelingLinks, feelings)"));
});

test("choosing a feeling auto-links it to this task (addTaskFeelingLink's own idempotent reuse rule, via the storage wrapper) and advances to the action step", () => {
  const fnIndex = screen.indexOf("async function handleChooseFeeling");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes('await linkSupportiveFeelingToTask(taskId, id, now);'));
  assert.ok(fnBody.includes('setStep("action");'));
});

test("step 2 (action): offered via resolveActionsForFeelingRankedForTask -- never a plain unranked list -- and a free-text action creates+links before advancing to mood", () => {
  assert.ok(screen.includes("resolveActionsForFeelingRankedForTask(feelingId, taskId, resolveActionIdsForFeeling(feelingId, feelingActionLinks), usages)"));
  const fnIndex = screen.indexOf("async function handleCreateAction");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("findInternalActionByText(actions, feelingId, text)"));
  assert.ok(fnBody.includes("linkInternalActionToFeeling(feelingId, action.id, now)"));
});

test("step 3 (mood) is a SEPARATE concept from the supportive feeling in step 1 -- exactly three choices (😟/🙂/😄), and 😄 skips ARC entirely while 😟/🙂 route to Full/Shortened ARC respectively", () => {
  const fnIndex = screen.indexOf("async function handleChooseMood");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes('if (mood === "great") {'));
  assert.ok(fnBody.includes('setArcTrackChosen("none");'));
  assert.ok(fnBody.includes('setStep("perform");'));
  assert.ok(fnBody.includes('const track: ArcTrackChosen = mood === "bad" ? "full" : "shortened";'));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/arc"'));
  assert.ok(screen.includes('onPress={() => handleChooseMood("bad")}'));
  assert.ok(screen.includes('onPress={() => handleChooseMood("fine")}'));
  assert.ok(screen.includes('onPress={() => handleChooseMood("great")}'));
});

test("the usage-start record is written as soon as mood+track are both known (never deferred to rating), so an abandoned session is still counted toward try-count", () => {
  const fnIndex = screen.indexOf("async function handleChooseMood");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  const greatUsageCalls = fnBody.split("recordInternalActionUsageStart(taskId, feelingId, actionId,").length - 1;
  assert.equal(greatUsageCalls, 2, "one call for the 😄 (none-track) branch, one for the 😟/🙂 (full/shortened-track) branch");
  assert.ok(fnBody.includes("appendInternalActionUsageEntry(usage)"));
});

test("ARC-context-passing fallback: before navigating to ARC, this screen persists a pending record with awaitingArcReturn:true -- it never relies on NewArcLiveScreen.tsx's own returnToTask() routing back here directly", () => {
  const fnIndex = screen.indexOf("async function handleChooseMood");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("await saveSupportiveActionFlowPending({"));
  assert.ok(fnBody.includes('step: "perform",'));
  assert.ok(fnBody.includes("awaitingArcReturn: true,"));
});

test("on focus, a matching pending record resumes this screen directly at its own persisted step (perform/rating) with every piece of context restored, and clears the awaitingArcReturn flag", () => {
  const effectIndex = screen.indexOf("if (pending && pending.taskId === taskId) {");
  const effectBody = screen.slice(effectIndex, effectIndex + 500);
  assert.ok(effectBody.includes("setFeelingId(pending.feelingId);"));
  assert.ok(effectBody.includes("setActionId(pending.actionId);"));
  assert.ok(effectBody.includes("setStep(pending.step);"));
  assert.ok(effectBody.includes("awaitingArcReturn: false"));
});

test("ActiveTaskScreen.tsx's own small redirect effect is what actually completes the round trip -- never an edit to NewArcLiveScreen.tsx's own returnToTask()", () => {
  assert.ok(activeTaskScreen.includes("loadSupportiveActionFlowPending().then((pending) => {"));
  assert.ok(activeTaskScreen.includes('router.replace({ pathname: "/tasks/[id]/supportive-action", params: { id: task.id } });'));
});

test("step 5 (perform): no timer, a single 'סיימתי' button that advances to rating -- the trainee may stay in the action as long as they want", () => {
  const stepIndex = screen.indexOf('step === "perform"');
  const stepBlock = screen.slice(stepIndex, stepIndex + 500);
  assert.ok(stepBlock.includes("handleFinishPerforming"));
  assert.ok(!stepBlock.includes("setInterval"), "no countdown/timer of any kind on the perform step");
});

test("step 6 (rating): 0-10 inclusive, 0 is explicitly selectable, and submitting always records the rating via recordInternalActionUsageRating even at 0", () => {
  assert.match(screen, /const RATING_VALUES = \[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10\];/);
  const fnIndex = screen.indexOf("async function handleSubmitRating");
  const fnBody = screen.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("if (ratingDraft === null"), "only null (never answered) blocks submission -- 0 itself is a valid, submittable rating");
  assert.ok(fnBody.includes("recordInternalActionUsageRating(existingUsage, ratingDraft, now)"));
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]/adapt", params: { id: taskId } });'), "step 7: proceeds to the task-shrink screen");
});

test("the screen offers an explicit cancel/exit link that clears the pending record, so a stale pending flow never force-redirects a trainee who deliberately left it", () => {
  const cancelIndex = screen.indexOf("styles.cancelLink");
  const cancelBlock = screen.slice(cancelIndex, cancelIndex + 300);
  assert.ok(cancelBlock.includes("clearSupportiveActionFlowPending();"));
});
