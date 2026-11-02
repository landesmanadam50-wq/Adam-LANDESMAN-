import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/reactiveFactorRoutes.test.ts
 *
 * Productivity roadmap, Stages L–U: source-text regression guard for
 * the entire "what is interfering right now?" route tree -- every
 * screen is registered, every destination the chooser names actually
 * exists, and the two task-detail entry buttons reach the chooser
 * (never the old generic /live/select for "משהו מפריע").
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const chooserScreen = readSource("live/ReactiveFactorChooserScreen.tsx");
const savedFactorScreen = readSource("live/SavedFactorChooserScreen.tsx");
const newFactorScreen = readSource("live/NewFactorCaptureScreen.tsx");
const emotionScreen = readSource("live/EmotionIdentificationScreen.tsx");
const neutralScreen = readSource("live/NeutralRegulationScreen.tsx");
const presenceScreen = readSource("live/PresenceProtocolScreen.tsx");
const energyScreen = readSource("live/LowEnergyScreen.tsx");
const practicalScreen = readSource("live/PracticalTaskSupportScreen.tsx");
const interruptionScreen = readSource("live/ExternalInterruptionScreen.tsx");

const EXPECTED_ROUTES = [
  "tasks/[id]/factor/index",
  "tasks/[id]/factor/emotion",
  "tasks/[id]/factor/neutral",
  "tasks/[id]/factor/saved",
  "tasks/[id]/factor/new",
  "tasks/[id]/factor/presence",
  "tasks/[id]/factor/energy",
  "tasks/[id]/factor/practical",
  "tasks/[id]/factor/interruption",
];

test("every factor route is registered in app/_layout.tsx", () => {
  for (const route of EXPECTED_ROUTES) {
    assert.match(layout, new RegExp(`<Stack\\.Screen name="${route.replace(/\//g, "\\/").replace(/\[/g, "\\[").replace(/\]/g, "\\]")}"`), `missing registration for ${route}`);
  }
});

test("ActiveTaskScreen's 'משהו מפריע' button (both pre-start and during-timer) routes to the new reactive chooser, never the old generic /live/select", () => {
  const matches = activeTaskScreen.match(/pathname:\s*"\/tasks\/\[id\]\/factor",\s*params:\s*\{\s*id:\s*task\.id\s*\}/g) ?? [];
  assert.equal(matches.length, 2, "both the pre-start and during-timer 'משהו מפריע' buttons must route to the new chooser");
});

test("ActiveTaskScreen still offers 'בוא נעשה ARC עכשיו' straight to /live/select, pre-start and during the timer", () => {
  const matches = activeTaskScreen.match(/pathname:\s*"\/live\/select",\s*params:\s*\{\s*returnToTaskId:\s*task\.id\s*\}/g) ?? [];
  assert.ok(matches.length >= 2);
});

test("the chooser screen's routing switch names a real route for every one of the 9 categories' destination kinds", () => {
  assert.match(chooserScreen, /resolveReactiveFactorDestination\(category\)/);
  for (const path of [
    "/tasks/[id]/factor/saved",
    "/tasks/[id]/factor/emotion",
    "/tasks/[id]/factor/neutral",
    "/tasks/[id]/factor/presence",
    "/tasks/[id]/factor/energy",
    "/tasks/[id]/factor/practical",
    "/tasks/[id]/factor/interruption",
  ]) {
    assert.ok(chooserScreen.includes(path), `chooser must route to ${path}`);
  }
});

test("SavedFactorChooserScreen's saved items route to each kind's own existing LIVE screen WITH returnToTaskId, and 'new, not saved' routes to the shared capture screen", () => {
  assert.ok(savedFactorScreen.includes("returnToTaskId: taskId"));
  assert.match(savedFactorScreen, /pathname:\s*"\/tasks\/\[id\]\/factor\/new",\s*params:\s*\{\s*id:\s*taskId,\s*factorKind\s*\}/);
});

test("NewFactorCaptureScreen saves via arc/reviewLaterFactor.ts (never a real UrgeArc/ThoughtArc/BeliefArc) and always continues into the neutral regulation route", () => {
  assert.match(newFactorScreen, /import\s*\{[\s\S]*?createReviewLaterFactor[\s\S]*?\}\s*from\s*["']\.\.\/arc\/reviewLaterFactor\.ts["']/);
  assert.ok(newFactorScreen.includes('pathname: "/tasks/[id]/factor/neutral"'));
  assert.ok(!newFactorScreen.includes("upsertUrgeArc") && !newFactorScreen.includes("upsertThoughtArc") && !newFactorScreen.includes("upsertBeliefArc"));
});

test("NewFactorCaptureScreen always asks the thought-vs-belief gate for thought/belief, and skips it for urge", () => {
  assert.ok(newFactorScreen.includes('factorKind === "urge" ? { step: "label", resolvedKind: "urge" } : { step: "gate" }'));
});

test("EmotionIdentificationScreen never declares an emotion automatically -- confirm/choose-another/decline are all offered, and 'none fits'/'I do not know both' route straight to neutral, never a forced guess", () => {
  assert.ok(emotionScreen.includes('setPhase({ step: "confirm"'));
  assert.ok(emotionScreen.includes('setPhase({ step: "chooseAnother" })'));
  assert.ok(emotionScreen.includes("goToNeutral"));
});

test("NeutralRegulationScreen never blocks on an unidentified factor -- every phase has a 'skip and start' or 'continue' path to opening the task", () => {
  const openTaskCount = (neutralScreen.match(/onPress={openTask}/g) ?? []).length;
  assert.ok(openTaskCount >= 2);
});

test("PresenceProtocolScreen uses the exact spec rating bands via resolvePresenceStageCount, never a re-derived threshold", () => {
  assert.match(presenceScreen, /import\s*\{[\s\S]*?resolvePresenceStageCount[\s\S]*?\}\s*from\s*["']\.\.\/arc\/taskSupportRoutes\.ts["']/);
});

test("LowEnergyScreen never routes into an emotional protocol -- it has no import of emotion/urge/thought/belief modules", () => {
  assert.ok(!energyScreen.includes("emotionIdentification") && !energyScreen.includes("UrgeArc") && !energyScreen.includes("ThoughtArc") && !energyScreen.includes("BeliefArc"));
});

test("PracticalTaskSupportScreen updates the task's currentAction (never firstAction) via the shared setTaskCurrentAction, and sets expectedDurationMinutes only when a start time was chosen", () => {
  assert.match(practicalScreen, /import\s*\{[\s\S]*?setTaskCurrentAction[\s\S]*?\}\s*from\s*["']\.\.\/arc\/tasks\.ts["']/);
  assert.ok(practicalScreen.includes("setTaskCurrentAction(task, answers.smallestNextAction.trim(), now)"));
  assert.ok(practicalScreen.includes("answers.startMinutes ? { ...narrowed, expectedDurationMinutes: answers.startMinutes"));
});

test("ExternalInterruptionScreen's 'reschedule'/'return later' reuse the task's existing postpone prompt (openPostpone), never a duplicated postponement UI", () => {
  const matches = interruptionScreen.match(/openPostpone:\s*"1"/g) ?? [];
  assert.equal(matches.length, 1, "one shared branch for both reschedule and returnLater");
});
