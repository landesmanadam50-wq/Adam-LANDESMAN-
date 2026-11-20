import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcCreativityScreens.test.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task:
 * source-text regression guard for the ARC Creativity UI (home, modes
 * A-D) -- no React Native component test renderer exists in this
 * codebase, so this checks the real source text, same convention as
 * every other screen test.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const home = readSource("build/ArcCreativityScreen.tsx");
const modeA = readSource("build/ArcCreativityModeAScreen.tsx");
const modeB = readSource("build/ArcCreativityModeBScreen.tsx");
const modeC = readSource("build/ArcCreativityModeCScreen.tsx");
const modeD = readSource("build/ArcCreativityRecallScreen.tsx");
const layout = readSource("app/_layout.tsx");
const flexibleDaily = readSource("build/FlexibleDailyScreen.tsx");

test("section 11: ARC Creativity home exposes all four required entries, independently of ARC Learning/ARC Gym/ARC Goal", () => {
  assert.ok(home.includes("קשרים מוצעים"));
  assert.ok(home.includes("יצירתיות בין נושאים"));
  assert.ok(home.includes("יצירתיות בתוך נושא"));
  assert.ok(home.includes("שליפת קשרים"));
  assert.ok(home.includes('router.push("/arc-creativity/suggested")'));
  assert.ok(home.includes('router.push("/arc-creativity/cross-topic")'));
  assert.ok(home.includes('router.push("/arc-creativity/within-topic")'));
  assert.ok(home.includes('router.push("/arc-creativity/recall")'));
});

test("FlexibleDailyScreen (Home) carries an independent ARC Creativity entry card, additive to the ARC Learning/ARC GYM cards", () => {
  assert.ok(flexibleDaily.includes('router.push("/arc-creativity")'));
});

test("every ARC Creativity route is registered in app/_layout.tsx", () => {
  for (const name of ["arc-creativity/index", "arc-creativity/suggested", "arc-creativity/cross-topic", "arc-creativity/within-topic", "arc-creativity/recall"]) {
    assert.ok(layout.includes(`name="${name}"`), `missing route registration for ${name}`);
  }
});

// --- Mode A: suggested connections ---

test("Mode A: asks the trainee's own question and lets them answer BEFORE the suggestion is revealed -- the reveal button, not auto-display, controls when the suggestion appears", () => {
  assert.ok(modeA.includes("איזה קשר אתה מזהה בין שתי התובנות?"));
  const revealGuardIndex = modeA.indexOf("{!revealed && (");
  const revealedBlockIndex = modeA.indexOf("{revealed && (");
  assert.ok(revealGuardIndex !== -1 && revealedBlockIndex !== -1 && revealGuardIndex < revealedBlockIndex);
});

test("Mode A: the revealed suggestion is explicitly labeled with its classification and never presented as established fact", () => {
  assert.ok(modeA.includes("לא עובדה מוכחת"));
  assert.ok(modeA.includes("CLASSIFICATION_LABELS[suggestion.suggestedClassification]"));
});

test("Mode A: saving records source 'ai_suggested' and the trainee's own independent explanation, and rejecting loads a different pair rather than forcing a save", () => {
  const fnIndex = modeA.indexOf("async function save()");
  const fnBody = modeA.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('"ai_suggested"'));
  assert.ok(fnBody.includes("setArcCreativityConnectionUserExplanation("));
  assert.ok(modeA.includes("onPress={loadSuggestion}"));
});

// --- Mode B: cross-topic creativity ---

const modeBComponentIndex = modeB.indexOf("export default function ArcCreativityModeBScreen");
const modeBComponentBody = modeB.slice(modeBComponentIndex);

test("Mode B: uses the cross-topic pair picker (never the within-topic or suggested one), asks both required questions in order, the second marked optional", () => {
  assert.ok(modeB.includes("pickRandomCrossTopicInsightPair(insights, connections)"));
  const relationshipQuestionIndex = modeBComponentBody.indexOf("איזה קשר יצירתי אפשר למצוא בין שתי התובנות?");
  const newIdeaQuestionIndex = modeBComponentBody.indexOf("איזה רעיון חדש אפשר ליצור מהשילוב ביניהן?");
  assert.ok(relationshipQuestionIndex !== -1 && newIdeaQuestionIndex !== -1 && relationshipQuestionIndex < newIdeaQuestionIndex);
  assert.ok(modeBComponentBody.slice(newIdeaQuestionIndex, newIdeaQuestionIndex + 60).includes("אופציונלי"));
});

test("Mode B: source is 'random_cross_topic', and the 'הפוך לתובנה חדשה' Pressable only appears once a new-principle idea was actually written, converting via createArcLearningInsightFromConnection and routing into the normal ARC Learning wizard", () => {
  assert.ok(modeB.includes('"random_cross_topic"'));
  assert.ok(modeB.includes("createArcLearningInsightFromConnection("));
  assert.ok(modeB.includes('router.push({ pathname: "/arc-learning/insight/[id]/edit"'));
  const convertButtonIndex = modeBComponentBody.indexOf("onPress={convertToNewInsight}");
  assert.ok(convertButtonIndex !== -1);
  assert.ok(modeBComponentBody.slice(Math.max(0, convertButtonIndex - 300), convertButtonIndex).includes("newPrincipleText.trim().length > 0"));
});

// --- Mode C: within-topic creativity ---

test("Mode C: requires picking a topic first, then uses the within-topic pair picker scoped to that topic", () => {
  assert.ok(modeC.includes("בחר נושא"));
  const pickIndex = modeC.indexOf("async function selectTopic(");
  const pickBody = modeC.slice(pickIndex, pickIndex + 200);
  assert.ok(pickBody.includes("loadPairForTopic"));
  assert.ok(modeC.includes("pickRandomWithinTopicInsightPair(insights, topicId, connections)"));
});

test("Mode C: 'אין קשר ברור' is offered as its own directly-saveable button, never gated behind filling in the relationship text field first", () => {
  const buttonIndex = modeC.indexOf('onPress={() => save("אין קשר ברור")}');
  assert.ok(buttonIndex !== -1);
  const fnIndex = modeC.indexOf("async function save(");
  const fnBody = modeC.slice(fnIndex, fnIndex + 100);
  assert.ok(!fnBody.includes("if (!relationship.trim())"), "save() must accept the literal 'אין קשר ברור' without requiring additional text");
});

test("Mode C: classifies a literal 'אין קשר ברור' save as classification 'no_clear_connection', and any other saved text as 'possible'", () => {
  const fnIndex = modeC.indexOf("async function save(");
  const fnBody = modeC.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes('relationship.trim() === "אין קשר ברור" ? "no_clear_connection" : "possible"'));
});

// --- Mode D: connection recall ---

test("Mode D: shows both main sentences WITHOUT the saved relationship, asks the trainee to reconstruct it, and only reveals after an explicit action", () => {
  assert.ok(modeD.includes("איזה קשר מצאת בעבר בין שתי התובנות?"));
  const revealButtonIndex = modeD.indexOf("הצג את הקשר שנשמר");
  const revealedBlockIndex = modeD.indexOf("connection.relationship");
  assert.ok(revealButtonIndex !== -1 && revealedBlockIndex !== -1 && revealButtonIndex < revealedBlockIndex);
});

test("Mode D: records recall via the creativity-only storage entry point and resolves its own due queue -- never imports arc/arcLearningReview.ts's collections, so recalling a connection can never count as recalling the underlying insights", () => {
  assert.ok(modeD.includes("recordArcCreativityRecallEntry("));
  assert.ok(modeD.includes("resolveDueArcCreativityConnectionIds("));
  assert.ok(!modeD.includes('from "../arc/arcLearningReview.ts"'));
  assert.ok(!modeD.includes("recordArcLearningRecallEntry"));
});

test("Mode D: resumes an existing in-progress queue if one is saved, never silently rebuilding a fresh one over it", () => {
  const effectIndex = modeD.indexOf("useFocusEffect(");
  const effectBody = modeD.slice(effectIndex, effectIndex + 900);
  assert.ok(effectBody.includes("const existing = await loadArcCreativityRecallSessionProgress();"));
  assert.ok(effectBody.includes("if (existing) {"));
});
