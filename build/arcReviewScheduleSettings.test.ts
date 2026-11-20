import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcReviewScheduleSettings.test.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 6 ("editable spaced repetition"): source-text regression
 * guard for the shared ArcReviewScheduleControls component and its two
 * wiring sites -- ArcLearningInsightDetailScreen (per-insight) and the
 * new ArcCreativityConnectionDetailScreen (per-connection). No React
 * Native component test renderer exists in this codebase, so this
 * checks the real source text, same convention as every other screen
 * test.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const controls = readSource("build/components/ArcReviewScheduleControls.tsx");
const insightDetail = readSource("build/ArcLearningInsightDetailScreen.tsx");
const connectionList = readSource("build/ArcCreativityConnectionListScreen.tsx");
const connectionDetail = readSource("build/ArcCreativityConnectionDetailScreen.tsx");
const creativityHome = readSource("build/ArcCreativityScreen.tsx");
const learningHome = readSource("build/ArcLearningScreen.tsx");
const learningOverview = readSource("build/ArcLearningReviewOverviewScreen.tsx");
const creativityOverview = readSource("build/ArcCreativityReviewOverviewScreen.tsx");
const layout = readSource("app/_layout.tsx");

test("ArcReviewScheduleControls offers the automatic/manual mode toggle, a preferred-interval-ladder field, a postpone action, and a conditional restore-automatic action -- the exact section 6 list", () => {
  assert.ok(controls.includes('onPress={() => onSetMode("automatic")}'));
  assert.ok(controls.includes('onPress={() => onSetMode("manual")}'));
  assert.ok(controls.includes("מרווחי סקירה מועדפים"));
  assert.ok(controls.includes("דחיית תזמון"));
  assert.ok(controls.includes("hasManualOverride &&"));
  assert.ok(controls.includes("onPress={onRestoreAutomatic}"));
});

test("ArcReviewScheduleControls shows the effective due date and due-state (overdue/due today/upcoming), reading them from the shared engine's own resolvers -- never a second, independent date calculation", () => {
  assert.ok(controls.includes("resolveScheduleDueState(schedule)"));
  assert.ok(controls.includes("resolveEffectiveDueDate(schedule)"));
});

test("postponing opens the SAME MonthlyCalendar component every other date-selection flow uses, and only calls onPostpone once a date is actually picked", () => {
  assert.ok(controls.includes('import MonthlyCalendar from "../../live/components/MonthlyCalendar.tsx";'));
  const fnIndex = controls.indexOf("function confirmPostpone()");
  const fnBody = controls.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("if (!pendingDate) return;"));
  assert.ok(fnBody.includes("onPostpone(`${pendingDate}T00:00:00`);"));
});

test("ArcLearningInsightDetailScreen loads this insight's own ArcLearningReviewSchedule (creating a fresh default in-memory when none exists yet) and persists every control action via upsertArcLearningReviewScheduleEntry, reusing the shared engine functions rather than reimplementing the logic", () => {
  assert.ok(insightDetail.includes("import ArcReviewScheduleControls from \"./components/ArcReviewScheduleControls.tsx\";"));
  assert.ok(insightDetail.includes("schedules.find((candidate) => candidate.insightId === id) ?? createArcLearningReviewSchedule(id, new Date().toISOString())"));
  assert.ok(insightDetail.includes("await upsertArcLearningReviewScheduleEntry(next);"));
  assert.ok(insightDetail.includes("setArcReviewScheduleMode(schedule, mode, new Date().toISOString())"));
  assert.ok(insightDetail.includes("setArcReviewIntervalLadder(schedule, ladder, new Date().toISOString())"));
  assert.ok(insightDetail.includes("postponeArcReview(schedule, newDueAtIso, new Date().toISOString())"));
  assert.ok(insightDetail.includes("restoreAutomaticArcReviewSchedule(schedule, new Date().toISOString())"));
});

test("ArcCreativityConnectionListScreen and ArcCreativityConnectionDetailScreen exist as the connection-side equivalent of the insight list/detail screens, never duplicating insight content -- they only ever reference insightIdA/insightIdB by id", () => {
  assert.ok(connectionList.includes('router.push({ pathname: "/arc-creativity/connections/[id]", params: { id: item.id } })'));
  assert.ok(connectionDetail.includes("import ArcReviewScheduleControls from \"./components/ArcReviewScheduleControls.tsx\";"));
  assert.ok(connectionDetail.includes("schedules.find((candidate) => candidate.connectionId === id) ?? createArcCreativityReviewSchedule(id, new Date().toISOString())"));
  assert.ok(connectionDetail.includes("await upsertArcCreativityReviewScheduleEntry(next);"));
});

test("ARC Creativity home exposes 'קשרים שמורים', routing to the new connection list, and both routes are registered", () => {
  assert.ok(creativityHome.includes("📚 קשרים שמורים"));
  assert.ok(creativityHome.includes('router.push("/arc-creativity/connections")'));
  assert.ok(layout.includes('name="arc-creativity/connections/index"'));
  assert.ok(layout.includes('name="arc-creativity/connections/[id]"'));
});

test("section 6's 'view overdue/upcoming reviews' requirement: both home screens expose 'סקירות ממתינות', routing to a dedicated overview screen, and both routes are registered", () => {
  assert.ok(learningHome.includes("📊 סקירות ממתינות"));
  assert.ok(learningHome.includes('router.push("/arc-learning/overview")'));
  assert.ok(creativityHome.includes("📊 סקירות ממתינות"));
  assert.ok(creativityHome.includes('router.push("/arc-creativity/overview")'));
  assert.ok(layout.includes('name="arc-learning/overview"'));
  assert.ok(layout.includes('name="arc-creativity/overview"'));
});

test("the ARC Learning overview groups ready insights into overdue/due-today/upcoming sections using the SAME engine resolver as everywhere else, treating a never-reviewed insight as overdue (matching resolveDueArcLearningInsightIds' own immediate-recall rule), never a second independently-computed due rule", () => {
  assert.ok(learningOverview.includes("import { isArcLearningInsightReadyForRecall } from \"../arc/arcLearningInsight.ts\";"));
  assert.ok(learningOverview.includes("resolveScheduleDueState(schedule)"));
  assert.ok(learningOverview.includes('const dueState: ArcReviewDueState = schedule ? resolveScheduleDueState(schedule) : "overdue";'));
  assert.ok(learningOverview.includes('["overdue", "due_today", "upcoming"]'));
});

test("the ARC Creativity overview is the connection-side equivalent, grouping every saved connection (not only insight-attached ones) the same way", () => {
  assert.ok(creativityOverview.includes('const dueState: ArcReviewDueState = schedule ? resolveScheduleDueState(schedule) : "overdue";'));
  assert.ok(creativityOverview.includes('router.push({ pathname: "/arc-creativity/connections/[id]", params: { id: item.connection.id } })'));
});
