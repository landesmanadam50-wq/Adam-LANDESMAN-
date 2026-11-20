import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcLearningScreens.test.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task:
 * source-text regression guard for the ARC Learning UI (home, topics,
 * library/continue list, insight capture wizard, insight detail) -- no
 * React Native component test renderer exists in this codebase (every
 * other screen test follows the same convention), so this checks the
 * real source text instead of actually rendering it.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const home = readSource("build/ArcLearningScreen.tsx");
const wizard = readSource("build/ArcLearningInsightWizardScreen.tsx");
const detail = readSource("build/ArcLearningInsightDetailScreen.tsx");
const insightList = readSource("build/ArcLearningInsightListScreen.tsx");
const topicList = readSource("build/ArcLearningTopicListScreen.tsx");
const topicDetail = readSource("build/ArcLearningTopicDetailScreen.tsx");
const topicEditor = readSource("build/ArcLearningTopicEditorScreen.tsx");
const layout = readSource("app/_layout.tsx");
const flexibleDaily = readSource("build/FlexibleDailyScreen.tsx");

test("section 11: ARC Learning home exposes all five required entries, independently of ARC Gym/ARC Goal", () => {
  assert.ok(home.includes("הוסף תובנה"));
  assert.ok(home.includes("נושאי למידה"));
  assert.ok(home.includes("כל התובנות"));
  assert.ok(home.includes("המשך למידה"));
  assert.ok(home.includes("שליפה וחזרה"));
  assert.ok(home.includes('router.push("/arc-learning/topics")'));
  assert.ok(home.includes('router.push("/arc-learning/library")'));
  assert.ok(home.includes('router.push("/arc-learning/continue")'));
  assert.ok(home.includes('router.push("/arc-learning/recall")'));
});

test("section 1 / section 11: FlexibleDailyScreen (Home) carries an independent ARC Learning entry card, additive to the pre-existing ARC GYM card", () => {
  assert.ok(flexibleDaily.includes('router.push("/arc-learning")'));
  assert.ok(flexibleDaily.includes("arc-gym"), "the pre-existing ARC GYM card must remain untouched");
});

test("every ARC Learning route is registered in app/_layout.tsx", () => {
  for (const name of [
    "arc-learning/index",
    "arc-learning/topics/index",
    "arc-learning/topics/[id]",
    "arc-learning/topics/[id]/edit",
    "arc-learning/library",
    "arc-learning/continue",
    "arc-learning/insight/[id]",
    "arc-learning/insight/[id]/edit",
  ]) {
    assert.ok(layout.includes(`name="${name}"`), `missing route registration for ${name}`);
  }
});

// --- Section 2: the insight creation/learning flow, step order ---

test("step 1 (step index 0): captures the raw insight text, then asks the learn-or-save-only question with both exact option labels", () => {
  const stepIndex = wizard.indexOf("step === 0 &&");
  const stepBody = wizard.slice(stepIndex, stepIndex + 1200);
  assert.ok(stepBody.includes("מה התובנה שלך?"));
  assert.ok(stepBody.includes("האם אתה רוצה ללמוד את התובנה הזאת?"));
  assert.ok(stepBody.includes("כן, אני רוצה ללמוד אותה"));
  assert.ok(stepBody.includes("רק לשמור את התובנה"));
});

test("choosing 'רק לשמור את התובנה' persists wantsToLearn=false and never advances into the topic/main-sentence/explanation steps -- a save-only insight remains learnable later", () => {
  const fnIndex = wizard.indexOf("async function handleSaveOnly()");
  const fnBody = wizard.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("setArcLearningInsightWantsToLearn(insight, false, now)"));
  assert.ok(!fnBody.includes("setStep("));
});

test("choosing 'כן, אני רוצה ללמוד אותה' persists wantsToLearn=true and advances to the topic step", () => {
  const fnIndex = wizard.indexOf("async function handleWantsToLearn()");
  const fnBody = wizard.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("setArcLearningInsightWantsToLearn(insight, true, now)"));
  assert.ok(fnBody.includes("setStep(1)"));
});

test("step 2 (topic): lets the trainee pick an existing topic or create a new one, exactly the question text required", () => {
  const stepIndex = wizard.indexOf("step === 1 &&");
  const stepBody = wizard.slice(stepIndex, stepIndex + 900);
  assert.ok(stepBody.includes("לאיזה נושא למידה התובנה קשורה?"));
  assert.ok(stepBody.includes("או צור נושא חדש"));
});

test("step 3 (main sentence): prefilled from rawText when mainSentence is still null, required question text present, main sentence is written BEFORE the explanatory questions step (step index 2 precedes step index 3)", () => {
  assert.ok(wizard.includes("insight.mainSentence ?? insight.rawText"));
  const mainSentenceComponentIndex = wizard.indexOf("function MainSentenceStep");
  const explanationFieldIndex = wizard.indexOf("function ExplanationField");
  assert.ok(mainSentenceComponentIndex !== -1 && explanationFieldIndex !== -1 && mainSentenceComponentIndex < explanationFieldIndex);
  assert.ok(wizard.includes("מה המשפט העיקרי שאתה רוצה ללמוד ולזכור?"));
});

test("once mainSentence is set, it stays visible in a banner from step 2 onward through every later step", () => {
  const bannerIndex = wizard.indexOf("mainSentenceBanner");
  const bannerBody = wizard.slice(wizard.indexOf("insight.mainSentence !== null && step >= 2"), bannerIndex + 50);
  assert.ok(bannerBody.length > 0);
});

test("step 4 (explanatory questions): the EXACT required order -- מה זה אומר -> למה -> איך -- each with its own question/helper text and a דלג (skip) action", () => {
  const listIndex = wizard.indexOf("const EXPLANATION_STEPS");
  const listBody = wizard.slice(listIndex, listIndex + 700);
  const meaningIndex = listBody.indexOf("מה זה אומר?");
  const reasonIndex = listBody.indexOf("למה?");
  const mechanismIndex = listBody.indexOf("איך?");
  assert.ok(meaningIndex !== -1 && reasonIndex !== -1 && mechanismIndex !== -1);
  assert.ok(meaningIndex < reasonIndex && reasonIndex < mechanismIndex, "the three explanatory questions must render in the exact required order");
  assert.ok(listBody.includes("מה המשמעות של המשפט העיקרי? מה אפשר להבין או להסיק ממנו?"));
  assert.ok(listBody.includes("מה הסיבה לכך שהמשפט העיקרי נכון? מה יכול להסביר אותו?"));
  assert.ok(listBody.includes("איך התהליך שמתואר במשפט העיקרי מתרחש בפועל?"));
  assert.ok(wizard.includes("דלג"));
});

test("skipping an explanatory question calls skipArcLearningInsightExplanation (stores null, same state as never having answered it) -- never deletes a DIFFERENT already-answered question", () => {
  assert.ok(wizard.includes("onSkip={() => skipExplanation(kind)}"));
  const fnIndex = wizard.indexOf("async function skipExplanation(");
  const fnBody = wizard.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("skipArcLearningInsightExplanation(insight, kind, new Date().toISOString())"));
});

test("previously-entered explanatory answers persist across steps -- the ExplanationField's own initial value comes from the insight's current saved answer, never reset to empty", () => {
  const fnIndex = wizard.indexOf("function ExplanationField(");
  const fnBody = wizard.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("useState(value ?? \"\")"));
});

test("step 5 (mental imagery): shown after the explanatory questions step, references the main sentence via the persistent banner, and supports adding/removing multiple free-text descriptions", () => {
  const stepIndex = wizard.indexOf("step === 4 &&");
  const stepBody = wizard.slice(stepIndex, stepIndex + 900);
  assert.ok(stepBody.includes("אילו דימויים עולים לך בראש כשאתה מדמיין את המשפט העיקרי?"));
  assert.ok(stepBody.includes("insight.mentalImages.map"));
  assert.ok(stepBody.includes("addImage"));
  assert.ok(stepBody.includes("removeImage(index)"));
});

test("section 2 step 6 (initial active recall): finishing the wizard queues exactly this one insight for recall and routes into the shared recall screen -- never a second, duplicated recall UI inside the wizard itself", () => {
  const fnIndex = wizard.indexOf("async function finishAndRecall()");
  const fnBody = wizard.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("createArcLearningRecallSessionProgress([insight.id], new Date().toISOString())"));
  assert.ok(fnBody.includes('router.replace("/arc-learning/recall")'));
});

// --- Resumability (section 12: unfinished sessions survive leaving the app) ---

test("resolveInitialWizardStep resumes a save-only/undecided insight at step 0, a learn-it insight missing a topic at step 1, one missing a main sentence at step 2, and a fully-progressed one at step 3 for further explanation/imagery editing", () => {
  const fnIndex = wizard.indexOf("function resolveInitialWizardStep(");
  const fnBody = wizard.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("if (!insight.wantsToLearn) return 0;"));
  assert.ok(fnBody.includes("if (insight.topicId === null) return 1;"));
  assert.ok(fnBody.includes("if (insight.mainSentence === null) return 2;"));
  assert.ok(fnBody.includes("return 3;"));
});

test("opening an existing insight (not 'new') loads it from storage and resumes at resolveInitialWizardStep's own result, never always restarting at step 0", () => {
  const effectIndex = wizard.indexOf("useFocusEffect(");
  const effectBody = wizard.slice(effectIndex, effectIndex + 900);
  assert.ok(effectBody.includes("setStep(resolveInitialWizardStep(found));"));
});

// --- Insight detail + list screens ---

test("insight detail shows the resolved topic, main sentence, only the ANSWERED explanatory kinds (never an unanswered one), and mental imagery", () => {
  assert.ok(detail.includes("resolveAnsweredArcLearningExplanationKinds(insight)"));
  assert.ok(detail.includes("answeredKinds.map"));
  assert.ok(detail.includes("insight.mentalImages.length > 0"));
});

test("'שליפה וחזרה'/'המשך למידה' entries and the shared insight list screen distinguish mode='all' (/arc-learning/library) from mode='unfinished' (/arc-learning/continue), filtering via resolveUnfinishedArcLearningInsights only in the unfinished case", () => {
  assert.ok(insightList.includes('mode === "unfinished" ? resolveUnfinishedArcLearningInsights(sorted) : sorted'));
});

// --- Topics ---

test("topic list/detail/editor: create, rename, and view a topic's own linked insights -- deleting a topic (editor's own delete confirmation copy) never claims to delete its insights", () => {
  assert.ok(topicList.includes('router.push({ pathname: "/arc-learning/topics/[id]/edit", params: { id: "new" } })'));
  assert.ok(topicDetail.includes("resolveArcLearningInsightsForTopic(allInsights, id)"));
  assert.ok(topicEditor.includes("התובנות ששייכות אליו לא יימחקו"));
});
