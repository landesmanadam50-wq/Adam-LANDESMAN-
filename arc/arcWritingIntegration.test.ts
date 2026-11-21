import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * arc/arcWritingIntegration.test.ts
 *
 * ARC Writing & ARC Book task: source-text regression guard for the
 * feature's own wiring into ARCHI's EXISTING systems -- route
 * registration, the ARC Gym entry card, the task-kind
 * fallthrough-then-navigate branch (and secondary re-open button) in
 * live/ActiveTaskScreen.tsx, and the export module's isolation. The
 * pure data model is fully covered by arc/arcWriting.test.ts; this file
 * only ever asserts structural wiring, following this codebase's own
 * established pattern for a screen a full RN renderer can't drive
 * directly (compare arc/arcFocusIntegration.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const tasksModule = readSource("arc/tasks.ts");
const arcGymScreen = readSource("build/ArcGymScreen.tsx");
const arcWritingHomeScreen = readSource("build/ArcWritingHomeScreen.tsx");
const arcWritingTextScreen = readSource("build/ArcWritingTextScreen.tsx");
const arcBookDetailScreen = readSource("build/ArcBookDetailScreen.tsx");
const arcBookChapterScreen = readSource("build/ArcBookChapterScreen.tsx");
const arcInsightPicker = readSource("live/components/ArcInsightPicker.tsx");
const arcRelationshipPicker = readSource("live/components/ArcRelationshipPicker.tsx");
const arcInsightRelationshipMap = readSource("live/components/ArcInsightRelationshipMap.tsx");
const arcWritingTaskComposer = readSource("live/components/ArcWritingTaskComposer.tsx");
const arcBookExport = readSource("arc/arcBookExport.ts");
const writingIndexRoute = readSource("app/arc-gym/writing/index.tsx");
const writingDetailRoute = readSource("app/arc-gym/writing/[id].tsx");
const bookDetailRoute = readSource("app/arc-gym/book/[id].tsx");
const bookChapterRoute = readSource("app/arc-gym/book/[id]/chapter/[chapterId].tsx");
const storage = readSource("data/storage.ts");

test("ARC GYM lists a dedicated 'ARC Writing' entry card, reaching /arc-gym/writing -- never a new top-level entry like ARC Saving/Learning/Creativity", () => {
  assert.ok(arcGymScreen.includes('router.push("/arc-gym/writing")'));
  assert.ok(arcGymScreen.includes("ARC Writing"));
});

test("every new ARC Writing/Book route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="arc-gym\/writing\/index"/);
  assert.match(layout, /<Stack\.Screen name="arc-gym\/writing\/\[id\]"/);
  assert.match(layout, /<Stack\.Screen name="arc-gym\/book\/\[id\]"/);
  assert.match(layout, /<Stack\.Screen name="arc-gym\/book\/\[id\]\/chapter\/\[chapterId\]"/);
});

test("the four route wrappers forward their params straight through, same 2-line pattern as every other route wrapper in this app", () => {
  assert.ok(writingIndexRoute.includes("<ArcWritingHomeScreen />"));
  assert.ok(writingDetailRoute.includes("<ArcWritingTextScreen id={id} />"));
  assert.ok(bookDetailRoute.includes("<ArcBookDetailScreen id={id} />"));
  assert.ok(bookChapterRoute.includes("<ArcBookChapterScreen id={id} chapterId={chapterId} />"));
});

test("TaskKind is extended with 'arcWriting', additive to every existing kind", () => {
  assert.match(
    tasksModule,
    /export type TaskKind = "standard" \| "manifest" \| "arcFocus" \| "arcLearningReview" \| "arcCreativityReview" \| "arcWriting";/
  );
  assert.match(tasksModule, /arcWritingTextId: string \| null;/);
  assert.match(tasksModule, /arcWritingChapterId: string \| null;/);
});

test("live/ActiveTaskScreen.tsx's performStart does NOT early-return for 'arcWriting' -- it falls through to the normal TaskTimerRun-creating path, unlike every other special taskKind", () => {
  const manifestBranchIndex = activeTaskScreen.indexOf('if (task.taskKind === "manifest")');
  const arcLearningReviewBranchIndex = activeTaskScreen.indexOf('if (task.taskKind === "arcLearningReview")');
  const earlyReturnBlock = activeTaskScreen.slice(manifestBranchIndex, arcLearningReviewBranchIndex);
  assert.ok(!earlyReturnBlock.includes('"arcWriting"'), "arcWriting must never join the early-return block that skips the real timer");

  // The navigate-after-timer-creation step must come AFTER the real
  // TaskTimerRun is created (showFloatingTimerOverlay/appendTaskJournalEntry),
  // confirming the timer is created first, then navigation happens.
  const overlayIndex = activeTaskScreen.indexOf("await showFloatingTimerOverlay(");
  const arcWritingNavigateIndex = activeTaskScreen.indexOf('if (task.taskKind === "arcWriting")');
  assert.ok(overlayIndex !== -1 && arcWritingNavigateIndex !== -1 && overlayIndex < arcWritingNavigateIndex);
});

test("live/ActiveTaskScreen.tsx's openArcWritingTarget resolves the chapter's own bookId before navigating, and falls back to the standalone text route", () => {
  assert.ok(activeTaskScreen.includes("async function openArcWritingTarget(targetTask: Task)"));
  assert.ok(activeTaskScreen.includes('pathname: "/arc-gym/book/[id]/chapter/[chapterId]", params: { id: chapter.bookId, chapterId: chapter.id }'));
  assert.ok(activeTaskScreen.includes('pathname: "/arc-gym/writing/[id]", params: { id: targetTask.arcWritingTextId }'));
});

test("the Start button label has an 'arcWriting' case, and a persistent 'פתח את הכתיבה' secondary button re-navigates without restarting the task", () => {
  assert.ok(activeTaskScreen.includes('task.taskKind === "arcWriting"\n                          ? "התחלת כתיבה"'));
  assert.ok(activeTaskScreen.includes('task.taskKind === "arcWriting" && ('));
  assert.ok(activeTaskScreen.includes('onPress={() => openArcWritingTarget(task)}'));
  assert.ok(activeTaskScreen.includes("פתח את הכתיבה"));
});

test("data/storage.ts exposes full CRUD for all 4 new ARC Writing/Book entities, each with its own storage key", () => {
  for (const fn of [
    "loadArcInsightRelationships",
    "upsertArcInsightRelationshipEntry",
    "deleteArcInsightRelationshipEntry",
    "loadArcWritingTexts",
    "upsertArcWritingTextEntry",
    "deleteArcWritingTextEntry",
    "loadArcBooks",
    "upsertArcBookEntry",
    "deleteArcBookEntry",
    "loadArcBookChapters",
    "upsertArcBookChapterEntry",
    "deleteArcBookChapterEntry",
  ]) {
    assert.ok(storage.includes(`export async function ${fn}(`), `missing ${fn}`);
  }
  assert.match(storage, /archi\.arcInsightRelationships\.v1/);
  assert.match(storage, /archi\.arcWritingTexts\.v1/);
  assert.match(storage, /archi\.arcBooks\.v1/);
  assert.match(storage, /archi\.arcBookChapters\.v1/);
});

test("data/storage.ts backfills classification/classificationNote for an insight saved before they existed", () => {
  assert.ok(storage.includes("classification: insight.classification ?? null,"));
  assert.ok(storage.includes("classificationNote: insight.classificationNote ?? null,"));
});

test("ArcInsightPicker/ArcRelationshipPicker are shared components, each used by both the text screen and the book/chapter screens -- never duplicated per screen", () => {
  for (const screenSource of [arcWritingTextScreen, arcBookDetailScreen, arcBookChapterScreen]) {
    assert.ok(screenSource.includes('import ArcInsightPicker from "'));
  }
  assert.ok(arcWritingTextScreen.includes('import ArcRelationshipPicker from "'));
  assert.ok(arcBookDetailScreen.includes('import ArcRelationshipPicker from "'));
  assert.ok(arcBookChapterScreen.includes('import ArcRelationshipPicker from "'));
});

test("ArcRelationshipPicker offers a map/list toggle (spec section 4's 'must also support a simple list view')", () => {
  assert.ok(arcRelationshipPicker.includes("showMap"));
  assert.ok(arcRelationshipPicker.includes("ArcInsightRelationshipMap"));
  assert.ok(arcRelationshipPicker.includes("תצוגת רשימה"));
  assert.ok(arcRelationshipPicker.includes("תצוגת מפה"));
});

test("ArcInsightRelationshipMap renders nodes/edges with react-native-svg and tapping either shows its content via Alert, with a remove option on edges", () => {
  assert.ok(arcInsightRelationshipMap.includes('from "react-native-svg"'));
  assert.ok(arcInsightRelationshipMap.includes("Alert.alert"));
  assert.ok(arcInsightRelationshipMap.includes("onRemoveRelationship"));
});

test("ArcInsightPicker creates a real ArcInsight via the SAME createStandaloneInsight/appendArcInsight pair build/InsightWriteScreen.tsx uses -- never a second insight-creation path", () => {
  assert.ok(arcInsightPicker.includes("createStandaloneInsight"));
  assert.ok(arcInsightPicker.includes("appendArcInsight"));
  assert.ok(arcInsightPicker.includes("classifyArcInsight"));
});

test("ArcWritingTextScreen/ArcBookChapterScreen autosave via a debounced setTimeout-in-a-ref, flushing immediately on step changes and on unfocus -- same convention as build/PositiveMemoryWizardScreen.tsx", () => {
  for (const screenSource of [arcWritingTextScreen, arcBookChapterScreen]) {
    assert.ok(screenSource.includes("AUTO_SAVE_DEBOUNCE_MS"));
    assert.ok(screenSource.includes("saveTimeoutRef"));
    assert.ok(screenSource.includes("clearTimeout(saveTimeoutRef.current)"));
  }
});

test("a brand-new ArcWritingText/ArcBook is only persisted on the FIRST real save, which also switches the route param from 'new' to the real id -- never creating an orphan empty record just from opening 'new'", () => {
  assert.ok(arcWritingTextScreen.includes('const isNew = id === "new";'));
  assert.ok(arcWritingTextScreen.includes("router.setParams({ id: next.id })"));
  assert.ok(arcBookDetailScreen.includes('const isNew = id === "new";'));
  assert.ok(arcBookDetailScreen.includes("router.setParams({ id: created.id })"));
});

test("ArcBookDetailScreen reorders chapters with up/down buttons (no drag-and-drop dependency), same convention as build/ArcActiveTriggersScreen.tsx", () => {
  assert.ok(arcBookDetailScreen.includes("▲"));
  assert.ok(arcBookDetailScreen.includes("▼"));
  assert.ok(arcBookDetailScreen.includes("moveChapter"));
});

test("ArcBookChapterScreen can incorporate a previously-written standalone ArcWritingText by linking it (associateWritingTextWithChapter), never copying its content", () => {
  assert.ok(arcBookChapterScreen.includes("associateWritingTextWithChapter"));
  assert.ok(arcBookChapterScreen.includes("resolveWritingTextsForChapter"));
});

test("ArcWritingTaskComposer creates the Task via the same createEmptyTaskDraft/buildTaskFromDraft/upsertTask/reconcileTaskAlarms pipeline ArcFocusSettingsScreen uses, setting taskKind 'arcWriting' and exactly one of the two back-reference fields", () => {
  assert.ok(arcWritingTaskComposer.includes("createEmptyTaskDraft"));
  assert.ok(arcWritingTaskComposer.includes("buildTaskFromDraft"));
  assert.ok(arcWritingTaskComposer.includes('taskKind: "arcWriting" as const'));
  assert.ok(arcWritingTaskComposer.includes("reconcileTaskAlarms"));
  assert.ok(arcWritingTaskComposer.includes('arcWritingTextId: targetKind === "text" ? targetId : null'));
  assert.ok(arcWritingTaskComposer.includes('arcWritingChapterId: targetKind === "chapter" ? targetId : null'));
});

test("ArcWritingTaskComposer is reachable from both the standalone text screen and the book chapter screen", () => {
  assert.ok(arcWritingTextScreen.includes('<ArcWritingTaskComposer targetKind="text"'));
  assert.ok(arcBookChapterScreen.includes('<ArcWritingTaskComposer targetKind="chapter"'));
});

test("arc/arcBookExport.ts is the ONLY module importing expo-print/expo-sharing -- every other ARC Writing/Book module stays free of this dependency", () => {
  assert.ok(arcBookExport.includes('from "expo-print"'));
  assert.ok(arcBookExport.includes('from "expo-sharing"'));
  for (const otherModule of [arcWritingTextScreen, arcBookDetailScreen, arcBookChapterScreen, arcInsightPicker, arcRelationshipPicker, arcInsightRelationshipMap]) {
    assert.ok(!otherModule.includes("expo-print"));
    assert.ok(!otherModule.includes("expo-sharing"));
  }
});

test("exportArcBookToPdf builds an RTL HTML document (dir=\"rtl\", lang=\"he\") and renders it via Print.printToFileAsync before sharing with Sharing.shareAsync", () => {
  assert.ok(arcBookExport.includes('dir="rtl"'));
  assert.ok(arcBookExport.includes('lang="he"'));
  assert.ok(arcBookExport.includes("Print.printToFileAsync({ html })"));
  assert.ok(arcBookExport.includes("Sharing.isAvailableAsync()"));
  assert.ok(arcBookExport.includes("Sharing.shareAsync(uri"));
});

test("ArcWritingHomeScreen offers exactly the 3 required choices (write a text, write a book, continue existing writing)", () => {
  assert.ok(arcWritingHomeScreen.includes('params: { id: "new" }'));
  assert.ok(arcWritingHomeScreen.includes('pathname: "/arc-gym/writing/[id]"'));
  assert.ok(arcWritingHomeScreen.includes('pathname: "/arc-gym/book/[id]"'));
  assert.ok(arcWritingHomeScreen.includes("המשך כתיבה"));
  assert.ok(arcWritingHomeScreen.includes("resolveStandaloneWritingTexts"));
});

test("RTL convention: every new ARC Writing/Book screen uses textAlign right / row-reverse, never I18nManager", () => {
  for (const screenSource of [arcWritingHomeScreen, arcWritingTextScreen, arcBookDetailScreen, arcBookChapterScreen, arcInsightPicker, arcRelationshipPicker]) {
    assert.ok(screenSource.includes('textAlign: "right"'));
    assert.ok(!screenSource.includes("I18nManager"));
  }
});
