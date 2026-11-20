import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/positiveMemoryTaskCompletionDoc.test.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, sections
 * 10-12 ("Update ARC Success reflection questions" / "allow skipping
 * documentation after task completion" / "save completed success
 * reflections as memories"): source-text regression guard for
 * live/SessionReflectionScreen.tsx's additive integration -- no React
 * Native component test renderer exists in this codebase, same
 * convention as every other screen test.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/SessionReflectionScreen.tsx");

test("section 11: the completion-time choice offers exactly two options, additive and optional -- never gating the existing favoritePartText question/buttons below it", () => {
  assert.ok(screen.includes('successDocChoice === "undecided"'));
  assert.ok(screen.includes(">תעד הצלחה<"));
  assert.ok(screen.includes(">דלג על התיעוד<"));
  const favoriteQuestionIndex = screen.indexOf("לאיזה חלק מהמשימה הכי התחברתי?");
  assert.ok(favoriteQuestionIndex !== -1, "the existing favoritePartText question must still render unconditionally");
});

test("section 11: 'דלג על התיעוד' only ever flips the choice to 'skipped' -- never calls any positive-memory storage function, never creates an empty record", () => {
  const fnIndex = screen.indexOf("function skipSuccessDocumentation() {");
  const fnBody = screen.slice(fnIndex, screen.indexOf("}", fnIndex) + 1);
  assert.ok(fnBody.includes('setSuccessDocChoice("skipped");'));
  assert.ok(!fnBody.includes("upsertPositiveMemoryEntry"));
  assert.ok(!fnBody.includes("upsertPositiveMemoryDraftEntry"));
});

test("section 10: 'תעד הצלחה' reveals exactly the four required questions in order, question 2 personalized via resolveSuccessFeelingQuestionText (never a hardcoded/guessed feeling)", () => {
  const blockIndex = screen.indexOf('successDocChoice === "documenting"');
  const blockBody = screen.slice(blockIndex, screen.indexOf("{successSaved &&", blockIndex));
  const q1 = blockBody.indexOf("במה הצלחתי?");
  const q2 = blockBody.indexOf("{resolveSuccessFeelingQuestionText()}");
  const q3 = blockBody.indexOf("איפה ומתי זה קרה?");
  const q4 = blockBody.indexOf("מה היה מיוחד בחלק הזה של הפעולה?");
  assert.ok(q1 !== -1 && q2 !== -1 && q3 !== -1 && q4 !== -1);
  assert.ok(q1 < q2 && q2 < q3 && q3 < q4, "the four questions must appear in the exact required order");
});

test("section 10: question 2 is personalized to the REAL resolved encoding feeling when known, and falls back to the generic (never-assumed) wording when it is not", () => {
  const fnIndex = screen.indexOf("function resolveSuccessFeelingQuestionText()");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("return lastEncodingFeeling"));
  assert.ok(fnBody.includes("באיזה חלק מהפעולה הרגשת ${lastEncodingFeeling}"));
  assert.ok(fnBody.includes(': "באיזה חלק מהפעולה הרגשת את התחושה שחווית בקידוד?";'));
});

test("section 10: the user can report the expected feeling was NOT actually experienced, via a dedicated checkbox that disables the feeling-part input", () => {
  assert.ok(screen.includes("בפועל לא הרגשתי את התחושה הזאת"));
  assert.ok(screen.includes("editable={!successFeelingNotExperienced}"));
});

test("section 12: 'שמור כהצלחה חדשה' finalizes ONLY on this explicit tap -- a synchronous ref guard prevents a double-tap/re-entry from ever creating two records", () => {
  const fnIndex = screen.indexOf("async function saveAsNewSuccess() {");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (savingSuccessRef.current || successSaved) return;"));
  assert.ok(fnBody.includes("savingSuccessRef.current = true;"));
  assert.ok(fnBody.includes("taskId,"), "the saved success memory must be linked to this completed task");
  assert.ok(fnBody.includes("await upsertPositiveMemoryEntry(memory);"));
  assert.ok(fnBody.includes("setSuccessSaved(true);"));
});

test("section 12: the saved success NEVER falsely carries the encoding feeling when the user indicated it was not experienced -- feelings are attached only when a real feeling word, a non-empty answer, AND the checkbox are all satisfied", () => {
  const fnIndex = screen.indexOf("async function saveAsNewSuccess() {");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (!successFeelingNotExperienced && lastEncodingFeeling && successFeelingPart.trim()) {"));
  assert.ok(fnBody.includes("setPositiveMemoryFeelings(memory, [{ feeling: lastEncodingFeeling, moment: successFeelingPart, intensity: null }], now);"));
});

test("section 11: exiting documentation mid-way preserves the incomplete work as a REAL PositiveMemoryDraft -- structurally distinct from a finalized memory, never calling upsertPositiveMemoryEntry", () => {
  const fnIndex = screen.indexOf("async function exitSuccessDocumentationAsDraft() {");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('createPositiveMemoryDraft(generatePositiveMemoryDraftId(), "success", "task_completion_reflection", now, taskId);'));
  assert.ok(fnBody.includes("await upsertPositiveMemoryDraftEntry(withFields);"));
  assert.ok(!fnBody.includes("upsertPositiveMemoryEntry("));
  assert.ok(fnBody.includes('setSuccessDocChoice("skipped");'), "exiting must return to the non-blocking state, never leaving the screen stuck");
});

test("the real encoding feeling is loaded per-task via loadLastEncodingFeelingForTask, alongside the existing getTask load, in the same useFocusEffect", () => {
  const effectIndex = screen.indexOf("useFocusEffect(\n    useCallback(() => {");
  const effectBody = screen.slice(effectIndex, effectIndex + 300);
  assert.ok(effectBody.includes("getTask(taskId).then(setTask);"));
  assert.ok(effectBody.includes("loadLastEncodingFeelingForTask(taskId).then(setLastEncodingFeeling);"));
});

test("the existing finish()/goToPostTaskReward()/favoritePartText question and their own saveNewTaskReflection call are completely untouched", () => {
  assert.ok(screen.includes("async function finish() {"));
  assert.ok(screen.includes("await saveNewTaskReflection(taskId, favoritePartText, new Date());"));
  assert.ok(screen.includes("function goToPostTaskReward() {"));
  assert.ok(screen.includes('<Pressable style={styles.primaryButton} onPress={finish}>'));
  assert.ok(screen.includes('<Pressable style={styles.skipLink} onPress={goToPostTaskReward}>'));
});
