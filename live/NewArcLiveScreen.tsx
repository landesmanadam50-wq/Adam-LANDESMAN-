import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { BODY_REGIONS, BODY_REGION_LABELS } from "../arc/bodyRegionRoles.ts";
import type { BodyRegion } from "../arc/bodyRegionRoles.ts";
import { BODY_SCAN_CLOSEDNESS_INFO, BODY_SCAN_CONTRACTION_INFO, BODY_SCAN_HEAVINESS_INFO, BODY_SCAN_OPENNESS_INFO } from "../arc/bodyScanRegions.ts";
import type { BodyScanRegion } from "../arc/bodyScanRegions.ts";
import { canPromoteToSupportiveOpening, MAX_SUPPORTIVE_OPENING_SELECTIONS, resolveBodyScanContractionState, resolveBodyScanHeavinessState, resolveBodyScanOpeningRole, resolveNextOpeningRole } from "../arc/bodyScanSelection.ts";
import type { BodyScanSide } from "../arc/bodyScanSelection.ts";
import { getStepContent, resolveActionText, resolveEncodingMantra, resolveSelectedEmotionText } from "../arc/newArcLiveCopy.ts";
import { resolveFocusColorHex } from "../arc/focusColorPalette.ts";
import { DEFAULT_ARC_APPEARANCE_SETTINGS } from "../arc/arcAppearanceSettings.ts";
import type { ArcAppearanceSettings } from "../arc/arcAppearanceSettings.ts";
import {
  canPromoteToSupportiveOpeningLogical,
  isBodyRegionSymmetricPair,
  resolveMirroredGreenHighlight,
  resolveMovementEligibleRegionKeys,
  resolveOppositeBodySide,
} from "../arc/bodyRegionMovements.ts";
import { OPENING_REGULATION_COLOR } from "../arc/arcBodyMantraCircleLogic.ts";
import { ARC_FREE_BREATHING_BACKGROUND_COLOR, resolveArcBackgroundColor } from "../arc/freeBreathingIntro.ts";
import BodySilhouetteMap, { toSilhouetteRegionKeys } from "./components/BodySilhouetteMap.tsx";
import ArcBodyMantraCircle from "./components/ArcBodyMantraCircle.tsx";
import type { ArcBodyMantraStage } from "./components/ArcBodyMantraCircle.tsx";
import FreeBreathingIntro from "./components/FreeBreathingIntro.tsx";

/** "Red: current contraction or unpleasant tension." */
const CONTRACTION_SELECTED_COLOR = "#D32F2F";
/** "Dark Blue: existing heaviness or closedness information." Shared by both now-separate questions -- they read/write the same underlying bodyScanHeavinessRegions array, so the same color marks either. */
const HEAVINESS_CLOSEDNESS_SELECTED_COLOR = "#1A237E";
/**
 * Final ARC Body Redesign & Flow Fixes task, requirement 2 ("Opening/
 * support: light blue"): the Select Opening Regions screen's own
 * selection marker -- a FIXED light blue (the exact same color
 * arc/arcBodyMantraCircleLogic.ts's animated opening track uses for
 * its own Regulation tier), never the trainee's own arbitrary chosen
 * Presence/focus color any more (that stays its own, separate,
 * personalized motif -- the Presence ring itself, and
 * ArcBodyMantraCircle's own presenceColor prop below, both completely
 * unaffected by this change).
 */
const OPENING_SUPPORT_SELECTED_COLOR = OPENING_REGULATION_COLOR;
/**
 * ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
 * task, section 1/7: "🟢 Green -- opening only" vs "🔵 Blue -- opening
 * AND supportive area" -- two genuinely distinct selection colors on
 * body_scan_opening_region (and the shortened-mode interactive body
 * screen, which writes into the exact same field), so the legend's own
 * colors are never a mismatch with what the body map actually shows.
 * OPENING_SUPPORT_SELECTED_COLOR above (light blue) is reused verbatim
 * for "blue," since it is already this exact same screen's own
 * pre-existing selection color -- never a new, third blue introduced
 * alongside it.
 */
const OPENING_GREEN_SELECTED_COLOR = "#2E7D32";
const OPENING_BLUE_SELECTED_COLOR = OPENING_SUPPORT_SELECTED_COLOR;
/** The one shared color resolver both body_scan_opening_region and the shortened-mode interactive body screen pass to BodySilhouetteMap -- green for "opening," blue for "opening_and_supportive," never duplicated between the two call sites. */
function resolveOpeningRegionSelectedColor(session: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): string | null {
  const role = resolveBodyScanOpeningRole(session.openingBodyScanRegions, region, side);
  if (role === "opening_and_supportive") return OPENING_BLUE_SELECTED_COLOR;
  if (role === "opening") return OPENING_GREEN_SELECTED_COLOR;
  return null;
}
/**
 * ARCHI -- Full ARC Body Flow Redesign task: Screen One's own combined
 * color resolver -- Red for a plain contracted region, Green for one
 * ALSO promoted to the opening role "opening" (cycleBodyScanContractionAndGreen,
 * arc/newArcLiveSteps.ts). Never blue -- Blue is only ever reachable
 * from Screen Two now.
 *
 * ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
 * Highlighting task, section 4: when this exact (region, side) carries
 * no real selection of its own, resolveMirroredGreenHighlight
 * (arc/bodyRegionMovements.ts) decides whether to display it as Green
 * anyway, purely because its symmetric opposite side is genuinely
 * Green -- "highlight both hands in Green... do not automatically
 * record the opposite hand as contracted." This is visual ONLY: no
 * data is ever written for the mirrored side, so tapping it still
 * performs a completely ordinary, real first tap on a "none" slot.
 */
function resolveContractionOrGreenColor(session: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): string | null {
  if (resolveBodyScanContractionState(session.bodyScanContractionRegions, region, side) === "contraction") {
    return resolveBodyScanOpeningRole(session.openingBodyScanRegions, region, side) === "opening" ? OPENING_GREEN_SELECTED_COLOR : CONTRACTION_SELECTED_COLOR;
  }
  if (resolveMirroredGreenHighlight(session.bodyScanContractionRegions, session.openingBodyScanRegions, region, side)) return OPENING_GREEN_SELECTED_COLOR;
  return null;
}
/**
 * ARCHI -- Full ARC Body Flow Redesign task: Screen Two's own
 * selectable-region allow-list -- movement-eligible AND not already
 * Red/Green on Screen One. This is the UI-level half of the absolute
 * exclusion rule (never shown as tappable at all); cycleSupportiveOnlyOpening/
 * cycleSupportiveOnlyOpeningBilateral (arc/bodyScanSelection.ts/
 * arc/bodyRegionMovements.ts) are the engine-level half, so neither
 * layer alone is what makes the rule hold.
 *
 * ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
 * Highlighting task, section 5: for a genuine symmetric pair, the
 * OPPOSITE side's own Red/Green status also excludes this side --
 * "if a bilateral Blue selection conflicts with an existing Red/Green
 * region on either side, prevent the invalid selection." Excluding it
 * from the selectable pool here (rather than merely letting the
 * bilateral cycle silently refuse the tap) means the trainee is never
 * shown an apparently-tappable region that in fact can never become
 * Blue.
 */
function resolveSupportiveEligibleSilhouetteRegions(session: NewArcLiveSessionState) {
  return toSilhouetteRegionKeys(
    resolveMovementEligibleRegionKeys().filter(({ region, side }) => {
      if (resolveBodyScanContractionState(session.bodyScanContractionRegions, region, side) === "contraction") return false;
      if (isBodyRegionSymmetricPair(region)) {
        const opposite = resolveOppositeBodySide(side);
        if (resolveBodyScanContractionState(session.bodyScanContractionRegions, region, opposite) === "contraction") return false;
      }
      return true;
    })
  );
}
/**
 * ARCHI -- Precise Body Opening and Stabilization Rules task, section
 * 2 ("if the user attempts to select a third region, show a short,
 * friendly Hebrew message"): the ONE shared pre-check both
 * body_scan_opening_region and Shortened ARC's own supportive_area_select
 * screen run before actually toggling -- toggleOpeningBodyScanRegion
 * itself (via arc/bodyScanSelection.ts's cycleBodyScanOpeningRole) is
 * what ALWAYS, authoritatively enforces the maximum-two-Blue limit in
 * the state-management logic ("enforce the limit in the actual state-
 * management logic, not just visually in the UI"); this pre-check
 * exists only to decide whether to surface the friendly message, never
 * to enforce the limit a second, independent time (if this check and
 * the real one ever disagreed, the real one still wins -- nothing here
 * can ever let a third Blue region through). Returns null when the
 * attempted tap would be blocked (the Alert has already fired, nothing
 * to commit) or the real toggled session otherwise.
 */
function attemptToggleOpeningBodyScanRegion(session: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState | null {
  const isGreenEligible = resolveBodyScanContractionState(session.bodyScanContractionRegions, region, side) === "contraction";
  const current = resolveBodyScanOpeningRole(session.openingBodyScanRegions, region, side);
  const next = resolveNextOpeningRole(current, isGreenEligible);
  if (next === "opening_and_supportive" && !canPromoteToSupportiveOpening(session.openingBodyScanRegions, region, side)) {
    Alert.alert("הגעת למגבלה", `אפשר לבחור לכל היותר ${MAX_SUPPORTIVE_OPENING_SELECTIONS} אזורי תמיכה (כחול כהה) בכל תרגול. כדי לבחור אזור אחר, יש להסיר קודם תמיכה קיימת.`);
    return null;
  }
  return toggleOpeningBodyScanRegion(session, region, side);
}
/**
 * ARCHI -- Full ARC Body Flow Redesign task: the same friendly-blocked-
 * selection pre-check as attemptToggleOpeningBodyScanRegion above, for
 * Screen Two's own Blue-only cycle. A region already Red/Green is never
 * reachable here at all (resolveSupportiveEligibleSilhouetteRegions
 * excludes it from the UI, and the bilateral cycle below refuses it
 * regardless), so the only real block this surfaces is the max-two-Blue
 * limit.
 *
 * ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
 * Highlighting task, section 4: now routes through
 * toggleSupportiveOpeningRegionBilateral/canPromoteToSupportiveOpeningLogical
 * -- "treat a symmetrical pair as one logical selection for selection
 * limits" -- so selecting one hand (which writes BOTH hands as Blue)
 * only ever counts as ONE of the two allowed slots.
 */
function attemptToggleSupportiveOpeningRegion(session: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState | null {
  if (resolveBodyScanContractionState(session.bodyScanContractionRegions, region, side) === "contraction") return null;
  const current = resolveBodyScanOpeningRole(session.openingBodyScanRegions, region, side);
  if (current === "none" && !canPromoteToSupportiveOpeningLogical(session.openingBodyScanRegions, region, side)) {
    Alert.alert("הגעת למגבלה", `אפשר לבחור לכל היותר ${MAX_SUPPORTIVE_OPENING_SELECTIONS} אזורי תמיכה (כחול) בכל תרגול. כדי לבחור אזור אחר, יש להסיר קודם תמיכה קיימת.`);
    return null;
  }
  return toggleSupportiveOpeningRegionBilateral(session, region, side);
}
/**
 * ARCHI -- Fix Mini ARC Interactive Body Selection and Three-Tap Color
 * Model task, section 4: the SAME friendly-blocked-selection pre-check
 * as attemptToggleOpeningBodyScanRegion above, for Mini ARC's own
 * tap-cycle (cycleMiniBodyScanRegion, arc/newArcLiveSteps.ts) -- the
 * third tap on a new region, once two others are already Dark Blue,
 * shows the exact same Hebrew message rather than silently doing
 * nothing. cycleMiniBodyScanRegion itself is still what actually,
 * always enforces the limit (it returns its input unchanged on a
 * blocked "lightGreen" -> "darkBlue" attempt, same contract
 * cycleBodyScanOpeningRole already has) -- this pre-check only decides
 * whether to surface the message.
 */
function attemptCycleMiniBodyScanRegion(session: NewArcLiveSessionState, region: BodyScanRegion, side: BodyScanSide): NewArcLiveSessionState | null {
  const phase = resolveMiniBodyScanTapPhase(session, region, side);
  if (phase === "lightGreen" && !canPromoteToSupportiveOpening(session.openingBodyScanRegions, region, side)) {
    Alert.alert("הגעת למגבלה", `אפשר לבחור לכל היותר ${MAX_SUPPORTIVE_OPENING_SELECTIONS} אזורי תמיכה (כחול כהה) בכל תרגול. כדי לבחור אזור אחר, יש להסיר קודם תמיכה קיימת.`);
    return null;
  }
  return cycleMiniBodyScanRegion(session, region, side);
}
/**
 * Final ARC Flow & Body Animation task, requirement 1 ("Identify
 * Closure... ONLY regions with a real, gentle, anatomically meaningful
 * opening movement") and requirement 2 ("Only enable closure selection
 * for regions with a supported opening animation"): computed once, not
 * per render, from arc/bodyRegionMovements.ts's own 15-region
 * eligibility table -- used by the (now permanently unreachable, but
 * never deleted) body_scan_closedness case below, and by Shortened
 * ARC's own supportive_area_select screen further down. ARCHI --
 * Correct the Full ARC Red-to-Green/Direct-to-Blue Selection Logic
 * task: body_scan_opening_region itself no longer restricts its
 * selectable pool at all (every region stays tappable there regardless
 * of earlier Red selection), so it no longer uses this constant.
 */
const MOVEMENT_ELIGIBLE_SILHOUETTE_REGIONS = toSilhouetteRegionKeys(resolveMovementEligibleRegionKeys());
import {
  DESIRED_FEELING_OPTIONS,
  EMOTIONAL_ACTION_PRESETS,
  EMOTION_OPTION_LABELS,
  FOCUS_COLOR_OPTIONS,
  PREDEFINED_EMOTION_OPTIONS,
  SUPPORTIVE_SENSATION_OPTIONS,
} from "../arc/newArcLiveTypes.ts";
import type { ArcInvocationMode, ArcSessionRequest, EmotionSelection, NewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import { STANDALONE_ARC_TASK_ID, createNewArcLiveSessionState, describeArcSessionConfig, sessionMatchesRequest } from "../arc/newArcLiveTypes.ts";
import { listSupportiveFeelingAlternatives, resolveSupportiveFeeling } from "../arc/supportiveFeelingMapping.ts";
import type { SupportiveFeelingMapping } from "../arc/supportiveFeelingMapping.ts";
import type { Task } from "../arc/tasks.ts";
import {
  advance,
  completeFreeBreathingIntro,
  completePresenceSteps,
  completeSession,
  confirmBodyScanClosedness,
  confirmDesiredFeelingLocation,
  confirmOpeningBodyScanRegions,
  confirmUnpleasantAreas,
  createSessionFromPlannedArcFields,
  cycleBodyScanContractionAndGreen,
  cycleMiniBodyScanRegion,
  declineDesiredFeelingPresence,
  declineSelfObservation,
  declineUnpleasantArea,
  goBack,
  isStepSkippable,
  migrateLegacyNewArcLiveStep,
  proceedToSelfObservationExercise,
  proceedToUnpleasantAreaSelect,
  resolvePreviousStep,
  resolveProgress,
  setCognitiveSelection,
  setDesiredEnding,
  setDesiredFeeling,
  setEmotion,
  setEmotionSelection,
  setEmotionalAction,
  setEmotionalInsight,
  setFocusColor,
  setGoalType,
  setInterpretation,
  setMiniAcceptanceTransition,
  setMiniAwareness,
  setMiniCognitiveSelection,
  setMiniEncoding,
  confirmActionReadinessCheck,
  confirmTimeAvailableRating,
  cycleShortBodyMarking,
  resolveShortBodyMarkingPhase,
  setSelectedAction,
  setSupportiveFeelingOverride,
  setCustomSupportiveFeelingOverride,
  resolveFinalSupportiveFeeling,
  setThought,
  setUrgeText,
  setPositiveMovement,
  setSupportiveArea,
  setSupportiveSensation,
  setThoughtTimeOrientation,
  resolveClosureRegions,
  resolveMiniBodyScanTapPhase,
  toggleBodyScanClosednessRegion,
  toggleBodyScanContractionRegion,
  toggleBodyScanHeavinessRegion,
  toggleDesiredFeelingBodyArea,
  toggleOpeningBodyScanRegion,
  toggleSupportiveOpeningRegionBilateral,
  toggleUnpleasantArea,
} from "../arc/newArcLiveSteps.ts";
import { resolveSuggestedSupportiveAreas, resolveSuggestedUnpleasantAreas, resolveSupportiveMovementSuggestionsForAreas } from "../arc/supportiveAnchorSuggestions.ts";
// Nine Functional Improvements task, Improvement 3 ("Internal Action"
// timer): reuses arc/taskTimer.ts's own PURE pause/resume math exactly
// as-is -- never a second, duplicated timer implementation -- over a
// dedicated, separately-persisted run (data/storage.ts's own
// loadInternalActionTimerRun/saveInternalActionTimerRun, a SEPARATE
// storage key from Task LIVE's own single-slot TaskTimerRun, so the two
// can never collide).
import { createTaskTimerRun, generateTaskTimerRunId, getTaskTimerStatus, pauseTaskTimerRun, resumeTaskTimerRun } from "../arc/taskTimer.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
// Three-levels-of-acceptance task, section 7: reused UNCHANGED from the
// existing, independent ARC Thought engine -- never a parallel label map.
import { getThoughtTimeOrientationOptions } from "../arc/thoughtLive.ts";
import {
  appendArcInsight,
  clearInternalActionTimerRun,
  clearNewArcLiveSession,
  getTask,
  loadArcBeliefs,
  loadArcGymMemories,
  loadArcGymSituations,
  loadArcAppearanceSettings,
  loadArcGymTrainingRecords,
  loadArcResultExercises,
  loadInternalActionTimerRun,
  loadNewArcLiveSession,
  loadPositiveMemories,
  loadPositiveMemorySelectionHistory,
  savePositiveMemorySelectionHistory,
  recordLastEncodingFeelingForTask,
  loadPersonalName,
  loadPlannedArcs,
  loadTaskTimerRun,
  savePendingIdentityInsightTaskId,
  saveArcGymMemoryCheckInProgress,
  saveInternalActionTimerRun,
  saveNewArcLiveSession,
  savePersonalName,
  upsertArcBelief,
  upsertArcGymMemoryEntry,
  upsertArcGymTrainingRecordEntry,
  upsertPlannedArc,
  upsertTask,
  loadArcDecisionInProgress,
  saveArcDecisionInProgress,
  clearArcDecisionInProgress,
  recordArcDecisionHistory,
  loadArcPerspectiveInProgress,
  saveArcPerspectiveInProgress,
  loadArcSavedBodyOptions,
  loadArcSavedExercises,
  saveArcSavingPendingReview,
} from "../data/storage.ts";
import ArcDecisionFlow from "./components/ArcDecisionFlow.tsx";
import { createArcDecisionSession, completeArcDecisionSession } from "../arc/arcDecision.ts";
import type { ArcDecisionOption, ArcDecisionSession } from "../arc/arcDecision.ts";
import { advanceArcPerspectiveFromMoodCheckIn } from "../arc/arcPerspective.ts";
import { applyArcBodyProtocolSnapshotToSession, captureArcBodyProtocolSnapshot, findArcSavedBodyOptionById, findArcSavedExerciseById } from "../arc/arcSaving.ts";
// ARCHI -- ARC Result: Automatic, Optional Suggestion Without Extra
// Shortcuts task, section 3: the one shared check every post-ARC
// completion path uses before resolving its own destination -- never
// a second, independently-filtered lookup.
import { findPairedArcResultForSituation, hasLinkedArcResult } from "../arc/arcResult.ts";
// ARCHI -- Unified Final Specification task, section 2: the SAME
// "today's effective, auto-scheduled plan" pipeline the Flexible Daily
// Screen/next-task display already use -- never a second "what's
// scheduled today" engine.
import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";
import { resolveCurrentTaskState } from "../arc/dailyPlan.ts";
import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { parseClockTimeToMinutes } from "../arc/dailyRoutine.ts";
import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import { reconcileTaskAlarms } from "../data/taskAlarm.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { createArcInsight, createLearnedBelief, generateArcBeliefId, generateArcInsightId } from "../arc/arcInsightBelief.ts";
import type { ArcBelief } from "../arc/arcInsightBelief.ts";
import { createPlannedArcFromSession, generatePlannedArcId, hasDraftForExercise, resolvePlannedArcPrefillFields } from "../arc/plannedArc.ts";
import type { PlannedArc } from "../arc/plannedArc.ts";
import {
  completeArcGymTrainingRecord,
  createArcGymTrainingRecord,
  createEmptyArcGymMemory,
  findArcGymMemory,
  findOpenArcGymTrainingRecord,
  generateArcGymTrainingRecordId,
  recordArcGymMemoryFromSession,
  resolveArcGymActionVisualization,
} from "../arc/arcGym.ts";
import type { ArcGymCheckInChoice } from "../arc/arcGym.ts";
import { createArcGymMemoryCheckInProgress } from "../arc/arcGymMemoryCheckInProgress.ts";
// Positive Memory, Success Recall & Quick Capture task, section 8: the
// ONE reusable selection engine (arc/positiveMemorySelection.ts) -- never
// a second, independently-written matcher for Encoding.
import { selectPositiveMemoryForFeeling } from "../arc/positiveMemorySelection.ts";
import type { PositiveMemory } from "../arc/positiveMemory.ts";
import { recordPositiveMemorySelection } from "../arc/positiveMemorySelectionHistory.ts";

const ACTION_ENDING_SUGGESTIONS = ["התחלתי את הצעד הראשון", "השלמתי את הפעולה", "פעלתי ברוגע", "נשארתי ממוקד"];

/**
 * ARCHI -- Unified Final Specification task, section 4 ("TEMPORARY
 * ACTIONS BEFORE THE NEXT SCHEDULED TASK"): the time remaining until
 * the next real, not-yet-completed scheduled entry today -- null when
 * none exists at all ("if no upcoming task exists, allow choosing
 * duration without a schedule-based limit"), otherwise clamped to zero
 * (never negative) when that entry's own effective start has already
 * passed. A pure function over an already-resolved plan, exactly like
 * every other arc/dailyPlan.ts reader -- never re-derives "today" or
 * "effective" itself. `excludeTaskId` drops the ARC session's own
 * (possibly non-existent/standalone) taskId, same null-safe exclusion
 * arc/dailyPlan.ts's own resolveCurrentTaskState already takes.
 *
 * Weekly/Flexible-Daily/ARC-LIVE task-sync fix: reads through that one
 * central resolveCurrentTaskState instead of the superseded
 * resolveNextScheduledTaskAfter, so this never clamps against a task
 * whose own scheduled window has already passed.
 */
function resolveMinutesUntilNextTask(scheduled: ScheduledPlanEntry[], excludeTaskId: string, now: Date): number | null {
  const { next } = resolveCurrentTaskState(scheduled, now, null, excludeTaskId);
  if (!next || next.effectiveStartTime === null) return null;
  const startMinutes = parseClockTimeToMinutes(next.effectiveStartTime);
  if (startMinutes === null) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, startMinutes - nowMinutes);
}

/**
 * live/NewArcLiveScreen.tsx (route /tasks/[id]/arc)
 *
 * Simplified-architecture task, Phase 2: the new, self-contained ARC
 * LIVE flow -- "there is no separate ARC BUILD. The user makes the
 * necessary choices during LIVE." All routing/branching logic lives in
 * arc/newArcLiveSteps.ts (a pure, typed state machine); all displayed
 * text lives in arc/newArcLiveCopy.ts. This component only renders
 * whatever those two modules decide and calls their functions on every
 * interaction -- it never itself decides what the next step is.
 *
 * Entry: the task's "צריך ARC" (end-of-timer choice, or the button
 * that remains available while the task timer is still running --
 * live/ActiveTaskScreen.tsx) always lands here with the task's id.
 * Session persistence (data/storage.ts's loadNewArcLiveSession/
 * saveNewArcLiveSession) mirrors arc/taskTimer.ts's own single-slot,
 * "resume by matching taskId, never duplicate" convention exactly, so
 * the session survives backgrounding and app restart.
 */
/**
 * ARC session-resume conflict fix: everything needed to show the
 * resume/start/cancel prompt and act on whichever the trainee picks --
 * built once, in reload(), so the three buttons never have to
 * re-resolve the task/planned-ARC/belief data a second time.
 */
interface ArcSessionConflict {
  existing: NewArcLiveSessionState;
  existingLabel: string;
  requestedLabel: string;
  buildRequested: () => NewArcLiveSessionState;
}

export default function NewArcLiveScreen({
  taskId,
  startMode = "plannedFull",
  skipEmotionSelection = false,
  plannedArcId = null,
  autoStartAfter = false,
  arcGymSituationId = null,
  arcFocusPracticeId = null,
  arcGymMemoryExerciseId = null,
  arcPerspectiveId = null,
  arcSavingBodyOptionId = null,
  arcSavingExerciseId = null,
  arcSavingTriggerIdForNewOption = null,
  morningFlowCheckIn = false,
}: {
  taskId: string;
  startMode?: ArcInvocationMode;
  /** ARCHI -- Unified Final Specification task, section 1 (combined "מחשבה / דחף" shortcut -- supersedes the earlier, narrower presetUrge prop of the same position/role): true only for a session started via that one button -- threaded straight into createNewArcLiveSessionState's own skipEmotionSelection param (see that function's doc on NewArcLiveSessionState for exactly what it skips). Never combined with plannedArcId -- the combined shortcut is always a fresh, ad-hoc Full ARC session, same as "פחות טוב"'s own "ARC מלא" choice. */
  skipEmotionSelection?: boolean;
  plannedArcId?: string | null;
  autoStartAfter?: boolean;
  /** ARC GYM task: non-null only when this session was started from ARC GYM's own Full/Shortened ARC check-in choice -- see arc/newArcLiveTypes.ts's own doc on NewArcLiveSessionState.arcGymSituationId. */
  arcGymSituationId?: string | null;
  /** ARC Focus task: non-null only when this session is the preliminary ARC (😟/🙂 check-in choice) for a planned arc/arcFocusSession.ts ArcFocusSession -- see arc/newArcLiveTypes.ts's own doc on NewArcLiveSessionState.arcFocusPracticeId. UNLIKE arcGymSituationId, this never forces taskId to the standalone sentinel -- the real/standalone taskId passed above is always preserved untouched. */
  arcFocusPracticeId?: string | null;
  /** ARC Gym + ARC Goal Integration task: non-null only when this session is the preliminary ARC (😟/🙂 check-in choice) inserted into ARC Memory's own flow -- see arc/newArcLiveTypes.ts's own doc on NewArcLiveSessionState.arcGymMemoryExerciseId. Like arcGymSituationId (and unlike arcFocusPracticeId), the caller (data/emotionalCheckInRouting.ts's handleArcGymMemoryCheckInChoice) already forced taskId to the standalone sentinel before this screen ever mounts. */
  arcGymMemoryExerciseId?: string | null;
  /** ARC Perspective task: non-null only when this session is the preliminary ARC (😟/🙂 check-in choice) inserted between ARC Perspective's own "event" and "perspective_shift" steps -- see arc/newArcLiveTypes.ts's own doc on NewArcLiveSessionState.arcPerspectiveId. Same shape as arcFocusPracticeId: never forces taskId to the standalone sentinel -- the caller (build/ArcPerspectiveFlowScreen.tsx) has already resolved the real-or-standalone taskId itself, since a real-time practice must keep linking to whichever task was already active. */
  arcPerspectiveId?: string | null;
  /** ARC Saving task: non-null only when this session was started from a trigger's own chosen arc/arcSaving.ts ArcSavedBodyOption (build/ArcSavingActivateScreen.tsx) -- see arc/newArcLiveTypes.ts's own doc on NewArcLiveSessionState.arcSavingBodyOptionId. Same shape as arcPerspectiveId/arcFocusPracticeId: never forces taskId to the standalone sentinel. Mutually exclusive with arcSavingExerciseId below -- at most one is ever set. */
  arcSavingBodyOptionId?: string | null;
  /** ARC Saving task: non-null only for a standalone "תרגל שוב" on an existing ArcSavedExercise (build/ArcSavingScreen.tsx) -- see arc/newArcLiveTypes.ts's own doc on NewArcLiveSessionState.arcSavingExerciseId. */
  arcSavingExerciseId?: string | null;
  /** ARC Saving task: non-null only for the "בחירת אזורי גוף מחדש" path (build/ArcSavingActivateScreen.tsx) -- see arc/newArcLiveTypes.ts's own doc on NewArcLiveSessionState.arcSavingTriggerIdForNewOption. Never pre-fills anything. */
  arcSavingTriggerIdForNewOption?: string | null;
  /** Morning Flow Simplification task: true only when this session was started from live/DailyStartupSequenceOverlay.tsx's own "checkin" step -- a pure navigation hint (never persisted on the session itself, unlike arcGymSituationId above) read only by returnToTask() below. */
  morningFlowCheckIn?: boolean;
}) {
  const [session, setSession] = useState<NewArcLiveSessionState | null>(null);
  // ARCHI -- Unified 7-Part Update task, Part 7.2: loaded once on focus
  // (useFocusEffect, same "re-read whenever this screen becomes active
  // again" convention every other settings-driven screen in this app
  // already uses) -- so a color changed in Settings and then returned
  // to here (e.g. mid-session, via goBack navigation) always reflects
  // the latest saved value, never a stale snapshot from when the ARC
  // session first mounted.
  const [appearanceSettings, setAppearanceSettings] = useState<ArcAppearanceSettings>(DEFAULT_ARC_APPEARANCE_SETTINGS);
  useFocusEffect(useCallback(() => {
    loadArcAppearanceSettings().then(setAppearanceSettings);
  }, []));
  // "התבוננות וחיבור לעצמי" task: the trainee's own personal name is a
  // global profile value (data/storage.ts's own single-key store),
  // never session content -- loaded the same way appearanceSettings is,
  // so a name entered on a previous session is already there the next
  // time self_observation_exercise is reached, never re-asked.
  const [personalName, setPersonalName] = useState<string | null>(null);
  const [nameInputDraft, setNameInputDraft] = useState("");
  useFocusEffect(useCallback(() => {
    loadPersonalName().then(setPersonalName);
  }, []));
  function handleSavePersonalName() {
    const trimmed = nameInputDraft.trim();
    if (!trimmed) return;
    savePersonalName(trimmed);
    setPersonalName(trimmed);
  }
  /**
   * ARC Decision task: an inline overlay, never a navigation away from
   * this screen -- "אני לא יודע" (renderActionSelector() below) opens
   * it, replacing only the action-selection sub-UI; canceling or
   * finishing just clears this local state, so the ARC session itself
   * (taskId/firstAction/taskTitle/timers) is never touched by any of
   * it except the one, final setSelectedAction call on finish. Resumed
   * on focus from the single in-progress slot, scoped to THIS exact ARC
   * session (arcSessionId === taskId) so a stale decision left over
   * from a different task's session is never restored here.
   */
  const [arcDecisionSession, setArcDecisionSession] = useState<ArcDecisionSession | null>(null);
  useFocusEffect(
    useCallback(() => {
      loadArcDecisionInProgress().then((progress) => {
        if (progress && progress.source === "arc" && progress.arcSessionId === taskId && !progress.completedAt) {
          setArcDecisionSession(progress);
        }
      });
    }, [taskId])
  );
  function startArcDecision() {
    const created = createArcDecisionSession("arc", taskId, session!.isActiveTaskLiveOrigin ? taskId : null, now);
    saveArcDecisionInProgress(created);
    setArcDecisionSession(created);
  }
  function handleArcDecisionChange(next: ArcDecisionSession) {
    saveArcDecisionInProgress(next);
    setArcDecisionSession(next);
  }
  function handleArcDecisionCancel() {
    clearArcDecisionInProgress();
    setArcDecisionSession(null);
  }
  function handleArcDecisionFinish(decisionSession: ArcDecisionSession, chosenOption: ArcDecisionOption) {
    const completed = completeArcDecisionSession(decisionSession, now);
    recordArcDecisionHistory(completed);
    clearArcDecisionInProgress();
    setArcDecisionSession(null);
    const availableMinutes = resolveMinutesUntilNextTask(dailyPlanEntries, taskId, new Date());
    const clampedDuration = availableMinutes !== null ? Math.max(1, Math.min(10, availableMinutes)) : 10;
    commit(setSelectedAction(session!, { source: "temporaryAction", title: chosenOption.text, durationMinutes: clampedDuration }, now));
  }
  const [conflict, setConflict] = useState<ArcSessionConflict | null>(null);
  const [draftText, setDraftText] = useState("");
  // Unified awareness/urge/thought/interpretation update, section 3: a
  // SEPARATE draft from draftText (which already carries the thought on
  // this same "thought" screen) -- never merged into one field.
  const [interpretationDraft, setInterpretationDraft] = useState("");
  const [customEmotionDraft, setCustomEmotionDraft] = useState("");
  /**
   * ARCHI -- Three UX Improvements task, Improvement 1: the free-text
   * draft for a custom SUPPORTIVE emotion -- same "" (collapsed, or
   * leftover text when the TextInput was abandoned without committing)
   * vs. non-empty (reveals the input) convention as customEmotionDraft
   * above, but for the supportive-feeling picker's own "רגש אחר --
   * כתיבה חופשית" chip instead. Shared by both Full ARC's "emotion"
   * case and Shortened ARC's embedded supportive-feeling control (the
   * SAME renderSupportiveFeelingPicker call in both), since a session
   * can only ever be on one of those two steps at a time.
   */
  const [customSupportiveFeelingDraft, setCustomSupportiveFeelingDraft] = useState("");
  // Urge-stop task, requirement 1 (now captured on its own dedicated
  // "urge" step -- ARCHI Universal ARC Routing task, requirement 6).
  const [urgeDraft, setUrgeDraft] = useState("");
  // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task: both
  // 0-10 ratings must be answered on the SAME screen before either is
  // committed, so they live as local drafts (null = not yet tapped)
  // until the one "המשך" button commits both together via
  // confirmActionReadinessCheck.
  const [unpleasantIntensityDraft, setUnpleasantIntensityDraft] = useState<number | null>(null);
  const [actionReadinessDraft, setActionReadinessDraft] = useState<number | null>(null);
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: shared by both the 3rd row on "action_readiness_check" and
  // the standalone "time_available_check" screen -- never both at
  // once for a single session, so one draft is enough.
  const [timeAvailableDraft, setTimeAvailableDraft] = useState<number | null>(null);
  /**
   * ARCHI -- Allow Action Selection During Emotion Identification or
   * Defer It to Regulation task: on the "emotion" screen, whether the
   * trainee tapped "בחירת פעולה עכשיו" and so wants the existing
   * action-selector UI (renderActionSelector) shown inline right
   * there. "אבחר פעולה בשלב הוויסות" needs no state of its own --
   * leaving this false (the default) and continuing normally already
   * IS deferring, since selectedActionSource simply stays null until
   * Regulation.
   */
  const [showActionSelectorOnEmotion, setShowActionSelectorOnEmotion] = useState(false);
  /**
   * Same screen-local toggle for Regulation's own action-selector
   * sub-screen (subIndex 1): false shows a plain summary of an
   * already-selected action (never re-asking); true reveals the same
   * renderActionSelector() picker so the trainee can explicitly change
   * it. Reset to false on every fresh entry (currentStep/subIndex both
   * in the effect below's own dependency array), so returning to this
   * sub-screen later always starts in "review," never stuck mid-edit.
   */
  const [showActionSelectorOnRegulation, setShowActionSelectorOnRegulation] = useState(false);
  const [showMoreMovements, setShowMoreMovements] = useState(false);
  const [showMoreAreas, setShowMoreAreas] = useState(false);
  /** ARC LIVE emotion-based body suggestions task, requirement 3: same "suggested first, reveal all on request" toggle as showMoreAreas above, kept separate since the two screens show different suggestion sets (unpleasant vs. supportive) and can be revealed independently of one another. */
  const [showMoreUnpleasantAreas, setShowMoreUnpleasantAreas] = useState(false);
  /** ARC Full Sequence Update task, Part 1 step 5: same "suggested first, reveal all on request" toggle, for desired_feeling_locate's own region list -- independent of the two above, since all three screens can be revealed separately. */
  const [showMoreDesiredFeelingAreas, setShowMoreDesiredFeelingAreas] = useState(false);
  // Body region selection correction task: unpleasant_area_select now needs
  // TWO independent free-text fields at once (a custom region label AND the
  // sensation description) -- draftText above covers the first (same
  // confirmSupportiveAreas-style reuse), this covers the second, same
  // "separate state for a second simultaneous field" precedent as
  // interpretationDraft alongside draftText on the 'thought' step.
  const [unpleasantSensationDraft, setUnpleasantSensationDraft] = useState("");
  /**
   * Body Scan Upgrade task, section 7: "פתיחת חלון מידע לא תאפס את
   * הבחירות" -- this is intentionally its own, session-independent
   * piece of UI state. Closing it (setInfoModal(null)) never touches
   * `session` at all, so whatever was already selected on either new
   * body-scan screen is untouched by construction, not by a special
   * case anywhere.
   */
  const [infoModal, setInfoModal] = useState<{ title: string; text: string } | null>(null);
  const [canContinue, setCanContinue] = useState(true);
  /**
   * Nine Functional Improvements task, Improvement 3: the "emotional_action"
   * step's own subIndex-1 timer phase. `internalActionRun` null means no
   * timer has been started yet for the CURRENTLY chosen action (the
   * "התחל טיימר" button is shown); non-null means it's running/paused.
   * Loaded from its own persisted single slot in reload() below so it
   * survives backgrounding/app restart, same as the session itself.
   */
  const [internalActionRun, setInternalActionRun] = useState<TaskTimerRun | null>(null);
  const [internalActionDurationDraft, setInternalActionDurationDraft] = useState("10");
  const [internalActionTickNow, setInternalActionTickNow] = useState(() => Date.now());
  // Part G: Mini ARC's own combined screens need several scratch fields
  // at once (never fields for Full ARC's own, already-separate steps).
  const [miniSelectedEmotion, setMiniSelectedEmotion] = useState<EmotionSelection | null>(null);
  // ARCHI -- Combined Emotion & Supportive Feeling Selection task,
  // Part 2 ("MINI ARC -- SAME COMBINED SELECTION"): the trainee's own
  // optional override of the automatic suggestion, scratch state like
  // miniSelectedEmotion above -- committed into the session together
  // with it, atomically, on the SAME "Continue" tap.
  const [miniSupportiveFeelingOverride, setMiniSupportiveFeelingOverride] = useState<SupportiveFeelingMapping | null>(null);
  /**
   * ARCHI -- Three UX Improvements task, Improvement 1: Mini ARC's own
   * custom-supportive-feeling draft, same scratch-state-until-Continue
   * convention as miniSupportiveFeelingOverride above. miniSupportiveFeelingIsCustom
   * tracks whether the CURRENT miniSupportiveFeelingOverride came from
   * this free-text path (vs. a listed alternative) -- committed into
   * session.customSupportiveFeelingText only when true, on the same
   * "Continue" tap that commits everything else on this screen.
   */
  const [miniCustomSupportiveFeelingDraft, setMiniCustomSupportiveFeelingDraft] = useState("");
  const [miniSupportiveFeelingIsCustom, setMiniSupportiveFeelingIsCustom] = useState(false);
  const [miniDesiredEndingDraft, setMiniDesiredEndingDraft] = useState("");
  const [miniSensationDraft, setMiniSensationDraft] = useState("");
  const [miniMovementDraft, setMiniMovementDraft] = useState("");
  /**
   * ARCHI -- Universal ARC Routing, Emotion Identification & Android
   * Shortcuts task, requirement 2: the shared "cognitive_selector"
   * screen's own three independent checkboxes (Thought/Interpretation/
   * Urge) -- Full ARC only. Reset to false on every fresh session via
   * the per-step-entry effect below, same convention as every other
   * draft field, so a previous session's checkboxes never leak into a
   * new one.
   */
  const [cogSelectThought, setCogSelectThought] = useState(false);
  const [cogSelectInterpretation, setCogSelectInterpretation] = useState(false);
  const [cogSelectUrge, setCogSelectUrge] = useState(false);
  /**
   * Requirement 3B ("Mini ARC at entry with short personalized
   * branches"): Mini ARC's own upgrade of the old single-category
   * "mini_thought" chooser to the SAME three-independent-checkbox
   * semantics, all captured on this one combined screen -- three
   * booleans plus their own three independent text drafts (never one
   * shared draft any more).
   */
  const [miniCogThought, setMiniCogThought] = useState(false);
  const [miniCogInterpretation, setMiniCogInterpretation] = useState(false);
  const [miniCogUrge, setMiniCogUrge] = useState(false);
  const [miniThoughtDraft, setMiniThoughtDraft] = useState("");
  const [miniInterpretationDraft, setMiniInterpretationDraft] = useState("");
  const [miniUrgeDraft, setMiniUrgeDraft] = useState("");
  /**
   * ARCHI -- Unified Final Specification task, section 2 ("Action
   * Selection... show 'מה תרצה לעשות כעת?' letting the user choose an
   * existing scheduled task... or enter a different temporary
   * action"): today's already-resolved, auto-scheduled plan -- loaded
   * once in reload() via the SAME resolveTodaysScheduledPlan pipeline
   * build/FlexibleDailyScreen.tsx/data/dailyPlan.ts already use, never
   * a second "what's scheduled today" engine. Only actually consumed
   * by the "action_selection"/"mini_action_selection" render case
   * below (unreachable whenever isActiveTaskLiveOrigin/
   * arcGymSituationId -- see isStepReachable), but loaded unconditionally
   * since it's cheap and reload() already loads everything else in one
   * Promise.all.
   */
  const [dailyPlanEntries, setDailyPlanEntries] = useState<ScheduledPlanEntry[]>([]);
  const [tempActionTitleDraft, setTempActionTitleDraft] = useState("");
  const [tempActionDurationDraft, setTempActionDurationDraft] = useState("10");
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Positive Memory, Success Recall & Quick Capture task, section 8
   * ("automatic memory selection during ARC encoding"): a documented
   * real positive memory matching the session's own resolved
   * supportive feeling, auto-selected via the ONE reusable selection
   * engine (arc/positiveMemorySelection.ts) -- defaults to inert/null
   * so that whenever no match exists (the vast majority of existing
   * regression-tested sessions, which have no positive-memory library
   * at all), rendering below falls straight through to the EXISTING,
   * completely unchanged <ArcBodyMantraCircle> encoding screen.
   */
  const [positiveMemoryForEncoding, setPositiveMemoryForEncoding] = useState<PositiveMemory | null>(null);
  const [positiveMemoryEncodingDismissed, setPositiveMemoryEncodingDismissed] = useState(false);
  const [positiveMemoryEncodingExcludedIds, setPositiveMemoryEncodingExcludedIds] = useState<string[]>([]);
  const positiveMemoryEncodingResolvedKeyRef = useRef<string | null>(null);

  const reload = useCallback(() => {
    // Part B.1: a standalone (not task-linked) spontaneous session has
    // no real Task to fetch -- a synthetic placeholder stands in, and
    // is never written back to storage anywhere.
    const taskLoader: Promise<Task | null> =
      taskId === STANDALONE_ARC_TASK_ID ? Promise.resolve({ id: STANDALONE_ARC_TASK_ID, title: "", firstAction: "" } as Task) : getTask(taskId);
    // ARC session-resume conflict fix: loaded unconditionally (not just
    // when plannedArcId is set) so BOTH the requested AND an existing,
    // differently-sourced session can show the draft's own name in the
    // resume/start/cancel prompt, never just the generic mode label.
    const nowDate = new Date();
    Promise.all([
      taskLoader,
      loadNewArcLiveSession(),
      loadPlannedArcs(),
      loadArcBeliefs(),
      loadArcGymSituations(),
      loadInternalActionTimerRun(),
      loadTaskTimerRun(),
      resolveTodaysScheduledPlan(nowDate),
      loadArcSavedBodyOptions(),
      loadArcSavedExercises(),
    ]).then(([task, existing, items, beliefs, arcGymSituations, internalActionRun, taskTimerRun, scheduledPlan, arcSavedBodyOptions, arcSavedExercises]) => {
      if (!task) return;
      setInternalActionRun(internalActionRun);
      setDailyPlanEntries(scheduledPlan);
      const now = nowDate.toISOString();
      const plannedArcsById = new Map<string, PlannedArc>(items.map((item) => [item.id, item]));
      const beliefsById = new Map<string, ArcBelief>(beliefs.map((belief) => [belief.id, belief]));
      // ARCHI -- Universal ARC Routing, Emotion Identification & Android
      // Shortcuts task, requirement 9: resolved ONCE, right here (the IO
      // layer) -- true only when THIS exact task's own TaskTimerRun was
      // already in flight (running or paused) the moment this ARC
      // session was created, i.e. a genuine Task-LIVE-triggered ARC
      // ("צריך ARC" tapped mid-task). Never re-derived later: the timer
      // may finish/pause/resume while this ARC session stays open, but
      // the Encoding mantra's own phrasing (resolveEncodingMantra) should
      // reflect how this session STARTED, not the timer's live status at
      // the moment Encoding happens to be reached.
      const isActiveTaskLiveOrigin = !!taskTimerRun && taskTimerRun.taskId === taskId;
      // ARC GYM task: resolved ONCE here (the IO layer), never re-looked-up
      // by the pure engine -- arc/newArcLiveCopy.ts only ever reads the
      // already-resolved text baked onto the session itself.
      const arcGymSituation = arcGymSituationId ? arcGymSituations.find((candidate) => candidate.id === arcGymSituationId) ?? null : null;
      const arcGymVisualizationText = arcGymSituation ? resolveArcGymActionVisualization(arcGymSituation) : null;
      // ARC Saving task: resolved ONCE here (the IO layer), mirroring
      // arcGymSituation above -- exactly one of the two is ever non-null
      // (the caller, build/ArcSavingActivateScreen.tsx/ArcSavingScreen.tsx,
      // never sets both). A deleted-in-the-meantime option/exercise falls
      // back to null -- never inventing data for a vanished one, same
      // convention as plannedArcId's own "no longer exists" fallback.
      const arcSavingSnapshot = arcSavingBodyOptionId
        ? findArcSavedBodyOptionById(arcSavedBodyOptions, arcSavingBodyOptionId)?.snapshot ?? null
        : arcSavingExerciseId
          ? findArcSavedExerciseById(arcSavedExercises, arcSavingExerciseId)?.snapshot ?? null
          : null;

      // What's actually being requested right now -- either a specific
      // saved PlannedArc (plannedArcId), prefilled exactly the way
      // live/ArcWindowScreen.tsx's own runPlannedArc used to build
      // inline, or an ad-hoc mode/track the trainee picks live
      // (startMode, sourcePlannedArcId: null). A plannedArcId pointing
      // at a draft that no longer exists (deleted in the meantime)
      // falls back to the ad-hoc case -- never inventing data for a
      // vanished draft.
      const requestedItem = plannedArcId ? plannedArcsById.get(plannedArcId) ?? null : null;
      const request: ArcSessionRequest = requestedItem
        ? {
            arcInvocationMode: requestedItem.kind === "mini" ? "plannedMini" : "plannedFull",
            sourcePlannedArcId: requestedItem.id,
            arcGymSituationId: null,
            arcFocusPracticeId: null,
            arcGymMemoryExerciseId: null,
            arcPerspectiveId: null,
            arcSavingBodyOptionId: null,
            arcSavingExerciseId: null,
            arcSavingTriggerIdForNewOption: null,
          }
        : {
            arcInvocationMode: startMode,
            sourcePlannedArcId: null,
            arcGymSituationId,
            arcFocusPracticeId,
            arcGymMemoryExerciseId,
            arcPerspectiveId,
            arcSavingBodyOptionId,
            arcSavingExerciseId,
            arcSavingTriggerIdForNewOption,
          };
      const buildFresh = (buildNow: string): NewArcLiveSessionState => {
        const base = requestedItem
          ? createSessionFromPlannedArcFields(
              taskId,
              task.title,
              task.firstAction,
              buildNow,
              request.arcInvocationMode,
              resolvePlannedArcPrefillFields(requestedItem, beliefsById),
              requestedItem.id
            )
          : // Unified ARC & Productivity Update task, requirement 2:
            // createNewArcLiveSessionState itself always starts at the
            // now-permanently-unreachable "goal_select" step (never
            // rewritten there -- it has no reachability logic of its
            // own to fast-forward with); migrateLegacyNewArcLiveStep is
            // the EXISTING forward-migration mechanism this codebase
            // already uses for every previously-removed step, reused
            // here unchanged rather than inventing a second one -- it
            // walks straight to the real first reachable step.
            // createSessionFromPlannedArcFields's own request branch
            // above needs no equivalent call: it already does its own
            // fast-forward past "goal_select" internally.
            migrateLegacyNewArcLiveStep(createNewArcLiveSessionState(taskId, task.title, task.firstAction, buildNow, startMode, null, skipEmotionSelection));
        // ARC GYM's taskId is the STANDALONE sentinel, so it correctly
        // stays "emotion_only" from the derivation above -- this is
        // deliberate, pre-existing architecture (Nine Functional
        // Improvements task, Improvement 4): ARC GYM's own personalized
        // positive-action visualization is a SEPARATE experience that
        // happens strictly AFTER the ARC exercise ends (returnToTask's
        // own ARC-GYM-first branch, routing to
        // /arc-gym/visualize-only/[id]), never folded into Encoding --
        // "never interrupting Acceptance/Regulation/Encoding." Encoding
        // itself therefore never reads arcGymVisualizationText at all
        // (resolveEncodingMantra, arc/newArcLiveCopy.ts); an ARC GYM
        // session's Encoding mantra is the same plain emotion_only one
        // every other standalone emotional session gets.
        const withArcGym = arcGymSituationId ? { ...base, arcGymSituationId, arcGymVisualizationText } : base;
        // ARC Focus task: stamped onto the session unconditionally (no
        // goalType/Encoding-content change, unlike arcGymSituationId
        // above) -- its only job is letting returnToTask() below find
        // and resume the SAME planned ArcFocusSession once this ARC
        // finishes, never a second/duplicated practice context.
        const withArcFocus = arcFocusPracticeId ? { ...withArcGym, arcFocusPracticeId } : withArcGym;
        // ARC Gym + ARC Goal Integration task: stamped onto the session
        // unconditionally, same as arcFocusPracticeId above (no goalType/
        // Encoding-content change) -- its only job is letting
        // returnToTask() below find its way back to the exact right
        // ARC Memory exercise once this preliminary ARC finishes.
        const withArcGymMemory = arcGymMemoryExerciseId ? { ...withArcFocus, arcGymMemoryExerciseId } : withArcFocus;
        // ARC Perspective task: stamped onto the session unconditionally,
        // same as arcFocusPracticeId/arcGymMemoryExerciseId above -- its
        // only job is letting returnToTask() below find its way back to
        // the exact right in-progress ArcPerspectiveSession once this
        // preliminary ARC finishes.
        const withArcPerspective = arcPerspectiveId ? { ...withArcGymMemory, arcPerspectiveId } : withArcGymMemory;
        // ARC Saving task: the id is stamped unconditionally (same as
        // every parallel field above, for returnToTask() to find its way
        // back), and -- unlike those -- the body/sensation/regulation
        // snapshot is also applied here, ONCE, at creation, so
        // isStepReachable's own arcSavingBodyOptionId skip-branches (see
        // arc/newArcLiveSteps.ts) have real pre-filled data to skip past.
        // A null arcSavingSnapshot (option/exercise deleted in the
        // meantime) still stamps the id -- the trainee simply walks the
        // ordinary, un-pre-filled body-selection steps instead, never a
        // crash or a silently invented snapshot.
        const withArcSavingId = arcSavingBodyOptionId
          ? { ...withArcPerspective, arcSavingBodyOptionId }
          : arcSavingExerciseId
            ? { ...withArcPerspective, arcSavingExerciseId }
            : arcSavingTriggerIdForNewOption
              ? { ...withArcPerspective, arcSavingTriggerIdForNewOption }
              : withArcPerspective;
        const withArcSaving = arcSavingSnapshot ? applyArcBodyProtocolSnapshotToSession(withArcSavingId, arcSavingSnapshot) : withArcSavingId;
        return { ...withArcSaving, isActiveTaskLiveOrigin };
      };
      const requestedLabel = describeArcSessionConfig(request, requestedItem?.name ?? null);

      const existingUnfinished = existing && existing.taskId === taskId && !existing.completedAt ? existing : null;

      if (!existingUnfinished) {
        const fresh = buildFresh(now);
        setSession(fresh);
        saveNewArcLiveSession(fresh);
        // Nine Functional Improvements task, Improvement 3: a brand-new
        // session starts at "goal_select" -- it cannot own an
        // internal-action timer yet, so any run still sitting in
        // storage necessarily belongs to a PREVIOUS, now-irrelevant
        // session (abandoned or already completed). Clearing it here
        // is what keeps "persists across interruptions" (resuming THIS
        // session later reunites with its own real run) from ever
        // leaking a stale run into an unrelated new one.
        clearInternalActionTimerRun();
        setInternalActionRun(null);
        // ARC GYM task, requirement 11: one training-history record per
        // actual fresh session start (never duplicated on a mere resume/
        // re-render, since this branch only runs when there was no
        // existing unfinished session to resume) -- the check-in CHOICE
        // itself (full vs. shortened) is recorded here, at the moment
        // it's made, not guessed later from the finished session.
        if (arcGymSituationId) {
          const checkInChoice: ArcGymCheckInChoice = fresh.arcInvocationMode === "shortened" ? "shortened_arc" : "full_arc";
          upsertArcGymTrainingRecordEntry(createArcGymTrainingRecord(generateArcGymTrainingRecordId(), arcGymSituationId, checkInChoice, now));
        }
        return;
      }
      if (sessionMatchesRequest(existingUnfinished, request)) {
        // Same type and configuration -- resume it silently, exactly as before.
        setSession(existingUnfinished);
        return;
      }
      // ARC session-resume conflict fix, requirements 3/4: a DIFFERENT,
      // still-unfinished session already exists -- never silently
      // resume it in place of what was just requested, and never
      // silently discard it either. Ask.
      const existingPlannedArcName = existingUnfinished.sourcePlannedArcId ? plannedArcsById.get(existingUnfinished.sourcePlannedArcId)?.name ?? null : null;
      setConflict({
        existing: existingUnfinished,
        existingLabel: describeArcSessionConfig(
          {
            arcInvocationMode: existingUnfinished.arcInvocationMode,
            sourcePlannedArcId: existingUnfinished.sourcePlannedArcId,
            arcGymSituationId: existingUnfinished.arcGymSituationId,
            arcFocusPracticeId: existingUnfinished.arcFocusPracticeId,
            arcGymMemoryExerciseId: existingUnfinished.arcGymMemoryExerciseId,
            arcPerspectiveId: existingUnfinished.arcPerspectiveId,
            arcSavingBodyOptionId: existingUnfinished.arcSavingBodyOptionId,
            arcSavingExerciseId: existingUnfinished.arcSavingExerciseId,
            arcSavingTriggerIdForNewOption: existingUnfinished.arcSavingTriggerIdForNewOption,
          },
          existingPlannedArcName
        ),
        requestedLabel,
        buildRequested: () => buildFresh(new Date().toISOString()),
      });
    });
  }, [
    taskId,
    startMode,
    skipEmotionSelection,
    plannedArcId,
    arcGymSituationId,
    arcFocusPracticeId,
    arcGymMemoryExerciseId,
    arcPerspectiveId,
    arcSavingBodyOptionId,
    arcSavingExerciseId,
    arcSavingTriggerIdForNewOption,
  ]);

  function resumeExistingSession() {
    if (!conflict) return;
    setSession(conflict.existing);
    setConflict(null);
  }

  function startRequestedSession() {
    if (!conflict) return;
    const fresh = conflict.buildRequested();
    setSession(fresh);
    saveNewArcLiveSession(fresh);
    // Nine Functional Improvements task, Improvement 3: discards the
    // REPLACED existingUnfinished session's own internal-action timer
    // (if it had one in flight) -- same reasoning as reload()'s own
    // fresh-session branch above; a brand-new requested session can
    // never legitimately own it.
    clearInternalActionTimerRun();
    setInternalActionRun(null);
    setConflict(null);
  }

  function cancelConflict() {
    // Requirement 6: touches NEITHER session -- the existing unfinished
    // one is left exactly as persisted, and nothing new is created.
    setConflict(null);
    router.back();
  }

  useFocusEffect(reload);

  useEffect(() => {
    // Three-levels-of-acceptance task, section 7: the "thought" step's
    // own draft is prefilled from the session's existing currentThought
    // (e.g. carried over from a planned ARC via
    // createSessionFromPlannedArcFields) -- same "prefilled but still
    // re-editable, never silently discarded" precedent as urgeDraft
    // below. Every other step keeps the plain blank reset, since
    // draftText is reused across unrelated steps.
    setDraftText(session?.currentStep === "thought" ? session?.currentThought ?? "" : "");
    // ARCHI -- Universal ARC Routing, Emotion Identification & Android
    // Shortcuts task, requirement 6: the "interpretation" step's own
    // draft is prefilled from the session's existing interpretationText
    // (moved from the old combined "thought" screen's own prefill,
    // which this replaces) -- same "prefilled but still re-editable,
    // never silently discarded" precedent as draftText/currentThought
    // just above.
    setInterpretationDraft(session?.currentStep === "interpretation" ? session?.interpretationText ?? "" : "");
    setCustomEmotionDraft("");
    // ARCHI -- Three UX Improvements task, Improvement 1: re-seeded (never
    // hardcoded "") from whatever the session already has -- "restore
    // the selections correctly after app interruption," so resuming
    // mid-flight on a step that already carries a custom supportive
    // feeling shows the text box already filled, not blank.
    setCustomSupportiveFeelingDraft(session?.customSupportiveFeelingText ?? "");
    // ARCHI -- Allow Action Selection During Emotion Identification or
    // Defer It to Regulation task: both start collapsed on every fresh
    // entry to their own step/sub-step (this effect's own dependency
    // array below already includes subIndex, so re-entering Regulation's
    // subIndex 1 after having left it also resets this) -- a trainee
    // who already has a selection always sees the plain summary first,
    // never stuck mid-edit from a previous visit.
    setShowActionSelectorOnEmotion(false);
    setShowActionSelectorOnRegulation(false);
    setShowMoreMovements(false);
    setShowMoreAreas(false);
    setShowMoreUnpleasantAreas(false);
    setShowMoreDesiredFeelingAreas(false);
    setUnpleasantSensationDraft(session?.unpleasantSensationDescription ?? "");
    setMiniSelectedEmotion(null);
    setMiniSupportiveFeelingOverride(session?.customSupportiveFeelingText ? resolveFinalSupportiveFeeling(session!) : null);
    setMiniCustomSupportiveFeelingDraft(session?.customSupportiveFeelingText ?? "");
    setMiniSupportiveFeelingIsCustom(!!session?.customSupportiveFeelingText);
    // Requirement 2: the shared "cognitive_selector" screen's own three
    // checkboxes -- seeded from whatever the session already has (e.g.
    // carried over from a planned ARC), never forced to start unchecked
    // when a draft already provides a value. An ordinary fresh session
    // has every one of these fields null/false, so this is a no-op
    // blank reset for it, exactly like every other draft here.
    setCogSelectThought(!!session?.selectedCognitiveThought);
    setCogSelectInterpretation(!!session?.selectedCognitiveInterpretation);
    setCogSelectUrge(!!session?.selectedCognitiveUrge);
    // Requirement 3B: Mini ARC's own upgraded "mini_thought" screen --
    // same seeding precedent, for its own three independent checkboxes
    // and their own three independent text drafts.
    setMiniCogThought(!!session?.selectedCognitiveThought);
    setMiniCogInterpretation(!!session?.selectedCognitiveInterpretation);
    setMiniCogUrge(!!session?.selectedCognitiveUrge);
    setMiniThoughtDraft(session?.currentThought ?? "");
    setMiniInterpretationDraft(session?.interpretationText ?? "");
    setMiniUrgeDraft(session?.urgeText ?? "");
    setMiniDesiredEndingDraft("");
    setMiniSensationDraft("");
    setMiniMovementDraft("");
    // Urge-stop task, requirement 6 (via arc/plannedArc.ts's own
    // resolvePlannedArcPrefillFields -> createSessionFromPlannedArcFields):
    // same "prefilled but still re-editable, never silently skipped"
    // precedent as miniMantraText/miniBeliefText just above -- a run
    // started from a saved PlannedArc shows its last-saved urge as a
    // starting point, but the trainee answers this screen live every time.
    setUrgeDraft(session?.urgeText ?? "");
    // ARCHI -- Action-Readiness Check task: re-seeded from the session's
    // own already-confirmed ratings (e.g. returning to this step via
    // goBack) rather than always blank, same "prefilled but still
    // re-editable" precedent as urgeDraft right above.
    setUnpleasantIntensityDraft(session?.unpleasantIntensityRating ?? null);
    setActionReadinessDraft(session?.actionReadinessRating ?? null);
    setTimeAvailableDraft(session?.timeAvailableRating ?? null);
    // ARCHI -- Unified Final Specification task, section 2: same "blank
    // draft on every step change" convention as every other scratch
    // field here -- the Action Selection screen's own temporary-action
    // text/duration never leaks in from a previous, unrelated step.
    setTempActionTitleDraft("");
    setTempActionDurationDraft("10");
    // Closing any lingering info popup on step change is a UI-only
    // reset -- it never touches session, so the selections it was
    // opened over are already safe regardless (see infoModal's own
    // doc comment above).
    setInfoModal(null);
  }, [session?.currentStep, session?.subIndex]);

  useEffect(() => {
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    if (!session) return;
    const dwellSeconds = getStepContent(session).dwellSeconds;
    if (!dwellSeconds) {
      setCanContinue(true);
      return;
    }
    setCanContinue(false);
    dwellTimerRef.current = setTimeout(() => setCanContinue(true), dwellSeconds * 1000);
    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    };
  }, [session?.currentStep, session?.subIndex]);

  /**
   * Positive Memory, Success Recall & Quick Capture task, section 8:
   * resolves a matching documented positive memory exactly once per
   * encoding entry (keyed by step+feeling, via
   * positiveMemoryEncodingResolvedKeyRef -- never re-resolved on every
   * render, and never while leaving the encoding step, when the ref is
   * cleared so the next encoding entry resolves fresh). A documented
   * feeling match is REQUIRED (resolveFinalSupportiveFeeling returning
   * null -- no feeling resolved at all -- leaves the state at its inert
   * default, so the existing <ArcBodyMantraCircle> renders exactly as
   * before). Never invents a memory: selectPositiveMemoryForFeeling
   * only ever returns a real, previously-saved PositiveMemory or null.
   */
  useEffect(() => {
    if (!session || (session.currentStep !== "encoding" && session.currentStep !== "mini_encoding")) {
      positiveMemoryEncodingResolvedKeyRef.current = null;
      return;
    }
    const feeling = resolveFinalSupportiveFeeling(session);
    if (!feeling) {
      positiveMemoryEncodingResolvedKeyRef.current = null;
      setPositiveMemoryForEncoding(null);
      return;
    }
    const resolvedKey = `${session.currentStep}:${feeling.feeling.trim().toLowerCase()}`;
    if (positiveMemoryEncodingResolvedKeyRef.current === resolvedKey) return;
    positiveMemoryEncodingResolvedKeyRef.current = resolvedKey;
    let cancelled = false;
    (async () => {
      const [memories, history] = await Promise.all([loadPositiveMemories(), loadPositiveMemorySelectionHistory()]);
      if (cancelled) return;
      const contextTaskId = session.taskId === STANDALONE_ARC_TASK_ID ? null : session.taskId;
      const picked = selectPositiveMemoryForFeeling(memories, feeling.feeling, { taskId: contextTaskId }, history, []);
      setPositiveMemoryForEncoding(picked);
      setPositiveMemoryEncodingDismissed(false);
      setPositiveMemoryEncodingExcludedIds([]);
      if (picked) {
        const updatedHistory = recordPositiveMemorySelection(history, picked.id, "encoding_feeling", feeling.feeling.trim().toLowerCase(), new Date().toISOString());
        await savePositiveMemorySelectionHistory(updatedHistory);
      }
      // Positive Memory task, section 10: a lightweight, overwritten-
      // not-accumulated record of the REAL feeling resolved in
      // encoding for this real (non-standalone) task -- so the
      // post-completion reflection screen can personalize its own
      // question 2 without ever guessing/assuming a feeling.
      if (contextTaskId) {
        await recordLastEncodingFeelingForTask(contextTaskId, feeling.feeling, new Date().toISOString());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.currentStep, session]);

  /** "אירוע אחר": re-selects a different eligible documented memory for the same feeling, never fabricating one. */
  const handlePositiveMemoryEncodingAnother = useCallback(async () => {
    if (!session || !positiveMemoryForEncoding) return;
    const feeling = resolveFinalSupportiveFeeling(session);
    if (!feeling) return;
    const [memories, history] = await Promise.all([loadPositiveMemories(), loadPositiveMemorySelectionHistory()]);
    const excludeIds = [...positiveMemoryEncodingExcludedIds, positiveMemoryForEncoding.id];
    const contextTaskId = session.taskId === STANDALONE_ARC_TASK_ID ? null : session.taskId;
    const picked = selectPositiveMemoryForFeeling(memories, feeling.feeling, { taskId: contextTaskId }, history, excludeIds);
    setPositiveMemoryEncodingExcludedIds(excludeIds);
    setPositiveMemoryForEncoding(picked);
    if (picked) {
      const updatedHistory = recordPositiveMemorySelection(history, picked.id, "encoding_feeling", feeling.feeling.trim().toLowerCase(), new Date().toISOString());
      await savePositiveMemorySelectionHistory(updatedHistory);
    }
  }, [session, positiveMemoryForEncoding, positiveMemoryEncodingExcludedIds]);

  /** "דלג": continues with the original, unchanged encoding flow for the rest of this encoding step. */
  const handlePositiveMemoryEncodingSkip = useCallback(() => {
    setPositiveMemoryEncodingDismissed(true);
  }, []);

  // Nine Functional Improvements task, Improvement 3: ticks the
  // displayed remaining time once a second while the internal-action
  // timer is running (never while paused or absent) -- exact same
  // "setInterval(() => setNow(Date.now()), 1000)" precedent
  // live/ActiveTaskScreen.tsx's own task timer already uses.
  useEffect(() => {
    if (!internalActionRun || internalActionRun.pausedAt) return;
    const interval = setInterval(() => setInternalActionTickNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [internalActionRun]);

  async function handleStartInternalActionTimer() {
    const parsedDuration = Number(internalActionDurationDraft);
    const durationMinutes = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 10;
    const run = createTaskTimerRun(taskId, generateTaskTimerRunId(), durationMinutes, new Date().toISOString());
    await saveInternalActionTimerRun(run);
    setInternalActionRun(run);
  }

  async function handlePauseInternalActionTimer() {
    if (!internalActionRun) return;
    const paused = pauseTaskTimerRun(internalActionRun, new Date().toISOString());
    await saveInternalActionTimerRun(paused);
    setInternalActionRun(paused);
  }

  async function handleResumeInternalActionTimer() {
    if (!internalActionRun) return;
    const resumed = resumeTaskTimerRun(internalActionRun, new Date().toISOString());
    await saveInternalActionTimerRun(resumed);
    setInternalActionRun(resumed);
  }

  /** "סיום" is available at any time (same early-finish precedent as every other timed activity in this app), not gated on the timer having actually run out. */
  async function handleFinishInternalActionTimer() {
    if (!session) return;
    await clearInternalActionTimerRun();
    setInternalActionRun(null);
    commit(advance(session, new Date().toISOString()));
  }

  function commit(next: NewArcLiveSessionState) {
    setSession(next);
    saveNewArcLiveSession(next);
  }

  /**
   * Part C: shared by every path that ends a spontaneous session's own
   * practice (the shared "complete" case below, AND the Task track's
   * own dedicated transition menu, which bypasses "complete" entirely
   * by calling completeSession+returnToTask in the same tick) -- one
   * mechanism, never duplicated per track. A no-op for any planned
   * session. Guarded against double-processing via hasDraftForExercise.
   */
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: no longer auto-generates a "mini" draft -- Mini ARC is no
  // longer a user-choosable option anywhere, so there is no menu left
  // that would ever offer it. The "full" draft's own generation is
  // completely unaffected.
  async function generateDraftsIfSpontaneous(finishedSession: NewArcLiveSessionState, now: string) {
    if (finishedSession.arcInvocationMode !== "spontaneous") return;
    const existingDrafts = await loadPlannedArcs();
    if (!hasDraftForExercise(existingDrafts, finishedSession.createdAt, "full")) {
      await upsertPlannedArc(createPlannedArcFromSession(finishedSession, "full", generatePlannedArcId(), now));
    }
  }

  /**
   * ARC GYM task: folds this just-finished session's own captured
   * fields into the situation's memory (arc/arcGym.ts's own
   * recordArcGymMemoryFromSession -- reusing the session's existing
   * fields, never re-asking for anything), and marks whichever
   * training-history record was opened for this run as completed.
   * Never called for an abandoned/interrupted session (only from
   * returnToTask's own ARC-GYM branch below, reached exclusively by
   * actually finishing).
   */
  async function finishArcGymTraining(finishedSession: NewArcLiveSessionState) {
    const situationId = finishedSession.arcGymSituationId;
    if (!situationId) return;
    const now = new Date().toISOString();
    const [memories, records] = await Promise.all([loadArcGymMemories(), loadArcGymTrainingRecords()]);
    const memory = findArcGymMemory(memories, situationId) ?? createEmptyArcGymMemory(situationId, now);
    await upsertArcGymMemoryEntry(recordArcGymMemoryFromSession(memory, finishedSession, now));
    const openRecord = findOpenArcGymTrainingRecord(records, situationId);
    if (openRecord) await upsertArcGymTrainingRecordEntry(completeArcGymTrainingRecord(openRecord, now));
  }

  /**
   * ARC Gym + ARC Goal Integration task: the ARC Memory equivalent of
   * finishArcGymTraining above -- called ONLY from returnToTask's own
   * arcGymMemoryExerciseId branch, reached exclusively by actually
   * finishing the preliminary 😟/🙂 check-in ARC. Writes the single-slot
   * resume record ArcGymMemoryVisualizationScreen.tsx consumes exactly
   * once on its next focus, so it can skip straight back to its own
   * "action" step rather than re-walking trigger/noticing/check-in.
   * Deliberately never touches ArcGymMemory/ArcGymTrainingRecord --
   * those are Behaviour-only bookkeeping that assumes a real
   * ArcGymSituation.id, never an ArcGymMemoryExercise.id.
   */
  async function finishArcGymMemoryCheckIn(finishedSession: NewArcLiveSessionState) {
    const exerciseId = finishedSession.arcGymMemoryExerciseId;
    if (!exerciseId) return;
    const checkInChoice: "full_arc" | "shortened_arc" = finishedSession.arcInvocationMode === "shortened" ? "shortened_arc" : "full_arc";
    const now = new Date().toISOString();
    await saveArcGymMemoryCheckInProgress(createArcGymMemoryCheckInProgress(exerciseId, 2, checkInChoice, now));
  }

  /**
   * ARCHI -- ARC Result: Automatic, Optional Suggestion Without Extra
   * Shortcuts task, section 3: "resolve the exact task the user
   * selected for execution, using the existing post-ARC task-selection
   * logic" -- this is called ONLY from the two returnToTask branches
   * below that already resolved a REAL, pre-existing task to return to
   * (an explicitly selected scheduled task, or the session's own
   * taskId) -- never for a brand-new temporary-action task (which,
   * being created this instant, can never already have a linked
   * result) and never for the ARC-GYM/morning-flow/standalone branches
   * (none of which have a real task to link a result to at all).
   * `autoStart` is only ever forwarded, never decided here, so opening
   * or skipping the suggestion never changes whether the task
   * auto-starts -- "never automatically start a task timer merely
   * because the user opened or skipped an ARC Result suggestion."
   */
  async function routeToTaskOrArcResultSuggestion(targetTaskId: string, autoStart: boolean) {
    const exercises = await loadArcResultExercises();
    if (hasLinkedArcResult(exercises, targetTaskId)) {
      router.replace({
        pathname: "/arc-result-suggestion",
        params: autoStart ? { taskId: targetTaskId, autoStart: "1" } : { taskId: targetTaskId },
      });
      return;
    }
    router.replace(autoStart ? { pathname: "/tasks/[id]", params: { id: targetTaskId, autoStart: "1" } } : { pathname: "/tasks/[id]", params: { id: targetTaskId } });
  }

  async function returnToTask(autoStart: boolean) {
    await clearNewArcLiveSession();
    // Nine Functional Improvements task, Improvement 4: the Full/
    // Shortened ARC exercise just fully ended (this function is only
    // ever reached once completeSession has already run) -- ARC GYM's
    // OWN personalized positive-action visualization is a SEPARATE
    // step that must happen STRICTLY AFTER that, never during
    // Acceptance/Regulation/Encoding (arc/newArcLiveCopy.ts's
    // getEncodingContent no longer overrides its content for this
    // reason). finishArcGymTraining already completes the real
    // full_arc/shortened_arc training record and records ARC GYM
    // memory -- recordAlreadyFinished=1 tells the shared visualization
    // screen (the SAME one the 😄 "Excellent" route already uses) not
    // to create a second, duplicate completion record for it.
    if (session?.arcGymSituationId) {
      await finishArcGymTraining(session);
      // ARC Gym + ARC Goal Integration task: a real (non-standalone)
      // taskId means this is the Behaviour+Success COMBINED scheduled
      // practice (build/ArcGymSituationScreen.tsx's own "תזמן אימון"
      // action, which opens Full/Shortened ARC with the real taskId --
      // never the sentinel). The paired Success (if any) is derived
      // fresh via findPairedArcResultForSituation -- never given its
      // own schedule entry, so "never independently schedulable" holds
      // structurally -- and practiced next via the EXISTING
      // live/ArcResultPracticeScreen.tsx (no `origin`, so it returns to
      // THIS real task afterward, exactly like the automatic
      // suggestion flow already does), never a second, duplicated
      // practice screen. No pair -> deliberately falls through
      // (no return here) all the way to this function's own single,
      // final routeToTaskOrArcResultSuggestion(taskId, autoStart) call
      // below -- never a second copy of that exact call, and every
      // intervening check above it is for session fields an ARC GYM
      // session never sets, so nothing else can intercept it.
      if (taskId !== STANDALONE_ARC_TASK_ID) {
        const resultExercises = await loadArcResultExercises();
        const paired = findPairedArcResultForSituation(resultExercises, session.arcGymSituationId);
        if (paired) {
          router.replace(
            autoStart
              ? { pathname: "/arc-result-practice/[id]", params: { id: paired.id, taskId, autoStart: "1" } }
              : { pathname: "/arc-result-practice/[id]", params: { id: paired.id, taskId } }
          );
          return;
        }
      } else {
        // Standalone ARC GYM practice (no real Task): "complete the
        // training session without automatically starting an unrelated
        // task" -- returns to the situation's own screen instead of
        // /tasks.
        router.replace({ pathname: "/arc-gym/visualize-only/[id]", params: { id: session.arcGymSituationId, recordAlreadyFinished: "1" } });
        return;
      }
    }
    // ARC Gym + ARC Goal Integration task: this ARC run was the
    // preliminary 😟/🙂 check-in inserted into ARC Memory's own flow,
    // between its trigger/noticing steps and its action step -- never
    // resolved as a normal task completion, same reasoning as
    // arcGymSituationId above. finishArcGymMemoryCheckIn writes the
    // resume record the Memory screen reads on its next focus to skip
    // straight back to its own action step.
    if (session?.arcGymMemoryExerciseId) {
      await finishArcGymMemoryCheckIn(session);
      router.replace({ pathname: "/arc-gym/memory/[id]/train", params: { id: session.arcGymMemoryExerciseId } });
      return;
    }
    // ARC Focus task: this ARC run was the preliminary 😟/🙂 check-in
    // step for a planned arc/arcFocusSession.ts ArcFocusSession -- never
    // resolve it as a normal task completion. `taskId` is carried
    // through UNCHANGED (real task or the standalone sentinel, per
    // NewArcLiveSessionState.arcFocusPracticeId's own doc -- unlike
    // arcGymSituationId above, this never forced it), so
    // ArcFocusLiveScreen opens for the exact right task/standalone
    // context and loads the SAME persisted practice by id -- no
    // re-pick, no second session.
    if (session?.arcFocusPracticeId) {
      router.replace({ pathname: "/tasks/[id]/arc-focus", params: { id: taskId, arcFocusPracticeId: session.arcFocusPracticeId } });
      return;
    }
    // ARC Perspective task: this ARC run was the preliminary 😟/🙂
    // check-in step for an in-progress arc/arcPerspective.ts
    // ArcPerspectiveSession -- never resolved as a normal task
    // completion. The in-progress record (saved by
    // build/ArcPerspectiveFlowScreen.tsx right before it navigated into
    // this ARC) is advanced from "mood_check_in" to "perspective_shift"
    // here, so the flow screen resumes exactly where it left off on its
    // next focus, never re-walking the event/mood-check-in steps.
    if (session?.arcPerspectiveId) {
      const progress = await loadArcPerspectiveInProgress();
      if (progress && progress.id === session.arcPerspectiveId && !progress.completedAt) {
        await saveArcPerspectiveInProgress(advanceArcPerspectiveFromMoodCheckIn(progress));
      }
      router.replace({ pathname: "/arc-perspective/[id]", params: { id: session.arcPerspectiveId } });
      return;
    }
    // ARC Saving task: this ARC run was launched from a trigger's own
    // chosen ArcSavedBodyOption (or a standalone ArcSavedExercise's own
    // "תרגל שוב") -- never resolved as a normal task completion. The
    // final, possibly-edited snapshot is captured and handed to the
    // single-slot pending-review record (saveArcSavingPendingReview);
    // build/ArcSavingReviewScreen.tsx reads it once on its next focus
    // and runs the real divergence check there (never here -- this
    // function stays a plain navigation call, no Alert). `taskId` is
    // carried through UNCHANGED, same as arcFocusPracticeId/
    // arcPerspectiveId above -- never forced, so a trigger activated
    // mid-task returns to that exact task.
    if (session?.arcSavingBodyOptionId || session?.arcSavingExerciseId || session?.arcSavingTriggerIdForNewOption) {
      await saveArcSavingPendingReview({
        bodyOptionId: session.arcSavingBodyOptionId,
        exerciseId: session.arcSavingExerciseId,
        triggerIdForNewOption: session.arcSavingTriggerIdForNewOption,
        finalSnapshot: captureArcBodyProtocolSnapshot(session),
        activeTaskId: taskId === STANDALONE_ARC_TASK_ID ? null : taskId,
        completedAt: new Date().toISOString(),
      });
      // A single, static route -- never a per-id dynamic segment -- since
      // there is only ever at most one pending ArcSavingPendingReview at
      // a time (same "one resumable slot" convention as every other
      // in-progress record in this codebase); the review screen reads it
      // directly rather than trusting a route param for its own logic.
      router.replace("/arc-saving/review");
      return;
    }
    // Morning Flow Simplification task, section 1: "after completing
    // the chosen pathway, continue to the morning preparation
    // sequence" -- always back to Home ("/"), regardless of whether
    // this session ended up standalone or linked to a real active
    // task, since live/DailyStartupSequenceOverlay.tsx (a fixed
    // sibling of the Stack, never unmounted by this trip) is the one
    // that actually resumes the rest of the sequence once it detects
    // the pathname is "/" again.
    if (morningFlowCheckIn) {
      router.replace("/");
      return;
    }
    // ARCHI -- Unified Final Specification task, section 6 ("POST-ARC
    // ROUTING"): offer the SAME action selected right before Encoding
    // -- never silently starting a future task, changing the selected
    // task, or advancing to another one. Both "an explicitly selected
    // scheduled task" and "a selected due task" resolve identically
    // here (setSelectedAction's own doc), by navigating to that EXACT
    // task's own Task LIVE/Details screen -- never with autoStart, so
    // the trainee still taps Start themselves ("never start a task
    // automatically without explicit user action").
    if (session?.selectedActionSource === "scheduledTask" && session.selectedActionTaskId) {
      await routeToTaskOrArcResultSuggestion(session.selectedActionTaskId, false);
      return;
    }
    // A temporary action is created now, at this exact moment -- never
    // earlier -- so its own clamped duration reflects the CURRENT time
    // remaining until the next scheduled task ("recalculate available
    // time when the timer actually starts"), never the stale estimate
    // Action Selection showed minutes/tens-of-minutes ago while the ARC
    // exercise itself was still running.
    if (session?.selectedActionSource === "temporaryAction" && session.selectedActionTitle) {
      const newTaskId = await createTemporaryActionTask(session.selectedActionTitle, session.selectedActionDurationMinutes);
      router.replace({ pathname: "/tasks/[id]", params: { id: newTaskId } });
      return;
    }
    // Part B.1 / Unified ARC & Productivity Update task, requirement 10
    // ("Standalone emotion-only -> safe originating screen"): a
    // standalone session has no task screen to return to. Home ("/")
    // is the one destination that is ALWAYS valid regardless of which
    // of this session's own real origins it actually was (the Home
    // check-in bar's own "😟/🙂" choice when no task is active, or
    // live/SpontaneousArcEntryScreen.tsx's own "standalone" button) --
    // and is already this app's own actual primary/default screen
    // (app/index.tsx), so it is never a worse choice than the tasks
    // list even when the trainee really did come from there.
    if (taskId === STANDALONE_ARC_TASK_ID) {
      router.replace("/");
      return;
    }
    await routeToTaskOrArcResultSuggestion(taskId, autoStart);
  }

  /**
   * ARCHI -- Unified Final Specification task, section 4 ("TEMPORARY
   * ACTIONS BEFORE THE NEXT SCHEDULED TASK"): creates the ad-hoc Task
   * now needed to actually start the trainee's chosen temporary action
   * -- reusing the EXACT SAME creation recipe
   * build/FlexibleDailyScreen.tsx's own handleAddDirect already uses
   * for a direct task/break/ARC entry (createEmptyTask + upsertTask +
   * reconcileTaskAlarms, scheduledDate: today, calendarEntryKind left
   * null -- an ordinary task, never a special calendar-only entry),
   * never a second task-creation mechanism. `recurrence: {kind:"once"}`
   * is createEmptyTask's own default, so "never create recurring
   * temporary tasks" holds automatically. The duration is clamped HERE,
   * against the freshly re-resolved plan (never the stale
   * Action-Selection-time estimate) -- "recalculate available time when
   * the timer actually starts." Never auto-starts the task itself; the
   * caller navigates to its own Task LIVE/Details screen, where the
   * trainee taps Start, same as every other non-auto-start entry point.
   */
  async function createTemporaryActionTask(title: string, requestedDurationMinutes: number | null): Promise<string> {
    const now = new Date();
    const scheduled = await resolveTodaysScheduledPlan(now);
    const availableMinutes = resolveMinutesUntilNextTask(scheduled, taskId, now);
    const requested = requestedDurationMinutes && requestedDurationMinutes > 0 ? requestedDurationMinutes : 10;
    const durationMinutes = availableMinutes !== null ? Math.max(1, Math.min(requested, availableMinutes)) : requested;
    const id = generateTaskId();
    const nowIso = now.toISOString();
    const task = { ...createEmptyTask(id, title, title, nowIso), scheduledDate: todayLocalDateString(now), expectedDurationMinutes: durationMinutes };
    await upsertTask(task);
    await reconcileTaskAlarms();
    return id;
  }

  /**
   * ARCHI -- Unified 7-Part Update task, Part 5 ("ENCODING MUST LEAD
   * DIRECTLY TO ACTION"): "there should be no extra goal, ending,
   * emotional-action, or preparation questions after Encoding" -- the
   * old "transition" menu (four options, including the real alarm's
   * own bypass) and the old "complete" screen's own single manual
   * "חזרה למשימה" tap are BOTH gone, replaced by this one effect: the
   * instant resolveNextStep carries the session from Encoding straight
   * to "complete" (every goalType, every route, since "transition"/
   * "emotional_action"/"emotional_insight"/"mini_action" are all
   * permanently unreachable now), this fires automatically -- no tap,
   * no menu. Fires at most once per session instance (completeConsumedRef),
   * same single-fire guard every other auto-action effect in this file
   * already uses.
   *
   * `autoStartAfter` (the real alarm's own "the timer will start after
   * ARC completes" flag; see app/tasks/[id]/arc.tsx) decides
   * returnToTask's own autoStart argument -- true only for that one
   * real-alarm entry point, exactly preserving its pre-existing
   * behavior; every ordinary completion (autoStartAfter always false)
   * returns exactly like the old manual "complete" button did.
   * "Resume or retain paused status according to existing
   * timer-resumption rules" is therefore unchanged -- this effect only
   * changes WHEN returnToTask fires (automatically, on reaching
   * "complete"), never the timer-resumption logic itself.
   */
  const completeConsumedRef = useRef(false);
  useEffect(() => {
    if (!session || session.currentStep !== "complete" || completeConsumedRef.current) return;
    completeConsumedRef.current = true;
    (async () => {
      const completionNow = new Date().toISOString();
      // Part E/B.3: persist the captured insight (always, when
      // present -- realistically only a historical session that
      // already had it set before "emotional_insight" became
      // unreachable) and an optional "learned" belief formulated from
      // it -- never invented, never forced. The Task track's own
      // identity insight/belief happens separately, at actual task
      // completion (see live/ActiveTaskScreen.tsx), never here.
      if (session.emotionalInsightText) {
        const insightId = generateArcInsightId();
        await appendArcInsight(
          createArcInsight({
            id: insightId,
            sourceExerciseId: session.createdAt,
            taskId: session.taskId === STANDALONE_ARC_TASK_ID ? null : session.taskId,
            beliefKind: "emotional",
            text: session.emotionalInsightText,
            occurredAt: completionNow,
            createdAt: completionNow,
          })
        );
        if (session.emotionalBeliefText) {
          await upsertArcBelief(createLearnedBelief(generateArcBeliefId(), "emotional", session.emotionalBeliefText, insightId, session.createdAt, completionNow));
        }
      }
      // Part I: whenever an identity action is still ahead (the
      // Combined track always, and -- uniquely reachable via Mini
      // ARC's own flow -- the Task track too) mark it so its own
      // insight prompt appears once that action is actually completed.
      if (session.goalType !== "emotion_only") await savePendingIdentityInsightTaskId(taskId);
      await generateDraftsIfSpontaneous(session, completionNow);
      // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
      // task: a short-depth completion ("מעבר לפעולה עם הטיימר") always
      // auto-starts the task's own already-known first action's timer,
      // regardless of autoStartAfter -- ordinary full-depth completions
      // keep that flag's existing behavior completely unaffected.
      returnToTask(autoStartAfter || session.arcPracticeDepth === "short");
    })();
  }, [session?.currentStep]);

  /**
   * ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
   * Background task: "the color gradually expands... becomes
   * uniform... the transition completes smoothly without flashing."
   * A single continuous Reanimated value, never a second, independent
   * animation for the background -- it only ever runs WHILE the
   * trainee is actually on "free_breathing" (so it never replays on
   * later steps); a session that resumes with freeBreathingIntroShown
   * already true jumps straight to the fully-expanded value with no
   * animation at all ("never restart the breathing introduction
   * unnecessarily when restoring"). Declared above every early return
   * below, per the Rules of Hooks.
   */
  const reduceMotionEnabled = useReducedMotion();
  const backgroundProgress = useSharedValue(0);
  useEffect(() => {
    if (!session) return;
    if (session.freeBreathingIntroShown) {
      backgroundProgress.value = 1;
    } else if (session.currentStep === "free_breathing") {
      backgroundProgress.value = reduceMotionEnabled ? 1 : withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) });
    } else {
      backgroundProgress.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- backgroundProgress is a SharedValue, stable across renders by design.
  }, [session?.currentStep, session?.freeBreathingIntroShown, reduceMotionEnabled]);
  const backgroundWashStyle = useAnimatedStyle(() => ({ opacity: backgroundProgress.value }));

  // ARC session-resume conflict fix, requirements 3/4: a different,
  // still-unfinished session already exists -- show the trainee a
  // deliberate choice instead of silently resuming or discarding it.
  if (conflict) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>יש תרגיל ARC פתוח שלא הושלם</Text>
          <Text style={styles.hint}>תרגיל פתוח: {conflict.existingLabel}</Text>
          <Text style={styles.hint}>תרגיל מבוקש: {conflict.requestedLabel}</Text>
          {/* Phase 1, requirement 2: explicit, unambiguous warning -- shown
              before any replacing action can be taken, never assumed. */}
          <Text style={styles.warningText}>אם תתחיל את ה-ARC החדש, ההתקדמות שלא נשמרה בתרגיל הפתוח תימחק ולא ניתן יהיה לשחזר אותה.</Text>
          <View style={styles.chipColumn}>
            <Pressable style={styles.primaryButton} onPress={resumeExistingSession}>
              <Text style={styles.primaryButtonText}>להמשיך את ה-ARC הקודם</Text>
            </Pressable>
            {/* Phase 1, requirement 3: this button IS the explicit confirmation --
                it only replaces the session when the trainee taps it here, after
                seeing the warning above; nothing before this screen replaces anything. */}
            <Pressable style={styles.secondaryButton} onPress={startRequestedSession}>
              <Text style={styles.secondaryButtonText}>להתחיל ARC חדש (מחיקת ההתקדמות הקודמת)</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={cancelConflict}>
              <Text style={styles.secondaryButtonText}>ביטול</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const now = new Date().toISOString();
  const content = getStepContent(session);
  const progress = resolveProgress(session);
  const previous = resolvePreviousStep(session);
  // ARCHI -- Unified 7-Part Update task, Part 7.2 ("ARC APPEARANCE
  // SETTINGS"): the trainee's own persistent point/circle color now
  // drives EVERY ArcBodyMantraCircle call site below, replacing the
  // old per-session, manually-chosen session.selectedFocusColor (the
  // "focus_color" step itself is permanently unreachable now --
  // arc/newArcLiveSteps.ts). circleColorHex falls back to the point
  // color when no circle color was configured independently -- "do
  // not hardcode purple," but also never force a second, separate
  // choice on a trainee who never touched that setting.
  const presenceColorHex = resolveFocusColorHex(appearanceSettings.pointColor);
  const circleColorHex = resolveFocusColorHex(appearanceSettings.circleColor ?? appearanceSettings.pointColor);
  const skippable = isStepSkippable(session.currentStep);
  // Final ARC Flow & Body Animation task, requirement 4, extended by
  // the Fix All Confirmed ARC Android Bugs task (requirement 2,
  // "Presence Mantras Inside the Circle"): all NINE mantra pages --
  // the five Presence pages (natural_breathing/center_attention/
  // visual_field/sound_awareness/body_scan) plus Dwelling, Acceptance,
  // Regulation, Encoding & Action -- render entirely through
  // ArcBodyMantraCircle (body + mantra inside the one circle,
  // tap-to-advance). The ordinary outer title/primary/supporting text
  // and the generic nav-row Continue button are both suppressed for
  // them below, so the mantra is never shown twice. "focus_color"
  // (its own real color-selection screen) is deliberately EXCLUDED --
  // it keeps its ordinary chip/text-input UI, never mantra-ified.
  // Unified ARC & Productivity Update task, requirement 7 ("START
  // PRESENCE DURING COGNITIVE ACCEPTANCE"): the acceptance MOMENT
  // itself for a thought/interpretation/urge now also renders through
  // ArcBodyMantraCircle, body hidden (requirement 8) -- but each of
  // these four steps has an earlier sub-screen (the chip-based
  // "which time?"/"what did you choose?" question, or the five
  // preparatory stop-and-accept-urge instructions) that must keep
  // showing its own plain chip/text UI as before, so the circle phase
  // is gated by sub-state, never the bare currentStep alone.
  // ARCHI -- Two Mantras for Urge Acceptance correction: "stop_and_
  // accept_urge" is now exactly ONE page -- always the circle, no
  // sub-index check needed any more (the five preparatory sub-screens
  // that used to precede it are gone entirely).
  const isUrgeAcceptanceCirclePhase = session.currentStep === "stop_and_accept_urge";
  const isMiniUrgeAcceptanceCirclePhase = session.currentStep === "mini_stop_accept_urge";
  // ARCHI -- Universal ARC Routing, Emotion Identification & Android
  // Shortcuts task, requirement 6-7: "reality_acceptance" is now
  // reachable ONLY with a real thought (the old mode-A "!currentThought"
  // fallback is gone -- that content moved to its own, always-separate
  // "interpretation_acceptance" step below), so the circle phase is
  // simply "once an orientation is chosen."
  const isThoughtAcceptanceCirclePhase = session.currentStep === "reality_acceptance" && session.subIndex >= 1;
  const isMiniThoughtAcceptanceCirclePhase = session.currentStep === "mini_reality_acceptance" && (!session.currentThought || !!session.thoughtTimeOrientation);
  // Requirement 7: Interpretation's own dedicated acceptance step is
  // ALWAYS the circle phase -- it has no earlier chip-based sub-screen
  // of its own (unlike thought/urge), since an interpretation has no
  // time orientation to ask about first.
  const isInterpretationAcceptanceCirclePhase = session.currentStep === "interpretation_acceptance";

  const isBodyMantraStage =
    session.currentStep === "natural_breathing" ||
    session.currentStep === "center_attention" ||
    session.currentStep === "visual_field" ||
    session.currentStep === "sound_awareness" ||
    session.currentStep === "body_scan" ||
    session.currentStep === "dwelling" ||
    session.currentStep === "acceptance" ||
    session.currentStep === "acceptance_part_two" ||
    // ARCHI -- Show Action Selection ON the Regulation Screen task:
    // "regulation" is now always exactly one sub-screen -- the circle/
    // mantra and the (optional) action-selection section both render
    // together on it, via the dedicated case "regulation" below, which
    // never falls through to the generic title/primary header.
    session.currentStep === "regulation" ||
    session.currentStep === "encoding" ||
    // Part 6: mini_presence renders the full-screen circle too, same
    // centered layout as every other body-mantra stage.
    session.currentStep === "mini_presence" ||
    // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
    // task: the shared "quick presence" short-depth screen renders the
    // full-screen circle too.
    session.currentStep === "quick_presence" ||
    // ARCHI -- Consolidated Implementation Request, Part 9 ("Mini ARC
    // Encoding: Body + Expanded Circle"): mini_encoding now renders
    // through the SAME body-mantra circle (stage="encoding") as
    // Full/Shortened ARC's own Encoding step, so the body visualization
    // and the larger, progressively-expanded circle are integrated in
    // ONE screen here too, never a split pair of screens.
    session.currentStep === "mini_encoding" ||
    isUrgeAcceptanceCirclePhase ||
    isMiniUrgeAcceptanceCirclePhase ||
    isThoughtAcceptanceCirclePhase ||
    isMiniThoughtAcceptanceCirclePhase ||
    isInterpretationAcceptanceCirclePhase;

  // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
  // Background task: "do not add multiple explanatory screens" --
  // FreeBreathingIntro renders its OWN mantra text, so the generic
  // title/primary/supporting header (and the generic "דלג" link,
  // which this step never registers with isStepSkippable since its
  // own Continue/Skip buttons already cover that) stay hidden for this
  // one step, same convention as isBodyMantraStage above.
  const isFreeBreathingStage = session.currentStep === "free_breathing";

  // ARCHI -- Move Action Selection into the Existing Regulation Screen
  // task, section 6 ("reuse the current action-selection... logic
  // rather than implementing a second version"): the ONE implementation
  // of the "הפעולה הבאה"/"כתיבת פעולה" picker, used by "regulation" and
  // "mini_acceptance_transition" at their own subIndex 1, and by the
  // now-unreachable "action_selection"/"mini_action_selection" (kept
  // for historical-data safety). Identical body to the old standalone
  // step's own case -- lets the trainee pick an existing scheduled
  // task for today (even one planned hours later -- due now shown
  // first, never silently auto-chosen) or enter a temporary action
  // with a duration, clamped live against the time remaining until the
  // next scheduled task. Choosing either one calls the EXISTING
  // setSelectedAction, which already both persists the choice AND
  // advances in one call -- for "regulation"/"mini_acceptance_transition"
  // this now correctly lands directly on "encoding"/"mini_encoding"
  // (action_selection/mini_action_selection being permanently
  // unreachable), never a separate screen.
  function renderActionSelector() {
    // ARC Decision task: an inline overlay, replacing only this
    // sub-UI -- the trainee's active task/firstAction/session context
    // above never changes while this is shown (see arcDecisionSession's
    // own doc, near its useState declaration). Canceling or finishing
    // both clear this overlay and fall back to the exact same picker
    // below, never a navigation away from this screen.
    if (arcDecisionSession) {
      return (
        <ArcDecisionFlow
          session={arcDecisionSession}
          onChange={handleArcDecisionChange}
          onCancel={handleArcDecisionCancel}
          finishLabel="המשך"
          onFinish={handleArcDecisionFinish}
        />
      );
    }
    const nowDate = new Date();
    // Weekly/Flexible-Daily/ARC-LIVE task-sync fix: the ONE central
    // current/next decision (arc/dailyPlan.ts's resolveCurrentTaskState),
    // never a second, competing lookup -- this is exactly what used to
    // propose an already-elapsed task (e.g. an overnight "go to sleep"
    // entry) at 6:40am, since the old resolveNextScheduledTaskAfter/
    // isScheduledPlanEntryOverdue pair never checked whether the entry's
    // own scheduled window had already passed.
    const { current: currentEntry, next: nextEntry } = resolveCurrentTaskState(dailyPlanEntries, nowDate, null, taskId);
    const candidates = dailyPlanEntries.filter((entry) => entry.task.id !== taskId && !entry.isCompletedToday && entry.task.status !== "archived");
    const shownEntryId = currentEntry?.task.id ?? nextEntry?.task.id ?? null;
    const laterCandidates = shownEntryId ? candidates.filter((entry) => entry.task.id !== shownEntryId) : candidates;
    const availableMinutes = resolveMinutesUntilNextTask(dailyPlanEntries, taskId, nowDate);
    const parsedTempDuration = Number(tempActionDurationDraft);
    const requestedTempDuration = Number.isFinite(parsedTempDuration) && parsedTempDuration > 0 ? parsedTempDuration : 10;
    const clampedTempDuration = availableMinutes !== null ? Math.max(1, Math.min(requestedTempDuration, availableMinutes)) : requestedTempDuration;
    // ARCHI -- BUG: Action Selection Is Missing from Regulation in All
    // ARC Pathways task, Option A ("If a task is already active, offer
    // its current/first action"): isActiveTaskLiveOrigin no longer
    // skips this whole prompt (see stepSubCount, arc/newArcLiveSteps.ts),
    // so when a task really is active this adds its own first/current
    // action as a direct, one-tap option -- reusing the exact same
    // "scheduledTask" shape/taskId every other option here already
    // uses, so taskId/occurrence identity and returnToTask routing are
    // preserved exactly as for any other scheduled-task selection.
    const activeTaskActionLabel = session!.isActiveTaskLiveOrigin ? session!.firstAction?.trim() || session!.taskTitle?.trim() || null : null;

    function chooseScheduledTask(entry: ScheduledPlanEntry) {
      commit(setSelectedAction(session!, { source: "scheduledTask", taskId: entry.task.id, title: entry.task.title, firstAction: entry.task.firstAction?.trim() || null }, now));
    }
    function chooseActiveTaskAction() {
      commit(setSelectedAction(session!, { source: "scheduledTask", taskId, title: session!.taskTitle, firstAction: session!.firstAction?.trim() || null }, now));
    }
    function chooseTemporaryAction() {
      const title = tempActionTitleDraft.trim();
      if (!title) return;
      commit(setSelectedAction(session!, { source: "temporaryAction", title, durationMinutes: clampedTempDuration }, now));
    }

    return (
      <View>
        {activeTaskActionLabel && (
          <View style={styles.supportiveFeelingSection}>
            <Text style={styles.supportiveFeelingLabel}>המשימה הפעילה כעת</Text>
            <View style={styles.chipColumn}>
              <Pressable style={styles.optionRow} onPress={chooseActiveTaskAction}>
                <Text style={styles.optionText}>{activeTaskActionLabel}</Text>
              </Pressable>
            </View>
          </View>
        )}
        {currentEntry && (
          <View style={styles.supportiveFeelingSection}>
            <Text style={styles.supportiveFeelingLabel}>המשימה כרגע</Text>
            <View style={styles.chipColumn}>
              <Pressable style={styles.optionRow} onPress={() => chooseScheduledTask(currentEntry)}>
                <Text style={styles.optionText}>{currentEntry.effectiveStartTime ? `${currentEntry.task.title} -- ${currentEntry.effectiveStartTime}` : currentEntry.task.title}</Text>
              </Pressable>
            </View>
          </View>
        )}
        {!currentEntry && nextEntry && (
          <View style={styles.supportiveFeelingSection}>
            <Text style={styles.supportiveFeelingLabel}>המשימה הקרובה</Text>
            <View style={styles.chipColumn}>
              <Pressable style={styles.optionRow} onPress={() => chooseScheduledTask(nextEntry)}>
                <Text style={styles.optionText}>{nextEntry.effectiveStartTime ? `${nextEntry.task.title} -- ${nextEntry.effectiveStartTime}` : nextEntry.task.title}</Text>
              </Pressable>
            </View>
          </View>
        )}
        {!currentEntry && !nextEntry && (
          <View style={styles.supportiveFeelingSection}>
            <Text style={styles.hint}>אין משימות נוספות מתוכננות להיום.</Text>
          </View>
        )}
        <View style={styles.supportiveFeelingSection}>
          <Text style={styles.supportiveFeelingLabel}>משימות מתוזמנות להיום</Text>
          {laterCandidates.length === 0 ? (
            <Text style={styles.hint}>אין משימות נוספות מתוזמנות להיום.</Text>
          ) : (
            <View style={styles.chipColumn}>
              {laterCandidates.map((entry) => (
                <Pressable key={entry.task.id} style={styles.optionRow} onPress={() => chooseScheduledTask(entry)}>
                  <Text style={styles.optionText}>{entry.effectiveStartTime ? `${entry.task.title} -- ${entry.effectiveStartTime}` : entry.task.title}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <View style={styles.supportiveFeelingSection}>
          <Text style={styles.supportiveFeelingLabel}>או פעולה זמנית לבצע כעת</Text>
          <TextInput style={styles.textInput} value={tempActionTitleDraft} onChangeText={setTempActionTitleDraft} textAlign="right" placeholder="מה תרצה לעשות?" />
          <Text style={[styles.hint, { marginTop: 10 }]}>משך בדקות</Text>
          <TextInput style={styles.textInput} value={tempActionDurationDraft} onChangeText={setTempActionDurationDraft} textAlign="right" keyboardType="numeric" />
          {availableMinutes !== null && <Text style={styles.hint}>{`יש ${availableMinutes} דקות עד המשימה המתוזמנת הבאה -- המשך יוגבל לזמן הזה.`}</Text>}
          <Pressable style={[styles.primaryButton, !tempActionTitleDraft.trim() && styles.disabledButton]} disabled={!tempActionTitleDraft.trim()} onPress={chooseTemporaryAction}>
            <Text style={styles.primaryButtonText}>המשך עם הפעולה הזו</Text>
          </Pressable>
        </View>
        {/*
         * ARCHI -- ARC Decision task: "בלחיצה עליו, ייפתח ARC Decision"
         * -- offered alongside the existing options above, never
         * replacing them. Opens the shared flow inline (see the
         * arcDecisionSession check at the top of this function).
         */}
        <Pressable style={styles.secondaryButton} onPress={startArcDecision}>
          <Text style={styles.secondaryButtonText}>אני לא יודע</Text>
        </Pressable>
      </View>
    );
  }

  /**
   * Positive Memory, Success Recall & Quick Capture task, section 8:
   * shown INSTEAD of <ArcBodyMantraCircle> only while a matching,
   * non-dismissed documented positive memory exists for this encoding
   * step -- "דלג" falls through to the existing, unchanged circle for
   * the remainder of this exact encoding step (no re-fetch), and
   * "אירוע אחר" only ever swaps in another REAL documented memory,
   * never inventing one. Preserves all existing encoding functionality
   * untouched: this never persists the session step itself, so
   * advancing still happens via the normal <ArcBodyMantraCircle>
   * once the user skips or there is nothing left to show.
   */
  function renderPositiveMemoryEncodingBlock(memory: PositiveMemory) {
    const feelingEntry = memory.feelings[0] ?? null;
    return (
      <View style={styles.positiveMemoryCard}>
        {/*
         * Positive Memory Visualization & Gratitude Integration task,
         * section 1: the exact required instruction/label/gratitude
         * wording, in the exact required order -- the documented
         * moment (feelingEntry.moment, never a generic/imagined
         * scenario) is shown verbatim beneath its own label, never
         * spliced into another sentence.
         */}
        <Text style={styles.positiveMemoryPrompt}>דמיין את הרגע הספציפי שבו חווית את התחושה החיובית שבחרת.</Text>
        <Text style={styles.positiveMemoryLabel}>הרגע שתיעדת:</Text>
        {feelingEntry?.moment.trim() ? <Text style={styles.positiveMemoryMoment}>{feelingEntry.moment}</Text> : null}
        <Text style={styles.positiveMemoryGratitude}>הוקר תודה על האירוע הזה.</Text>
        {feelingEntry && <Text style={styles.positiveMemoryFeeling}>{feelingEntry.feeling}</Text>}
        {(memory.location && memory.location.trim()) || memory.occurredAt.trim() ? (
          <Text style={styles.positiveMemoryDetail}>
            {[memory.location, memory.occurredAt].filter((part): part is string => !!part && part.trim().length > 0).join(" -- ")}
          </Text>
        ) : null}
        {memory.whatWasSpecial.trim() ? <Text style={styles.positiveMemoryDetail}>{memory.whatWasSpecial}</Text> : null}
        <View style={styles.positiveMemoryActions}>
          <Pressable style={styles.secondaryButton} onPress={handlePositiveMemoryEncodingAnother}>
            <Text style={styles.secondaryButtonText}>אירוע אחר</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handlePositiveMemoryEncodingSkip}>
            <Text style={styles.secondaryButtonText}>דלג</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderBody() {
    switch (session!.currentStep) {
      // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
      // Background task: ONE screen -- the breathing illustration +
      // the exact mantra + Continue/Skip, both committing the exact
      // same transition (completeFreeBreathingIntro), since there is
      // no data to decline here.
      // "התבוננות וחיבור לעצמי" task: the branch screen -- title/primary
      // are already rendered generically above (content.title/primary),
      // this case only renders the two buttons. The generic "חזרה" link
      // in the nav row below already returns here from the exercise
      // screen (resolvePreviousStep correctly walks back to this exact
      // step), so no dedicated back control is needed in either case.
      case "self_observation_choice":
        return (
          <View style={styles.chipColumn}>
            <Pressable style={styles.optionRow} onPress={() => commit(proceedToSelfObservationExercise(session!, now))}>
              <Text style={styles.optionText}>לעשות תרגיל התבוננות עצמית</Text>
            </Pressable>
            <Pressable style={styles.optionRow} onPress={() => commit(declineSelfObservation(session!, now))}>
              <Text style={styles.optionText}>להמשיך הלאה</Text>
            </Pressable>
          </View>
        );

      // The guided exercise itself. The personal name is a global
      // profile value (personalName state, loaded from data/storage.ts
      // above) -- the FIRST time this screen is ever reached with none
      // saved, an inline text field asks for it once; every later time
      // (this session or any future one) the big, centered name button
      // is shown directly, never re-asking. Pressing the name button is
      // the exercise's own explicit "I'm ready" confirmation -- it just
      // advances normally, landing on free_breathing (or the next step)
      // exactly like any other step's own completion.
      case "self_observation_exercise":
        return (
          <View style={styles.chipColumn}>
            {personalName ? (
              <Pressable style={styles.selfObservationNameButton} onPress={() => commit(advance(session!, now))}>
                <Text style={styles.selfObservationNameButtonText}>{personalName}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.supporting}>איך קוראים לך?</Text>
                <TextInput style={styles.textInput} value={nameInputDraft} onChangeText={setNameInputDraft} placeholder="השם שלך" textAlign="right" />
                <Pressable
                  style={[styles.optionRow, !nameInputDraft.trim() && styles.optionRowDisabled]}
                  disabled={!nameInputDraft.trim()}
                  onPress={handleSavePersonalName}
                >
                  <Text style={styles.optionText}>שמירה</Text>
                </Pressable>
              </>
            )}
          </View>
        );

      case "free_breathing":
        return (
          <FreeBreathingIntro
            mantra={content.primary}
            onContinue={() => commit(completeFreeBreathingIntro(session!, now))}
            onSkip={() => commit(completeFreeBreathingIntro(session!, now))}
          />
        );

      case "goal_select": {
        // Part B.1: "יש להוסיף זיהוי ושמירה של הטריגר לתרגיל הספונטני" --
        // only ever asked for a spontaneous session, merged into the
        // SAME state update as the goalType choice (never a second,
        // separate step just for this).
        const withTrigger = (goalType: NewArcLiveSessionState["goalType"]) =>
          commit(setGoalType(session!.arcInvocationMode === "spontaneous" ? { ...session!, triggerText: draftText.trim() || null } : session!, goalType!, now));
        const triggerField = session!.arcInvocationMode === "spontaneous" && (
          <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="מה הטריגר? (רשות)" />
        );
        // Part B.1: a standalone session has no real task to perform an
        // identity action for -- only the Emotional track makes sense,
        // so it's the only option offered (never silently forced
        // without a choice, and never offering a track that can't
        // actually be completed).
        if (taskId === STANDALONE_ARC_TASK_ID) {
          return (
            <View>
              {triggerField}
              <Pressable style={styles.primaryButton} onPress={() => withTrigger("emotion_only")}>
                <Text style={styles.primaryButtonText}>המשך</Text>
              </Pressable>
            </View>
          );
        }
        return (
          <View>
            {triggerField}
            <View style={styles.chipColumn}>
              <Pressable style={styles.optionRow} onPress={() => withTrigger("action")}>
                <Text style={styles.optionText}>לבצע את הפעולה הבאה</Text>
              </Pressable>
              <Pressable style={styles.optionRow} onPress={() => withTrigger("emotion_only")}>
                <Text style={styles.optionText}>לחזק או לשנות את ההרגשה בלבד</Text>
              </Pressable>
              <Pressable style={styles.optionRow} onPress={() => withTrigger("combined")}>
                <Text style={styles.optionText}>גם לטפל בהרגשה וגם לבצע את הפעולה</Text>
              </Pressable>
            </View>
          </View>
        );
      }

      case "desired_ending": {
        const suggestions = session!.goalType === "emotion_only" ? SUPPORTIVE_SENSATION_OPTIONS : ACTION_ENDING_SUGGESTIONS;
        return (
          <View>
            <View style={styles.chipRow}>
              {suggestions.map((suggestion) => (
                <Pressable key={suggestion} style={styles.chip} onPress={() => commit(setDesiredEnding(session!, suggestion, now))}>
                  <Text style={styles.chipText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="או כתוב במילים שלך" />
            <Pressable style={[styles.primaryButton, !draftText.trim() && styles.disabledButton]} disabled={!draftText.trim()} onPress={() => commit(setDesiredEnding(session!, draftText, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );
      }

      // ARCHI -- Universal ARC Routing, Emotion Identification & Android
      // Shortcuts task, requirement 2: the shared cognitive selector --
      // three INDEPENDENT checkboxes, no fourth "Emotion" option, and a
      // Continue button that is ALWAYS enabled (never gated on any
      // selection) whose own label changes per requirement 2's exact
      // wording: "המשך עם הרגש בלבד" when nothing is checked, "המשך
      // לתרגיל" once at least one box is checked.
      case "cognitive_selector": {
        const anySelected = cogSelectThought || cogSelectInterpretation || cogSelectUrge;
        return (
          <View>
            <View style={styles.chipColumn}>
              <Pressable style={styles.optionRow} onPress={() => setCogSelectThought((value) => !value)}>
                <Text style={styles.optionText}>{cogSelectThought ? "☑" : "☐"} מחשבה</Text>
              </Pressable>
              <Pressable style={styles.optionRow} onPress={() => setCogSelectInterpretation((value) => !value)}>
                <Text style={styles.optionText}>{cogSelectInterpretation ? "☑" : "☐"} פרשנות</Text>
              </Pressable>
              <Pressable style={styles.optionRow} onPress={() => setCogSelectUrge((value) => !value)}>
                <Text style={styles.optionText}>{cogSelectUrge ? "☑" : "☐"} דחף</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() =>
                commit(setCognitiveSelection(session!, { thought: cogSelectThought, interpretation: cogSelectInterpretation, urge: cogSelectUrge }, now))
              }
            >
              <Text style={styles.primaryButtonText}>{anySelected ? "המשך לתרגיל" : "המשך עם הרגש בלבד"}</Text>
            </Pressable>
          </View>
        );
      }

      // Requirement 6: a dedicated capture-only screen, reachable only
      // when "cognitive_selector" checked "דחף" -- urge is no longer
      // captured on the "emotion" screen.
      case "urge":
        return (
          <View>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={urgeDraft}
              onChangeText={setUrgeDraft}
              textAlign="right"
              multiline
              placeholder="לדוגמה: דחף לפתוח את הטלפון, לדחות את המשימה, לגרד, לקום ולעזוב"
            />
            <Pressable style={styles.primaryButton} onPress={() => commit(setUrgeText(session!, urgeDraft, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // ARCHI -- Two Mantras for Urge Acceptance correction: ONE
      // animated urge-acceptance screen, no separate explanatory pages
      // before it -- the Presence visuals (point + ONE expanding
      // circle + the circle's own short mantra, body hidden per
      // requirement 8; stage "urge_acceptance" never shows it) render
      // immediately, with the two required below-circle mantras
      // (content.supporting, always exactly two) shown together,
      // staying on screen for as long as the trainee needs. Tapping
      // the circle IS "continue" here -- one action to the next ARC
      // stage, never multiple taps through removed sub-screens.
      case "stop_and_accept_urge":
        return (
          <ArcBodyMantraCircle
            stage="urge_acceptance"
            mantra={content.primary}
            belowCircleLines={content.supporting}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={[]}
            closureRegions={[]}
            openingRegions={[]}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      // Requirement 4: now ALWAYS reachable, capturing ONLY the
      // emotion -- urge moved to its own "urge" step above.
      //
      // ARCHI -- Combined Emotion & Supportive Feeling Selection task,
      // Part 1 ("FULL ARC -- COMBINE EMOTION AND SUPPORTIVE
      // FEELING"): picking an emotion (predefined or custom) no longer
      // advances on its own (setEmotionSelection, never setEmotion) --
      // it stays on this SAME screen, which now also shows the
      // automatically-suggested supportive feeling (pre-selected) and
      // its one-tap alternatives right below the emotion chips. A
      // single, always-available "המשך" button is the only way
      // forward from here, satisfying "keep the Continue button
      // available without requiring another choice." The original
      // "המשך בלי רגש" skip action is untouched -- a completely
      // separate, always-available outcome, never affected by whether
      // an emotion chip happens to be selected right now.
      case "emotion":
        return (
          <View>
            <View style={styles.chipColumn}>
              {PREDEFINED_EMOTION_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.optionRow, session!.selectedEmotion === option && styles.chipSelected]}
                  onPress={() => commit(setEmotionSelection(session!, option, null))}
                >
                  <Text style={[styles.optionText, session!.selectedEmotion === option && styles.chipTextSelected]}>{EMOTION_OPTION_LABELS[option]}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.optionRow} onPress={() => setCustomEmotionDraft(customEmotionDraft || " ")}>
                <Text style={styles.optionText}>אחר</Text>
              </Pressable>
            </View>
            {!!customEmotionDraft && (
              <>
                <TextInput style={styles.textInput} value={customEmotionDraft.trim()} onChangeText={setCustomEmotionDraft} textAlign="right" placeholder="איך תרצה לקרוא לזה?" />
                <Pressable
                  style={[styles.primaryButton, !customEmotionDraft.trim() && styles.disabledButton]}
                  disabled={!customEmotionDraft.trim()}
                  onPress={() => commit(setEmotionSelection(session!, "other", customEmotionDraft))}
                >
                  <Text style={styles.primaryButtonText}>בחר רגש זה</Text>
                </Pressable>
              </>
            )}
            {session!.selectedEmotion !== null &&
              renderSupportiveFeelingPicker(
                resolveFinalSupportiveFeeling(session!),
                (feeling) => {
                  setCustomSupportiveFeelingDraft("");
                  commit(setSupportiveFeelingOverride(session!, feeling));
                },
                customSupportiveFeelingDraft,
                setCustomSupportiveFeelingDraft,
                (text) => commit(setCustomSupportiveFeelingOverride(session!, text))
              )}
            {/*
             * ARCHI -- Allow Action Selection During Emotion
             * Identification or Defer It to Regulation task: an
             * additional, optional choice on this SAME screen --
             * deliberately NOT gated on selectedEmotion !== null (bug
             * fix: a trainee who plans to tap "המשך בלי רגש" -- a
             * fully valid, pre-existing path that never requires
             * identifying an emotion -- must still see and be able to
             * use this choice; choosing an action never actually
             * depends on having picked an emotion first). "אבחר פעולה
             * בשלב הוויסות" needs no handler of its own (it's simply
             * the existing "continue without selecting" default, since
             * selectedActionSource stays null until Regulation);
             * "בחירת פעולה עכשיו" reveals the exact same
             * renderActionSelector() picker Regulation itself uses, so
             * choosing here goes through the SAME setSelectedAction
             * setter (which already advances the session normally --
             * no new engine step, no duplicated logic).
             */}
            <View style={styles.supportiveFeelingSection}>
              <Text style={styles.supportiveFeelingLabel}>מתי תרצה לבחור פעולה?</Text>
              {session!.selectedActionSource !== null && !showActionSelectorOnEmotion && (
                <Text style={styles.hint}>{`הפעולה שנבחרה כרגע: ${resolveActionText(session!) ?? ""}`}</Text>
              )}
              <View style={styles.chipColumn}>
                <Pressable style={[styles.optionRow, showActionSelectorOnEmotion && styles.chipSelected]} onPress={() => setShowActionSelectorOnEmotion(true)}>
                  <Text style={[styles.optionText, showActionSelectorOnEmotion && styles.chipTextSelected]}>בחירת פעולה עכשיו</Text>
                </Pressable>
                <Pressable style={[styles.optionRow, !showActionSelectorOnEmotion && styles.chipSelected]} onPress={() => setShowActionSelectorOnEmotion(false)}>
                  <Text style={[styles.optionText, !showActionSelectorOnEmotion && styles.chipTextSelected]}>אבחר פעולה בשלב הוויסות</Text>
                </Pressable>
              </View>
              {showActionSelectorOnEmotion && renderActionSelector()}
            </View>
            {session!.selectedEmotion !== null && (
              <Pressable style={styles.primaryButton} onPress={() => commit(advance(session!, now))}>
                <Text style={styles.primaryButtonText}>המשך</Text>
              </Pressable>
            )}
            {!customEmotionDraft && (
              <Pressable style={styles.primaryButton} onPress={() => commit(setEmotion(session!, null, null, now))}>
                <Text style={styles.primaryButtonText}>המשך בלי רגש</Text>
              </Pressable>
            )}
          </View>
        );

      // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task:
      // both 0-10 ratings on ONE screen -- content.primary (the first
      // question) is already shown generically above; this case shows
      // the first rating row, then the second question
      // (content.supporting[0]) and its own rating row, then the one
      // "המשך" button that commits both together (disabled until both
      // are answered -- "after confirming both ratings," never one
      // alone).
      case "action_readiness_check": {
        const ratingValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth
        // Tracks task: a third rating, timeAvailableDraft, added to
        // this same screen -- all three must be answered before
        // "המשך" is enabled.
        const allAnswered = unpleasantIntensityDraft !== null && actionReadinessDraft !== null && timeAvailableDraft !== null;
        return (
          <View>
            <View style={styles.chipRow}>
              {ratingValues.map((value) => (
                <Pressable
                  key={`unpleasant-${value}`}
                  style={[styles.optionRow, unpleasantIntensityDraft === value && styles.chipSelected]}
                  onPress={() => setUnpleasantIntensityDraft(value)}
                >
                  <Text style={[styles.optionText, unpleasantIntensityDraft === value && styles.chipTextSelected]}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.primary}>{content.supporting[0]}</Text>
            <View style={styles.chipRow}>
              {ratingValues.map((value) => (
                <Pressable
                  key={`readiness-${value}`}
                  style={[styles.optionRow, actionReadinessDraft === value && styles.chipSelected]}
                  onPress={() => setActionReadinessDraft(value)}
                >
                  <Text style={[styles.optionText, actionReadinessDraft === value && styles.chipTextSelected]}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.primary}>{content.supporting[1]}</Text>
            <View style={styles.chipRow}>
              {ratingValues.map((value) => (
                <Pressable
                  key={`time-${value}`}
                  style={[styles.optionRow, timeAvailableDraft === value && styles.chipSelected]}
                  onPress={() => setTimeAvailableDraft(value)}
                >
                  <Text style={[styles.optionText, timeAvailableDraft === value && styles.chipTextSelected]}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.primaryButton, !allAnswered && styles.disabledButton]}
              disabled={!allAnswered}
              onPress={() => allAnswered && commit(confirmActionReadinessCheck(session!, unpleasantIntensityDraft!, actionReadinessDraft!, timeAvailableDraft!, now))}
            >
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );
      }

      // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
      // task: "סבבה" (shortened)'s own standalone equivalent of the
      // third rating above -- same single 0-10 chip row.
      case "time_available_check": {
        const ratingValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        return (
          <View>
            <View style={styles.chipRow}>
              {ratingValues.map((value) => (
                <Pressable
                  key={`time-${value}`}
                  style={[styles.optionRow, timeAvailableDraft === value && styles.chipSelected]}
                  onPress={() => setTimeAvailableDraft(value)}
                >
                  <Text style={[styles.optionText, timeAvailableDraft === value && styles.chipTextSelected]}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.primaryButton, timeAvailableDraft === null && styles.disabledButton]}
              disabled={timeAvailableDraft === null}
              onPress={() => timeAvailableDraft !== null && commit(confirmTimeAvailableRating(session!, timeAvailableDraft, now))}
            >
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );
      }

      // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
      // task: shared "quick presence" screen for both tracks' short
      // depth -- same tap-to-advance ArcBodyMantraCircle every other
      // Presence/body-mantra stage already uses; isBodyMantraStage
      // (above) suppresses the generic header for this case too.
      case "quick_presence":
        return (
          <ArcBodyMantraCircle
            stage="quick_presence"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={session!.bodyScanContractionRegions}
            closureRegions={resolveClosureRegions(session!)}
            openingRegions={session!.openingBodyScanRegions}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      // "פחות טוב" short depth only -- the single RED/BLUE body-marking
      // screen (cycleShortBodyMarking, arc/newArcLiveSteps.ts), reusing
      // the same BodySilhouetteMap + color-resolution convention every
      // other body-selection screen here already uses.
      case "short_body_marking":
        return (
          <View>
            <BodySilhouetteMap
              selectedColor={CONTRACTION_SELECTED_COLOR}
              resolveSelectedColorForRegion={(region, side) =>
                resolveShortBodyMarkingPhase(session!, region, side) === "blue" ? OPENING_SUPPORT_SELECTED_COLOR : null
              }
              isSelected={(region, side) => resolveShortBodyMarkingPhase(session!, region, side) !== "none"}
              onToggle={(region, side) => commit(cycleShortBodyMarking(session!, region, side))}
            />
            <Pressable style={styles.primaryButton} onPress={() => commit(advance(session!, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // Requirement 6: captures ONLY the thought now -- interpretation
      // has its own separate "interpretation" step below.
      case "thought":
        return (
          <View>
            <TextInput style={[styles.textInput, styles.multilineInput]} value={draftText} onChangeText={setDraftText} textAlign="right" multiline placeholder="איזו מחשבה מעסיקה אותך עכשיו? (רשות)" />
            <Pressable style={styles.primaryButton} onPress={() => commit(setThought(session!, draftText, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      case "reality_acceptance":
        // Three-levels-of-acceptance task, section 2 / ARCHI Universal
        // ARC Routing task, requirement 6-7: ALWAYS reached with a real
        // thought now (isStepReachable gates on currentThought alone) --
        // subIndex 0 asks the time-classification question; picking an
        // option both records it and advances straight to subIndex 1's
        // own resolved mantra, which then falls to the Presence circle
        // below. The old mode-A "interpretation only" branch is gone
        // from this case entirely -- see "interpretation_acceptance"
        // below for that content's own new, separate home.
        if (session!.subIndex === 0) {
          return (
            <View style={styles.chipRow}>
              {getThoughtTimeOrientationOptions().map((option) => (
                <Pressable key={option.value} style={styles.chip} onPress={() => commit(setThoughtTimeOrientation(session!, option.value, now))}>
                  <Text style={styles.chipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          );
        }
        // Unified ARC & Productivity Update task, requirement 7: the
        // acceptance moment itself (once an orientation is chosen) now
        // shows the Presence visuals -- point + ONE expanding circle +
        // the exact mantra (content.primary, already resolved by
        // getStepContent above) -- body hidden (requirement 8; stage
        // "thought_acceptance" never shows it). Tapping the circle IS
        // "continue" here.
        return (
          <ArcBodyMantraCircle
            stage="thought_acceptance"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={[]}
            closureRegions={[]}
            openingRegions={[]}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      // Requirement 6: captures ONLY the interpretation -- reachable
      // only when "cognitive_selector" checked "פרשנות".
      case "interpretation":
        return (
          <View>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={interpretationDraft}
              onChangeText={setInterpretationDraft}
              textAlign="right"
              multiline
              placeholder="איזו פרשנות אתה נותן למצב? (רשות)"
            />
            <Pressable style={styles.primaryButton} onPress={() => commit(setInterpretation(session!, interpretationDraft, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // Requirement 7: Interpretation's own dedicated, ALWAYS-separate
      // acceptance moment -- the exact, verbatim mantra, body hidden
      // (stage "interpretation_acceptance" never shows it). Tapping the
      // circle IS "continue" here, same convention as the other two
      // cognitive-acceptance stages above.
      case "interpretation_acceptance":
        return (
          <ArcBodyMantraCircle
            stage="interpretation_acceptance"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={[]}
            closureRegions={[]}
            openingRegions={[]}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      case "focus_color":
        return (
          <View>
            <View style={styles.chipRow}>
              {FOCUS_COLOR_OPTIONS.map((color) => (
                <Pressable key={color} style={styles.chip} onPress={() => commit(setFocusColor(session!, color, now))}>
                  <Text style={styles.chipText}>{color}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="או כתוב צבע אחר" />
            {!!draftText.trim() && (
              <Pressable style={styles.primaryButton} onPress={() => commit(setFocusColor(session!, draftText, now))}>
                <Text style={styles.primaryButtonText}>המשך</Text>
              </Pressable>
            )}
          </View>
        );

      // Body Scan Upgrade task, section 2: every region defaults to
      // "אין תחושה" simply by being absent from bodyScanContractionRegions
      // (resolveBodyScanContractionState) -- no region is ever
      // pre-populated, and tapping "אין תחושה" on an already-default
      // region is a no-op (toggle only fires when it would actually
      // change this one slot), never a spurious re-add.
      // Unified ARC Architecture and Interactive Animation Update,
      // Phase 1 ("Interactive Segmented Body"): the real SVG front/back
      // body silhouette replaces the old chip-grid rendering here --
      // same existing toggleBodyScanContractionRegion setter, same
      // bodyScanContractionRegions session field, zero engine/data
      // change. "Red: current contraction or unpleasant tension."
      // ARCHI -- Full ARC Body Flow Redesign task, Screen One: a SINGLE
      // combined Red/Green picker now (cycleBodyScanContractionAndGreen,
      // arc/newArcLiveSteps.ts) -- every region stays tappable (Red
      // never requires movement capability); a movement-eligible region
      // that is already Red additionally cycles through Light Green,
      // never Blue (Blue is only ever reachable on the later,
      // Screen-Two "body_scan_opening_region" step).
      case "body_scan_contraction":
        return (
          <View>
            <Pressable style={styles.infoButton} onPress={() => setInfoModal(BODY_SCAN_CONTRACTION_INFO)}>
              <Text style={styles.infoButtonText}>ⓘ מהו כיווץ?</Text>
            </Pressable>
            <BodySilhouetteMap
              selectedColor={CONTRACTION_SELECTED_COLOR}
              resolveSelectedColorForRegion={(region, side) => resolveContractionOrGreenColor(session!, region, side)}
              isSelected={(region, side) => resolveBodyScanContractionState(session!.bodyScanContractionRegions, region, side) === "contraction"}
              onToggle={(region, side) => commit(cycleBodyScanContractionAndGreen(session!, region, side))}
            />
            <Pressable
              style={[styles.primaryButton, !canContinue && styles.disabledButton]}
              disabled={!canContinue}
              onPress={() => commit(advance(session!, now))}
            >
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // ARC Full Sequence Update task, Part 3: "Identify Heavy and
      // Closed Regions" via TWO CONSECUTIVE, SEPARATE questions -- this
      // is the first ("באילו אזורים בגוף אתה מרגיש כבדות?"). Both this
      // screen and body_scan_closedness right below read/write the
      // exact same bodyScanHeavinessRegions array (fully independent
      // from the contraction screen above too, never read or written
      // by its own setter), each flipping only its own bit
      // (toggleBodyScanHeavinessRegion) -- selecting a region here
      // never assumes, and never clears, whatever closedness that same
      // region may already carry.
      // "Dark Blue: existing heaviness or closedness information."
      case "body_scan_heaviness":
        return (
          <View>
            <Pressable style={styles.infoButton} onPress={() => setInfoModal(BODY_SCAN_HEAVINESS_INFO)}>
              <Text style={styles.infoButtonText}>ⓘ מהי כבדות?</Text>
            </Pressable>
            <BodySilhouetteMap
              selectedColor={HEAVINESS_CLOSEDNESS_SELECTED_COLOR}
              isSelected={(region, side) => {
                const current = resolveBodyScanHeavinessState(session!.bodyScanHeavinessRegions, region, side);
                return current === "heaviness" || current === "heaviness_and_closedness";
              }}
              onToggle={(region, side) => commit(toggleBodyScanHeavinessRegion(session!, region, side))}
            />
            <Pressable style={[styles.primaryButton, !canContinue && styles.disabledButton]} disabled={!canContinue} onPress={() => commit(advance(session!, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // The SECOND, separate question ("...סגירות?") -- same
      // independent-bit convention as body_scan_heaviness above, over
      // the exact same array. Final ARC Flow & Body Animation task,
      // requirement 1 ("Identify Closure: select multiple regions, but
      // ONLY regions with a real, gentle, anatomically meaningful
      // opening movement -- exclude eyes, ears, head, and other
      // regions without a suitable opening movement"): selectableRegions
      // now restricts taps to exactly arc/bodyRegionMovements.ts's own
      // 15 movement-eligible regions -- the SAME eligibility table
      // "Select Opening Regions" below (and the body-animation stages
      // themselves) already use, so a region can never be marked
      // closed here and then have no supported opening movement later.
      case "body_scan_closedness":
        return (
          <View>
            <Pressable style={styles.infoButton} onPress={() => setInfoModal(BODY_SCAN_CLOSEDNESS_INFO)}>
              <Text style={styles.infoButtonText}>ⓘ מהי סגירות?</Text>
            </Pressable>
            <BodySilhouetteMap
              selectedColor={HEAVINESS_CLOSEDNESS_SELECTED_COLOR}
              selectableRegions={MOVEMENT_ELIGIBLE_SILHOUETTE_REGIONS}
              isSelected={(region, side) => {
                const current = resolveBodyScanHeavinessState(session!.bodyScanHeavinessRegions, region, side);
                return current === "closedness" || current === "heaviness_and_closedness";
              }}
              onToggle={(region, side) => commit(toggleBodyScanClosednessRegion(session!, region, side))}
            />
            {/* ARCHI -- Unified 7-Part Update task, Part 2F/3.2: leaving
                this screen now auto-carries every eligible closure
                region straight into openingBodyScanRegions
                (confirmBodyScanClosedness, arc/newArcLiveSteps.ts) --
                "do not ask users to select the same areas twice." */}
            <Pressable
              style={[styles.primaryButton, !canContinue && styles.disabledButton]}
              disabled={!canContinue}
              onPress={() => commit(confirmBodyScanClosedness(session!, now))}
            >
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // ARCHI -- Full ARC Body Flow Redesign task, Screen Two: now
      // Blue-ONLY ("Purple is completely removed... Green does not
      // appear here any more either" -- every Red/Green region from
      // Screen One is absolutely excluded, both here in the UI's own
      // selectableRegions filter and, authoritatively, in the engine
      // via cycleSupportiveOnlyOpening). Reached AFTER Acceptance Part 1
      // now (NEW_ARC_LIVE_STEP_ORDER), never before it. "If a positive
      // feeling is missing, provide the existing appropriate
      // selection/custom-entry option before requiring it" -- the
      // shared supportive-feeling picker renders inline here whenever
      // none is resolved yet, the exact same picker Shortened ARC's own
      // branch below already uses.
      case "body_scan_opening_region": {
        const feeling = resolveFinalSupportiveFeeling(session!);
        return (
          <View>
            <Pressable style={styles.infoButton} onPress={() => setInfoModal(BODY_SCAN_OPENNESS_INFO)}>
              <Text style={styles.infoButtonText}>ⓘ מהי תמיכה?</Text>
            </Pressable>
            <BodySilhouetteMap
              selectedColor={OPENING_BLUE_SELECTED_COLOR}
              selectableRegions={resolveSupportiveEligibleSilhouetteRegions(session!)}
              isSelected={(region, side) => resolveBodyScanOpeningRole(session!.openingBodyScanRegions, region, side) === "opening_and_supportive"}
              onToggle={(region, side) => {
                const next = attemptToggleSupportiveOpeningRegion(session!, region, side);
                if (next) commit(next);
              }}
            />
            {!feeling &&
              renderSupportiveFeelingPicker(
                feeling,
                (f) => {
                  setCustomSupportiveFeelingDraft("");
                  commit(setSupportiveFeelingOverride(session!, f));
                },
                customSupportiveFeelingDraft,
                setCustomSupportiveFeelingDraft,
                (text) => commit(setCustomSupportiveFeelingOverride(session!, text))
              )}
            <Pressable style={styles.primaryButton} onPress={() => commit(confirmOpeningBodyScanRegions(session!, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );
      }

      // ARC Full Sequence Update task, Part 1 step 4: "ask 'מה היית
      // רוצה להרגיש?' with example options... Save the exact feeling;
      // do not assume it is already present." A preset chip commits
      // immediately; the free-text field needs its own explicit
      // continue tap, same two-path convention as "desired_ending"
      // above. Skippable (isStepSkippable), via the shared "דלג" link.
      case "desired_feeling_select":
        return (
          <View>
            <View style={styles.chipRow}>
              {DESIRED_FEELING_OPTIONS.map((feeling) => (
                <Pressable key={feeling} style={styles.chip} onPress={() => commit(setDesiredFeeling(session!, feeling, now))}>
                  <Text style={styles.chipText}>{feeling}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="או כתוב במילים שלך (רשות)" />
            {!!draftText.trim() && (
              <Pressable style={styles.primaryButton} onPress={() => commit(setDesiredFeeling(session!, draftText, now))}>
                <Text style={styles.primaryButtonText}>המשך</Text>
              </Pressable>
            )}
          </View>
        );

      // Part 1 step 5: the personalized "where do you feel it now"
      // question (its exact text, with the chosen feeling inserted, is
      // resolved by getStepContent/resolveDesiredFeelingLocateQuestion
      // in arc/newArcLiveCopy.ts -- never duplicated here). Multi-select
      // body regions, same toggle-then-confirm convention as
      // unpleasant_area_select, PLUS the spec's own explicit "אני עדיין
      // לא מרגיש את התחושה הזאת" option -- a dedicated option row,
      // never inferred from merely leaving every chip untapped.
      case "desired_feeling_locate": {
        const regionsToShow = showMoreDesiredFeelingAreas ? BODY_REGIONS : resolveSuggestedSupportiveAreas(session!.desiredFeelingText);
        return (
          <View>
            <View style={styles.chipRow}>
              {regionsToShow.map((region: BodyRegion) => (
                <Pressable
                  key={region}
                  style={[styles.chip, session!.desiredFeelingBodyAreas.includes(region) && styles.chipSelected]}
                  onPress={() => commit(toggleDesiredFeelingBodyArea(session!, region))}
                >
                  <Text style={[styles.chipText, session!.desiredFeelingBodyAreas.includes(region) && styles.chipTextSelected]}>{BODY_REGION_LABELS[region]}</Text>
                </Pressable>
              ))}
            </View>
            {!showMoreDesiredFeelingAreas && (
              <Pressable onPress={() => setShowMoreDesiredFeelingAreas(true)}>
                <Text style={styles.linkText}>עוד אזורים</Text>
              </Pressable>
            )}
            <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="או הזנת אזור גוף אחר (רשות)" />
            <Pressable style={styles.primaryButton} onPress={() => commit(confirmDesiredFeelingLocation(session!, draftText, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => commit(declineDesiredFeelingPresence(session!, now))}>
              <Text style={styles.secondaryButtonText}>אני עדיין לא מרגיש את התחושה הזאת</Text>
            </Pressable>
          </View>
        );
      }

      case "unpleasant_area_question":
        return (
          <View style={styles.chipColumn}>
            <Pressable style={styles.optionRow} onPress={() => commit(proceedToUnpleasantAreaSelect(session!, now))}>
              <Text style={styles.optionText}>כן, לבחור אזור</Text>
            </Pressable>
            <Pressable style={styles.optionRow} onPress={() => commit(declineUnpleasantArea(session!, now))}>
              <Text style={styles.optionText}>לא, להמשיך</Text>
            </Pressable>
          </View>
        );

      case "unpleasant_area_select": {
        // Body region selection correction task: the negative/unpleasant
        // side is now MULTI-select -- the already-selected negative
        // emotion (if any) suggests its own candidate regions FIRST
        // (resolveSuggestedUnpleasantAreas, unchanged), with "עוד אזורים"
        // revealing every other region on request. Tapping a chip only
        // TOGGLES it (never auto-advances, same convention
        // toggleSupportiveArea originally established for the positive
        // side), so several regions can be chosen before pressing
        // "המשך" -- which is unconditionally enabled, "continue without
        // choosing" (the option to skip) is always valid. A separate,
        // optional custom-region text field (draftText) sits alongside
        // the existing, UNCHANGED sensation-description field
        // (unpleasantSensationDraft) -- two independent free-text
        // inputs on the same screen, same precedent as draftText +
        // interpretationDraft on the 'thought' step.
        const suggestedUnpleasant = resolveSuggestedUnpleasantAreas(resolveSelectedEmotionText(session!));
        const unpleasantRegionsToShow = showMoreUnpleasantAreas ? BODY_REGIONS : suggestedUnpleasant;
        return (
          <View>
            <View style={styles.chipRow}>
              {unpleasantRegionsToShow.map((region: BodyRegion) => (
                <Pressable
                  key={region}
                  style={[styles.chip, session!.unpleasantBodyAreas.includes(region) && styles.chipSelected]}
                  onPress={() => commit(toggleUnpleasantArea(session!, region))}
                >
                  <Text style={[styles.chipText, session!.unpleasantBodyAreas.includes(region) && styles.chipTextSelected]}>{BODY_REGION_LABELS[region]}</Text>
                </Pressable>
              ))}
            </View>
            {!showMoreUnpleasantAreas && (
              <Pressable onPress={() => setShowMoreUnpleasantAreas(true)}>
                <Text style={styles.linkText}>עוד אזורים</Text>
              </Pressable>
            )}
            <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="או הזנת אזור גוף אחר (רשות)" />
            <TextInput
              style={styles.textInput}
              value={unpleasantSensationDraft}
              onChangeText={setUnpleasantSensationDraft}
              textAlign="right"
              placeholder="תיאור התחושה (רשות)"
            />
            <Pressable style={styles.primaryButton} onPress={() => commit(confirmUnpleasantAreas(session!, draftText, unpleasantSensationDraft, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );
      }

      case "supportive_area_select": {
        // ARCHI -- Unified 7-Part Update task, Part 6.4/6.5 ("REPLACE
        // TEXT-BASED SUPPORTIVE BODY SELECTION" -- Shortened ARC
        // only): the shared interactive gender-neutral anatomical body
        // (the SAME BodySilhouetteMap every other body-scan screen
        // uses -- never a second, separately-authored body-selection
        // UI), writing DIRECTLY into openingBodyScanRegions via the
        // EXISTING toggleOpeningBodyScanRegion setter -- the exact same
        // field Full ARC's Acceptance/Regulation/Encoding stages
        // already read for their own progressive supportive-blue +
        // movement animation (ArcBodyMantraCircle's own openingRegions
        // prop below), so "סבבה"'s selections animate through
        // Acceptance/Regulation/Encoding with ZERO extra wiring. Every
        // movement-eligible region is offered (shortened has no prior
        // contraction/closure step to restrict the choice to). "המשך"
        // is always enabled -- "continue without selecting an area
        // when appropriate."
        if (session!.arcInvocationMode === "shortened") {
          // ARCHI -- Refine the Shortened ARC / "סבבה" Pathway task,
          // requirements 2-4: the old green/blue legend row is gone
          // (requirement 2 -- "סבבה" never shows the green-color
          // explanation at all), there is no emotion question or
          // collapsible optional-emotion control any more (requirement
          // 3 -- "סבבה" never asks about current/negative emotion),
          // and the SAME shared inline supportive-feeling
          // picker Full/Mini ARC use (renderSupportiveFeelingPicker,
          // predefined list + free-text custom option) is now shown
          // unconditionally, directly under the body, choosing a
          // supportive feeling ONLY (requirement 4) -- never gated
          // behind picking an emotion first, since there is no emotion
          // step here at all. resolveFinalSupportiveFeeling/resolveEncodingMantra
          // (arc/newArcLiveSteps.ts/arc/newArcLiveCopy.ts) already read
          // this SAME selectedSupportiveFeeling override regardless of
          // selectedEmotion, so the choice flows into the later mantra
          // exactly like every other supportive-feeling path, with no
          // further wiring needed.
          //
          // ARCHI -- Choose the Action on the Same "סבבה" Screen task:
          // the action-selection section now renders at the BOTTOM of
          // this SAME screen, right under the body/supportive-feeling
          // picker -- never on the Regulation screen reached after it.
          // Reuses the exact same showActionSelectorOnRegulation local
          // state and renderActionSelector()/summary pattern Regulation
          // itself uses (that state resets to false on every step
          // change, so reusing it here is safe); selecting/confirming
          // an action here calls the SAME setSelectedAction, which
          // already advances the session on its own -- straight past
          // this screen into Regulation, with the action already
          // decided. The plain, unconditional "המשך" this branch used
          // to end with is gone: choosing an action is now this
          // screen's own required exit, exactly like Regulation's own
          // (no plain skip there either) -- body-area/supportive-
          // feeling selection stays fully optional, unaffected.
          const hasConfirmedAction = session!.selectedActionSource !== null && !showActionSelectorOnRegulation;
          return (
            <View>
              <BodySilhouetteMap
                selectedColor={OPENING_GREEN_SELECTED_COLOR}
                resolveSelectedColorForRegion={(region, side) => resolveOpeningRegionSelectedColor(session!, region, side)}
                selectableRegions={MOVEMENT_ELIGIBLE_SILHOUETTE_REGIONS}
                isSelected={(region, side) => session!.openingBodyScanRegions.some((entry) => entry.region === region && entry.side === side)}
                onToggle={(region, side) => {
                const next = attemptToggleOpeningBodyScanRegion(session!, region, side);
                if (next) commit(next);
              }}
              />
              {renderSupportiveFeelingPicker(
                resolveFinalSupportiveFeeling(session!),
                (feeling) => {
                  setCustomSupportiveFeelingDraft("");
                  commit(setSupportiveFeelingOverride(session!, feeling));
                },
                customSupportiveFeelingDraft,
                setCustomSupportiveFeelingDraft,
                (text) => commit(setCustomSupportiveFeelingOverride(session!, text))
              )}
              {session!.arcGymSituationId || session!.arcPracticeDepth === "short" ? (
                // ARC GYM's own separate, later positive-action
                // visualization has nothing to select here -- same
                // exemption Regulation itself already carries. ARCHI --
                // Remove Mini ARC / Add Time Rating & Short-Depth
                // Tracks task: short depth never prompts for an action
                // either -- it reuses the task's own already-known
                // first action automatically at the end (returnToTask),
                // same reasoning as "פחות טוב" short's own ending.
                <Pressable style={styles.primaryButton} onPress={() => commit(advance(session!, now))}>
                  <Text style={styles.primaryButtonText}>המשך</Text>
                </Pressable>
              ) : (
                <View>
                  <Text style={styles.title}>הפעולה הבאה</Text>
                  <Text style={styles.primary}>איזו פעולה תרצה לעשות עכשיו?</Text>
                  {hasConfirmedAction ? (
                    <View>
                      <Text style={styles.hint}>{`הפעולה שנבחרה: ${resolveActionText(session!) ?? ""}`}</Text>
                      <Pressable style={styles.optionRow} onPress={() => setShowActionSelectorOnRegulation(true)}>
                        <Text style={styles.optionText}>שנה פעולה</Text>
                      </Pressable>
                      <Pressable style={styles.primaryButton} onPress={() => commit(advance(session!, now))}>
                        <Text style={styles.primaryButtonText}>המשך</Text>
                      </Pressable>
                    </View>
                  ) : (
                    renderActionSelector()
                  )}
                </View>
              )}
            </View>
          );
        }
        // Body region selection correction task: reverted to SINGLE
        // selection -- a fixed suggestion bank keyed by the already-
        // chosen desired feeling (resolveSuggestedSupportiveAreas,
        // unchanged), "עוד אזורים" reveals every other region on
        // request (unchanged), but tapping a chip now COMMITS that one
        // region immediately via setSupportiveArea and advances --
        // never toggles into a growing multi-select set. A chosen
        // chip still visibly reflects selection (relevant on
        // back-navigation into this step). "המשך בלי לבחור" preserves
        // the pre-existing "continue without choosing" outcome without
        // requiring a pick.
        const suggested = resolveSuggestedSupportiveAreas(session!.desiredEnding);
        const regionsToShow = showMoreAreas ? BODY_REGIONS : suggested;
        return (
          <View>
            <View style={styles.chipRow}>
              {regionsToShow.map((region: BodyRegion) => (
                <Pressable
                  key={region}
                  style={[styles.chip, session!.supportiveBodyArea === region && styles.chipSelected]}
                  onPress={() => commit(setSupportiveArea(session!, region, now))}
                >
                  <Text style={[styles.chipText, session!.supportiveBodyArea === region && styles.chipTextSelected]}>{BODY_REGION_LABELS[region]}</Text>
                </Pressable>
              ))}
            </View>
            {!showMoreAreas && (
              <Pressable onPress={() => setShowMoreAreas(true)}>
                <Text style={styles.linkText}>עוד אזורים</Text>
              </Pressable>
            )}
            <Pressable style={styles.primaryButton} onPress={() => commit(advance(session!, now))}>
              <Text style={styles.primaryButtonText}>המשך בלי לבחור</Text>
            </Pressable>
          </View>
        );
      }

      case "supportive_sensation_select":
        return (
          <View>
            <View style={styles.chipRow}>
              {SUPPORTIVE_SENSATION_OPTIONS.map((sensation) => (
                <Pressable key={sensation} style={styles.chip} onPress={() => commit(setSupportiveSensation(session!, sensation, now))}>
                  <Text style={styles.chipText}>{sensation}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="או כתוב תחושה אחרת" />
            {!!draftText.trim() && (
              <Pressable style={styles.primaryButton} onPress={() => commit(setSupportiveSensation(session!, draftText, now))}>
                <Text style={styles.primaryButtonText}>המשך</Text>
              </Pressable>
            )}
          </View>
        );

      case "supportive_movement_select": {
        // Body region selection correction task: with the positive side
        // back to a single primary anchor, suggestions pool movement
        // presets for just that ONE region (wrapped in a one-element
        // array -- resolveSupportiveMovementSuggestionsForAreas itself
        // is unchanged and still generically pools across however many
        // regions it's given), falling back to its own generic set when
        // none was chosen. "המשך" is always visible: continuing with no
        // movement chosen is a valid, explicit outcome, same as the
        // area-selection step above.
        const suggestions = resolveSupportiveMovementSuggestionsForAreas(session!.supportiveBodyArea ? [session!.supportiveBodyArea] : [], showMoreMovements ? 20 : 3);
        return (
          <View>
            <View style={styles.chipRow}>
              {suggestions.map((movement) => (
                <Pressable key={movement} style={styles.chip} onPress={() => commit(setPositiveMovement(session!, movement, now))}>
                  <Text style={styles.chipText}>{movement}</Text>
                </Pressable>
              ))}
            </View>
            {!showMoreMovements && suggestions.length >= 3 && (
              <Pressable onPress={() => setShowMoreMovements(true)}>
                <Text style={styles.linkText}>עוד אפשרויות</Text>
              </Pressable>
            )}
            <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="או תנועה אישית" />
            <Pressable style={styles.primaryButton} onPress={() => commit(setPositiveMovement(session!, draftText, now))}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );
      }

      // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
      // task: the dead "transition" render case (confirmed unreachable
      // -- isStepReachable returns false for it unconditionally; kept
      // only for migrateLegacyNewArcLiveStep's own one-tick migration
      // safety) is removed -- its own "לחזור לתרגיל קצר" button was the
      // one remaining way a brand-new "plannedMini" session could ever
      // be created outside the now-removed Mini ARC entry points, even
      // though this whole case could never actually render. The
      // "transition" step id, its own getStepContent case, and the
      // migration itself all stay fully intact.

      case "emotional_action":
        // Nine Functional Improvements task, Improvement 3: subIndex 0
        // (below) is UNCHANGED -- picking a preset/free-typed action
        // still calls the existing setEmotionalAction, which now lands
        // on subIndex 1 (stepSubCount's own new "emotional_action" -> 2
        // case) instead of the next top-level step. subIndex 1 is the
        // new timer phase.
        if (session!.subIndex === 1) {
          const status = internalActionRun ? getTaskTimerStatus(internalActionRun, internalActionTickNow) : null;
          return (
            <View>
              <Text style={styles.primary}>{session!.emotionalActionText}</Text>
              {!internalActionRun ? (
                <View>
                  <TextInput
                    style={styles.textInput}
                    value={internalActionDurationDraft}
                    onChangeText={setInternalActionDurationDraft}
                    keyboardType="number-pad"
                    textAlign="right"
                    placeholder="משך הטיימר בדקות"
                  />
                  <Pressable style={styles.primaryButton} onPress={handleStartInternalActionTimer}>
                    <Text style={styles.primaryButtonText}>התחל טיימר</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  <Text style={styles.primary}>{formatInternalActionRemaining(status!.remainingSeconds)}</Text>
                  {status!.paused ? (
                    <Pressable style={styles.primaryButton} onPress={handleResumeInternalActionTimer}>
                      <Text style={styles.primaryButtonText}>המשך</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.secondaryButton} onPress={handlePauseInternalActionTimer}>
                      <Text style={styles.secondaryButtonText}>הפסקה זמנית</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.primaryButton} onPress={handleFinishInternalActionTimer}>
                    <Text style={styles.primaryButtonText}>סיום</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }
        return (
          <View>
            <View style={styles.chipRow}>
              {EMOTIONAL_ACTION_PRESETS.map((preset) => (
                <Pressable key={preset} style={styles.chip} onPress={() => commit(setEmotionalAction(session!, preset, now))}>
                  <Text style={styles.chipText}>{preset}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" placeholder="או כתוב פעולה אחרת" />
            {!!draftText.trim() && (
              <Pressable style={styles.primaryButton} onPress={() => commit(setEmotionalAction(session!, draftText, now))}>
                <Text style={styles.primaryButtonText}>המשך</Text>
              </Pressable>
            )}
          </View>
        );

      case "emotional_insight":
        // Unified ARC & Productivity Update task, requirement 4
        // ("REMOVE ACTIVE BELIEF-BUILDING SCREENS"): the optional
        // "אמונה מחזקת" free-text belief field is gone -- belief
        // selection/writing/creation no longer happens anywhere in the
        // active ARC flow. The "what did you learn" insight question
        // itself stays (it is a reflection, never a belief), still
        // required, still persisted exactly as before via
        // setEmotionalInsight/the "complete" step below -- only its
        // second argument is now always "" (empty), never a trainee-
        // authored belief string. All historical ArcBelief records,
        // and the belief-persistence code path itself (gated on
        // `session!.emotionalBeliefText`, see "complete" below), are
        // completely untouched -- simply never fed by this screen
        // again, never deleted or migrated.
        return (
          <View>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={draftText}
              onChangeText={setDraftText}
              textAlign="right"
              multiline
              placeholder="מה התובנה שלמדת על עצמך?"
            />
            <Pressable
              style={[styles.primaryButton, !draftText.trim() && styles.disabledButton]}
              disabled={!draftText.trim()}
              onPress={() => commit(setEmotionalInsight(session!, draftText, "", now))}
            >
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // ARCHI -- Unified 7-Part Update task, Part 5: "complete" now
      // fires its own return-to-task automatically (the
      // completeConsumedRef effect above) the instant it's reached --
      // "no extra... questions after Encoding" means no tap here
      // either. This passive line is on screen only for the brief
      // moment before that effect's own async chain finishes and
      // navigates away -- never a real decision point.
      case "complete":
        return <Text style={styles.hint}>חוזרים למשימה...</Text>;

      // Fix All Confirmed ARC Android Bugs task, requirement 2
      // ("Presence Mantras Inside the Circle"): these five Presence
      // steps now render through the SAME ArcBodyMantraCircle as
      // Dwelling/Acceptance/Regulation/Encoding below -- one circle,
      // the articulated body (always a neutral, motionless body here,
      // since nothing has been selected yet at this point in the
      // exercise -- contractionRegions/closureRegions/openingRegions
      // are always still empty arrays), continuous Presence behind it,
      // and this page's own fixed mantra (content.primary). Tapping
      // the circle advances -- no separate free-text capture any more
      // (center_attention's old optional "which object did you look
      // at" field, selectedFocusObject, was confirmed unread anywhere
      // downstream before being dropped here; nothing of substance is
      // lost). "body_scan" calls completePresenceSteps specifically
      // (not plain advance) to preserve that existing completion flag,
      // exactly as the old per-region body scan used to on its own
      // last region.
      case "natural_breathing":
      case "center_attention":
      case "visual_field":
      case "sound_awareness":
        return (
          <ArcBodyMantraCircle
            stage={session!.currentStep as ArcBodyMantraStage}
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={session!.bodyScanContractionRegions}
            closureRegions={resolveClosureRegions(session!)}
            openingRegions={session!.openingBodyScanRegions}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      case "body_scan":
        return (
          <ArcBodyMantraCircle
            stage="body_scan"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={session!.bodyScanContractionRegions}
            closureRegions={resolveClosureRegions(session!)}
            openingRegions={session!.openingBodyScanRegions}
            onAdvance={() => commit(completePresenceSteps(session!, now))}
          />
        );

      // Final ARC Flow & Body Animation task, requirement 4 ("ONE
      // CIRCLE -- BODY + MANTRA") + requirement 3 (body movement/color
      // progression across stages): Dwelling, Acceptance, Regulation
      // and Encoding & Action each now render the SAME single
      // ArcBodyMantraCircle -- one circular outline, the articulated
      // body, and this stage's own fixed/computed mantra (content.primary,
      // already resolved by getStepContent above), all inside that one
      // circle. Tapping it IS the "continue" action for these four
      // steps -- the ordinary outer title/primary/supporting text and
      // nav-row Continue button are suppressed for them (see
      // isBodyMantraStage below), never duplicated outside the circle.
      // Every color/movement decision reads the trainee's own actual
      // selections, verbatim -- never invented here.
      case "dwelling":
        return (
          <ArcBodyMantraCircle
            stage="dwelling"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={session!.bodyScanContractionRegions}
            closureRegions={resolveClosureRegions(session!)}
            openingRegions={session!.openingBodyScanRegions}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      case "acceptance":
        return (
          <ArcBodyMantraCircle
            stage="acceptance"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={session!.bodyScanContractionRegions}
            closureRegions={resolveClosureRegions(session!)}
            openingRegions={session!.openingBodyScanRegions}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      // ARCHI -- Full ARC Body Flow Redesign task: Acceptance Part 2,
      // right after Screen Two's Blue-only selection -- the same shared
      // circle component, its own distinct ArcBodyMantraStage.
      case "acceptance_part_two":
        return (
          <ArcBodyMantraCircle
            stage="acceptance_part_two"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={session!.bodyScanContractionRegions}
            closureRegions={resolveClosureRegions(session!)}
            openingRegions={session!.openingBodyScanRegions}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      // ARCHI -- Show Action Selection ON the Regulation Screen task:
      // the trainee reported that the action-selection prompt appeared
      // AFTER the Regulation circle/mantra (a separate sub-screen,
      // subIndex 1, reached only by tapping past Regulation) -- they
      // want it to appear ON the Regulation screen itself. "regulation"
      // is now always exactly one sub-screen (stepSubCount above
      // returns 1 unconditionally): the SAME unchanged circle/mantra
      // renders first, and (unless this is an ARC GYM situation, which
      // has nothing to select) the action-selection section renders
      // immediately below it, as a plain sibling -- same convention the
      // movement-instructions block under ArcBodyMantraCircle already
      // uses elsewhere, entirely outside the circle's own full-screen
      // tap surface, so there is no touch conflict between the two.
      //
      // The circle itself no longer advances the step on tap here --
      // advancing out of Regulation now happens only through an
      // explicit action in the section below (choosing/confirming an
      // action, which setSelectedAction already advances internally,
      // or the "המשך" button once a selection already exists) -- so a
      // trainee can never tap past Regulation without actually seeing
      // the action choice, exactly as before, just on one screen
      // instead of two. ARC GYM keeps its own prior tap-to-advance
      // behavior unchanged, since it has no action section at all.
      case "regulation": {
        // ARCHI -- Allow Action Selection During Emotion Identification
        // or Defer It to Regulation task: a selection already made
        // (whether on the earlier "emotion" screen or anywhere else)
        // is PRESERVED and DISPLAYED here, never silently re-asked --
        // "do not force the user to choose the same action again."
        // Only when the trainee explicitly taps "שנה פעולה" does the
        // existing picker (renderActionSelector) reappear. A deferred
        // selection (selectedActionSource still null) falls through to
        // that same existing picker exactly as before -- fully
        // unchanged for that case.
        const hasConfirmedAction = session!.selectedActionSource !== null && !showActionSelectorOnRegulation;
        return (
          <View>
            <ArcBodyMantraCircle
              stage="regulation"
              mantra={content.primary}
              presenceColor={presenceColorHex}
              circleOutlineColor={circleColorHex}
              contractionRegions={session!.bodyScanContractionRegions}
              closureRegions={resolveClosureRegions(session!)}
              openingRegions={session!.openingBodyScanRegions}
              onAdvance={() => {
                if (session!.arcGymSituationId) commit(advance(session!, now));
              }}
            />
            {!session!.arcGymSituationId && (
              <View>
                {/* The action-selection prompt text itself -- previously
                    shown via the generic title/primary header, now
                    inline since isBodyMantraStage hides that header for
                    the whole "regulation" step. */}
                <Text style={styles.title}>הפעולה הבאה</Text>
                <Text style={styles.primary}>איזו פעולה תרצה לעשות עכשיו?</Text>
                {hasConfirmedAction ? (
                  <View>
                    <Text style={styles.hint}>{`הפעולה שנבחרה: ${resolveActionText(session!) ?? ""}`}</Text>
                    <Pressable style={styles.optionRow} onPress={() => setShowActionSelectorOnRegulation(true)}>
                      <Text style={styles.optionText}>שנה פעולה</Text>
                    </Pressable>
                    <Pressable style={styles.primaryButton} onPress={() => commit(advance(session!, now))}>
                      <Text style={styles.primaryButtonText}>המשך</Text>
                    </Pressable>
                  </View>
                ) : (
                  renderActionSelector()
                )}
              </View>
            )}
          </View>
        );
      }

      // ARCHI -- Unified Final Specification task, section 2 ("Action
      // Selection must occur immediately AFTER Regulation and BEFORE
      // Encoding") / ARCHI -- Move Action Selection into the Existing
      // Regulation Screen task: these two step ids are now permanently
      // unreachable (isStepReachable, arc/newArcLiveSteps.ts) -- their
      // functionality moved into "regulation"/"mini_acceptance_transition"
      // at subIndex 1 (see renderActionSelector() below, now the ONE
      // shared implementation for all four call sites). This case stays
      // only for migrateLegacyNewArcLiveStep's own historical-data
      // safety (a session can briefly carry this currentStep in memory
      // for one render before that migration runs on load).
      case "action_selection":
      case "mini_action_selection":
        return renderActionSelector();

      // "Save the personalized encoding mantra with the selected
      // feeling and action context": tapping the circle here persists
      // the computed mantra (resolveEncodingMantra, arc/newArcLiveCopy.ts
      // -- the exact same text already shown inside the circle, via
      // content.primary) into the existing miniMantraText field through
      // the EXISTING setMiniEncoding setter, which also advances --
      // never a second, competing persistence path, and never the old
      // free-text mantra/belief input (replaced entirely by this
      // auto-computed mantra).
      case "encoding":
        if (positiveMemoryForEncoding && !positiveMemoryEncodingDismissed) {
          return renderPositiveMemoryEncodingBlock(positiveMemoryForEncoding);
        }
        return (
          <ArcBodyMantraCircle
            stage="encoding"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={session!.bodyScanContractionRegions}
            closureRegions={resolveClosureRegions(session!)}
            openingRegions={session!.openingBodyScanRegions}
            onAdvance={() => commit(setMiniEncoding(session!, resolveEncodingMantra(session!), session!.miniBeliefText ?? "", now))}
          />
        );

      // Part G: Mini ARC's own combined screens.
      case "mini_awareness":
        // Unified ARC & Productivity Update / ARCHI Universal ARC
        // Routing tasks: the optional urge field is gone from here --
        // "Urge" is now one of the three independent checkboxes on the
        // shared cognitive selector ("mini_thought" below), never
        // captured here too.
        //
        // ARCHI -- Combined Emotion & Supportive Feeling Selection
        // task, Part 2 ("MINI ARC -- SAME COMBINED SELECTION"): the
        // SAME inline supportive-feeling picker Full ARC's "emotion"
        // case uses, driven here from the local miniSelectedEmotion
        // draft (nothing is committed to the session until "Continue"
        // -- same existing convention as miniDesiredEndingDraft right
        // below it), so the suggestion/override is computed live, then
        // committed to the session atomically with the emotion itself.
        return (
          <View>
            <View style={styles.chipRow}>
              {PREDEFINED_EMOTION_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.chip, miniSelectedEmotion === option && styles.chipSelected]}
                  onPress={() => {
                    if (miniSelectedEmotion !== option) {
                      setMiniSupportiveFeelingOverride(null);
                      setMiniCustomSupportiveFeelingDraft("");
                      setMiniSupportiveFeelingIsCustom(false);
                    }
                    setMiniSelectedEmotion(option);
                  }}
                >
                  <Text style={[styles.chipText, miniSelectedEmotion === option && styles.chipTextSelected]}>{EMOTION_OPTION_LABELS[option]}</Text>
                </Pressable>
              ))}
            </View>
            {session!.goalType !== "emotion_only" && (
              <TextInput style={styles.textInput} value={miniDesiredEndingDraft} onChangeText={setMiniDesiredEndingDraft} textAlign="right" placeholder="התוצאה שרוצים לקדם (רשות)" />
            )}
            {miniSelectedEmotion !== null &&
              renderSupportiveFeelingPicker(
                miniSupportiveFeelingOverride ?? resolveSupportiveFeeling(miniSelectedEmotion, null),
                (feeling) => {
                  setMiniCustomSupportiveFeelingDraft("");
                  setMiniSupportiveFeelingIsCustom(false);
                  setMiniSupportiveFeelingOverride(feeling);
                },
                miniCustomSupportiveFeelingDraft,
                setMiniCustomSupportiveFeelingDraft,
                (text) => {
                  const trimmed = text.trim();
                  if (!trimmed) return;
                  setMiniSupportiveFeelingIsCustom(true);
                  setMiniSupportiveFeelingOverride({ feeling: trimmed, quality: trimmed, mantra: "" });
                }
              )}
            <Pressable
              style={styles.primaryButton}
              onPress={() =>
                commit(
                  setMiniAwareness(
                    session!,
                    miniSelectedEmotion,
                    null,
                    miniDesiredEndingDraft,
                    miniSupportiveFeelingOverride,
                    now,
                    miniSupportiveFeelingIsCustom ? miniSupportiveFeelingOverride?.feeling ?? null : null
                  )
                )
              }
            >
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // ARCHI -- Universal ARC Routing, Emotion Identification & Android
      // Shortcuts task, requirement 2/3B ("Mini ARC at entry with short
      // personalized branches"): Mini ARC's own upgrade to the SAME
      // shared cognitive-selector semantics -- three INDEPENDENT
      // checkboxes (any combination, including none/all three, never
      // "at most one" any more), each with its own optional text field,
      // all on this ONE combined screen (Mini ARC's own brevity design,
      // never split into three separate screens like Full ARC).
      // Reaching "המשך" with nothing checked (or checked but left
      // blank) commits all three fields as null -- genuinely declining,
      // never forced. mini_stop_accept_urge/mini_reality_acceptance
      // right after this step are UNCHANGED: they already gate on
      // urgeText/currentThought/interpretationText being set, whichever
      // of the three this screen just set.
      case "mini_thought": {
        const anySelected = miniCogThought || miniCogInterpretation || miniCogUrge;
        return (
          <View>
            <View style={styles.chipColumn}>
              <Pressable style={styles.optionRow} onPress={() => setMiniCogThought((value) => !value)}>
                <Text style={styles.optionText}>{miniCogThought ? "☑" : "☐"} מחשבה</Text>
              </Pressable>
              {miniCogThought && (
                <TextInput style={styles.textInput} value={miniThoughtDraft} onChangeText={setMiniThoughtDraft} textAlign="right" placeholder="איזו מחשבה מעסיקה אותך עכשיו? (רשות)" />
              )}
              <Pressable style={styles.optionRow} onPress={() => setMiniCogInterpretation((value) => !value)}>
                <Text style={styles.optionText}>{miniCogInterpretation ? "☑" : "☐"} פרשנות</Text>
              </Pressable>
              {miniCogInterpretation && (
                <TextInput style={styles.textInput} value={miniInterpretationDraft} onChangeText={setMiniInterpretationDraft} textAlign="right" placeholder="איזו פרשנות אתה נותן למצב? (רשות)" />
              )}
              <Pressable style={styles.optionRow} onPress={() => setMiniCogUrge((value) => !value)}>
                <Text style={styles.optionText}>{miniCogUrge ? "☑" : "☐"} דחף</Text>
              </Pressable>
              {miniCogUrge && (
                <TextInput style={styles.textInput} value={miniUrgeDraft} onChangeText={setMiniUrgeDraft} textAlign="right" placeholder="איזה דחף עולה עכשיו? (רשות)" />
              )}
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() =>
                commit(
                  setMiniCognitiveSelection(
                    session!,
                    { thought: miniCogThought, interpretation: miniCogInterpretation, urge: miniCogUrge },
                    { thought: miniThoughtDraft, interpretation: miniInterpretationDraft, urge: miniUrgeDraft },
                    now
                  )
                )
              }
            >
              <Text style={styles.primaryButtonText}>{anySelected ? "המשך לתרגיל" : "המשך עם הרגש בלבד"}</Text>
            </Pressable>
          </View>
        );
      }

      // Three-levels-of-acceptance task, section 6 / Unified ARC &
      // Productivity Update task, requirement 6: with a thought
      // (modes B/C) and no orientation chosen yet, the chip picker
      // shows (unchanged -- picking a chip commits reactively, same
      // pattern as unpleasant_area_select, never advancing on its
      // own). Requirement 7: the MOMENT an orientation is known (or,
      // mode A, immediately -- no thought to classify at all), this
      // single Mini ARC screen shows the Presence visuals instead of
      // chips -- point + ONE expanding circle + the exact mantra, body
      // hidden (requirement 8) -- still exactly one sub-screen, the
      // circle itself simply replacing the chips/continue-button once
      // the mantra is known, matching Mini ARC's own brevity
      // requirement (stepSubCount stays 1 throughout).
      case "mini_reality_acceptance":
        if (session!.currentThought && !session!.thoughtTimeOrientation) {
          return (
            <View style={styles.chipRow}>
              {getThoughtTimeOrientationOptions().map((option) => (
                <Pressable key={option.value} style={styles.chip} onPress={() => commit({ ...session!, thoughtTimeOrientation: option.value })}>
                  <Text style={styles.chipText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          );
        }
        return (
          <ArcBodyMantraCircle
            stage={session!.currentThought ? "thought_acceptance" : "interpretation_acceptance"}
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={[]}
            closureRegions={[]}
            openingRegions={[]}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      // ARCHI -- Two Mantras for Urge Acceptance correction: Mini ARC's
      // own urge screen now shows the exact SAME content (and the same
      // two below-circle mantras) as Full ARC's "stop_and_accept_urge"
      // -- "apply this change whenever the urge-acceptance branch is
      // used, including Full ARC, Mini ARC."
      case "mini_stop_accept_urge":
        return (
          <ArcBodyMantraCircle
            stage="urge_acceptance"
            mantra={content.primary}
            belowCircleLines={content.supporting}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={[]}
            closureRegions={[]}
            openingRegions={[]}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      // ARCHI -- Move Action Selection into the Existing Regulation
      // Screen task: subIndex 0 is the UNCHANGED existing area/
      // sensation/movement form -- its own Continue still just calls
      // setMiniAcceptanceTransition, which (via stepSubCount
      // ("mini_acceptance_transition") now returning 2 whenever action
      // selection applies) moves to subIndex 1 WITHOUT leaving this
      // step, instead of leaving to the old standalone
      // "mini_action_selection" screen. subIndex 1 renders the
      // SAME integrated action-selector "regulation" uses above.
      // ARCHI -- Consolidated Implementation Request, Part 6 ("Presence:
      // Expanding Field of View"): "mini_presence" now renders through
      // the SAME ArcBodyMantraCircle every Full ARC Presence page
      // (natural_breathing/center_attention/visual_field/sound_awareness)
      // already uses -- the central point + the one expanding circle --
      // instead of falling through to the generic default (plain header
      // + button) it used before. content.primary is unchanged (still
      // getStepContent's own combined field-widening/thought-acceptance
      // text); contractionRegions/closureRegions/openingRegions stay
      // empty arrays, same as every pre-body-awareness Presence page,
      // since showBody is false for this stage (resolveShowBodyForStage).
      case "mini_presence":
        return (
          <ArcBodyMantraCircle
            stage="mini_presence"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={[]}
            closureRegions={[]}
            openingRegions={[]}
            onAdvance={() => commit(advance(session!, now))}
          />
        );

      case "mini_acceptance_transition":
        if (session!.subIndex === 1) return renderActionSelector();
        return (
          <View>
            {/* ARCHI -- Fix Mini ARC Interactive Body Selection and
                Three-Tap Color Model task, section 5: a dedicated,
                full-text, VERTICAL legend for Mini ARC's own three-tap
                cycle, using plain, wrapping Text rows that can never be
                horizontally clipped on a narrow screen. Placed above
                the interactive body map, per section 5's own "place the
                legend above the interactive body map" instruction. Full
                ARC's own two body-selection screens (body_scan_contraction/
                body_scan_opening_region) now rely on their own
                supporting-text explanations instead of a separate
                swatch legend -- see arc/newArcLiveCopy.ts's own content
                for those two steps. */}
            <View style={styles.miniBodyLegendColumn}>
              <Text style={styles.miniBodyLegendText}>🔴 1 לחיצה — אזור מכווץ</Text>
              <Text style={styles.miniBodyLegendText}>🟢 2 לחיצות — אזור מכווץ וסגור / לא יציב</Text>
              <Text style={styles.miniBodyLegendText}>🔵 3 לחיצות — אזור סגור / לא יציב ותומך</Text>
            </View>
            {/* ARCHI -- Fix Mini ARC Interactive Body Selection and
                Three-Tap Color Model task, section 1/3: the body
                silhouette is now genuinely interactive for Mini ARC --
                onToggle drives cycleMiniBodyScanRegion (via the same
                friendly-limit pre-check attemptCycleMiniBodyScanRegion
                every other opening-role screen already uses), one tap
                at a time, through RED -> LIGHT GREEN -> DARK BLUE ->
                unselected. The SAME existing session fields/component
                as before (bodyScanContractionRegions for red,
                openingBodyScanRegions for green/blue) -- never a second
                body map or a second Green/Blue data model, and a
                standalone Mini ARC session with both arrays still
                empty shows exactly the same plain neutral body as
                before. resolveSelectedColorForRegion now checks the
                opening role FIRST, before contraction -- once a region
                is promoted past its first (red) tap, its opening color
                (green/blue) must win, never fall back to red just
                because the region is still also contracted
                underneath (section 3: "preserve that contraction
                separately. Do not classify contraction itself as
                supportive" -- the data stays separate; only the
                display priority changes here). */}
            <BodySilhouetteMap
              selectedColor={CONTRACTION_SELECTED_COLOR}
              resolveSelectedColorForRegion={(region, side) => {
                const openingColor = resolveOpeningRegionSelectedColor(session!, region, side);
                if (openingColor) return openingColor;
                return resolveBodyScanContractionState(session!.bodyScanContractionRegions, region, side) === "contraction" ? CONTRACTION_SELECTED_COLOR : null;
              }}
              isSelected={(region, side) =>
                resolveBodyScanContractionState(session!.bodyScanContractionRegions, region, side) === "contraction" ||
                session!.openingBodyScanRegions.some((entry) => entry.region === region && entry.side === side)
              }
              onToggle={(region, side) => {
                const next = attemptCycleMiniBodyScanRegion(session!, region, side);
                if (next) commit(next);
              }}
            />
            {/* ARCHI -- Fix Mini ARC Interactive Body Selection and
                Three-Tap Color Model task, section 2: the separate
                anatomical-name chip row (ראש/פנים/לסת/צוואר/כתפיים/גב/
                בטן/חזה/זרועות/כפות ידיים/רגליים וכפות רגליים) is
                removed from THIS screen -- regions are now selected
                directly on the body illustration above. The underlying
                BodyRegion definitions/labels and the shared region-name
                constant they come from, plus every OTHER screen's own
                chip picker that still uses them (e.g. Full ARC's own
                supportive_area_select below), are completely
                untouched. */}
            <TextInput style={styles.textInput} value={miniSensationDraft} onChangeText={setMiniSensationDraft} textAlign="right" placeholder="תחושה תומכת" />
            <TextInput style={styles.textInput} value={miniMovementDraft} onChangeText={setMiniMovementDraft} textAlign="right" placeholder="תנועה תומכת" />
            <Pressable
              style={[styles.primaryButton, (!canContinue || !miniSensationDraft.trim() || !miniMovementDraft.trim()) && styles.disabledButton]}
              disabled={!canContinue || !miniSensationDraft.trim() || !miniMovementDraft.trim()}
              onPress={() => commit(setMiniAcceptanceTransition(session!, null, miniSensationDraft, miniMovementDraft, now))}
            >
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
          </View>
        );

      // Unified ARC & Productivity Update task, requirement 4: the
      // free-text "מנטרה אישית"/"אמונה לתרגול" belief-building inputs
      // are gone -- the mantra actually shown above (content.primary,
      // via the generic !isBodyMantraStage block) is already the
      // auto-computed resolveEncodingMantra text (requirement 3); this
      // continue button simply persists that same value, exactly like
      // Full ARC's own "encoding" case does, never a trainee-authored
      // override. Any legacy miniBeliefText from before this task is
      // preserved untouched (never invented, never cleared).
      // ARCHI -- Consolidated Implementation Request, Part 9: same
      // ArcBodyMantraCircle/stage="encoding" Full ARC's own "encoding"
      // case above uses -- same body visualization (whatever
      // contraction/opening regions this session actually carries,
      // verbatim, never invented), the same growth-index-8 circle
      // (already larger than mini_presence's growth index 2, so "larger
      // than during Presence" holds without a new intensity-table
      // entry), and the focus point, all in the one circle. The
      // sensation/area/movement line (content.supporting) renders via
      // belowCircleLines -- the SAME non-interactive mechanism urge_
      // acceptance's own extra mantra lines already use -- so "selected
      // action and personalized Encoding instructions" (content.primary,
      // already resolveEncodingMantra) and the body-focused detail stay
      // together on this one screen, never split into two.
      case "mini_encoding":
        if (positiveMemoryForEncoding && !positiveMemoryEncodingDismissed) {
          return renderPositiveMemoryEncodingBlock(positiveMemoryForEncoding);
        }
        return (
          <ArcBodyMantraCircle
            stage="encoding"
            mantra={content.primary}
            presenceColor={presenceColorHex}
            circleOutlineColor={circleColorHex}
            contractionRegions={session!.bodyScanContractionRegions}
            closureRegions={resolveClosureRegions(session!)}
            openingRegions={session!.openingBodyScanRegions}
            belowCircleLines={content.supporting}
            onAdvance={() => commit(setMiniEncoding(session!, resolveEncodingMantra(session!), session!.miniBeliefText ?? "", now))}
          />
        );

      default:
        return (
          <Pressable
            style={[styles.primaryButton, !canContinue && styles.disabledButton]}
            disabled={!canContinue}
            onPress={() => commit(advance(session!, now))}
          >
            <Text style={styles.primaryButtonText}>המשך</Text>
          </Pressable>
        );
    }
  }

  // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
  // Background task, section 3: "once the introductory animation
  // finishes, maintain the same uniform background color... throughout
  // all subsequent ARC screens... never switch back to the default
  // white." A pure function of ONE field (resolveArcBackgroundColor,
  // arc/freeBreathingIntro.ts) -- null for Shortened ARC's entire run,
  // and for Full/Mini ARC before the intro is reached.
  const arcBackgroundColor = resolveArcBackgroundColor(session);

  return (
    <SafeAreaView style={[styles.safeArea, arcBackgroundColor ? { backgroundColor: arcBackgroundColor } : null]}>
      {/* The one animated wash for the free_breathing step's own
          "gradually expands... becomes uniform" transition -- a plain,
          non-interactive, absolute-fill sibling behind the ScrollView,
          never affecting touch/scroll. Once freeBreathingIntroShown is
          true, the SafeAreaView's own static backgroundColor above
          already carries the color for every later step, so this layer
          only ever matters while actually on "free_breathing". */}
      {isFreeBreathingStage && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: ARC_FREE_BREATHING_BACKGROUND_COLOR }, backgroundWashStyle]}
        />
      )}
      <ScrollView contentContainerStyle={[styles.content, (isBodyMantraStage || isFreeBreathingStage) && styles.contentCentered]}>
        <Text style={styles.progress}>{`שלב ${progress.position} מתוך ${progress.total}`}</Text>
        {!isBodyMantraStage && !isFreeBreathingStage && (
          <>
            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.primary}>{content.primary}</Text>
            {content.supporting.map((line) => (
              <Text key={line} style={styles.supporting}>
                {line}
              </Text>
            ))}
          </>
        )}

        {renderBody()}

        {/*
         * ARC Decision task: while the inline overlay is showing, its
         * OWN back/cancel controls (live/components/ArcDecisionFlow.tsx)
         * are the only navigation on screen -- the generic ARC step
         * back/skip below must stay hidden, since "חזרה" here would
         * otherwise step the underlying ARC session itself backward
         * (goBack), which is never what the overlay's own "חזרה" means.
         */}
        {!arcDecisionSession && (
          <View style={styles.navRow}>
            {previous && (
              <Pressable
                onPress={() => {
                  // Nine Functional Improvements task, Improvement 3:
                  // going back from the timer phase (subIndex 1) to
                  // re-pick the action (subIndex 0) discards any
                  // in-flight internal-action timer -- it belonged to the
                  // action being abandoned, never silently resumed
                  // against whatever gets picked next.
                  if (session!.currentStep === "emotional_action" && session!.subIndex === 1) {
                    clearInternalActionTimerRun();
                    setInternalActionRun(null);
                  }
                  commit(goBack(session, now));
                }}
              >
                <Text style={styles.linkText}>חזרה</Text>
              </Pressable>
            )}
            {skippable && (
              <Pressable onPress={() => commit(advanceWithSkip(session, now))}>
                <Text style={styles.linkText}>דלג</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/*
       * Body Scan Upgrade task, section 7: "פתיחת חלון מידע... לא
       * תאפס את הבחירות" -- this Modal is purely presentational over
       * `infoModal` (own UI state, see its declaration above), never
       * touching `session`. Closing it (either button) is always just
       * setInfoModal(null).
       */}
      <Modal visible={!!infoModal} transparent animationType="fade" onRequestClose={() => setInfoModal(null)}>
        <Pressable style={styles.infoModalOverlay} onPress={() => setInfoModal(null)}>
          <View style={styles.infoModalCard}>
            <Text style={styles.infoModalTitle}>{infoModal?.title}</Text>
            <Text style={styles.infoModalText}>{infoModal?.text}</Text>
            <Pressable style={styles.primaryButton} onPress={() => setInfoModal(null)}>
              <Text style={styles.primaryButtonText}>סגור</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * ARCHI -- Combined Emotion & Supportive Feeling Selection task: the
 * ONE shared inline picker rendered by all three screens that offer a
 * supportive feeling (Full ARC's "emotion," Mini ARC's
 * "mini_awareness," and -- since the ARCHI -- Refine the Shortened ARC
 * / "סבבה" Pathway task, requirement 4 -- Shortened ARC's own
 * "supportive_area_select") -- never three separately-authored UIs
 * that could drift out of sync. `current` is whatever
 * arc/newArcLiveSteps.ts's own resolveFinalSupportiveFeeling already
 * decided (override, else automatic mapping from an emotion, else
 * null) -- shown pre-selected, never a second, separate "is this
 * chosen" computation; this function already handles `current === null`
 * gracefully (the "בחר תחושה תומכת (רשות):" label), which is exactly
 * the Shortened ARC call site's own starting state, since it has no
 * emotion to map from at all. The alternatives list
 * (arc/supportiveFeelingMapping.ts's own listSupportiveFeelingAlternatives)
 * excludes whichever feeling is already current, so it is never
 * offered as its own "alternative." Full ARC's "emotion" and Mini
 * ARC's "mini_awareness" still render it only once their own emotion
 * has actually been chosen; Shortened ARC's own call site renders it
 * unconditionally, since it never asks about emotion at all.
 */
/**
 * ARCHI -- Three UX Improvements task, Improvement 1: extended with a
 * trailing "רגש אחר -- כתיבה חופשית" chip + free-text input, the exact
 * same "tap chip to reveal input, disabled commit button while blank"
 * convention the main/unpleasant emotion's own "אחר" option already
 * uses (case "emotion" above). Since every one of this function's
 * three call sites (Full ARC's "emotion", Mini ARC's "mini_awareness",
 * Shortened ARC's embedded control) shares this ONE implementation,
 * adding custom-text support here propagates to all three at once --
 * never a second, duplicated supportive-feeling picker.
 */
function renderSupportiveFeelingPicker(
  current: SupportiveFeelingMapping | null,
  onPick: (feeling: SupportiveFeelingMapping) => void,
  customDraft: string,
  onCustomDraftChange: (text: string) => void,
  onCommitCustom: (text: string) => void
) {
  const alternatives = listSupportiveFeelingAlternatives(current?.feeling ?? null);
  return (
    <View style={styles.supportiveFeelingSection}>
      <Text style={styles.supportiveFeelingLabel}>{current ? "התחושה התומכת (ניתן לשינוי במגע אחד):" : "בחר תחושה תומכת (רשות):"}</Text>
      <View style={styles.chipRow}>
        {current && (
          <View style={[styles.chip, styles.chipSelected]}>
            <Text style={[styles.chipText, styles.chipTextSelected]}>{current.feeling}</Text>
          </View>
        )}
        {alternatives.map((alternative) => (
          <Pressable key={alternative.feeling} style={styles.chip} onPress={() => onPick(alternative)}>
            <Text style={styles.chipText}>{alternative.feeling}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.chip} onPress={() => onCustomDraftChange(customDraft || " ")}>
          <Text style={styles.chipText}>רגש אחר — כתיבה חופשית</Text>
        </Pressable>
      </View>
      {!!customDraft && (
        <>
          <TextInput
            style={styles.textInput}
            value={customDraft.trim()}
            onChangeText={onCustomDraftChange}
            textAlign="right"
            placeholder="איך תרצה לקרוא לתחושה התומכת?"
          />
          <Pressable style={[styles.primaryButton, !customDraft.trim() && styles.disabledButton]} disabled={!customDraft.trim()} onPress={() => onCommitCustom(customDraft)}>
            <Text style={styles.primaryButtonText}>בחר תחושה זו</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function advanceWithSkip(state: NewArcLiveSessionState, now: string): NewArcLiveSessionState {
  switch (state.currentStep) {
    case "emotion":
      return setEmotion(state, null, null, now);
    case "urge":
      return setUrgeText(state, "", now);
    case "thought":
      return setThought(state, "", now);
    case "interpretation":
      return setInterpretation(state, "", now);
    case "desired_ending":
      return setDesiredEnding(state, state.goalType === "emotion_only" ? "תחושה נעימה יותר" : "השלמתי את הפעולה", now);
    case "desired_feeling_select":
      return setDesiredFeeling(state, "", now);
    case "focus_color":
      return setFocusColor(state, null, now);
    case "mini_thought":
      return setMiniCognitiveSelection(state, { thought: false, interpretation: false, urge: false }, { thought: "", interpretation: "", urge: "" }, now);
    default:
      return state;
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  // Circle Centering and Touch Behavior task, requirement 1: "centered
  // horizontally AND VERTICALLY in the available screen area... not
  // centering within a component." The circle itself only ever
  // centers itself horizontally within whatever width it's given
  // (live/components/ArcBodyMantraCircle.tsx) -- genuine vertical
  // centering on the actual screen has to come from here, the actual
  // screen-level container. Relies on `flexGrow: 1` (already set on
  // `content` above) plus `justifyContent: "center"`: when the real
  // content (just the progress line + the one circle, for these four
  // stages -- the ordinary title/primary/supporting text is suppressed
  // for them) is SHORTER than the viewport, ScrollView's own content
  // container centers it in the remaining space; when it's TALLER
  // (a long mantra + a large circle on a short device), it falls back
  // to ordinary top-anchored scrolling instead -- "account for...
  // scrolling" -- never clipping or forcing an awkward squeeze.
  // Mathematically, centering a FIXED-size group of flex siblings this
  // way keeps a GROWING sibling's own center exactly fixed as it grows
  // (the added height splits evenly above/below the growing item's
  // own center) -- "as the circle expands, its center must remain
  // fixed" holds as a direct consequence, not a separate thing to
  // engineer.
  contentCentered: { justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  warningText: { fontSize: 14, textAlign: "right", color: "#B00020", marginTop: 10, marginBottom: 4, fontWeight: "600" },
  progress: { fontSize: 12, textAlign: "right", color: "#999", marginBottom: 6 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  primary: { fontSize: 17, textAlign: "right", color: "#222", lineHeight: 25, marginBottom: 8 },
  supporting: { fontSize: 14, textAlign: "right", color: "#555", lineHeight: 20, marginBottom: 6 },
  chipColumn: { gap: 10, marginTop: 12 },
  optionRow: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "flex-end" },
  optionRowDisabled: { opacity: 0.5 },
  optionText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
  selfObservationNameButton: { backgroundColor: "#0a7ea4", borderRadius: 14, paddingVertical: 24, alignItems: "center", marginTop: 16 },
  selfObservationNameButtonText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipTextSelected: { color: "#fff" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  // ARCHI -- Combined Emotion & Supportive Feeling Selection task: the
  // inline supportive-feeling suggestion/override section shown on
  // the SAME screen as the current-emotion choice -- never a separate
  // screen of its own.
  supportiveFeelingSection: { marginTop: 18 },
  supportiveFeelingLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", color: "#444", marginBottom: 4 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginTop: 10 },
  multilineInput: { minHeight: 80, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
  positiveMemoryCard: { backgroundColor: "#FFF8E1", borderRadius: 14, padding: 20, marginTop: 12 },
  positiveMemoryPrompt: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#333", marginBottom: 10 },
  positiveMemoryFeeling: { fontSize: 15, fontWeight: "600", textAlign: "right", color: "#8A6D00", marginBottom: 6 },
  positiveMemoryLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", color: "#8A6D00", marginBottom: 4 },
  positiveMemoryMoment: { fontSize: 16, fontWeight: "600", textAlign: "right", color: "#333", marginBottom: 10 },
  positiveMemoryGratitude: { fontSize: 15, fontStyle: "italic", textAlign: "right", color: "#8A6D00", marginBottom: 10 },
  positiveMemoryDetail: { fontSize: 14, textAlign: "right", color: "#555", marginBottom: 6 },
  positiveMemoryActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  disabledButton: { opacity: 0.5 },
  navRow: { flexDirection: "row-reverse", justifyContent: "flex-end", gap: 20, marginTop: 20 },
  linkText: { color: "#666", fontSize: 14 },
  infoButton: { alignSelf: "flex-end", marginTop: 8 },
  infoButtonText: { color: "#0a7ea4", fontSize: 13 },
  // ARCHI -- Green/Blue Logic task, Section 7: compact legend row near the
  // body-selection interface. A swatch (not color alone) plus text satisfies
  // "accessible visual indicators beyond color where practical."
  openingRoleLegendRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 18, marginTop: 10, marginBottom: 4 },
  openingRoleLegendItem: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  openingRoleLegendSwatch: { width: 14, height: 14, borderRadius: 7 },
  openingRoleLegendText: { fontSize: 13, color: "#444" },
  // ARCHI -- Fix Mini ARC Interactive Body Selection and Three-Tap
  // Color Model task, section 5: a compact VERTICAL column, each
  // explanation its own full-width Text that wraps freely (no
  // numberOfLines limit, no horizontal ScrollView anywhere in this
  // column) -- "do not use a horizontally scrolling legend that cuts
  // off important text." width: "100%" plus flexShrink keeps every
  // line within the available screen width on narrow devices.
  miniBodyLegendColumn: { width: "100%", gap: 6, marginTop: 10, marginBottom: 10 },
  miniBodyLegendText: { fontSize: 14, color: "#333", textAlign: "right", writingDirection: "rtl", flexShrink: 1 },
  infoModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  infoModalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 360 },
  infoModalTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  infoModalText: { fontSize: 14, textAlign: "right", color: "#444", lineHeight: 20, marginBottom: 14 },
});

/** Same mm:ss precedent as live/ActiveTaskScreen.tsx's own (unexported) formatRemaining. */
function formatInternalActionRemaining(remainingSeconds: number): string {
  const totalSeconds = Math.ceil(remainingSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
