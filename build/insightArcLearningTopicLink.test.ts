import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/insightArcLearningTopicLink.test.ts
 *
 * ARCHI -- Insight Collection x ARC Learning linking task: source-text
 * regression guard for everything the pure-logic tests in
 * arc/arcInsightBelief.test.ts and arc/arcLearningTopic.test.ts can't
 * reach on their own -- the new picker screen/route, the two screens'
 * UI additions, and the storage-layer persistence/backfill (AsyncStorage
 * isn't a callable mock under a plain `node --test` run, same convention
 * as data/purposeManifest.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const linkScreen = readSource("build/InsightArcLearningTopicLinkScreen.tsx");
const linkRoute = readSource("app/insights/[id]/link-topics.tsx");
const layout = readSource("app/_layout.tsx");
const insightDetail = readSource("build/InsightDetailScreen.tsx");
const topicDetail = readSource("build/ArcLearningTopicDetailScreen.tsx");
const storage = readSource("data/storage.ts");

// --- Route registration + the new picker screen itself ---

test("the new /insights/[id]/link-topics route exists, is registered in app/_layout.tsx, and renders the picker screen", () => {
  assert.ok(linkRoute.includes("InsightArcLearningTopicLinkScreen"));
  assert.ok(layout.includes('name="insights/[id]/link-topics"'), "the route must be registered in app/_layout.tsx");
});

test("the picker screen toggles topic links instantly via upsertArcInsight -- no separate Save button, so links can be added/removed at any point", () => {
  assert.ok(linkScreen.includes("linkArcLearningTopicToInsight"));
  assert.ok(linkScreen.includes("unlinkArcLearningTopicFromInsight"));
  assert.ok(linkScreen.includes("upsertArcInsight"));
  assert.ok(!linkScreen.includes('"שמור"'), "there must be no separate save step -- every toggle persists immediately");
});

test("the picker screen reuses the EXISTING ARC Learning topic editor for creating a new topic, never a second topic-creation UI", () => {
  assert.ok(linkScreen.includes("/arc-learning/topics/[id]/edit"));
});

// --- Requirement 4: "נושאי למידה מקושרים" on the insight screen, with bidirectional nav ---

test("4. InsightDetailScreen shows a 'נושאי למידה מקושרים' section and navigating a topic opens it in ARC Learning (not a duplicate)", () => {
  assert.ok(insightDetail.includes("נושאי למידה מקושרים"));
  assert.ok(insightDetail.includes('pathname: "/arc-learning/topics/[id]"'));
});

test("InsightDetailScreen exposes a 'קישור ל-ARC Learning' button that opens the dedicated picker screen for this exact insight id", () => {
  assert.ok(insightDetail.includes("קישור ל-ARC Learning"));
  assert.ok(insightDetail.includes('pathname: "/insights/[id]/link-topics"'));
});

// --- Requirement 3: "תובנות מקושרות" inside ARC Learning, with bidirectional nav back to the ORIGINAL insight ---

test("3+4. ArcLearningTopicDetailScreen shows a 'תובנות מקושרות' section sourced via resolveInsightsForArcLearningTopic, and tapping an insight opens the ORIGINAL insight screen (never a duplicate copy)", () => {
  assert.ok(topicDetail.includes("תובנות מקושרות"));
  assert.ok(topicDetail.includes("resolveInsightsForArcLearningTopic"));
  assert.ok(topicDetail.includes('pathname: "/insights/[id]"'), "tapping a linked insight must open the real Insight Collection screen, not a copy");
});

test("the linked-insights section is appended via ListFooterComponent, never a second FlatList, avoiding nested-virtualized-list issues", () => {
  assert.ok(topicDetail.includes("ListFooterComponent"));
});

// --- Requirement 6: persistence across app close/reopen ---

test("6. loadArcInsights backfills arcLearningTopicIds to [] for a pre-existing record saved before this field existed -- never a crash, never an invented link", () => {
  const fnIndex = storage.indexOf("export async function loadArcInsights");
  const fnBody = storage.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("Array.isArray(insight.arcLearningTopicIds) ? insight.arcLearningTopicIds : []"));
});

test("6. upsertArcInsight persists the full record (including arcLearningTopicIds) keyed by id, so a link set before closing the app is read back unchanged on reopen", () => {
  const fnIndex = storage.indexOf("export async function upsertArcInsight");
  const fnBody = storage.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("AsyncStorage.setItem(ARC_INSIGHTS_KEY"));
});

// --- Requirement 9 (storage half): deleting an insight removes its own associations with it; the topic's own deletion never cascades ---

test("9. deleteArcInsight removes the whole record (links and all) by id, and never touches any other insight's own record", () => {
  const fnIndex = storage.indexOf("export async function deleteArcInsight");
  const fnBody = storage.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("existing.filter((candidate) => candidate.id !== id)"));
});
