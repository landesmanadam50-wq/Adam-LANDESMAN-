import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/flexibleDailyScreen.test.ts
 *
 * Flexible Daily Routine task: source-text regression guard for
 * build/FlexibleDailyScreen.tsx -- the plan resolution itself is
 * covered directly by arc/dailyPlan.test.ts; this file only checks the
 * screen wires that pure module, the per-date override writes, and the
 * shared task editor/execution engine correctly.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/FlexibleDailyScreen.tsx");
// ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
// task, section 5: the mood check-in bar moved from this screen's own
// former inline block into the shared FeelingCube component -- this
// screen now mounts <TaskCube/><FeelingCube/> in its place.
const feelingCubeComponent = readSource("live/components/HomeCubes.tsx");
const layout = readSource("app/_layout.tsx");

test("the routine-day route is registered and the route file renders FlexibleDailyScreen", () => {
  assert.match(layout, /<Stack\.Screen name="routine-day"/);
  const route = readSource("app/routine-day.tsx");
  assert.ok(route.includes("FlexibleDailyScreen"));
});

// Weekly & Daily Routine Redesign task: the screen now resolves ANY
// given date (defaulting to today only when no `date` prop is passed
// at all, preserving the route's own pre-existing behavior), and runs
// the result through applyScheduleMode -- never resolveDailyPlan's raw
// output directly.
test("resolves the GIVEN date's plan via resolveDailyPlan, reading tasks/overrides/completions/schedule-mode settings together, then applies the effective continuous/spaced schedule", () => {
  const fnIndex = screen.indexOf("const reload = useCallback");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (1600 -> 1900) to fit the new active-triggers load this reload() grew.
  const fnBody = screen.slice(fnIndex, fnIndex + 1900);
  assert.ok(fnBody.includes("resolveDailyPlan(tasks, overrides, completions, dateLocal, dateObj)"));
  assert.ok(fnBody.includes("applyScheduleMode(plan, effectiveMode)"));
  assert.ok(fnBody.includes("resolveEffectiveScheduleMode(weekday, dateLocal, weekdaySettings, dateModeOverrides)"));
});

test("defaults to today's own local date when no `date` prop is passed at all -- preserving this route's own pre-existing behavior", () => {
  const defIndex = screen.indexOf("export default function FlexibleDailyScreen(");
  const defLine = screen.slice(defIndex, defIndex + 200);
  assert.match(defLine, /date\s*=\s*null/);
  assert.ok(screen.includes("isValidCalendarDateString(date) ? date : todayLocalDateString(new Date())"));
});

// --- Open Today's Schedule Automatically task ---

test("required test: app/index.tsx (Home) renders FlexibleDailyScreen with no `date` prop at all -- so it's always 'today', in 'today mode', never a fixed date", () => {
  const home = readSource("app/index.tsx");
  assert.match(home, /import FlexibleDailyScreen from ["']\.\.\/build\/FlexibleDailyScreen\.tsx["']/);
  assert.ok(home.includes("<FlexibleDailyScreen />"));
});

test("required test: `isTodayMode` is true only when no `date` prop is passed, never for a fixed-date instance opened from the Weekly screen", () => {
  const defIndex = screen.indexOf("export default function FlexibleDailyScreen(");
  const bodyStart = screen.slice(defIndex, defIndex + 300);
  assert.match(bodyStart, /const isTodayMode = date === null;/);
});

test("required test: in today mode, `dateLocal` is re-resolved to the device's own local 'today' on every focus (covers returning from Task LIVE/other screens)", () => {
  const focusIndex = screen.indexOf("useFocusEffect(");
  const focusBody = screen.slice(focusIndex, focusIndex + 250);
  assert.ok(focusBody.includes("resolveTodayIfNeeded();"));
  assert.ok(focusBody.includes("reload();"));
  const resolveIndex = screen.indexOf("const resolveTodayIfNeeded = useCallback(");
  const resolveBody = screen.slice(resolveIndex, resolveIndex + 300);
  assert.ok(resolveBody.includes("if (!isTodayMode) return;"));
  assert.ok(resolveBody.includes("todayLocalDateString(new Date())"));
  assert.ok(resolveBody.includes("setDateLocal((prev) => (prev === current ? prev : current));"));
});

test("required test: in today mode, 'today' is ALSO re-resolved on every AppState 'active' transition -- covers midnight passing while the app sat backgrounded, which a focus event alone never catches since Home's own navigation focus never changes on an OS resume", () => {
  assert.match(screen, /import \{[^}]*\bAppState\b[^}]*\} from "react-native";/);
  const effectIndex = screen.indexOf('AppState.addEventListener("change"');
  assert.ok(effectIndex >= 0);
  const effectBody = screen.slice(screen.lastIndexOf("useEffect(", effectIndex), effectIndex + 250);
  assert.ok(effectBody.includes("if (!isTodayMode) return;"));
  assert.ok(effectBody.includes('if (state === "active") resolveTodayIfNeeded();'));
});

test("required test: a FIXED-date instance (date prop given) never re-resolves to today and never subscribes to AppState at all -- its own date stays permanent for its lifetime on the stack", () => {
  // resolveTodayIfNeeded's own very first line is the guard (already
  // asserted above); this test confirms the AppState subscription
  // effect is gated behind the exact SAME isTodayMode flag, so a
  // fixed-date screen (e.g. opened from the Weekly screen for one
  // specific date) never even registers the listener.
  const effectIndex = screen.indexOf('useEffect(() => {\n    if (!isTodayMode) return;\n    const subscription = AppState.addEventListener');
  assert.ok(effectIndex >= 0, "the AppState effect must bail out immediately in fixed-date mode, before ever calling AppState.addEventListener");
});

test("required test: resolving 'today' never writes or clears any per-date override -- it only ever updates local component state (dateLocal), then re-reads existing data through the ordinary reload() path", () => {
  const resolveIndex = screen.indexOf("const resolveTodayIfNeeded = useCallback(");
  const resolveBody = screen.slice(resolveIndex, resolveIndex + 300);
  assert.ok(!resolveBody.includes("upsertTaskOccurrenceOverrideEntry"));
  assert.ok(!resolveBody.includes("markTaskOccurrenceRemoved"));
});

// Weekly & Daily Routine Redesign task, section 8: a flexible
// (auto-scheduled) weekly-origin entry's own computed time is written
// back as a per-date override (timeIsManual=false) and alarms are
// reconciled immediately after, so Task LIVE/alarms honor it with zero
// changes to the alarm engine itself.
test("writes back every flexible weekly-origin entry's own computed effective time via resolveAutoScheduleWriteBacks, with timeIsManual=false, and reconciles alarms afterward", () => {
  const fnIndex = screen.indexOf("const reload = useCallback");
  const fnBody = screen.slice(fnIndex, fnIndex + 2600);
  assert.ok(fnBody.includes("resolveAutoScheduleWriteBacks(computed)"));
  assert.ok(fnBody.includes("timeIsManual: false"));
  assert.ok(fnBody.includes("reconcileTaskAlarms()"));
});

test("'+ משימה' opens the shared task editor directly, prefilled with THIS date (never a second creation form); '+ הפסקה'/'+ ARC' create a calendarEntryKind task scheduled for this date WITHOUT navigating anywhere -- neither is auto-started just by being added", () => {
  const fnIndex = screen.indexOf('async function handleAddDirect(');
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes('params: { id: "new", scheduledDate: dateLocal }'));
  assert.ok(fnBody.includes("calendarEntryKind: kind"));
  assert.ok(fnBody.includes("scheduledDate: dateLocal"));
  assert.ok(fnBody.includes("await upsertTask(task);"));
  // The break/ARC branch must never itself navigate to the live/arc screen -- only adds data.
  const breakArcBranch = fnBody.slice(fnBody.indexOf("const task = {"));
  assert.ok(!breakArcBranch.includes("router.push"), "adding a break/ARC entry must never auto-navigate into it");
});

test("'+ משימה' prefills the task editor's own new-task draft via initialScheduledDate, so a task added from a specific date starts correctly scheduled there", () => {
  const editorScreen = readSource("build/TaskEditorScreen.tsx");
  assert.match(editorScreen, /initialScheduledDate\s*=\s*null/);
  assert.ok(editorScreen.includes("isNew ? { ...createEmptyTaskDraft()"));
  assert.ok(editorScreen.includes("initialScheduledDate ? { scheduledDate: initialScheduledDate }"));
  const editRoute = readSource("app/tasks/[id]/edit.tsx");
  assert.ok(editRoute.includes("scheduledDate"));
  assert.ok(editRoute.includes("initialScheduledDate={scheduledDate ?? null}"));
});

// Required test 3 ("replace existing tasks"): remove-then-add, reusing
// both existing primitives rather than a third, competing mechanism.
test("'replace' removes this date's occurrence then opens the task editor to create its replacement for the exact same date, after an explicit confirmation", () => {
  const fnIndex = screen.indexOf("function confirmReplace(");
  assert.ok(fnIndex >= 0, "a dedicated replace action must exist");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("Alert.alert("));
  assert.ok(fnBody.includes("await handleRemoveForToday(entry);"));
  assert.ok(fnBody.includes('params: { id: "new", scheduledDate: dateLocal }'));
});

// Section 4's own "override for a specific date without changing the
// permanent weekday setting."
test("the per-date continuous/spaced control writes a DailyScheduleModeOverride (never the permanent per-weekday settings) and reconciles alarms afterward", () => {
  const fnIndex = screen.indexOf("async function handleSetDateMode(");
  assert.ok(fnIndex >= 0);
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("upsertDailyScheduleModeOverrideEntry("));
  assert.ok(fnBody.includes("occurrenceDateLocal: dateLocal"));
  assert.ok(fnBody.includes("reconcileTaskAlarms()"));
  assert.ok(!fnBody.includes("saveWeeklyScheduleModeSettings"), "a date-specific override must never write to the permanent weekday settings");
});

// Section 4's own "detect and handle conflicts with fixed appointments."
test("a conflicting entry shows a visible conflict badge, keyed off applyScheduleMode's own hasConflict flag", () => {
  assert.ok(screen.includes("entry.hasConflict && <Text style={styles.badgeConflict}>"));
});

test("effective (computed) start times are shown, not the raw stored scheduledTime -- so a flexible entry's real, auto-scheduled position is what the trainee actually sees", () => {
  assert.ok(screen.includes("entry.effectiveStartTime && <Text style={styles.entryMeta}>{entry.effectiveStartTime}</Text>"));
});

// Section 7's own "Pressing Back returns to the same weekly calendar."
test("'back to week' prefers router.back() (preserving the Weekly screen's own already-navigated-to week) over a fresh push that would reset it to the current week", () => {
  const fnIndex = screen.indexOf("function handleBackToWeek()");
  assert.ok(fnIndex >= 0);
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("router.canGoBack()"));
  assert.ok(fnBody.includes("router.back()"));
  assert.ok(fnBody.includes('router.push("/routine-week")'), "a fallback for when there is nothing to go back to must still exist");
});

test("removing a weekly-origin entry writes a per-date override (markTaskOccurrenceRemoved) and never touches the Task record; removing a one-off entry deletes the Task itself", () => {
  const fnIndex = screen.indexOf("async function handleRemoveForToday(");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('if (entry.origin === "weekly") {'));
  assert.ok(fnBody.includes("markTaskOccurrenceRemoved(entry.task, entry.occurrenceDateLocal, overrides, new Date().toISOString())"));
  assert.ok(fnBody.includes("upsertTaskOccurrenceOverrideEntry("));
  assert.ok(fnBody.includes("await deleteTask(entry.task.id);"));
});

test("removal always asks for confirmation first, and tells the trainee a weekly-origin removal is scoped to today only", () => {
  const fnIndex = screen.indexOf("function confirmRemove(");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("Alert.alert("));
  assert.ok(fnBody.includes("השבוע הקבוע לא ישתנה"));
});

test("editing a weekly-origin entry passes occurrenceDate through to the shared editor (per-date override mode); editing a one-off entry does not", () => {
  const fnIndex = screen.indexOf("function handleEdit(");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("params: { id: entry.task.id, occurrenceDate: entry.occurrenceDateLocal }"));
  assert.ok(fnBody.includes("params: { id: entry.task.id }"));
});

test("starting an ARC calendar entry navigates straight to /tasks/[id]/arc; starting any other entry goes through the normal task-detail/autoStart path -- ARC is never entered just because the entry exists, only on an explicit tap", () => {
  const fnIndex = screen.indexOf("function handleStart(");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes('if (entry.task.calendarEntryKind === "arc") {'));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/arc", params: { id: entry.task.id } });'));
  assert.ok(fnBody.includes('params: { id: entry.task.id, autoStart: "1" }'));
});

test("each entry visually distinguishes inherited-unmodified, modified-for-today, and added-today origins (calendar design requirement 5)", () => {
  assert.ok(screen.includes("badgeInherited"));
  assert.ok(screen.includes("badgeModified"));
  assert.ok(screen.includes("badgeAdded"));
  assert.ok(screen.includes('entry.origin === "oneoff" && <Text style={styles.badgeAdded}>'));
  assert.ok(screen.includes("entry.origin === \"weekly\" && entry.isModifiedForToday && <Text style={styles.badgeModified}>"));
  assert.ok(screen.includes('entry.origin === "weekly" && !entry.isModifiedForToday && <Text style={styles.badgeInherited}>'));
});

test("includes PersistentTaskControls, the single shared ARC/start-task dispatcher every other task screen already uses", () => {
  assert.ok(screen.includes("<PersistentTaskControls"));
});

test("reordering today's plan uses reorderDailyPlanEntry, then persists a weekly-origin result as a per-date override (never the shared Task) and a one-off result directly onto its own Task", () => {
  const fnIndex = screen.indexOf("async function handleReorder(");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("reorderDailyPlanEntry(scheduled, taskId, direction)"));
  assert.ok(fnBody.includes('if (result.origin === "weekly") {'));
  assert.ok(fnBody.includes("buildTaskOccurrenceOverride(entry.task, entry.occurrenceDateLocal, existingOverride, { order: result.order }, now)"));
  assert.ok(fnBody.includes("upsertTask({ ...task, order: result.order })"));
});

test("reorder buttons are disabled at the top/bottom of the resolved (and schedule-mode-applied) plan", () => {
  assert.ok(screen.includes("disabled={position === 0}"));
  assert.ok(screen.includes("disabled={position === scheduled.length - 1}"));
});

// --- Unified Emotional Check-In and Task Postponement System, section 1 (ARCHI Home) ---

test("required test 1 (Home check-in options): the FeelingCube shows both remaining smileys, each routed through the SAME shared handleEmotionalCheckInChoice dispatcher used by the widget and the Postponement screen -- the 😄 smiley is deliberately absent here per the To-Do Bank/Cubes task, section 5", () => {
  assert.match(feelingCubeComponent, /import\s*\{[\s\S]*?handleEmotionalCheckInChoice[\s\S]*?\}\s*from\s*["']\.\.\/\.\.\/data\/emotionalCheckInRouting\.ts["']/);
  assert.ok(feelingCubeComponent.includes("איך ההרגשה?"));
  assert.ok(feelingCubeComponent.includes('onPress={() => handleEmotionalCheckInChoice("full_arc")}') && feelingCubeComponent.includes("😟") && feelingCubeComponent.includes("פחות טוב"));
  assert.ok(
    feelingCubeComponent.includes('onPress={() => handleEmotionalCheckInChoice("shortened_arc")}') && feelingCubeComponent.includes("🙂") && feelingCubeComponent.includes("סבבה")
  );
  assert.ok(!feelingCubeComponent.includes("😄"), "the 😄 smiley must never appear in this cube -- only on Task LIVE's own post-completion button");
});

test("the FeelingCube/TaskCube mount only in today mode (ARCHI Home itself) -- a fixed-date instance opened from the Weekly screen never shows them", () => {
  const checkInBlockIndex = screen.indexOf("{isTodayMode && (\n          <>\n            <TaskCube");
  assert.ok(checkInBlockIndex >= 0);
  const checkInBlock = screen.slice(checkInBlockIndex, checkInBlockIndex + 120);
  assert.ok(checkInBlock.includes("<FeelingCube />"));
});

test("the check-in bar never interrupts or pauses an active task/timer by itself -- it only ever navigates, same as every other button on this screen", () => {
  const fnIndex = screen.indexOf("function handleCheckIn(");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes("pauseTaskTimerRun"));
  assert.ok(!fnBody.includes("clearTaskTimerRun"));
});

// --- Nine Functional Improvements task, Improvement 2 ("Fix the
// Time-Planning Task and Add a Timer") ---
//
// arc/tasks.test.ts already covers ensureTimePlanningTaskInList's own
// find-or-create logic directly (real, executed tests); this file only
// checks that THIS screen wires it up the way the 5 user-stated
// checkpoints require, plus the "prevent duplicate active timers" rule.

test("checkpoint 1+2 (startable, configurable timer): handleStartTimePlanning ensures the reserved time-planning task (saving any edited duration first), then opens it with autoStart=1 -- the SAME start path every other task's own timer uses, never a second timer engine", () => {
  const fnIndex = screen.indexOf("async function handleStartTimePlanning(");
  assert.ok(fnIndex >= 0, "a dedicated start handler for the time-planning task must exist");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("ensureTimePlanningTaskInList(tasks, nowIso)"));
  assert.ok(fnBody.includes("await upsertTask(taskToSave);"));
  assert.ok(fnBody.includes('params: { id: TIME_PLANNING_TASK_ID, autoStart: "1" }'));
});

test("checkpoint 2 (configurable duration, saved for reuse): a positive, finite number typed into the duration draft overrides expectedDurationMinutes before the task is saved; an empty/invalid draft leaves the task's own existing duration untouched", () => {
  const fnIndex = screen.indexOf("async function handleStartTimePlanning(");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("timePlanningDurationDraft.trim() ? Number(timePlanningDurationDraft) : null"));
  assert.ok(fnBody.includes("Number.isFinite(parsedDuration) && parsedDuration > 0"));
  assert.ok(fnBody.includes("{ ...task, expectedDurationMinutes: parsedDuration, updatedAt: nowIso }"));
});

test("checkpoint 3 (daily planning reachable while the timer is active): this exact screen already renders PersistentTaskControls, whose own \"התחל משימה\" button returns to the currently active task -- no second return-to-active mechanism was added", () => {
  assert.ok(screen.includes("<PersistentTaskControls"));
  const controls = readSource("live/PersistentTaskControls.tsx");
  assert.ok(controls.includes("if (activeTaskId) {"));
});

test("checkpoint 4 (Pause/Resume/Finish) + checkpoint 5 (normal reflection/reward flow): the time-planning task is an ordinary 'standard'-kind task with no calendarEntryKind override, so live/ActiveTaskScreen.tsx's own existing controls and completion flow apply unchanged -- nothing new was built for either", () => {
  const tasksSource = readSource("arc/tasks.ts");
  const ensureIndex = tasksSource.indexOf("export function ensureTimePlanningTaskInList(");
  const ensureBody = tasksSource.slice(ensureIndex, ensureIndex + 900);
  assert.ok(!ensureBody.includes("calendarEntryKind:"), "must stay a plain standard task -- never the special arc/break calendar kinds ActiveTaskScreen bypasses the normal timer/reflection flow for");
  assert.ok(!ensureBody.includes('taskKind: "manifest"'), "must never be a Manifest-kind task -- those skip the work timer entirely");
});

test("checkpoint 6 (accurate timer progress while navigating): the started task's own single-slot TaskTimerRun is timestamp-based (arc/taskTimer.ts), never created or read a second time by this screen -- so leaving for the planning screen and returning preserves it exactly as every other task's timer already does", () => {
  assert.ok(!screen.includes("createTaskTimerRun"), "this screen must never create its own competing TaskTimerRun -- only live/ActiveTaskScreen.tsx's existing performStart does that, via autoStart=1");
});

test("checkpoint 10 (prevent duplicate active timers): before starting/creating anything, checks for an already-active (non-stale) TaskTimerRun and, if one exists -- this task's own or any other task's -- navigates back to IT instead of starting a second one", () => {
  const fnIndex = screen.indexOf("async function handleStartTimePlanning(");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("const activeRun = await loadTaskTimerRun();"));
  assert.ok(fnBody.includes("isTaskTimerRunStale(activeRun, now)"));
  assert.ok(fnBody.includes('if (activeRun && !isTaskTimerRunStale(activeRun, now)) {'));
  assert.ok(fnBody.includes('params: { id: activeRun.taskId }'));
  // The early return must come BEFORE anything that would create/save the time-planning task.
  const earlyReturnIndex = fnBody.indexOf("params: { id: activeRun.taskId }");
  const ensureIndex = fnBody.indexOf("ensureTimePlanningTaskInList");
  assert.ok(earlyReturnIndex < ensureIndex, "the duplicate-prevention check must run before the task is ensured/started");
});

test("a synchronous double-tap guard (startingTimePlanning) prevents the handler from running twice concurrently, and disables the button with a changed label while it is in flight", () => {
  const fnIndex = screen.indexOf("async function handleStartTimePlanning(");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("if (startingTimePlanning) return;"));
  assert.ok(fnBody.includes("setStartingTimePlanning(true);"));
  assert.ok(screen.includes('disabled={startingTimePlanning}'));
  assert.ok(screen.includes('{startingTimePlanning ? "פותח..." : "התחל תכנון"}'));
});

test("the time-planning card is visible on Home (today mode), additive to the existing check-in/Daily Visualization/ARC GYM cards, with an editable duration field", () => {
  const cardIndex = screen.indexOf("⏱️ תכנון הזמן שלי");
  assert.ok(cardIndex >= 0);
  const before = screen.slice(Math.max(0, cardIndex - 200), cardIndex);
  assert.ok(before.includes("isTodayMode"), "must be gated the same way the other Home-only cards are");
  assert.ok(screen.includes("value={timePlanningDurationDraft}"));
  assert.ok(screen.includes("onChangeText={setTimePlanningDurationDraft}"));
  const persistentIndex = screen.indexOf("<PersistentTaskControls");
  assert.ok(cardIndex < persistentIndex, "the card must sit alongside, not replace, the existing screen content below it");
});

// --- Unified ARC & Productivity Update task, requirement 9 ("CONTINUOUS
// TASK ROUTINES -- SMILES, NOT POINTS"): selecting consecutive scheduled
// tasks and grouping them as שגרה רצופה ---

test("reload() loads this exact date's own continuous-routine groups via loadContinuousRoutineGroupsForDate(dateLocal), alongside the existing plan-resolution reads", () => {
  const fnIndex = screen.indexOf("const reload = useCallback(async () => {");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (900 -> 1100) to fit the new active-triggers load this reload() grew.
  const fnBody = screen.slice(fnIndex, fnIndex + 1100);
  assert.ok(fnBody.includes("loadContinuousRoutineGroupsForDate(dateLocal)"));
  assert.ok(fnBody.includes("setContinuousGroups(groupsForDate);"));
});

test("handleConfirmContinuousGroup rejects a non-consecutive selection via isConsecutiveSelection, informing the trainee rather than silently grouping the wrong tasks", () => {
  const fnIndex = screen.indexOf("async function handleConfirmContinuousGroup()");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("isConsecutiveSelection(orderedTaskIds, selectedTaskIds)"));
  assert.ok(fnBody.includes("Alert.alert("), "must inform the trainee, never fail silently");
  assert.ok(fnBody.includes("return;"));
});

test("handleConfirmContinuousGroup stores the group in the SCHEDULE's own display order, never the order the trainee happened to tap the checkboxes in", () => {
  const fnIndex = screen.indexOf("async function handleConfirmContinuousGroup()");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("const orderedSelection = orderedTaskIds.filter((id) => selectedTaskIds.includes(id));"));
  assert.ok(fnBody.includes("saveNewContinuousRoutineGroup(orderedSelection, dateLocal, new Date())"));
});

test("confirmUngroup asks for confirmation before removing a group (a destructive-feeling action, even though the underlying tasks are untouched), and reloads afterward", () => {
  const fnIndex = screen.indexOf("function confirmUngroup(group: ContinuousRoutineGroup)");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("Alert.alert("));
  assert.ok(fnBody.includes("style: \"destructive\""));
  assert.ok(fnBody.includes("deleteContinuousRoutineGroup(group.id)"));
  assert.ok(fnBody.includes("reload();"));
});

test("the entry list shows a checkbox per task ONLY while selectingContinuousGroup is true, and tapping an entry toggles selection instead of starting the task in that mode", () => {
  const mapIndex = screen.indexOf("{wovenDaySections.map((item) => {");
  const mapBody = screen.slice(mapIndex, screen.indexOf("<Pressable style={styles.secondaryButton} onPress={handleBackToWeek}>"));
  assert.ok(mapBody.includes("selectingContinuousGroup && <Text style={styles.selectionCheckbox}>{isSelected ? \"☑\" : \"☐\"}</Text>"));
  assert.ok(mapBody.includes("onPress={() => (selectingContinuousGroup ? toggleTaskSelectedForGroup(entry.task.id) : handleStart(entry))}"));
});

test("a grouped entry shows the 'שגרה רצופה' badge and, outside selection mode, its own ungroup action -- both derived from continuousGroups, never a second source of truth", () => {
  const mapIndex = screen.indexOf("{wovenDaySections.map((item) => {");
  const mapBody = screen.slice(mapIndex, screen.indexOf("<Pressable style={styles.secondaryButton} onPress={handleBackToWeek}>"));
  assert.ok(mapBody.includes("const group = continuousGroups.find((candidate) => candidate.taskIds.includes(entry.task.id)) ?? null;"));
  assert.ok(mapBody.includes("{group && <Text style={styles.badgeContinuous}>שגרה רצופה</Text>}"));
  assert.ok(mapBody.includes("onPress={() => confirmUngroup(group)}"));
});

test("the group-confirm button is disabled until at least 2 tasks are selected -- a single task is never a valid continuous routine", () => {
  const barIndex = screen.indexOf("<View style={styles.continuousGroupBar}>");
  const barBody = screen.slice(barIndex, screen.indexOf("{scheduled.length === 0"));
  assert.ok(barBody.includes("selectedTaskIds.length < 2 && styles.buttonDisabled"));
  assert.ok(barBody.includes("disabled={selectedTaskIds.length < 2}"));
  assert.ok(barBody.includes("onPress={handleConfirmContinuousGroup}"));
});

test("cancelSelectingContinuousGroup clears the in-progress selection entirely -- leaving selection mode never silently keeps a stale partial pick around", () => {
  const fnIndex = screen.indexOf("function cancelSelectingContinuousGroup()");
  const fnBody = screen.slice(fnIndex, fnIndex + 150);
  assert.ok(fnBody.includes("setSelectedTaskIds([]);"));
  assert.ok(fnBody.includes("setSelectingContinuousGroup(false);"));
});

// --- ARCHI -- Unified Floating Overlay & Mini ARC Improvements task ---

test("task-name sync fix: reload() -- already re-run on every useFocusEffect AND on AppState 'active' via resolveTodayIfNeeded -- keeps the unified panel current in BOTH its idle and active states, via the single resyncFloatingOverlayToCurrentState helper (never a narrower, idle-only inline rebuild that would leave the overlay/notification/widget showing a stale task title whenever Home -- not Task LIVE -- is the screen that regains focus after a rename)", () => {
  const fnIndex = screen.indexOf("const reload = useCallback");
  const fnBody = screen.slice(fnIndex, screen.indexOf("}, [dateLocal, weekday, isTodayMode]);", fnIndex));
  assert.ok(fnBody.includes("if (isTodayMode) {"));
  assert.ok(fnBody.includes("await resyncFloatingOverlayToCurrentState();"));
  assert.ok(!fnBody.includes("if (!activeRun || isTaskTimerRunStale(activeRun, new Date())) {"), "must never re-introduce a narrower, idle-only inline resync inside reload() -- the single resyncFloatingOverlayToCurrentState helper is the only place that decides idle vs. active");
});

test("the idle panel's own next-task fields (title/effectiveStartTime/durationMinutes) come from resolveNextScheduledTaskDisplay -- the SAME 'what's next' pipeline the rest of the app already uses, never a second/duplicate resolution -- and are entirely omitted (null) when nothing is scheduled, never an invented empty task. This lives in resyncFloatingOverlayToCurrentState's own idle fallback -- the ONE place reload() and the activation-button toggle both now share it, never duplicated inline in either caller", () => {
  const fnIndex = screen.indexOf("async function resyncFloatingOverlayToCurrentState()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("const nextScheduled = await resolveNextScheduledTaskDisplay(null, new Date());"));
  assert.ok(fnBody.includes("title: nextScheduled.task.title,"));
  assert.ok(fnBody.includes("effectiveStartTime: nextScheduled.effectiveStartTime,"));
  assert.ok(fnBody.includes("durationMinutes: nextScheduled.task.expectedDurationMinutes,"));
  assert.ok(fnBody.includes("isOverdue: nextScheduled.isOverdue,"), "ARCHI -- Home-Screen Widget Sync task, section 4: the overdue flag must be threaded through here too, never dropped");
  assert.ok(fnBody.includes("? {") && fnBody.includes(": null"), "must be null, never an invented empty task, when nothing is scheduled");
});

test("reload is wired into useFocusEffect (every time Home regains focus) and resolveTodayIfNeeded is wired into the AppState 'active' listener -- reopening the app after backgrounding re-syncs the idle panel without needing a restart", () => {
  assert.ok(screen.includes("resolveTodayIfNeeded();\n      reload();"));
  assert.ok(screen.includes('if (state === "active") resolveTodayIfNeeded();'));
});

// --- ARCHI -- Two Additions to the Existing Floating Cube task, addition 1 ("Floating Cube Activation Button") ---

test("overlayActive is reloaded on every focus from the SAME FloatingTimerOverlayPreferences.enabled flag build/FloatingTimerSettingsScreen.tsx's own Switch reads/writes -- one shared source of truth, never a second independent 'is the overlay on' flag", () => {
  const fnIndex = screen.indexOf("const reload = useCallback");
  const fnBody = screen.slice(fnIndex, screen.indexOf("}, [dateLocal, weekday, isTodayMode]);", fnIndex));
  assert.ok(fnBody.includes("loadFloatingTimerOverlayPreferences(),"));
  assert.ok(fnBody.includes("setOverlayActive(overlayPreferences.enabled);"));
});

test("the activation button's label is the ONE place its on/off state is shown -- 'הפעל קובייה צפה' while inactive, 'הסתר קובייה צפה' while active, kept in sync with the real preference via overlayActive", () => {
  assert.ok(screen.includes('{overlayActive ? "הסתר קובייה צפה" : "הפעל קובייה צפה"}'));
});

test("activating checks the SYSTEM_ALERT_WINDOW permission first (hasFloatingOverlayPermissionAsync, the SAME check the Settings screen already performs) and, if missing, offers to open the SAME OS settings screen (requestFloatingOverlayPermissionAsync) rather than faking 'active' without it", () => {
  const fnIndex = screen.indexOf("async function handleToggleFloatingOverlay()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('Platform.OS === "android" && !(await hasFloatingOverlayPermissionAsync())'));
  assert.ok(fnBody.includes("requestFloatingOverlayPermissionAsync()"));
  assert.ok(fnBody.includes("return;"), "must return early without ever setting overlayActive true when permission is missing");
});

test("activating/hiding both only ever flip the SAME overlayEnabled preference the Settings screen shares (never a second flag), then resync the native overlay to the CURRENT state -- never hideFloatingTimerOverlay(), which would stop the whole foreground service/notification, not just the view", () => {
  const fnIndex = screen.indexOf("async function handleToggleFloatingOverlay()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("await saveFloatingTimerOverlayPreferences({ enabled: true });"));
  assert.ok(fnBody.includes("await saveFloatingTimerOverlayPreferences({ enabled: false });"));
  assert.ok(fnBody.includes("await resyncFloatingOverlayToCurrentState();"));
  assert.ok(!fnBody.includes("hideFloatingTimerOverlay"));
});

test("hiding the cube never touches the persisted TaskTimerRun -- 'hiding the cube must not stop the current task timer' is satisfied by handleToggleFloatingOverlay simply never reading/writing it at all", () => {
  const fnIndex = screen.indexOf("async function handleToggleFloatingOverlay()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  for (const forbidden of ["clearTaskTimerRun", "saveTaskTimerRun", "pauseTaskTimerRun", "stopTicking"]) {
    assert.ok(!fnBody.includes(forbidden), `handleToggleFloatingOverlay must never call ${forbidden}`);
  }
});

test("a toggle already in flight is ignored (togglingOverlay guard) -- rapid repeated taps can never race two overlapping activate/hide sequences against each other", () => {
  const fnIndex = screen.indexOf("async function handleToggleFloatingOverlay()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (togglingOverlay) return;"));
  assert.ok(fnBody.includes("setTogglingOverlay(true);"));
  assert.ok(fnBody.includes("setTogglingOverlay(false);"));
});

test("resyncFloatingOverlayToCurrentState reconstructs the ACTIVE task's own overlay payload (task + TaskStageProgress scoped to that exact task + the real next-scheduled-task) when a genuine, non-stale TaskTimerRun exists -- the exact same reconstruction live/ActiveTaskScreen.tsx's own reload() already does, never a second/approximate rebuild -- and falls back to the idle panel otherwise, never an invented active payload", () => {
  const fnIndex = screen.indexOf("async function resyncFloatingOverlayToCurrentState()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("const activeRun = await loadTaskTimerRun();"));
  assert.ok(fnBody.includes("if (activeRun && !isTaskTimerRunStale(activeRun, new Date())) {"));
  assert.ok(fnBody.includes("getTask(activeRun.taskId)"));
  assert.ok(fnBody.includes("loadTaskStageProgress(),"));
  assert.ok(fnBody.includes("stageProgress && stageProgress.taskId === activeRun.taskId ? stageProgress : null"));
  assert.ok(fnBody.includes("await showFloatingTimerOverlay("));
  assert.ok(fnBody.includes("await showIdleFloatingOverlayPanel("));
});

test("SyncFix2 (next-task desync bug): the ACTIVE branch's own 'next scheduled task' lookup threads the real, just-loaded activeRun through -- never a hardcoded null -- so a different task's stale leftover status==='active' field can never hijack this slot while this exact task is genuinely running", () => {
  const fnIndex = screen.indexOf("async function resyncFloatingOverlayToCurrentState()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("resolveNextScheduledTaskDisplay(activeRun.taskId, new Date(), activeRun),"));
});

test("prevents duplicate overlay instances: the activation button never calls any native 'add overlay' primitive directly -- it only ever goes through the SAME showFloatingTimerOverlay/showIdleFloatingOverlayPanel bridge functions every other screen uses, whose own native-side ensureOverlayAdded already refuses to add a second view while one exists", () => {
  const fnIndex = screen.indexOf("async function handleToggleFloatingOverlay()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes("new OverlayService") && !fnBody.includes("startForegroundService"));
});

// --- "אני רוצה שתהיה אפשרות להעביר את המשימה מה-To-Do ליסט ליום הגמיש בין המשימות הקבועות" ---

test("required: today's To-Do entries are woven into the main visible list via resolveWovenDaySections, imported from arc/todoList.ts -- never a second, independent merge computed inside this screen", () => {
  assert.match(screen, /import \{[^}]*\bresolveWovenDaySections\b[^}]*\} from "\.\.\/arc\/todoList\.ts";/);
  assert.ok(screen.includes("const wovenDaySections = resolveWovenDaySections(scheduled, todoEntries);"));
});

test("required: each woven To-Do row has its own direct start action (handleStartTodo), navigating straight to the task with autoStart=1 -- the SAME redirect every other To-Do start entry point (the cube, the planning modal) already uses, never a second/competing start path", () => {
  const fnIndex = screen.indexOf("function handleStartTodo(entry: TodoPlanEntry)");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]", params: { id: entry.task.id, autoStart: "1" } });'));

  const mapIndex = screen.indexOf("{wovenDaySections.map((item) => {");
  const mapBody = screen.slice(mapIndex, screen.indexOf("<Pressable style={styles.secondaryButton} onPress={handleBackToWeek}>"));
  assert.ok(mapBody.includes('if (item.kind === "todo") {'));
  assert.ok((mapBody.match(/onPress={\(\) => handleStartTodo\(todoEntry\)}/g) ?? []).length === 2, "both the row's main press area and its own explicit 'התחל' button call the same direct-start handler");
  assert.ok(mapBody.includes("<Text style={styles.entryActionText}>התחל</Text>"));
});

test("required: a to-do's position in scheduled's own up/down reorder arrows is looked up from scheduledIndexById -- the woven list's own running index is never reused as the scheduled-only position, which would desync ▲▼ disabled-state from the real scheduled array", () => {
  assert.ok(screen.includes("const scheduledIndexById = new Map(scheduled.map((entry, index) => [entry.task.id, index]));"));
  assert.ok(screen.includes("const position = scheduledIndexById.get(entry.task.id) ?? 0;"));
});

// --- "גרירה חופשית של השורה במסך" (free dragging) ---

test("required: only To-Do rows get a drag handle/PanResponder -- fixed/scheduled rows keep their own time-based position and ▲▼ reorder, completely untouched", () => {
  assert.ok(screen.includes("const dragResponder = createTodoDragResponder(taskId);"));
  assert.ok(screen.includes('<View {...dragResponder.panHandlers} style={styles.dragHandle}'));
  const scheduledBranchIndex = screen.indexOf("const entry = item.entry;\n          const position = scheduledIndexById.get(entry.task.id)");
  assert.ok(scheduledBranchIndex > 0);
  const scheduledBranchBody = screen.slice(scheduledBranchIndex, screen.indexOf("<Pressable style={styles.secondaryButton} onPress={handleBackToWeek}>"));
  assert.ok(!scheduledBranchBody.includes("dragResponder"), "a fixed/scheduled row must never get a drag handle");
});

test("required: the outer ScrollView is disabled for the duration of a drag (scrollEnabled={draggingTodoId === null}) -- the one real touch-conflict risk a free-floating drag over a ScrollView would otherwise have", () => {
  assert.ok(screen.includes('<ScrollView contentContainerStyle={styles.content} scrollEnabled={draggingTodoId === null}>'));
});

test("required: every row (fixed AND to-do) measures its own content-relative position via onLayout into rowLayoutsRef, so a to-do can be dropped relative to ANY row, not only other to-do rows", () => {
  assert.equal(
    (screen.match(/rowLayoutsRef\.current\.set\([^,]+, \{ y: event\.nativeEvent\.layout\.y, height: event\.nativeEvent\.layout\.height \}\)/g) ?? []).length,
    2,
    "both the to-do branch and the scheduled branch must record their own row's layout"
  );
});

test("required: handleTodoDragEnd computes the drop target from the CURRENT woven order and persists it as Task.todoPinnedAfterTaskId (falling back to TODO_PIN_START_OF_DAY when dropped above everything) -- never a silent client-only reorder that drops on the next reload", () => {
  const fnIndex = screen.indexOf("async function handleTodoDragEnd(taskId: string, dy: number)");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("const newPin = targetId ?? TODO_PIN_START_OF_DAY;"));
  assert.ok(fnBody.includes("await upsertTask({ ...todoEntry.task, todoPinnedAfterTaskId: newPin, updatedAt: new Date().toISOString() });"));
  assert.ok(fnBody.includes("reload();"));
});

test("required: a drag that ends back at the entry's own current spot (pin unchanged) is a deliberate no-op -- never an unnecessary write/reload on every tiny finger jitter", () => {
  const fnIndex = screen.indexOf("async function handleTodoDragEnd(taskId: string, dy: number)");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (todoEntry.task.todoPinnedAfterTaskId === newPin) return;"));
});
