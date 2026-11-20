import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/positiveMemoryEncodingIntegration.test.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, Stage E
 * (section 8, "automatic memory selection during ARC encoding"):
 * source-text regression guard for live/NewArcLiveScreen.tsx's own
 * encoding-visualization integration -- no React Native component
 * test renderer exists in this codebase, same convention as every
 * other screen test (e.g. live/newArcLiveScreen.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");

test("imports the ONE reusable selection engine (positiveMemorySelection.ts) and selection-history recorder -- never a second, independently-written matcher", () => {
  assert.ok(screen.includes('import { selectPositiveMemoryForFeeling } from "../arc/positiveMemorySelection.ts";'));
  assert.ok(screen.includes('import type { PositiveMemory } from "../arc/positiveMemory.ts";'));
  assert.ok(screen.includes('import { recordPositiveMemorySelection } from "../arc/positiveMemorySelectionHistory.ts";'));
  assert.ok(screen.includes("loadPositiveMemories,"));
  assert.ok(screen.includes("loadPositiveMemorySelectionHistory,"));
  assert.ok(screen.includes("savePositiveMemorySelectionHistory,"));
});

test("new top-level state defaults to inert/null, so whenever no match exists the existing rendering is completely unaffected", () => {
  assert.ok(screen.includes("const [positiveMemoryForEncoding, setPositiveMemoryForEncoding] = useState<PositiveMemory | null>(null);"));
  assert.ok(screen.includes("const [positiveMemoryEncodingDismissed, setPositiveMemoryEncodingDismissed] = useState(false);"));
  assert.ok(screen.includes("const [positiveMemoryEncodingExcludedIds, setPositiveMemoryEncodingExcludedIds] = useState<string[]>([]);"));
});

test("the resolution effect only fires while currentStep is 'encoding'/'mini_encoding', requires a REAL resolved feeling (resolveFinalSupportiveFeeling), and clears its resolved-key ref once that feeling is absent or the step changes -- so leaving encoding and a later re-entry always re-resolves fresh", () => {
  const effectIndex = screen.indexOf("useEffect(() => {\n    if (!session || (session.currentStep !== \"encoding\" && session.currentStep !== \"mini_encoding\")) {");
  assert.ok(effectIndex !== -1, "the gating useEffect must exist, checking BOTH encoding step ids");
  const effectBody = screen.slice(effectIndex, effectIndex + 1800);
  assert.ok(effectBody.includes("positiveMemoryEncodingResolvedKeyRef.current = null;"));
  assert.ok(effectBody.includes("const feeling = resolveFinalSupportiveFeeling(session);"));
  assert.ok(effectBody.includes("if (!feeling) {"));
  assert.ok(effectBody.includes("if (positiveMemoryEncodingResolvedKeyRef.current === resolvedKey) return;"));
});

test("the effect never fabricates a memory: it loads ONLY the finalized positive-memory collection + real selection history, then defers entirely to selectPositiveMemoryForFeeling -- the result (match or null) is set as-is", () => {
  const effectIndex = screen.indexOf("const resolvedKey = `${session.currentStep}:${feeling.feeling.trim().toLowerCase()}`;");
  const effectBody = screen.slice(effectIndex, effectIndex + 1200);
  assert.ok(effectBody.includes("await Promise.all([loadPositiveMemories(), loadPositiveMemorySelectionHistory()]);"));
  assert.ok(effectBody.includes("const picked = selectPositiveMemoryForFeeling(memories, feeling.feeling, { taskId: contextTaskId }, history, []);"));
  assert.ok(effectBody.includes("setPositiveMemoryForEncoding(picked);"));
});

test("a successful selection is recorded into persistent selection history (encoding_feeling context), keyed by the lowercased feeling word -- so session-stability/variety rotation has real data to read on the next encoding entry", () => {
  const effectIndex = screen.indexOf("const resolvedKey = `${session.currentStep}:${feeling.feeling.trim().toLowerCase()}`;");
  const effectBody = screen.slice(effectIndex, effectIndex + 1600);
  assert.ok(effectBody.includes('recordPositiveMemorySelection(history, picked.id, "encoding_feeling", feeling.feeling.trim().toLowerCase(), new Date().toISOString());'));
  assert.ok(effectBody.includes("await savePositiveMemorySelectionHistory(updatedHistory);"));
});

test("'אירוע אחר': re-selects among real, non-fabricated memories, excluding every previously-shown id in this encoding entry (never just the current one, so repeated taps keep rotating)", () => {
  const fnIndex = screen.indexOf("const handlePositiveMemoryEncodingAnother = useCallback(async () => {");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("const excludeIds = [...positiveMemoryEncodingExcludedIds, positiveMemoryForEncoding.id];"));
  assert.ok(fnBody.includes("selectPositiveMemoryForFeeling(memories, feeling.feeling, { taskId: contextTaskId }, history, excludeIds);"));
  assert.ok(fnBody.includes("setPositiveMemoryEncodingExcludedIds(excludeIds);"));
});

test("'דלג': only ever sets the dismissed flag -- never calls any storage/selection function, and the original encoding flow (ArcBodyMantraCircle) remains the ONLY thing rendered afterward", () => {
  const fnIndex = screen.indexOf("const handlePositiveMemoryEncodingSkip = useCallback(() => {");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, screen.indexOf("}, []);", fnIndex) + 7);
  assert.ok(fnBody.includes("setPositiveMemoryEncodingDismissed(true);"));
  assert.ok(!fnBody.includes("savePositiveMemorySelectionHistory"));
  assert.ok(!fnBody.includes("loadPositiveMemories"));
});

test("case 'encoding' and case 'mini_encoding' both short-circuit to the positive-memory block ONLY when a match exists and is not dismissed, checked BEFORE the existing, completely unchanged <ArcBodyMantraCircle> return -- so a session with zero positive memories renders byte-for-byte as before", () => {
  const encodingIndex = screen.indexOf('case "encoding":');
  const encodingBody = screen.slice(encodingIndex, encodingIndex + 700);
  assert.ok(encodingBody.includes("if (positiveMemoryForEncoding && !positiveMemoryEncodingDismissed) {"));
  const encodingShortCircuitIndex = encodingBody.indexOf("if (positiveMemoryForEncoding");
  const encodingArcBodyIndex = encodingBody.indexOf("<ArcBodyMantraCircle");
  assert.ok(encodingShortCircuitIndex !== -1 && encodingArcBodyIndex !== -1 && encodingShortCircuitIndex < encodingArcBodyIndex);

  const miniEncodingIndex = screen.indexOf('case "mini_encoding":');
  const miniEncodingBody = screen.slice(miniEncodingIndex, miniEncodingIndex + 700);
  assert.ok(miniEncodingBody.includes("if (positiveMemoryForEncoding && !positiveMemoryEncodingDismissed) {"));
  const miniShortCircuitIndex = miniEncodingBody.indexOf("if (positiveMemoryForEncoding");
  const miniArcBodyIndex = miniEncodingBody.indexOf("<ArcBodyMantraCircle");
  assert.ok(miniShortCircuitIndex !== -1 && miniArcBodyIndex !== -1 && miniShortCircuitIndex < miniArcBodyIndex);
});

test("the visualization block shows the required prompt, the documented feeling/title/moment/location-time/what-was-special, and both 'אירוע אחר'/'דלג' actions -- never inventing text not present on the real PositiveMemory", () => {
  const fnIndex = screen.indexOf("function renderPositiveMemoryEncodingBlock(memory: PositiveMemory) {");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes("דמיין את הרגע שבו חווית את התחושה הזאת."));
  assert.ok(fnBody.includes("{feelingEntry.feeling}"));
  assert.ok(fnBody.includes("{memory.title}"));
  assert.ok(fnBody.includes("{feelingEntry.moment}"));
  assert.ok(fnBody.includes("{memory.whatWasSpecial}"));
  assert.ok(fnBody.includes(">אירוע אחר<"));
  assert.ok(fnBody.includes(">דלג<"));
  assert.ok(fnBody.includes("onPress={handlePositiveMemoryEncodingAnother}"));
  assert.ok(fnBody.includes("onPress={handlePositiveMemoryEncodingSkip}"));
});
