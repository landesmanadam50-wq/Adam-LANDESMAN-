import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/taskEditorFeelingsSection.test.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
 * section 3: source-text regression guard for TaskEditorScreen.tsx's
 * new "supportive feelings / internal actions" section -- visually
 * separate from the pre-existing defaultSupportiveStateId picker,
 * always optional, only shown once the task has a real id.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const screen = readSource("build/TaskEditorScreen.tsx");

test("imports every supportive-feeling/internal-action primitive it needs, from the exact Phase 1/2 modules -- never a second, parallel implementation", () => {
  assert.match(screen, /from ["']\.\.\/arc\/supportiveFeelings\.ts["']/);
  assert.ok(screen.includes("createInternalAction"));
  assert.ok(screen.includes("createSupportiveFeeling"));
  assert.ok(screen.includes("findInternalActionByText"));
  assert.ok(screen.includes("findSupportiveFeelingByLabel"));
  assert.ok(screen.includes("resolveActionsForFeeling"));
  assert.ok(screen.includes("resolveFeelingsForTask"));
  assert.ok(screen.includes("linkInternalActionToFeeling"));
  assert.ok(screen.includes("linkSupportiveFeelingToTask"));
  assert.ok(screen.includes("unlinkInternalActionFromFeeling"));
  assert.ok(screen.includes("unlinkSupportiveFeelingFromTask"));
});

test("the section is visually separate from defaultSupportiveStateId -- its own Field, placed right after that one", () => {
  const defaultStateFieldIndex = screen.indexOf('<Field label="מצב תומך מועדף להכנה לפני המשימה (רשות)">');
  const feelingsFieldIndex = screen.indexOf('<Field label="רגשות תומכים ופעולות פנימיות למשימה זו (רשות)">');
  assert.ok(defaultStateFieldIndex !== -1 && feelingsFieldIndex !== -1);
  assert.ok(defaultStateFieldIndex < feelingsFieldIndex, "the new section must come after the pre-existing preparation-state field, never replace or merge with it");
});

test("the section only renders once the task has a real id -- the same !isNew gate the archive button already uses, since linking requires a real taskId", () => {
  const feelingsFieldIndex = screen.indexOf('<Field label="רגשות תומכים ופעולות פנימיות למשימה זו (רשות)">');
  const guardSlice = screen.slice(Math.max(0, feelingsFieldIndex - 120), feelingsFieldIndex);
  assert.ok(guardSlice.includes("{!isNew && ("));
});

test("adding a feeling reuses the exact case-insensitive find-or-create precedent, then auto-links it to this task via the storage wrapper -- never a raw duplicate insert", () => {
  const fnIndex = screen.indexOf("async function handleAddTaskFeeling");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("findSupportiveFeelingByLabel(allFeelings, label)"));
  assert.ok(fnBody.includes("upsertSupportiveFeelingEntry(feeling)"));
  assert.ok(fnBody.includes("handleChooseFeeling") || fnBody.includes("linkSupportiveFeelingToTask"));
});

test("adding an internal action is scoped to its own feeling -- find-or-create by (feelingId, text), then linked via linkInternalActionToFeeling", () => {
  const fnIndex = screen.indexOf("async function handleAddInternalAction");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("findInternalActionByText(allActions, feelingId, text)"));
  assert.ok(fnBody.includes("upsertInternalActionEntry(action)"));
  assert.ok(fnBody.includes("linkInternalActionToFeeling(feelingId, action.id, now)"));
});

test("removing a feeling from this task unlinks it (never deletes the SupportiveFeeling bank entry or its historical usages) -- same for removing an action from a feeling", () => {
  assert.ok(screen.includes("async function handleRemoveTaskFeeling(feelingId: string)"));
  assert.ok(screen.includes("await unlinkSupportiveFeelingFromTask(existingTask.id, feelingId);"));
  assert.ok(screen.includes("async function handleRemoveInternalAction(feelingId: string, actionId: string)"));
  assert.ok(screen.includes("await unlinkInternalActionFromFeeling(feelingId, actionId);"));
});

test("the feelings/actions section never participates in validateTaskDraft -- saving the task is never blocked by it", () => {
  const validateCallIndex = screen.indexOf("validateTaskDraft(draft)");
  assert.ok(validateCallIndex !== -1);
  // validateTaskDraft only ever receives the plain TaskDraft -- the
  // feelings/actions state (allFeelings/taskFeelingLinks/etc.) is never
  // threaded into it, so it structurally cannot gate on them.
  assert.ok(!screen.includes("validateTaskDraft(draft, "));
});

test("each feeling card is independently expandable (its own actions list, add-action row, and remove links) -- never a single global list that mixes feelings together", () => {
  assert.ok(screen.includes("toggleFeelingExpanded(feeling.id)"));
  assert.ok(screen.includes("expandedFeelingIds.has(feeling.id)"));
  assert.ok(screen.includes("newActionDraftByFeeling[feeling.id]"));
});
