import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/positiveMemoryScreens.test.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, Stage B
 * (manual documentation UI): source-text regression guard for the
 * entry/type-select flow, the shared wizard, and the list/detail
 * screens. No React Native component test renderer exists in this
 * codebase, so this checks the real source text, same convention as
 * every other screen test.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const entry = readSource("build/PositiveMemoryEntryScreen.tsx");
const wizard = readSource("build/PositiveMemoryWizardScreen.tsx");
const list = readSource("build/PositiveMemoryListScreen.tsx");
const detail = readSource("build/PositiveMemoryDetailScreen.tsx");
const layout = readSource("app/_layout.tsx");

test("every new route is registered", () => {
  assert.ok(layout.includes('name="positive-memories/index"'));
  assert.ok(layout.includes('name="positive-memories/new"'));
  assert.ok(layout.includes('name="positive-memories/[id]"'));
  assert.ok(layout.includes('name="positive-memories/draft/[draftId]"'));
});

test("section 4: the first question offers exactly the two required options, and both create a fresh draft rather than a finalized memory", () => {
  assert.ok(entry.includes("איזה סוג אירוע תרצה לתעד?"));
  assert.ok(entry.includes("הצלחה -- הצלחתי לבצע פעולה"));
  assert.ok(entry.includes("אירוע של תחושה חיובית"));
  assert.ok(entry.includes('startNewDraft("success")'));
  assert.ok(entry.includes('startNewDraft("positive_feeling")'));
  assert.ok(entry.includes("await upsertPositiveMemoryDraftEntry(draft);"));
});

test("section 7: an existing unfinished draft is offered as 'המשך תיעוד קודם' before the type-select question, and 'התחל תיעוד חדש' never overwrites it", () => {
  assert.ok(entry.includes("יש לך תיעוד לא גמור"));
  assert.ok(entry.includes("התחל תיעוד חדש"));
  assert.ok(entry.includes("setShowTypeSelect(true)"));
  assert.ok(!entry.includes("deletePositiveMemoryDraft"), "opening the type-select question must never itself delete the still-unfinished draft it is offering to resume");
});

test("section 14: returnToTaskId is stored on the new draft's own taskId, preserving the quick-capture context", () => {
  assert.ok(entry.includes("createPositiveMemoryDraft(generatePositiveMemoryDraftId(), eventType, firstStep, now, returnToTaskId)"));
});

test("the wizard defines the exact step order from sections 5 and 6, branching only on eventType", () => {
  assert.ok(wizard.includes('const SUCCESS_STEPS = ["task_link", "what_succeeded", "feeling_moment", "feeling_select", "when_where", "what_special", "review"];'));
  assert.ok(wizard.includes('const FEELING_STEPS = ["feeling_select", "what_happened", "feeling_moment", "when_where", "what_special", "review"];'));
});

test("section 5's exact questions appear verbatim", () => {
  assert.ok(wizard.includes("לאיזו משימה ההצלחה קשורה?"));
  assert.ok(wizard.includes("במה הצלחתי?"));
  assert.ok(wizard.includes("באיזה חלק מהפעולה הרגשת תחושה חיובית?"));
  assert.ok(wizard.includes("איפה ומתי זה קרה?"));
  assert.ok(wizard.includes("מה היה מיוחד בחלק הזה?"));
  assert.ok(wizard.includes("שמור הצלחה"));
});

test("section 6's exact questions appear verbatim, including the per-feeling moment prompt", () => {
  assert.ok(wizard.includes("איזו תחושה חיובית"));
  assert.ok(wizard.includes("מה קרה באירוע?"));
  assert.ok(wizard.includes("באיזה רגע הרגשת את התחושה הזאת?"));
});

test("section 5 Q3 ('do not force the user to select a positive feeling they did not experience') offers an explicit skip, only for the success flow", () => {
  assert.ok(wizard.includes("לא הרגשתי תחושה חיובית מסוימת"));
  assert.ok(wizard.includes("allowSkip={draft.eventType === \"success\"}"));
});

test("section 4: switching event type mid-flow goes through the shared setter, never a hand-rolled field reset", () => {
  assert.ok(wizard.includes("setPositiveMemoryDraftEventType(draft, nextType, new Date().toISOString())"));
});

test("section 7: every field change schedules a debounced save, and every step transition flushes immediately; leaving the screen also flushes", () => {
  assert.ok(wizard.includes("const AUTO_SAVE_DEBOUNCE_MS = 600;"));
  const persistFn = wizard.slice(wizard.indexOf("function persist("), wizard.indexOf("function persist(") + 500);
  assert.ok(persistFn.includes("setTimeout"));
  assert.ok(wizard.includes("if (draftRef.current) upsertPositiveMemoryDraftEntry(draftRef.current);"), "unmounting (navigating away/backgrounding) must flush the latest draft state");
});

test("section 7: discarding a draft is a distinct, explicit action -- never triggered by merely navigating away", () => {
  assert.ok(wizard.includes("async function discardDraft()"));
  assert.ok(wizard.includes("מחיקת הטיוטה"));
});

test("section 12: saving finalizes the draft into a real memory via the ONE shared finalize function, then returns to the preserved task context when there is one", () => {
  const saveFn = wizard.slice(wizard.indexOf("async function save()"), wizard.indexOf("async function save()") + 700);
  assert.ok(saveFn.includes("await finalizePositiveMemoryDraftEntry(draft, generatePositiveMemoryId(), now)"));
  assert.ok(saveFn.includes('router.replace({ pathname: "/tasks/[id]", params: { id: draft.taskId } });'));
});

test("section 2: the list screen shows only finalized memories and offers the quick-capture entry point", () => {
  assert.ok(list.includes("loadPositiveMemories()"));
  assert.ok(list.includes("➕ הוסף אירוע חיובי"));
  assert.ok(list.includes('router.push("/positive-memories/new")'));
});

test("section 2: the detail screen supports editing, changing the linked task/feelings, and deleting -- all through the shared pure setters", () => {
  assert.ok(detail.includes("updatePositiveMemory(memory,"));
  assert.ok(detail.includes("setPositiveMemoryFeelings(memory,"));
  assert.ok(detail.includes("async function handleDelete()"));
  assert.ok(detail.includes("await deletePositiveMemoryEntry(memory.id);"));
});
