import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/positiveMemoryArcSuccessIntegration.test.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, Stage E
 * (section 9, "automatic success selection in ARC Success"):
 * source-text regression guard for
 * live/ArcResultPracticeScreen.tsx's own past-success visualization
 * augmentation -- additive only, never replacing any of the four
 * existing ArcResultExercise fields (focusPoint/successVisualization/
 * successMantra/supportiveBodyLanguage) or the existing finish()
 * destinations.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ArcResultPracticeScreen.tsx");

test("imports the ONE reusable selection engine's success-based strategy -- never a second, independently-written matcher", () => {
  assert.ok(screen.includes('import { selectPositiveMemoryForTaskSuccess } from "../arc/positiveMemorySelection.ts";'));
  assert.ok(screen.includes('import { recordPositiveMemorySelection } from "../arc/positiveMemorySelectionHistory.ts";'));
  assert.ok(screen.includes("loadPositiveMemories"));
  assert.ok(screen.includes("loadPositiveMemorySelectionHistory"));
  assert.ok(screen.includes("savePositiveMemorySelectionHistory"));
});

test("new state defaults to inert/null -- a session with no linked task or no relevant documented success renders the existing four fields exactly as before", () => {
  assert.ok(screen.includes("const [pastSuccessMemory, setPastSuccessMemory] = useState<PositiveMemory | null>(null);"));
  assert.ok(screen.includes("const [pastSuccessDismissed, setPastSuccessDismissed] = useState(false);"));
});

test("the focus effect only resolves a past success when taskId is non-null -- an exercise with no linked task never fabricates a search context", () => {
  const effectIndex = screen.indexOf("useFocusEffect(\n    useCallback(() => {");
  const effectBody = screen.slice(effectIndex, effectIndex + 1500);
  assert.ok(effectBody.includes("if (!taskId) {"));
  assert.ok(effectBody.includes("setPastSuccessMemory(null);"));
  assert.ok(effectBody.includes("selectPositiveMemoryForTaskSuccess(memories, taskId, {}, history, []);"));
});

test("a successful selection is recorded into persistent selection history (arc_success context, keyed by taskId) for session-stability/variety rotation", () => {
  const effectIndex = screen.indexOf("useFocusEffect(\n    useCallback(() => {");
  const effectBody = screen.slice(effectIndex, effectIndex + 1700);
  assert.ok(effectBody.includes('recordPositiveMemorySelection(history, picked.id, "arc_success", taskId, new Date().toISOString());'));
});

test("'הצלחה אחרת' excludes every previously-shown id and re-selects among real, non-fabricated past successes", () => {
  const fnIndex = screen.indexOf("const handlePastSuccessAnother = useCallback(async () => {");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 800);
  assert.ok(fnBody.includes("const excludeIds = [...pastSuccessExcludedIds, pastSuccessMemory.id];"));
  assert.ok(fnBody.includes("selectPositiveMemoryForTaskSuccess(memories, taskId, {}, history, excludeIds);"));
});

test("'דלג' only ever dismisses the additive block -- never touches storage, and the original four-field practice screen renders completely unaffected", () => {
  const fnIndex = screen.indexOf("const handlePastSuccessSkip = useCallback(() => {");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, screen.indexOf("}, []);", fnIndex) + 7);
  assert.ok(fnBody.includes("setPastSuccessDismissed(true);"));
  assert.ok(!fnBody.includes("savePositiveMemorySelectionHistory"));
});

test("the visualization block is rendered BEFORE the existing four sections (focus point / success visualization / success mantra / supportive body language), only while a match exists and is not dismissed", () => {
  const blockIndex = screen.indexOf("{pastSuccessMemory && !pastSuccessDismissed && (");
  const focusPointIndex = screen.indexOf("נקודת מיקוד");
  assert.ok(blockIndex !== -1 && focusPointIndex !== -1 && blockIndex < focusPointIndex);
  const blockBody = screen.slice(blockIndex, focusPointIndex);
  assert.ok(blockBody.includes("דמיין את הרגע שבו הצלחת לבצע את הפעולה הזאת בעבר."));
  assert.ok(blockBody.includes("{pastSuccessMemory.title}"));
  assert.ok(blockBody.includes(">הצלחה אחרת<"));
  assert.ok(blockBody.includes(">דלג<"));
  assert.ok(blockBody.includes("onPress={handlePastSuccessAnother}"));
  assert.ok(blockBody.includes("onPress={handlePastSuccessSkip}"));
});

test("the existing four fields and both finish()-destination buttons are completely untouched", () => {
  assert.ok(screen.includes("<Text style={styles.sectionText}>{exercise.focusPoint}</Text>"));
  assert.ok(screen.includes("<Text style={styles.sectionText}>{exercise.successVisualization}</Text>"));
  assert.ok(screen.includes('<Text style={styles.mantraText}>{`"${exercise.successMantra}"`}</Text>'));
  assert.ok(screen.includes("<Text style={styles.sectionText}>{exercise.supportiveBodyLanguage}</Text>"));
  assert.ok(screen.includes('if (origin === "arc-gym") {'));
});
