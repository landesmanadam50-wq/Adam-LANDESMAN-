import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/timePlanningModal.test.ts
 *
 * Smart To-Do List task, section 4: source-text regression guard for
 * build/TimePlanningModal.tsx (the "תכנון זמן" popup -- never a new
 * planning screen) and its wiring into build/FlexibleDailyScreen.tsx.
 * The pure To-Do ordering/reorder/resort/suggestion logic is covered
 * directly in arc/todoList.test.ts; this file only checks the popup's
 * two-tab structure, that it reuses the SAME existing mutation paths
 * (never a parallel persistence mechanism), and that FlexibleDailyScreen
 * wires its own already-held scheduled/todoEntries state into it rather
 * than letting the modal recompute either derivation itself.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const modal = readSource("build/TimePlanningModal.tsx");
const screen = readSource("build/FlexibleDailyScreen.tsx");

test("the popup offers exactly the two required tabs: To-Do List and משימות מתוזמנות", () => {
  assert.ok(modal.includes('<Text style={styles.tabChipText}>To-Do List</Text>') || modal.includes("To-Do List"));
  assert.ok(modal.includes("משימות מתוזמנות"));
  assert.ok(modal.includes('useState<"todo" | "scheduled">("todo")'));
});

test("required test 4: each To-Do row shows a clear ordinal number, computed from resolveEffectiveTodoOrder's own output -- never the raw unsorted list", () => {
  assert.ok(modal.includes("import { resolveEffectiveTodoOrder, reorderTodoEntry, resolveResortByRating } from \"../arc/todoList.ts\";"));
  assert.ok(modal.includes("const orderedTodoEntries = resolveEffectiveTodoOrder(todoEntries);"));
  assert.ok(modal.includes("orderedTodoEntries.map((entry, position)"));
  assert.ok(modal.includes("{position + 1}."));
});

test("urgency/importance sort before importance/urgency never combine into one score -- the sort itself lives in arc/todoList.ts's compareTodoPriority, never duplicated here", () => {
  assert.ok(!modal.includes("todoUrgency + todoImportance"), "the modal must never combine urgency+importance into a single score");
  assert.ok(!modal.includes("todoUrgency * "), "the modal must never weight urgency into a combined score");
});

test("manual reorder (▲/▼) persists via reorderTodoEntry + upsertTask's own todoOrder field -- never a separate override record", () => {
  const fnIndex = modal.indexOf("async function handleReorderTodo");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("reorderTodoEntry(todoEntries, taskId, direction)"));
  assert.ok(fnBody.includes("upsertTask({ ...task, todoOrder: result.todoOrder })"));
});

test("required test 3 (re-sync by rating): the 'סדר מחדש לפי דירוג' button calls resolveResortByRating and clears todoOrder back to null for every entry, never deleting/recreating a task", () => {
  assert.ok(modal.includes("סדר מחדש לפי דירוג"));
  const fnIndex = modal.indexOf("async function handleResortByRating");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("resolveResortByRating(todoEntries)"));
  assert.ok(fnBody.includes("upsertTask({ ...task, todoOrder: null })"));
});

test("inline urgency/importance editing persists immediately via plain upsertTask on the SAME task -- not a batched draft", () => {
  const fnIndex = modal.indexOf("async function handleSetTodoRating");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("upsertTask({ ...task, [field]: value })"));
});

test("deleting a To-Do item goes through the SAME deleteTask (never a soft-remove-only path) and reconciles alarms, matching the screen's own existing handleRemoveForToday convention", () => {
  const fnIndex = modal.indexOf("async function handleDeleteTodo");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("await deleteTask(taskId);"));
  assert.ok(fnBody.includes("await reconcileTaskAlarms();"));
});

test("the inline add-form creates a real one-off isTodoItem Task for THIS date via createEmptyTask + upsertTask -- never a second, parallel To-Do entity", () => {
  const fnIndex = modal.indexOf("async function handleAddTodo");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("createEmptyTask(generateTaskId(), title, title, now)"));
  assert.ok(fnBody.includes("isTodoItem: true, scheduledDate: dateLocal"));
  assert.ok(fnBody.includes("await upsertTask(task);"));
});

test("Tab 2 (scheduled) renders from the `scheduled` PROP directly -- the modal never recomputes resolveDailyPlan/applyScheduleMode itself, avoiding a second competing derivation of the same plan", () => {
  assert.ok(!modal.includes("resolveDailyPlan("), "TimePlanningModal must never call resolveDailyPlan itself");
  assert.ok(!modal.includes("applyScheduleMode("), "TimePlanningModal must never call applyScheduleMode itself");
  assert.ok(modal.includes("{scheduled.map((entry) => {"));
});

test("a scheduled-task edit uses the EXACT same mutation path FlexibleDailyScreen's own editing already relies on: buildTaskOccurrenceOverride+upsertTaskOccurrenceOverrideEntry for a weekly-origin entry, plain upsertTask for a oneoff one -- zero new persistence logic", () => {
  const fnIndex = modal.indexOf("async function handleSaveScheduledRow");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('entry.origin === "weekly"'));
  assert.ok(fnBody.includes("buildTaskOccurrenceOverride(entry.task, entry.occurrenceDateLocal, existingOverride, { scheduledTime, expectedDurationMinutes, timeIsManual: true }, now)"));
  assert.ok(fnBody.includes("upsertTaskOccurrenceOverrideEntry("));
  assert.ok(fnBody.includes("await upsertTask({ ...task, scheduledTime, expectedDurationMinutes });"));
});

test("a scheduled-task edit made here is scoped to THIS ONE DATE -- it is the same per-occurrence override record every other edit on this screen already writes, never a change to the Fixed Weekly Routine template", () => {
  const fnIndex = modal.indexOf("async function handleSaveScheduledRow");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("entry.occurrenceDateLocal"));
});

test("every row action calls onChanged() immediately (so the parent re-derives scheduled/todoEntries and this modal re-renders from fresh props) -- the modal itself never holds its own stale local copy of either list", () => {
  assert.ok(!modal.includes("useState<ScheduledPlanEntry"), "the modal must not keep its own local copy of the scheduled list");
  assert.ok(!modal.includes("useState<TodoPlanEntry"), "the modal must not keep its own local copy of the todo list");
  const onChangedCalls = modal.match(/onChanged\(\);/g) ?? [];
  assert.ok(onChangedCalls.length >= 7, "every mutating handler should call onChanged()");
});

test("FlexibleDailyScreen imports resolveTodoList and holds its own todoEntries state, computed in reload() from the SAME tasks it already loaded -- one source, passed down as a prop, never recomputed inside the modal", () => {
  assert.match(screen, /import\s*\{\s*resolveTodoList\s*\}\s*from\s*["']\.\.\/arc\/todoList\.ts["']/);
  assert.ok(screen.includes("const [todoEntries, setTodoEntries] = useState<TodoPlanEntry[]>([]);"));
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 2000);
  assert.ok(reloadBody.includes("setTodoEntries(resolveTodoList(tasks, dateLocal));"));
});

test("the popup opens from the SAME pre-existing '⏱️ תכנון הזמן שלי' time-planning card, right beside its own pre-existing timer-start button -- 'התחל תכנון' is never removed", () => {
  const cardIndex = screen.indexOf("⏱️ תכנון הזמן שלי");
  assert.ok(cardIndex >= 0);
  const cardBody = screen.slice(cardIndex, cardIndex + 1600);
  assert.ok(cardBody.includes("התחל תכנון"));
  assert.ok(cardBody.includes("onPress={handleStartTimePlanning}"));
  assert.ok(cardBody.includes("onPress={() => setTimePlanningModalVisible(true)}"));
});

test("TimePlanningModal is rendered with the screen's own scheduled/todoEntries state, and closing it reloads so the main list reflects any Tab 2 edit right away", () => {
  const renderIndex = screen.indexOf("<TimePlanningModal");
  assert.ok(renderIndex >= 0);
  const renderBody = screen.slice(renderIndex, screen.indexOf("/>", renderIndex));
  assert.ok(renderBody.includes("scheduled={scheduled}"));
  assert.ok(renderBody.includes("todoEntries={todoEntries}"));
  assert.ok(renderBody.includes("onChanged={reload}"));
  assert.ok(renderBody.includes("setTimePlanningModalVisible(false);"));
  assert.ok(renderBody.includes("reload();"));
});

test("required: a clear '+ הוסף משימה מתוזמנת' button is rendered in the 'משימות מתוזמנות' tab, unconditionally -- it shows even when scheduled.length === 0, since it sits above the empty-state hint and the list, never inside either", () => {
  assert.ok(modal.includes("+ הוסף משימה מתוזמנת"));
  const tabBodyStart = modal.indexOf(") : (");
  const addButtonIndex = modal.indexOf("styles.addScheduledButton", tabBodyStart);
  const hintIndex = modal.indexOf("אין משימות מתוזמנות לתאריך הזה", tabBodyStart);
  assert.ok(addButtonIndex !== -1 && hintIndex !== -1 && addButtonIndex < hintIndex, "the add button must render BEFORE the empty-state hint, so it is never conditioned on scheduled.length");
});

test("required: the add button opens the SAME full task editor (/tasks/[id]/edit, id=\"new\") the pre-existing '+ משימה' quick action on FlexibleDailyScreen already uses for this date -- never a second, cut-down creation form inside the modal", () => {
  const fnIndex = modal.indexOf("function handleAddScheduledTask()");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: "new", scheduledDate: dateLocal } });'));
});

test("required: adding a scheduled task never closes the modal itself -- onClose/setTimePlanningModalVisible is never called from the add handler, so the SAME modal (still open, re-fed by the parent's own reload on refocus) shows the new task immediately on return, with no extra tap to reopen anything", () => {
  const fnIndex = modal.indexOf("function handleAddScheduledTask()");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes("onClose"));
});

test("required test 5 (remove a scheduled task): a weekly-origin entry is marked removed for THIS ONE DATE ONLY via markTaskOccurrenceRemoved (never touching the Fixed Weekly Routine template), while a oneoff entry is deleted outright -- the exact same remove primitive FlexibleDailyScreen's own handleRemoveForToday already uses", () => {
  assert.ok(modal.includes('import { buildTaskOccurrenceOverride, findTaskOccurrenceOverride, markTaskOccurrenceRemoved } from "../arc/taskOccurrenceOverride.ts";'));
  const fnIndex = modal.indexOf("async function handleRemoveScheduled(");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('entry.origin === "weekly"'));
  assert.ok(fnBody.includes("markTaskOccurrenceRemoved(entry.task, entry.occurrenceDateLocal, overrides, new Date().toISOString())"));
  assert.ok(fnBody.includes("await deleteTask(entry.task.id);"));
  assert.ok(fnBody.includes("await reconcileTaskAlarms();"));
  assert.ok(fnBody.includes("onChanged();"));
});

test("removing a scheduled task is confirmed first, with wording that makes the weekly-vs-oneoff distinction explicit to the trainee", () => {
  const fnIndex = modal.indexOf("function confirmRemoveScheduled(");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('"המשימה תוסר מהיום הזה בלבד -- השבוע הקבוע לא ישתנה."'));
  assert.ok(fnBody.includes('"המשימה תימחק."'));
  assert.ok(fnBody.includes('Alert.alert("הסרת משימה"'));
});

test("every scheduled row offers both שמור (save the inline time/duration edit) and הסר (remove), so the tab is a complete add/edit/remove surface for scheduled tasks, not just an editor for tasks that already exist", () => {
  const scheduledMapIndex = modal.indexOf("{scheduled.map((entry) => {");
  const rowBody = modal.slice(scheduledMapIndex, modal.indexOf("})}", scheduledMapIndex));
  assert.ok(rowBody.includes("onPress={() => handleSaveScheduledRow(entry)}"));
  assert.ok(rowBody.includes("onPress={() => confirmRemoveScheduled(entry)}"));
});

test("required (To-Do Bank task): the To-Do tab offers a '+ הוסף מהמאגר' button that places a bank item onto THIS date as an ordinary To-Do Task plus a pure todoBankItemId back-reference -- never urgency/importance/duration copied from or written back onto the bank item itself", () => {
  assert.ok(modal.includes('import { listActiveTodoBankItems } from "../arc/todoBank.ts";'));
  assert.ok(modal.includes('onPress={() => setShowBankPicker((shown) => !shown)}'));
  assert.ok(modal.includes("+ הוסף מהמאגר"));
  const fnIndex = modal.indexOf("async function handleAddFromBank(");
  const fnBody = modal.slice(fnIndex, modal.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("isTodoItem: true, scheduledDate: dateLocal, todoBankItemId: bankItem.id"));
  assert.ok(fnBody.includes("await upsertTask(task);"));
  assert.ok(!fnBody.includes("todoUrgency"), "a fresh placement never copies/sets urgency from the bank item -- it keeps the default, same as any other new to-do");
});

test("required (To-Do Bank task): the bank picker lists only ACTIVE (non-archived) bank items, via listActiveTodoBankItems -- never the raw unfiltered list", () => {
  assert.ok(modal.includes("listActiveTodoBankItems(bankItems).map((bankItem) =>"));
});
