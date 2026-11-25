import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcDecisionIntegration.test.ts
 *
 * ARC Decision -- "קבלת החלטות": source-text regression guard for the
 * standalone ARC Gym entry point's own wiring -- the pure engine
 * (arc/arcDecision.ts) and shared UI (live/components/ArcDecisionFlow.tsx)
 * already have their own direct tests; this file guards that
 * build/ArcGymDecisionScreen.tsx actually reuses them (never a second,
 * parallel implementation), resumes any existing in-progress "arc_gym"
 * session rather than starting a duplicate, never auto-creates a Task on
 * finish, and that its "הפוך את ההחלטה למשימה" action opens the existing
 * task editor rather than a second task-creation mechanism.
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section 1:
 * the "arc"-source entry point (live/NewArcLiveScreen.tsx's own "אני לא
 * יודע" button inside the now-removed action-selection step) is retired --
 * its purpose is superseded by the new feeling/action flow
 * (arc/supportiveFeelings.ts). This file no longer asserts on
 * NewArcLiveScreen.tsx at all; only the arc_gym-source half below survives.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const gymScreen = readSource("build/ArcGymDecisionScreen.tsx");
const gymListScreen = readSource("build/ArcGymScreen.tsx");
const layout = readSource("app/_layout.tsx");
const taskEditor = readSource("build/TaskEditorScreen.tsx");
const taskEditRoute = readSource("app/tasks/[id]/edit.tsx");
const storageModule = readSource("data/storage.ts");
const decisionRoute = readSource("app/arc-gym/decision.tsx");

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
