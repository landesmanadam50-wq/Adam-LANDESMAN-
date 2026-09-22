import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/personalDevelopmentSingleLiveEntry.test.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task, correction round 3: permanent navigation-boundary guard. Every
 * protocol mode for a combined Personal Development route (Full, Mini,
 * Route Link, Action Only) is launched from EXACTLY ONE place --
 * build/LiveModeSelectScreen.tsx's own CombinedRoutesSection, driven by
 * arc/personalDevelopmentRouteProgress.ts's own resolveAvailableEntryModes
 * -- reachable either via the one top-level "LIVE התפתחות אישית" entry
 * (build/SelfDevelopmentDashboardScreen.tsx) or via a management/program
 * card's own "▶ תרגול" button (build/PersonalDevelopmentRouteListScreen.tsx),
 * which routes through this SAME shared controller with the route's own
 * id (LiveModeSelectScreen's own `focusRouteId` param) rather than
 * resolving a mode itself. Every other Personal-Development-related
 * screen (`PD_SCREENS_MUST_NEVER_LAUNCH_A_MODE` below) may manage,
 * configure, or display progress for a route, but must never itself
 * decide "full" vs "mini" vs "route_link" vs "action_only" or push
 * directly to any of their routes. This codebase has no React Native
 * component test renderer (see build/selfDevelopmentEntryRoute.test.ts's
 * own doc), so this asserts directly on real source text, exactly like
 * that file and build/liveModeSelectCombinedRoutes.test.ts.
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
const routeEditorScreen = readSource("build/PersonalDevelopmentRouteEditorScreen.tsx");
const interferenceItemEditorScreen = readSource("build/InterferenceItemEditorScreen.tsx");
const combinedSelectionScreen = readSource("build/CombinedInterferenceSelectionScreen.tsx");
const layout = readSource("app/_layout.tsx");

/**
 * Every user-facing screen this app has that touches a combined Personal
 * Development route WITHOUT being the one sanctioned launcher
 * (LiveModeSelectScreen) or a protocol renderer itself (which legitimately
 * reads its own `mode`/step-kind internally -- that is not "launching a
 * mode," it is being one). Adding a new PD-related management/editor
 * screen means adding it here too, so this guard actually covers it.
 */
const PD_SCREENS_MUST_NEVER_LAUNCH_A_MODE: [string, string][] = [
  ["build/PersonalDevelopmentRouteListScreen.tsx", routeListScreen],
  ["build/SelfDevelopmentDashboardScreen.tsx", dashboardScreen],
  ["build/PersonalDevelopmentRouteEditorScreen.tsx", routeEditorScreen],
  ["build/InterferenceItemEditorScreen.tsx", interferenceItemEditorScreen],
  ["build/CombinedInterferenceSelectionScreen.tsx", combinedSelectionScreen],
];

test("the one top-level Personal Development entry ('LIVE התפתחות אישית') still pushes to the single shared chooser screen (/live/select), never directly to a stage renderer", () => {
  assert.match(
    dashboardScreen,
    /router\.push\(\{\s*pathname:\s*"\/live\/select",\s*params:\s*\{\s*mode:\s*"self_development"\s*\}\s*\}\)/,
    "the dashboard's own LIVE button must still push to the shared chooser, not to any specific mode/renderer directly"
  );
  assert.ok(dashboardScreen.includes('<Text style={styles.buttonText}>LIVE התפתחות אישית</Text>'), "the single entry label must still exist");
});

test("no PD management/editor screen ever directly launches a protocol mode (full/mini/route_link/action_only) or pushes to any of their routes -- every 'practice' command routes through the shared controller with the route's own id", () => {
  const forbiddenPatterns: [RegExp, string][] = [
    [/personal-development-routes\/\[id\]\/live/, 'a direct push to the existing combined LIVE route'],
    [/personal-development-routes\/\[id\]\/route-link/, 'a direct reference to the Route Link route'],
    [/personal-development-routes\/\[id\]\/action-only/, 'a direct reference to the Action Only route'],
    [/mode:\s*"full"/, 'a hardcoded mode: "full"'],
    [/mode:\s*"mini"/, 'a hardcoded mode: "mini"'],
  ];
  for (const [screenName, source] of PD_SCREENS_MUST_NEVER_LAUNCH_A_MODE) {
    for (const [pattern, description] of forbiddenPatterns) {
      assert.ok(!pattern.test(source), `${screenName} must never contain ${description}`);
    }
  }
});

test("the management screen's own 'practice' button routes through the shared controller with this route's own id (focusRouteId), never a mode it resolves itself", () => {
  assert.match(
    routeListScreen,
    /router\.push\(\{\s*pathname:\s*"\/live\/select",\s*params:\s*\{\s*focusRouteId:\s*config\.id\s*\}\s*\}\)/,
    "the practice button must push to the shared chooser with this route's own id, letting IT resolve stage/mode"
  );
  assert.ok(routeListScreen.includes("▶ תרגול"), "a single, mode-neutral practice label -- never per-mode buttons");
  assert.ok(!routeListScreen.includes("ARC מלא"), "no more direct Full label on the management screen");
  assert.ok(!routeListScreen.includes("Mini ARC"), "no more direct Mini label on the management screen");
});

test("LiveModeSelectScreen's own focusRouteId branch resolves that one route's stage/modes itself (via CombinedRoutesSection) and returns to the unified Personal Development area, never exposing the old direct-start screen", () => {
  const focusIndex = liveModeSelectScreen.indexOf("if (focusRouteId)");
  assert.ok(focusIndex !== -1, "the focusRouteId branch must exist");
  const focusBody = liveModeSelectScreen.slice(focusIndex, focusIndex + 1800);
  assert.ok(focusBody.includes("<CombinedRoutesSection"), "the focused route still goes through the one sanctioned mode-resolving component");
  assert.match(
    focusBody,
    /router\.replace\("\/personal-development-routes"\)/,
    "back navigation from the focused-route view returns to the unified Personal Development area (the management screen, now with no direct-start buttons of its own)"
  );
});

test("only build/LiveModeSelectScreen.tsx ever navigates to the new route-link/action-only screens -- no other screen exposes a competing direct entry", () => {
  assert.ok(liveModeSelectScreen.includes('"/personal-development-routes/[id]/route-link"'), "the shared chooser must still be the one place that knows about route-link");
  assert.ok(liveModeSelectScreen.includes('"/personal-development-routes/[id]/action-only"'), "the shared chooser must still be the one place that knows about action-only");

  // The management screen (build/PersonalDevelopmentRouteListScreen.tsx) no
  // longer launches ANY protocol mode directly (see the broader scan test
  // above) -- it must never reference either new screen's route either.
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
