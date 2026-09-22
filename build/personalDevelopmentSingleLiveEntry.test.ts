import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/personalDevelopmentSingleLiveEntry.test.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task, correction round 2: permanent navigation-boundary guard. The new
 * Route Link (Stage 3) and Action Only (Stage 4) screens are internal
 * stage renderers reachable ONLY through the one existing "התפתחות אישית
 * LIVE" entry point (build/SelfDevelopmentDashboardScreen.tsx ->
 * build/LiveModeSelectScreen.tsx's own CombinedRoutesSection, driven by
 * arc/personalDevelopmentRouteProgress.ts's own resolveAvailableEntryModes)
 * -- they must never become a second, competing, directly-navigable "LIVE"
 * system. This codebase has no React Native component test renderer (see
 * build/selfDevelopmentEntryRoute.test.ts's own doc), so this asserts
 * directly on real source text, exactly like that file and
 * build/liveModeSelectCombinedRoutes.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const liveModeSelectScreen = readSource("build/LiveModeSelectScreen.tsx");
const routeListScreen = readSource("build/PersonalDevelopmentRouteListScreen.tsx");
const dashboardScreen = readSource("build/SelfDevelopmentDashboardScreen.tsx");
const routeLinkScreen = readSource("live/PersonalDevelopmentRouteLinkScreen.tsx");
const actionOnlyScreen = readSource("live/PersonalDevelopmentRouteActionOnlyScreen.tsx");
const combinedLiveScreen = readSource("live/CombinedInterferenceLiveScreen.tsx");
const layout = readSource("app/_layout.tsx");

test("the one top-level Personal Development entry ('LIVE התפתחות אישית') still pushes to the single shared chooser screen (/live/select), never directly to a stage renderer", () => {
  assert.match(
    dashboardScreen,
    /router\.push\(\{\s*pathname:\s*"\/live\/select",\s*params:\s*\{\s*mode:\s*"self_development"\s*\}\s*\}\)/,
    "the dashboard's own LIVE button must still push to the shared chooser, not to any specific mode/renderer directly"
  );
  assert.ok(dashboardScreen.includes('<Text style={styles.buttonText}>LIVE התפתחות אישית</Text>'), "the single entry label must still exist");
});

test("only build/LiveModeSelectScreen.tsx ever navigates to the new route-link/action-only screens -- no other screen exposes a competing direct entry", () => {
  assert.ok(liveModeSelectScreen.includes('"/personal-development-routes/[id]/route-link"'), "the shared chooser must still be the one place that knows about route-link");
  assert.ok(liveModeSelectScreen.includes('"/personal-development-routes/[id]/action-only"'), "the shared chooser must still be the one place that knows about action-only");

  // The management screen (build/PersonalDevelopmentRouteListScreen.tsx) keeps its
  // own pre-existing Full/Mini start buttons (Full/Mini are never stage-locked --
  // they remain valid secondary support at every stage, per the approved
  // "recommend, don't hard-lock" design) but must never grow a competing
  // Route Link/Action Only entry of its own.
  assert.ok(!routeListScreen.includes("route-link"), "the management screen must never reference the Route Link route directly");
  assert.ok(!routeListScreen.includes("action-only"), "the management screen must never reference the Action Only route directly");

  // The dashboard itself must never reference either new screen's route directly.
  assert.ok(!dashboardScreen.includes("route-link"), "the dashboard must never reference Route Link directly");
  assert.ok(!dashboardScreen.includes("action-only"), "the dashboard must never reference Action Only directly");

  // The existing combined Full/Mini LIVE screen must never reference either
  // new mode's route directly either -- each mode's own screen owns its own
  // navigation exclusively.
  assert.ok(!combinedLiveScreen.includes("route-link"), "the existing Full/Mini combined LIVE screen must never reference Route Link directly");
  assert.ok(!combinedLiveScreen.includes("action-only"), "the existing Full/Mini combined LIVE screen must never reference Action Only directly");
});

test("both stage routes are registered as internal Stack screens under the same personal-development-routes/[id] segment as the existing combined LIVE route -- never a separate top-level route group", () => {
  const liveIndex = layout.indexOf('name="personal-development-routes/[id]/live"');
  const routeLinkIndex = layout.indexOf('name="personal-development-routes/[id]/route-link"');
  const actionOnlyIndex = layout.indexOf('name="personal-development-routes/[id]/action-only"');
  assert.ok(liveIndex !== -1 && routeLinkIndex !== -1 && actionOnlyIndex !== -1, "all three routes must be registered");
  assert.ok(routeLinkIndex > liveIndex, "route-link registered alongside (immediately after) the existing combined LIVE route, not as a separate top-level group");
  assert.ok(actionOnlyIndex > routeLinkIndex, "action-only registered alongside the same group");
});

test("each route's recommended/secondary entry is the only place that decides which of the two new screens to open -- the stage alone drives it, never a trainee-facing engine picker", () => {
  const sectionIndex = liveModeSelectScreen.indexOf("function CombinedRoutesSection");
  const sectionBody = liveModeSelectScreen.slice(sectionIndex);
  // Exactly one primary ("recommended") action per route card, plus the
  // secondary row -- never a free-standing "choose your engine" menu with
  // Route Link/Action Only presented as co-equal top-level choices outside
  // the recommended/secondary structure. Every navigation call inside this
  // component must go through the one shared pushCombinedRouteMode helper.
  assert.ok(sectionBody.includes("pushCombinedRouteMode(config.id, recommended)"), "exactly one recommended action per route, resolved from that route's own stage");
  const routerPushCallsInSection = sectionBody.match(/router\.push\(/g) ?? [];
  assert.equal(routerPushCallsInSection.length, 0, "CombinedRoutesSection itself must never call router.push directly -- only via the shared pushCombinedRouteMode helper");
});

test("Route Link's own restart recovery resumes ONLY a pending route_link action, never intercepting a Full/Mini/Action-Only pending action for the same route", () => {
  assert.ok(
    routeLinkScreen.includes('run.frozenCombinedActionSnapshot.facts.mode !== "route_link"'),
    "findResumableRouteLinkAction must filter strictly to mode 'route_link'"
  );
});

test("Action Only's own restart recovery resumes ONLY a pending action_only action, never intercepting a Full/Mini/Route-Link pending action for the same route", () => {
  assert.ok(
    actionOnlyScreen.includes('run.frozenCombinedActionSnapshot.facts.mode !== "action_only"'),
    "findResumableActionOnlyAction must filter strictly to mode 'action_only'"
  );
});

test("the existing combined Full/Mini LIVE screen's own restart recovery never intercepts a Route Link/Action Only pending action either -- the mode boundary is symmetric", () => {
  assert.ok(
    combinedLiveScreen.includes('run.frozenCombinedActionSnapshot.facts.mode !== "full" && run.frozenCombinedActionSnapshot.facts.mode !== "mini"'),
    "findResumableCombinedAction must filter strictly to mode 'full'/'mini'"
  );
});

test("restart recovery on both new screens resumes straight into the pending action confirmation -- never a mode/engine-selection screen", () => {
  for (const [name, screen] of [
    ["route-link", routeLinkScreen],
    ["action-only", actionOnlyScreen],
  ] as const) {
    const bypassFnIndex = screen.indexOf("function renderBypassAction");
    assert.ok(bypassFnIndex !== -1, `${name}: renderBypassAction must exist`);
    const bypassBody = screen.slice(bypassFnIndex, bypassFnIndex + 900);
    assert.ok(bypassBody.includes("<ActionScreen"), `${name}: resume must render the real ActionScreen directly`);
    assert.ok(!bypassBody.includes("router.push"), `${name}: resume must never navigate away to a chooser -- it renders in place`);
  }
});

test("both new screens' completion returns to the same unified Personal Development destination Full/Mini's own completion screen already uses", () => {
  assert.ok(combinedLiveScreen.includes('router.replace("/personal-development-routes")'), "sanity: Full/Mini's own completion destination");
  assert.ok(routeLinkScreen.includes('router.replace("/personal-development-routes")'), "Route Link completion must return to the same unified destination");
  assert.ok(actionOnlyScreen.includes('router.replace("/personal-development-routes")'), "Action Only completion must return to the same unified destination");
});
