import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/personalDevelopmentSingleLiveEntry.test.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task, correction round 3, later extended by the Personal Development
 * consolidation task, step 5: permanent navigation-boundary guard. Every
 * protocol mode for a combined Personal Development route (Full, Mini,
 * Route Link, Action Only) is launched from EXACTLY ONE real
 * implementation -- build/CombinedRoutesSection.tsx -- reused, unmodified,
 * by the TWO thin entry screens that render it: the dashboard's own
 * "LIVE התפתחות אישית" button (build/PersonalDevelopmentLiveSelectScreen.tsx,
 * browsing every ready program, no legacy ArcBuild/ARC Goal chooser
 * anywhere on it) and a My Routine card's own "▶ תרגול" button
 * (build/PersonalDevelopmentRouteListScreen.tsx, via
 * build/LiveModeSelectScreen.tsx's own `focusRouteId` branch, scoped to
 * exactly that one route, also never surfacing ArcBuild). Neither entry
 * screen resolves a mode itself -- both hand off to the one shared
 * CombinedRoutesSection. Every other Personal-Development-related screen
 * (`PD_SCREENS_MUST_NEVER_LAUNCH_A_MODE` below) may manage, configure, or
 * display progress for a route, but must never itself decide "full" vs
 * "mini" vs "route_link" vs "action_only" or push directly to any of
 * their routes. This codebase has no React Native component test
 * renderer (see build/selfDevelopmentEntryRoute.test.ts's own doc), so
 * this asserts directly on real source text, exactly like that file and
 * build/liveModeSelectCombinedRoutes.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const liveModeSelectScreen = readSource("build/LiveModeSelectScreen.tsx");
const combinedRoutesSectionModule = readSource("build/CombinedRoutesSection.tsx");
const routeListScreen = readSource("build/PersonalDevelopmentRouteListScreen.tsx");
const dashboardScreen = readSource("build/SelfDevelopmentDashboardScreen.tsx");
const liveSelectScreen = readSource("build/PersonalDevelopmentLiveSelectScreen.tsx");
const routeLinkScreen = readSource("live/PersonalDevelopmentRouteLinkScreen.tsx");
const actionOnlyScreen = readSource("live/PersonalDevelopmentRouteActionOnlyScreen.tsx");
const combinedLiveScreen = readSource("live/CombinedInterferenceLiveScreen.tsx");
const routeEditorScreen = readSource("build/PersonalDevelopmentRouteEditorScreen.tsx");
const interferenceItemEditorScreen = readSource("build/InterferenceItemEditorScreen.tsx");
const combinedSelectionScreen = readSource("build/CombinedInterferenceSelectionScreen.tsx");
const layout = readSource("app/_layout.tsx");

/**
 * Every user-facing screen this app has that touches a combined Personal
 * Development route WITHOUT being one of the two sanctioned launcher
 * screens (LiveModeSelectScreen, PersonalDevelopmentLiveSelectScreen) or
 * a protocol renderer itself (which legitimately reads its own
 * `mode`/step-kind internally -- that is not "launching a mode," it is
 * being one). Adding a new PD-related management/editor screen means
 * adding it here too, so this guard actually covers it.
 */
const PD_SCREENS_MUST_NEVER_LAUNCH_A_MODE: [string, string][] = [
  ["build/PersonalDevelopmentRouteListScreen.tsx", routeListScreen],
  ["build/SelfDevelopmentDashboardScreen.tsx", dashboardScreen],
  ["build/PersonalDevelopmentRouteEditorScreen.tsx", routeEditorScreen],
  ["build/InterferenceItemEditorScreen.tsx", interferenceItemEditorScreen],
  ["build/CombinedInterferenceSelectionScreen.tsx", combinedSelectionScreen],
  ["build/PersonalDevelopmentLiveSelectScreen.tsx", liveSelectScreen],
];

test("the one top-level Personal Development entry ('LIVE התפתחות אישית') pushes to the PD-only LIVE screen, never the legacy mixed ArcBuild/ARC-Goal chooser and never directly to a stage renderer", () => {
  assert.match(
    dashboardScreen,
    /router\.push\("\/personal-development-routes\/live-select"\)/,
    "the dashboard's own LIVE button must push to the dedicated PD-only LIVE screen, not the mixed ArcBuild/ARC Goal chooser"
  );
  assert.ok(!dashboardScreen.includes('"/live/select"'), "the dashboard must never reference the mixed chooser route any more -- ArcBuild/ARC Goal are legacy, hidden from the normal PD interface");
  assert.ok(dashboardScreen.includes('<Text style={styles.buttonText}>LIVE התפתחות אישית</Text>'), "the single entry label must still exist");
});

test("PersonalDevelopmentLiveSelectScreen never surfaces ArcBuild or ARC Goal -- it renders ONLY the shared CombinedRoutesSection, the same component the general chooser's focusRouteId branch also reuses", () => {
  assert.ok(!liveSelectScreen.includes("loadArcBuilds"), "must never load ArcBuild -- this is the PD-only entry, never the mixed chooser");
  assert.ok(!liveSelectScreen.includes("arc-goal"), "must never reference ARC Goal");
  assert.match(liveSelectScreen, /import\s*{\s*CombinedRoutesSection\s*}\s*from\s*["']\.\/CombinedRoutesSection\.tsx["']/, "must reuse the one shared CombinedRoutesSection, never a second parallel implementation");
  assert.ok(liveSelectScreen.includes("selectActiveCombinedRoutesForLive"), "must load ready routes via the exact same sanctioned selector every other PD LIVE entry point uses");
});

test("the PD-only LIVE route is registered as an internal Stack screen under the same personal-development-routes segment", () => {
  assert.ok(layout.includes('name="personal-development-routes/live-select"'), "the route must be registered");
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

test("only build/CombinedRoutesSection.tsx ever navigates to the new route-link/action-only screens -- no other screen exposes a competing direct entry", () => {
  // Personal Development consolidation task, step 5: pushCombinedRouteMode
  // (and every other real "which mode, which route" decision) was
  // extracted out of build/LiveModeSelectScreen.tsx into the shared
  // build/CombinedRoutesSection.tsx -- this is now the ONE place, reused
  // unmodified by both build/LiveModeSelectScreen.tsx's own focusRouteId
  // branch and build/PersonalDevelopmentLiveSelectScreen.tsx.
  assert.ok(combinedRoutesSectionModule.includes('"/personal-development-routes/[id]/route-link"'), "the shared component must still be the one place that knows about route-link");
  assert.ok(combinedRoutesSectionModule.includes('"/personal-development-routes/[id]/action-only"'), "the shared component must still be the one place that knows about action-only");
  assert.ok(!liveModeSelectScreen.includes("route-link"), "LiveModeSelectScreen itself must never reference Route Link directly -- only via the shared component it imports");
  assert.ok(!liveModeSelectScreen.includes("action-only"), "LiveModeSelectScreen itself must never reference Action Only directly -- only via the shared component it imports");

  // The management screen (build/PersonalDevelopmentRouteListScreen.tsx) no
  // longer launches ANY protocol mode directly (see the broader scan test
  // above) -- it must never reference either new screen's route either.
  assert.ok(!routeListScreen.includes("route-link"), "the management screen must never reference the Route Link route directly");
  assert.ok(!routeListScreen.includes("action-only"), "the management screen must never reference the Action Only route directly");

  // The dashboard and the PD-only LIVE screen must never reference either new screen's route directly.
  assert.ok(!dashboardScreen.includes("route-link"), "the dashboard must never reference Route Link directly");
  assert.ok(!dashboardScreen.includes("action-only"), "the dashboard must never reference Action Only directly");
  assert.ok(!liveSelectScreen.includes("route-link"), "the PD-only LIVE screen must never reference Route Link directly -- only via the shared component it imports");
  assert.ok(!liveSelectScreen.includes("action-only"), "the PD-only LIVE screen must never reference Action Only directly -- only via the shared component it imports");

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

test("the stage-driven Route Link/Action Only entry never appears as an equal primary choice -- only inside the clearly separate 'advanced' row, resolved via resolveAdvancedModesForStage -- and every navigation call goes through the one shared pushCombinedRouteMode helper", () => {
  const sectionIndex = combinedRoutesSectionModule.indexOf("export function CombinedRoutesSection");
  const sectionBody = combinedRoutesSectionModule.slice(sectionIndex);
  // Personal Development consolidation task, step 4: the two primary
  // buttons are always Full ARC and Mini ARC, unconditionally -- never a
  // stage-resolved "recommended" mode that could itself be route_link/
  // action_only. Route Link/Action Only, when unlocked, render ONLY in
  // the separate advancedModes row below, never mixed into the primary
  // row or presented as co-equal top-level choices.
  assert.ok(sectionBody.includes('pushCombinedRouteMode(config.id, "full")'), "the first primary button is always Full ARC, never stage-resolved");
  assert.ok(sectionBody.includes('pushCombinedRouteMode(config.id, "mini")'), "the second primary button is always Mini ARC, never stage-resolved");
  assert.ok(!sectionBody.includes("recommended"), "no stage-resolved 'recommended' mode drives the primary buttons any more");
  assert.ok(sectionBody.includes("resolveAdvancedModesForStage(stage)"), "Route Link/Action Only availability is resolved via the dedicated advanced-modes helper");
  assert.ok(sectionBody.includes("advancedModes.map((mode) => ("), "advanced modes render in their own separate row, never merged with the two primary buttons");
  const routerPushCallsInSection = sectionBody.match(/router\.push\(/g) ?? [];
  assert.equal(routerPushCallsInSection.length, 0, "CombinedRoutesSection itself must never call router.push directly -- only via the shared pushCombinedRouteMode helper");
});

test("resolveAdvancedModesForStage never includes full/mini -- those are always the two primary buttons, never duplicated in the advanced row", () => {
  const helperIndex = combinedRoutesSectionModule.indexOf("function resolveAdvancedModesForStage");
  assert.ok(helperIndex !== -1, "resolveAdvancedModesForStage must exist");
  const helperBody = combinedRoutesSectionModule.slice(helperIndex, combinedRoutesSectionModule.indexOf("export function CombinedRoutesSection"));
  assert.ok(helperBody.includes('mode === "route_link" || mode === "action_only"'), "only route_link/action_only are ever collected into the advanced set");
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

test("correction round 4: Route Link's own short reinforcement/gratitude line renders ONLY in the completion screen's 'done' branch -- never while 'saving', never on 'error', so it can never be shown before every required action role is actually confirmed and the one completion record has landed", () => {
  const constIndex = routeLinkScreen.indexOf("const ROUTE_LINK_REINFORCEMENT_LINE");
  assert.ok(constIndex !== -1, "the reinforcement line constant must exist");

  const savingBranchIndex = routeLinkScreen.indexOf('if (status === "saving")');
  const errorBranchIndex = routeLinkScreen.indexOf('if (status === "error")');
  // "יציאה" (exit) is the error branch's own second button, appearing nowhere
  // else in this component -- everything up to and including it is the
  // saving/error branches; the reinforcement line must appear strictly after.
  const errorExitButtonIndex = routeLinkScreen.indexOf('label="יציאה"');
  assert.ok(savingBranchIndex !== -1 && errorBranchIndex !== -1 && errorExitButtonIndex !== -1, "saving/error branches and the error branch's own exit button must exist");
  assert.ok(savingBranchIndex < errorBranchIndex && errorBranchIndex < errorExitButtonIndex, "branches appear in the expected source order: saving, then error (ending in its own exit button)");

  const savingAndErrorBody = routeLinkScreen.slice(savingBranchIndex, errorExitButtonIndex);
  const usageIndex = routeLinkScreen.indexOf("{ROUTE_LINK_REINFORCEMENT_LINE}");
  assert.ok(usageIndex !== -1, "the reinforcement line must actually be rendered (JSX usage), not just declared");
  assert.ok(!savingAndErrorBody.includes("ROUTE_LINK_REINFORCEMENT_LINE"), "the reinforcement line must never render on 'saving' or 'error'");
  assert.ok(usageIndex > errorExitButtonIndex, "the reinforcement line's own rendering must come after the error branch -- i.e. only in the final 'done' branch, after the completion record has landed");
});
