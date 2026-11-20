import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/taskAlarmDiagnosticsScreen.test.ts
 *
 * Critical-bug task ("Native Alarm Still Not Working"), Step 2:
 * source-text regression guard for the "בדיקת שעון מעורר" diagnostic
 * screen -- no React Native component test renderer exists in this
 * codebase (every other screen test follows the same convention), so
 * this checks the real source text instead of actually rendering it.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/TaskAlarmDiagnosticsScreen.tsx");
const route = readSource("app/tasks/alarm-diagnostics.tsx");
const layout = readSource("app/_layout.tsx");
const settingsScreen = readSource("build/TaskAlarmSettingsScreen.tsx");
const storage = readSource("data/storage.ts");

test("the route is registered and renders the screen directly", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/alarm-diagnostics"/);
  assert.match(route, /from ["']\.\.\/\.\.\/build\/TaskAlarmDiagnosticsScreen\.tsx["']/);
  assert.ok(route.includes("<TaskAlarmDiagnosticsScreen />"));
});

test("the alarm-settings screen offers a nav button straight to the diagnostics screen", () => {
  assert.ok(settingsScreen.includes('router.push("/tasks/alarm-diagnostics")'));
});

test("TaskAlarmTestResult is stored under its own dedicated key, never sharing one with the preferences", () => {
  assert.match(storage, /const TASK_ALARM_TEST_RESULT_KEY = "archi\.taskAlarmTestResult\.v1";/);
  assert.ok(storage.includes("export async function loadTaskAlarmTestResult(): Promise<TaskAlarmTestResult | null> {"));
  assert.ok(storage.includes("export async function saveTaskAlarmTestResult(result: TaskAlarmTestResult): Promise<void> {"));
});

test("'קבע התראת בדיקה לעוד דקה' calls armTestAlarm and stores whatever it returns, armError included -- never a separate, simplified scheduling path", () => {
  const fnIndex = screen.indexOf("async function startTest()");
  const fnBody = screen.slice(fnIndex, fnIndex + 250);
  assert.ok(fnBody.includes("const next = await armTestAlarm();"));
  assert.ok(fnBody.includes("setResult(next);"));
});

test("a scheduling error is shown verbatim, in its own clearly-marked error block -- never silently ignored", () => {
  assert.ok(screen.includes("{result.armError && ("));
  assert.ok(screen.includes("{result.armError}"));
});

test("the saved fire time and whether the alarm actually fired are both shown, distinctly from each other -- scheduling success is never conflated with the ring actually having started", () => {
  assert.ok(screen.includes("שעת ההפעלה שנשמרה"));
  assert.ok(screen.includes("result.firedAt"));
});

test("sound/vibration/screen are three SEPARATE self-report rows, each persisted via recordTestAlarmSelfReport -- never inferred automatically (JS cannot detect real-world sound/vibration/screen-wake)", () => {
  assert.ok(screen.includes('<SelfReportRow label="נשמע צליל?"'));
  assert.ok(screen.includes('<SelfReportRow label="הורגש רטט?"'));
  assert.ok(screen.includes('<SelfReportRow label="הופיע מסך שעון מעורר?"'));
  assert.ok(screen.includes("report({ soundHeard: value })"));
  assert.ok(screen.includes("report({ vibrationFelt: value })"));
  assert.ok(screen.includes("report({ alarmScreenShown: value })"));
});

test("reloads on focus, so returning to the app after backgrounding it to wait out the test minute picks up whatever the native side recorded meanwhile", () => {
  assert.ok(screen.includes("useFocusEffect(reload)"));
  assert.ok(screen.includes("loadTaskAlarmTestResult().then(setResult)"));
});

test("Xiaomi/MIUI-specific guidance (Autostart, battery restrictions, background pop-ups) is shown directly on the screen, not left for the trainee to discover elsewhere", () => {
  assert.ok(screen.includes("Autostart"));
  assert.ok(screen.includes("Xiaomi"));
});

// Critical-bug task ("Test Alarm Works, Scheduled Task Alarm Does
// Not"), Step 3: the second, real-task-through-Task-Planning diagnostic.

test("the real-task test button calls armRealTaskAlarmTest -- the function that creates, saves, AND schedules a real task, never a simplified stand-in", () => {
  const fnIndex = screen.indexOf("async function startRealTaskTest()");
  const fnBody = screen.slice(fnIndex, fnIndex + 250);
  assert.ok(fnBody.includes("const next = await armRealTaskAlarmTest();"));
  assert.ok(fnBody.includes("setRealResult(next);"));
});

test("the real-task result shows all 5 of the trainee's own requested checks, each as its own distinguishable row: saved, scheduled, exact fire time, still registered with the OS, and whether it actually fired", () => {
  assert.ok(screen.includes("1. המשימה נשמרה"));
  assert.ok(screen.includes("2. השעון תוזמן בהצלחה") || screen.includes("2. השעון לא תוזמן"));
  assert.ok(screen.includes("3. שעת ההפעלה המדויקת שנשמרה"));
  assert.ok(screen.includes("registeredWithOsOnLastCheck"));
  assert.ok(screen.includes("realResult.firedAt"));
});

test("reload() re-checks OS registration (refreshRealTaskAlarmTestStatus) for an existing real-task test on every focus, never re-arming it", () => {
  const fnIndex = screen.indexOf("const reload = useCallback(() => {");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("refreshRealTaskAlarmTestStatus().then(setRealResult)"));
  assert.ok(!fnBody.includes("armRealTaskAlarmTest()"));
});

test("a real-task alarm that's still registered with the OS but never fired, vs. one that disappeared before firing, are shown as two DIFFERENT diagnoses", () => {
  assert.ok(screen.includes("אבל לא הופעל בפועל"));
  assert.ok(screen.includes("נעלם מהמערכת לפני שהתריע"));
});

// --- Alarm reliability task: reboot restoration + Xiaomi background limits ---

test("real device power-manager info is loaded on every focus via the shared getAlarmPowerManagerInfo, never a guessed/hardcoded device check", () => {
  assert.match(screen, /import\s*\{[\s\S]*?getAlarmPowerManagerInfo[\s\S]*?openAlarmPowerManagerSettings[\s\S]*?\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/);
  const fnIndex = screen.indexOf("const reload = useCallback(() => {");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("getAlarmPowerManagerInfo().then(setPowerInfo);"));
});

test("when the device has its own background-restriction settings screen (powerInfo.activity non-null), a real button opens it via openAlarmPowerManagerSettings -- never shown as if every device has one", () => {
  const sectionIndex = screen.indexOf("{powerInfo && (");
  assert.ok(sectionIndex !== -1);
  const sectionBody = screen.slice(sectionIndex, sectionIndex + 700);
  assert.ok(sectionBody.includes("powerInfo.activity ? ("));
  assert.ok(sectionBody.includes("onPress={() => openAlarmPowerManagerSettings()}"));
  assert.ok(sectionBody.includes(") : ("), "must show an honest alternative message when there is no device-specific screen, never hide the section silently");
});

test("the screen states plainly that alarms restore after a reboot without opening the app, AND discloses the one confirmed limitation (a sufficiently-late reboot can still ring once) -- never claims unverified behavior as certain", () => {
  assert.ok(screen.includes("משוחזרים אוטומטית אחרי הפעלה מחדש של הטלפון, בלי לפתוח את ARCHI"));
  assert.ok(screen.includes("עשוי לצלצל כמעט מיידית עם ההפעלה מחדש"));
});
