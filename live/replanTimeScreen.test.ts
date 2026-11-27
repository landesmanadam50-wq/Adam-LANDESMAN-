import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/replanTimeScreen.test.ts
 *
 * ARCHI -- Replan Time task: source-text regression guard for
 * live/ReplanTimeScreen.tsx (the screen the new notification opens),
 * its thin route wrapper, and its route registration. The check-in
 * dispatch itself is covered directly by
 * data/emotionalCheckInRouting.test.ts; the day-plan editing it mounts
 * is covered by build/flexibleDailyScreen.test.ts and
 * build/timePlanningModal.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ReplanTimeScreen.tsx");
const route = readSource("app/replan-time.tsx");
const layout = readSource("app/_layout.tsx");

test("required (section 2): the question 'איך אתה מרגיש כרגע?' is shown at the top of the screen", () => {
  assert.ok(screen.includes("איך אתה מרגיש כרגע?"));
});

test("required (section 2): mounts the SAME shared 3-smiley EmotionalCheckInButtons component every other check-in surface uses -- never a second, separately-authored smiley row", () => {
  assert.match(screen, /import EmotionalCheckInButtons from "\.\/components\/EmotionalCheckInButtons\.tsx";/);
  assert.ok(screen.includes("<EmotionalCheckInButtons"));
  assert.ok(screen.includes("onFullArc={() => handleCheckIn(\"full_arc\")}"));
  assert.ok(screen.includes("onShortenedArc={() => handleCheckIn(\"shortened_arc\")}"));
  assert.ok(screen.includes("onExcellent={() => handleCheckIn(\"next_task\")}"));
});

test("required: each smiley routes through the shared handleEmotionalCheckInChoice dispatcher with returnToReplan: true, never a second, separately-authored ARC-routing mechanism", () => {
  const fnIndex = screen.indexOf("function handleCheckIn(");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("void handleEmotionalCheckInChoice(choice, null, { returnToReplan: true });"));
});

test("required (section 2): below the check-in, mounts build/FlexibleDailyScreen.tsx with NO date prop (so isTodayMode stays true, keeping every existing sync behavior in its own reload()) and hideHomeOnlyCards -- never a second, parallel day-plan data source", () => {
  assert.match(screen, /import FlexibleDailyScreen from "\.\.\/build\/FlexibleDailyScreen\.tsx";/);
  assert.ok(screen.includes("<FlexibleDailyScreen hideHomeOnlyCards />"), "no date prop -- isTodayMode must stay true");
});

test("required: the route wrapper is a plain param-free render, same convention as every other static route wrapper in this app", () => {
  assert.match(route, /import ReplanTimeScreen from "\.\.\/live\/ReplanTimeScreen\.tsx";/);
  assert.ok(route.includes("<ReplanTimeScreen />"));
});

test("required: the route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="replan-time"/);
});
