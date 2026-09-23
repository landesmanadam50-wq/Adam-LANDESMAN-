import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/liveModeSelectCombinedRoutes.test.ts
 *
 * Regression repair task: an active, non-archived, practice-ready combined
 * route (arc/personalDevelopmentRouteConfig.ts's own PersonalDevelopmentRouteConfig,
 * managed on build/PersonalDevelopmentRouteListScreen.tsx, "מסלולי תרגול
 * משולבים") stopped appearing anywhere on the existing ARCHI LIVE
 * selection screen (build/LiveModeSelectScreen.tsx, route /live/select) --
 * it could only ever be started from the management screen directly. This
 * suite guards the wiring fix.
 *
 * Personal Development consolidation task, step 5: CombinedRoutesSection
 * itself (plus pushCombinedRouteMode/resolveAdvancedModesForStage) was
 * extracted out of build/LiveModeSelectScreen.tsx into its own shared
 * module, build/CombinedRoutesSection.tsx, so it can be reused unmodified
 * by both this screen AND the new PD-only build/PersonalDevelopmentLiveSelectScreen.tsx.
 * Assertions about that component's own rendering/routing logic now read
 * from the extracted module (`combinedRoutesSectionModule` below);
 * assertions about LiveModeSelectScreen's own loading/wiring/chooser
 * behavior still read from that screen itself (`screen` below).
 *
 * This codebase has no React Native component test renderer (see
 * build/selfDevelopmentEntryRoute.test.ts's own doc -- every other test
 * here exercises pure arc//program//data logic only), so -- exactly like
 * that file -- this asserts directly on real source text rather than a
 * duplicated/mocked copy. The FILTERING logic itself (which routes count
 * as "active and ready") is pure and covered separately, with real
 * fixtures, in arc/personalDevelopmentRouteConfigReadiness.test.ts's own
 * selectActiveCombinedRoutesForLive tests -- this file only guards that
 * the screen actually calls that selector and wires its result into the
 * existing combined LIVE route, never a parallel implementation.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/LiveModeSelectScreen.tsx");
const combinedRoutesSectionModule = readSource("build/CombinedRoutesSection.tsx");

test("the screen loads combined routes via the single sanctioned selector -- never a duplicated filter", () => {
  assert.match(screen, /import\s*{\s*selectActiveCombinedRoutesForLive\s*}\s*from\s*["']\.\.\/arc\/personalDevelopmentRouteConfigReadiness\.ts["']/);
  assert.ok(screen.includes("selectActiveCombinedRoutesForLive(routeConfigs"), "must call the selector with the loaded route configs");
});

test("combined routes load from the same persisted source every management action reads -- loadPersonalDevelopmentRouteConfigs", () => {
  assert.match(screen, /import\s*{[^}]*loadPersonalDevelopmentRouteConfigs[^}]*}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
});

test("the screen imports the one shared CombinedRoutesSection component, never a duplicated/local re-implementation", () => {
  assert.match(screen, /import\s*{\s*CombinedRoutesSection\s*}\s*from\s*["']\.\/CombinedRoutesSection\.tsx["']/);
  assert.ok(!screen.includes("function CombinedRoutesSection"), "must never re-define CombinedRoutesSection locally any more");
});

test("the combined-routes section shows an identifying title and summary (factor count + נוכחות), matching the management screen's own card wording", () => {
  const sectionIndex = combinedRoutesSectionModule.indexOf("export function CombinedRoutesSection");
  assert.ok(sectionIndex !== -1, "CombinedRoutesSection must exist");
  const sectionBody = combinedRoutesSectionModule.slice(sectionIndex);
  assert.ok(sectionBody.includes("מסלולי תרגול משולבים"), "must show a Hebrew section title identifying combined routes");
  assert.ok(sectionBody.includes('גורמים${config.presenceEnabled ? " + נוכחות" : ""}'), 'each route card must summarize like "3 גורמים + נוכחות"');
});

test("the section never renders when there are zero active routes -- no empty combined-routes section", () => {
  const sectionIndex = combinedRoutesSectionModule.indexOf("export function CombinedRoutesSection");
  const sectionBody = combinedRoutesSectionModule.slice(sectionIndex, sectionIndex + 400);
  assert.ok(sectionBody.includes("if (routes.length === 0) return null"), "must bail out to null before rendering any section chrome when the list is empty");
});

test("pressing a route in LIVE launches the existing combined LIVE flow with that route's own id and the chosen mode -- the exact route the management screen's own start buttons already use", () => {
  // Stage-based entry task, later superseded by the Personal Development
  // consolidation task's own "One unified LIVE" decision: CombinedRoutesSection
  // no longer inlines the router.push call directly -- both the two
  // primary (Full ARC/Mini ARC, unconditional) and any advanced
  // (Route Link/Action Only, stage-gated) buttons route through one
  // shared pushCombinedRouteMode(routeConfigId, mode) helper. This
  // asserts that helper still pushes "full"/"mini" to the exact same
  // existing combined LIVE route with the exact same params shape.
  const helperIndex = combinedRoutesSectionModule.indexOf("function pushCombinedRouteMode");
  assert.ok(helperIndex !== -1, "pushCombinedRouteMode must exist");
  const helperBody = combinedRoutesSectionModule.slice(helperIndex, combinedRoutesSectionModule.indexOf("function resolveAdvancedModesForStage"));
  const liveRouteMatch = helperBody.match(/router\.push\(\{\s*pathname:\s*"\/personal-development-routes\/\[id\]\/live",\s*params:\s*\{\s*id:\s*routeConfigId,\s*mode\s*\}\s*\}\)/);
  assert.ok(liveRouteMatch, "full/mini must push to the existing combined LIVE route with this route's own id and mode param");
  assert.ok(helperBody.includes('mode === "full" || mode === "mini"'), "full and mini are the two modes routed to the existing combined LIVE screen");

  const sectionIndex = combinedRoutesSectionModule.indexOf("export function CombinedRoutesSection");
  const sectionBody = combinedRoutesSectionModule.slice(sectionIndex);
  assert.ok(sectionBody.includes('pushCombinedRouteMode(config.id, "full")'), "the first primary button must call the shared helper with this route's own id and mode 'full'");
  assert.ok(sectionBody.includes('pushCombinedRouteMode(config.id, "mini")'), "the second primary button must call the shared helper with this route's own id and mode 'mini'");
  assert.ok(sectionBody.includes("pushCombinedRouteMode(config.id, mode)"), "each advanced (Route Link/Action Only) button must call the shared helper with this route's own id and its own mode");
});

test("Stage 3/4 route through the new Route Link/Action Only screens, never the existing combined LIVE route", () => {
  const helperIndex = combinedRoutesSectionModule.indexOf("function pushCombinedRouteMode");
  const helperBody = combinedRoutesSectionModule.slice(helperIndex, combinedRoutesSectionModule.indexOf("export function CombinedRoutesSection"));
  assert.match(helperBody, /router\.push\(\{\s*pathname:\s*"\/personal-development-routes\/\[id\]\/route-link",\s*params:\s*\{\s*id:\s*routeConfigId\s*\}\s*\}\)/, "route_link must push to the new Stage 3 rehearsal screen");
  assert.match(helperBody, /router\.push\(\{\s*pathname:\s*"\/personal-development-routes\/\[id\]\/action-only",\s*params:\s*\{\s*id:\s*routeConfigId\s*\}\s*\}\)/, "action_only must push to the new Stage 4 mark-as-done screen");
});

test("each route's advanced (Route Link/Action Only) entry is resolved via resolveAvailableEntryModes, keyed by that route's own progress-store stage -- never a hardcoded pair, and never gating the two always-available Full/Mini primary buttons", () => {
  assert.match(combinedRoutesSectionModule, /import\s*{\s*resolveAvailableEntryModes\s*}\s*from\s*["']\.\.\/arc\/personalDevelopmentRouteProgress\.ts["']/);
  assert.ok(screen.includes("loadPersonalDevelopmentRouteProgressStore()"), "the screen must load the per-route progress store");
  const sectionIndex = combinedRoutesSectionModule.indexOf("export function CombinedRoutesSection");
  const sectionBody = combinedRoutesSectionModule.slice(sectionIndex);
  assert.ok(sectionBody.includes("progressStore[config.id]?.stage ?? 1"), "a route with no recorded progress yet must default to Stage 1, matching createEmptyPersonalDevelopmentRouteProgress");
  assert.ok(sectionBody.includes("resolveAdvancedModesForStage(stage)"), "advanced modes must be resolved per route from its own current stage");
  const helperIndex = combinedRoutesSectionModule.indexOf("function resolveAdvancedModesForStage");
  const helperBody = combinedRoutesSectionModule.slice(helperIndex, sectionIndex);
  assert.ok(helperBody.includes("resolveAvailableEntryModes(stage)"), "resolveAdvancedModesForStage itself is built on the existing resolveAvailableEntryModes, never a new/duplicated stage resolver");
});

test("returning to / focusing the LIVE screen refreshes the combined-routes list -- reload is wired into useFocusEffect, not just initial mount", () => {
  const focusEffectIndex = screen.indexOf("useFocusEffect(");
  assert.ok(focusEffectIndex !== -1);
  const focusEffectBody = screen.slice(focusEffectIndex, focusEffectIndex + 900);
  assert.ok(focusEffectBody.includes("reloadCombinedRoutes()"), "reloadCombinedRoutes must be called from inside useFocusEffect, so a route created or activated elsewhere shows up on return");
});

test("combined routes are reloaded regardless of the chooser/regular mode -- visible from the general 'מה תרצה לתרגל?' entry, not only after picking ARC רגיל", () => {
  const focusEffectIndex = screen.indexOf("useFocusEffect(");
  const focusEffectBody = screen.slice(focusEffectIndex, focusEffectIndex + 900);
  const reloadCombinedRoutesCall = focusEffectBody.indexOf("reloadCombinedRoutes()");
  const guardedByModeCheck = focusEffectBody.slice(0, reloadCombinedRoutesCall).includes('if (mode === "regular") reload()');
  assert.ok(guardedByModeCheck, "sanity: the ArcBuild reload stays gated on mode");
  // reloadCombinedRoutes() itself must sit OUTSIDE that ArcBuild-only gate.
  const afterArcBuildGate = focusEffectBody.slice(focusEffectBody.indexOf('if (mode === "regular") reload();') + 'if (mode === "regular") reload();'.length);
  assert.ok(afterArcBuildGate.includes("reloadCombinedRoutes()"), "reloadCombinedRoutes() must run unconditionally on every focus, not only in regular mode");
});

test("existing standalone ARC Build choices remain available: ARC רגיל and Future ARC Link buttons are untouched", () => {
  assert.ok(screen.includes('<Text style={styles.buttonText}>ARC רגיל</Text>'), "the ARC רגיל button must still be present");
  assert.match(screen, /router\.push\(\{\s*pathname:\s*"\/live",\s*params:\s*\{\s*buildId:\s*selectedBuild\.id\s*\}\s*\}\)/, "ARC רגיל must still push to the exact same /live route with the same buildId param");
  assert.match(screen, /router\.push\(\{\s*pathname:\s*"\/future-arc-link\/\[id\]",\s*params:\s*\{\s*id:\s*selectedBuild\.id\s*\}\s*\}\)/, "the Future ARC Link button must still push to the exact same route");
});

test("the ARC Goal entry point (and, behind it, the unchanged four-week program) is preserved exactly -- still a top-level chooser option routing to /arc-goal/select", () => {
  assert.ok(screen.includes('<Text style={styles.buttonText}>ARC Goal</Text>'), "the ARC Goal button must still be present");
  assert.ok(screen.includes('router.push("/arc-goal/select")'), "ARC Goal must still push to the exact same /arc-goal/select route, never touched by this fix");
});

test("a trainee with zero ArcBuilds but at least one ready combined route is not redirected away from this screen", () => {
  assert.ok(screen.includes("readyCombinedRoutes.length === 0"), "the /build redirect must be gated on there also being no ready combined routes");
  assert.ok(!screen.includes("if (loaded.length === 0)"), "the old unconditional-on-ArcBuilds-alone redirect must be gone");
});
