import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskReflection.test.ts
 *
 * Task Reflection Memory & Smart Notification Updates task:
 * source-text regression guard for the UI layer -- same convention as
 * every other screen test in this codebase (React Native components
 * aren't renderable under a plain `node --test` run). The pure model
 * is exercised in arc/taskReflection.test.ts, the AsyncStorage/notifee
 * orchestration in data/taskReflection.test.ts and data/taskAlarm.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const reflectScreen = readSource("live/SessionReflectionScreen.tsx");
const historyScreen = readSource("live/TaskReflectionHistoryScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const reflectRoute = readSource("app/tasks/[id]/reflect.tsx");
const historyRoute = readSource("app/tasks/[id]/reflections.tsx");
const layout = readSource("app/_layout.tsx");

// --- Requirement 1 (historical), SUPERSEDED by the Unified ARC & Productivity Update task's own requirement 5 ("SIMPLIFY POST-TASK REFLECTION"): exactly ONE optional question, saved as its own TaskReflection ---

test("Unified ARC & Productivity Update task, requirement 5: SessionReflectionScreen asks the exact required single question verbatim -- the old whatHelped/whatToReuse/returnedAfterArc questions are gone entirely as actual rendered chips/fields (a doc comment may still mention their old Hebrew text for context)", () => {
  assert.ok(reflectScreen.includes('<Text style={styles.question}>לאיזה חלק מהמשימה הכי התחברתי?</Text>'));
  assert.ok(!reflectScreen.includes('<Text style={styles.question}>מה עזר?'), "the removed question must not reappear as a rendered field");
  assert.ok(!reflectScreen.includes('<Text style={styles.question}>מה כדאי לחזור עליו בפעם הבאה?'), "the removed question must not reappear as a rendered field");
  assert.ok(!reflectScreen.includes('<Text style={styles.question}>אם עברת ל-ARC'), "the removed returnedAfterArc question must not reappear as a rendered field");
  assert.ok(!reflectScreen.includes("styles.chipRow"), "the removed returnedAfterArc chip row is gone entirely");
});

test("finish() saves the one answer via saveNewTaskReflection, associated with this exact taskId -- the old 'session_reflection' TaskJournalEntry is no longer written from this screen at all", () => {
  assert.ok(reflectScreen.includes('import { saveNewTaskReflection } from "../data/taskReflection.ts";'));
  assert.ok(!reflectScreen.includes("appendTaskJournalEntry("), "the removed journal entry must never be written again (a doc comment may still mention the function by name)");
  assert.ok(!reflectScreen.includes('kind: "session_reflection"'));
  const fnIndex = reflectScreen.indexOf("async function finish()");
  const fnBody = reflectScreen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await saveNewTaskReflection(taskId, favoritePartText, new Date());"));
});

test("the one question's own TextInput is bound to its own independent favoritePartText state", () => {
  assert.match(reflectScreen, /<TextInput style=\{styles\.textInput\} value=\{favoritePartText\} onChangeText=\{setFavoritePartText\}/);
});

test("answering is genuinely optional -- the save button is never disabled, and saveNewTaskReflection itself is a no-op for blank text (already covered by data/taskReflection.test.ts), so 'allow immediate completion without answering' needs no extra guard on this screen", () => {
  const buttonIndex = reflectScreen.indexOf('<Pressable style={styles.primaryButton} onPress={finish}>');
  assert.ok(buttonIndex !== -1, "the save button must be unconditionally enabled, never gated on favoritePartText");
});

// --- Requirement 5: review/edit/delete, reachable from the task's own details screen ---

test("ActiveTaskScreen's task-details screen links to the reflection history route for THIS task", () => {
  assert.match(activeTaskScreen, /pathname: "\/tasks\/\[id\]\/reflections", params: \{ id: task\.id \}/);
});

test("the reflections route is registered and passes the task id through", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/reflections"/);
  assert.ok(historyRoute.includes("<TaskReflectionHistoryScreen taskId={id} />"));
});

test("the history screen loads via listReflectionsForTaskNewestFirst (newest first) and displays each reflection's own content, date, and time", () => {
  assert.ok(historyScreen.includes("listReflectionsForTaskNewestFirst(taskId)"));
  assert.ok(historyScreen.includes("{reflection.text}"));
  assert.ok(historyScreen.includes("formatDate(reflection.createdAt)"));
  assert.ok(historyScreen.includes("formatTime(reflection.createdAt)"));
});

test("editing a reflection calls editTaskReflection with that reflection's own id, and deleting calls deleteTaskReflection -- both reload the list afterward so the screen never shows stale state", () => {
  const editIndex = historyScreen.indexOf("async function saveEdit()");
  const editBody = historyScreen.slice(editIndex, editIndex + 300);
  assert.ok(editBody.includes("await editTaskReflection(editingId, editDraft);"));
  assert.ok(editBody.includes("reload();"));

  const deleteIndex = historyScreen.indexOf("onPress: async () => {");
  const deleteBody = historyScreen.slice(deleteIndex, deleteIndex + 200);
  assert.ok(deleteBody.includes("await deleteTaskReflection(reflection.id);"));
  assert.ok(deleteBody.includes("reload();"));
});

test("deleting asks for confirmation first -- a destructive action is never one tap away", () => {
  assert.ok(historyScreen.includes("Alert.alert(\"מחיקת רפלקציה\""));
});

// --- Sanity: the two reflection routes stay distinct ---

test("the short post-task reflection route and the reflection-history route are two separate screens/files, never the same one reused for both purposes", () => {
  assert.ok(reflectRoute.includes("SessionReflectionScreen"));
  assert.ok(historyRoute.includes("TaskReflectionHistoryScreen"));
});
