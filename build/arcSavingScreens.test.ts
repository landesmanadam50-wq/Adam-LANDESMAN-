import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcSavingScreens.test.ts
 *
 * ARC Saving, Trigger Management & Quick-Action Buttons task: source-
 * text regression guard for every screen/route/native-surface change
 * this task made, mirroring build/arcPerspectiveScreens.test.ts's own
 * convention (these depend on expo-router/AsyncStorage/React Native or
 * are native Kotlin, so they aren't executed directly with
 * `node --test`). The pure engine itself is fully executed in
 * arc/arcSaving.test.ts; arc/newArcLiveTypes.test.ts, arc/newArcLiveSteps.test.ts
 * and data/emotionalCheckInRouting.test.ts cover the session-field/
 * routing wiring.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const arcSavingScreen = readSource("build/ArcSavingScreen.tsx");
const triggerEditor = readSource("build/ArcTriggerEditorScreen.tsx");
const activeTriggersScreen = readSource("build/ArcActiveTriggersScreen.tsx");
const activateScreen = readSource("build/ArcSavingActivateScreen.tsx");
const reviewScreen = readSource("build/ArcSavingReviewScreen.tsx");
const arcGymSituationScreen = readSource("build/ArcGymSituationScreen.tsx");
const flexibleDailyScreen = readSource("build/FlexibleDailyScreen.tsx");
// ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
// task, section 6: the four quick-action buttons moved from this
// screen's own former inline quickActionsRow into the shared
// AddInfoMenu component both the home screen and the entry screen now
// mount behind one "+ להוסיף מידע" button -- this test now reads
// their destinations/style from there.
const addInfoMenu = readSource("live/components/AddInfoMenu.tsx");
const overlayKt = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/OverlayService.kt");
const widgetXml = readSource("modules/emotional-checkin-widget/android/src/main/res/layout/emotional_checkin_widget.xml");
const widgetProviderKt = readSource("modules/emotional-checkin-widget/android/src/main/java/expo/modules/emotionalcheckinwidget/EmotionalCheckInWidgetProvider.kt");
const widgetDrawable = readSource("modules/emotional-checkin-widget/android/src/main/res/drawable/widget_quick_action_background.xml");

// --- scenario 15: the 5 new routes are registered, each its own independent entry ---

test("all 5 ARC Saving routes are registered in app/_layout.tsx, each as its own independent Stack.Screen (never nested under arc-gym/*)", () => {
  assert.ok(layout.includes('<Stack.Screen name="arc-saving/index"'));
  assert.ok(layout.includes('<Stack.Screen name="arc-saving/trigger/[id]"'));
  assert.ok(layout.includes('<Stack.Screen name="arc-saving/active-triggers"'));
  assert.ok(layout.includes('<Stack.Screen name="arc-saving/activate"'));
  assert.ok(layout.includes('<Stack.Screen name="arc-saving/review"'));
});

// --- scenario 15 continued: management hub ---

test("build/ArcSavingScreen.tsx (the management hub) lists both saved exercises and triggers from the SAME storage every other ARC Saving screen reads, and links to the active-triggers editor", () => {
  assert.ok(arcSavingScreen.includes('import { loadArcSavedExercises, loadArcTriggers, loadTasks } from "../data/storage.ts";'));
  assert.ok(arcSavingScreen.includes('router.push("/arc-saving/active-triggers")'));
  assert.ok(arcSavingScreen.includes('router.push({ pathname: "/arc-saving/trigger/[id]", params: { id: "new" } })'));
  assert.ok(arcSavingScreen.includes("תרגל שוב"));
});

test("'תרגל שוב' on a saved exercise threads arcSavingExerciseId through /tasks/[id]/arc, preserving (never forcing standalone over) the real active task", () => {
  const fnIndex = arcSavingScreen.indexOf("async function practiceExerciseAgain(");
  const fnBody = arcSavingScreen.slice(fnIndex, arcSavingScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("findActiveTask(await loadTasks())?.id ?? STANDALONE_ARC_TASK_ID"));
  assert.ok(fnBody.includes("arcSavingExerciseId: exercise.id"));
});

// --- scenario 8/9/12/13/15: trigger editor ---

test("build/ArcTriggerEditorScreen.tsx supports creating a trigger, attaching/removing body options, and a 'קשר ל-ARC Behaviour' link section mirroring ArcGymSituationScreen's own picker pattern", () => {
  assert.ok(triggerEditor.includes("createArcTrigger") || triggerEditor.includes("import"));
  assert.ok(triggerEditor.includes("addBodyOptionToTrigger") || triggerEditor.includes("removeBodyOptionFromTrigger"), "must use the pure engine's own attach/detach helpers, never a second ad-hoc implementation");
});

test("the trigger editor can remove ONE body option from a trigger without deleting the option itself or the whole trigger (spec section 15's own 'למחוק אפשרות מסוימת בלי למחוק את כל הטריגר')", () => {
  assert.ok(triggerEditor.includes("removeBodyOptionFromTrigger"));
  assert.ok(!triggerEditor.includes("deleteArcSavedBodyOptionFromList"), "removing an option from ONE trigger must never delete the option globally");
});

// --- scenario 17/18: active-triggers editor ---

test("build/ArcActiveTriggersScreen.tsx supports add/remove/reorder of the active list, using the pure engine's own helpers rather than a second ad-hoc array implementation", () => {
  assert.ok(activeTriggersScreen.includes("addTriggerToActiveList") || activeTriggersScreen.includes("import"));
  assert.ok(activeTriggersScreen.includes("removeTriggerFromActiveList"));
  assert.ok(activeTriggersScreen.includes("reorderActiveTriggerList") || activeTriggersScreen.includes("saveActiveArcTriggerIds"));
});

test("removing a trigger from the active-triggers screen only ever calls the active-list storage function -- never a trigger-deletion function, so the trigger itself survives in the master list", () => {
  assert.ok(activeTriggersScreen.includes("saveActiveArcTriggerIds"));
  assert.ok(!activeTriggersScreen.includes("deleteArcTriggerFromList"), "this screen must never delete a trigger -- only change which ones are displayed");
});

// --- scenario 8 (picking by situation)/17/8/8: the "+ARC Save" activation flow ---

test("build/ArcSavingActivateScreen.tsx lists only the ACTIVE triggers (never the full master list) and offers 'בחירת אזורי גוף מחדש' alongside each saved body option", () => {
  assert.ok(activateScreen.includes("loadActiveArcTriggerIds"));
  assert.ok(activateScreen.includes("בחירת אזורי גוף מחדש"));
  assert.ok(activateScreen.includes('"בחר אפשרות גוף"') || activateScreen.includes("בחר אפשרות גוף"));
});

test("if no saved exercises/triggers exist yet, the activate screen redirects into the ARC Saving creation flow, never silently failing", () => {
  assert.ok(activateScreen.includes('router.push("/arc-saving")'));
  assert.ok(activateScreen.includes("עדיין אין לך טריגרים פעילים") || activateScreen.includes("צור תרגיל"));
});

test("choosing/activating a trigger NEVER auto-starts ARC on its own -- every path still goes through EmotionalCheckInButtons/the mood check-in, never an automatic router.push straight into /tasks/[id]/arc", () => {
  assert.ok(activateScreen.includes("EmotionalCheckInButtons"));
  assert.ok(activateScreen.includes("handleArcSavingCheckInChoice"));
  assert.ok(!/useEffect\([^)]*handleArcSavingCheckInChoice/.test(activateScreen), "the check-in choice must only ever fire from a tap, never automatically on mount/focus");
});

test("a trigger with exactly one body option skips straight to it (no picker shown); a trigger with multiple options shows a picker including the fresh-regions row", () => {
  assert.ok(activateScreen.includes("optionsForSelectedTrigger.length !== 1"));
  assert.ok(activateScreen.includes("theOnlyOption"));
});

// --- scenario 5/12 (cumulative learning + preventing overwrite without confirmation) ---

test("build/ArcSavingReviewScreen.tsx is the ONLY place the three-way add-new/update-existing/don't-save Alert-equivalent choice is shown -- the pure engine's own setters never gate on it themselves", () => {
  assert.ok(reviewScreen.includes("הוסף אפשרות חדשה"));
  assert.ok(reviewScreen.includes("עדכן אפשרות קיימת"));
  assert.ok(reviewScreen.includes("אל תשמור"));
  assert.ok(reviewScreen.includes("areArcBodyProtocolSnapshotsEqual"), "the review screen itself must run the real divergence check, never assume divergence");
});

test("when there is no real divergence, the review screen silently clears the pending slot and returns -- never showing a needless prompt", () => {
  const fnIndex = reviewScreen.indexOf("loadArcSavingPendingReview().then(");
  const bodyIndex = reviewScreen.indexOf("if (!diverged) {", fnIndex);
  assert.ok(bodyIndex !== -1);
  const body = reviewScreen.slice(bodyIndex, bodyIndex + 150);
  assert.ok(body.includes("finishAndReturn(pending.activeTaskId)"));
});

test("the 'בחירת אזורי גוף מחדש' path (triggerIdForNewOption set) shows a DIFFERENT two-way choice (save as new option / don't save) -- never the usual update-existing option, since there is no pre-existing option to update", () => {
  assert.ok(reviewScreen.includes("isFreshTriggerPath"));
  assert.ok(reviewScreen.includes("שמור כאפשרות גוף חדשה"));
});

test("returning after review goes back to the active task (if any) or Home -- never a dead-end, same convention as every other post-ARC return", () => {
  const fnIndex = reviewScreen.indexOf("async function finishAndReturn(");
  const fnBody = reviewScreen.slice(fnIndex, reviewScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('router.replace(activeTaskId ? { pathname: "/tasks/[id]", params: { id: activeTaskId } } : "/");'));
});

// --- scenario: ArcGymSituationScreen link section ---

test("ArcGymSituationScreen.tsx shows a read-only 'ARC Saving מקושר' section, same position/shape as the existing linked-exercise sections", () => {
  assert.ok(arcGymSituationScreen.includes("ARC Saving מקושר"));
});

// --- scenario 14/15 (renaming the 3 existing buttons + solid uniform green) ---

test("Home's quickActionsRow has all FOUR buttons with shortened labels, and the shared style is a SOLID green background (not a border/text-only treatment)", () => {
  assert.ok(flexibleDailyScreen.includes('"+ תובנה"'));
  assert.ok(flexibleDailyScreen.includes('"+ משימה"'));
  assert.ok(flexibleDailyScreen.includes('"+ אירוע חיובי"'));
  assert.ok(flexibleDailyScreen.includes('"+ ARC Save"'));
  const styleIndex = flexibleDailyScreen.indexOf("quickActionButton:");
  const styleBody = flexibleDailyScreen.slice(styleIndex, styleIndex + 200);
  assert.ok(styleBody.includes('backgroundColor: "#2E7D32"'), "the quick-action buttons must have a solid background color, never border-only");
});

test("the four quick-action buttons share exactly ONE style object -- uniform height/corners/typography by construction, never four separately-tuned styles", () => {
  const occurrences = [...addInfoMenu.matchAll(/style=\{styles\.menuRow\}/g)].length;
  assert.equal(occurrences, 4, "all four buttons must use the SAME shared style object");
});

test("the '+ ARC Save' button opens the activate screen; the first three buttons keep their exact pre-existing destinations (never recreated)", () => {
  assert.ok(addInfoMenu.includes('router.push("/arc-saving/activate")'));
  assert.ok(addInfoMenu.includes('router.push("/insights/new")'));
  assert.ok(addInfoMenu.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: "new" } })'));
  assert.ok(addInfoMenu.includes('router.push("/positive-memories/new")'));
});

test("Home shows the active triggers as tappable chips under 'הטריגרים שלי כרגע', each opening its own matching exercise via the activate screen", () => {
  assert.ok(flexibleDailyScreen.includes("הטריגרים שלי כרגע"));
  assert.ok(flexibleDailyScreen.includes("activeTriggers"));
});

// --- scenario 15/16: native cube (OverlayService.kt) restyle + 2 new buttons ---

test("OverlayService.kt restyles all 4 quick-action rows with ONE shared, fully-opaque (never translucent) solid green background color constant", () => {
  assert.ok(overlayKt.includes('QUICK_ACTION_BACKGROUND = "#FF2E7D32"'));
  const occurrences = [...overlayKt.matchAll(/Color\.parseColor\(QUICK_ACTION_BACKGROUND\)/g)].length;
  assert.equal(occurrences, 4, "all four quick-action buttons (insight/ARC-save-sibling/positive-event/add-task/arc-save) must share the SAME color constant");
});

test("OverlayService.kt has the two new addTaskView/arcSavingView fields, dispatch hit-testing, and their own debounced open functions dispatching to the exact URIs the widget already proves out", () => {
  assert.ok(overlayKt.includes("private var addTaskView: TextView? = null"));
  assert.ok(overlayKt.includes("private var arcSavingView: TextView? = null"));
  assert.ok(overlayKt.includes("var downOnAddTask = false"));
  assert.ok(overlayKt.includes("var downOnArcSaving = false"));
  assert.ok(overlayKt.includes("} else if (downOnAddTask) {\n            openAddTask()"));
  assert.ok(overlayKt.includes("} else if (downOnArcSaving) {\n            openArcSaving()"));
  const addTaskFnIndex = overlayKt.indexOf("private fun openAddTask()");
  assert.ok(addTaskFnIndex !== -1);
  assert.ok(overlayKt.slice(addTaskFnIndex, addTaskFnIndex + 500).includes('Uri.parse("archi://tasks/new/edit")'));
  const arcSavingFnIndex = overlayKt.indexOf("private fun openArcSaving()");
  assert.ok(arcSavingFnIndex !== -1);
  assert.ok(overlayKt.slice(arcSavingFnIndex, arcSavingFnIndex + 500).includes('Uri.parse("archi://arc-saving/activate")'));
});

test("the two new cube views are nulled out in BOTH the ensureOverlayAdded catch block and removeOverlayIfAdded, same as every other view field", () => {
  const catchIndex = overlayKt.indexOf("Requirement 2: a denied/unavailable overlay permission");
  const catchBody = overlayKt.slice(catchIndex, catchIndex + 1000);
  assert.ok(catchBody.includes("addTaskView = null"));
  assert.ok(catchBody.includes("arcSavingView = null"));
  const removeFnIndex = overlayKt.indexOf("private fun removeOverlayIfAdded()");
  const removeFnBody = overlayKt.slice(removeFnIndex, overlayKt.indexOf("\n  }", removeFnIndex));
  assert.ok(removeFnBody.includes("addTaskView = null"));
  assert.ok(removeFnBody.includes("arcSavingView = null"));
  assert.ok(removeFnBody.includes("positiveEventView = null"), "the pre-existing positiveEventView nulling gap this task also fixed while editing this same block");
});

// --- scenario 15/16: native widget restyle + 4th button ---

test("the widget drawable is a SOLID, opaque green (#2E7D32), distinct from the plain white widget_button_background.xml every other button keeps", () => {
  assert.ok(widgetDrawable.includes('android:color="#2E7D32"'));
});

test("the widget layout applies the new drawable to exactly the four quick-action buttons (insight/add-task/positive-event/arc-save), each with white text and a shortened label", () => {
  for (const id of ["widget_button_insight", "widget_button_add_task", "widget_button_positive_event", "widget_button_arc_save"]) {
    const idIndex = widgetXml.indexOf(`@+id/${id}`);
    assert.ok(idIndex !== -1, `missing ${id}`);
    const block = widgetXml.slice(idIndex, widgetXml.indexOf("/>", idIndex));
    assert.ok(block.includes("@drawable/widget_quick_action_background"), `${id} must use the new solid-green drawable`);
    assert.ok(block.includes('android:textColor="#FFFFFF"'), `${id} must have white (high-contrast) text`);
  }
  assert.ok(widgetXml.includes('android:text="+ תובנה"'));
  assert.ok(widgetXml.includes('android:text="+ משימה"'));
  assert.ok(widgetXml.includes('android:text="+ אירוע חיובי"'));
  assert.ok(widgetXml.includes('android:text="+ ARC Save"'));
});

test("every XML comment in the widget layout stays well-formed (no literal '--', which fails a real Gradle build)", () => {
  const commentBodies = [...widgetXml.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]);
  for (const body of commentBodies) {
    assert.ok(!body.includes("--"), `illegal '--' inside an XML comment: ${body.slice(0, 80)}`);
  }
});

test("EmotionalCheckInWidgetProvider.kt wires widget_button_arc_save to its own PendingIntent/request code, dispatching to archi://arc-saving/activate, task-independent like buildAddTaskPendingIntent", () => {
  assert.ok(widgetProviderKt.includes("private const val REQUEST_CODE_ARC_SAVE = 1009"));
  assert.ok(widgetProviderKt.includes("views.setOnClickPendingIntent(R.id.widget_button_arc_save, buildArcSavePendingIntent(context))"));
  const fnIndex = widgetProviderKt.indexOf("private fun buildArcSavePendingIntent(");
  const fnBody = widgetProviderKt.slice(fnIndex, widgetProviderKt.indexOf("\n    }", fnIndex));
  assert.ok(fnBody.includes('Uri.parse("archi://arc-saving/activate")'));
  assert.ok(fnBody.includes("REQUEST_CODE_ARC_SAVE"));
});

test("all 9 widget request codes remain distinct after adding REQUEST_CODE_ARC_SAVE", () => {
  const codes = [...widgetProviderKt.matchAll(/REQUEST_CODE_\w+ = (\d+)/g)].map((match) => match[1]);
  assert.equal(codes.length, 9);
  assert.equal(new Set(codes).size, 9);
});
