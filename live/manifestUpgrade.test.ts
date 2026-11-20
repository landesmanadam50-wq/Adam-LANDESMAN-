import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/manifestUpgrade.test.ts
 *
 * Manifest Upgrade task: source-text regression guard for the UI
 * layer (daily startup sequence, the shared visualization card, and
 * the manifest list/editor screens) -- these touch AsyncStorage/
 * navigation, which isn't callable from a plain `node --test` run,
 * same convention as every other screen test in this codebase. The
 * pure selection/rotation/completeness model is fully exercised in
 * arc/purposeManifest.test.ts, and the resolution I/O in
 * data/purposeManifest.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const overlay = readSource("live/DailyStartupSequenceOverlay.tsx");
const card = readSource("live/ManifestVisualizationCard.tsx");
const todayScreen = readSource("live/ManifestTodayScreen.tsx");
const listScreen = readSource("build/PurposeManifestListScreen.tsx");
const editorScreen = readSource("build/PurposeManifestEditorScreen.tsx");
const dailyScheduleScreen = readSource("build/DailyScheduleScreen.tsx");
const goalsScreen = readSource("build/ManifestGoalsScreen.tsx");
const manifestMeditationScreen = readSource("live/ManifestMeditationScreen.tsx");
const manifestMeditationModule = readSource("arc/manifestMeditation.ts");

// --- Startup-popup task: every real launch, no once-per-day gate, not interrupting active sessions ---

test("the sequence no longer checks or stores any once-per-day 'already shown' flag -- requirement: show on every real app launch, not once per day", () => {
  assert.ok(!overlay.includes("hasShownStartupSequenceToday"));
  assert.ok(!overlay.includes("markStartupSequenceShown"));
  assert.ok(!overlay.includes("loadDailyStartupSequenceState"));
  assert.ok(!overlay.includes("saveDailyStartupSequenceState"));
});

test("the mount effect's gates are exactly two: having already run this process, and a genuinely active (non-stale) task timer/rest run or ARC LIVE session -- 'do not interrupt an active task, ARC exercise, or rest session'", () => {
  const fnIndex = overlay.indexOf("useEffect(() => {\n    logStartupStep(\"mount effect starting\"");
  const fnEnd = overlay.indexOf("}, []);", fnIndex);
  const fnBody = overlay.slice(fnIndex, fnEnd);
  assert.match(fnBody, /const \[timerRun, arcSession, alarmConfig, morningFlowState\] = await Promise\.all\(\[\s*loadTaskTimerRun\(\),\s*loadNewArcLiveSession\(\),/);
  assert.ok(fnBody.includes("if (timerActive || arcActive) {"));
  assert.ok(fnBody.includes('setStep("none");'));
});

// --- Critical-bug task ("Startup Popups Not Appearing"): the real fix ---

test("root cause #1 (presentation): the overlay now presents through React Native's own Modal -- a true native top-level window immune to react-native-screens occluding a plain sibling View -- the SAME mechanism every other 'must appear on top of the active screen' case in this codebase already uses", () => {
  assert.match(overlay, /import \{ Modal, Pressable, StyleSheet, Text, TextInput, View \} from "react-native";/);
  assert.match(overlay, /<Modal visible transparent animationType="fade" onRequestClose=\{finish\}>/);
});

test("root cause #2 (silent failure): all three async entry points -- the mount effect's active-session check, the fact-rotation effect, and continueToManifest -- catch their own errors, log via console.warn, and fall back to a non-stuck state instead of leaving `step` frozen with nothing rendered and nothing logged", () => {
  assert.match(overlay, /\} catch \(error\) \{\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*console\.warn\("\[DailyStartupSequenceOverlay\] Failed to check for an active task timer\/ARC session/);
  assert.match(overlay, /\.catch\(\(error\) => \{\s*console\.warn\("\[DailyStartupSequenceOverlay\] Failed to resolve\/persist the psychology-fact rotation/);
  assert.match(overlay, /\} catch \(error\) \{\s*console\.warn\("\[DailyStartupSequenceOverlay\] Failed to resolve the startup Manifest selection/);
});

test("root cause #3 (stale session): the active-session gate no longer treats mere PRESENCE of a TaskTimerRun/NewArcLiveSessionState as blocking -- it checks isTaskTimerRunStale/isNewArcLiveSessionStale, so an abandoned record from an earlier day (backgrounded/force-stopped mid-session, never explicitly cleared) no longer permanently suppresses both popups", () => {
  assert.match(overlay, /import \{ isTaskTimerRunStale \} from "\.\.\/arc\/taskTimer\.ts";/);
  assert.match(overlay, /import \{ isNewArcLiveSessionStale \} from "\.\.\/arc\/newArcLiveTypes\.ts";/);
  const fnIndex = overlay.indexOf("useEffect(() => {\n    logStartupStep(\"mount effect starting\"");
  const fnEnd = overlay.indexOf("}, []);", fnIndex);
  const fnBody = overlay.slice(fnIndex, fnEnd);
  assert.match(fnBody, /const timerActive = timerRun !== null && !isTaskTimerRunStale\(timerRun, now\);/);
  assert.match(fnBody, /const arcActive = arcSession !== null && !isNewArcLiveSessionStale\(arcSession, now\);/);
  assert.ok(fnBody.includes("if (timerActive || arcActive) {"));
  assert.ok(!fnBody.includes("if (timerRun || arcSession) {"), "the old 'mere presence blocks' check must be gone");
});

test("temporary dev diagnostics (debugging requirement 5): every step transition logs via the __DEV__-gated logStartupStep helper, never affecting production behavior or return values", () => {
  assert.match(overlay, /function logStartupStep\(message: string, data\?: unknown\): void \{\s*if \(!__DEV__\) return;/);
  assert.ok(overlay.includes('logStartupStep("mount effect starting"'));
  assert.ok(overlay.includes('logStartupStep("active-session check result"'));
  assert.ok(overlay.includes('logStartupStep("step -> fact: loading psychology-fact rotation")'));
  assert.ok(overlay.includes('logStartupStep("continueToManifest: resolving startup Manifest selection")'));
  assert.ok(overlay.includes('logStartupStep("render: showing the Modal"'));
});

test("the active-session check's error fallback still shows the sequence (fails OPEN, never silently stays hidden), and the fact-rotation error fallback still sets a real fact rather than leaving it null forever", () => {
  const checkIndex = overlay.indexOf("console.warn(\"[DailyStartupSequenceOverlay] Failed to check for an active task timer");
  const checkBody = overlay.slice(checkIndex, checkIndex + 200);
  assert.ok(checkBody.includes('setStep("checkin");'), "Morning Flow Simplification task: the fail-open target is now the new first step, 'checkin', not 'fact' directly");

  const factIndex = overlay.indexOf("console.warn(\"[DailyStartupSequenceOverlay] Failed to resolve/persist the psychology-fact rotation");
  const factBody = overlay.slice(factIndex, factIndex + 350);
  assert.ok(factBody.includes("setFact(PSYCHOLOGY_FACTS[0]);"));

  const manifestIndex = overlay.indexOf("console.warn(\"[DailyStartupSequenceOverlay] Failed to resolve the startup Manifest selection");
  const manifestBody = overlay.slice(manifestIndex, manifestIndex + 300);
  assert.ok(manifestBody.includes("setResolved(null);"));
  assert.ok(manifestBody.includes('setStep("manifest");'), "continueToManifest's finally-block must still advance to the manifest step even on error");
});

test("the overlay has ZERO dependency on which home screen is rendered -- it never reads the DailyRoutineTemplate and never imports build/DailyScheduleScreen.tsx or build/RoutineSetupScreen.tsx, so app/index.tsx's own routine-template branching can never bypass or interfere with it", () => {
  // Structural checks, not a bare substring search -- this file's own doc
  // comment legitimately DISCUSSES DailyScheduleScreen/RoutineSetupScreen
  // in prose (to explain what it deliberately does NOT depend on), so a
  // blunt !includes(...) would false-positive on that very sentence.
  assert.ok(!overlay.includes("loadDailyRoutineTemplate("));
  assert.ok(!overlay.includes("hasTemplate"));
  assert.ok(!/^import .*(DailyScheduleScreen|RoutineSetupScreen)/m.test(overlay), "must never actually import either home-screen component");
});

test("app/index.tsx (now today's own Flexible Daily Timetable, Open Today's Schedule Automatically task) never touches the overlay -- the root-level overlay sits beside the Stack's own index screen, not inside it", () => {
  const indexSource = readSource("app/index.tsx");
  assert.ok(!indexSource.includes("DailyStartupSequenceOverlay"));
});

// --- Final Manifest & Startup Popup Updates task: cold-start detection via process initialization ---

test("cold-start detection: a module-scope boolean, set exactly once per real JS process, is the ONLY mechanism gating repeated runs -- never Android force-stop/recent-app-removal events, never AppState", () => {
  assert.match(overlay, /let hasRunStartupSequenceThisProcess = false;/);
  // Structural checks, not a bare substring search -- the module's own doc
  // comment legitimately DISCUSSES AppState/force-stop in prose (to explain
  // what this is deliberately NOT built on), so a blunt !includes("AppState")
  // would false-positive on that very sentence.
  assert.ok(!overlay.includes("AppState.addEventListener"), "must never subscribe to OS-level foreground/background lifecycle events");
  const reactNativeImport = overlay.match(/import \{[^}]*\} from "react-native";/)?.[0] ?? "";
  assert.ok(!/\bAppState\b/.test(reactNativeImport), "must never import AppState from react-native");
  assert.ok(!overlay.includes("isRecentTaskRemoval"), "must never read any Android-specific force-stop/recent-removal signal");
});

test("cold-start detection: the mount effect checks hasRunStartupSequenceThisProcess as its first meaningful statement (only a diagnostic log precedes it) and returns early if it is already true, otherwise sets it to true before doing anything else -- a second mount within the same process can never re-show the sequence", () => {
  const fnIndex = overlay.indexOf("useEffect(() => {\n    logStartupStep(\"mount effect starting\"");
  assert.ok(fnIndex !== -1, "the mount effect must log its own start, then check the flag, before anything else");
  const fnBody = overlay.slice(fnIndex, fnIndex + 400);
  assert.match(fnBody, /if \(hasRunStartupSequenceThisProcess\) \{\s*logStartupStep\("already ran this process -- step -> none"\);\s*setStep\("none"\);\s*return;\s*\}\s*hasRunStartupSequenceThisProcess = true;/);
});

test("the sequence is exactly two steps in order -- fact, then manifest", () => {
  assert.match(overlay, /async function continueToManifest\(\)/);
  assert.match(overlay, /function finish\(\)/);
});

test("'every real launch, not repeated navigation/background-resume' relies on this component being mounted ONCE as a fixed sibling of the root Stack -- never registered as its own navigable screen, which would let ordinary navigation remount (and re-trigger) it", () => {
  assert.match(layout, /<DailyStartupSequenceOverlay \/>/);
  assert.ok(!layout.includes('name="daily-startup'));
});

test("continuing past the fact popup resolves a FRESH startup pick via resolveStartupManifestSelection -- never the 'reuse if already current today' resolution the manual reopen screen uses", () => {
  const fnIndex = overlay.indexOf("async function continueToManifest()");
  const fnBody = overlay.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("resolveStartupManifestSelection(new Date())"));
});

// --- Repeated launches: the mount effect has no memoized/persisted "already ran" state of its own ---

test("repeated launches: the psychology-fact step is resolved unconditionally every time 'step' becomes 'fact' (its own effect has no day/launch-count guard), so a second cold launch shows it again exactly like the first", () => {
  const effectIndex = overlay.indexOf('if (step !== "fact") return;');
  const effectBody = overlay.slice(effectIndex, effectIndex + 400);
  assert.match(effectBody, /loadPsychologyFactProgress\(\)\s*\.then\(/);
  assert.ok(!effectBody.includes("hasShown"), "no 'has this launch already shown it' flag of any kind");
});

test("repeated launches: the mount effect's early-returns are the process-already-ran guard, the active-session guard, the permanent one-time morning-alarm-offer guard (Nine Functional Improvements task, Improvement 9), and (Unified ARC & Productivity Update task, requirement 1) the two branches of resuming a persisted morning-flow ARC pathway -- none of the ORIGINAL three is a day/date check, so no once-per-day-style popup-suppression gate was reintroduced; the one new date check that DOES exist only decides whether an abandoned ARC session is stale enough to stop waiting on, and every branch it's part of still leads to SOME step being shown (never to silently suppressing the sequence)", () => {
  const effectIndex = overlay.indexOf("useEffect(() => {\n    logStartupStep(\"mount effect starting\"");
  const effectEnd = overlay.indexOf("}, []);", effectIndex);
  const effectBody = overlay.slice(effectIndex, effectEnd);
  const returnCount = (effectBody.match(/\breturn;/g) ?? []).length;
  assert.equal(
    returnCount,
    5,
    "exactly five early returns: process-already-ran, the morning-flow-resume 'still active' branch, the morning-flow-resume 'genuinely finished' branch, the active-session guard, and the permanent hasOfferedSetup check"
  );
  assert.ok(
    !effectBody.includes("hasShownStartupSequenceToday") && !effectBody.includes("DailyStartupSequenceState"),
    "none of the guards may be a once-per-day 'already shown today' suppression gate"
  );
  assert.match(
    effectBody,
    /todayLocalDateString\(new Date\(arcSession\.createdAt\)\) !== todayLocalDateString\(now\)/,
    "the one legitimate date check decides staleness of an abandoned morning-flow ARC session, never whether the sequence itself has already run today"
  );
});

// --- Prevention of duplicate popups within the same launch ---

test("duplicate-popup prevention: the component holds its OWN local 'step' state (not derived from route/navigation params), so re-entering any screen underneath the overlay can never re-trigger steps already passed this launch", () => {
  assert.match(overlay, /const \[step, setStep\] = useState<Step>\("checking"\);/);
  assert.ok(!overlay.includes("useFocusEffect"), "must not re-run on screen focus the way ordinary screens do -- this is a one-shot root overlay, not a per-screen effect");
});

test("duplicate-popup prevention: the mount effect itself runs with an empty dependency array -- React only re-invokes it if this component were to remount, which app/_layout.tsx's own single, fixed mount point never does (and even then, the module-scope flag above still blocks a second run)", () => {
  const effectIndex = overlay.indexOf("useEffect(() => {\n    logStartupStep(\"mount effect starting\"");
  const effectEnd = overlay.indexOf("}, []);", effectIndex);
  assert.ok(effectIndex !== -1 && effectEnd !== -1 && effectEnd - effectIndex < 7000, "the mount effect must close with a `[]` dependency array");
});

// --- Missing / incomplete manifests ---

test("when resolveStartupManifestSelection returns null, the sequence shows a non-blocking 'create one' prompt instead of empty/broken visualization content, and still continues onward (Morning Flow Simplification task: into the new planning-decision step, never finish() directly anymore -- but finish() itself remains reachable from there)", () => {
  const fnIndex = overlay.indexOf('step === "fact" && fact ? (');
  const fnBody = overlay.slice(fnIndex, fnIndex + 2200);
  assert.ok(fnBody.includes(") : resolved ? ("));
  assert.ok(fnBody.includes("onPress={continueToPlanning}"));
});

// --- Random selection displayed correctly, and the manual "reopen today" entry point ---

test("live/ManifestTodayScreen.tsx (requirement 6: manually reopen today's visualization) uses resolveTodaysManifestSelection -- deliberately DIFFERENT from the startup sequence's resolveStartupManifestSelection, so reopening this screen repeatedly shows something stable instead of re-rolling every tap -- and renders the SAME shared card component", () => {
  assert.ok(todayScreen.includes("resolveTodaysManifestSelection(new Date())"));
  assert.ok(!todayScreen.includes("resolveStartupManifestSelection"));
  assert.ok(todayScreen.includes("<ManifestVisualizationCard"));
});

test("build/DailyScheduleScreen.tsx links to both the manual reopen screen and the manifest list -- the new feature is reachable from the main screen, not just the daily popup", () => {
  assert.ok(dailyScheduleScreen.includes('router.push("/manifest-today")'));
  assert.ok(dailyScheduleScreen.includes('router.push("/purpose-manifests")'));
});

// --- Connecting visualization to daily action (creating a Task) ---

test("ManifestVisualizationCard's addToSchedule creates a real one-time Task (unless the trainee explicitly chose recurring), scoped to today, and records it on the SAME daily selection -- reusing the existing Task/storage system, never a parallel one", () => {
  const fnIndex = card.indexOf("async function addToSchedule");
  const fnBody = card.slice(fnIndex, fnIndex + 800);
  assert.ok(fnBody.includes('recurrence: recurring ? { kind: "recurring", daysOfWeek: EVERY_DAY_OF_WEEK } : { kind: "once" },'));
  assert.ok(fnBody.includes("scheduledDate: todayLocalDateString(now),"));
  assert.ok(fnBody.includes("await upsertTask(task);"));
  assert.ok(fnBody.includes("recordDailyActionTask(selection, task.id)"));
});

test("ManifestVisualizationCard never invents the visualization text -- it only ever renders the manifest/behavior fields passed in as props, verbatim", () => {
  assert.ok(card.includes("{manifest.longTermGoal}"));
  assert.ok(card.includes("{manifest.personalReason}"));
  assert.ok(card.includes("{manifest.personalValue}"));
  assert.ok(card.includes("{behavior.description}"));
  assert.ok(card.includes("{behavior.reason}"));
});

test("once a daily action task exists, the card shows a confirmation instead of the input again -- never lets the trainee create a second daily action for the same day's selection", () => {
  assert.match(card, /createdTaskId \? \(/);
});

test("duplicate-tap prevention: the add-to-schedule button is disabled while `saving` is true, not just while the text is empty -- a fast double-tap can never create two tasks", () => {
  assert.match(card, /disabled=\{!actionText\.trim\(\) \|\| saving\}/);
});

// --- Final Manifest & Startup Popup Updates task: the full ordered exercise sequence, all inside ONE card ---

test("resolveStepOrder always includes goal, behavior, action and (Step 6) nextAction, in that relative order, and never opens a second POPUP/MODAL -- the entire exercise, including the next-action reminder, stays inside this one card component (a same-stack navigation from within the nextAction step is not a second popup)", () => {
  assert.match(card, /function resolveStepOrder\(manifest: PurposeManifest\): CardStep\[\] \{/);
  const fnIndex = card.indexOf("function resolveStepOrder");
  const fnBody = card.slice(fnIndex, fnIndex + 900);
  assert.match(fnBody, /const steps: CardStep\[\] = \["goal", "behavior"\];/);
  assert.match(fnBody, /steps\.push\("action"\);[\s\S]*steps\.push\("nextAction"\);\s*return steps;/);
  assert.ok(!card.includes("Modal"), "must never render a second Modal/popup");
});

test("resolveStepOrder includes the mantra/focus/movement steps ONLY when that manifest's own field is actually set -- a legacy manifest missing them skips straight past, never showing empty/broken content", () => {
  const fnIndex = card.indexOf("function resolveStepOrder");
  const fnBody = card.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('if (manifest.futureMantra.trim()) steps.push("mantra");'));
  assert.ok(fnBody.includes('if (resolveFocusPointColor(manifest.focusPointColor)) steps.push("focus");'));
  assert.ok(fnBody.includes('if (manifest.futureBodyMovement.trim()) steps.push("movement");'));
});

test("the mantra step displays the saved mantra verbatim, the focus step displays the resolved color's hex dot and Hebrew label, and the movement step displays the saved body-movement text verbatim -- nothing here is invented", () => {
  assert.ok(card.includes('step === "mantra"'));
  assert.ok(card.includes("{manifest.futureMantra}"));
  assert.ok(card.includes('step === "focus" && resolvedColor'));
  assert.match(card, /backgroundColor: resolvedColor\.hex/);
  assert.ok(card.includes("{resolvedColor.labelHebrew}"));
  assert.ok(card.includes('step === "movement"'));
  assert.ok(card.includes("{manifest.futureBodyMovement}"));
});

test("the focus point renders centered (alignSelf: 'center' on the dot itself, centered text underneath) and is never replaced by an unrelated animation or image -- the trainee's attention has one fixed, unobstructed target", () => {
  const styleIndex = card.indexOf("focusDot: {");
  const styleBody = card.slice(styleIndex, styleIndex + 150);
  assert.ok(styleBody.includes('alignSelf: "center"'));
  const nameStyleIndex = card.indexOf("focusColorName: {");
  const nameStyleBody = card.slice(nameStyleIndex, nameStyleIndex + 150);
  assert.ok(nameStyleBody.includes('textAlign: "center"'));
  assert.ok(!card.includes("<Image"), "the focus step must stay a plain colored point -- never an image");
  assert.ok(!card.includes("Animated."), "the focus step must stay a static, unobstructed point -- never an animation");
});

test("every step except the final 'nextAction' step offers BOTH a Continue ('המשך') control that advances stepIndex and a Skip ('דילוג') control that closes the whole sequence immediately -- 'Allow skipping' and 'Provide Continue and Skip controls'", () => {
  assert.match(card, /onPress=\{goNext\}[\s\S]{0,80}המשך/);
  assert.match(card, /step !== "nextAction" && \(\s*<Pressable style=\{styles\.skipLink\} onPress=\{onClose\}>/);
});

test("the selected manifest/behavior/selection are read-only props -- this card never re-resolves, re-rolls, or re-picks anything itself, so they stay fixed for the whole sequence regardless of how many steps the trainee advances through", () => {
  assert.ok(!card.includes("resolveStartupManifestSelection"));
  assert.ok(!card.includes("resolveTodaysManifestSelection"));
  assert.ok(!card.includes("selectRandomManifestId"));
});

test("stepIndex only ever advances via goNext (called from the Continue button's onPress), never from a useEffect/rerender -- so a rerender or repeated navigation underneath the overlay can never silently skip or repeat a step", () => {
  assert.match(card, /function goNext\(\) \{\s*setStepIndex\(\(index\) => Math\.min\(index \+ 1, stepOrder\.length - 1\)\);\s*\}/);
  assert.ok(!card.includes("useEffect"), "no effect anywhere drives stepIndex forward on its own");
});

// --- Manifest list/editor: creating multiple manifests, editing without overwriting ---

test("PurposeManifestEditorScreen creates a brand-new manifest (its own fresh id) when id === \"new\", and loads the EXISTING one by id otherwise -- editing one manifest never looks at any other", () => {
  assert.ok(editorScreen.includes("createEmptyPurposeManifest(generatePurposeManifestId(), new Date().toISOString())"));
  assert.ok(editorScreen.includes("manifests.find((candidate) => candidate.id === id)"));
});

test("PurposeManifestEditorScreen saves through upsertPurposeManifest -- the shared upsert-by-id path, never a full-list overwrite", () => {
  const fnIndex = editorScreen.indexOf("async function handleSave");
  const fnBody = editorScreen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await upsertPurposeManifest("));
});

test("PurposeManifestEditorScreen's mantra field always composes through composeFutureMantra/extractMantraSuffix, so the saved futureMantra ALWAYS keeps its fixed 'אני אצליח' prefix no matter what free text the trainee types in", () => {
  assert.match(editorScreen, /value=\{extractMantraSuffix\(draft\.futureMantra\)\}/);
  assert.match(editorScreen, /onChangeText=\{\(value\) => setDraft\(\{ \.\.\.draft, futureMantra: composeFutureMantra\(value\) \}\)\}/);
});

test("PurposeManifestEditorScreen renders every FOCUS_POINT_COLORS swatch and sets draft.focusPointColor to the chosen one's id -- the color is saved independently per manifest, never a free-text/raw hex value", () => {
  assert.match(editorScreen, /\{FOCUS_POINT_COLORS\.map\(\(color\) => \(/);
  assert.match(editorScreen, /onPress=\{\(\) => setDraft\(\{ \.\.\.draft, focusPointColor: color\.id \}\)\}/);
});

test("PurposeManifestEditorScreen binds a free-text body-movement field directly to draft.futureBodyMovement -- user-defined and editable, same draft/save path as every other field", () => {
  assert.match(editorScreen, /value=\{draft\.futureBodyMovement\}/);
  assert.match(editorScreen, /onChangeText=\{\(value\) => setDraft\(\{ \.\.\.draft, futureBodyMovement: value \}\)\}/);
});

test("PurposeManifestListScreen marks an incomplete manifest without hiding or deleting it -- it stays listed and editable", () => {
  assert.ok(listScreen.includes("isPurposeManifestComplete(manifest)"));
  assert.ok(listScreen.includes("manifests.map((manifest) =>"));
});

// --- Backward compatibility: zero interaction with the two pre-existing, unrelated "manifest" concepts ---

test("none of the new Manifest Upgrade files read or write Task.manifestProfile (the Task-level guided-run setup) or arc/lifeManifest.ts's LifeManifest -- a brand-new, independent entity with its own storage keys", () => {
  for (const source of [overlay, card, todayScreen, listScreen, editorScreen, goalsScreen]) {
    assert.ok(!source.includes("manifestProfile"));
    assert.ok(!source.includes("LifeManifest"));
    assert.ok(!source.includes("lifeManifest.ts"));
  }
});

test("app/_layout.tsx's pre-existing life-manifest/* and the manifest-kind Task routes are still registered, untouched", () => {
  assert.match(layout, /<Stack\.Screen name="life-manifest\/index"/);
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/manifest"/);
});

// --- Manifest Goals & Automatic Task Scheduling task: Popup 2 Step 6 ---

test("resolveStepOrder's 'nextAction' step is ALWAYS appended last, never conditionally skipped like mantra/focus/movement -- it has its own graceful content for every possible state", () => {
  const fnIndex = card.indexOf("function resolveStepOrder");
  const fnBody = card.slice(fnIndex, fnIndex + 1200);
  assert.match(fnBody, /steps\.push\("action"\);[\s\S]*steps\.push\("nextAction"\);\s*return steps;/);
});

test("the nextAction step renders goal/task/date/time VERBATIM from the resolved next action -- never invented -- and the date/time formatters clearly indicate an unscheduled task rather than fabricating one", () => {
  assert.ok(card.includes("{nextAction.goal.title}"));
  assert.ok(card.includes("{nextAction.task.title}"));
  assert.ok(card.includes("{formatManifestTaskDate(nextAction.task.scheduledDate)}"));
  assert.ok(card.includes("{formatManifestTaskTime(nextAction.task.scheduledTime)}"));
  assert.match(card, /function formatManifestTaskDate\(scheduledDate: string \| null\): string \{\s*if \(!scheduledDate\) return "עדיין לא נקבע תאריך";/);
  assert.match(card, /function formatManifestTaskTime\(scheduledTime: string \| null\): string \{\s*return scheduledTime \?\? "עדיין לא נקבעה שעה";/);
});

test("when nextAction is null (no incomplete tasks for this manifest), the step offers a 'create a new task' option instead of empty/broken content -- 'if no incomplete tasks exist, show an option to create a new task'", () => {
  const stepIndex = card.indexOf('step === "nextAction"');
  const stepBody = card.slice(stepIndex, stepIndex + 2200);
  assert.ok(stepBody.includes("purpose-manifests/[id]/goals"));
  assert.ok(stepBody.includes("יצירת משימה חדשה"));
});

// --- Nine Functional Improvements task, Improvement 1: Manifest action timer ---

test("Improvement 1: the nextAction step offers a duration field writing directly onto THIS already-resolved Task (upsertTask by id) -- 'allow a configurable timer duration... save the timer duration so it can be reused', reusing Task LIVE's own timer engine (expectedDurationMinutes) rather than inventing a second one", () => {
  const fnIndex = card.indexOf("async function saveNextActionDuration()");
  assert.ok(fnIndex !== -1);
  const fnBody = card.slice(fnIndex, card.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (!nextAction) return;"));
  assert.ok(fnBody.includes("await upsertTask({ ...nextAction.task, expectedDurationMinutes:"), "must update THIS ONE already-resolved task by id, never a bulk edit across other occurrences/tasks");
  const stepIndex = card.indexOf('step === "nextAction"');
  const stepBody = card.slice(stepIndex, stepIndex + 2200);
  assert.ok(stepBody.includes('onPress={saveNextActionDuration}'));
  assert.ok(stepBody.includes("value={durationDraft}"));
});

test("Improvement 1: 'פתיחת המשימה' already opens this exact Task directly in Task LIVE -- Task LIVE's own timer never auto-starts a countdown (requires an explicit Start tap) and already supports Pause/Resume/Complete/Reflection/Reward, so setting the duration here is the ONLY missing piece, never a second, competing timer engine", () => {
  assert.ok(card.includes('onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: nextAction.task.id } })}'));
  assert.ok(!card.includes("TaskTimerRun"), "this card must never build its own timer run -- Task LIVE (live/ActiveTaskScreen.tsx) owns that entirely, reached only via navigation");
});

test("Improvement 1: an empty duration field clears expectedDurationMinutes (never forces a value), and an invalid/non-positive value is treated the same as empty -- never saves NaN or a negative/zero duration", () => {
  const fnIndex = card.indexOf("async function saveNextActionDuration()");
  const fnBody = card.slice(fnIndex, card.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('durationDraft.trim() ? Number(durationDraft) : null'));
  assert.ok(fnBody.includes("Number.isFinite(parsed) && parsed > 0"));
});

test("ManifestVisualizationCard accepts nextAction as a read-only prop (never resolves it itself), and both call sites (the startup overlay and the manual reopen screen) pass resolved.nextAction through unchanged", () => {
  assert.match(card, /nextAction: ManifestNextAction \| null;/);
  assert.ok(!card.includes("resolveManifestNextAction"));
  assert.match(overlay, /nextAction=\{resolved\.nextAction\}/);
  assert.match(todayScreen, /nextAction=\{resolved\.nextAction\}/);
});

// --- Manifest Goals & Automatic Task Scheduling task: build/ManifestGoalsScreen.tsx ---

test("ManifestGoalsScreen lists this manifest's own goals with progress, and creates a new goal through createAndSaveManifestGoal -- never a second, parallel goal store", () => {
  assert.ok(goalsScreen.includes("resolveManifestGoalsWithProgress(manifestId)"));
  assert.ok(goalsScreen.includes("await createAndSaveManifestGoal(manifestId, newGoalTitle.trim());"));
});

test("ManifestGoalsScreen creates a goal task through scheduleManifestTask (the automatic-scheduling pipeline), and shows the returned conflict's reason plus alternatives for the trainee to choose from instead of silently failing or displacing anything", () => {
  const fnIndex = goalsScreen.indexOf("async function submit(");
  const fnBody = goalsScreen.slice(fnIndex, fnIndex + 1800);
  assert.ok(fnBody.includes("await scheduleManifestTask({"));
  assert.ok(fnBody.includes('if (outcome.status === "conflict") {'));
  assert.ok(fnBody.includes("setConflict({ reason: outcome.reason, alternatives: outcome.alternatives });"));
});

test("picking an alternative slot re-submits with that EXACT date/time, so the same 'respect an explicit time' path in the pure scheduler confirms it deterministically rather than re-running the open-ended auto-search", () => {
  assert.match(goalsScreen, /onPress=\{\(\) => submit\(alternative\.dateLocal, alternative\.time\)\}/);
});

test("ManifestGoalsScreen's task row routes editing/rescheduling to the EXISTING /tasks/[id]/edit screen -- never a second, duplicated task-editing form", () => {
  assert.match(goalsScreen, /pathname: "\/tasks\/\[id\]\/edit", params: \{ id: task\.id \}/);
});

test("completing a goal task reuses arc/tasks.ts's own completeTask + the shared upsertTask -- the exact same Task record the daily schedule reads, never a separate 'manifest task' completion flag", () => {
  const fnIndex = goalsScreen.indexOf("async function markTaskComplete");
  const fnBody = goalsScreen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("await upsertTask(completeTask(task, new Date().toISOString()));"));
});

test("deleting a goal task reuses data/storage.ts's own deleteTask -- 'remove its relationship safely without leaving invalid references' is satisfied by simply deleting the Task record itself, never a second cleanup step", () => {
  const fnIndex = goalsScreen.indexOf("async function removeTask");
  const fnBody = goalsScreen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("await deleteTask(task.id);"));
});

test("reordering goals/tasks swaps two ids and sends the FULL ordered list through reorderManifestGoals/reorderManifestTasksForGoal -- never a partial, order-losing update", () => {
  assert.ok(goalsScreen.includes("await reorderManifestGoals(manifestId, ids);"));
  assert.ok(goalsScreen.includes("await reorderManifestTasksForGoal(goalId, ids);"));
});

test("deleting a goal shows an explicit confirmation naming that its tasks survive, un-linked -- never a silent, surprising deletion", () => {
  assert.match(goalsScreen, /היעד יימחק; המשימות שלו יישארו, ללא קישור ליעד/);
});

test("app/_layout.tsx registers the new goals route as a sibling of the existing purpose-manifests/[id] route, never replacing it", () => {
  assert.match(layout, /<Stack\.Screen name="purpose-manifests\/\[id\]" /);
  assert.match(layout, /<Stack\.Screen name="purpose-manifests\/\[id\]\/goals" /);
});

test("PurposeManifestListScreen links each manifest card to its own goals screen by that SAME manifest's id", () => {
  assert.match(listScreen, /pathname: "\/purpose-manifests\/\[id\]\/goals", params: \{ id: manifest\.id \}/);
});

// --- Preserving the existing Manifest Meditation (a separate, longer, dedicated exercise) ---

test("Manifest Meditation (arc/manifestMeditation.ts, live/ManifestMeditationScreen.tsx) is completely untouched by this task -- it never reads PurposeManifest, ManifestGoal, or anything from the new scheduling pipeline, and the short startup popup's new Step 6 was added only to live/ManifestVisualizationCard.tsx, never restructuring the meditation's own stage sequence", () => {
  for (const source of [manifestMeditationModule, manifestMeditationScreen]) {
    assert.ok(!source.includes("PurposeManifest"));
    assert.ok(!source.includes("ManifestGoal"));
    assert.ok(!source.includes("purposeManifest"));
    assert.ok(!source.includes("manifestGoals"));
    assert.ok(!source.includes("scheduleManifestTask"));
  }
});

test("app/_layout.tsx's pre-existing manifest-meditation route is still registered, untouched", () => {
  assert.match(layout, /<Stack\.Screen name="manifest-meditation" /);
});
