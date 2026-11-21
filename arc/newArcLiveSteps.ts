/**
 * arc/newArcLiveSteps.ts
 *
 * Simplified-architecture task, Phase 2: the typed deterministic state
 * machine for the new ARC LIVE flow -- "do not put routing logic
 * directly inside React rendering." live/NewArcLiveScreen.tsx only
 * ever calls the pure functions below and renders whatever
 * arc/newArcLiveCopy.ts's getStepContent decides for the CURRENT
 * (step, subIndex) pair; it never itself decides what comes next.
 *
 * ORDER is the fixed top-level sequence. Several steps are conditionally
 * skipped, all decided by data already in the session state (never a
 * separate "did I skip this" flag competing with the real field):
 * - "stop_and_accept_urge"/"mini_stop_accept_urge" are skipped when
 *   `urgeText` is blank.
 * - "reality_acceptance"/"mini_reality_acceptance" are skipped when
 *   BOTH `currentThought` and `interpretationText` are blank.
 * - "unpleasant_area_select" (and, right after it, "dwelling" -- Part F
 *   step 4) is skipped when `unpleasantBodyArea` is null at the point
 *   the trainee leaves "unpleasant_area_question" -- decided explicitly
 *   by declineUnpleasantArea/confirmUnpleasantArea below, never
 *   inferred generically, so the branch is never ambiguous with "not
 *   yet answered".
 * A step with multiple progressive sub-screens (visual field, sound
 * awareness, the body scan, encoding) advances its own `subIndex`
 * before moving to the next top-level step.
 */

import { STANDALONE_ARC_TASK_ID, createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { ArcInvocationMode, EmotionSelection, NewArcLiveGoalType, NewArcLiveSessionState, NewArcLiveStepId } from "./newArcLiveTypes.ts";
import type { BodyRegion } from "./bodyRegionRoles.ts";
import type { BodyScanRegion } from "./bodyScanRegions.ts";
import {
  canPromoteToSupportiveOpening,
  cycleBodyScanOpeningRole,
  cycleContractionAndGreenOpening,
  cycleSupportiveOnlyOpening,
  resolveBodyScanContractionState,
  resolveBodyScanOpeningRole,
  setBodyScanHeavinessState,
  setBodyScanOpeningRole,
  toggleBodyScanClosedness,
  toggleBodyScanContraction,
  toggleBodyScanHeaviness,
} from "./bodyScanSelection.ts";
import type { BodyScanHeavinessSelection, BodyScanHeavinessState, BodyScanOpeningSelection, BodyScanSide } from "./bodyScanSelection.ts";
import { cycleSupportiveOnlyOpeningBilateral, filterMovementEligibleSelections, isBodyRegionMovementEligible } from "./bodyRegionMovements.ts";
import { resolveSupportiveFeeling } from "./supportiveFeelingMapping.ts";
import type { SupportiveFeelingMapping } from "./supportiveFeelingMapping.ts";
// Three-levels-of-acceptance task: reused UNCHANGED from the existing,
// independent ARC Thought engine -- never a second, parallel type.
import type { ThoughtTimeOrientation } from "./types.ts";

/**
 * ARC-system upgrade task, Part G: Mini ARC's own five steps -- each a
 * single, combined/parallel screen (never a shortened walk through the
 * Full ARC steps above, which would just be Full ARC with shorter
 * timers). Shares "goal_select" (choosing the track) and
 * "emotional_action"/"emotional_insight"/"complete" (the identical
 * post-action insight/belief flow) with the Full ARC sequence -- one
 * mechanism, never duplicated.
 */
/**
 * Unified ARC & Productivity Update task, requirement 6 ("MINI ARC VS.
 * SHORTENED ARC"): "mini_thought" is Mini ARC's own distinctive OPENING
 * choice (Thought / Interpretation / Urge -- any combination, or none,
 * via setMiniCognitiveSelection's multi-select semantics, same as Full
 * ARC's own "cognitive_selector"). ARCHI -- Consolidated Implementation
 * Request, Part 5.1 ("Cognitive Identification Before Emotion"): it now
 * sits BEFORE "mini_awareness" (emotion identification) rather than
 * after it -- "first select Thought/Interpretation/Urge, only then
 * proceed to Emotion Identification." Still immediately followed by
 * "mini_stop_accept_urge"/"mini_reality_acceptance" (both UNCHANGED,
 * still gated the same way they always were): setting any of
 * urgeText/currentThought/interpretationText there is what decides
 * which of those two actually appears next.
 */
export const NEW_ARC_MINI_STEP_ORDER: NewArcLiveStepId[] = [
  "goal_select",
  // "התבוננות וחיבור לעצמי" task: Mini ARC has no sub-pathway of its
  // own (unlike Full ARC's spontaneous-only scoping), so this pair is
  // always reachable here -- see isStepReachable's own "plannedMini"
  // branch. Positioned as Mini ARC's own genuine first screen, right
  // before free_breathing, exactly per the spec's own "if there's no
  // free breathing in Mini ARC, place it at the start of the pathway."
  "self_observation_choice",
  "self_observation_exercise",
  // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
  // Background task: Mini ARC's own opening, shared verbatim with
  // Full ARC's -- never a second, duplicated breathing-intro engine.
  "free_breathing",
  // ARCHI -- Consolidated Implementation Request, Part 5.1 ("Cognitive
  // Identification Before Emotion"): "mini_thought" (Mini ARC's own
  // multi-select Thought/Interpretation/Urge chooser,
  // setMiniCognitiveSelection) and its own two conditional
  // acceptance screens right after it -- "mini_stop_accept_urge"/
  // "mini_reality_acceptance" (gated on urgeText/currentThought/
  // interpretationText, same as always) -- now ALL come BEFORE
  // "mini_awareness" (emotion identification) as one block, reversing
  // their earlier position relative to it. Moving "mini_thought" alone
  // without its own two conditional follow-ups would wrongly insert
  // "mini_awareness" between the chooser and the exercises its own
  // selections are supposed to unlock. The chooser itself, its
  // multi-select semantics, and these two acceptance screens are all
  // completely unchanged -- only their position relative to
  // mini_awareness moved.
  "mini_thought",
  "mini_stop_accept_urge",
  "mini_reality_acceptance",
  "mini_awareness",
  // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task: right
  // after "mini_awareness" (emotion identification), before
  // "mini_presence" -- same shared step id as the Full ARC array below,
  // same isStepReachable gate (reachable for every mode "action_
  // readiness_check" is actually walked through, which here is always
  // "plannedMini" -- see resolveStepOrder).
  "action_readiness_check",
  "mini_presence",
  "mini_acceptance_transition",
  // ARCHI -- Unified Final Specification task, section 2: Mini ARC's own
  // equivalent insertion point -- "mini_acceptance_transition" is Mini
  // ARC's own regulation-equivalent moment (no separate "regulation"
  // step of its own), so this sits directly after it and before
  // "mini_encoding," gated by the same isActiveTaskLiveOrigin/
  // arcGymSituationId rule as "action_selection" in the Full ARC order
  // below (see isStepReachable in this same file).
  "mini_action_selection",
  // ARCHI -- Unified 7-Part Update task, Part 5 ("ENCODING MUST LEAD
  // DIRECTLY TO ACTION"): "mini_action" (its own "get ready" screen)
  // and the shared "emotional_action"/"emotional_insight" pair are all
  // gone from here -- "there should be no extra goal, ending,
  // emotional-action, or preparation questions after Encoding." Mini
  // ARC now goes straight from its own Encoding to "complete", exactly
  // like Full ARC. All three step ids, their own copy content, and
  // every setter that writes them stay fully intact (never deleted) --
  // simply never reached by any NEW session; see
  // migrateLegacyNewArcLiveStep below for the one-time forward
  // migration a session saved mid-flight on one of them needs.
  "mini_encoding",
  "complete",
];

/** Part H: which fixed step order a session walks is a pure function of its own arcInvocationMode -- "plannedMini" always walks NEW_ARC_MINI_STEP_ORDER, every other mode walks the Full ARC sequence. The single switch point every navigation function below goes through, so the two sequences can never drift apart via a second, forgotten hardcoded reference. */
export function resolveStepOrder(mode: NewArcLiveSessionState["arcInvocationMode"]): NewArcLiveStepId[] {
  return mode === "plannedMini" ? NEW_ARC_MINI_STEP_ORDER : NEW_ARC_LIVE_STEP_ORDER;
}

/**
 * Final ARC Flow & Body Animation task, requirement 1 ("EXACT ARC
 * SEQUENCE"): the user's own declared, authoritative core sequence --
 * Presence -> Identify Contraction -> Dwelling -> Identify Closure ->
 * Choose Desired Feeling -> Select Opening Regions -> Acceptance ->
 * Regulation -> Encoding & Action -- replaces the PREVIOUS interleaved
 * block (unpleasant_area_question/unpleasant_area_select/dwelling/
 * body_scan_contraction/body_scan_heaviness/body_scan_closedness/
 * body_scan_opening_region/desired_feeling_select/desired_feeling_locate)
 * with exactly this new order:
 *
 *   ...body_scan (end of "Presence")
 *   -> body_scan_contraction   ("Identify Contraction")
 *   -> dwelling                ("Dwelling" -- now gated on the
 *                                contraction regions just identified,
 *                                never the old coarse unpleasantBodyArea)
 *   -> body_scan_closedness    ("Identify Closure" -- the screen itself
 *                                now restricts selection to
 *                                movement-eligible regions only, per
 *                                arc/bodyRegionMovements.ts)
 *   -> desired_feeling_select  ("Choose Desired Feeling")
 *   -> body_scan_opening_region ("Select Opening Regions" -- repurposed
 *                                to MULTI-select, restricted to the
 *                                closure regions just identified, via
 *                                the new openingBodyScanRegions field)
 *   -> desired_ending / supportive_area_select (unchanged, untouched
 *                                fallback machinery)
 *   -> acceptance -> regulation -> encoding -> ...
 *
 * "body_scan_heaviness" is removed from the active flow entirely
 * ("remove the heaviness-selection step") -- its own getStepContent
 * case, isStepReachable entry (there was none; it was unconditional),
 * and bodyScanHeavinessRegions' own heaviness bit/toggle function all
 * stay fully intact for historical data, simply never reached by any
 * NEW session. "unpleasant_area_question"/"unpleasant_area_select" are
 * likewise removed from the active flow (their role -- identifying
 * where an unpleasant sensation lives -- is now fully covered by the
 * new, finer body_scan_contraction step); their own code/data are also
 * kept, unremoved. "desired_feeling_locate" is removed too: "Select
 * Opening Regions" now IS the desired feeling's own embodiment step
 * (never re-asking "where do you feel it" as a separate question
 * right after choosing it).
 *
 * "supportive_sensation_select"/"supportive_movement_select" remain
 * removed (unrelated to this task; the supportive feeling still
 * develops live during Regulation, never chosen up front).
 */
/**
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 6 ("ordering for multiples: Urge ->
 * Thought -> Interpretation -> Emotion Identification -> Presence/Body
 * Exercise"): "cognitive_selector" replaces the old unconditional
 * "emotion" position right after goal_select -- each cognitive branch
 * is now its own independently-gated capture+acceptance pair (urge /
 * thought+reality_acceptance / interpretation+interpretation_acceptance),
 * walked in this exact fixed order, and "emotion" (now ALWAYS
 * reachable, requirement 4) comes only after all three. Zero
 * selections -> every one of the five new/moved steps between
 * "cognitive_selector" and "emotion" is unreachable, so the trainee
 * lands on "emotion" directly, exactly per requirement 5's "Emotion-only
 * flow."
 */
export const NEW_ARC_LIVE_STEP_ORDER: NewArcLiveStepId[] = [
  "goal_select",
  // "התבוננות וחיבור לעצמי" task: sits right before free_breathing --
  // "self_observation_choice" is present in this array for every Full
  // ARC mode, but its OWN isStepReachable rule (below) scopes it to
  // arcInvocationMode === "spontaneous" only (the "פחות טוב" mood-
  // check-in / standalone / combined-shortcut entries) -- a
  // plannedFull/shortened session walks straight past it to
  // free_breathing, same "skip an unreachable step, never a second
  // array" convention as everything else here.
  "self_observation_choice",
  "self_observation_exercise",
  // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
  // Background task: the one shared opening screen, right before the
  // cognitive selector -- "the breathing introduction should appear
  // before this selector." ARCHI -- Refine the Shortened ARC / "סבבה"
  // Pathway task, requirement 1: now reachable for "shortened" mode
  // too (no longer in SHORTENED_ARC_SKIPPED_STEPS below) -- it is this
  // position in the array, right at the very start, that makes it
  // "סבבה"'s own first screen, before the body-selection/supportive-
  // area work begins.
  "free_breathing",
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: "סבבה" (shortened) asks its own free-time rating right here,
  // immediately after "free_breathing" -- own isStepReachable rule
  // below scopes it to arcInvocationMode === "shortened" with
  // timeAvailableRating still null, so a session that transitioned
  // from "פחות טוב" (which already answered it on action_readiness_check)
  // walks straight past it, never re-asked.
  "time_available_check",
  "cognitive_selector",
  "urge",
  "stop_and_accept_urge",
  "thought",
  "reality_acceptance",
  "interpretation",
  "interpretation_acceptance",
  "emotion",
  // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task: right
  // after "emotion," before "natural_breathing" -- i.e. immediately
  // after the acceptance of interpretation/urge/thought, before the
  // presence stages. Permanently unreachable for "shortened" (see
  // SHORTENED_ARC_SKIPPED_STEPS below).
  "action_readiness_check",
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: both only reachable when arcPracticeDepth === "short" (see
  // isStepReachable below) -- "quick_presence" shared by both tracks,
  // "short_body_marking" פחות-טוב-only ("סבבה" short reuses the
  // existing "supportive_area_select" screen further down instead).
  // Full-depth sessions (arcPracticeDepth "full"/null -- every existing
  // session) walk straight past both, landing on "natural_breathing"
  // exactly as today.
  "quick_presence",
  "short_body_marking",
  "natural_breathing",
  "center_attention",
  "visual_field",
  "sound_awareness",
  "body_scan",
  "body_scan_contraction",
  // ARCHI -- Full ARC Body Flow Redesign task: "dwelling" and
  // "body_scan_closedness" are now BOTH permanently unreachable (see
  // isStepReachable below) -- "Acceptance Part 1 immediately follows
  // Screen One [body_scan_contraction]," with nothing in between. Both
  // step ids, their own copy content, and every setter that touches
  // them stay fully intact (never deleted), the same "kept but never
  // reached" convention this file already used for body_scan_closedness
  // itself before this task; see migrateLegacyNewArcLiveStep below for
  // the forward migration a session saved mid-flight on "dwelling"
  // needs.
  "dwelling",
  "body_scan_closedness",
  // ARCHI -- Unified 7-Part Update task, Part 2 ("REMOVE REDUNDANT ARC
  // STEPS"): "desired_feeling_select" ("התחושה המבוקשת") is gone from
  // the active order -- the supportive feeling is now ALWAYS derived
  // automatically from the current emotion (Part 3.1,
  // arc/supportiveFeelingMapping.ts). "desired_ending" ("סוף הפעולה")
  // is gone too -- Encoding now reads the task's own already-known
  // action context directly (arc/newArcLiveCopy.ts's
  // resolveEncodingMantra), never a separate question about how it
  // should end. Both step ids, their own copy content, and every
  // setter that writes them stay fully intact (never deleted) --
  // simply never reached by any NEW session; see
  // migrateLegacyNewArcLiveStep below for the forward migration a
  // session saved mid-flight on one of them needs.
  //
  // ARCHI -- Full ARC Body Flow Redesign task: "acceptance" now sits
  // HERE, right after body_scan_contraction/dwelling/body_scan_closedness
  // -- this IS Acceptance Part 1, with its own exact mantra and
  // Green-region opening/stabilization instructions
  // (arc/newArcLiveCopy.ts's own getAcceptanceContent). "body_scan_opening_region"
  // moves to AFTER it -- this screen is now Blue-ONLY supportive-region
  // selection (every Red/Green region from body_scan_contraction is
  // absolutely excluded, both in the engine -- arc/bodyScanSelection.ts's
  // own cycleSupportiveOnlyOpening -- and in the UI's own selectableRegions
  // filter), never the old combined Green+Blue picker. "supportive_area_select"
  // (Shortened ARC's own Blue-only screen) stays right after it, now
  // reachable ONLY for "shortened" (its old Full-ARC fallback role --
  // "nothing was auto-carried from body_scan_closedness" -- no longer
  // applies now that Green is never auto-carried and Screen Two is
  // always the Full-ARC mechanism). "acceptance_part_two" is the new
  // step right after that: the simultaneous-attention -> transfer ->
  // initial-Blue-opening moment, reusing the same circle component with
  // its own distinct ArcBodyMantraStage.
  "acceptance",
  "body_scan_opening_region",
  "supportive_area_select",
  "acceptance_part_two",
  "regulation",
  // ARCHI -- Unified Final Specification task, section 2 ("Action
  // Selection must occur immediately AFTER Regulation and BEFORE
  // Encoding" -- exact sequence "Acceptance -> Regulation -> Action
  // Selection -> Encoding -> Task Execution"): unreachable when
  // isActiveTaskLiveOrigin ("reuse it without asking again") or
  // arcGymSituationId (ARC GYM's own separate, later positive-action
  // visualization) -- see isStepReachable above. Otherwise shows "מה
  // תרצה לעשות כעת?", letting the trainee pick an existing scheduled
  // task (even one planned hours later) or enter a temporary action;
  // the result is stored on the session (setSelectedAction) so both
  // Encoding (resolveEncodingMantra) and post-ARC routing
  // (returnToTask) can read it back.
  "action_selection",
  "encoding",
  // Part 2B ("נקודת מיקוד") / Part 5 ("ENCODING MUST LEAD DIRECTLY TO
  // ACTION"): "focus_color" is removed from Presence (the point color
  // now comes from the persistent "עיצוב תרגיל ARC" settings instead,
  // Part 7.2) and "transition"/"emotional_action"/"emotional_insight"
  // are removed from after Encoding -- "there should be no extra goal,
  // ending, emotional-action, or preparation questions after Encoding."
  // Every goal type now goes straight from Encoding to "complete",
  // which itself now fires automatically (live/NewArcLiveScreen.tsx's
  // own completeConsumedRef effect) -- never a menu of options. All
  // four step ids/their copy/setters stay fully intact, unreached.
  "complete",
];

/**
 * "Saved sessions using old step identifiers must resume safely" --
 * the same forward-migration discipline this module has followed
 * through every prior restructuring. Final ARC Flow & Body Animation
 * task: four steps are newly removed from the active order above, each
 * forward-migrated to the nearest still-active step a session mid-
 * flight there would otherwise never reach again:
 * - "unpleasant_area_question"/"unpleasant_area_select" (chronologically
 *   right before the old dwelling position) -> "body_scan_contraction",
 *   the new order's own first step in this section. No data is lost:
 *   unpleasantBodyArea/unpleasantBodyAreas stay exactly as saved, simply
 *   no longer read by anything active.
 * - "body_scan_heaviness" (between body_scan_contraction and
 *   body_scan_closedness in the old order) -> "body_scan_closedness",
 *   the very next still-active step -- a session paused there had
 *   already done contraction/dwelling and loses zero progress.
 * - "desired_feeling_locate" (right after desired_feeling_select in the
 *   old order) -> "body_scan_opening_region", the new order's own next
 *   step after desired_feeling_select.
 * "supportive_sensation_select"/"supportive_movement_select" keep
 * forward-migrating to "acceptance", exactly as before.
 * Every OTHER currentStep (the overwhelming majority, including every
 * brand-new session) is returned completely untouched.
 */
/**
 * ARCHI -- Unified 7-Part Update task: the one shared "walk forward
 * from a known still-active anchor step, stop at the first one
 * isStepReachable actually accepts" helper every migration below that
 * forwards PAST a removed step (rather than landing on one fixed named
 * target) uses -- never a second, independently-reimplemented walk
 * that could silently disagree with it. `afterStep` must itself still
 * be a member of resolveStepOrder(state.arcInvocationMode) (every
 * anchor passed below is).
 */
function resolveFirstReachableAfter(afterStep: NewArcLiveStepId, state: NewArcLiveSessionState): NewArcLiveStepId {
  const order = resolveStepOrder(state.arcInvocationMode);
  const anchorIndex = order.indexOf(afterStep);
  for (let i = anchorIndex + 1; i < order.length; i++) {
    if (isStepReachable(order[i], state)) return order[i];
  }
  return "complete";
}

export function migrateLegacyNewArcLiveStep(state: NewArcLiveSessionState): NewArcLiveSessionState {
  // ARCHI -- Unified 7-Part Update task, Part 2 ("REMOVE REDUNDANT ARC
  // STEPS") / Part 3.2 ("AUTOMATIC... BODY MOVEMENTS"): a session saved
  // mid-flight on any of these four now-removed BETWEEN-body_scan_closedness
  // -AND-encoding steps -- "desired_feeling_select"/"desired_feeling_locate"
  // (the old manual feeling question, now auto-derived from the current
  // emotion instead), "body_scan_opening_region" (the old manual
  // opening-region picker), "desired_ending" (the old end-of-action
  // question, for every goalType now, not only emotion_only) -- first
  // gets the exact same automatic carry-forward confirmBodyScanClosedness
  // itself performs (harmless no-op if this session already has opening
  // regions, e.g. one already past the old manual picker), then forward-
  // migrates to the first step still actually reachable after
  // "body_scan_closedness" in the CURRENT order -- never a single
  // hardcoded target, so this can never drift from the real reachability
  // rules above. No data is lost: desiredFeelingText/desiredFeelingBodyAreas/
  // desiredEnding all stay exactly as saved, simply unread by anything
  // active going forward.
  // ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
  // task: "body_scan_opening_region" is REACTIVATED (it is now the
  // green/blue selection screen) -- a session genuinely parked there
  // must stay there, never force-migrated past it any more.
  if (state.currentStep === "desired_feeling_select" || state.currentStep === "desired_feeling_locate" || state.currentStep === "desired_ending") {
    const withAutoOpening =
      state.openingBodyScanRegions.length > 0 || state.primaryOpeningBodyScanRegion !== null
        ? state
        : { ...state, openingBodyScanRegions: resolveLightGreenEligibleClosureRegions(state).map(({ region, side }) => ({ region, side, role: "opening" as const })) };
    return { ...withAutoOpening, currentStep: resolveFirstReachableAfter("body_scan_closedness", withAutoOpening), subIndex: 0 };
  }
  // ARCHI -- Simplify the "פחות טוב" body-flow and remove the separate
  // closure-selection screen task: a session saved mid-flight exactly
  // on "body_scan_closedness" itself predates this task -- that step
  // is now permanently unreachable (isStepReachable above), so forward-
  // migrate past it to whatever is now reachable next.
  //
  // ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
  // Logic task: this NO LONGER auto-carries anything into
  // openingBodyScanRegions -- "Green must NOT be automatically
  // preselected." The trainee's own earlier contraction selection
  // (bodyScanContractionRegions) and any legacy closure data
  // (bodyScanHeavinessRegions) both stay exactly as saved, simply
  // unread by anything active going forward -- openingBodyScanRegions
  // is only ever written by the trainee's own explicit tap on
  // body_scan_opening_region now (toggleOpeningBodyScanRegion).
  if (state.currentStep === "body_scan_closedness") {
    return { ...state, currentStep: resolveFirstReachableAfter("body_scan_closedness", state), subIndex: 0 };
  }
  // ARCHI -- Full ARC Body Flow Redesign task: a session saved
  // mid-flight exactly on "dwelling" predates this task -- that step is
  // now permanently unreachable (isStepReachable above), so forward-
  // migrate past it to whatever is now reachable next (Acceptance Part
  // 1, in the current order). No data is lost: bodyScanContractionRegions
  // itself is untouched, simply unread by "dwelling" going forward.
  if (state.currentStep === "dwelling") {
    return { ...state, currentStep: resolveFirstReachableAfter("dwelling", state), subIndex: 0 };
  }
  // Part 2B ("נקודת מיקוד"): a session saved mid-flight exactly on
  // "focus_color" predates its removal -- forward one step to
  // "visual_field", the very next step in the active order; the point
  // color itself now comes from the persistent appearance settings
  // (Part 7.2), never lost, simply never asked here again.
  if (state.currentStep === "focus_color") {
    return { ...state, currentStep: "visual_field", subIndex: 0 };
  }
  // Part 5 ("ENCODING MUST LEAD DIRECTLY TO ACTION"): a session saved
  // mid-flight on any of these four now-removed POST-Encoding steps
  // (the old "לקראת הפעולה" menu, the emotional-action picker, its own
  // insight question, or Mini ARC's own "mini_action") already
  // finished Encoding -- there is nothing left to do but land on
  // "complete" directly, which itself now fires its own return-to-task
  // automatically (live/NewArcLiveScreen.tsx), never a second menu.
  if (
    state.currentStep === "transition" ||
    state.currentStep === "emotional_action" ||
    state.currentStep === "emotional_insight" ||
    state.currentStep === "mini_action"
  ) {
    return { ...state, currentStep: "complete", subIndex: 0 };
  }
  // Unified ARC & Productivity Update task, requirement 2: a session
  // saved mid-flight exactly on "goal_select" predates this task --
  // isStepReachable now excludes it unconditionally (see its own doc
  // comment above), so forward-migrate to whatever the first ACTUALLY
  // reachable step is for this session's own mode, computed the exact
  // same way (walking resolveStepOrder, filtered by isStepReachable)
  // createSessionFromPlannedArcFields below already uses for a brand
  // new plan-prefilled session -- never a hardcoded per-mode target
  // that could silently drift from the real reachability rules.
  // goalType is backfilled too (it was never answered), using the
  // exact same derivation createNewArcLiveSessionState itself now
  // applies at creation, so every downstream copy branch that reads
  // goalType sees a sensible, consistent value rather than null.
  if (state.currentStep === "goal_select") {
    const migrated = { ...state, goalType: state.taskId === STANDALONE_ARC_TASK_ID ? ("emotion_only" as const) : ("combined" as const) };
    for (const step of resolveStepOrder(migrated.arcInvocationMode)) {
      if (step !== "goal_select" && isStepReachable(step, migrated)) {
        return { ...migrated, currentStep: step, subIndex: 0 };
      }
    }
    return { ...migrated, currentStep: "complete", subIndex: 0 };
  }
  // ARCHI -- Universal ARC Routing, Emotion Identification & Android
  // Shortcuts task, requirement 6-7: a session saved mid-flight exactly
  // on "reality_acceptance" from BEFORE this task, with only
  // interpretationText set (the old mode A -- interpretation only, no
  // thought) predates the split -- this step's own isStepReachable gate
  // now requires currentThought specifically, so forward-migrate once
  // to "interpretation_acceptance", the new dedicated home for that
  // exact content. No data is lost: interpretationText itself is
  // untouched, simply read by a different step id going forward.
  if (state.currentStep === "reality_acceptance" && !state.currentThought && state.interpretationText) {
    return { ...state, currentStep: "interpretation_acceptance", subIndex: 0 };
  }
  // ARCHI -- Two Mantras for Urge Acceptance correction: a session saved
  // mid-flight on one of the five now-removed preparatory sub-screens
  // (subIndex 1-5) predates this collapse to a single page -- clamp to
  // the one remaining subIndex 0, which already shows the full urge-
  // acceptance circle (never stuck re-rendering a sub-screen that no
  // longer exists). No data is lost: urgeText itself is untouched.
  if (state.currentStep === "stop_and_accept_urge" && state.subIndex > 0) {
    return { ...state, subIndex: 0 };
  }
  // ARCHI -- Move Action Selection into the Existing Regulation Screen
  // task / ARCHI -- Show Action Selection ON the Regulation Screen task:
  // "action_selection"/"mini_action_selection" are now permanently
  // unreachable (isStepReachable above) -- their own functionality moved
  // INTO "regulation" (now a single sub-screen -- the action-selection
  // section renders together with the mantra/body exercise, never a
  // separate subIndex) and "mini_acceptance_transition" (still its own
  // subIndex 1, untouched by the Regulation-only change). A session
  // saved mid-flight exactly on one of these two steps (meaning it had
  // not yet selected an action -- selecting one always advances
  // immediately via setSelectedAction's own advance() call, so it could
  // never be saved here WITH a selection already made) restores
  // directly to the step that now carries this functionality, never
  // forcing the trainee to repeat the body-opening/acceptance-transition
  // exercise that already got them here. No data is lost: nothing was
  // ever written to selectedAction* while parked on these steps.
  if (state.currentStep === "action_selection") {
    return { ...state, currentStep: "regulation", subIndex: 0 };
  }
  if (state.currentStep === "mini_action_selection") {
    return { ...state, currentStep: "mini_acceptance_transition", subIndex: 1 };
  }
  // ARCHI -- Consolidated Implementation Request, Part 1.2: a shortened
  // session saved mid-flight exactly on "acceptance" predates its
  // removal from Shortened ARC's own sequence -- forward-migrate to
  // the first step still reachable right after it (always
  // "regulation" in practice, computed rather than hardcoded so this
  // can never drift from isStepReachable above). Full ARC/Mini ARC
  // sessions are never affected -- "acceptance" stays fully reachable
  // for them, so this check only ever fires for "shortened".
  if (state.currentStep === "acceptance" && state.arcInvocationMode === "shortened") {
    return { ...state, currentStep: resolveFirstReachableAfter("acceptance", state), subIndex: 0 };
  }
  switch (state.currentStep) {
    case "supportive_sensation_select":
    case "supportive_movement_select":
      return { ...state, currentStep: "acceptance", subIndex: 0 };
    case "unpleasant_area_question":
    case "unpleasant_area_select":
      return { ...state, currentStep: "body_scan_contraction", subIndex: 0 };
    case "body_scan_heaviness":
      return { ...state, currentStep: "body_scan_closedness", subIndex: 0 };
    default:
      return state;
  }
}

/**
 * Fix All Confirmed ARC Android Bugs task, requirement 2 ("Presence
 * Mantras Inside the Circle"): visual_field/sound_awareness/body_scan
 * are now each exactly ONE page -- a single fixed first-person mantra
 * rendered inside live/components/ArcBodyMantraCircle.tsx, the same
 * "one mantra page at a time" simplification Dwelling/Acceptance/
 * Regulation/Encoding already use below (see arc/newArcLiveCopy.ts's
 * own getStepContent cases for these three). The old multi-line
 * progressive wording (VISUAL_FIELD_LINE_COUNT/SOUND_AWARENESS_LINE_COUNT/
 * a full per-region BODY_SCAN_REGION_COUNT walk) is gone along with
 * those exports -- nothing outside this file ever read them except
 * this switch itself, confirmed by a full-repo search before removal.
 * No special-casing for arcInvocationMode === "spontaneous" is needed
 * any more either: every invocation mode now gets the exact same
 * single body_scan mantra page.
 */

/** How many progressive screens the given step has for this session (goal-type/unpleasant-area dependent for "encoding"/"regulation"). Everything else is fixed. Each screen stays within the task's own "at most two supporting instructions visible at once" limit -- a step with more lines than that is split across several progressive sub-screens instead of cramming them onto one. */
export function stepSubCount(step: NewArcLiveStepId, state: NewArcLiveSessionState): number {
  switch (step) {
    // Final ARC Flow & Body Animation task, requirement 4 ("ONE
    // CIRCLE... one mantra page at a time"): Acceptance is now exactly
    // ONE page, showing the one fixed Acceptance mantra -- the old
    // multi-sub-screen region-listing text is replaced entirely (see
    // arc/newArcLiveCopy.ts's own getAcceptanceContent).
    case "acceptance":
      return 1;
    // Nine Functional Improvements task, Improvement 3 ("Internal
    // Action" timer): TWO sub-screens -- subIndex 0 picks the action
    // (preset chip or free text, setEmotionalAction's existing
    // behavior, UNCHANGED), subIndex 1 is the timer phase
    // (live/NewArcLiveScreen.tsx's own Start/Pause/Resume/Finish
    // controls over a dedicated, separately-persisted timer run).
    // Advancing from subIndex 1 (stepSubCount's own generic "move past
    // the last sub-screen" rule in resolveNextStep) is what actually
    // leaves this step for "emotional_insight" -- only ever reached by
    // tapping Finish, never automatically.
    case "emotional_action":
      return 2;
    // ARCHI -- Two Mantras for Urge Acceptance correction: "stop_and_
    // accept_urge" is now exactly ONE page (default case below applies)
    // -- the old five progressive dwell-gated instruction sub-screens +
    // one closing-mantra sub-screen are gone entirely. "Replace those
    // consecutive explanatory pages with ONE animated urge-acceptance
    // screen... allow the trainee to remain on this screen as long as
    // needed" -- see arc/newArcLiveCopy.ts's own getUrgeAcceptanceContent
    // for the one fixed circle mantra + the exactly-two below-circle
    // mantras, and migrateLegacyNewArcLiveStep below for the one
    // sub-index clamp a session paused mid-flight on one of the
    // now-removed sub-screens needs.
    // Three-levels-of-acceptance task, section 2 / ARCHI Universal ARC
    // Routing task, requirement 6-7: ALWAYS two sub-screens now (ask
    // which time the thought concerns, then the time-oriented mantra)
    // -- "reality_acceptance" is reachable ONLY when currentThought is
    // non-blank (isStepReachable below), the old mode-A
    // (interpretation-only, no thought) fallback is gone from this
    // step entirely -- interpretation now always gets its OWN separate
    // "interpretation_acceptance" step/mantra instead (see below),
    // never folded in here.
    case "reality_acceptance":
      return 2;
    // Requirement 7: a single fixed mantra page, exactly like
    // "acceptance"/"regulation" above -- no time question (an
    // interpretation has no time orientation to classify).
    case "interpretation_acceptance":
      return 1;
    // ARCHI -- Show Action Selection ON the Regulation Screen task:
    // ONE page, always. The action-selection prompt (when it applies --
    // i.e. whenever arcGymSituationId is not set) is no longer a second
    // sub-screen reached by tapping past the Regulation mantra/body --
    // it renders TOGETHER with that mantra/body on this same single
    // page (live/NewArcLiveScreen.tsx's own case "regulation"), so the
    // trainee sees and can act on it without first having to advance
    // past Regulation. ARC GYM (arcGymSituationId set) still has
    // nothing to select, same as before.
    case "regulation":
      return 1;
    // Same ONE-page-per-mantra simplification -- Encoding is now
    // exactly one page showing the computed, personalized encoding
    // mantra (arc/newArcLiveCopy.ts's own resolveEncodingMantra),
    // which already folds the trainee's own chosen action (or, for
    // emotion-only ARC, omits it rather than inventing one) into the
    // SAME single mantra -- never a separate action-visualization
    // sub-screen any more.
    case "encoding":
      return 1;
    // Part G: every Mini ARC step is exactly one combined screen --
    // that IS the brevity requirement, never split into sub-screens.
    case "mini_awareness":
    case "mini_presence":
    case "mini_encoding":
    case "mini_action":
      return 1;
    // ARCHI -- Move Action Selection into the Existing Regulation Screen
    // task: "mini_acceptance_transition" is Mini ARC's own
    // regulation-equivalent moment (see NEW_ARC_MINI_STEP_ORDER's own
    // doc) -- same two-sub-screen treatment as "regulation" above.
    // subIndex 0 is the UNCHANGED existing area/sensation/movement
    // form; subIndex 1 is the integrated action-selection prompt,
    // reusing the old "mini_action_selection" step's own content/UI.
    // Same isActiveTaskLiveOrigin fix as "regulation" above -- see its
    // comment for why this sub-screen must always be reachable now.
    case "mini_acceptance_transition":
      return !!state.arcGymSituationId ? 1 : 2;
    default:
      return 1;
  }
}

/**
 * Unified Emotional Check-In and Task Postponement System: the
 * preliminary AWARENESS stages a "shortened" session always skips --
 * emotion identification, thought/urge, the presence exercises
 * (breathing/center-attention/focus-color/visual-field/sound-awareness),
 * and the full body scan (both its passive step and the interactive
 * contraction/closedness selection screens). Regulation, encoding,
 * action visualization, return-to-body-awareness, and transition to
 * action are never in this set -- those are exactly what the spec
 * requires "shortened" to still preserve.
 *
 * Final ARC Flow & Body Animation task: "unpleasant_area_question"/
 * "unpleasant_area_select"/"body_scan_heaviness"/"desired_feeling_locate"
 * are removed here too (they are no longer part of the ACTIVE step
 * order at all -- see NEW_ARC_LIVE_STEP_ORDER's own doc -- so listing
 * them would be dead weight). Every step that IS still active and
 * preliminary keeps its membership, unchanged.
 *
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 3D ("Shortened ARC skips the selector but
 * still requires emotion ID + Presence/body exercise"): "emotion" is
 * now REMOVED from this set -- a shortened session must still always
 * identify the current emotion (requirement 4: "always included"), a
 * deliberate reversal of the previous design. "cognitive_selector"/
 * "urge"/"interpretation" join the set instead (alongside the
 * already-present "thought"), so a shortened session never sees any of
 * the three cognitive-branch screens at all; their own acceptance
 * steps ("stop_and_accept_urge"/"reality_acceptance"/
 * "interpretation_acceptance") need no entry here, same reasoning as
 * before -- with urgeText/currentThought/interpretationText all
 * staying null (their own capture screens are skipped), those three
 * steps' existing data-driven gates already exclude them.
 */
const SHORTENED_ARC_SKIPPED_STEPS = new Set<NewArcLiveStepId>([
  // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
  // Background task originally kept "free_breathing" skipped here
  // ("Keep Shortened ARC (סבבה) unchanged"). ARCHI -- Refine the
  // Shortened ARC / "סבבה" Pathway task, requirement 1, REVERSES that:
  // "free_breathing" is deliberately NOT in this set any more -- it is
  // now the FIRST screen of a shortened session too (NEW_ARC_LIVE_STEP_ORDER
  // puts it right after "goal_select," before every other shortened
  // step), reusing the exact same FreeBreathingIntro component,
  // animation, and persistent pale-blue background
  // (resolveArcBackgroundColor, arc/freeBreathingIntro.ts) every other
  // pathway already gets -- never a second, duplicated breathing intro.
  "cognitive_selector",
  "urge",
  "thought",
  "interpretation",
  // ARCHI -- Unified 7-Part Update task, Part 6.2 ("REMOVE
  // CURRENT-EMOTION SELECTION" -- Shortened ARC only): a deliberate
  // REVERSAL, for this one mode only, of the earlier Universal ARC
  // Routing task's "emotion is always reachable" rule -- "do not
  // replace it with another emotion question." Full ARC and Mini ARC
  // both keep their own separate emotion-identification step
  // unaffected; only "סבבה" skips it, never asking about the current
  // emotion at all.
  "emotion",
  // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task,
  // requirement "לא להוסיף אותו למסלול 'סבבה' בפני עצמו" (do not add
  // it to the Shortened pathway on its own): a shortened session never
  // sees the two-rating screen at all, same reasoning as "emotion"
  // right above it -- with no ratings ever captured, actionReadiness
  // Outcome stays null for a from-scratch shortened session, which
  // every reader below already treats as "no outcome decided," never
  // inventing one.
  "action_readiness_check",
  // Part 6.3 ("AUTOMATIC PRESENCE MUST BE FIRST"): "natural_breathing"
  // and "body_scan" (right below) are deliberately REMOVED from this
  // skip set -- Shortened ARC's own new sequence is "Presence ->
  // Interactive Body Selection -> Acceptance -> Regulation -> Encoding,"
  // reusing "natural_breathing" as that ONE automatic opening Presence
  // screen (arc/newArcLiveCopy.ts's own shortened-mode branch for this
  // step shows the exact combined mantra, "אני מרחיב את שדה הראייה ושם
  // לב לגוף.," never the Full ARC five-screen Presence walk) and
  // "body_scan" as the moment the anatomical body first appears ("the
  // anatomical body should appear as body awareness begins").
  // center_attention/visual_field/sound_awareness stay skipped -- a
  // shortened session still gets exactly ONE Presence screen, never
  // five.
  "center_attention",
  "visual_field",
  "sound_awareness",
  "dwelling",
  "body_scan_contraction",
  "body_scan_closedness",
  "desired_feeling_select",
  // ARCHI -- Consolidated Implementation Request, Part 1.2 ("Remove
  // Acceptance" from Shortened ARC only -- Full ARC and Mini ARC each
  // keep their own separate Acceptance step unaffected): "סבבה" is
  // meant to help the trainee begin acting even with no specific
  // emotional/cognitive difficulty requiring attention, so its own
  // separate Acceptance moment (a step whose whole purpose is making
  // room for a difficulty already identified) is skipped too. The
  // updated sequence is "Presence -> Body Selection -> Regulation
  // (including action selection) -> Encoding" -- Regulation's own
  // body-opening/supportive-attention exercise is completely
  // unaffected (never redesigned to "implement Acceptance" for this
  // mode); "acceptance" itself, its own getStepContent case, and every
  // setter that touches it stay fully intact (never deleted) -- simply
  // never reached by a shortened session. A session saved mid-flight
  // on "acceptance" before this change needs no new migration rule:
  // resolveNextStep/resolvePreviousStep both already resolve through
  // isStepReachable on every call, so the very next advance()/goBack()
  // steps it straight past "acceptance" into "regulation," same as any
  // other now-unreachable step.
  "acceptance",
  // ARCHI -- Full ARC Body Flow Redesign task: "acceptance_part_two" is
  // Full ARC's own new step, right after its new Blue-only
  // "body_scan_opening_region" screen -- Shortened ARC never reaches
  // either, so it never reaches this one either, same reasoning as
  // "acceptance" right above.
  "acceptance_part_two",
]);

/**
 * ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task,
 * Option A ("מעבר ישיר לפעולה"): every step that would otherwise sit
 * between "action_readiness_check" and the action itself -- "ללא יתר
 * שלבי ARC" (without the rest of ARC's steps), for BOTH Full ARC and
 * Mini ARC. "action_selection"/"mini_action_selection" are deliberately
 * NOT listed here -- they get their own conditional rule right below
 * (reachable only for this one outcome, and only when no action is
 * already resolved), since Option A's whole point is to land there (or
 * skip past them straight to "complete" when an action already
 * exists). "action_readiness_check" itself and "complete" are also not
 * listed -- the former is where the trainee is coming FROM (still
 * reachable going back), the latter never goes through this function at
 * all (resolveNextStep's own fallback).
 */
const DIRECT_ACTION_SKIPPED_STEPS = new Set<NewArcLiveStepId>([
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: time is irrelevant once Option A fires, so none of these
  // three steps are ever shown either -- defense in depth alongside
  // their own data gates (arcPracticeDepth/timeAvailableRating stay
  // null for a direct_action outcome, which already excludes them).
  "time_available_check",
  "quick_presence",
  "short_body_marking",
  "natural_breathing",
  "center_attention",
  "focus_color",
  "visual_field",
  "sound_awareness",
  "body_scan",
  "body_scan_contraction",
  "body_scan_heaviness",
  "body_scan_closedness",
  "body_scan_opening_region",
  "unpleasant_area_question",
  "unpleasant_area_select",
  "dwelling",
  "supportive_area_select",
  "supportive_sensation_select",
  "supportive_movement_select",
  "acceptance",
  "acceptance_part_two",
  "regulation",
  "encoding",
  "mini_presence",
  "mini_acceptance_transition",
  "mini_encoding",
]);

/**
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * every full-depth-only screen for BOTH tracks, skipped once
 * arcPracticeDepth === "short" (see isStepReachable below). "פחות טוב"
 * short depth replaces all of this with "quick_presence" ->
 * "short_body_marking" -> "encoding"; "סבבה" short depth replaces it
 * with "quick_presence" -> "supportive_area_select" (reused as-is,
 * its own action-selection section suppressed for short depth by the
 * UI layer) -> "encoding". "action_selection"/"body_scan_opening_region"
 * need no entry here beyond this set already covering them -- same
 * "checked at an early-enough tier that no step-specific gate further
 * down ever gets a chance to resurrect one of these" reasoning as
 * DIRECT_ACTION_SKIPPED_STEPS above.
 */
const SHORT_DEPTH_SKIPPED_STEPS = new Set<NewArcLiveStepId>([
  "natural_breathing",
  "center_attention",
  "visual_field",
  "sound_awareness",
  "body_scan",
  "body_scan_contraction",
  "dwelling",
  "body_scan_closedness",
  "acceptance",
  "body_scan_opening_region",
  "acceptance_part_two",
  "regulation",
]);

/**
 * Whether the session already has a real, resolved action by the time
 * "action_readiness_check" is confirmed -- "להשתמש בפעולה שכבר נבחרה
 * אם קיימת" (use the already-selected action if one exists). Mirrors
 * the three cases every other "already have an action" reader in this
 * file treats as settled: an explicit prior selection
 * (selectedActionSource, from setSelectedAction), the active/paused
 * task's own first action (isActiveTaskLiveOrigin), or an ARC GYM
 * situation (arcGymSituationId, which has its own separate post-ARC
 * action-visualization flow regardless). action_readiness_check sits
 * BEFORE "regulation" (where Action Selection's own sub-screen
 * normally lives), so selectedActionSource is almost always still null
 * at this point -- the isActiveTaskLiveOrigin/arcGymSituationId cases
 * are what actually make Option A's "already selected" branch fire in
 * practice.
 */
function hasResolvedAction(state: NewArcLiveSessionState): boolean {
  return state.selectedActionSource !== null || state.isActiveTaskLiveOrigin || !!state.arcGymSituationId;
}

function isStepReachable(step: NewArcLiveStepId, state: NewArcLiveSessionState): boolean {
  // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task,
  // Option A: checked FIRST, ahead of every other rule below, same
  // precedence as the "shortened" mode check further down -- once this
  // outcome is set, every one of DIRECT_ACTION_SKIPPED_STEPS is
  // unreachable regardless of what data those steps' own gates would
  // otherwise see (e.g. a region already marked contracted earlier in
  // THIS same session must never make "acceptance" reachable again
  // here).
  if (state.actionReadinessOutcome === "direct_action" && DIRECT_ACTION_SKIPPED_STEPS.has(step)) return false;
  // Unified ARC & Productivity Update task, requirement 2 ("REMOVE
  // GOAL / TRIGGER SELECTION SCREENS"): permanently unreachable --
  // goalType is now always auto-derived at session creation (see
  // createNewArcLiveSessionState in arc/newArcLiveTypes.ts), never
  // asked. The step id, its own getStepContent copy case, and
  // setGoalType itself all stay fully intact (never deleted), exactly
  // the same "kept but never reached" convention this file already
  // uses for every PREVIOUS removed step (body_scan_heaviness,
  // unpleasant_area_question, etc.) -- a legacy session saved
  // mid-flight exactly on this step is forward-migrated past it by
  // migrateLegacyNewArcLiveStep below, never left stuck.
  if (step === "goal_select") return false;
  // "התבוננות וחיבור לעצמי" task: the branch screen is reachable only
  // in the two required pathways -- Mini ARC (its own track, no
  // sub-pathway to further scope), and Full ARC's "spontaneous" mode
  // (the "פחות טוב" mood-check-in entry, the standalone button, and the
  // combined מחשבה/דחף shortcut all share this one mode -- never a
  // planned/shortened session, which walks straight past both ids to
  // free_breathing). The exercise screen itself is reachable only once
  // the trainee has actually chosen it -- a real, persisted field,
  // exactly like every other conditionally-skippable step below (never
  // re-deriving the pathway check a second time here).
  if (step === "self_observation_choice") {
    return state.arcInvocationMode === "plannedMini" || state.arcInvocationMode === "spontaneous";
  }
  if (step === "self_observation_exercise") return state.selfObservationChoice === "exercise";
  // ARCHI -- Unified 7-Part Update task, Part 2/5: these six steps are
  // now permanently unreachable, for every mode -- "desired_ending"
  // ("סוף הפעולה"), "focus_color" ("נקודת מיקוד" color picker, now
  // settings-driven -- Part 7.2), "desired_feeling_select" ("התחושה
  // המבוקשת," now automatically derived -- Part 3.1), and
  // "transition"/"emotional_action"/"emotional_insight"/"mini_action"
  // (every post-Encoding preparation/menu screen -- "there should be no
  // extra goal, ending, emotional-action, or preparation questions
  // after Encoding," Part 5). The step ids, their own copy content, and
  // every setter that writes them stay fully intact (never deleted) --
  // simply never reached by any NEW session; see
  // migrateLegacyNewArcLiveStep below for the one-time forward
  // migration a session saved mid-flight on one of them needs.
  // ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
  // task: "body_scan_opening_region" is REACTIVATED (see its own
  // reachability rule further below) -- it is no longer in this list.
  if (
    step === "desired_ending" ||
    step === "focus_color" ||
    step === "desired_feeling_select" ||
    step === "transition" ||
    step === "emotional_action" ||
    step === "emotional_insight" ||
    step === "mini_action"
  ) {
    return false;
  }
  // Unified Emotional Check-In and Task Postponement System: checked
  // FIRST, ahead of every other rule below -- a shortened session never
  // reaches any of these regardless of what data happens to be set.
  // "stop_and_accept_urge"/"reality_acceptance" need no entry here: with
  // "emotion"/"thought" themselves skipped, urgeText/currentThought/
  // interpretationText all stay null, so their OWN existing data-driven
  // gates below already exclude them -- never a second, competing rule
  // for the same two steps. "body_scan_opening_region" and
  // "supportive_area_select" likewise need no entry: with no heaviness
  // selection ever made, their own existing gates already resolve
  // exactly the way a shortened session needs (no invented anchor --
  // "use an existing supportive anchor only if available, otherwise
  // provide safe neutral guidance" is exactly what those two gates,
  // and acceptance/regulation/encoding's own null-safe fallback copy,
  // already do for ANY session that reaches them with no anchor chosen).
  if (state.arcInvocationMode === "shortened" && SHORTENED_ARC_SKIPPED_STEPS.has(step)) return false;
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: checked at this same early tier -- once arcPracticeDepth is
  // "short", every one of the listed full-depth-only screens is
  // unreachable regardless of what data those screens' own gates would
  // otherwise see (same "e.g. a region already marked contracted
  // earlier must never resurrect a skipped screen" reasoning as the
  // direct_action gate above). "full"/null (every existing session, and
  // any new session where the trainee rated time 6-10) is completely
  // unaffected -- every step below is reached exactly as it always has.
  if (state.arcPracticeDepth === "short" && SHORT_DEPTH_SKIPPED_STEPS.has(step)) return false;
  // "סבבה" (shortened) asks its own standalone free-time rating right
  // after free_breathing -- never re-asked once answered (whether
  // answered here, or already carried over from a "פחות טוב" session's
  // own 3-rating action_readiness_check before it transitioned into
  // "shortened" via the existing "shortened" outcome).
  if (step === "time_available_check") {
    return state.arcInvocationMode === "shortened" && state.timeAvailableRating === null;
  }
  // Shared "quick presence" screen -- both tracks' short depth alike.
  if (step === "quick_presence") return state.arcPracticeDepth === "short";
  // The RED/BLUE body-marking screen -- "פחות טוב" short depth only;
  // "סבבה" short depth reuses the existing "supportive_area_select"
  // screen below instead (no new step id needed there).
  if (step === "short_body_marking") {
    return state.arcPracticeDepth === "short" && state.arcInvocationMode !== "shortened";
  }
  // ARCHI -- Unified Final Specification task, section 1 (combined
  // "מחשבה / דחף" shortcut -- supersedes the earlier single-urge-only
  // shortcut of the same name/field): a session started via that one
  // button skips exactly one step -- "emotion" (the spec's own explicit
  // "skip the emotion-selection screen entirely... do not invent an
  // unpleasant emotion or require emotion selection later"). Unlike the
  // earlier single-urge shortcut, "cognitive_selector" itself stays
  // fully reachable and interactive here -- the trainee checks one, two,
  // or all three of מחשבה/פרשנות/דחף by hand, never preselected. Every
  // other step -- Presence, body awareness, acceptance, regulation,
  // action selection, encoding -- reaches this function's remaining
  // rules completely unaffected, so this check must come BEFORE them,
  // same position/reasoning as the "shortened" mode check right above
  // it, but independent of it (this shortcut's session is still mode
  // "spontaneous", never "shortened" -- this is never a second
  // shortened-ARC variant).
  if (state.skipEmotionSelection && step === "emotion") return false;
  // ARC Saving task: a session launched from a trigger's own chosen
  // ArcSavedBodyOption (arcSavingBodyOptionId set) already has its body-
  // region fields pre-filled by arc/arcSaving.ts's own
  // applyArcBodyProtocolSnapshotToSession at creation -- the spec's own
  // "המשתמש אינו צריך לבחור מחדש את אזורי הגוף" (section 2) /
  // "אין לדלג על שלבי הוויסות עצמם, אלא רק על הצורך להזין מחדש נתוני
  // גוף שמורים" (same section). So only the three REGION-selection
  // screens are skipped, exactly the "skipEmotionSelection" template
  // above -- "regulation" itself (where the trainee can still see/adjust
  // the pre-filled sensation/movement) and every other step stay fully
  // reachable and unaffected.
  if ((state.arcSavingBodyOptionId || state.arcSavingExerciseId) && (step === "body_scan_contraction" || step === "body_scan_opening_region" || step === "supportive_area_select")) return false;
  // ARCHI -- Move Action Selection into the Existing Regulation Screen
  // task: "action_selection"/"mini_action_selection" are now PERMANENTLY
  // unreachable, for every session -- their own functionality (pick an
  // existing scheduled task, even one due hours later, or enter a
  // temporary action) moved INTO "regulation"/"mini_acceptance_transition"
  // as each one's own subIndex 1 (see stepSubCount above, gated by the
  // exact same isActiveTaskLiveOrigin/arcGymSituationId condition this
  // rule used to apply here). The step ids, their own getStepContent
  // case, and setSelectedAction itself all stay fully intact (never
  // deleted) -- simply never reached by any session any more; see
  // migrateLegacyNewArcLiveStep below for the one-time forward
  // migration a session saved mid-flight on either of them needs.
  // ARCHI -- Action-Readiness Check task, Option A: the one exception
  // to "permanently unreachable" above -- reachable exactly when the
  // trainee was just routed here for direct-to-action AND no action is
  // already resolved (hasResolvedAction), "otherwise allow choosing
  // one." When an action IS already resolved, this stays false (same
  // as ever) and DIRECT_ACTION_SKIPPED_STEPS/this outcome's own
  // "encoding"/"mini_encoding" exclusion above send the trainee
  // straight to "complete" instead.
  if (step === "action_selection" || step === "mini_action_selection") {
    return state.actionReadinessOutcome === "direct_action" && !hasResolvedAction(state);
  }
  // ARCHI -- Universal ARC Routing, Emotion Identification & Android
  // Shortcuts task, requirement 2/6: the three cognitive CAPTURE
  // screens are reachable only when the trainee actually checked that
  // box on "cognitive_selector" -- never on their own real text field
  // (which doesn't exist yet at that point; it's set BY this very
  // screen). Mini ARC's own "mini_thought" stays its own single
  // combined screen (never gated by these three booleans -- it is
  // always reachable the same way it always was, Mini ARC's own
  // brevity design).
  if (step === "urge") return state.selectedCognitiveUrge;
  if (step === "thought") return state.selectedCognitiveThought;
  if (step === "interpretation") return state.selectedCognitiveInterpretation;
  // Urge-stop task, requirement 1's own closing line: "אם לא הוזן דחף,
  // ממשיכים בפרוטוקול הרגיל ללא שלב עצירה נוסף" -- gated by the one
  // real field, never a separate "did I skip this" flag.
  if (step === "stop_and_accept_urge" || step === "mini_stop_accept_urge") return !!state.urgeText && state.urgeText.trim().length > 0;
  // Requirement 6/7: reality_acceptance is now Thought's OWN,
  // genuinely separate acceptance moment -- gated ONLY by currentThought
  // (the old mode-A "or interpretationText" clause is gone; interpretation
  // has its own dedicated "interpretation_acceptance" step right below,
  // never folded in here any more).
  if (step === "reality_acceptance") return !!state.currentThought && state.currentThought.trim().length > 0;
  // Mini ARC keeps its own single combined mini_reality_acceptance
  // screen UNCHANGED -- still gated by either field, since Mini ARC
  // deliberately never splits thought/interpretation acceptance into
  // two separate screens (its own brevity design; see
  // arc/newArcLiveCopy.ts's own getMiniRealityAcceptanceContent, which
  // folds both mantras into the one screen when both are present).
  if (step === "mini_reality_acceptance") {
    return (!!state.currentThought && state.currentThought.trim().length > 0) || (!!state.interpretationText && state.interpretationText.trim().length > 0);
  }
  // Requirement 7: Interpretation's own dedicated acceptance moment --
  // gated only by interpretationText, reachable regardless of whether
  // a thought was also selected (the two are now fully independent
  // sequential branches, "Urge -> Thought -> Interpretation").
  if (step === "interpretation_acceptance") return !!state.interpretationText && state.interpretationText.trim().length > 0;
  // ARCHI -- Full ARC Body Flow Redesign task: "dwelling" is now
  // permanently unreachable, for every mode -- required test 5,
  // "Acceptance Part 1 immediately follows Screen One," with the old
  // data-gated dwell step removed from between them entirely (Part 1's
  // own mantra already covers "attend to and accept the contraction").
  // The step id, its own copy content, and bodyScanContractionRegions
  // itself all stay fully intact (never deleted) -- simply never
  // reached by any session any more; see migrateLegacyNewArcLiveStep
  // below for the one-time forward migration a session saved
  // mid-flight there needs.
  if (step === "dwelling") return false;
  // ARCHI -- Simplify the "פחות טוב" body-flow and remove the separate
  // closure-selection screen task: "באילו אזורים בגוף אתה מרגיש
  // סגירות?" is now permanently unreachable -- the one remaining
  // body-selection screen (body_scan_opening_region, right below) is
  // now driven entirely by the EARLIER contraction selection instead,
  // never asking the trainee to identify closure a second time on a
  // separate screen. The step id, its own getStepContent case, and
  // every setter that touches bodyScanHeavinessRegions all stay fully
  // intact (never deleted) -- simply never reached by any NEW Full ARC
  // session; see migrateLegacyNewArcLiveStep below for the one-time
  // forward migration a session saved mid-flight there needs. Mini ARC
  // never had this step at all; Shortened ARC already skipped it via
  // SHORTENED_ARC_SKIPPED_STEPS -- neither is affected by this change.
  if (step === "body_scan_closedness") return false;
  // ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
  // task: originally reachable exactly when confirmBodyScanClosedness
  // already auto-carried at least one eligible closure region in as
  // "green."
  //
  // ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
  // Logic task: "Green must NOT be automatically preselected" -- there
  // is no longer any auto-carry at all, so this can no longer be gated
  // on openingBodyScanRegions/bodyScanContractionRegions already having
  // something in them. body_scan_opening_region is now simply the ONE
  // remaining body-selection screen for Full ARC, always reachable --
  // "all eligible regions remain tappable regardless of earlier Red
  // selections," so there is nothing left here that could ever make it
  // worth skipping. Checked explicitly against arcInvocationMode here
  // (never added to SHORTENED_ARC_SKIPPED_STEPS -- that set's own
  // "stop_and_accept_urge"/"reality_acceptance" precedent is for steps
  // that already have their own independent data-driven gate; this one
  // no longer does) -- Shortened ARC keeps its own, separate
  // supportive_area_select screen, completely untouched.
  if (step === "body_scan_opening_region") return state.arcInvocationMode !== "shortened";
  // Body Scan Upgrade task, section 5's own "existing mechanism"
  // fallback: once at least one opening region was already chosen
  // above (the new multi-select field, or -- for a session mid-flight
  // from before this task -- the old singular one), asking the
  // trainee to pick ANOTHER supportive region here would be a
  // repeated, redundant question (section 7: "avoid unnecessary
  // question repetition") -- skipped only in that one case. Every
  // pre-existing session (both fields null/empty) reaches this step
  // exactly as it always has.
  // ARCHI -- Unified 7-Part Update task, Part 6.4: for a SHORTENED
  // session this step is now the one, always-reachable "Interactive
  // Body Selection" screen itself (never a redundant re-ask, since
  // shortened never populates openingBodyScanRegions/
  // primaryOpeningBodyScanRegion any other way) -- the existing
  // "already-auto-derived, so skip this fallback" gate below is
  // unchanged for Full/Mini ARC.
  // ARCHI -- Full ARC Body Flow Redesign task: the old Full-ARC
  // fallback clause ("nothing was auto-carried from body_scan_closedness")
  // is gone -- "body_scan_opening_region" (Screen Two) is now always the
  // one Full-ARC mechanism for Blue selection and itself explicitly
  // supports a zero-selection continue ("if no eligible supportive
  // region remains, allow the user to continue without fabricating a
  // selection"), so there is nothing left for this fallback screen to
  // catch for Full/Mini ARC. Shortened ARC's own usage (its one and
  // only body-selection screen) is completely unaffected.
  if (step === "supportive_area_select") {
    return state.arcInvocationMode === "shortened";
  }
  return true;
}

/** The ordinary "move forward" transition -- within-step sub-index first, otherwise the next reachable top-level step. Never used for the two explicit branch points (unpleasant-area yes/no), which have their own dedicated transition functions below since the branch is a user ANSWER, not something this generic function can infer. */
export function resolveNextStep(state: NewArcLiveSessionState): { step: NewArcLiveStepId; subIndex: number } {
  const count = stepSubCount(state.currentStep, state);
  if (state.subIndex + 1 < count) {
    return { step: state.currentStep, subIndex: state.subIndex + 1 };
  }
  const order = resolveStepOrder(state.arcInvocationMode);
  const currentIndex = order.indexOf(state.currentStep);
  for (let i = currentIndex + 1; i < order.length; i++) {
    const candidate = order[i];
    if (isStepReachable(candidate, state)) {
      return { step: candidate, subIndex: 0 };
    }
  }
  return { step: "complete", subIndex: 0 };
}

/** The safe "go back" transition -- symmetric to resolveNextStep, skipping the same unreachable steps. Returns null at the very first step (nothing safe to go back to). */
export function resolvePreviousStep(state: NewArcLiveSessionState): { step: NewArcLiveStepId; subIndex: number } | null {
  if (state.subIndex > 0) {
    return { step: state.currentStep, subIndex: state.subIndex - 1 };
  }
  const order = resolveStepOrder(state.arcInvocationMode);
  const currentIndex = order.indexOf(state.currentStep);
  for (let i = currentIndex - 1; i >= 0; i--) {
    const candidate = order[i];
    if (isStepReachable(candidate, state)) {
      return { step: candidate, subIndex: stepSubCount(candidate, state) - 1 };
    }
  }
  return null;
}

/** Which steps offer an explicit "Skip" action -- "Skip where the step is optional" (the task's own instruction-display requirement), never offered for a required step. Unified ARC & Productivity Update task, requirement 6: "mini_thought" (now Mini ARC's own Thought/Interpretation/Urge chooser) joins this list -- "do not force users to complete all three," including declining all three. */
export function isStepSkippable(step: NewArcLiveStepId): boolean {
  return (
    step === "emotion" ||
    step === "urge" ||
    step === "thought" ||
    step === "interpretation" ||
    step === "desired_ending" ||
    step === "focus_color" ||
    step === "desired_feeling_select" ||
    step === "mini_thought"
  );
}

/** Position within the CURRENT goal-type branch's own reachable sequence, for a simple "step X of Y" progress indicator -- never a raw index into NEW_ARC_LIVE_STEP_ORDER, which would be wrong once unreachable steps are excluded. */
export function resolveProgress(state: NewArcLiveSessionState): { position: number; total: number } {
  let total = 0;
  let position = 0;
  for (const step of resolveStepOrder(state.arcInvocationMode)) {
    if (step === "complete" || !isStepReachable(step, state)) continue;
    const count = stepSubCount(step, state);
    for (let sub = 0; sub < count; sub++) {
      total += 1;
      if (step === state.currentStep && sub === state.subIndex) position = total;
    }
  }
  return { position, total };
}

export function advance(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  const { step, subIndex } = resolveNextStep(state);
  return { ...state, currentStep: step, subIndex, currentStepEnteredAt: now };
}

export function goBack(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  const previous = resolvePreviousStep(state);
  if (!previous) return state;
  return { ...state, currentStep: previous.step, subIndex: previous.subIndex, currentStepEnteredAt: now };
}

export function setGoalType(state: NewArcLiveSessionState, goalType: NewArcLiveGoalType, now: string): NewArcLiveSessionState {
  return advance({ ...state, goalType }, now);
}

/**
 * ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
 * Background task: the "free_breathing" screen's own one action --
 * called identically whether the trainee tapped Continue or Skip
 * (there is no data to decline here, so the two are the same
 * transition). Sets freeBreathingIntroShown true, which is the one
 * field arc/freeBreathingIntro.ts's resolveArcBackgroundColor reads to
 * turn on the persistent pale-blue background from this point
 * forward, for the rest of the session -- "if skipped, the very pale
 * blue background must still be applied."
 */
export function completeFreeBreathingIntro(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return advance({ ...state, freeBreathingIntroShown: true }, now);
}

export function setDesiredEnding(state: NewArcLiveSessionState, desiredEnding: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, desiredEnding: desiredEnding.trim() || null }, now);
}

/**
 * ARC Full Sequence Update task, Part 1 step 4: commits the trainee's
 * own exact chosen feeling (a preset chip tap, or free-typed text) and
 * advances. A blank value is valid -- "desired_feeling_select" is
 * skippable (isStepSkippable above), matching every other optional
 * free-text awareness step's own convention -- and simply leaves
 * desiredFeelingText null, so desired_feeling_locate and the
 * Acceptance/Regulation/Encoding content below never invent a feeling
 * that was never actually chosen.
 */
export function setDesiredFeeling(state: NewArcLiveSessionState, desiredFeelingText: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, desiredFeelingText: desiredFeelingText.trim() || null }, now);
}

/**
 * Part 1 step 5: toggles ONE region's membership in the trainee's own
 * MULTI-select answer to "where do you feel [the chosen feeling] right
 * now" -- never advances on its own, the same convention
 * toggleUnpleasantArea/toggleSupportiveArea already established.
 * Selecting any real region always clears desiredFeelingNotYetPresent
 * (an actually-chosen region directly contradicts "not yet present") --
 * the two are mutually exclusive by construction.
 */
export function toggleDesiredFeelingBodyArea(state: NewArcLiveSessionState, area: BodyRegion): NewArcLiveSessionState {
  const current = state.desiredFeelingBodyAreas;
  const next = current.includes(area) ? current.filter((candidate) => candidate !== area) : [...current, area];
  return { ...state, desiredFeelingBodyAreas: next, desiredFeelingNotYetPresent: next.length > 0 ? false : state.desiredFeelingNotYetPresent };
}

/**
 * The explicit "אני עדיין לא מרגיש את התחושה הזאת" choice -- "never
 * invent/assume a positive sensation the user doesn't actually have."
 * Clears any (previously toggled) regions, since the two are mutually
 * exclusive, and advances immediately, the same single-tap convention
 * declineUnpleasantArea above already uses for its own negative-side
 * "לא, להמשיך" branch.
 */
export function declineDesiredFeelingPresence(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return advance({ ...state, desiredFeelingBodyAreas: [], desiredFeelingBodyAreaCustomLabel: null, desiredFeelingNotYetPresent: true }, now);
}

/**
 * The multi-select screen's own "continue" action -- advances
 * regardless of how many (including zero) regions were toggled on,
 * mirroring confirmUnpleasantAreas/confirmSupportiveAreas exactly. A
 * non-blank custom label implicitly includes "other" even if its chip
 * was never toggled. Continuing with zero regions and no explicit
 * decline leaves desiredFeelingNotYetPresent at whatever it already
 * was (false by default) -- "not yet answered either way," never a
 * false claim of presence, since every downstream reader treats
 * presence as desiredFeelingBodyAreas.length > 0, regardless of this
 * flag's own value.
 */
export function confirmDesiredFeelingLocation(state: NewArcLiveSessionState, customLabel: string, now: string): NewArcLiveSessionState {
  const trimmedLabel = customLabel.trim();
  const areas = trimmedLabel && !state.desiredFeelingBodyAreas.includes("other") ? [...state.desiredFeelingBodyAreas, "other" as BodyRegion] : state.desiredFeelingBodyAreas;
  return advance({ ...state, desiredFeelingBodyAreas: areas, desiredFeelingBodyAreaCustomLabel: trimmedLabel || null }, now);
}

/**
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 2: the shared "cognitive_selector"
 * screen's own "continue" action -- commits all three independent
 * checkbox answers at once (never one at a time, since Continue is a
 * single always-enabled button, requirement 2's own "Continue always
 * enabled" rule) and advances. Checking none of the three is valid and
 * expected ("המשך עם הרגש בלבד") -- it simply leaves every one of
 * "urge"/"thought"/"interpretation" unreachable below, landing the
 * trainee directly on "emotion" (requirement 5's "Emotion-only flow").
 */
export function setCognitiveSelection(
  state: NewArcLiveSessionState,
  selection: { thought: boolean; interpretation: boolean; urge: boolean },
  now: string
): NewArcLiveSessionState {
  return advance(
    {
      ...state,
      selectedCognitiveThought: selection.thought,
      selectedCognitiveInterpretation: selection.interpretation,
      selectedCognitiveUrge: selection.urge,
    },
    now
  );
}

/** Requirement 6: urgeText is now captured on its own dedicated "urge" step (reachable only when selectedCognitiveUrge is true) -- never the old combined "emotion" screen. Blank/null means no urge was actually written despite checking the box, which still correctly skips "stop_and_accept_urge" right after (its own existing, unchanged data-driven gate). */
export function setUrgeText(state: NewArcLiveSessionState, urgeText: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, urgeText: urgeText.trim() || null }, now);
}

/** Urge-stop task, requirement 1 (ADJUSTED by the ARCHI Universal ARC Routing task, requirement 4): captures ONLY the emotion itself now -- urgeText moved to its own dedicated "urge" step above (requirement 6: Urge is asked and accepted BEFORE Emotion Identification, never alongside it any more). Kept exactly as-is for its one remaining call site -- the shared "דלג"/"המשך בלי רגש" skip action, which commits "no emotion" and advances in one tap, same as every other optional step's skip convention. Picking an actual emotion no longer goes through this function -- see setEmotionSelection below. */
export function setEmotion(
  state: NewArcLiveSessionState,
  selectedEmotion: EmotionSelection | null,
  customEmotionText: string | null,
  now: string
): NewArcLiveSessionState {
  return advance({ ...state, selectedEmotion, customEmotionText: selectedEmotion === "other" ? (customEmotionText?.trim() || null) : null }, now);
}

/**
 * ARCHI -- Combined Emotion & Supportive Feeling Selection task, Part
 * 1/2/3 ("show both the current emotion and its suggested supportive
 * counterpart on the SAME screen"): commits the trainee's chosen
 * emotion WITHOUT advancing -- the combined "emotion" screen (Full
 * ARC) and the optional embedded emotion picker (Shortened ARC's
 * "supportive_area_select") both stay on the SAME screen afterward, so
 * the automatic supportive-feeling suggestion (and its one-tap
 * alternatives) can render immediately, right below the emotion
 * chips, with "Continue" a separate, explicit action.
 *
 * Whenever the (selectedEmotion, customEmotionText) pair actually
 * CHANGES to a different value, any existing explicit override is
 * cleared -- "If the user selects a different unpleasant emotion,
 * update the automatic suggestion" -- so the newly (re)computed
 * automatic mapping for the new emotion is what shows next, never a
 * stale override left over from a previous, different emotion.
 * Re-selecting the SAME emotion again (a harmless re-tap) is a no-op
 * for the override, so it is never accidentally wiped out.
 */
export function setEmotionSelection(state: NewArcLiveSessionState, selectedEmotion: EmotionSelection | null, customEmotionText: string | null): NewArcLiveSessionState {
  const normalizedCustomText = selectedEmotion === "other" ? customEmotionText?.trim() || null : null;
  const changed = state.selectedEmotion !== selectedEmotion || state.customEmotionText !== normalizedCustomText;
  return {
    ...state,
    selectedEmotion,
    customEmotionText: normalizedCustomText,
    selectedSupportiveFeeling: changed ? null : state.selectedSupportiveFeeling,
    customSupportiveFeelingText: changed ? null : state.customSupportiveFeelingText,
  };
}

/**
 * ARCHI -- Combined Emotion & Supportive Feeling Selection task, Part
 * 1 ("Allow the trainee to choose a different supportive feeling with
 * one tap"): records an EXPLICIT override -- always one of the
 * complete, known {feeling, quality, mantra} triples listed as an
 * alternative (arc/supportiveFeelingMapping.ts's own
 * listSupportiveFeelingAlternatives), never free-typed -- so it can
 * never be ambiguous or missing a mantra for Encoding to use. Never
 * advances on its own, same "stays on the combined screen" reasoning
 * as setEmotionSelection above. "Never overwrite an explicit user
 * choice with the automatic suggestion": from this point on,
 * resolveEncodingMantra/resolveFinalSupportiveFeeling below read this
 * field FIRST, ahead of the automatic mapping, until the trainee picks
 * a different emotion (which clears it, per setEmotionSelection above)
 * or a different override (which simply replaces it).
 */
export function setSupportiveFeelingOverride(state: NewArcLiveSessionState, feeling: SupportiveFeelingMapping): NewArcLiveSessionState {
  return { ...state, selectedSupportiveFeeling: feeling, customSupportiveFeelingText: null };
}

/**
 * ARCHI -- Three UX Improvements task, Improvement 1 ("Allow custom
 * positive/supportive emotions in ARC"): the free-text counterpart to
 * setSupportiveFeelingOverride above, mirroring the exact "other"
 * convention setEmotionSelection already uses for the main/unpleasant
 * emotion -- trim, and never save a blank/whitespace-only value as a
 * valid selection (the state is simply left untouched, same as every
 * other "trim, discard if empty" setter in this file). mantra is
 * intentionally "" (falsy, never a fabricated sentence) --
 * resolveDesiredFeelingPhrase (arc/newArcLiveCopy.ts) already treats a
 * falsy mantra as "phrase only, no second sentence," so a custom
 * feeling is used for the phrase itself wherever the supportive
 * emotion is referenced, without ever inventing wording the trainee
 * didn't write.
 */
export function setCustomSupportiveFeelingOverride(state: NewArcLiveSessionState, text: string): NewArcLiveSessionState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  return { ...state, selectedSupportiveFeeling: { feeling: trimmed, quality: trimmed, mantra: "" }, customSupportiveFeelingText: trimmed };
}

/**
 * The ONE final supportive-feeling resolution, shared by the combined
 * screens' own UI (to render the preselected/current chip) and by
 * arc/newArcLiveCopy.ts's resolveEncodingMantra (to decide what
 * Encoding actually uses) -- never two separate decisions that could
 * drift apart. Priority: 1) an explicit override, 2) the automatic
 * mapping from the current emotion, 3) null (the caller's own safe
 * fallback -- the generic phrase, or, for a Shortened ARC session that
 * never asked about emotion at all, the body-based mantra).
 */
export function resolveFinalSupportiveFeeling(state: NewArcLiveSessionState): SupportiveFeelingMapping | null {
  return state.selectedSupportiveFeeling ?? resolveSupportiveFeeling(state.selectedEmotion, state.customEmotionText);
}

/**
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 6: captures ONLY currentThought now --
 * interpretation moved to its own dedicated "interpretation" step
 * below (setInterpretation), never merged into this one screen any
 * more. Reachable only when selectedCognitiveThought is true
 * (isStepReachable above); a blank submission here still correctly
 * skips "reality_acceptance" right after (its own existing,
 * unchanged currentThought-driven gate).
 */
export function setThought(state: NewArcLiveSessionState, thought: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, currentThought: thought.trim() || null }, now);
}

/**
 * Requirement 6: captures ONLY interpretationText -- its own dedicated
 * step, reachable only when selectedCognitiveInterpretation is true.
 * A blank submission here still correctly skips the new
 * "interpretation_acceptance" step right after (its own
 * interpretationText-driven gate).
 */
export function setInterpretation(state: NewArcLiveSessionState, interpretation: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, interpretationText: interpretation.trim() || null }, now);
}

/**
 * Three-levels-of-acceptance task, section 2: records which time the
 * written thought concerns and advances -- used by reality_acceptance's
 * own subIndex-0 "ask" screen (Full ARC), where picking an option
 * immediately advances to subIndex 1 (the resolved mantra). Mini ARC's
 * own mini_reality_acceptance screen deliberately does NOT use this
 * advancing setter for its own chip taps (it needs to show the
 * resolved mantra on the SAME screen before advancing) -- see
 * live/NewArcLiveScreen.tsx's own render case for that difference.
 */
export function setThoughtTimeOrientation(state: NewArcLiveSessionState, thoughtTimeOrientation: ThoughtTimeOrientation, now: string): NewArcLiveSessionState {
  return advance({ ...state, thoughtTimeOrientation }, now);
}

export function setFocusObject(state: NewArcLiveSessionState, selectedFocusObject: string | null, now: string): NewArcLiveSessionState {
  return advance({ ...state, selectedFocusObject: selectedFocusObject?.trim() || null }, now);
}

export function setFocusColor(state: NewArcLiveSessionState, selectedFocusColor: string | null, now: string): NewArcLiveSessionState {
  return advance({ ...state, selectedFocusColor: selectedFocusColor?.trim() || null }, now);
}

/** Leaving body_scan always marks "presence" (the look/listen/body-scan block, steps 4-7) complete -- a plain completion flag, never re-derived ambiguously from step position elsewhere. */
export function completePresenceSteps(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return advance({ ...state, presenceStepsCompleted: true }, now);
}

/** The "כן, לבחור אזור" branch -- goes to unpleasant_area_select next (resolveNextStep's generic within-order walk already lands there once unpleasantBodyArea is reachable-gated, but at this exact point in the flow it's still null, so we step there explicitly). */
export function proceedToUnpleasantAreaSelect(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return { ...state, currentStep: "unpleasant_area_select", subIndex: 0, currentStepEnteredAt: now };
}

/** The "לא, להמשיך" branch -- explicitly skips unpleasant_area_select, and clears any previously selected area/sensation (singular AND the multi-select array/custom label) so the state never claims one exists after declining. */
export function declineUnpleasantArea(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return advance({ ...state, unpleasantBodyArea: null, unpleasantSensationDescription: null, unpleasantBodyAreas: [], unpleasantBodyAreaCustomLabel: null }, now);
}

/** The "do the exercise" branch, same shape as proceedToUnpleasantAreaSelect above: commits the real, persisted choice (never a second "did I skip this" flag) and steps directly to the exercise screen, which resolveNextStep's own generic walk wouldn't yet land on at this exact point (selfObservationChoice is only just now being set). */
export function proceedToSelfObservationExercise(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return { ...state, selfObservationChoice: "exercise", currentStep: "self_observation_exercise", subIndex: 0, currentStepEnteredAt: now };
}

/** The "להמשיך הלאה" branch -- commits the choice as "skip" (so the exercise screen stays correctly unreachable if the trainee ever goes back) and advances normally, landing on free_breathing (or whatever is next) via the generic order-walk, same as declineUnpleasantArea above. */
export function declineSelfObservation(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return advance({ ...state, selfObservationChoice: "skip" }, now);
}

/** Legacy single-pick setter, kept unchanged for any other caller (e.g. a saved draft's own single-region prefill) -- now also keeps the multi-select unpleasantBodyAreas array in sync (a single, definitive choice replaces it outright), so a session touched by this setter and then the multi-select screen never disagrees with itself. */
export function setUnpleasantArea(state: NewArcLiveSessionState, area: BodyRegion, sensationDescription: string | null, now: string): NewArcLiveSessionState {
  return advance({ ...state, unpleasantBodyArea: area, unpleasantBodyAreas: [area], unpleasantSensationDescription: sensationDescription?.trim() || null }, now);
}

/**
 * Body region selection correction task: toggles ONE region's
 * membership in the trainee's own MULTI-select unpleasantBodyAreas --
 * never advances on its own, the exact same "multi-select needs an
 * explicit continue" convention toggleSupportiveArea below already
 * established, mirrored here for the negative side. Keeps the legacy
 * singular unpleasantBodyArea in sync as the array's own first entry,
 * so the dwelling/unpleasant_area_select reachability gate (which
 * reads only that singular field) stays correct without any change to
 * isStepReachable itself.
 */
export function toggleUnpleasantArea(state: NewArcLiveSessionState, area: BodyRegion): NewArcLiveSessionState {
  const current = state.unpleasantBodyAreas;
  const next = current.includes(area) ? current.filter((candidate) => candidate !== area) : [...current, area];
  return { ...state, unpleasantBodyAreas: next, unpleasantBodyArea: next[0] ?? null };
}

/**
 * Commits the multi-select unpleasant-area choice (and the sensation
 * description typed alongside it) and advances -- mirrors
 * confirmSupportiveAreas below exactly: a non-blank custom label
 * implicitly includes "other" even if its chip was never toggled, and
 * advancing with ZERO regions chosen is valid ("the option to skip").
 */
export function confirmUnpleasantAreas(state: NewArcLiveSessionState, customLabel: string, sensationDescription: string | null, now: string): NewArcLiveSessionState {
  const trimmedLabel = customLabel.trim();
  const areas = trimmedLabel && !state.unpleasantBodyAreas.includes("other") ? [...state.unpleasantBodyAreas, "other" as BodyRegion] : state.unpleasantBodyAreas;
  return advance(
    {
      ...state,
      unpleasantBodyAreas: areas,
      unpleasantBodyArea: areas[0] ?? null,
      unpleasantBodyAreaCustomLabel: trimmedLabel || null,
      unpleasantSensationDescription: sensationDescription?.trim() || null,
    },
    now
  );
}

/**
 * Body region selection correction task: reverted back to the single
 * primary positive anchor -- this is now the ONLY setter the UI calls
 * for supportive_area_select (toggleSupportiveArea/confirmSupportiveAreas
 * below are kept, unremoved, purely so a session saved while multi-
 * select was active still deserializes; nothing current writes through
 * them). A fresh pick here always overwrites supportiveBodyArea
 * outright -- never additive -- so exactly one region is ever the
 * anchor for acceptance/regulation/encoding from here on.
 */
export function setSupportiveArea(state: NewArcLiveSessionState, area: BodyRegion, now: string): NewArcLiveSessionState {
  return advance({ ...state, supportiveBodyArea: area }, now);
}

/**
 * Body Scan Upgrade task: toggles ONE (region, side) slot between
 * "אין תחושה" and "כיווץ / מתח" -- never advances on its own, the
 * exact same "multi-select needs an explicit continue" convention
 * toggleSupportiveArea/toggleUnpleasantArea above already use. The
 * screen's own "המשך" button advances via the plain, generic
 * advance() -- there is no extra data (no custom label) to attach on
 * continue here, unlike the supportive/unpleasant confirm functions.
 */
export function toggleBodyScanContractionRegion(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  return { ...state, bodyScanContractionRegions: toggleBodyScanContraction(state.bodyScanContractionRegions, region, side) };
}

/**
 * ARCHI -- Full ARC Body Flow Redesign task: Screen One's own combined
 * Red/Green tap handler -- "first tap: RED. Second tap: LIGHT GREEN
 * [only for a movement-eligible region]. Third tap: deselect." Green
 * eligibility is now BOTH "already Red" AND "has predefined movement
 * guidance" (arc/bodyRegionMovements.ts's own isBodyRegionMovementEligible),
 * never just the first alone -- "Green requires predefined anatomically
 * appropriate movement guidance." Never advances on its own, same
 * convention as every other multi-select body-scan toggle here.
 */
export function cycleBodyScanContractionAndGreen(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  const { contractionSelections, openingSelections } = cycleContractionAndGreenOpening(
    state.bodyScanContractionRegions,
    state.openingBodyScanRegions,
    region,
    side,
    isBodyRegionMovementEligible(region)
  );
  return { ...state, bodyScanContractionRegions: contractionSelections, openingBodyScanRegions: openingSelections };
}

/** Legacy combined-screen setter, kept unremoved only for any other caller still referencing the old three/four-way picker -- "none" restores the slot to "אין תחושה". Never advances on its own. Nothing in the current UI calls this any more: body_scan_heaviness/body_scan_closedness now each use their own independent single-bit toggle below. */
export function setBodyScanHeavinessRegion(
  state: NewArcLiveSessionState,
  region: BodyScanRegion,
  side: BodyScanSide,
  value: "none" | BodyScanHeavinessState
): NewArcLiveSessionState {
  return { ...state, bodyScanHeavinessRegions: setBodyScanHeavinessState(state.bodyScanHeavinessRegions, region, side, value) };
}

/**
 * ARC Full Sequence Update task, Part 3: toggles ONLY the heaviness bit
 * of this one (region, side) slot for the FIRST of the two now-separate
 * questions ("באילו אזורים בגוף אתה מרגיש כבדות?") -- whatever
 * closedness bit the slot already held (set via
 * toggleBodyScanClosednessRegion below) is always preserved, never
 * assumed. Never advances on its own, same convention as
 * toggleBodyScanContractionRegion above.
 */
export function toggleBodyScanHeavinessRegion(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  return { ...state, bodyScanHeavinessRegions: toggleBodyScanHeaviness(state.bodyScanHeavinessRegions, region, side) };
}

/** Symmetric to toggleBodyScanHeavinessRegion above, for the SECOND, separate question ("...סגירות?") -- the heaviness bit, if any, is always preserved. */
export function toggleBodyScanClosednessRegion(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  return { ...state, bodyScanHeavinessRegions: toggleBodyScanClosedness(state.bodyScanHeavinessRegions, region, side) };
}

/**
 * ARCHI -- Unified 7-Part Update task, Part 2F/3.2 ("AUTOMATIC
 * SUPPORTIVE FEELING AND BODY MOVEMENTS" -- "reuse every selected
 * region automatically... do not ask users to select the same areas
 * twice"): leaving "body_scan_closedness" via its own "המשך" button now
 * calls THIS setter instead of plain advance() -- it carries every
 * already-identified closure region that is ALSO movement-eligible
 * straight into openingBodyScanRegions, the exact same field/filter
 * (filterMovementEligibleSelections(resolveClosureRegions(state)))
 * isStepReachable("body_scan_opening_region") used to gate the now-
 * removed manual selection screen with, so this can never drift from
 * what that screen used to offer. A region already explicitly present
 * (e.g. a session resumed mid-flight that already had some entries) is
 * never duplicated. Advances exactly like plain advance() right after.
 */
export function confirmBodyScanClosedness(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  // resolveClosureRegions/filterMovementEligibleSelections both return
  // the richer {region, side, state} heaviness shape -- openingBodyScanRegions
  // is the {region, side, role} BodyScanOpeningSelection shape, so each
  // eligible entry is narrowed to exactly those fields before merging,
  // never leaking the heaviness "state" field into a field that was
  // never meant to carry it. ARCHI -- Update ARC Body Sensation
  // Selection: Green and Blue Logic task: every auto-carried entry
  // starts as plain "opening" (green) -- the trainee's own later taps
  // on "body_scan_opening_region" are what promote any of them to
  // "opening_and_supportive" (blue); this auto-carry itself never
  // invents a supportive selection the trainee hasn't actually made.
  //
  // ARCHI -- Precise Body Opening and Stabilization Rules task,
  // section 1: narrowed from "every movement-eligible closure region"
  // to resolveLightGreenEligibleClosureRegions -- a closure region that
  // was never ALSO marked contracted no longer auto-carries as Light
  // Green at all (it is still fully reachable on body_scan_opening_region
  // itself, now via isStepReachable's own widened pool below, just
  // never pre-selected -- the trainee can still explicitly promote it
  // straight to Dark Blue there).
  const eligible = resolveLightGreenEligibleClosureRegions(state).map(({ region, side }) => ({ region, side, role: "opening" as const }));
  const existing = state.openingBodyScanRegions;
  const merged = [...existing, ...eligible.filter((entry) => !existing.some((e) => e.region === entry.region && e.side === entry.side))];
  return advance({ ...state, openingBodyScanRegions: merged }, now);
}

/**
 * Final ARC Flow & Body Animation task: the trainee's own "closure"
 * regions -- i.e. bodyScanHeavinessRegions entries actually marked
 * closedness (the "Identify Closure" question), regardless of whether
 * that same region is ALSO marked heavy. The one shared filter both
 * isStepReachable("body_scan_opening_region") above and
 * live/components/ArcBodyMantraCircle.tsx's own closure-coloring read,
 * so the two can never drift apart.
 */
export function resolveClosureRegions(state: NewArcLiveSessionState): BodyScanHeavinessSelection[] {
  return state.bodyScanHeavinessRegions.filter((entry) => entry.state === "closedness" || entry.state === "heaviness_and_closedness");
}

/**
 * ARCHI -- Precise Body Opening and Stabilization Rules task, section
 * 1: Light Green requires BOTH conditions -- "do not classify a region
 * as Light Green merely because it is closed, heavy, unstable, or
 * contracted alone." The movement-eligible closure pool
 * (filterMovementEligibleSelections(resolveClosureRegions(state)))
 * already restricts to CLOSED regions; this narrows that SAME pool one
 * step further to the ones ALSO present in bodyScanContractionRegions
 * -- the one shared definition confirmBodyScanClosedness's own auto-
 * carry below and migrateLegacyNewArcLiveStep's matching inline carry
 * both read, so "contracted AND closed" can never drift into two
 * independently-maintained checks.
 */
function resolveLightGreenEligibleClosureRegions(state: NewArcLiveSessionState): BodyScanHeavinessSelection[] {
  return filterMovementEligibleSelections(resolveClosureRegions(state)).filter(
    (entry) => resolveBodyScanContractionState(state.bodyScanContractionRegions, entry.region, entry.side) === "contraction"
  );
}

/**
 * Section 5: the trainee's own single pick, from the regions already
 * marked heavy/closed, for gradual opening -- a fresh pick always
 * overwrites outright (never additive), mirroring setSupportiveArea's
 * own "exactly one anchor" contract above. Advances immediately, same
 * single-pick-and-advance pattern.
 */
export function setPrimaryOpeningBodyScanRegion(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide, now: string): NewArcLiveSessionState {
  return advance({ ...state, primaryOpeningBodyScanRegion: region, primaryOpeningBodyScanSide: side }, now);
}

/**
 * Final ARC Flow & Body Animation task, "Select Opening Regions",
 * extended by the ARCHI -- Update ARC Body Sensation Selection: Green
 * and Blue Logic task (main objective + section 3's own exact tap
 * sequence): cycles ONE (region, side) slot through none -> green
 * ("opening") -> blue ("opening_and_supportive") -> none again, via
 * arc/bodyScanSelection.ts's own cycleBodyScanOpeningRole -- never a
 * second, duplicated cycle implementation. Never advances on its own,
 * the exact same "multi-select needs an explicit continue" convention
 * toggleBodyScanContractionRegion above already uses. The third tap
 * (back to "none") IS this slot's own "obvious way to deselect/reset"
 * (section 3) -- never a separate reset control this codebase has no
 * precedent for.
 *
 * ARCHI -- Precise Body Opening and Stabilization Rules task, section
 * 1: that is now the cycle ONLY for a region ALSO marked contracted
 * (see this function's own isGreenEligible computation below) -- a
 * region that is closed but never contracted skips straight from
 * "none" to "opening_and_supportive" (blue), a 2-state cycle, since it
 * can never qualify as Light Green. Section 2's maximum-two-Blue limit
 * is enforced by cycleBodyScanOpeningRole itself, not here.
 */
export function toggleOpeningBodyScanRegion(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  // ARCHI -- Precise Body Opening and Stabilization Rules task,
  // section 1: Light Green is reachable only for a region that is
  // ALSO contracted (bodyScanContractionRegions) -- the pool this
  // screen offers is already closed/movement-eligible (see
  // isStepReachable's own gate), so checking contraction here is the
  // one remaining half of "contracted AND closed." Always false for
  // Shortened ARC (bodyScanContractionRegions is always empty there --
  // "do not add contraction selection"), so that pathway's own taps
  // structurally skip straight to Dark Blue, never Light Green.
  const isGreenEligible = resolveBodyScanContractionState(state.bodyScanContractionRegions, region, side) === "contraction";
  return { ...state, openingBodyScanRegions: cycleBodyScanOpeningRole(state.openingBodyScanRegions, region, side, isGreenEligible) };
}

/**
 * ARCHI -- Full ARC Body Flow Redesign task: Screen Two's own Blue-ONLY
 * tap handler -- "every region selected Red or Green on Screen One is
 * forbidden from becoming Blue... enforce exclusion in the engine AND
 * the UI." cycleSupportiveOnlyOpening itself is the absolute,
 * engine-level half of that rule (it silently refuses any region
 * already present in bodyScanContractionRegions, regardless of what the
 * UI passes); the UI's own selectableRegions filter is the second,
 * visual half. Never advances on its own, same convention as
 * toggleOpeningBodyScanRegion above.
 */
export function toggleSupportiveOpeningRegion(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  return { ...state, openingBodyScanRegions: cycleSupportiveOnlyOpening(state.bodyScanContractionRegions, state.openingBodyScanRegions, region, side) };
}

/**
 * ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
 * Highlighting task, section 4: Screen Two's own real setter, now
 * routed through cycleSupportiveOnlyOpeningBilateral (arc/bodyRegionMovements.ts)
 * so a genuine symmetric pair (e.g. both hands) is selected and
 * deselected TOGETHER, counted as ONE logical Blue selection -- "the
 * user does not need to tap the second hand." A midline (non-paired)
 * region behaves exactly as toggleSupportiveOpeningRegion above
 * always has. Shortened ARC's own supportive_area_select screen keeps
 * calling the ORIGINAL, unilateral toggleSupportiveOpeningRegion above
 * -- this new bilateral setter is wired only into Full ARC's own
 * Screen Two render case, so Shortened ARC's behavior is completely
 * unaffected by this task.
 */
export function toggleSupportiveOpeningRegionBilateral(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  return { ...state, openingBodyScanRegions: cycleSupportiveOnlyOpeningBilateral(state.bodyScanContractionRegions, state.openingBodyScanRegions, region, side) };
}

/**
 * ARCHI -- Fix Mini ARC Interactive Body Selection and Three-Tap Color
 * Model task, section 3: Mini ARC's own body-selection screen
 * ("mini_acceptance_transition" subIndex 0) has no separate contraction/
 * closedness/opening steps of its own to walk through first (unlike
 * Full ARC) -- so ONE tap on ONE (region, side) slot there must drive
 * all three underlying fields at once, in this strict linear order:
 * "none" -> RED (contraction only) -> LIGHT GREEN (contraction AND
 * closedness, plus opening role "opening") -> DARK BLUE (opening role
 * "opening_and_supportive") -> "none" again. This NEVER reuses Full
 * ARC's own isGreenEligible-branching cycle (toggleOpeningBodyScanRegion
 * above) -- that function only ever cycles the opening-role field by
 * itself and assumes contraction/closedness were already decided on
 * EARLIER, separate screens; Mini ARC's single screen must decide all
 * three together, tap by tap, which is exactly what this phase-based
 * cycle does. The underlying session fields it reads and writes
 * (bodyScanContractionRegions, bodyScanHeavinessRegions,
 * openingBodyScanRegions) are the EXACT same ones every other ARC
 * pathway already uses -- so Acceptance-stage rendering, the post-
 * Acceptance "contraction stays red, Light Green disappears" rule, and
 * Encoding's own supportive-spreading animation all apply to a Mini ARC
 * selection with zero extra plumbing.
 */
export type MiniBodyScanTapPhase = "none" | "red" | "lightGreen" | "darkBlue";

/**
 * The combined phase this ONE (region, side) slot currently shows, read
 * back from the three real fields above -- never a fourth, separately-
 * stored "phase" field of its own that could drift out of sync with
 * them. "darkBlue" and "lightGreen" are both read off the SAME
 * openingBodyScanRegions role already used by every other ARC pathway
 * (role "opening_and_supportive" / "opening" respectively); "red" is a
 * region marked contracted that has not yet reached either opening
 * role.
 */
export function resolveMiniBodyScanTapPhase(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): MiniBodyScanTapPhase {
  const role = resolveBodyScanOpeningRole(state.openingBodyScanRegions, region, side);
  if (role === "opening_and_supportive") return "darkBlue";
  if (role === "opening") return "lightGreen";
  return resolveBodyScanContractionState(state.bodyScanContractionRegions, region, side) === "contraction" ? "red" : "none";
}

/**
 * Advances ONE (region, side) slot exactly one step along the four-
 * phase cycle above. The "lightGreen" -> "darkBlue" transition respects
 * the EXACT same maximum-two-Blue limit (canPromoteToSupportiveOpening,
 * arc/bodyScanSelection.ts) every other opening-role cycle already
 * enforces -- a blocked attempt returns `state` completely unchanged,
 * the same "silent, state-management-level refusal" contract
 * cycleBodyScanOpeningRole itself uses, never a second, independently-
 * reimplemented limit. The live screen runs the same check BEFORE
 * calling this (attemptCycleMiniBodyScanRegion, live/NewArcLiveScreen.tsx)
 * purely to decide whether to surface the friendly Hebrew message --
 * this function's own refusal is what actually, always prevents a third
 * Blue region, regardless of whether that UI pre-check ever ran.
 */
export function cycleMiniBodyScanRegion(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  const phase = resolveMiniBodyScanTapPhase(state, region, side);
  switch (phase) {
    case "none":
      return { ...state, bodyScanContractionRegions: toggleBodyScanContraction(state.bodyScanContractionRegions, region, side) };
    case "red":
      return {
        ...state,
        bodyScanHeavinessRegions: toggleBodyScanClosedness(state.bodyScanHeavinessRegions, region, side),
        openingBodyScanRegions: setBodyScanOpeningRole(state.openingBodyScanRegions, region, side, "opening"),
      };
    case "lightGreen": {
      if (!canPromoteToSupportiveOpening(state.openingBodyScanRegions, region, side)) return state;
      return { ...state, openingBodyScanRegions: setBodyScanOpeningRole(state.openingBodyScanRegions, region, side, "opening_and_supportive") };
    }
    case "darkBlue":
      return {
        ...state,
        bodyScanContractionRegions: toggleBodyScanContraction(state.bodyScanContractionRegions, region, side),
        bodyScanHeavinessRegions: toggleBodyScanClosedness(state.bodyScanHeavinessRegions, region, side),
        openingBodyScanRegions: setBodyScanOpeningRole(state.openingBodyScanRegions, region, side, "none"),
      };
  }
}

/** The multi-select opening-region screen's own "continue" action -- advances regardless of how many (including zero) regions were toggled on ("provide a valid continuation without fabricating selections"). */
export function confirmOpeningBodyScanRegions(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return advance(state, now);
}

/**
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * "short_body_marking"'s own ONE-screen RED/BLUE cycle for "פחות טוב"
 * short depth -- modeled directly on cycleMiniBodyScanRegion above, but
 * with its middle "lightGreen" phase removed (the spec names only two
 * colors for this screen: contracted = red, supportive-but-closed/
 * unstable = blue). Writes into the EXACT same two existing fields
 * cycleMiniBodyScanRegion already does (bodyScanContractionRegions,
 * openingBodyScanRegions role "opening_and_supportive") -- no new
 * fields, so every downstream reader (Encoding's own supportive-
 * spreading animation and mantra, resolveMovementInstructionsForStage,
 * etc.) already works correctly with zero further wiring. Respects the
 * same max-2-Blue limit (canPromoteToSupportiveOpening) every other
 * opening-role cycle in this file enforces, for consistency with every
 * other body-selection screen.
 */
export type ShortBodyMarkingPhase = "none" | "red" | "blue";

export function resolveShortBodyMarkingPhase(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): ShortBodyMarkingPhase {
  if (resolveBodyScanOpeningRole(state.openingBodyScanRegions, region, side) === "opening_and_supportive") return "blue";
  return resolveBodyScanContractionState(state.bodyScanContractionRegions, region, side) === "contraction" ? "red" : "none";
}

export function cycleShortBodyMarking(state: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState {
  const phase = resolveShortBodyMarkingPhase(state, region, side);
  switch (phase) {
    case "none":
      return { ...state, bodyScanContractionRegions: toggleBodyScanContraction(state.bodyScanContractionRegions, region, side) };
    case "red": {
      if (!canPromoteToSupportiveOpening(state.openingBodyScanRegions, region, side)) return state;
      return {
        ...state,
        bodyScanContractionRegions: toggleBodyScanContraction(state.bodyScanContractionRegions, region, side),
        openingBodyScanRegions: setBodyScanOpeningRole(state.openingBodyScanRegions, region, side, "opening_and_supportive"),
      };
    }
    case "blue":
      return { ...state, openingBodyScanRegions: setBodyScanOpeningRole(state.openingBodyScanRegions, region, side, "none") };
  }
}

/**
 * Physical questionnaire placement task: toggles ONE region's
 * membership in the trainee's own MULTI-select supportiveBodyAreas --
 * never advances on its own (multi-select needs an explicit "continue"
 * the trainee presses once satisfied, unlike setSupportiveArea's
 * single-pick-and-advance above, kept unchanged for any other caller).
 * Keeps the legacy singular supportiveBodyArea in sync as the array's
 * own first entry, so every existing reader of that field stays
 * correct for a session using this new multi-select path too.
 */
export function toggleSupportiveArea(state: NewArcLiveSessionState, area: BodyRegion): NewArcLiveSessionState {
  const current = state.supportiveBodyAreas;
  const next = current.includes(area) ? current.filter((candidate) => candidate !== area) : [...current, area];
  return { ...state, supportiveBodyAreas: next, supportiveBodyArea: next[0] ?? null };
}

/**
 * The multi-select area step's own "continue" action -- advances
 * regardless of how many (including zero) regions were toggled on
 * (spec: "אפשרות להמשיך ללא בחירה"). `customLabel` is the trainee's own
 * typed "אזור גוף אחר" text, if any; a non-blank label implicitly
 * includes "other" in the final set even if its chip was never
 * explicitly tapped, since typing a custom area IS choosing one.
 */
export function confirmSupportiveAreas(state: NewArcLiveSessionState, customLabel: string, now: string): NewArcLiveSessionState {
  const trimmedLabel = customLabel.trim();
  const areas = trimmedLabel && !state.supportiveBodyAreas.includes("other") ? [...state.supportiveBodyAreas, "other" as BodyRegion] : state.supportiveBodyAreas;
  return advance(
    { ...state, supportiveBodyAreas: areas, supportiveBodyArea: areas[0] ?? null, supportiveBodyAreaCustomLabel: trimmedLabel || null },
    now
  );
}

export function setSupportiveSensation(state: NewArcLiveSessionState, sensation: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, supportiveSensation: sensation.trim() || null }, now);
}

export function setPositiveMovement(state: NewArcLiveSessionState, movement: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, positiveMovement: movement.trim() || null }, now);
}

/**
 * ARCHI -- Unified Final Specification task, section 2 ("Action
 * Selection must occur immediately AFTER Regulation and BEFORE
 * Encoding"): the "action_selection"/"mini_action_selection" step's one
 * action -- called once, with exactly one of the two option shapes
 * below, then advancing straight into Encoding.
 *
 * - `{ source: "scheduledTask", taskId, title, firstAction }` for an
 *   explicitly-selected scheduled task, whether it is due now or being
 *   started early (both are "an existing scheduled task," resolved
 *   identically by taskId -- the spec's own priorities (2) and (4));
 *   `firstAction` is that task's own saved first action, or null when
 *   it has none.
 * - `{ source: "temporaryAction", title, durationMinutes }` for a
 *   brand-new temporary action entered now (priority (3)); durationMinutes
 *   is the trainee's own requested length, already clamped by the
 *   caller against the time remaining until the next scheduled task
 *   (see live/NewArcLiveScreen.tsx) -- this setter itself does no
 *   clamping, since it is pure state, never an IO/clock lookup.
 *
 * Never called at all when the trainee instead types a brand-new action
 * with no suitable scheduled task available (priority (5)) -- that case
 * simply reuses the session's own pre-existing `firstAction` field
 * exactly as every session already does, leaving selectedActionSource
 * null and resolveActionText's own final fallback (arc/newArcLiveCopy.ts)
 * to read it back.
 */
export function setSelectedAction(
  state: NewArcLiveSessionState,
  selection: { source: "scheduledTask"; taskId: string; title: string; firstAction: string | null } | { source: "temporaryAction"; title: string; durationMinutes: number },
  now: string
): NewArcLiveSessionState {
  if (selection.source === "scheduledTask") {
    return advance(
      {
        ...state,
        selectedActionSource: "scheduledTask",
        selectedActionTaskId: selection.taskId,
        selectedActionTitle: selection.title,
        selectedActionFirstAction: selection.firstAction,
        selectedActionDurationMinutes: null,
      },
      now
    );
  }
  return advance(
    {
      ...state,
      selectedActionSource: "temporaryAction",
      selectedActionTaskId: null,
      selectedActionTitle: selection.title,
      selectedActionFirstAction: null,
      selectedActionDurationMinutes: selection.durationMinutes,
    },
    now
  );
}

/**
 * ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task: the
 * step's own single "confirm both ratings" action -- both 0-10 answers
 * are committed together, THEN the routing decision is computed once
 * and never revisited, matching "after confirming both ratings, the
 * system automatically selects the continuation path."
 *
 * Rule (boundary cases at exactly 5 go to "continue" for the
 * unpleasant-intensity side, and to "shortened" -- never
 * "direct_action" -- for the readiness side, per the spec's own
 * "מתחת ל-5" (strictly below 5) / "ומטה" (5 and below) / "ומעלה" (5
 * and above) wording):
 *   unpleasant < 5 AND readiness > 5  -> "direct_action"
 *   unpleasant < 5 AND readiness <= 5 -> "shortened"
 *   unpleasant >= 5 (any readiness)   -> "continue"
 *
 * "shortened" mutates arcInvocationMode to "shortened" IN PLACE, same
 * session, no new ARC -- the ordinary advance()/resolveNextStep right
 * below then walks forward from "action_readiness_check" under
 * Shortened ARC's own existing reachability rules (resolveStepOrder
 * switches to NEW_ARC_LIVE_STEP_ORDER for any mode other than
 * "plannedMini", so this works identically whether the session started
 * as Full ARC or Mini ARC), landing on "natural_breathing" --
 * Shortened ARC's own one Presence screen -- without ever repeating a
 * step already shown or asking about mood again (mini_awareness/
 * emotion already ran, under the ORIGINAL mode, before this call).
 *
 * "direct_action" sets no extra field beyond actionReadinessOutcome
 * itself -- isStepReachable's own DIRECT_ACTION_SKIPPED_STEPS/
 * action_selection rules (arc/newArcLiveSteps.ts, same file) do the
 * rest, purely from that one outcome value, the next time
 * resolveNextStep scans forward (right here, via advance()).
 *
 * "continue" changes nothing beyond the two ratings -- the ordinary
 * advance() proceeds exactly as it already would without this feature,
 * Full ARC to "natural_breathing," Mini ARC to "mini_presence."
 *
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * a THIRD 0-10 rating -- "כמה זמן פנוי יש לך לתרגול כרגע?" -- is now
 * captured on this SAME screen, computing arcPracticeDepth purely from
 * it: "short" for 1-5, "full" for 6-10. This is deliberately NEVER
 * computed for a "direct_action" outcome ("ללא תלות בדירוג הזמן" --
 * time is irrelevant there, since no further ARC screens of any kind
 * follow) -- stays null, matching every pre-existing session. The
 * outcome formula itself (unpleasant/readiness -> direct_action/
 * shortened/continue) is completely UNCHANGED by this addition; depth
 * is a strictly orthogonal decision layered on top of it.
 */
export function confirmActionReadinessCheck(
  state: NewArcLiveSessionState,
  unpleasantIntensityRating: number,
  actionReadinessRating: number,
  timeAvailableRating: number,
  now: string
): NewArcLiveSessionState {
  const clampedUnpleasant = Math.max(0, Math.min(10, Math.round(unpleasantIntensityRating)));
  const clampedReadiness = Math.max(0, Math.min(10, Math.round(actionReadinessRating)));
  const clampedTime = Math.max(0, Math.min(10, Math.round(timeAvailableRating)));
  const outcome: NewArcLiveSessionState["actionReadinessOutcome"] = clampedUnpleasant < 5 ? (clampedReadiness > 5 ? "direct_action" : "shortened") : "continue";
  const depth: NewArcLiveSessionState["arcPracticeDepth"] = outcome === "direct_action" ? null : clampedTime >= 6 ? "full" : "short";
  return advance(
    {
      ...state,
      unpleasantIntensityRating: clampedUnpleasant,
      actionReadinessRating: clampedReadiness,
      actionReadinessOutcome: outcome,
      timeAvailableRating: clampedTime,
      arcPracticeDepth: depth,
      arcInvocationMode: outcome === "shortened" ? "shortened" : state.arcInvocationMode,
    },
    now
  );
}

/**
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * "סבבה" (shortened)'s own standalone equivalent of the third rating
 * above -- it has no unpleasant/readiness ratings at all, so no
 * actionReadinessOutcome is ever computed here, only the depth. Same
 * clamp + "short" for 1-5 / "full" for 6-10 rule as above.
 */
export function confirmTimeAvailableRating(state: NewArcLiveSessionState, timeAvailableRating: number, now: string): NewArcLiveSessionState {
  const clampedTime = Math.max(0, Math.min(10, Math.round(timeAvailableRating)));
  return advance({ ...state, timeAvailableRating: clampedTime, arcPracticeDepth: clampedTime >= 6 ? "full" : "short" }, now);
}

/** Part A: records the emotional action actually performed (preset label or free text) -- only ever called while on the "emotional_action" step, which is itself unreachable for the Task track. */
export function setEmotionalAction(state: NewArcLiveSessionState, emotionalActionText: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, emotionalActionText: emotionalActionText.trim() || null }, now);
}

/**
 * Part A/B.3/E: records "מה התובנה שלמדת על עצמך?" and an OPTIONAL
 * belief formulated from it -- a blank belief is valid and means
 * "insight saved, no belief formulated yet" (never forced). Persisting
 * the actual ArcInsight/ArcBelief records is the screen's job (IO,
 * never this pure state), triggered once this reaches "complete".
 */
export function setEmotionalInsight(state: NewArcLiveSessionState, insightText: string, beliefText: string | null, now: string): NewArcLiveSessionState {
  return advance({ ...state, emotionalInsightText: insightText.trim() || null, emotionalBeliefText: beliefText?.trim() || null }, now);
}

/**
 * Part G, step 1 (מודעות): one combined screen -- emotion + outcome/
 * value (only when task-linked, decided by the copy layer from
 * goalType, never a second field here). Unified ARC & Productivity
 * Update task, requirement 6: the optional urgeText capture that used
 * to live here is GONE -- "Urge" is now one of the three choices on
 * the dedicated "mini_thought" chooser right after this screen
 * (setMiniThought below), never captured twice.
 *
 * ARCHI -- Combined Emotion & Supportive Feeling Selection task, Part
 * 2 ("MINI ARC -- SAME COMBINED SELECTION"): now also takes the
 * trainee's own optional supportive-feeling OVERRIDE, committed
 * atomically with the emotion itself in this SAME single screen/single
 * "Continue" tap -- "do not add a separate supportive-feeling
 * selection step." Pass null when the trainee left the automatic
 * suggestion as-is (or chose no emotion at all).
 */
export function setMiniAwareness(
  state: NewArcLiveSessionState,
  selectedEmotion: EmotionSelection | null,
  customEmotionText: string | null,
  desiredEnding: string | null,
  selectedSupportiveFeeling: SupportiveFeelingMapping | null,
  now: string,
  // ARCHI -- Three UX Improvements task, Improvement 1: the custom
  // supportive-feeling text, committed atomically with everything else
  // on this ONE combined screen's single "Continue" tap -- same
  // "nothing written until Continue" convention this whole screen
  // already follows. Defaults to null so every pre-existing call site
  // (which never passed this 7th argument at all) is unaffected.
  customSupportiveFeelingText: string | null = null
): NewArcLiveSessionState {
  return advance(
    {
      ...state,
      selectedEmotion,
      customEmotionText: selectedEmotion === "other" ? (customEmotionText?.trim() || null) : null,
      desiredEnding: desiredEnding?.trim() || null,
      selectedSupportiveFeeling,
      customSupportiveFeelingText: customSupportiveFeelingText?.trim() || null,
    },
    now
  );
}

/**
 * Unified ARC & Productivity Update task, requirement 6 ("MINI ARC VS.
 * SHORTENED ARC"): Mini ARC's own distinctive opening -- "an optional
 * brief awareness choice: Thought / Interpretation / Urge... apply the
 * matching short acceptance protocol... do not force users to
 * complete all three." `category` picks AT MOST ONE of the three
 * fields to set from `text`; the other two are left completely
 * UNTOUCHED (never cleared) -- for an ordinary session they are
 * already null, so exactly one ends up set; for a session prefilled
 * from a saved PlannedArc this never destroys data the plan already
 * provided in a field the trainee didn't touch here. `category: null`
 * (declining all three, via the shared skip mechanism) sets nothing
 * at all. mini_stop_accept_urge/mini_reality_acceptance right after
 * this step are UNCHANGED -- they already gate on urgeText/
 * currentThought/interpretationText being set, whichever single one
 * this screen just set.
 */
export function setMiniThought(
  state: NewArcLiveSessionState,
  category: "thought" | "interpretation" | "urge" | null,
  text: string,
  now: string
): NewArcLiveSessionState {
  const trimmed = text.trim() || null;
  const patch: Partial<NewArcLiveSessionState> =
    category === "thought" ? { currentThought: trimmed } : category === "interpretation" ? { interpretationText: trimmed } : category === "urge" ? { urgeText: trimmed } : {};
  return advance({ ...state, ...patch }, now);
}

/**
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 2/3B ("Mini ARC at entry with short
 * personalized branches"): Mini ARC's own upgrade of "mini_thought"
 * from a single-category chooser to the SAME shared cognitive-selector
 * semantics as Full ARC's "cognitive_selector" -- independent
 * checkboxes for Thought/Interpretation/Urge, any combination, all
 * captured on this ONE combined screen (never split into three
 * separate screens, preserving Mini ARC's own brevity design). Setting
 * `category: null` in setMiniThought above is now dead for the current
 * UI but kept, unremoved, for any other caller. selectedCognitive*
 * flags are set here too (mirroring Full ARC's setCognitiveSelection),
 * purely so goBack from mini_stop_accept_urge/mini_reality_acceptance
 * finds this screen's own checkbox state correctly reflected if
 * revisited -- the three real text fields (never the flags alone)
 * still decide mini_stop_accept_urge/mini_reality_acceptance's own
 * reachability, unchanged.
 */
export function setMiniCognitiveSelection(
  state: NewArcLiveSessionState,
  selection: { thought: boolean; interpretation: boolean; urge: boolean },
  texts: { thought: string; interpretation: string; urge: string },
  now: string
): NewArcLiveSessionState {
  return advance(
    {
      ...state,
      selectedCognitiveThought: selection.thought,
      selectedCognitiveInterpretation: selection.interpretation,
      selectedCognitiveUrge: selection.urge,
      currentThought: selection.thought ? texts.thought.trim() || null : null,
      interpretationText: selection.interpretation ? texts.interpretation.trim() || null : null,
      urgeText: selection.urge ? texts.urge.trim() || null : null,
    },
    now
  );
}

/**
 * Part G, step 3 (קבלה ומעבר): the supportive area/sensation/movement
 * continuity trio, all on one screen -- the same three fields Full ARC
 * spreads across three separate screens, intentionally combined here
 * for Mini ARC's own brevity.
 *
 * ARCHI -- Fix Mini ARC Interactive Body Selection and Three-Tap Color
 * Model task, section 2: `area` is now nullable -- this screen's own
 * separate anatomical-name chip picker (which used to supply it) is
 * removed, in favor of selecting regions directly on the interactive
 * body silhouette (bodyScanContractionRegions/openingBodyScanRegions,
 * via cycleMiniBodyScanRegion above -- the real, granular data Encoding
 * and the Acceptance-stage rendering actually read). `area` only ever
 * fed one optional label clause into the Acceptance mantra
 * (resolveSupportiveSensationLabel, arc/newArcLiveCopy.ts), which
 * already returns "" when it is null -- the exact same graceful
 * fallback a Shortened ARC session (which never set this field either)
 * already relies on, so no mantra ever breaks or shows a stale value.
 */
export function setMiniAcceptanceTransition(state: NewArcLiveSessionState, area: BodyRegion | null, sensation: string, movement: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, supportiveBodyArea: area, supportiveSensation: sensation.trim() || null, positiveMovement: movement.trim() || null }, now);
}

/**
 * Part F step 7 item 4-5 / Part G step 4: an optional personal mantra
 * and an optional belief-to-practice, both folded into one combined
 * sub-step -- neither is required (spec: "המנטרה והאמונה הן
 * אופציונליות"). Despite the name, this is now shared by BOTH Full
 * ARC's own "encoding" step (its own extra, non-dwelling sub-step) and
 * Mini ARC's "mini_encoding" step -- one mechanism, never a second,
 * duplicated setter for the same two fields.
 */
export function setMiniEncoding(state: NewArcLiveSessionState, mantraText: string, beliefText: string, now: string): NewArcLiveSessionState {
  return advance({ ...state, miniMantraText: mantraText.trim() || null, miniBeliefText: beliefText.trim() || null }, now);
}

export function completeSession(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  return { ...state, currentStep: "complete", subIndex: 0, currentStepEnteredAt: now, completedAt: now };
}

/** The saved fields a PlannedArc contributes when starting a live run from it -- a plain subset, never the whole PlannedArc shape (arc/plannedArc.ts stays the one owner of that type; this module only needs these). */
export interface PlannedArcPrefillFields {
  goalType: NewArcLiveGoalType;
  triggerText: string | null;
  supportiveBodyArea: BodyRegion | null;
  supportiveSensation: string | null;
  positiveMovement: string | null;
  mantraText: string | null;
  beliefText: string | null;
  /**
   * Urge-stop task, requirement 5/6: unlike supportiveBodyArea/
   * Sensation/Movement, this is NOT added to the `skip` set below --
   * urge, like emotion and thought, is what's happening RIGHT NOW, so
   * it must still be answered live every session, never silently
   * skipped from an old draft. It's only prefilled as the "emotion"
   * screen's own starting draft value (live/NewArcLiveScreen.tsx's
   * per-step-entry effect, same precedent as miniMantraText/
   * miniBeliefText below), so a still-relevant urge doesn't have to be
   * retyped, but the trainee can freely clear or change it.
   */
  urgeText: string | null;
  /**
   * Three-levels-of-acceptance task, section 7: the thought text and its
   * time classification transfer from a spontaneous ARC to the planned
   * ARC it generates, if present -- and like urgeText above, NEVER added
   * to the `skip` set below. A thought, like urge and emotion, is
   * "what's happening right now," so it stays re-askable every session;
   * it's only prefilled as the "thought" step's own starting draft (same
   * precedent as urgeDraft in live/NewArcLiveScreen.tsx). Section 7 also
   * requires these to be editable in the planned exercise itself --
   * handled separately in build/PlannedArcEditorScreen.tsx, not here.
   */
  thoughtText: string | null;
  thoughtTimeOrientation: ThoughtTimeOrientation | null;
  /** Unified awareness/urge/thought/interpretation update, section 7: the originating session's own interpretationText, if present -- same "never added to the skip set, re-askable every session" precedent as thoughtText above. */
  interpretationText: string | null;
}

/**
 * ARC-system upgrade task, Part 5 ("שימוש עתידי ב-ARC מתוכנן"): builds a
 * session pre-filled from a saved PlannedArc's own fields, positioned
 * at the first step that still needs the trainee's own LIVE input --
 * never re-asking for the track or the supportive area/sensation/
 * movement trio the draft already provides, and never inventing
 * anything the draft doesn't have (a field left null here is simply
 * asked normally, exactly like any ordinary session).
 *
 * This fast-forward is deliberately isolated to this one function --
 * isStepReachable itself is untouched, so every ORDINARY session (which
 * always starts with every one of these fields null) keeps walking
 * goal_select -> ... -> supportive_movement_select exactly as before,
 * with zero behavior change and zero added branches in the shared
 * reachability logic.
 */
export function createSessionFromPlannedArcFields(
  taskId: string,
  taskTitle: string,
  firstAction: string,
  now: string,
  mode: ArcInvocationMode,
  fields: PlannedArcPrefillFields,
  sourcePlannedArcId: string
): NewArcLiveSessionState {
  const state: NewArcLiveSessionState = {
    ...createNewArcLiveSessionState(taskId, taskTitle, firstAction, now, mode, sourcePlannedArcId),
    goalType: fields.goalType,
    triggerText: fields.triggerText,
    supportiveBodyArea: fields.supportiveBodyArea,
    // ARC LIVE emotion-based body suggestions task, section 9: PlannedArc
    // itself only ever stores ONE supportive region (arc/plannedArc.ts's
    // own PlannedArc.supportiveBodyArea) -- a real, reported compatibility
    // gap against this session's own multi-select supportiveBodyAreas
    // (see this task's final report). This keeps the array in sync with
    // whatever single region the plan DOES provide, so a trainee who
    // navigates back to "supportive_area_select" on a plan-prefilled
    // session (that step is normally skipped below, but goBack can still
    // reach it) sees that one region already highlighted, rather than an
    // array silently empty despite supportiveBodyArea being set.
    supportiveBodyAreas: fields.supportiveBodyArea ? [fields.supportiveBodyArea] : [],
    supportiveSensation: fields.supportiveSensation,
    positiveMovement: fields.positiveMovement,
    miniMantraText: fields.mantraText,
    miniBeliefText: fields.beliefText,
    urgeText: fields.urgeText,
    currentThought: fields.thoughtText,
    thoughtTimeOrientation: fields.thoughtTimeOrientation,
    interpretationText: fields.interpretationText,
    // ARCHI -- Universal ARC Routing, Emotion Identification & Android
    // Shortcuts task: mirrors the prefilled text fields above, purely so
    // a trainee who navigates BACK to "urge"/"thought"/"interpretation"
    // from this plan-prefilled session still finds that exact capture
    // screen reachable (never required for the forward walk below, which
    // already lands correctly on the corresponding ACCEPTANCE step from
    // the prefilled text alone -- this only affects goBack).
    selectedCognitiveUrge: !!fields.urgeText,
    selectedCognitiveThought: !!fields.thoughtText,
    selectedCognitiveInterpretation: !!fields.interpretationText,
  };
  // ARC LIVE Body Scan and Protocol Restructuring task: supportive_sensation_select/
  // supportive_movement_select are no longer part of resolveStepOrder(mode) at all
  // (see NEW_ARC_LIVE_STEP_ORDER above), so skipping them here would never do
  // anything either way -- removed as dead code, not a behavior change.
  const skip = new Set<NewArcLiveStepId>(["goal_select"]);
  if (fields.supportiveBodyArea) skip.add("supportive_area_select");
  for (const step of resolveStepOrder(mode)) {
    if (!skip.has(step) && isStepReachable(step, state)) {
      return { ...state, currentStep: step, subIndex: 0, currentStepEnteredAt: now };
    }
  }
  return { ...state, currentStep: "complete", subIndex: 0, currentStepEnteredAt: now };
}
