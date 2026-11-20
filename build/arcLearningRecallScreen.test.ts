import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcLearningRecallScreen.test.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task:
 * source-text regression guard for build/ArcLearningRecallScreen.tsx --
 * no React Native component test renderer exists in this codebase, so
 * this checks the real source text, same convention as every other
 * screen test.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/ArcLearningRecallScreen.tsx");
const layout = readSource("app/_layout.tsx");

test("the route is registered", () => {
  assert.ok(layout.includes('name="arc-learning/recall"'));
});

test("on focus, resumes an existing in-progress recall queue if one is saved, never silently discarding it by rebuilding a fresh one", () => {
  const effectIndex = screen.indexOf("useFocusEffect(");
  const effectBody = screen.slice(effectIndex, effectIndex + 900);
  assert.ok(effectBody.includes("const existing = await loadArcLearningRecallSessionProgress();"));
  assert.ok(effectBody.includes("if (existing) {"));
});

test("with no in-progress queue, builds a fresh one from resolveDueArcLearningInsightIds -- 'the spaced repetition algorithm decides which insights are due' (section 9's own core principle)", () => {
  const effectIndex = screen.indexOf("useFocusEffect(");
  const effectBody = screen.slice(effectIndex, effectIndex + 1400);
  assert.ok(effectBody.includes("resolveDueArcLearningInsightIds(insights, schedules, new Date())"));
  assert.ok(effectBody.includes("await saveArcLearningRecallSessionProgress(fresh);"));
});

test("recall order: main sentence is asked and can be revealed BEFORE any explanatory question or imagery is shown", () => {
  const sentenceBlockIndex = screen.indexOf('phase === "sentence" && (');
  const explanationsBlockIndex = screen.indexOf('phase === "explanations" && currentKind && (');
  const imageryBlockIndex = screen.indexOf('phase === "imagery" && (');
  assert.ok(sentenceBlockIndex !== -1 && sentenceBlockIndex < explanationsBlockIndex && explanationsBlockIndex < imageryBlockIndex);
  const sentenceBody = screen.slice(sentenceBlockIndex, explanationsBlockIndex);
  assert.ok(sentenceBody.includes("מה המשפט העיקרי שלמדת?"));
  assert.ok(sentenceBody.includes("insight.mainSentence"));
});

test("only the ANSWERED explanatory kinds are offered for reconstruction, via resolveAnsweredArcLearningExplanationKinds -- never a skipped/unanswered one", () => {
  assert.ok(screen.includes("resolveAnsweredArcLearningExplanationKinds(insight)"));
  assert.ok(screen.includes("answeredKinds[explanationIndex]"));
});

test("explanatory reconstruction and mental-imagery recall both keep the main sentence visible as a reminder, and ask the trainee to recall BEFORE revealing the saved answer", () => {
  const explanationsBlockIndex = screen.indexOf('phase === "explanations" && currentKind && (');
  const imageryBlockIndex = screen.indexOf('phase === "imagery" && (');
  const rateBlockIndex = screen.indexOf('phase === "rate" && (');
  assert.ok(explanationsBlockIndex !== -1 && imageryBlockIndex !== -1 && rateBlockIndex !== -1);
  const explanationsBody = screen.slice(explanationsBlockIndex, imageryBlockIndex);
  const imageryBody = screen.slice(imageryBlockIndex, rateBlockIndex);
  assert.ok(explanationsBody.includes("insight.mainSentence") && explanationsBody.includes("!revealed &&"));
  assert.ok(imageryBody.includes("insight.mainSentence") && imageryBody.includes("!revealed &&"));
  assert.ok(imageryBody.includes("אילו דימויים מנטליים קישרת למשפט העיקרי?"));
});

test("final rating step offers exactly the four ArcRecallRating values with Hebrew labels, each recording the recall and advancing the queue", () => {
  const rateBlockIndex = screen.indexOf('phase === "rate"');
  const rateBody = screen.slice(rateBlockIndex, rateBlockIndex + 600);
  assert.ok(rateBody.includes("כמה הצלחת לשלוף את התובנה?"));
  assert.ok(screen.includes('{ rating: "forgot", label: "לא זכרתי" }'));
  assert.ok(screen.includes('{ rating: "hard", label: "קשה" }'));
  assert.ok(screen.includes('{ rating: "good", label: "טוב" }'));
  assert.ok(screen.includes('{ rating: "easy", label: "קל" }'));
  assert.ok(rateBody.includes("onPress={() => finishInsightAndAdvance(option.rating)}"));
});

test("finishInsightAndAdvance records the recall through the shared storage orchestration entry point (never duplicated inline schedule/history writes), advances the queue, and clears the progress slot once the queue is exhausted -- section 9's own 'prevent duplicate review completions' structurally falls out of always consulting the one schedule-backed due-resolver", () => {
  const fnIndex = screen.indexOf("async function finishInsightAndAdvance(");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("await recordArcLearningRecallEntry(insight.id, rating,"));
  assert.ok(fnBody.includes("advanceArcLearningRecallSessionProgress(progress)"));
  assert.ok(fnBody.includes("await clearArcLearningRecallSessionProgress();"));
});

test("an empty queue (nothing due) shows a completion message and a way back to ARC Learning home, never a crash or a stuck loading state", () => {
  assert.ok(screen.includes("סיימת את כל השליפות להיום!"));
  assert.ok(screen.includes('router.replace("/arc-learning")'));
});
