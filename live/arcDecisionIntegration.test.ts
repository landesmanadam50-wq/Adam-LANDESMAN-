import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcDecisionIntegration.test.ts
 *
 * ARC Decision -- "קבלת החלטות": source-text regression guard for both
 * entry points' own wiring -- the pure engine (arc/arcDecision.ts) and
 * shared UI (live/components/ArcDecisionFlow.tsx) already have their
 * own direct tests; this file guards that both entry points actually
 * reuse them (never a second, parallel implementation), that the "אני
 * לא יודע" button sits at the existing action-selection point without
 * disturbing the generic ARC step back/skip controls, that canceling
 * never touches the underlying ARC session, that finishing routes
 * through the EXISTING setSelectedAction (never a new selection
 * mechanism), and that the ARC Gym entry point's task-creation hookup
 * never auto-creates a Task.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const liveScreen = readSource("live/NewArcLiveScreen.tsx");
const gymScreen = readSource("build/ArcGymDecisionScreen.tsx");
const gymListScreen = readSource("build/ArcGymScreen.tsx");
const layout = readSource("app/_layout.tsx");
const taskEditor = readSource("build/TaskEditorScreen.tsx");
const taskEditRoute = readSource("app/tasks/[id]/edit.tsx");
const storageModule = readSource("data/storage.ts");
const decisionRoute = readSource("app/arc-gym/decision.tsx");

test("NewArcLiveScreen imports the shared ArcDecisionFlow component and arc/arcDecision.ts -- never a second, duplicated implementation", () => {
  assert.match(liveScreen, /import ArcDecisionFlow from "\.\/components\/ArcDecisionFlow\.tsx";/);
  assert.match(liveScreen, /from "\.\.\/arc\/arcDecision\.ts";/);
});

test("renderActionSelector() renders ArcDecisionFlow INSTEAD of the normal picker whenever an ARC Decision overlay is active, and offers the 'אני לא יודע' button alongside the existing options otherwise", () => {
  const fnIndex = liveScreen.indexOf("function renderActionSelector() {");
  assert.ok(fnIndex !== -1);
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 9000);
  const overlayIndex = fnBody.indexOf("if (arcDecisionSession) {");
  assert.ok(overlayIndex !== -1);
  const buttonIndex = fnBody.indexOf("אני לא יודע");
  assert.ok(buttonIndex !== -1 && buttonIndex > overlayIndex, "the button must be part of the normal (non-overlay) picker, after the early overlay return");
  assert.ok(fnBody.includes("onPress={startArcDecision}"));
});

test("startArcDecision creates a session via createArcDecisionSession('arc', taskId, ...) and persists it to the single in-progress slot before showing it -- never silently in-memory only", () => {
  const fnIndex = liveScreen.indexOf("function startArcDecision() {");
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes('createArcDecisionSession("arc", taskId,'));
  assert.ok(fnBody.includes("saveArcDecisionInProgress(created)"));
  assert.ok(fnBody.includes("setArcDecisionSession(created)"));
});

test("a resumable ARC Decision is only ever restored when it belongs to THIS exact ARC session (source 'arc' and arcSessionId === taskId) and is not already completed -- never a stale or foreign one", () => {
  const fnIndex = liveScreen.indexOf("loadArcDecisionInProgress().then((progress) => {");
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes('progress.source === "arc"'));
  assert.ok(fnBody.includes("progress.arcSessionId === taskId"));
  assert.ok(fnBody.includes("!progress.completedAt"));
});

test("canceling ARC Decision only clears the overlay/in-progress slot -- it never calls commit/advance/goBack, so the underlying ARC session is left completely untouched", () => {
  const fnIndex = liveScreen.indexOf("function handleArcDecisionCancel() {");
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("clearArcDecisionInProgress()"));
  assert.ok(fnBody.includes("setArcDecisionSession(null)"));
  assert.ok(!fnBody.includes("commit("));
});

test("finishing ARC Decision routes the chosen option through the EXISTING setSelectedAction as a temporaryAction (never a new selection mechanism), clamped against the same available-minutes rule the normal picker already uses, and records history before clearing the in-progress slot", () => {
  const fnIndex = liveScreen.indexOf("function handleArcDecisionFinish(");
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("recordArcDecisionHistory(completed)"));
  assert.ok(fnBody.includes("clearArcDecisionInProgress()"));
  assert.ok(fnBody.includes("resolveMinutesUntilNextTask(dailyPlanEntries, taskId, new Date())"));
  assert.ok(fnBody.includes('commit(setSelectedAction(session!, { source: "temporaryAction", title: chosenOption.text, durationMinutes: clampedDuration }, now))'));
});

test("the generic ARC step back/skip row is hidden whenever the ARC Decision overlay is showing, so its own 'חזרה' can never step the underlying ARC session backward by mistake", () => {
  const navRowIndex = liveScreen.indexOf("{!arcDecisionSession && (");
  assert.ok(navRowIndex !== -1);
  const navRowBody = liveScreen.slice(navRowIndex, navRowIndex + 900);
  assert.ok(navRowBody.includes("styles.navRow"));
  assert.ok(navRowBody.includes("commit(goBack(session, now))"));
});

test("ArcGymDecisionScreen (the standalone ARC Gym exercise) reuses the exact same ArcDecisionFlow + arc/arcDecision.ts engine, resumes any existing in-progress 'arc_gym' session rather than starting a duplicate, and never auto-creates a Task on finish", () => {
  assert.match(gymScreen, /import ArcDecisionFlow from "\.\.\/live\/components\/ArcDecisionFlow\.tsx";/);
  assert.ok(gymScreen.includes('progress.source === "arc_gym"'));
  assert.ok(gymScreen.includes('createArcDecisionSession("arc_gym", null, null,'));
  assert.ok(!gymScreen.includes("upsertTask("), "ARC Gym's own finish/make-task flow must never persist a Task by itself");
});

test("ARC Gym's 'הפוך את ההחלטה למשימה' action opens the EXISTING task editor with its title prefilled from the chosen option, via TaskEditorScreen's own initialTitle prop -- the trainee still has to explicitly confirm there", () => {
  const fnIndex = gymScreen.indexOf("function handleMakeTask() {");
  const fnBody = gymScreen.slice(fnIndex, fnIndex + 250);
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/edit"'));
  assert.ok(fnBody.includes('id: "new"'));
  assert.ok(fnBody.includes("title: finished!.chosen.text"));
});

test("TaskEditorScreen's initialTitle prop prefills a brand-new task's own title, the same isNew-only convention as initialScheduledDate, and is threaded through the /tasks/[id]/edit route", () => {
  assert.match(taskEditor, /initialTitle\?: string \| null;/);
  const draftIndex = taskEditor.indexOf("const [draft, setDraft] = useState<TaskDraft>(");
  const draftBody = taskEditor.slice(draftIndex, draftIndex + 300);
  assert.ok(draftBody.includes("initialTitle ? { title: initialTitle }"));
  assert.match(taskEditRoute, /initialTitle=\{title \?\? null\}/);
});

test("ARC Decision's storage is a single resumable in-progress slot plus an append-only history, mirroring this app's own existing single-slot convention", () => {
  assert.match(storageModule, /const ARC_DECISION_IN_PROGRESS_KEY = "archi\.arcDecisionInProgress\.v1";/);
  assert.match(storageModule, /export async function loadArcDecisionInProgress/);
  assert.match(storageModule, /export async function saveArcDecisionInProgress/);
  assert.match(storageModule, /export async function clearArcDecisionInProgress/);
  assert.match(storageModule, /const ARC_DECISION_HISTORY_KEY = "archi\.arcDecisionHistory\.v1";/);
  assert.match(storageModule, /export async function recordArcDecisionHistory/);
});

test("the ARC Gym entry route and its ArcGymScreen card are registered, alongside every pre-existing ARC Gym route (none removed)", () => {
  assert.match(layout, /<Stack\.Screen name="arc-gym\/decision"/);
  assert.match(layout, /<Stack\.Screen name="arc-gym\/arc-focus"/, "ARC Focus's own route must still be registered");
  assert.match(layout, /<Stack\.Screen name="arc-gym\/memory\/index"/, "ARC Memory's own route must still be registered");
  assert.ok(gymListScreen.includes('router.push("/arc-gym/decision")'));
  assert.ok(decisionRoute.includes("ArcGymDecisionScreen"));
});
