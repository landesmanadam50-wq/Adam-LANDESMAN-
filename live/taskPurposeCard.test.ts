import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskPurposeCard.test.ts
 *
 * Task LIVE Purpose Card task: source-text regression guard for the new
 * "goal -> reason -> value -> identity" card on live/ActiveTaskScreen.tsx
 * (live/components/TaskPurposeCard.tsx + arc/taskPurposeContext.ts's own
 * pure logic is covered directly by arc/taskPurposeContext.test.ts), plus
 * every existing-field-reuse touchpoint this task added: Task.reason,
 * PurposeManifest.personalIdentity, and their two editor screens.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const purposeCard = readSource("live/components/TaskPurposeCard.tsx");
const tasksEngine = readSource("arc/tasks.ts");
const taskDraft = readSource("arc/taskDraft.ts");
const taskEditorScreen = readSource("build/TaskEditorScreen.tsx");
const purposeManifestEngine = readSource("arc/purposeManifest.ts");
const purposeManifestEditorScreen = readSource("build/PurposeManifestEditorScreen.tsx");

test("ActiveTaskScreen loads the three goal-source collections (PurposeManifest/ArcGymGoal/ArcGoal) inside reload() -- refreshed on every focus, never a one-time fetch", () => {
  const reloadIndex = activeTaskScreen.indexOf("const reload = useCallback");
  const reloadBody = activeTaskScreen.slice(reloadIndex, reloadIndex + 1200);
  assert.ok(reloadBody.includes("loadPurposeManifests()"));
  assert.ok(reloadBody.includes("loadArcGymGoals()"));
  assert.ok(reloadBody.includes("loadArcGoals()"));
  assert.ok(reloadBody.includes("setPurposeManifests(manifests)"));
  assert.ok(reloadBody.includes("setPurposeArcGymGoals(arcGymGoals)"));
  assert.ok(reloadBody.includes("setPurposeArcGoals(arcGoals)"));
});

test("the TaskPurposeCard is rendered from the SAME `task` state every other reader of this screen uses -- never a second, independently-tracked task reference, so switching tasks or a removed-for-today occurrence is reflected automatically", () => {
  assert.ok(activeTaskScreen.includes("<TaskPurposeCard context={resolveTaskPurposeContext(task, purposeManifests, purposeArcGymGoals, purposeArcGoals)} />"));
});

test("the purpose card sits above the timer block and below the current-action label -- 'above the timer, below the current action' per the spec's own layout", () => {
  const actionLabelIndex = activeTaskScreen.indexOf('<Text style={styles.actionLabel}>');
  const cardIndex = activeTaskScreen.indexOf("<TaskPurposeCard context=");
  const timerBlockIndex = activeTaskScreen.indexOf("{!timerEnded && !restRun && timerRun && !timerRunEnded && status && (");
  assert.ok(actionLabelIndex !== -1 && cardIndex !== -1 && timerBlockIndex !== -1);
  assert.ok(actionLabelIndex < cardIndex, "the card must come after the current-action label");
  assert.ok(cardIndex < timerBlockIndex, "the card must come before the active-timer block");
});

test("TaskPurposeCard renders nothing at all when every one of the four fields is empty -- never an empty shell", () => {
  const fnIndex = purposeCard.indexOf("export default function TaskPurposeCard(");
  const fnBody = purposeCard.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("if (!context.goal && !context.reason && !context.value && !context.identity) return null;"));
});

test("TaskPurposeCard is expanded by default and the whole header row toggles it on tap", () => {
  assert.ok(purposeCard.includes("useState(false)"), "collapsed must default to false (expanded)");
  assert.ok(purposeCard.includes("setCollapsed((previous) => !previous)"));
  assert.ok(purposeCard.includes('{collapsed ? "▸" : "▾"}'));
});

test("TaskPurposeCard renders only the fields that are actually present, each with its own exact Hebrew label", () => {
  assert.ok(purposeCard.includes('{context.goal && <PurposeRow label="המטרה שלי" value={context.goal} />}'));
  assert.ok(purposeCard.includes('{context.reason && <PurposeRow label="הסיבה שלי לפעולה" value={context.reason} />}'));
  assert.ok(purposeCard.includes('{context.value && <PurposeRow label="הערך שלי" value={context.value} />}'));
  assert.ok(purposeCard.includes('{context.identity && <PurposeRow label="הזהות שלי" value={context.identity} />}'));
});

test("TaskPurposeCard is fully RTL -- every row and the header are right-aligned", () => {
  assert.match(purposeCard, /headerTitle:\s*\{[^}]*textAlign:\s*"right"/);
  assert.match(purposeCard, /row:\s*\{[^}]*textAlign:\s*"right"/);
});

// --- Existing-field reuse: Task.reason (genuinely new) + Task.value/identity (pre-existing) ---

test("Task.reason is the one genuinely new task-level field -- mirrors the pre-existing value/identity fields exactly in type, normalize backfill, and createEmptyTask default", () => {
  assert.match(tasksEngine, /reason:\s*string \| null;[\s\S]{0,250}value:\s*string \| null;/);
  const normalizeIndex = tasksEngine.indexOf("export function normalizeTask(task: Task): Task {");
  const normalizeBody = tasksEngine.slice(normalizeIndex, normalizeIndex + 1200);
  assert.ok(normalizeBody.includes("reason: task.reason ?? null,"));
  const emptyTaskIndex = tasksEngine.indexOf("export function createEmptyTask(");
  const emptyTaskBody = tasksEngine.slice(emptyTaskIndex, emptyTaskIndex + 900);
  assert.ok(emptyTaskBody.includes("reason: null,"));
});

test("TaskDraft/taskDraftFromTask/buildTaskFromDraft all carry the new reason field through, mirroring value/identity's own round-trip exactly", () => {
  assert.ok(taskDraft.includes("reason: string;"));
  assert.ok(taskDraft.includes('reason: "",'));
  assert.ok(taskDraft.includes("reason: task.reason ?? \"\","));
  assert.ok(taskDraft.includes("reason: draft.reason.trim() ? draft.reason.trim() : null,"));
});

test("TaskEditorScreen exposes an optional 'סיבה לפעולה' field bound to draft.reason, placed right alongside the existing value/identity fields", () => {
  const reasonIndex = taskEditorScreen.indexOf('Field label="סיבה לפעולה (רשות)"');
  const valueIndex = taskEditorScreen.indexOf('Field label="ערך (רשות)"');
  assert.ok(reasonIndex !== -1 && valueIndex !== -1);
  assert.ok(reasonIndex < valueIndex, "the reason field must be introduced before the value field, matching goal->reason->value->identity ordering");
  assert.ok(taskEditorScreen.includes('value={draft.reason} onChangeText={(reason) => setDraft({ ...draft, reason })}'));
});

// --- Existing-field reuse: PurposeManifest.personalIdentity (genuinely new) ---

test("PurposeManifest.personalIdentity is the one genuinely new goal-level field -- optional like futureMantra/focusPointColor/futureBodyMovement, never required by isPurposeManifestComplete", () => {
  assert.match(purposeManifestEngine, /personalIdentity:\s*string;/);
  const completeIndex = purposeManifestEngine.indexOf("export function isPurposeManifestComplete(manifest: PurposeManifest): boolean {");
  const completeBody = purposeManifestEngine.slice(completeIndex, completeIndex + 300);
  assert.ok(!completeBody.includes("personalIdentity"), "personalIdentity must never gate a manifest out of the random daily-popup pool");
  assert.ok(completeBody.includes("longTermGoal.trim()") && completeBody.includes("personalReason.trim()") && completeBody.includes("personalValue.trim()"));
});

test("normalizePurposeManifest backfills personalIdentity to '' for a manifest saved before this field existed, same convention as futureMantra", () => {
  const normalizeIndex = purposeManifestEngine.indexOf("export function normalizePurposeManifest(raw: PurposeManifest): PurposeManifest {");
  const normalizeBody = purposeManifestEngine.slice(normalizeIndex, normalizeIndex + 500);
  assert.ok(normalizeBody.includes('personalIdentity: typeof raw.personalIdentity === "string" ? raw.personalIdentity : "",'));
});

test("PurposeManifestEditorScreen exposes the personalIdentity question right after personalValue's own question", () => {
  const valueIndex = purposeManifestEditorScreen.indexOf('Field label="איזה ערך חשוב בחיים שלך המטרה הזאת מבטאת?"');
  const identityIndex = purposeManifestEditorScreen.indexOf("איזה אדם אתה רוצה להיות באמצעות המטרה הזאת?");
  assert.ok(valueIndex !== -1 && identityIndex !== -1 && valueIndex < identityIndex);
  assert.ok(purposeManifestEditorScreen.includes('value={draft.personalIdentity} onChangeText={(value) => setDraft({ ...draft, personalIdentity: value })}'));
});
