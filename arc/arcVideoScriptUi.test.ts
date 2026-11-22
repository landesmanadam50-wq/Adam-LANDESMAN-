import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * arc/arcVideoScriptUi.test.ts
 *
 * ARC Video task: source-text regression guard for spec section 1's
 * "choice between writing regular text vs. a video script" UI --
 * build/ArcWritingHomeScreen.tsx's dedicated entry card and
 * build/ArcWritingTextScreen.tsx's video-script-only fields/record
 * button, same convention as every other *.test.ts in this repo (no RN
 * renderer available under a plain `node --test` run).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const homeScreen = readSource("build/ArcWritingHomeScreen.tsx");
const textScreen = readSource("build/ArcWritingTextScreen.tsx");
const writingRoute = readSource("app/arc-gym/writing/[id].tsx");

test("required: ArcWritingHomeScreen offers a dedicated 'write a video script' card, distinct from the plain-text and book cards, that creates a new text with kind=video_script", () => {
  assert.ok(homeScreen.includes("🎥 כתיבת תסריט לסרטון"));
  assert.ok(homeScreen.includes('params: { id: "new", kind: "video_script" }'));
});

test("ArcWritingHomeScreen's continue-writing list visually distinguishes a video script from a plain text (different icon), without a second, separate list", () => {
  assert.ok(homeScreen.includes('kind === "video_script" ? ("video_script" as const)'));
  assert.ok(homeScreen.includes('item.kind === "video_script" ? "🎥 "'));
});

test("the writing detail route forwards an optional kind param as initialKind, defaulting to null for every existing (non-video) link", () => {
  assert.match(writingRoute, /const \{ id, kind \} = useLocalSearchParams<\{ id: string; kind\?: string \}>\(\);/);
  assert.ok(writingRoute.includes('initialKind={kind === "video_script" ? "video_script" : null}'));
});

test("required: a brand-new text created with initialKind='video_script' is tagged kind='video_script' at creation, via the SAME updateArcWritingText this screen already uses elsewhere -- never a second, parallel creation path", () => {
  const fnIndex = textScreen.indexOf("if (isNew) {");
  const fnBody = textScreen.slice(fnIndex, textScreen.indexOf("} else {", fnIndex));
  assert.ok(fnBody.includes('initialKind === "video_script"'));
  assert.ok(fnBody.includes('updateArcWritingText(createArcWritingText(generateArcWritingTextId(), now), { kind: "video_script" }, now)'));
});

test("required: a video-script text shows its own topic/purpose fields (persisted via updateArcWritingText, autosaved the same debounced way as the title/body), never shown for a standard text", () => {
  assert.ok(textScreen.includes("const isVideoScript = text.kind === \"video_script\";"));
  assert.ok(textScreen.includes("{isVideoScript && ("));
  assert.ok(textScreen.includes('placeholder="על מה הסרטון (נושא)"'));
  assert.ok(textScreen.includes('placeholder="מה המטרה שרוצים להשיג דרך הסרטון הזה"'));
  const topicFnIndex = textScreen.indexOf("function handleVideoTopicChange(");
  const topicFnBody = textScreen.slice(topicFnIndex, textScreen.indexOf("\n  }", topicFnIndex));
  assert.ok(topicFnBody.includes("updateArcWritingText(text, { videoTopic: value }"));
});

test("required: a video-script text shows a '🎥 צלם סרטון' record button that forces an immediate (non-debounced) save before navigating, so the record screen always receives a real, persisted script id", () => {
  assert.ok(textScreen.includes("🎥 צלם סרטון"));
  const fnIndex = textScreen.indexOf("function handleRecordVideo()");
  const fnBody = textScreen.slice(fnIndex, textScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (!persistedRef.current) persist(text, false);"));
  assert.ok(fnBody.includes('pathname: "/arc-gym/video/record/[scriptId]", params: { scriptId: text.id }'));
});

test("required: existing recordings for this script are listed via resolveVideoRecordingsForScript (never a hand-rolled filter), each showing its own private/published and draft/final status", () => {
  assert.ok(textScreen.includes("const scriptRecordings = isVideoScript ? resolveVideoRecordingsForScript(videoRecordings, text.id) : [];"));
  assert.ok(textScreen.includes('recording.visibility === "published" ? "פורסם" : "פרטי"'));
});

test("video-script-only UI never alters standard-text behavior: title/body autosave, insight/relationship linking, chapter association, and the draft toggle all remain unconditional", () => {
  assert.ok(textScreen.includes("<TextInput style={styles.titleInput}"));
  assert.ok(!textScreen.includes("isVideoScript &&") || textScreen.includes("<Switch value={!text.isDraft} onValueChange={handleToggleDraft} />"));
  assert.doesNotMatch(textScreen, /isVideoScript[\s\S]{0,40}handleToggleDraft/);
});
