import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/newArcLiveScreen.test.ts
 *
 * Simplified-architecture task, Phase 2: source-text regression guard
 * for the new ARC LIVE screen's wiring -- navigation, persistence, and
 * return-to-task behavior. The state machine itself is covered by
 * arc/newArcLiveSteps.test.ts, and every displayed line by
 * arc/newArcLiveCopy.test.ts -- this file only checks that the screen
 * component wires those two pure modules correctly, exactly like every
 * other screen test in this codebase (no React Native component test
 * renderer exists here).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");
const route = readSource("app/tasks/[id]/arc.tsx");
const layout = readSource("app/_layout.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const storage = readSource("data/storage.ts");

test("the arc route is registered in app/_layout.tsx and passes the id param straight through to NewArcLiveScreen", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/arc"/);
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/NewArcLiveScreen\.tsx["']/);
  assert.ok(route.includes("<NewArcLiveScreen"));
  assert.ok(route.includes("taskId={id}"));
});

test("entry: the end-of-timer 'צריך ARC' choice preserves the task id and opens the new flow, never ARC BUILD or the old LIVE chooser", () => {
  const startArcIndex = activeTaskScreen.indexOf('if (choice === "start_arc")');
  const startArcBody = activeTaskScreen.slice(startArcIndex, startArcIndex + 700);
  assert.ok(startArcBody.includes('pathname: "/tasks/[id]/arc", params: { id: task.id }'));
});

// ARCHI -- Consolidated Implementation Request, Part 12.1: ARC remains
// accessible while the task timer is active via the mood-based entry
// points ("😟 פחות טוב"/"🙂 סבבה") that replaced the old "צריך ARC"
// button; productivity upgrade requirement 4 (pause the work timer
// first, never clearing/discarding the run) is unchanged.
test("entry: ARC remains accessible while the task timer is active via the mood-based buttons; productivity upgrade requirement 4: it pauses the task's own work timer first (reusing handlePause, never a duplicated pause path, never clearing/discarding the run)", () => {
  const activeBlockIndex = activeTaskScreen.indexOf("!timerEnded && !restRun && timerRun && !timerRunEnded && status && (");
  const activeBlock = activeTaskScreen.slice(activeBlockIndex, activeBlockIndex + 4500);
  assert.match(activeBlock, /openFullArc\(task\.id\)/);
  assert.match(activeBlock, /openShortenedArc\(task\.id\)/);
  const arcButtonIndex = activeBlock.indexOf("openFullArc(task.id)");
  const nearbyBefore = activeBlock.slice(Math.max(0, arcButtonIndex - 300), arcButtonIndex);
  assert.ok(!nearbyBefore.includes("clearTaskTimerRun()"), "entering ARC from an active timer must never clear/discard that timer's run");
  assert.ok(nearbyBefore.includes("await handlePause()"), "entering ARC from an active timer must pause the task's own work timer, via the exact same handlePause() the explicit pause button uses");
});

test("persistence: loadNewArcLiveSession/saveNewArcLiveSession/clearNewArcLiveSession are all exported and mirror the exact single-slot shape of loadTaskTimerRun/saveTaskTimerRun/clearTaskTimerRun", () => {
  for (const fn of ["loadNewArcLiveSession", "saveNewArcLiveSession", "clearNewArcLiveSession"]) {
    assert.match(storage, new RegExp(`export async function ${fn}\\(`), `${fn} must be exported from data/storage.ts`);
  }
  assert.match(storage, /const NEW_ARC_LIVE_SESSION_KEY = "archi\.newArcLiveSession\.v1";/);
});

test("body region selection correction task: loadNewArcLiveSession backfills BOTH the new negative-side fields and the pre-existing positive-side fields for a session saved before they existed, never inventing a non-empty/non-null value", () => {
  const fnIndex = storage.indexOf("export async function loadNewArcLiveSession(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("supportiveBodyAreas: parsed.supportiveBodyAreas ?? []"));
  assert.ok(fnBody.includes("supportiveBodyAreaCustomLabel: parsed.supportiveBodyAreaCustomLabel ?? null"));
  assert.ok(fnBody.includes("unpleasantBodyAreas: parsed.unpleasantBodyAreas ?? []"));
  assert.ok(fnBody.includes("unpleasantBodyAreaCustomLabel: parsed.unpleasantBodyAreaCustomLabel ?? null"));
});

// Body Scan Upgrade task, required test 9: a session saved before this
// task's four new fields existed must have them backfilled to their own
// true empty/unset default (never invented, never overwriting a value
// that IS present) -- the same ?? convention as the pre-existing fields
// checked just above.
test("Body Scan Upgrade: loadNewArcLiveSession backfills its own four new fields to their true empty/unset default, never overwriting an already-saved selection", () => {
  const fnIndex = storage.indexOf("export async function loadNewArcLiveSession(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("bodyScanContractionRegions: parsed.bodyScanContractionRegions ?? []"));
  assert.ok(fnBody.includes("bodyScanHeavinessRegions: parsed.bodyScanHeavinessRegions ?? []"));
  assert.ok(fnBody.includes("primaryOpeningBodyScanRegion: parsed.primaryOpeningBodyScanRegion ?? null"));
  assert.ok(fnBody.includes("primaryOpeningBodyScanSide: parsed.primaryOpeningBodyScanSide ?? null"));
});

// ARC LIVE Body Scan and Protocol Restructuring task, required test 15
// (compatibility with older saved sessions): loadNewArcLiveSession runs
// every loaded session through migrateLegacyNewArcLiveStep, the one
// place a session stranded on a removed step (unpleasant_area_question/
// unpleasant_area_select/dwelling/supportive_sensation_select/
// supportive_movement_select) forward-migrates to a still-active step.
test("loadNewArcLiveSession runs the loaded, backfilled session through migrateLegacyNewArcLiveStep before returning it -- so an old session stranded on a removed step always resumes on a still-active one", () => {
  assert.match(storage, /import \{ migrateLegacyNewArcLiveStep \} from "\.\.\/arc\/newArcLiveSteps\.ts";/);
  const fnIndex = storage.indexOf("export async function loadNewArcLiveSession(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("return migrateLegacyNewArcLiveStep(backfilled);"));
});

// ARC Full Sequence Update task, Part 13/Section 15 (historical
// compatibility): a session saved before the four new desired-feeling
// fields existed must have them backfilled to their own true, never-
// invented "not chosen/not yet present" default -- same ?? convention
// as every other backfilled field above.
test("ARC Full Sequence Update: loadNewArcLiveSession backfills desiredFeelingText/desiredFeelingBodyAreas/desiredFeelingBodyAreaCustomLabel/desiredFeelingNotYetPresent to their true empty/unset default, never overwriting an already-saved value", () => {
  const fnIndex = storage.indexOf("export async function loadNewArcLiveSession(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("desiredFeelingText: parsed.desiredFeelingText ?? null"));
  assert.ok(fnBody.includes("desiredFeelingBodyAreas: parsed.desiredFeelingBodyAreas ?? []"));
  assert.ok(fnBody.includes("desiredFeelingBodyAreaCustomLabel: parsed.desiredFeelingBodyAreaCustomLabel ?? null"));
  assert.ok(fnBody.includes("desiredFeelingNotYetPresent: parsed.desiredFeelingNotYetPresent ?? false"));
});

// Final ARC Flow & Body Animation task, "Select Opening Regions": a
// session saved before openingBodyScanRegions existed must have it
// backfilled to an empty array -- its own true "nothing chosen yet"
// default, same ?? convention as every field above, never overwriting
// an already-saved multi-select answer.
test("Final ARC Flow task: loadNewArcLiveSession backfills openingBodyScanRegions to an empty array for a session saved before this task existed; ARCHI -- Green/Blue Logic task: each entry's own role defaults to 'opening' (green) when loading an old, pre-role-field session", () => {
  const fnIndex = storage.indexOf("export async function loadNewArcLiveSession(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("(parsed.openingBodyScanRegions ?? [])"));
  assert.ok(fnBody.includes('entry.role ?? "opening"'));
});

// A session saved mid-flight on unpleasant_area_question/
// unpleasant_area_select/dwelling BEFORE this task re-activated them
// (when they were still migrated away) now simply resumes there
// normally after loadNewArcLiveSession -- migrateLegacyNewArcLiveStep
// itself is a no-op for all three (verified directly in
// arc/newArcLiveSteps.test.ts); this only confirms the backfilled
// session's currentStep is never second-guessed by anything in
// loadNewArcLiveSession besides that one migration call.
test("ARC Full Sequence Update: a session persisted mid-flight on the re-activated dwelling trio resumes there via loadNewArcLiveSession, with its own already-answered fields (e.g. a historical desiredEnding) intact", () => {
  const fnIndex = storage.indexOf("export async function loadNewArcLiveSession(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  // The backfill object spreads ...parsed first, so every field not
  // explicitly listed (including currentStep and desiredEnding) passes
  // through completely untouched before migrateLegacyNewArcLiveStep
  // -- now a no-op for these three steps -- runs.
  assert.match(fnBody, /const backfilled: NewArcLiveSessionState = \{\s*\.\.\.parsed,/);
});

// Required test 7: closing an info popup must never reset selections --
// verified structurally: infoModal is its own, separate piece of UI
// state, and every place that closes it (onRequestClose, the overlay's
// own onPress, and the "סגור" button) only ever calls setInfoModal(null),
// never touching `session`/commit at all.
test("Body Scan Upgrade, required test 7: the info-popup Modal is pure UI state, closed only via setInfoModal(null) -- never via commit() or any session mutation", () => {
  const modalIndex = screen.indexOf("<Modal visible={!!infoModal}");
  assert.ok(modalIndex >= 0, "the info-popup Modal must exist");
  const modalBlock = screen.slice(modalIndex, screen.indexOf("</Modal>", modalIndex));
  const closeCalls = modalBlock.match(/setInfoModal\(null\)/g) ?? [];
  assert.ok(closeCalls.length >= 3, "onRequestClose, the overlay tap, and the close button must each close it the same way");
  assert.ok(!modalBlock.includes("commit("), "closing the popup must never call commit() -- selections are never touched by this Modal");
});

// Body Scan Upgrade task, section 7: the four Hebrew info popups the
// spec requires -- one per screen/term, each wired to its own, correctly
// worded info source from arc/bodyScanRegions.ts.
test("Body Scan Upgrade: all four required info icons are wired to their own correctly named info source", () => {
  assert.ok(screen.includes("setInfoModal(BODY_SCAN_CONTRACTION_INFO)"));
  assert.ok(screen.includes("setInfoModal(BODY_SCAN_HEAVINESS_INFO)"));
  assert.ok(screen.includes("setInfoModal(BODY_SCAN_CLOSEDNESS_INFO)"));
  assert.ok(screen.includes("setInfoModal(BODY_SCAN_OPENNESS_INFO)"));
});

/** Slices out one switch-case's own render block, from its own "case" line up to (but not including) the next top-level "case" line -- same convention every other per-case test in this file already uses via a fixed-length slice, but bounded exactly instead of by a guessed character count. */
function sliceCaseBlock(caseLabel: string): string {
  const start = screen.indexOf(caseLabel);
  assert.ok(start >= 0, `${caseLabel} must exist`);
  const nextCase = screen.slice(start + caseLabel.length).search(/\n\s*case "/);
  return nextCase === -1 ? screen.slice(start) : screen.slice(start, start + caseLabel.length + nextCase);
}

// Unified ARC Architecture and Interactive Animation Update, Phase 1
// ("Interactive Segmented Body"): the real SVG front/back body
// silhouette (live/components/BodySilhouetteMap.tsx) replaced the old
// chip-grid rendering for every body-scan identification screen -- the
// shape data itself (all 26 regions, paired left/right) is owned and
// tested by arc/bodySilhouetteLayout.ts/arc/bodySilhouetteLayout.test.ts;
// this file only checks that each screen wires the component to the
// exact same existing session fields/setters the chips used to.
// ARCHI -- Full ARC Body Flow Redesign task, Screen One: the combined
// Red/Green tap cycle now runs through cycleBodyScanContractionAndGreen
// (1st tap -> Red, 2nd tap for movement-eligible regions only -> Green,
// next tap -> deselect), with the per-region color resolved by
// resolveContractionOrGreenColor (Red vs Green) rather than the old
// single-color toggleBodyScanContractionRegion setter.
test("body_scan_contraction (Screen One) renders BodySilhouetteMap, cycling Red/Green via cycleBodyScanContractionAndGreen and resolving each region's own Red/Green color via resolveContractionOrGreenColor", () => {
  const contractionBlock = sliceCaseBlock('case "body_scan_contraction":');
  assert.ok(contractionBlock.includes("<BodyMapMagnifier"), "body_scan_contraction must render the real body silhouette, never the old chip grid");
  assert.ok(contractionBlock.includes("resolveContractionOrGreenColor(session!, region, side)"), "each region's own Red vs Green color must come from the shared resolver");
  assert.ok(contractionBlock.includes("commit(cycleBodyScanContractionAndGreen(session!, region, side))"), "the combined Red/Green tap cycle must run through the one shared engine setter");
});

// ARC Full Sequence Update task, Part 3: "Identify Heavy and Closed
// Regions" via TWO CONSECUTIVE, SEPARATE questions -- body_scan_heaviness
// and body_scan_closedness are each their own independent bit over the
// exact same bodyScanHeavinessRegions array, never a combined picker.
test("body_scan_heaviness renders BodySilhouetteMap over its own heaviness bit, via toggleBodyScanHeavinessRegion -- 'Dark Blue: existing heaviness or closedness information'", () => {
  const heavinessBlock = sliceCaseBlock('case "body_scan_heaviness":');
  assert.ok(heavinessBlock.includes("<BodyMapMagnifier"));
  assert.ok(heavinessBlock.includes('current === "heaviness" || current === "heaviness_and_closedness"'));
  assert.ok(heavinessBlock.includes("commit(toggleBodyScanHeavinessRegion(session!, region, side))"));
  assert.ok(heavinessBlock.includes("selectedColor={HEAVINESS_CLOSEDNESS_SELECTED_COLOR}"));
  assert.ok(heavinessBlock.includes("resolveBodyScanHeavinessState("), "the current state must come from the shared resolver, never re-derived ad hoc");
});

// Final ARC Flow & Body Animation task, requirement 1 ("Identify
// Closure... ONLY regions with a real, gentle, anatomically meaningful
// opening movement") + requirement 2 ("Only enable closure selection
// for regions with a supported opening animation"): body_scan_closedness
// now restricts its own selectableRegions to exactly
// arc/bodyRegionMovements.ts's movement-eligible table.
test("body_scan_closedness renders BodySilhouetteMap over its own closedness bit, via toggleBodyScanClosednessRegion, independent of body_scan_heaviness, restricted to movement-eligible regions", () => {
  const closednessBlock = sliceCaseBlock('case "body_scan_closedness":');
  assert.ok(closednessBlock.includes("<BodyMapMagnifier"));
  assert.ok(closednessBlock.includes('current === "closedness" || current === "heaviness_and_closedness"'));
  assert.ok(closednessBlock.includes("commit(toggleBodyScanClosednessRegion(session!, region, side))"));
  assert.ok(closednessBlock.includes("selectedColor={HEAVINESS_CLOSEDNESS_SELECTED_COLOR}"));
  assert.ok(closednessBlock.includes("selectableRegions={MOVEMENT_ELIGIBLE_SILHOUETTE_REGIONS}"), "closure selection must be restricted to movement-eligible regions -- never eyes/ears/head/etc.");
});

test("MOVEMENT_ELIGIBLE_SILHOUETTE_REGIONS is computed once from arc/bodyRegionMovements.ts's own eligibility table, never re-derived or hardcoded ad hoc", () => {
  assert.match(screen, /const MOVEMENT_ELIGIBLE_SILHOUETTE_REGIONS = toSilhouetteRegionKeys\(resolveMovementEligibleRegionKeys\(\)\);/);
});

// Final ARC Flow & Body Animation task, requirement 1 ("Select Opening
// Regions: select ONLY from the closure regions previously marked...
// support simultaneous movement of multiple selected regions"): now a
// genuine multi-select (toggle + its own explicit continue button)
// over the NEW openingBodyScanRegions field.
//
// ARCHI -- Full ARC Body Flow Redesign task: body_scan_opening_region
// (Screen Two) is now Blue-ONLY, reached after Acceptance Part 1 --
// every Red/Green region from Screen One is absolutely excluded, both
// at the engine level (cycleSupportiveOnlyOpening/toggleSupportiveOpeningRegion)
// and here in the UI's own selectableRegions filter
// (resolveSupportiveEligibleSilhouetteRegions, which drops any region
// currently marked contraction). There is no green marker/color on
// this screen at all any more -- only Blue.
test("body_scan_opening_region (Screen Two) restricts selectableRegions to resolveSupportiveEligibleSilhouetteRegions (every Red/Green region from Screen One excluded), is Blue-only, and uses its own explicit continue button", () => {
  const openingBlock = sliceCaseBlock('case "body_scan_opening_region":');
  assert.ok(openingBlock.includes("<BodyMapMagnifier"));
  assert.ok(openingBlock.includes("selectableRegions={resolveSupportiveEligibleSilhouetteRegions(session!)}"), "Screen Two's own selectable pool must come from the shared Red/Green-excluding resolver, never an unrestricted list");
  assert.ok(openingBlock.includes('resolveBodyScanOpeningRole(session!.openingBodyScanRegions, region, side) === "opening_and_supportive"'), "isSelected must read the Blue (opening_and_supportive) role specifically -- Green never renders as selected here");
  // Engine-level enforcement: onToggle runs through the dedicated
  // attemptToggleSupportiveOpeningRegion pre-check (max-two-Blue
  // message AND the absolute Red/Green exclusion), never the old
  // combined-picker setter.
  assert.ok(openingBlock.includes("const next = attemptToggleSupportiveOpeningRegion(session!, region, side);"));
  assert.ok(openingBlock.includes("if (next) commit(next);"));
  assert.ok(openingBlock.includes("commit(confirmOpeningBodyScanRegions(session!, now))"), "a multi-select screen needs its own explicit continue action, never auto-advance on tap");
  // No Green anywhere on this screen -- Blue is the only selection color.
  assert.ok(openingBlock.includes("selectedColor={OPENING_BLUE_SELECTED_COLOR}"), "Screen Two's own selection color is Blue only");
  assert.ok(!openingBlock.includes("OPENING_GREEN_SELECTED_COLOR"), "Green must never appear on Screen Two at all");
  assert.ok(!openingBlock.includes("resolveFocusColorHex"), "the opening-region selection screen must never use the trainee's own arbitrary Presence color as its marker any more");
});

test("the screen resumes an existing persisted session only when its own taskId matches and it isn't already completed -- never resuming a finished or a different task's session", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (9000 -> 10500) to fit the new arcSavingSnapshot resolution reload() grew.
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 10500);
  assert.ok(reloadBody.includes("existing.taskId === taskId"));
  assert.ok(reloadBody.includes("!existing.completedAt"));
});

test("every state change is persisted immediately via the shared commit() helper -- never only kept in local React state", () => {
  const commitIndex = screen.indexOf("function commit(");
  const commitBody = screen.slice(commitIndex, commitIndex + 200);
  assert.ok(commitBody.includes("setSession(next)"));
  assert.ok(commitBody.includes("saveNewArcLiveSession(next)"));
});

test("return-to-task: reaching 'complete' automatically completes the session, clears it, and returns to the exact same task with autoStart -- ARCHI -- Unified 7-Part Update task, Part 5: the old manual 'להתחיל עכשיו' button is gone entirely, replaced by the single automatic completeConsumedRef effect", () => {
  assert.ok(!screen.includes("להתחיל עכשיו"), "the old manual Task-track menu button is gone -- completion is automatic now");
  const effectIndex = screen.indexOf("const completeConsumedRef = useRef(false);");
  const effectBody = screen.slice(effectIndex, effectIndex + 2400);
  assert.ok(effectBody.includes("returnToTask(autoStartAfter || session.arcPracticeDepth === \"short\");"));
  const returnToTaskIndex = screen.indexOf("async function returnToTask(autoStart: boolean)");
  // ARCHI -- Unified Final Specification task, section 6: widened from
  // 3100 to fit the two new selectedActionSource branches this
  // function grew. ARC Focus task: widened again (4700 -> 5300) to fit
  // the new arcFocusPracticeId branch. ARC Gym + ARC Goal Integration
  // task: widened again (5300 -> 6500) to fit the new
  // arcGymMemoryExerciseId branch, then again (6500 -> 7700) to fit
  // the combined Behaviour+Success scheduled-practice branching, then
  // again (7700 -> 8400) to fit the new arcPerspectiveId branch. ARC
  // Saving, Trigger Management & Quick-Action Buttons task: widened
  // again (8400 -> 10700) to fit the new
  // arcSavingBodyOptionId/arcSavingExerciseId/arcSavingTriggerIdForNewOption branch.
  const returnToTaskBody = screen.slice(returnToTaskIndex, returnToTaskIndex + 10700);
  assert.ok(returnToTaskBody.includes("clearNewArcLiveSession()"));
  // ARCHI -- ARC Result task, section 3: the final fallback destination
  // now goes through routeToTaskOrArcResultSuggestion (which itself
  // opens "/tasks/[id]" verbatim, with autoStart forwarded unchanged,
  // whenever no ARC Result is linked -- see live/arcResultSuggestion.test.ts
  // for that helper's own dedicated tests), rather than a bare
  // router.replace call here.
  assert.ok(returnToTaskBody.includes("await routeToTaskOrArcResultSuggestion(taskId, autoStart);"));
});

test("return-to-task: the old manual 'לחזור למשימה בלי טיימר' and 'להקטין את הצעד' buttons are both gone entirely -- superseded by the single automatic completion effect, which never auto-starts the timer unless autoStartAfter or short depth says so", () => {
  assert.ok(!screen.includes("לחזור למשימה בלי טיימר"));
  assert.ok(!screen.includes("להקטין את הצעד"));
});

test("ARC-system upgrade task, Part A (superseded by ARCHI -- Unified 7-Part Update task, Part 5): the 'transition' step/case is gone entirely -- Encoding now leads directly to automatic completion for every track, never through a manual menu", () => {
  assert.ok(!screen.includes('case "transition":'), "the dead transition render case is gone -- confirmed unreachable via isStepReachable's unconditional false for it");
});

test("ARC-system upgrade task, Part A/B.3 (UPDATED by the Unified ARC & Productivity Update task, requirement 4): the emotional action step offers presets + free text, and the insight step captures the trainee's own words -- the optional free-text belief field is gone entirely ('REMOVE ACTIVE BELIEF-BUILDING SCREENS'), never forcing the insight either", () => {
  const actionIndex = screen.indexOf('case "emotional_action":');
  // Nine Functional Improvements task, Improvement 3: this case now
  // renders the timer phase (subIndex 1) FIRST, then falls through to
  // the original subIndex-0 picker below it -- widened from the
  // original 700 chars to cover both.
  const actionBlock = screen.slice(actionIndex, actionIndex + 2700);
  assert.ok(actionBlock.includes("EMOTIONAL_ACTION_PRESETS.map"));
  assert.ok(actionBlock.includes("setEmotionalAction(session!"));

  const insightIndex = screen.indexOf('case "emotional_insight":');
  const nextCaseIndex = screen.indexOf('case "complete":', insightIndex);
  const insightBlock = screen.slice(insightIndex, nextCaseIndex);
  assert.ok(insightBlock.includes("מה התובנה שלמדת על עצמך?"));
  assert.ok(!insightBlock.includes('placeholder="אמונה מחזקת'), "the optional free-text belief field must be gone -- belief writing is removed from the active ARC flow");
  assert.ok(insightBlock.includes('setEmotionalInsight(session!, draftText, "", now)'), "the insight setter's belief argument is now always empty, never a trainee-authored string");
});

test("ARC-system upgrade task, Part E: reaching 'complete' persists the captured insight (and an optional learned belief) via the shared storage functions, then returns to the task -- never inventing either", () => {
  // Part 5 of the ARCHI Unified 7-Part Update moved this persistence
  // out of the "complete" render case's own button (removed entirely)
  // into the automatic completeConsumedRef effect, fired as soon as
  // the session reaches "complete" on its own.
  const effectIndex = screen.indexOf("const completeConsumedRef = useRef(false);");
  assert.ok(effectIndex !== -1);
  const completeBlock = screen.slice(effectIndex, effectIndex + 2400);
  assert.ok(completeBlock.includes("if (session.emotionalInsightText) {"));
  assert.ok(completeBlock.includes("appendArcInsight("));
  assert.ok(completeBlock.includes("if (session.emotionalBeliefText) {"));
  assert.ok(completeBlock.includes("upsertArcBelief(createLearnedBelief("));
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: ordinary full-depth completions keep autoStartAfter's exact
  // existing behavior unaffected -- short depth is ORed in alongside it.
  assert.ok(completeBlock.includes('returnToTask(autoStartAfter || session.arcPracticeDepth === "short");'));
});

test("no path out of the new ARC LIVE screen ever opens /build or the old /live /live/select chooser", () => {
  assert.ok(!screen.includes('"/build'));
  assert.ok(!screen.includes('"/live"'));
  assert.ok(!screen.includes('"/live/select"'));
});

test("the dwell timer only ever delays enabling Continue -- it never auto-advances the step on its own", () => {
  const dwellEffectIndex = screen.indexOf("const dwellSeconds = getStepContent(session).dwellSeconds;");
  const dwellEffectBody = screen.slice(dwellEffectIndex, dwellEffectIndex + 400);
  assert.ok(dwellEffectBody.includes("setCanContinue(true)"));
  assert.ok(!dwellEffectBody.includes("commit(") && !dwellEffectBody.includes("advance("), "the dwell timer effect must never itself advance the step");
});

// ARC session-resume conflict fix: the screen accepts a plannedArcId
// prop (alongside the existing taskId/startMode), and centralizes every
// resume-vs-conflict decision in its own reload() -- requirement 7
// ("consistent behavior... both pre-task ARC windows and existing ARC
// entry points") is satisfied structurally, since there is only ONE
// reload() and it is the only place that ever calls setConflict/setSession
// after loading. ArcWindowScreen.tsx and the mid-task mini=1/spontaneous=1
// route params both resolve to this same screen and prop, never a second
// competing resume check (see live/arcWindow.test.ts and
// live/miniArcEntry.test.ts for the entry-point side of this).

test("the screen accepts an optional plannedArcId prop, defaulting to null for every ad-hoc entry point (mid-task buttons, end-of-timer choice)", () => {
  assert.match(
    screen,
    /plannedArcId = null,\s*autoStartAfter = false,\s*arcGymSituationId = null,\s*arcFocusPracticeId = null,\s*arcGymMemoryExerciseId = null,\s*arcPerspectiveId = null,\s*arcSavingBodyOptionId = null,\s*arcSavingExerciseId = null,\s*arcSavingTriggerIdForNewOption = null,\s*morningFlowCheckIn = false,?\s*\}:\s*\{\s*taskId: string;\s*startMode\?: ArcInvocationMode;[\s\S]*?skipEmotionSelection\?: boolean;\s*plannedArcId\?: string \| null;\s*autoStartAfter\?: boolean;/
  );
});

// Alarm-timer integration task, requirement 4. Part 5 of the ARCHI
// Unified 7-Part Update replaced the old "transition" step's own
// autoStartAfterConsumedRef gate (transition is now permanently
// unreachable) with the completeConsumedRef effect, which fires once
// per session as soon as it reaches "complete" on its own and passes
// the real alarm's own autoStartAfter flag straight through to
// returnToTask, unmodified -- still false for every entry point
// except the real alarm's own "Start Task" action.
test("the screen accepts an optional autoStartAfter prop, defaulting to false for every entry point except the real alarm's own 'Start Task' action", () => {
  const fnIndex = screen.indexOf("const completeConsumedRef = useRef(false);");
  const fnBody = screen.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes('if (!session || session.currentStep !== "complete" || completeConsumedRef.current) return;'));
  assert.ok(fnBody.includes("completeConsumedRef.current = true;"));
  assert.match(screen, /autoStartAfter = false,/);
});

test("reload() resolves what's requested from plannedArcId (looking the draft up by id, never inventing one for a since-deleted draft) BEFORE comparing it against any existing unfinished session", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (9000 -> 10500) to fit the new arcSavingSnapshot resolution reload() grew.
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 10500);
  assert.ok(reloadBody.includes("const requestedItem = plannedArcId ? plannedArcsById.get(plannedArcId) ?? null : null;"));
  const requestedItemIndex = reloadBody.indexOf("const requestedItem");
  const existingUnfinishedIndex = reloadBody.indexOf("const existingUnfinished");
  assert.ok(requestedItemIndex !== -1 && existingUnfinishedIndex !== -1 && requestedItemIndex < existingUnfinishedIndex);
});

test("reload(): no existing unfinished session -- starts and persists a fresh one immediately, exactly as before this fix", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (9400 -> 10700) to fit the new arcSavingSnapshot resolution reload() grew.
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 10700);
  const branchIndex = reloadBody.indexOf("if (!existingUnfinished) {");
  const branchBody = reloadBody.slice(branchIndex, branchIndex + 200);
  assert.ok(branchBody.includes("setSession(fresh)"));
  assert.ok(branchBody.includes("saveNewArcLiveSession(fresh)"));
});

test("reload(): an existing unfinished session of the SAME type and configuration (sessionMatchesRequest) is resumed silently -- never overwritten, never surfaced as a conflict", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (9900 -> 12300) to fit the new arcSavingSnapshot resolution reload() grew.
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 12300);
  const branchIndex = reloadBody.indexOf("if (sessionMatchesRequest(existingUnfinished, request)) {");
  const branchBody = reloadBody.slice(branchIndex, branchIndex + 250);
  assert.ok(branchBody.includes("setSession(existingUnfinished)"));
  assert.ok(!branchBody.includes("saveNewArcLiveSession"), "resuming a matching session must never re-save/overwrite it");
});

test("reload(): an existing unfinished session of a DIFFERENT type/configuration sets conflict state instead of silently resuming or discarding it (requirements 3/4)", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (11200 -> 14300) to fit the new arcSavingSnapshot resolution reload() grew.
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 14300);
  assert.ok(reloadBody.includes("setConflict({"));
  const conflictBlockIndex = reloadBody.indexOf("setConflict({");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (750 -> 950) since the conflict block itself grew slightly.
  const conflictBlockBody = reloadBody.slice(conflictBlockIndex, conflictBlockIndex + 950);
  assert.ok(conflictBlockBody.includes("existing: existingUnfinished"));
  assert.ok(conflictBlockBody.includes("existingLabel:"));
  assert.ok(conflictBlockBody.includes("requestedLabel"));
  assert.ok(conflictBlockBody.includes("buildRequested: () => buildFresh(new Date().toISOString())"));
  // Setting conflict must never itself save/discard either session.
  assert.ok(!conflictBlockBody.includes("saveNewArcLiveSession") && !conflictBlockBody.includes("clearNewArcLiveSession"));
});

test("resumeExistingSession keeps the previously-persisted session exactly as-is -- it only updates local state, never re-saving or touching storage", () => {
  const fnIndex = screen.indexOf("function resumeExistingSession()");
  const fnBody = screen.slice(fnIndex, fnIndex + 150);
  assert.ok(fnBody.includes("setSession(conflict.existing)"));
  assert.ok(fnBody.includes("setConflict(null)"));
  assert.ok(!fnBody.includes("saveNewArcLiveSession") && !fnBody.includes("clearNewArcLiveSession"));
});

test("startRequestedSession builds and persists the newly-requested session, which (via the single-slot storage key) replaces the stale unfinished one -- never duplicating sessions", () => {
  const fnIndex = screen.indexOf("function startRequestedSession()");
  const fnBody = screen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("const fresh = conflict.buildRequested();"));
  assert.ok(fnBody.includes("setSession(fresh)"));
  assert.ok(fnBody.includes("saveNewArcLiveSession(fresh)"));
});

test("cancelConflict touches neither session (no save, no clear) and simply navigates back", () => {
  const fnIndex = screen.indexOf("function cancelConflict()");
  const fnBody = screen.slice(fnIndex, fnIndex + 250);
  assert.ok(fnBody.includes("setConflict(null)"));
  assert.ok(fnBody.includes("router.back()"));
  assert.ok(!fnBody.includes("saveNewArcLiveSession") && !fnBody.includes("clearNewArcLiveSession"));
});

test("the conflict prompt renders before the loading/session views, offering exactly the three required choices (resume previous / start selected / cancel) and showing both labels so the trainee can tell them apart", () => {
  const conflictRenderIndex = screen.indexOf("if (conflict) {");
  const loadingIndex = screen.indexOf("if (!session) {");
  assert.ok(conflictRenderIndex !== -1 && loadingIndex !== -1 && conflictRenderIndex < loadingIndex, "the conflict check must run before the generic loading view, or a conflict would never actually be shown");
  const conflictBody = screen.slice(conflictRenderIndex, loadingIndex);
  assert.ok(conflictBody.includes("conflict.existingLabel"));
  assert.ok(conflictBody.includes("conflict.requestedLabel"));
  assert.ok(conflictBody.includes("onPress={resumeExistingSession}"));
  assert.ok(conflictBody.includes("onPress={startRequestedSession}"));
  assert.ok(conflictBody.includes("onPress={cancelConflict}"));
});

// Android build readiness task, Phase 1: before replacing an unfinished
// session, the trainee must see an explicit, unambiguous warning that
// its progress will be lost -- never just two neutral labels and a
// button. Starting the new ARC is the explicit confirmation itself
// (requirement 3); nothing before this screen replaces anything
// (requirement 4: Cancel -- covered by the test above -- preserves the
// existing session untouched).
test("the conflict prompt explicitly warns that the open session's unsaved progress will be lost before any replacing action is available", () => {
  const conflictRenderIndex = screen.indexOf("if (conflict) {");
  const loadingIndex = screen.indexOf("if (!session) {");
  const conflictBody = screen.slice(conflictRenderIndex, loadingIndex);
  const warningIndex = conflictBody.indexOf("styles.warningText");
  const startButtonIndex = conflictBody.indexOf("onPress={startRequestedSession}");
  assert.ok(warningIndex !== -1 && startButtonIndex !== -1 && warningIndex < startButtonIndex, "the warning must appear before the replacing action, not after");
  assert.ok(conflictBody.includes("תימחק"), "the warning text must explicitly say the previous progress will be deleted/lost");
});

// Urge-stop task.

// ARCHI -- Universal ARC Routing, Emotion Identification & Android
// Shortcuts task, requirement 6: urge is no longer captured on the
// 'emotion' screen at all -- it has its own dedicated 'urge' step now,
// reachable only via the shared cognitive selector, asked and accepted
// BEFORE emotion is even named.
test("requirement 6: the 'emotion' step's own emotion-picking calls carry only the emotion itself -- no urge field, no urgeDraft, anywhere in this case", () => {
  const stepIndex = screen.indexOf('case "emotion":');
  const nextCaseIndex = screen.indexOf('case "thought":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  // ARCHI -- Combined Emotion & Supportive Feeling Selection task:
  // picking an emotion no longer advances (setEmotionSelection, not
  // setEmotion) -- see the combined-screen test below for the
  // supportive-feeling picker/Continue button this enables.
  assert.ok(stepBody.includes("setEmotionSelection(session!, option, null)"));
  assert.ok(stepBody.includes('setEmotionSelection(session!, "other", customEmotionDraft)'));
  assert.ok(!stepBody.includes("urgeDraft"), "urge must never be captured on the emotion screen any more");
});

// ARCHI -- Combined Emotion & Supportive Feeling Selection task, Part
// 1 ("FULL ARC -- COMBINE EMOTION AND SUPPORTIVE FEELING"): once an
// emotion is chosen, the SAME screen also shows the inline supportive-
// feeling picker and a single, explicit "Continue" (advance) action --
// never a second, separate screen.
test("Combined Emotion & Supportive Feeling Selection task: the 'emotion' step shows the supportive-feeling picker and an explicit Continue once an emotion is selected, and the original 'continue without emotion' skip stays untouched", () => {
  const stepIndex = screen.indexOf('case "emotion":');
  const nextCaseIndex = screen.indexOf('case "thought":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("session!.selectedEmotion !== null &&"));
  assert.ok(stepBody.includes("renderSupportiveFeelingPicker("));
  assert.ok(stepBody.includes("resolveFinalSupportiveFeeling(session!)"));
  assert.ok(stepBody.includes("commit(advance(session!, now))"));
  assert.ok(stepBody.includes("setEmotion(session!, null, null, now)"), "the pre-existing 'המשך בלי רגש' skip action must still commit+advance in one tap, unchanged");
});

test("requirement 6: the dedicated 'urge' step captures urgeText via setUrgeText, with its own always-enabled continue", () => {
  const stepIndex = screen.indexOf('case "urge":');
  const nextCaseIndex = screen.indexOf('case "stop_and_accept_urge":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("setUrgeText(session!, urgeDraft, now)"));
  assert.ok(stepBody.includes("דחף"));
});

test("Unified ARC & Productivity Update task, requirement 6: the 'mini_awareness' step's own setMiniAwareness call no longer carries an urge field at all -- 'Urge' is now one of the three choices on the dedicated 'mini_thought' chooser right after this screen, never captured here too", () => {
  const stepIndex = screen.indexOf('case "mini_awareness":');
  const nextCaseIndex = screen.indexOf('case "mini_thought":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  // ARCHI -- Combined Emotion & Supportive Feeling Selection task,
  // Part 2: setMiniAwareness now also carries the trainee's own
  // optional supportive-feeling override, committed atomically.
  assert.ok(stepBody.includes("setMiniAwareness("));
  assert.ok(stepBody.includes("miniSelectedEmotion,"));
  assert.ok(stepBody.includes("miniDesiredEndingDraft,"));
  assert.ok(stepBody.includes("miniSupportiveFeelingOverride,"));
  assert.ok(!stepBody.includes("miniThoughtDraft"));
  assert.ok(!stepBody.includes("urgeDraft"), "the urge field is gone from this screen entirely");
});

test("Combined Emotion & Supportive Feeling Selection task: 'mini_awareness' shows the SAME inline supportive-feeling picker, computed from the local miniSelectedEmotion draft (nothing committed to the session until Continue)", () => {
  const stepIndex = screen.indexOf('case "mini_awareness":');
  const nextCaseIndex = screen.indexOf('case "mini_thought":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("miniSelectedEmotion !== null &&"));
  assert.ok(stepBody.includes("renderSupportiveFeelingPicker("));
  assert.ok(stepBody.includes("miniSupportiveFeelingOverride ?? resolveSupportiveFeeling(miniSelectedEmotion, null)"));
});

test("requirement 6/section 5: a run started from a saved PlannedArc prefills the urge draft from session.urgeText on every step entry -- still re-editable, never silently skipped", () => {
  const fnIndex = screen.indexOf('setUrgeDraft(session?.urgeText ?? "");');
  assert.ok(fnIndex !== -1);
});

test("skipping the emotion step (advanceWithSkip) discards any custom-emotion draft, and the dedicated urge step's own skip discards the urge text -- 'skip' means discard this step's own data entry entirely", () => {
  const fnIndex = screen.indexOf("function advanceWithSkip");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  const emotionCaseIndex = fnBody.indexOf('case "emotion":');
  const urgeCaseIndex = fnBody.indexOf('case "urge":');
  const thoughtCaseIndex = fnBody.indexOf('case "thought":');
  const emotionCaseBody = fnBody.slice(emotionCaseIndex, urgeCaseIndex);
  const urgeCaseBody = fnBody.slice(urgeCaseIndex, thoughtCaseIndex);
  assert.ok(emotionCaseBody.includes("setEmotion(state, null, null, now)"));
  assert.ok(urgeCaseBody.includes('setUrgeText(state, "", now)'));
});

// Three-levels-of-acceptance task.

test("the 'reality_acceptance' step's own subIndex-0 branch offers the three time-classification options via getThoughtTimeOrientationOptions, each committing setThoughtTimeOrientation", () => {
  const stepIndex = screen.indexOf('case "reality_acceptance":');
  const nextCaseIndex = screen.indexOf('case "natural_breathing":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("session!.subIndex === 0"));
  assert.ok(stepBody.includes("getThoughtTimeOrientationOptions()"));
  assert.ok(stepBody.includes("setThoughtTimeOrientation(session!, option.value, now)"));
  assert.ok(stepBody.includes("commit(advance(session!, now))"), "subIndex 1 falls back to the standard dwell-gated continue button");
});

// Unified ARC & Productivity Update task, requirement 7: once an
// orientation is chosen, the chips are replaced by the Presence
// circle (point + ONE expanding circle + the exact mantra, body
// hidden per requirement 8) -- the circle's own tap-to-advance
// replaces the old separate disabled/enabled continue button entirely.
test("the 'mini_reality_acceptance' step is a single combined screen: chips react immediately (no advance) while no orientation is chosen yet, then the Presence circle itself becomes the continue once one is", () => {
  const stepIndex = screen.indexOf('case "mini_reality_acceptance":');
  const nextCaseIndex = screen.indexOf('case "mini_stop_accept_urge":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("session!.currentThought && !session!.thoughtTimeOrientation"));
  assert.ok(stepBody.includes("getThoughtTimeOrientationOptions()"));
  assert.ok(stepBody.includes("commit({ ...session!, thoughtTimeOrientation: option.value })"), "a chip tap must not itself advance -- the mantra must resolve on the SAME screen first");
  assert.ok(stepBody.includes('stage={session!.currentThought ? "thought_acceptance" : "interpretation_acceptance"}'), "the circle's own stage must pick the correct one of the two mantras depending on whether a thought or only an interpretation is present");
  assert.ok(stepBody.includes("mantra={content.primary}"));
  assert.ok(stepBody.includes("onAdvance={() => commit(advance(session!, now))}"));
});

test("the 'thought' step's own draft is prefilled from the session's existing currentThought (e.g. carried over from a planned ARC), still re-editable, never silently discarded", () => {
  const fnIndex = screen.indexOf('setDraftText(session?.currentStep === "thought"');
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes('session?.currentThought ?? ""'));
});

// ARCHI -- Universal ARC Routing, Emotion Identification & Android
// Shortcuts task, requirement 2/3B: Mini ARC's own 'mini_thought' is
// now the SAME shared cognitive-selector semantics as Full ARC's
// 'cognitive_selector' -- three INDEPENDENT checkboxes with their own
// three independent text drafts, all seeded from whatever the session
// already has (never forced to start unchecked when a draft already
// provides a value), replacing the old single-category chooser.
test("requirement 2/3B: the Mini ARC cognitive-selector checkboxes and their three independent text drafts are all seeded from the session's own existing fields on every step entry", () => {
  const fnIndex = screen.indexOf("setCogSelectThought(!!session?.selectedCognitiveThought);");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("setMiniCogThought(!!session?.selectedCognitiveThought);"));
  assert.ok(fnBody.includes("setMiniCogInterpretation(!!session?.selectedCognitiveInterpretation);"));
  assert.ok(fnBody.includes("setMiniCogUrge(!!session?.selectedCognitiveUrge);"));
  assert.ok(fnBody.includes('setMiniThoughtDraft(session?.currentThought ?? "");'));
  assert.ok(fnBody.includes('setMiniInterpretationDraft(session?.interpretationText ?? "");'));
  assert.ok(fnBody.includes('setMiniUrgeDraft(session?.urgeText ?? "");'));
});

// --- Unified awareness/urge/thought/interpretation update -----------------

// Requirement 6: 'thought' now captures ONLY the thought (interpretation moved to its own dedicated step).
test("requirement 6: the 'thought' step's own continue button is ALWAYS enabled, and it no longer carries an interpretation field at all", () => {
  const stepIndex = screen.indexOf('case "thought":');
  const nextCaseIndex = screen.indexOf('case "reality_acceptance":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("setThought(session!, draftText, now)"));
  assert.ok(!stepBody.includes("disabled="), "continuing must never be blocked just because the thought field is blank");
  assert.ok(!stepBody.includes("interpretationDraft"), "interpretation must never be captured on the thought screen any more");
});

test("requirement 6: the dedicated 'interpretation' step captures interpretationText via setInterpretation, with its own always-enabled continue", () => {
  const stepIndex = screen.indexOf('case "interpretation":');
  const nextCaseIndex = screen.indexOf('case "interpretation_acceptance":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("setInterpretation(session!, interpretationDraft, now)"));
  assert.ok(!stepBody.includes("disabled="));
});

test("requirement 6: the 'emotion' step offers a plain, always-enabled continue for when no emotion is chosen at all -- carrying only null/null, no urge field any more", () => {
  const stepIndex = screen.indexOf('case "emotion":');
  const nextCaseIndex = screen.indexOf('case "thought":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("setEmotion(session!, null, null, now)"));
});

// Requirement 2/3B: Mini ARC's own upgraded cognitive selector -- three
// independent checkboxes, each with its own optional text field, all
// captured on this one combined screen via setMiniCognitiveSelection.
test("requirement 2/3B: the 'mini_thought' step is a three-INDEPENDENT-checkbox cognitive selector (never 'at most one' any more), committing via setMiniCognitiveSelection with all three selections and their own texts at once", () => {
  const stepIndex = screen.indexOf('case "mini_thought": {');
  const nextCaseIndex = screen.indexOf('case "mini_reality_acceptance":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("miniCogThought"));
  assert.ok(stepBody.includes("miniCogInterpretation"));
  assert.ok(stepBody.includes("miniCogUrge"));
  assert.ok(stepBody.includes("miniThoughtDraft"));
  assert.ok(stepBody.includes("miniInterpretationDraft"));
  assert.ok(stepBody.includes("miniUrgeDraft"));
  assert.ok(stepBody.includes("setMiniCognitiveSelection("));
  assert.ok(stepBody.includes('{ thought: miniCogThought, interpretation: miniCogInterpretation, urge: miniCogUrge }'));
});

test("test 3: the 'reality_acceptance' step never shows the time-classification chips except on its own subIndex 0 -- it is now ALWAYS reached with a real thought (the old '&& session!.currentThought' mode-A guard is gone, since mode A lives on interpretation_acceptance now)", () => {
  const stepIndex = screen.indexOf('case "reality_acceptance":');
  const nextCaseIndex = screen.indexOf('case "interpretation":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes('session!.subIndex === 0'));
  assert.ok(!stepBody.includes('session!.subIndex === 0 && session!.currentThought'), "the old mode-A guard clause must be gone -- reality_acceptance is unconditionally reached with a thought now");
});

test("the dedicated 'interpretation_acceptance' step always renders the Presence circle directly -- no chip/ask sub-screen of its own (an interpretation has no time orientation to classify)", () => {
  const stepIndex = screen.indexOf('case "interpretation_acceptance":');
  const nextCaseIndex = screen.indexOf('case "focus_color":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes('stage="interpretation_acceptance"'));
  assert.ok(stepBody.includes("mantra={content.primary}"));
  assert.ok(stepBody.includes("onAdvance={() => commit(advance(session!, now))}"));
});

test("test 3: the 'mini_reality_acceptance' step never shows the time-classification chips when there is no thought (mode A) -- it falls straight to the Presence circle with the fixed interpretation mantra", () => {
  const stepIndex = screen.indexOf('case "mini_reality_acceptance":');
  const nextCaseIndex = screen.indexOf('case "mini_stop_accept_urge":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("if (session!.currentThought && !session!.thoughtTimeOrientation)"));
});

// --- Body region selection correction task: negative side is multi-select,
// positive side is back to single-select -- see this task's own final report ---

test("supportive_area_select suggests regions via resolveSuggestedSupportiveAreas (keyed by the already-chosen desired feeling), and tapping a chip COMMITS it immediately via the single-pick setSupportiveArea -- never a multi-select toggle", () => {
  const stepIndex = screen.indexOf('case "supportive_area_select":');
  const nextCaseIndex = screen.indexOf('case "supportive_sensation_select":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("resolveSuggestedSupportiveAreas(session!.desiredEnding)"));
  assert.ok(stepBody.includes("commit(setSupportiveArea(session!, region, now))"));
  assert.ok(!stepBody.includes("toggleSupportiveArea("), "the multi-select toggle must no longer be the one this screen calls");
  assert.ok(!stepBody.includes("confirmSupportiveAreas("), "the multi-select confirm must no longer be called here either");
});

test("supportive_area_select's 'continue without choosing' button is unconditionally rendered and never requires a selection", () => {
  const stepIndex = screen.indexOf('case "supportive_area_select":');
  const nextCaseIndex = screen.indexOf('case "supportive_sensation_select":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("commit(advance(session!, now))"));
  assert.ok(!stepBody.includes("disabled="), "no part of this screen may be disabled -- picking a region advances immediately, and not picking one is also always valid");
});

test("supportive_area_select stays a single-select field (supportiveBodyArea), and lets a chosen chip visibly reflect its selected state", () => {
  const stepIndex = screen.indexOf('case "supportive_area_select":');
  const nextCaseIndex = screen.indexOf('case "supportive_sensation_select":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("session!.supportiveBodyArea === region && styles.chipSelected"));
  assert.ok(stepBody.includes("session!.supportiveBodyArea === region && styles.chipTextSelected"));
  assert.ok(!stepBody.includes("supportiveBodyAreas.includes"), "the legacy multi-select array must never drive this screen's own chip-selected styling");
});

test("supportive_movement_select pools suggestions for the SINGLE primary supportive area only (wrapped in a one-element array), and its continue button is also unconditionally rendered", () => {
  const stepIndex = screen.indexOf('case "supportive_movement_select":');
  const stepBody = screen.slice(stepIndex, stepIndex + 1900);
  assert.ok(stepBody.includes("resolveSupportiveMovementSuggestionsForAreas(session!.supportiveBodyArea ? [session!.supportiveBodyArea] : [], showMoreMovements ? 20 : 3)"));
  assert.ok(stepBody.includes("commit(setPositiveMovement(session!, draftText, now))"));
  assert.ok(!stepBody.includes("{!!draftText.trim() &&"), "continuing with no movement chosen must be a valid, always-available outcome");
});

// --- unpleasant_area_select screen's own negative-emotion suggestion wiring,
// now MULTI-select ------------------------------------------------------------

test("unpleasant_area_select suggests regions via resolveSuggestedUnpleasantAreas (keyed by the already-selected negative emotion), and toggling a chip NEVER auto-advances -- multi-select needs the explicit continue button, with its own reveal-all toggle separate from the supportive side's showMoreAreas", () => {
  const stepIndex = screen.indexOf('case "unpleasant_area_select":');
  const nextCaseIndex = screen.indexOf('case "supportive_area_select":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("resolveSuggestedUnpleasantAreas(resolveSelectedEmotionText(session!))"));
  assert.ok(stepBody.includes("showMoreUnpleasantAreas ? BODY_REGIONS : suggestedUnpleasant"));
  assert.ok(stepBody.includes("commit(toggleUnpleasantArea(session!, region))"));
  assert.ok(!stepBody.includes("showMoreAreas ?"), "this screen's own reveal-all toggle must never be the supportive side's shared showMoreAreas state");
});

test("unpleasant_area_select is a multi-select field (unpleasantBodyAreas), lets every chosen chip visibly reflect its selected state, and carries both the custom-region label and the separate sensation-description text through on continue", () => {
  const stepIndex = screen.indexOf('case "unpleasant_area_select":');
  const nextCaseIndex = screen.indexOf('case "supportive_area_select":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("session!.unpleasantBodyAreas.includes(region) && styles.chipSelected"));
  assert.ok(stepBody.includes("session!.unpleasantBodyAreas.includes(region) && styles.chipTextSelected"));
  assert.ok(stepBody.includes("commit(confirmUnpleasantAreas(session!, draftText, unpleasantSensationDraft, now))"));
});

test("unpleasant_area_select's continue button is unconditionally rendered -- 'continue without choosing' (the option to skip) is valid here too, same as declining entirely at unpleasant_area_question", () => {
  const stepIndex = screen.indexOf('case "unpleasant_area_select":');
  const nextCaseIndex = screen.indexOf('case "supportive_area_select":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(!stepBody.includes("disabled="), "no selection may be required to continue from this screen");
});

// --- ARC Full Sequence Update task, Part 1 steps 4-5 (Choose/Locate the Desired Feeling) ---

test("desired_feeling_select renders every DESIRED_FEELING_OPTIONS preset as its own chip (each committing and advancing immediately) plus a free-text field, and is wired into the shared skip link via isStepSkippable", () => {
  const stepIndex = screen.indexOf('case "desired_feeling_select":');
  const nextCaseIndex = screen.indexOf('case "desired_feeling_locate":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("DESIRED_FEELING_OPTIONS.map("));
  assert.ok(stepBody.includes("commit(setDesiredFeeling(session!, feeling, now))"));
  assert.ok(stepBody.includes("commit(setDesiredFeeling(session!, draftText, now))"));

  // isStepSkippable itself lives in arc/newArcLiveSteps.ts, not this screen --
  // the screen only ever renders the shared "דלג" link when it returns true.
  const stepsModule = readSource("arc/newArcLiveSteps.ts");
  assert.ok(stepsModule.includes('step === "emotion" ||') && stepsModule.includes('step === "desired_feeling_select" ||') && stepsModule.includes('step === "mini_thought"'));
  assert.ok(stepsModule.includes('step === "urge" ||') && stepsModule.includes('step === "thought" ||') && stepsModule.includes('step === "interpretation" ||'), "requirement 6: the three new cognitive capture screens must also be skippable, same optional-field convention as emotion/thought always had");
});

test("desired_feeling_locate renders a multi-select body-region list (toggle-then-confirm, same convention as unpleasant_area_select), plus a dedicated, explicit 'אני עדיין לא מרגיש את התחושה הזאת' option -- never inferred from an empty selection", () => {
  const stepIndex = screen.indexOf('case "desired_feeling_locate":');
  const nextCaseIndex = screen.indexOf('case "unpleasant_area_question":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("session!.desiredFeelingBodyAreas.includes(region) && styles.chipSelected"));
  assert.ok(stepBody.includes("commit(toggleDesiredFeelingBodyArea(session!, region))"));
  assert.ok(stepBody.includes("commit(confirmDesiredFeelingLocation(session!, draftText, now))"));
  assert.ok(stepBody.includes("commit(declineDesiredFeelingPresence(session!, now))"));
  assert.ok(stepBody.includes("אני עדיין לא מרגיש את התחושה הזאת"));
  assert.ok(!stepBody.includes("disabled="), "no selection may be required to continue from this screen either");
});

test("advanceWithSkip('desired_feeling_select') discards any typed feeling and advances, consistent with every other skippable step's own 'skip means discard this step's data entry' convention", () => {
  const fnIndex = screen.indexOf("function advanceWithSkip");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n}", fnIndex));
  assert.match(fnBody, /case "desired_feeling_select":\s*\n\s*return setDesiredFeeling\(state, "", now\);/);
});

// --- Nine Functional Improvements task, Improvement 3 ("Internal
// Action" timer -- the emotional_action step's own meditation/tai-chi/
// relaxation/breathing choice) ---

test("checkpoint (configurable timer, reusing Task LIVE's pure math): a dedicated, SEPARATE persisted timer run is used -- arc/taskTimer.ts's own createTaskTimerRun/getTaskTimerStatus/pauseTaskTimerRun/resumeTaskTimerRun, never a second math implementation, loaded/saved/cleared through its OWN storage key (never TASK_TIMER_RUN_KEY, so it can never collide with a real Task's own in-flight timer)", () => {
  assert.match(
    screen,
    /import \{ createTaskTimerRun, generateTaskTimerRunId, getTaskTimerStatus, pauseTaskTimerRun, resumeTaskTimerRun \} from "\.\.\/arc\/taskTimer\.ts";/
  );
  assert.ok(screen.includes("loadInternalActionTimerRun"));
  assert.ok(screen.includes("saveInternalActionTimerRun"));
  assert.ok(screen.includes("clearInternalActionTimerRun"));
  const keyIndex = storage.indexOf("const INTERNAL_ACTION_TIMER_RUN_KEY = ");
  assert.ok(keyIndex >= 0, "the internal-action timer must have its own, separate storage key");
  const taskTimerKeyIndex = storage.indexOf("const TASK_TIMER_RUN_KEY = ");
  assert.notEqual(storage.slice(keyIndex, keyIndex + 60), storage.slice(taskTimerKeyIndex, taskTimerKeyIndex + 60));
});

test("checkpoint (Start/Pause/Resume/Finish): handleStartInternalActionTimer creates a fresh run from the configurable duration draft; handlePause/handleResumeInternalActionTimer reuse the pure pause/resume functions; handleFinishInternalActionTimer clears the run and advances the session (never gated on the timer actually reaching zero -- an early finish is always allowed, same as every other timed activity)", () => {
  const startIndex = screen.indexOf("async function handleStartInternalActionTimer()");
  const startBody = screen.slice(startIndex, startIndex + 500);
  assert.ok(startBody.includes("createTaskTimerRun(taskId, generateTaskTimerRunId(), durationMinutes, new Date().toISOString())"));
  assert.ok(startBody.includes("await saveInternalActionTimerRun(run);"));

  const pauseIndex = screen.indexOf("async function handlePauseInternalActionTimer()");
  assert.ok(screen.slice(pauseIndex, pauseIndex + 300).includes("pauseTaskTimerRun(internalActionRun"));

  const resumeIndex = screen.indexOf("async function handleResumeInternalActionTimer()");
  assert.ok(screen.slice(resumeIndex, resumeIndex + 300).includes("resumeTaskTimerRun(internalActionRun"));

  const finishIndex = screen.indexOf("async function handleFinishInternalActionTimer()");
  const finishBody = screen.slice(finishIndex, finishIndex + 400);
  assert.ok(finishBody.includes("await clearInternalActionTimerRun();"));
  assert.ok(finishBody.includes("commit(advance(session, new Date().toISOString()));"));
});

test("checkpoint (persists across interruptions): the run is loaded from its own persisted slot inside reload()'s Promise.all, so it survives backgrounding/app restart exactly like the ARC LIVE session itself", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback(");
  // ARC Saving, Trigger Management & Quick-Action Buttons task: widened
  // (1200 -> 1400) to fit the new arcSavingSnapshot resolution reload() grew.
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 1400);
  assert.ok(reloadBody.includes("loadInternalActionTimerRun()"));
  assert.ok(reloadBody.includes("setInternalActionRun(internalActionRun)"));
});

test("checkpoint (never a separate 'internal action' concept, never duplicate timer sessions): the SAME existing emotional_action step/EMOTIONAL_ACTION_PRESETS picker is reused unchanged at subIndex 0; the timer phase is a NEW subIndex 1 of that same step (stepSubCount's own new case), and the Start button for a fresh timer is only ever rendered when no run already exists yet (internalActionRun === null) -- so re-entering the step while a run is in flight resumes it instead of starting a second one", () => {
  const stepIndex = screen.indexOf('case "emotional_action":');
  const nextCaseIndex = screen.indexOf('case "emotional_insight":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes('session!.subIndex === 1'));
  assert.ok(stepBody.includes("!internalActionRun ? ("), "the Start button/duration field must only render while no run exists yet");
  assert.ok(stepBody.includes("handleStartInternalActionTimer"));
  assert.ok(stepBody.includes("handlePauseInternalActionTimer"));
  assert.ok(stepBody.includes("handleResumeInternalActionTimer"));
  assert.ok(stepBody.includes("handleFinishInternalActionTimer"));
  assert.ok(stepBody.includes("EMOTIONAL_ACTION_PRESETS.map"), "the original action-picker (subIndex 0) must remain completely unchanged");
});

test("checkpoint (going back discards the abandoned action's own timer): the shared 'חזרה' button clears the persisted internal-action run before calling goBack whenever it is leaving emotional_action's own subIndex 1", () => {
  const backIndex = screen.indexOf('onPress={() => {\n                  // Nine Functional Improvements task, Improvement 3:');
  assert.ok(backIndex >= 0);
  const backBody = screen.slice(backIndex, backIndex + 700);
  assert.ok(backBody.includes('session!.currentStep === "emotional_action" && session!.subIndex === 1'));
  assert.ok(backBody.includes("clearInternalActionTimerRun();"));
  assert.ok(backBody.includes("setInternalActionRun(null);"));
  assert.ok(backBody.includes("commit(goBack(session, now));"));
});

test("checkpoint (never leaks a stale run into an unrelated new session): both places a genuinely FRESH session is created/substituted (reload()'s own no-existing-unfinished branch, and the conflict dialog's startRequestedSession) also clear the internal-action run -- a brand-new session starts at goal_select and can never legitimately own one yet", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback(");
  const freshBranchIndex = screen.indexOf("if (!existingUnfinished) {", reloadIndex);
  const freshBranchBody = screen.slice(freshBranchIndex, freshBranchIndex + 900);
  assert.ok(freshBranchBody.includes("clearInternalActionTimerRun();"));
  assert.ok(freshBranchBody.includes("setInternalActionRun(null);"));

  const startRequestedIndex = screen.indexOf("function startRequestedSession()");
  const startRequestedBody = screen.slice(startRequestedIndex, startRequestedIndex + 600);
  assert.ok(startRequestedBody.includes("clearInternalActionTimerRun();"));
  assert.ok(startRequestedBody.includes("setInternalActionRun(null);"));
});

test("checkpoint (ticking display): the remaining time only re-renders once a second while a run exists and is NOT paused -- never while paused (a paused display must stay frozen)", () => {
  const tickEffectIndex = screen.indexOf("setInternalActionTickNow(Date.now())");
  const effectIndex = screen.lastIndexOf("useEffect(", tickEffectIndex);
  const effectBody = screen.slice(effectIndex, tickEffectIndex + 100);
  assert.ok(effectBody.includes("if (!internalActionRun || internalActionRun.pausedAt) return;"));
});

// --- Unified ARC Architecture and Interactive Animation Update, Phase 1 ("Continuous Animated Presence") ---

// Fix All Confirmed ARC Android Bugs task, requirement 2 ("Presence
// Mantras Inside the Circle"): the old standalone, outer full-mode
// PresenceAnimation gate for visual_field/sound_awareness/body_scan is
// gone entirely -- those three steps (plus natural_breathing and
// center_attention) now render through ArcBodyMantraCircle, which
// carries its OWN internal "subtle"-mode PresenceAnimation, never a
// second, separate top-level instance here.
test("there is no second, standalone top-level PresenceAnimation gate any more -- visual_field/sound_awareness/body_scan render entirely through ArcBodyMantraCircle (which owns its own internal Presence animation)", () => {
  assert.ok(!screen.includes("PresenceAnimation"), "PresenceAnimation must no longer be imported or referenced directly in NewArcLiveScreen.tsx -- only ArcBodyMantraCircle renders it now");
  assert.ok(!screen.includes('mode="full"'), "the old full-mode Presence animation usage is gone");
});

// --- ARCHI -- Fix Mini ARC Interactive Body Selection and Three-Tap Color Model ---

function miniAcceptanceTransitionCaseBody(): string {
  const caseIndex = screen.indexOf('case "mini_acceptance_transition":');
  const nextCaseIndex = screen.indexOf('case "mini_encoding"', caseIndex);
  return screen.slice(caseIndex, nextCaseIndex);
}

test("1. Mini ARC's body silhouette is genuinely interactive -- onToggle drives attemptCycleMiniBodyScanRegion/commit, never the old no-op", () => {
  const caseBody = miniAcceptanceTransitionCaseBody();
  assert.ok(!caseBody.includes("onToggle={() => {}}"), "the old read-only no-op onToggle must be gone");
  assert.match(caseBody, /onToggle=\{\(region, side\) => \{\s*\n\s*const next = attemptCycleMiniBodyScanRegion\(session!, region, side\);\s*\n\s*if \(next\) commit\(next\);/, "tapping a region must actually call the real tap-cycle setter and commit the result");
});

test("1b. Once a region is promoted past its first (red) tap, its opening color (Light Green/Dark Blue) takes priority over the plain contraction-red fill -- the opening role is checked FIRST", () => {
  const caseBody = miniAcceptanceTransitionCaseBody();
  const resolveColorIndex = caseBody.indexOf("resolveSelectedColorForRegion={(region, side) => {");
  const resolveColorBody = caseBody.slice(resolveColorIndex, resolveColorIndex + 400);
  assert.match(resolveColorBody, /const openingColor = resolveOpeningRegionSelectedColor\(session!, region, side\);\s*\n\s*if \(openingColor\) return openingColor;/, "the opening role's own color must be checked and returned before falling back to the plain contraction-red check");
});

test("10. The full Mini ARC legend shows all three color explanations, each with its own tap count, as plain wrapping text -- never the old 2-item shared horizontal row, never a horizontally-scrolling container", () => {
  const caseBody = miniAcceptanceTransitionCaseBody();
  assert.ok(caseBody.includes("🔴 1 לחיצה — אזור מכווץ"), "the Red explanation, with its tap count, must be fully present");
  assert.ok(caseBody.includes("🟢 2 לחיצות — אזור מכווץ וסגור / לא יציב"), "the Light Green explanation, with its tap count, must be fully present");
  assert.ok(caseBody.includes("🔵 3 לחיצות — אזור סגור / לא יציב ותומך"), "the Dark Blue explanation, with its tap count, must be fully present");
  assert.ok(!caseBody.includes("styles.openingRoleLegendRow"), "Mini ARC's own legend no longer reuses the old 2-item shared horizontal row style (Full/Shortened ARC's own renderOpeningRoleLegend() elsewhere is untouched and keeps using it)");
  assert.ok(!screen.includes("ScrollView horizontal"), "no horizontally-scrolling legend container exists anywhere in this screen");
});

test("11. The separate anatomical-name body-region chip buttons are removed from Mini ARC's own body-selection screen -- regions are selected directly on the body illustration instead -- while the SAME BodyRegion chip picker is completely untouched on Full ARC's own, unrelated supportive_area_select screen", () => {
  const caseBody = miniAcceptanceTransitionCaseBody();
  assert.ok(!caseBody.includes("BODY_REGIONS.map"), "no anatomical-name chip row inside Mini ARC's own body-selection screen any more");
  assert.ok(!caseBody.includes("miniArea"), "the removed chip picker's own scratch state must not be referenced here either");

  const supportiveAreaCaseIndex = screen.indexOf('case "supportive_area_select":');
  const supportiveAreaCaseEnd = screen.indexOf('case "supportive_sensation_select"', supportiveAreaCaseIndex);
  const supportiveAreaBody = screen.slice(supportiveAreaCaseIndex, supportiveAreaCaseEnd);
  assert.ok(supportiveAreaBody.includes("BODY_REGIONS"), "Full ARC's own, completely separate supportive_area_select screen must keep its existing chip picker -- this task only removes Mini ARC's own duplicate button list");
});

test("every BODY_REGIONS-based chip picker left in the file belongs to a Full-ARC-only screen, never Mini ARC's own mini_acceptance_transition", () => {
  assert.equal(miniAcceptanceTransitionCaseBody().includes("BODY_REGIONS"), false);
});

test("natural_breathing, center_attention, visual_field, sound_awareness, and body_scan are all classified as body-mantra stages (isBodyMantraStage) and each render through ArcBodyMantraCircle, exactly like dwelling/acceptance/regulation/encoding", () => {
  const isBodyMantraStageIndex = screen.indexOf("const isBodyMantraStage =");
  const isBodyMantraStageBlock = screen.slice(isBodyMantraStageIndex, isBodyMantraStageIndex + 1400);
  for (const step of ["natural_breathing", "center_attention", "visual_field", "sound_awareness", "body_scan", "dwelling", "acceptance", "regulation", "encoding"]) {
    assert.ok(isBodyMantraStageBlock.includes(`session.currentStep === "${step}"`), `isBodyMantraStage must include "${step}"`);
  }
  // "focus_color" is deliberately excluded -- it keeps its own real color-selection UI, never mantra-ified.
  assert.ok(!isBodyMantraStageBlock.includes('"focus_color"'), "focus_color must stay its own selection screen, never classified as a mantra stage");

  for (const step of ["natural_breathing", "center_attention", "visual_field", "sound_awareness"]) {
    assert.ok(screen.includes(`case "${step}":`), `a dedicated render case for "${step}" must exist`);
  }
  assert.match(screen, /case "body_scan":\s*\n\s*return \(\s*\n\s*<ArcBodyMantraCircle/);
});
