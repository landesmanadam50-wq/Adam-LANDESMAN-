import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcRemindersScreen.test.ts
 *
 * SyncFix2 (floating-timer/Task-LIVE/next-task desync bug): source-text
 * regression guard for build/ArcRemindersScreen.tsx's own reload(),
 * which previews the task-transition notification's mantra via
 * resolveCurrentAndNextTaskForTransition (data/dailyPlan.ts) -- the
 * exact same shared (current, next) resolver every other fixed call
 * site in this task now threads a real, caller-resolved activeRun
 * into. Before this fix this call hardcoded `null`, so this preview
 * could silently disagree with what the real notification (and every
 * other synced surface) would actually show. Not executed directly
 * with `node --test` -- this screen depends on data/storage.ts's
 * AsyncStorage-backed loaders, same convention as every other
 * build/*Screen.test.ts file in this codebase.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/ArcRemindersScreen.tsx");

test("reload() loads the real TaskTimerRun (loadTaskTimerRun, imported from data/storage.ts) and excludes a rest/break run before using it -- the same convention every other fixed call site in this task uses", () => {
  assert.match(screen, /import \{[^}]*\bloadTaskTimerRun\b[^}]*\} from "\.\.\/data\/storage\.ts";/);
  const fnIndex = screen.indexOf("const reload = useCallback(() => {");
  const fnBody = screen.slice(fnIndex, screen.indexOf("useFocusEffect(reload);"));
  assert.ok(fnBody.includes("const run = await loadTaskTimerRun();"));
  assert.ok(fnBody.includes('const activeRun = run && run.kind !== "rest" ? run : null;'));
});

test("SyncFix2: resolveCurrentAndNextTaskForTransition is called with the real activeRun as its 3rd argument -- never a hardcoded null -- so this transition-mantra preview can never disagree with the real notification about what's current/next", () => {
  const fnIndex = screen.indexOf("const reload = useCallback(() => {");
  const fnBody = screen.slice(fnIndex, screen.indexOf("useFocusEffect(reload);"));
  assert.ok(fnBody.includes("resolveCurrentAndNextTaskForTransition(null, new Date(), activeRun),"));
  assert.ok(!fnBody.includes("resolveCurrentAndNextTaskForTransition(null)"), "must never reintroduce the hardcoded-null call this fix removed");
});
