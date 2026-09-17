import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/desiredStateEditingAndDiagnostics.test.ts
 *
 * Desired State / combined-route readiness fix: this codebase has no React
 * Native component test renderer (see build/selfDevelopmentEntryRoute.test.ts's
 * own doc -- every other test here exercises pure arc//program//data logic
 * only), so this asserts directly on the real source text of the two
 * affected screens rather than a duplicated/mocked copy. The underlying
 * readiness LOGIC (same_action relaxation, structured diagnostics) is pure
 * and covered separately, with real fixtures, in
 * arc/personalDevelopmentRouteConfigReadiness.test.ts and
 * arc/combinedFactorPlan.test.ts -- this file only guards that the two
 * screens actually wire that logic in, rather than a parallel/stale copy.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const routeEditor = readSource("build/PersonalDevelopmentRouteEditorScreen.tsx");
const stateList = readSource("build/StateProfileListScreen.tsx");

test("the combined route editor computes readiness via the single structured evaluator -- never a duplicated boolean check", () => {
  assert.match(routeEditor, /import\s*{\s*evaluatePersonalDevelopmentRouteConfigReadiness\s*}\s*from\s*["']\.\.\/arc\/personalDevelopmentRouteConfigReadiness\.ts["']/);
  assert.ok(routeEditor.includes("evaluatePersonalDevelopmentRouteConfigReadiness(config, items, stateProfiles, presenceArcs)"));
});

test("the route editor renders each missing requirement's own message -- not just a generic draft note", () => {
  assert.ok(routeEditor.includes("readiness.missingRequirements.map"), "must render the structured list, one line per missing requirement");
});

test("the route editor never reintroduces a separate, duplicated structural-validation source of truth", () => {
  assert.ok(!routeEditor.includes("validatePersonalDevelopmentRouteConfig"), "structural validity must be reached only through evaluatePersonalDevelopmentRouteConfigReadiness now, never a second direct call");
});

test("State cards in \"המצבים הרצויים שלי\" are directly tappable to open the editor -- not only the small ערוך button", () => {
  const cardMapIndex = stateList.indexOf("visibleProfiles.map((profile)");
  assert.ok(cardMapIndex !== -1);
  const cardBody = stateList.slice(cardMapIndex, cardMapIndex + 700);
  assert.match(cardBody, /<Pressable\s+onPress=\{\(\)\s*=>\s*router\.push\(\{\s*pathname:\s*"\/state-profiles\/\[id\]",\s*params:\s*\{\s*id:\s*profile\.id\s*\}\s*\}\)\}>/, "the card's own header content must be wrapped in a Pressable routing to its editor");
});

test("each Desired State card shows its own LIVE-readiness status, so the trainee can see what's missing before ever opening the combined route editor", () => {
  assert.ok(stateList.includes("isStateProfileCompleteForPractice(profile)"));
  assert.ok(stateList.includes("readinessBadge"));
});

test("the existing ערוך button and archive/disable/restore actions on the State list are all still present and unchanged", () => {
  assert.ok(stateList.includes('<Text style={styles.actionButtonText}>ערוך</Text>'));
  assert.ok(stateList.includes('<Text style={styles.actionButtonText}>השבת</Text>'));
  assert.ok(stateList.includes('<Text style={styles.actionButtonText}>העבר לארכיון</Text>'));
  assert.ok(stateList.includes('<Text style={styles.actionButtonText}>הפעל</Text>'));
  assert.ok(stateList.includes('<Text style={styles.actionButtonText}>שחזר</Text>'));
});

test("the StateProfile editor screen (build/StateProfileEditorScreen.tsx) already preloads an existing record for editing -- confirms editing was reachable even before the card became tappable", () => {
  const editor = readSource("build/StateProfileEditorScreen.tsx");
  assert.ok(editor.includes("getStateProfile(id)"), "must load the existing record by its own stable id");
  assert.ok(editor.includes("setProfile(existing)"), "must preload every saved field, never start from a blank draft when editing");
});
