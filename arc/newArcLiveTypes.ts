/**
 * arc/newArcLiveTypes.ts
 *
 * Simplified-architecture task, Phase 2: shared types for the new,
 * self-contained ARC LIVE flow. There is no separate ARC BUILD behind
 * this flow -- every choice (supportive body area, supportive
 * sensation, positive movement, emotion, focus color, etc.) is made
 * live, at runtime, by the trainee, never pre-configured. This is
 * deliberately a NEW, independent module tree (arc/newArcLive*.ts),
 * not an extension of the old BUILD-driven engine (arc/arcEngine.ts,
 * live/ArcLiveRenderer.tsx) -- that engine's whole shape assumes a
 * pre-authored ArcBuildProfile, which has no equivalent here.
 *
 * Continuity rule (the task's own central requirement): exactly ONE
 * field each for the supportive body area, the supportive/renewing
 * sensation, and the positive movement -- selected once (Step 9) and
 * read verbatim by Acceptance, Regulation, and Encoding. No competing
 * field for the same concept exists anywhere in this module.
 */

import type { BodyRegion } from "./bodyRegionRoles.ts";
import type { BodyScanRegion } from "./bodyScanRegions.ts";
import type { BodyScanContractionSelection, BodyScanHeavinessSelection, BodyScanOpeningSelection, BodyScanSide } from "./bodyScanSelection.ts";
/** ARCHI -- Combined Emotion & Supportive Feeling Selection task: the shape of an explicitly-chosen supportive feeling (feeling + quality + mantra together, never just the feeling word alone -- a feeling word alone would be ambiguous whenever two emotions share it, e.g. fear/shame both -> ביטחון with different quality/mantra). Type-only import; arc/supportiveFeelingMapping.ts itself only ever imports EmotionSelection (also type-only) back from this file, so this is never a runtime circular dependency. */
import type { SupportiveFeelingMapping } from "./supportiveFeelingMapping.ts";
/** Three-levels-of-acceptance task: reused UNCHANGED from the existing, independent ARC Thought engine (arc/thoughtLive.ts) -- "past"/"present"/"future", same three values, never a second, parallel type for the identical concept. */
import type { ThoughtTimeOrientation } from "./types.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

/**
 * ARC-system upgrade task, Part A: the three ARC tracks --
 * "emotion_only" (Emotional ARC: an emotional action only, no identity
 * action, no outcome/value imagery), "action" (Task ARC: an identity
 * action only -- the identity action itself happens AFTER this screen
 * hands back to the task, see live/ActiveTaskScreen.tsx's own
 * handleComplete), "combined" (Combined Task ARC: an emotional action
 * live in THIS screen, immediately followed by the identity action
 * after handoff -- never one replacing the other).
 */
export type NewArcLiveGoalType = "action" | "emotion_only" | "combined";

/**
 * ARC-system upgrade task, Part B.1: a spontaneous ARC session can be
 * "רגשי עצמאי" (emotional, standalone -- no task at all) or "מקושר
 * למשימה" (linked to a real task). This sentinel taskId marks the
 * standalone case -- never a real Task.id, never persisted as one
 * anywhere outside this one session's own record. Any consumer reading
 * a NewArcLiveSessionState (live/NewArcLiveScreen.tsx's reload/
 * returnToTask, and Part C's future draft-generation) checks against
 * this constant rather than re-inventing its own "is this standalone"
 * test. A standalone session's goalType is restricted to "emotion_only"
 * only (arc/newArcLiveSteps.ts's setGoalType does not enforce this --
 * the screen's own goal_select render simply never offers the other
 * two options when taskId === this sentinel), since there is no real
 * task to perform an identity action for.
 */
export const STANDALONE_ARC_TASK_ID = "__standalone__";

/**
 * ARC-system upgrade task, Part H: which of the three invocation modes
 * produced this session -- governs exactly two engine-level
 * differences (never just copy-level): (1) only "plannedFull"/
 * "plannedMini" ever show the side-view unpleasant-area imagery and the
 * full per-region body scan; "spontaneous" always skips both (Part
 * B.2/F.3). (2) "plannedMini" uses the separate, genuinely-shorter Mini
 * ARC step sequence (arc/newArcMiniSteps.ts) instead of this module's
 * Full ARC sequence. Defaults to "plannedFull" for every session
 * created before this field existed (createNewArcLiveSessionState's own
 * 4th positional default), preserving the exact pre-existing behavior
 * for the in-task "need ARC" entry point.
 *
 * Unified Emotional Check-In and Task Postponement System:
 * "shortened" -- the ARCHI Home/Android-widget "🙂 סבבה" choice and the
 * Postponement intervention screen's own matching smiley. It walks the
 * exact SAME Full ARC step order as every other non-Mini mode
 * (resolveStepOrder in arc/newArcLiveSteps.ts has no special case for
 * it), but isStepReachable there skips the preliminary AWARENESS stages
 * (emotion identification, thought/urge, presence exercises, the full
 * body scan) by mode, never by inventing missing data. This is
 * deliberately NOT "plannedMini": Mini ARC is a genuinely different,
 * separately-authored five-screen protocol, still only ever reached the
 * existing way (automatically generated after a trainee's first
 * completed full spontaneous ARC); "shortened" is an adaptive shorter
 * walk through the SAME Full ARC screens, never a parallel engine.
 */
export type ArcInvocationMode = "spontaneous" | "plannedFull" | "plannedMini" | "shortened";

export const PREDEFINED_EMOTION_OPTIONS = [
  "fear",
  "frustration",
  "overwhelm",
  "boredom",
  "anger",
  "sadness",
  "shame",
  "lack_of_motivation",
  "tiredness",
] as const;
export type PredefinedEmotionOption = (typeof PREDEFINED_EMOTION_OPTIONS)[number];
/** "other" means a free-typed personal label is used instead (customEmotionText) -- never a 10th fixed option with its own copy. */
export type EmotionSelection = PredefinedEmotionOption | "other";

export const EMOTION_OPTION_LABELS: Record<PredefinedEmotionOption, string> = {
  fear: "פחד",
  frustration: "תסכול",
  overwhelm: "עומס",
  boredom: "שעמום",
  anger: "כעס",
  sadness: "עצב",
  shame: "בושה",
  lack_of_motivation: "חוסר מוטיבציה",
  tiredness: "עייפות",
};

export const FOCUS_COLOR_OPTIONS = ["אדום", "כתום", "צהוב", "ירוק", "כחול", "סגול", "לבן", "שחור"];

export const SUPPORTIVE_SENSATION_OPTIONS = ["יציבות", "רוגע", "אנרגיה", "ביטחון", "מיקוד", "פתיחות", "נינוחות", "מוטיבציה"];

/**
 * ARC Full Sequence Update task, Part 1 step 4 ("Choose the Desired
 * Feeling"): the example options the question "מה היית רוצה להרגיש?"
 * offers -- verbatim from the spec. "אחר" is not listed here (same
 * convention as PREDEFINED_EMOTION_OPTIONS/EmotionSelection's own
 * "other": the trainee's free-typed text on the same screen covers it,
 * never a 9th fixed chip with its own copy).
 */
export const DESIRED_FEELING_OPTIONS = ["רוגע", "ביטחון", "קלילות", "חופש", "נינוחות", "שמחה", "יציבות"];

export const BODY_SCAN_REGION_GROUPS = ["feet", "legs", "abdomen", "chest_back", "hands_arms", "shoulders_neck", "face_head"] as const;
export type BodyScanRegionGroup = (typeof BODY_SCAN_REGION_GROUPS)[number];
export const BODY_SCAN_REGION_GROUP_LABELS: Record<BodyScanRegionGroup, string> = {
  feet: "כפות הרגליים",
  legs: "הרגליים",
  abdomen: "הבטן",
  chest_back: "החזה והגב",
  hands_arms: "כפות הידיים והזרועות",
  shoulders_neck: "הכתפיים והצוואר",
  face_head: "הפנים והראש",
};

/** Every top-level stop in the sequence -- ordering/branching itself lives in arc/newArcLiveSteps.ts, never inline in a screen component. */
export type NewArcLiveStepId =
  | "goal_select"
  // "התבוננות וחיבור לעצמי" task: a two-step pair sitting right before
  // "free_breathing" below, in BOTH NEW_ARC_LIVE_STEP_ORDER and
  // NEW_ARC_MINI_STEP_ORDER (arc/newArcLiveSteps.ts). "self_observation_
  // choice" is the always-present branch screen ("לעשות תרגיל התבוננות
  // עצמית" / "להמשיך הלאה"); its OWN reachability is what actually
  // scopes this to the two required pathways (Full ARC's "spontaneous"
  // == the "פחות טוב" mood-check-in entry, and Mini ARC, which has no
  // sub-pathway of its own) -- see isStepReachable. "self_observation_
  // exercise" is the guided screen itself, reachable only when the
  // trainee actually chose it (selfObservationChoice === "exercise" on
  // the session -- a real, persisted field, never re-asked, same
  // convention as every other conditionally-skippable step here).
  | "self_observation_choice"
  | "self_observation_exercise"
  // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
  // Background task: the one shared opening screen for Full ARC and
  // Mini ARC alike -- a gentle breathing illustration + the exact
  // mantra "אני נושם בצורה חופשית.", right after goal_select and
  // BEFORE "cognitive_selector"/"mini_awareness". Permanently
  // unreachable for "shortened" mode ("Keep Shortened ARC (סבבה)
  // unchanged") -- see isStepReachable in arc/newArcLiveSteps.ts.
  // Reaching it (continue OR skip, both identical in effect -- there
  // is no data to decline) sets freeBreathingIntroShown true, which is
  // also what makes the persistent pale-blue background
  // (arc/freeBreathingIntro.ts's resolveArcBackgroundColor) apply from
  // that point on, for the rest of the session.
  | "free_breathing"
  | "desired_ending"
  // ARC Full Sequence Update task, Part 1 steps 4-5: a genuinely new
  // pair of steps, deliberately distinct from "desired_ending" above
  // (which keeps its own existing, goalType-dependent role unchanged)
  // -- see arc/newArcLiveSteps.ts's own NEW_ARC_LIVE_STEP_ORDER doc
  // comment for exactly where these sit in the sequence.
  | "desired_feeling_select"
  | "desired_feeling_locate"
  // ARCHI -- Universal ARC Routing, Emotion Identification & Android
  // Shortcuts task, requirement 2 ("ONE SHARED INITIAL COGNITIVE
  // SELECTOR"): "מה מופיע אצלי עכשיו?" -- three INDEPENDENT checkboxes
  // (Thought / Interpretation / Urge, any combination from none to all
  // three; Emotion is deliberately never a fourth option here -- it has
  // its own always-reachable "emotion" step below, requirement 4). This
  // replaces the old "emotion screen also captures urge" / "thought
  // screen also captures interpretation" combined-capture design --
  // each of the three cognitive branches below is now its own
  // independently-gated capture+acceptance pair, reachable only when
  // the trainee actually checked that box (selectedCognitiveThought/
  // Interpretation/Urge on the session, set once here by
  // setCognitiveSelection in arc/newArcLiveSteps.ts). Skipped entirely
  // for "shortened" (requirement 3D: "Shortened ARC skips the selector
  // but still requires emotion ID + Presence/body exercise").
  | "cognitive_selector"
  // Requirement 6 ("ordering for multiples: Urge -> Thought ->
  // Interpretation -> Emotion Identification -> Presence/Body
  // Exercise"): captures ONLY urgeText -- reachable only when the
  // selector above checked "urge" (selectedCognitiveUrge). Deliberately
  // separate from "emotion" below now (the old combined screen is
  // gone): urge is "what's happening right now," asked and accepted
  // BEFORE emotion is even named, never bundled with it any more.
  | "urge"
  // UNCHANGED acceptance flow -- still the one combined "stop the
  // automatic movement and let the urge be present" screen, still
  // reachable only when urgeText is actually non-blank (never a second,
  // competing gate from the selector alone: checking the box with no
  // text typed on "urge" above still correctly skips this, matching
  // "do not force completing all three" / "avoid redundant exercises").
  | "stop_and_accept_urge"
  // Requirement 6: captures ONLY currentThought now (interpretation
  // moved to its own dedicated "interpretation" step below, never
  // merged into this one any more) -- reachable only when the selector
  // checked "thought" (selectedCognitiveThought).
  | "thought"
  // Three-levels-of-acceptance task, section 2 / requirement 7 ("START
  // PRESENCE DURING COGNITIVE ACCEPTANCE"): the Thought-ONLY
  // acceptance flow (time orientation question, then the resolved,
  // orientation-adapted mantra, exactly as before) -- reachable only
  // when currentThought is actually non-blank. Interpretation's own
  // acceptance is now ALWAYS a separate, later step ("interpretation_
  // acceptance" below) rather than folded into this one (mode C no
  // longer exists here): "Urge -> Thought -> Interpretation" is a
  // genuine sequence of independent branches, never two cognitive
  // contents collapsed into one acceptance moment.
  | "reality_acceptance"
  // Requirement 6: captures ONLY interpretationText -- reachable only
  // when the selector checked "interpretation" (selectedCognitiveInterpretation).
  | "interpretation"
  // Requirement 7: the Interpretation's own dedicated acceptance
  // moment -- the exact, verbatim "אני מביט בנקודה ונותן מקום לפרשנות
  // שלי." mantra (unchanged text, now always its own sequential step
  // rather than reality_acceptance's old mode-A fallback) -- reachable
  // only when interpretationText is actually non-blank. Always comes
  // AFTER reality_acceptance (Thought's own acceptance) when both are
  // selected, matching the required order exactly.
  | "interpretation_acceptance"
  // Requirement 4 ("EMOTION IDENTIFICATION -- ALWAYS INCLUDED"): a
  // dedicated "איזה רגש אני מרגיש עכשיו?" step, now ALWAYS reachable
  // (Full, Shortened, AND Mini ARC alike -- never conditionally skipped
  // by invocation mode any more) and now capturing ONLY the emotion
  // itself (urgeText used to be captured here too; it now has its own
  // "urge" step above, asked and accepted earlier in the sequence, per
  // the required Urge -> Thought -> Interpretation -> Emotion order).
  // Zero cognitive-selector checkboxes -> the trainee lands here
  // directly, right after "cognitive_selector" -- "if none are
  // selected, the app proceeds directly to naming the emotion."
  | "emotion"
  // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task: one
  // shared screen, right after "emotion" (Full ARC) / "mini_awareness"
  // (Mini ARC) and before "natural_breathing" (Full ARC) /
  // "mini_presence" (Mini ARC) -- i.e. immediately after the
  // acceptance of interpretation/urge/thought, before the presence
  // stages, exactly as required. Asks two 0-10 ratings on the SAME
  // screen (confirmActionReadinessCheck in arc/newArcLiveSteps.ts) and
  // automatically routes to one of three continuations -- see
  // actionReadinessOutcome's own doc above for the exact rule. Never
  // reachable for "shortened" (added to SHORTENED_ARC_SKIPPED_STEPS in
  // arc/newArcLiveSteps.ts) -- "do not add it to the Shortened pathway
  // on its own."
  | "action_readiness_check"
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: "סבבה" (shortened) has no action_readiness_check at all, so
  // it asks the SAME free-time 0-10 rating on this standalone screen
  // instead, right after "free_breathing" -- reachable only while
  // timeAvailableRating is still null (never re-asked if a "פחות טוב"
  // session already answered it before transitioning into "shortened").
  | "time_available_check"
  // Shared by BOTH tracks' short depth -- one combined screen (point +
  // widening field of view + sounds + body cues, body visible/animated
  // in the circle) replacing the 4-5 separate full-depth Presence
  // pages. Reachable only when arcPracticeDepth === "short".
  | "quick_presence"
  // "פחות טוב" short depth only -- a single RED/BLUE body-marking
  // screen (contracted area red, supportive-but-closed/unstable area
  // blue -- no green) replacing the two separate full-depth
  // body_scan_contraction/body_scan_opening_region screens. "סבבה"
  // short depth reuses the EXISTING "supportive_area_select" screen
  // instead (no new step id needed there).
  | "short_body_marking"
  // Part F step 2: a dedicated "notice the air, let the breath stay
  // natural, open body posture" stage -- Full ARC only (Mini ARC's own
  // five steps, Part G, do not list this as a separate stage).
  | "natural_breathing"
  | "center_attention"
  | "focus_color"
  | "visual_field"
  | "sound_awareness"
  | "body_scan"
  // Body Scan Upgrade task: two new interactive multi-region screens
  // right after the existing (unchanged) passive body_scan step --
  // "where do you feel contraction/tension", then "where do you feel
  // heaviness/closedness", over the much finer arc/bodyScanRegions.ts
  // list. body_scan_opening_region follows: only reachable when at
  // least one region was marked heavy/closed, letting the trainee pick
  // ONE of THOSE regions as the session's own primary opening anchor;
  // when none was identified, this step is skipped entirely and the
  // existing supportive_area_select step (much later) still handles
  // anchor selection exactly as it always has -- see this task's own
  // "existing mechanism" fallback instruction.
  | "body_scan_contraction"
  | "body_scan_heaviness"
  // ARC Full Sequence Update task, Part 3: "Identify Heavy and Closed
  // Regions" via TWO CONSECUTIVE, SEPARATE questions -- this is the
  // second one ("באילו אזורים בגוף אתה מרגיש סגירות?"), reusing the
  // exact same bodyScanHeavinessRegions array as body_scan_heaviness
  // above (never a second, competing field), via its own independent
  // toggleBodyScanClosedness bit-flip. Never assumes marking a region
  // heavy also marks it closed, or vice versa.
  | "body_scan_closedness"
  | "body_scan_opening_region"
  // ARC Full Sequence Update task, Part 1: re-activated -- see this
  // array's own doc comment in arc/newArcLiveSteps.ts
  // (NEW_ARC_LIVE_STEP_ORDER) for why these three, alone among the five
  // steps the earlier "ARC LIVE Body Scan and Protocol Restructuring"
  // task once removed, are back in the active sequence.
  | "unpleasant_area_question"
  | "unpleasant_area_select"
  // ARC-system upgrade task, Part F step 4 ("שהייה"): a dedicated,
  // timed, SINGLE-attention stay in the unpleasant sensation alone --
  // before the supportive anchor even exists (it is selected only
  // afterward, by the three supportive_*_select steps below). Reachable
  // under the exact same condition as unpleasant_area_select itself
  // (there is nothing to dwell in otherwise). Dual attention (the
  // unpleasant sensation TOGETHER with the already-chosen supportive
  // anchor) stays exactly where it already was -- acceptance's own
  // first sub-step -- never duplicated here.
  | "dwelling"
  | "supportive_area_select"
  | "supportive_sensation_select"
  | "supportive_movement_select"
  | "acceptance"
  // ARCHI -- Full ARC Body Flow Redesign task, corrected by ARCHI --
  // Final Correction: One Acceptance Stage, Two Parts, Attention
  // Transfer During Regulation: Acceptance Part 2 -- ONE continuous
  // exercise, simultaneous attention to the contracted Red regions AND
  // the chosen Blue regions together, plus the Blue regions' own
  // initial opening/stabilization. It never instructs transferring
  // attention AWAY from the contraction -- that gradual transfer now
  // happens only during "regulation" below. Sits right after the
  // Blue-only "body_scan_opening_region" selection screen in the active
  // order (arc/newArcLiveSteps.ts's own NEW_ARC_LIVE_STEP_ORDER),
  // genuinely distinct from "acceptance" above (Part 1, which now comes
  // right after body_scan_contraction instead) only as an internal step
  // id -- user-facing, Acceptance stays ONE stage with two parts (both
  // "acceptance" and "acceptance_part_two" share the same "קבלה" title).
  | "acceptance_part_two"
  | "regulation"
  // ARCHI -- Unified Final Specification task: "Action Selection must
  // occur immediately AFTER Regulation and BEFORE Encoding" -- sits
  // between the two for every mode that reaches them (Full, Shortened,
  // the combined thought/urge pathway). Permanently unreachable while
  // isActiveTaskLiveOrigin (the active/paused task's own first action
  // auto-applies, "do not display an unnecessary Action Selection
  // screen") or arcGymSituationId (ARC GYM's own personalized
  // positive-action visualization is a separate, later experience --
  // never folded in here, same existing invariant resolveEncodingMantra
  // already documents). See arc/newArcLiveSteps.ts's own isStepReachable
  // and setSelectedAction.
  | "action_selection"
  | "encoding"
  | "transition"
  | "emotional_action"
  | "emotional_insight"
  // ARC-system upgrade task, Part G: the Mini ARC protocol's own five
  // steps -- genuinely combined/parallel screens, never a shortened
  // walk through the Full ARC steps above. Reachable only when
  // arcInvocationMode === "plannedMini" (arc/newArcLiveSteps.ts's
  // resolveStepOrder picks NEW_ARC_MINI_STEP_ORDER for that mode, which
  // never includes any of the Full-ARC-only step ids above). Shares
  // "goal_select" (choosing the track) and "emotional_action"/
  // "emotional_insight"/"complete" (the same post-action insight flow)
  // with the Full ARC sequence -- never duplicated.
  | "mini_awareness"
  // Urge-stop task, section 5: the SAME combined stop-and-accept screen
  // as "stop_and_accept_urge" above, just Mini ARC's own conditional
  // step id (never a shortened walk through the Full ARC one) --
  // reachable only when mini_awareness captured an urge. Sits right
  // after mini_awareness, before mini_presence, matching the task's own
  // "מודעות לדחף -> עצירת התנועה האוטומטית -> קבלת הדחף -> נוכחות קצרה" order.
  | "mini_stop_accept_urge"
  // Unified awareness/urge/thought/interpretation update, section 6:
  // Mini ARC's own combined thought+interpretation entry screen --
  // genuinely one screen, both fields optional, matching Full ARC's
  // own "thought" step's role but split out from "mini_awareness"
  // (which now only captures emotion/urge/desired-ending) so urge-stop
  // can sit between them, same ordering requirement as Full ARC.
  | "mini_thought"
  // Three-levels-of-acceptance task, section 6: Mini ARC's own short
  // conditional reality-acceptance screen -- a single combined
  // question+mantra (never two sub-screens, matching every other Mini
  // step's own "exactly one screen" brevity rule). Reachable only when
  // a thought OR an interpretation was identified (unified update,
  // section 6: interpretation-only shows a fixed short acceptance line
  // instead of the time question -- see getMiniRealityAcceptanceContent
  // in arc/newArcLiveCopy.ts). Sits right after mini_thought, before
  // mini_presence, same relative order as Full ARC's own.
  | "mini_reality_acceptance"
  | "mini_presence"
  | "mini_acceptance_transition"
  // ARCHI -- Unified Final Specification task: Mini ARC's own
  // equivalent insertion point -- "mini_acceptance_transition" is Mini
  // ARC's own regulation-equivalent moment (no separate "regulation"
  // step of its own), so this sits directly after it and before
  // "mini_encoding," gated by the SAME rule as "action_selection" above.
  | "mini_action_selection"
  | "mini_encoding"
  | "mini_action"
  | "complete";

export const EMOTIONAL_ACTION_PRESETS = ["מדיטציה", "טאי צ'י", "הרפיה", "תרגול נשימה"];

export interface NewArcLiveSessionState {
  taskId: string;
  taskTitle: string;
  firstAction: string;

  /** Part B.1: "יש להוסיף זיהוי ושמירה של הטריגר לתרגיל הספונטני" -- only ever asked/shown for a spontaneous session (captured inline on goal_select, never its own extra step); null for every planned session, which by definition has no new, unprompted trigger to record. */
  triggerText: string | null;

  /**
   * ARC session-resume conflict fix: the exact PlannedArc (arc/plannedArc.ts)
   * this session was started FROM, if any -- null for a spontaneous
   * session or an ad-hoc planned run (the existing "צריך ARC"/"Mini ARC"
   * buttons, which ask every field live rather than pre-filling from a
   * saved draft). Together with arcInvocationMode, this is the session's
   * own "type and configuration" identity -- see sessionMatchesRequest
   * below, the one place that decides whether a NEWLY requested ARC is
   * the SAME thing an already-persisted, unfinished session represents,
   * or a genuinely different one that must never be silently resumed OR
   * silently discarded in its place.
   */
  sourcePlannedArcId: string | null;

  /** Part H: defaults to "plannedFull" for every caller that existed before this field -- preserves the exact pre-existing in-task behavior unless a caller explicitly asks for "spontaneous". */
  arcInvocationMode: ArcInvocationMode;

  /**
   * ARCHI -- Universal ARC Routing, Emotion Identification & Android
   * Shortcuts task, requirement 9 ("ENCODING AND ACTION IMAGERY"): true
   * only when this session was created while the SAME task's own
   * TaskTimerRun was already actively running/paused (i.e. a genuine
   * Task-LIVE-triggered ARC, the trainee tapped "צריך ARC" while
   * mid-task) -- resolved ONCE, in live/NewArcLiveScreen.tsx's own
   * reload(), by checking data/storage.ts's loadTaskTimerRun() against
   * this exact taskId at session-creation time, never re-derived later
   * (the timer may finish/pause/resume while the ARC session is still
   * open; this flag intentionally freezes the ORIGIN, not the timer's
   * current live status). False for every other origin -- a next
   * scheduled task (no timer running yet), ARC GYM, a standalone
   * emotional ARC, or a planned/morning-flow session -- which is also
   * exactly the FALSE default for every session created before this
   * field existed. Also gates the new "action_selection"/
   * "mini_action_selection" step permanently unreachable when true
   * (ARCHI -- Unified Final Specification task, section 2: "reuse it
   * without asking again"), and is the top priority in
   * resolveActionText's own chain (arc/newArcLiveCopy.ts), which
   * resolveEncodingMantra reads to decide what action to name --
   * every origin now shares the SAME "מבצע את [הפעולה]" template, this
   * one included (no longer a separate "ממשיך את המשימה" phrase).
   */
  isActiveTaskLiveOrigin: boolean;

  /**
   * ARCHI -- Unified Final Specification task, section 1 (combined
   * "מחשבה / דחף" shortcut -- supersedes the earlier single-urge
   * shortcut of the same name/field, now RENAMED and widened rather
   * than duplicated): true only for a session started via that one
   * button -- "פחות טוב"/"סבבה"/every other Full ARC entry point leaves
   * this false. When true, isStepReachable (arc/newArcLiveSteps.ts)
   * makes ONLY "emotion" permanently unreachable for this one session
   * ("skip the emotion-selection screen entirely... do not invent an
   * unpleasant emotion or require emotion selection later") --
   * "cognitive_selector" itself (the existing "מה מופיע כרגע?"
   * multi-select of מחשבה/פרשנות/דחף, setCognitiveSelection in
   * arc/newArcLiveSteps.ts, completely unchanged) stays fully
   * reachable and interactive, letting the trainee check one, two, or
   * all three boxes -- never a forced/preselected choice, never a
   * second cognitive-selection mechanism. Every remaining Full ARC
   * step (Presence, body awareness, acceptance, regulation, action
   * selection, encoding) stays completely unaffected, reached exactly
   * as it always is -- this flag changes nothing about them, including
   * the null-safe "no emotion chosen" fallback they already use for a
   * "shortened" session (where "emotion" is skipped the same way).
   * False for every session created before this field existed, and for
   * every other entry point.
   */
  skipEmotionSelection: boolean;

  /**
   * ARCHI -- Unified Final Specification task, section 2 ("Action
   * Selection must occur immediately AFTER Regulation and BEFORE
   * Encoding"): which of the four sources the "action_selection"/
   * "mini_action_selection" step resolved, or null when that step was
   * never reached (isActiveTaskLiveOrigin/arcGymSituationId -- see
   * isStepReachable) or when the trainee reached it but entered a
   * brand-new action with no suitable scheduled task available (the
   * spec's own priority (5), which simply reuses the existing
   * `firstAction` field exactly as every pre-existing session already
   * does -- no new source value needed for it). "scheduledTask" covers
   * both an explicitly-selected future/early-start task AND an
   * explicitly-selected due task (the spec's own priorities (2) and
   * (4) -- both are "an existing scheduled task," resolved identically
   * by taskId); "temporaryAction" covers priority (3). Read by
   * resolveEncodingMantra (arc/newArcLiveCopy.ts, via its own
   * resolveActionText helper) and by returnToTask
   * (live/NewArcLiveScreen.tsx) for post-ARC routing. Set exactly once,
   * by setSelectedAction (arc/newArcLiveSteps.ts), never mutated again
   * afterward. False/null for every session created before this field
   * existed.
   */
  selectedActionSource: "scheduledTask" | "temporaryAction" | null;

  /**
   * The real task id of the explicitly-selected scheduled/due task,
   * only when selectedActionSource === "scheduledTask" -- null
   * otherwise. Used by returnToTask to navigate to that exact task's
   * own Task LIVE/Details screen (never auto-starting it -- the
   * trainee still taps Start themselves).
   */
  selectedActionTaskId: string | null;

  /**
   * The resolved display title for the selected action: the scheduled
   * task's own title when selectedActionSource === "scheduledTask", or
   * the trainee's own entered text when selectedActionSource ===
   * "temporaryAction" -- null when selectedActionSource is null.
   */
  selectedActionTitle: string | null;

  /**
   * The selected scheduled task's own saved first action (Task.firstAction),
   * only when selectedActionSource === "scheduledTask" and that task
   * actually has one set -- null otherwise (including for
   * "temporaryAction," which has no separate first-action field of its
   * own, only its title). resolveEncodingMantra prefers this over
   * selectedActionTitle when present, matching the existing priority
   * the active-task-origin path already gives `firstAction` over
   * `taskTitle`.
   */
  selectedActionFirstAction: string | null;

  /**
   * The clamped duration (minutes) chosen for a temporary action, only
   * when selectedActionSource === "temporaryAction" -- null otherwise.
   * Recalculated against the time remaining until the next scheduled
   * task at the moment the temporary task is actually created (just
   * before offering to start it), never capped at the original
   * Action-Selection-time estimate -- see returnToTask.
   */
  selectedActionDurationMinutes: number | null;

  /**
   * ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task: the
   * two 0-10 ratings captured together on the "action_readiness_check"
   * step (right after "emotion"/"mini_awareness", before
   * "natural_breathing"/"mini_presence") -- how strong the unpleasant
   * sensation still is, and how ready for action the trainee feels,
   * both answered on the SAME screen. Null until that step is actually
   * confirmed (including for every session created before this field
   * existed, and for any "shortened" session, which never reaches this
   * step at all -- see isStepReachable in arc/newArcLiveSteps.ts).
   */
  unpleasantIntensityRating: number | null;
  actionReadinessRating: number | null;

  /**
   * The routing decision computed once, by confirmActionReadinessCheck,
   * from the two ratings above: "direct_action" (unpleasant < 5 AND
   * readiness > 5 -- skip straight to the action, no further ARC
   * steps), "shortened" (unpleasant < 5 AND readiness <= 5 -- continue
   * in this SAME session under Shortened ARC's own existing steps,
   * never a new session), or "continue" (unpleasant >= 5, regardless
   * of readiness -- continue the practice exactly as this session
   * would have anyway: Full ARC's own remaining Presence/body/
   * Acceptance/Regulation/Encoding steps, or Mini ARC's own next
   * steps). Never recomputed/overwritten afterward -- a single routing
   * decision per session, matching "the transition must happen
   * automatically" and "prevent step duplication." Null until the
   * check is confirmed.
   */
  actionReadinessOutcome: "direct_action" | "shortened" | "continue" | null;

  /**
   * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
   * task: a third, orthogonal 0-10 rating -- "how much free time do you
   * have for practice right now?" -- captured either on the SAME
   * "action_readiness_check" screen as the two ratings above (for
   * "פחות טוב" -- spontaneous/plannedFull), or on its own standalone
   * "time_available_check" screen right after "free_breathing" (for
   * "סבבה" -- shortened, which never reaches action_readiness_check at
   * all). Whichever one answers it first is carried forward and never
   * re-asked -- see isStepReachable's own gate on "time_available_check"
   * in arc/newArcLiveSteps.ts, which checks this is still null before
   * ever showing that screen (so a rating entered on "פחות טוב" survives
   * a "shortened" outcome transition into the SAME session without
   * being asked a second time). Null until answered, and for every
   * session created before this field existed.
   */
  timeAvailableRating: number | null;

  /**
   * The depth decision computed once, purely from timeAvailableRating,
   * at the exact moment it's answered (confirmActionReadinessCheck or
   * confirmTimeAvailableRating): "full" when timeAvailableRating >= 6,
   * "short" when <= 5. This is an axis ORTHOGONAL to arcInvocationMode
   * (which still means "which of the two tracks, פחות טוב or סבבה" --
   * completely unchanged meaning) -- this field means "which depth
   * within that track." Null for actionReadinessOutcome ===
   * "direct_action" (time is irrelevant there -- no further ARC screens
   * of any kind are shown), and for every session created before this
   * field existed. "full"/null both mean "walk every existing step
   * exactly as today" -- every new short-depth skip rule in
   * isStepReachable is additionally gated on this being literally
   * "short", so the full-depth path for both tracks is byte-for-byte
   * unaffected by this task.
   */
  arcPracticeDepth: "full" | "short" | null;

  /**
   * ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
   * Background task: true once the trainee has reached the
   * "free_breathing" step and tapped either Continue or Skip (both
   * identical in effect) -- never reset back to false afterward, for
   * the lifetime of this one session. This is the ONE field
   * arc/freeBreathingIntro.ts's resolveArcBackgroundColor reads to
   * decide the persistent pale-blue background; it is never true for
   * a "shortened" session (that step is permanently unreachable for
   * that mode), and a session resumed mid-flight carries this exact
   * value forward, so the background is restored correctly with no
   * re-derivation and the intro is never replayed.
   */
  freeBreathingIntroShown: boolean;

  /**
   * "התבוננות וחיבור לעצמי" task: the trainee's own explicit choice on
   * the "self_observation_choice" branch screen -- "exercise" (chose to
   * do it) or "skip" (chose to continue) -- null only before that
   * screen has been answered. This is the real, persisted field
   * self_observation_exercise's own isStepReachable rule reads (never a
   * second, competing "did I skip this" flag); it is never reset, so
   * resuming mid-flight or going back to the choice screen and
   * re-answering simply overwrites it, same as every other choice field
   * in this session.
   */
  selfObservationChoice: "exercise" | "skip" | null;

  goalType: NewArcLiveGoalType | null;
  desiredEnding: string | null;

  /**
   * ARC Full Sequence Update task, Part 1 step 4 ("Choose the Desired
   * Feeling"): the trainee's own exact answer to "מה היית רוצה
   * להרגיש?" -- a preset chip (DESIRED_FEELING_OPTIONS) or free-typed
   * text. Deliberately a SEPARATE field from the pre-existing
   * desiredEnding above: desiredEnding keeps its own existing,
   * goalType-dependent role (the emotional ending OR the identity
   * action's own ending, asked later, right before
   * supportive_area_select, completely unchanged by this task) and is
   * never read by desired_feeling_locate/Acceptance/Regulation/Encoding's
   * new feeling-aware content below. Null means no feeling was chosen
   * (the step is skippable) -- never invented, and desired_feeling_locate
   * itself is then unreachable (isStepReachable in
   * arc/newArcLiveSteps.ts), since there is nothing to ask its own
   * personalized location question about.
   */
  desiredFeelingText: string | null;
  /**
   * Part 1 step 5 ("Locate the Desired Feeling in the Body"): the
   * trainee's own MULTI-select answer to "איפה בגוף אתה מרגיש כרגע את
   * תחושת ה-[desiredFeelingText]?" -- same toggle-then-confirm
   * multi-select convention as unpleasantBodyAreas/supportiveBodyAreas
   * above. Empty means either "not yet answered" or "explicitly not
   * present yet" (desiredFeelingNotYetPresent below distinguishes the
   * two for copy purposes only) -- Acceptance/Regulation/Encoding only
   * ever treat the feeling as ACTUALLY present in the body when this
   * array is non-empty, "never inventing a positive sensation the
   * trainee doesn't actually have."
   */
  desiredFeelingBodyAreas: BodyRegion[];
  /** Only meaningful when "other" is included in desiredFeelingBodyAreas above -- the trainee's own typed label for it, same convention as unpleasantBodyAreaCustomLabel/supportiveBodyAreaCustomLabel. */
  desiredFeelingBodyAreaCustomLabel: string | null;
  /**
   * The explicit "אני עדיין לא מרגיש את התחושה הזאת" choice on
   * desired_feeling_locate -- set true only by that exact button
   * (declineDesiredFeelingPresence in arc/newArcLiveSteps.ts), cleared
   * the moment any real region is actually toggled on
   * (toggleDesiredFeelingBodyArea). Purely informational for copy
   * wording (an explicit "still not there yet" vs. simply unanswered);
   * the one real safety guarantee -- never claiming the feeling is
   * present when it isn't -- is already fully carried by
   * desiredFeelingBodyAreas.length > 0 above, with or without this flag.
   */
  desiredFeelingNotYetPresent: boolean;

  selectedEmotion: EmotionSelection | null;
  customEmotionText: string | null;

  /**
   * ARCHI -- Combined Emotion & Supportive Feeling Selection task: the
   * trainee's own EXPLICIT override of the automatically-suggested
   * supportive feeling (arc/supportiveFeelingMapping.ts's own
   * resolveSupportiveFeeling, derived live from selectedEmotion above)
   * -- null means "no override, use the automatic suggestion (or the
   * safe fallback, if none applies)," never a claim that the trainee
   * actively rejected the suggestion. Set only by one-tap selecting a
   * listed alternative (never free-typed, so it is always a complete,
   * consistent {feeling, quality, mantra} triple, never just a bare
   * word with no mantra to fall back on). Cleared automatically
   * whenever selectedEmotion/customEmotionText actually changes to a
   * DIFFERENT value (setEmotionSelection, arc/newArcLiveSteps.ts) --
   * "update the automatic suggestion" for the new emotion -- but never
   * reset merely by a rerender or by navigating back to this step,
   * satisfying "do not reset a manually changed feeling." Encoding's
   * own resolveEncodingMantra reads this FIRST, before the automatic
   * mapping, so an explicit choice always wins.
   */
  selectedSupportiveFeeling: SupportiveFeelingMapping | null;

  /**
   * ARCHI -- Three UX Improvements task, Improvement 1 ("custom/free-text
   * supportive emotion"): the exact SAME "other" convention
   * selectedEmotion/customEmotionText already use for the main/unpleasant
   * emotion, mirrored here for the supportive side -- a free-typed
   * personal label, used instead of any listed supportiveFeelingMapping
   * alternative. null means no custom value is active. Whenever this is
   * set, selectedSupportiveFeeling above is ALSO set, to the triple
   * {feeling: text, quality: text, mantra: ""} (setCustomSupportiveFeelingOverride,
   * arc/newArcLiveSteps.ts) -- a falsy "" mantra, never a fabricated
   * sentence, so resolveDesiredFeelingPhrase's existing mantra-optional
   * handling already does the right thing with zero changes there. This
   * field exists purely so the UI can tell "the current
   * selectedSupportiveFeeling came from free text" apart from "it is one
   * of the listed alternatives," to correctly re-show the text input
   * (pre-filled) when resuming/navigating back, and is cleared back to
   * null the moment a LISTED alternative is picked instead
   * (setSupportiveFeelingOverride) or the underlying emotion changes
   * (setEmotionSelection) -- same clearing rules as selectedSupportiveFeeling
   * itself, since the two always move together.
   */
  customSupportiveFeelingText: string | null;

  /**
   * ARCHI -- Universal ARC Routing, Emotion Identification & Android
   * Shortcuts task, requirement 2: the trainee's own three INDEPENDENT
   * checkbox answers on "cognitive_selector" ("מה מופיע אצלי עכשיו?")
   * -- any combination, including none/all three. These gate whether
   * "urge"/"thought"/"interpretation" (the CAPTURE screens) are
   * reachable at all; they are deliberately SEPARATE from
   * urgeText/currentThought/interpretationText themselves (which stay
   * null until the trainee actually types something on the matching
   * capture screen) -- checking a box but leaving its capture screen
   * blank still correctly skips that branch's own acceptance step
   * (reality_acceptance/interpretation_acceptance/stop_and_accept_urge
   * all keep gating on the real text fields, never on these flags
   * alone), matching "do not force completing all three." Default
   * false for every session, including one resumed from before this
   * field existed (data/storage.ts's own backfill).
   */
  selectedCognitiveThought: boolean;
  selectedCognitiveInterpretation: boolean;
  selectedCognitiveUrge: boolean;

  /**
   * Urge-stop task, requirement 1: an OPTIONAL urge identified alongside
   * the emotion (never required, never a second, separate step to
   * fill it in) -- the trainee's own words (e.g. "דחף לפתוח את הטלפון").
   * Null means no urge was identified this time, which is also exactly
   * what gates "stop_and_accept_urge"/"mini_stop_accept_urge" out of the
   * sequence (requirement: "השלב יופעל רק אם המשתמש הזין דחף"). Captured
   * on its own dedicated "urge" step now (never the old combined
   * "emotion" screen) -- see selectedCognitiveUrge above for the
   * step's own reachability gate.
   */
  urgeText: string | null;

  currentThought: string | null;
  /**
   * Unified awareness/urge/thought/interpretation update, section 3:
   * a SEPARATE optional field from currentThought -- "מבחינה
   * פסיכולוגית גם פרשנות היא סוג של מחשבה, אבל באפליקציה אני רוצה
   * להבחין ביניהן לצורך התאמת התרגול." A conclusion/evaluation/meaning
   * the trainee gives to reality (e.g. "הוא לא אוהב אותי"), captured on
   * the SAME "thought" screen as currentThought but never merged into
   * it or auto-classified from it -- an old thought saved before this
   * field existed stays a thought, never silently reinterpreted as an
   * interpretation (section 7's own backward-compatibility requirement).
   * Null means none was written, which is also exactly what this
   * field's presence/absence gates: "reality_acceptance"/
   * "mini_reality_acceptance"'s own interpretation-only mode (A), and
   * the combined wording in "visual_field"/"mini_presence" when both
   * this and currentThought are present (mode C).
   */
  interpretationText: string | null;
  /**
   * Three-levels-of-acceptance task, section 2: which time the written
   * thought mainly concerns -- decides the reality-acceptance mantra
   * (resolveRealityAcceptanceMantra, arc/newArcLiveCopy.ts). Null means
   * "not yet answered" (reality_acceptance's own subIndex 0 is still
   * gating on it) or "no thought at all" (the step is unreachable
   * either way). Reused UNCHANGED from arc/types.ts's own
   * ThoughtTimeOrientation -- never a second, parallel classification
   * for the identical concept.
   */
  thoughtTimeOrientation: ThoughtTimeOrientation | null;

  selectedFocusObject: string | null;
  selectedFocusColor: string | null;

  presenceStepsCompleted: boolean;

  unpleasantBodyArea: BodyRegion | null;
  unpleasantSensationDescription: string | null;
  /**
   * Body region selection correction task: the trainee's own MULTI-
   * select unpleasant body areas ("אילו אזורים בגוף אתה מרגיש את
   * ה[רגש]?") -- additive alongside the pre-existing singular
   * unpleasantBodyArea above (never removed; the dwelling/
   * unpleasant_area_select reachability gate in arc/newArcLiveSteps.ts
   * keeps reading that singular field, completely unchanged by this
   * task). Every setter that touches this array keeps
   * unpleasantBodyArea in sync as its own FIRST entry (or null when
   * empty) -- the exact same convention supportiveBodyArea/
   * supportiveBodyAreas below already established, mirrored here.
   * Empty array is valid and expected: declining entirely, or
   * continuing from unpleasant_area_select with none chosen, both
   * leave it empty.
   */
  unpleasantBodyAreas: BodyRegion[];
  /** Only meaningful when "other" is included in unpleasantBodyAreas above -- the trainee's own typed label for it, same convention as supportiveBodyAreaCustomLabel below. */
  unpleasantBodyAreaCustomLabel: string | null;

  supportiveBodyArea: BodyRegion | null;
  supportiveSensation: string | null;
  positiveMovement: string | null;

  /**
   * Physical questionnaire placement task introduced this MULTI-select
   * array; the body region selection correction task reverted the
   * trainee-facing flow back to a SINGLE supportive region (chosen
   * directly into supportiveBodyArea above via setSupportiveArea, the
   * one true positive anchor for acceptance/regulation/encoding from
   * here on). This array field is kept, UNCHANGED and unremoved, only
   * so that a session saved while multi-select was active still
   * deserializes and remains loadable -- arc/newArcLiveCopy.ts's own
   * content resolution no longer reads it at all, reading only the
   * singular field (which every multi-select-era setter already kept
   * in sync as this array's own first entry, so old data's "primary"
   * region surfaces correctly with zero migration). Nothing in this
   * codebase still writes to this array going forward.
   */
  supportiveBodyAreas: BodyRegion[];
  /** Only meaningful when "other" is included in supportiveBodyAreas above -- the trainee's own typed label for it ("הזנת אזור גוף אחר"), same convention as customEmotionText for emotion's own "other". Kept unremoved for the same old-data-loadability reason as the array itself; no longer written by the current single-select UI. */
  supportiveBodyAreaCustomLabel: string | null;

  /**
   * Body Scan Upgrade task, critical requirement 1: every one of
   * arc/bodyScanRegions.ts's own 26 (region, side) slots starts at
   * "אין תחושה" simply by having NO entry in this array -- never a
   * pre-populated "none" record. An entry exists here only for a slot
   * the trainee actually marked "כיווץ / מתח". Independent of
   * bodyScanHeavinessRegions below: the SAME region may appear in
   * both, or in neither, or in only one.
   */
  bodyScanContractionRegions: BodyScanContractionSelection[];
  /**
   * Same convention as bodyScanContractionRegions above, for the
   * second screen's own "כבדות / סגירות / כבדות וסגירות" question --
   * a completely independent collection, over the exact same region
   * list, never cross-read or cross-cleared by the contraction screen.
   */
  bodyScanHeavinessRegions: BodyScanHeavinessSelection[];
  /**
   * Section 5's own "choosing the supportive region": the ONE region
   * (from bodyScanHeavinessRegions above) the trainee picked for
   * gradual opening -- null whenever no heavy/closed region was ever
   * identified, in which case the EXISTING supportive_area_select step
   * (much later in the sequence, over the separate, coarser
   * supportiveBodyArea) is what actually sets the session's anchor,
   * completely unchanged by this task. Acceptance/Regulation/Encoding
   * read this field FIRST and only fall back to the old
   * supportiveBodyArea-based resolution when it's null -- see
   * arc/newArcLiveCopy.ts's own resolvePrimaryOpeningLabel.
   */
  primaryOpeningBodyScanRegion: BodyScanRegion | null;
  /** The side of primaryOpeningBodyScanRegion above, if that region was marked for a specific side -- null for a midline region, or a paired region the trainee never differentiated. Meaningless while primaryOpeningBodyScanRegion itself is null. */
  primaryOpeningBodyScanSide: BodyScanSide;
  /**
   * Final ARC Flow & Body Animation task, "Select Opening Regions":
   * the trainee's own MULTI-select answer -- restricted (by the
   * screen itself, never by this field) to the regions already
   * identified as closed AND movement-eligible. Deliberately replaces
   * primaryOpeningBodyScanRegion/Side above as the ACTIVE flow's own
   * opening-anchor field ("support simultaneous movement of multiple
   * selected regions" -- a single region can no longer represent the
   * whole opening choice); those two singular fields are kept,
   * unremoved, only so a session saved before this task still
   * deserializes and so a session mid-flight on the now-reached-
   * differently "body_scan_opening_region" step from an OLDER build
   * keeps working. Empty is valid and expected ("if no eligible
   * closure regions are selected, provide a valid continuation
   * without fabricating selections").
   *
   * ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
   * task: each entry now also carries its own `role` ("opening" --
   * green, or "opening_and_supportive" -- blue) rather than being a
   * bare (region, side) pair -- see arc/bodyScanSelection.ts's own
   * BodyScanOpeningSelection doc for the full green/blue/none
   * semantics. Both roles still receive the exact same existing
   * gradual-opening movement/color treatment (section 5: "both GREEN
   * and BLUE areas must receive the existing opening behavior");
   * "blue" additionally counts as a supportive anchor wherever
   * arc/newArcLiveCopy.ts's resolveSupportiveOpeningLabel reads this
   * field. A session saved before this task existed had every entry
   * here implicitly treated as a single, undifferentiated role;
   * data/storage.ts's own backfill normalizes each old (region, side)-
   * only entry to role "opening" (green) -- the exact same visual/
   * movement treatment it already had, never upgraded to "blue"
   * retroactively (that would invent a supportive selection the
   * trainee never actually made).
   */
  openingBodyScanRegions: BodyScanOpeningSelection[];

  /** Part A: the emotional action actually performed -- only ever asked when goalType is "emotion_only" or "combined". A preset label (EMOTIONAL_ACTION_PRESETS) or a free-typed one -- never invented. */
  emotionalActionText: string | null;
  /** Part A/B.3: "מה התובנה שלמדת על עצמך מהפעולה?", captured right after the emotional action -- the trainee's own words, never generated. Persisted as an ArcInsight by the screen, not by this pure state. */
  emotionalInsightText: string | null;
  /** Part E: an OPTIONAL belief formulated from the insight above -- blank is valid and means "save the insight without a formulated belief" (spec: "לשמור תובנה ללא אמונה מנוסחת"), never forced. */
  emotionalBeliefText: string | null;

  /** Part G: Mini ARC's own combined-encoding step -- an optional personal mantra and an optional belief-to-practice, both folded into the ONE encoding screen (never a separate screen each, which would defeat Mini ARC's own brevity requirement). Both default to null (encoding without either is complete and valid). Full ARC's own encoding does not yet offer these -- see this module's own doc. */
  miniMantraText: string | null;
  miniBeliefText: string | null;

  /**
   * ARC GYM task: non-null only for a session started from ARC GYM's
   * own "Full ARC"/"Shortened ARC" check-in choice (arc/arcGym.ts's
   * ArcGymSituation.id) -- null for every ordinary session, including
   * a plain standalone emotional ARC. When set, Encoding's own final
   * action-visualization sub-step (arc/newArcLiveCopy.ts's
   * getEncodingContent) renders arcGymVisualizationText instead of the
   * generic desiredEnding/firstAction-based line, and completing the
   * session (live/NewArcLiveScreen.tsx) writes ARC GYM's own training
   * record/memory and returns to the situation's own screen instead of
   * a task.
   */
  arcGymSituationId: string | null;
  /**
   * The ALREADY-RESOLVED personalized action-visualization text for
   * arcGymSituationId above (arc/arcGym.ts's own
   * resolveArcGymActionVisualization, called ONCE by the IO layer --
   * live/NewArcLiveScreen.tsx's reload() -- at session-creation time,
   * since this pure module has no storage access of its own to look
   * the situation up by id). Null whenever arcGymSituationId is null.
   */
  arcGymVisualizationText: string | null;
  /**
   * ARC Focus task: references the planned arc/arcFocusSession.ts
   * ArcFocusSession this ARC run is the preliminary (mood check-in
   * 😟/🙂) step for -- null for every session that isn't an ARC Focus
   * preliminary. UNLIKE arcGymSituationId above, this never forces
   * taskId to the standalone sentinel: an ARC Focus session can be
   * linked to a real scheduled Task (taskId stays that real task) or
   * standalone (taskId is the sentinel, exactly like any other
   * standalone ARC). live/NewArcLiveScreen.tsx's own returnToTask()
   * checks this BEFORE any ordinary task-routing branch, so completing
   * this ARC always resumes the SAME planned Focus session -- no
   * re-pick, no duplicate session.
   */
  arcFocusPracticeId: string | null;
  /**
   * ARC Gym + ARC Goal Integration task: references the
   * arc/arcGym.ts ArcGymMemoryExercise this ARC run was launched from
   * -- ARC Memory's own new emotional check-in step (😟/🙂 only; 😄
   * never leaves the Memory screen, so it never sets this), inserted
   * between the trigger/noticing steps and the action step. Same
   * parallel-field convention as arcGymSituationId/arcFocusPracticeId
   * above -- deliberately its OWN field, never overloading
   * arcGymSituationId (whose own training-record/historical-memory
   * bookkeeping assumes a real ArcGymSituation.id). UNLIKE
   * arcGymSituationId, which always forces taskId to the standalone
   * sentinel, this one does too (ARC Memory has no "combined practice"
   * Task-linked case) -- null for every session not launched from
   * ARC Memory's check-in.
   */
  arcGymMemoryExerciseId: string | null;

  currentStep: NewArcLiveStepId;
  subIndex: number;
  currentStepEnteredAt: string;

  createdAt: string;
  completedAt: string | null;
}

export function createNewArcLiveSessionState(
  taskId: string,
  taskTitle: string,
  firstAction: string,
  now: string,
  arcInvocationMode: ArcInvocationMode = "plannedFull",
  sourcePlannedArcId: string | null = null,
  // ARCHI -- Unified Final Specification task: see skipEmotionSelection's
  // own doc on NewArcLiveSessionState above. Defaults to false, so every
  // pre-existing caller (which never passes this 7th argument at all) is
  // completely unaffected.
  skipEmotionSelection: boolean = false
): NewArcLiveSessionState {
  return {
    taskId,
    taskTitle,
    firstAction,
    triggerText: null,
    arcInvocationMode,
    sourcePlannedArcId,
    isActiveTaskLiveOrigin: false,
    skipEmotionSelection,
    selectedActionSource: null,
    selectedActionTaskId: null,
    selectedActionTitle: null,
    selectedActionFirstAction: null,
    selectedActionDurationMinutes: null,
    unpleasantIntensityRating: null,
    actionReadinessRating: null,
    actionReadinessOutcome: null,
    timeAvailableRating: null,
    arcPracticeDepth: null,
    freeBreathingIntroShown: false,
    selfObservationChoice: null,
    // Unified ARC & Productivity Update task, requirement 2 ("REMOVE
    // GOAL / TRIGGER SELECTION SCREENS... Automatically derive action
    // context"): goalType is no longer null, waiting on a dedicated
    // "goal_select" screen the trainee had to answer (that screen is
    // now permanently unreachable -- see isStepReachable in
    // arc/newArcLiveSteps.ts) -- it is derived directly from whether
    // this session is attached to a real task or is the standalone
    // sentinel. "combined" (never the old plain "action") because the
    // ARC's own emotional-regulation sequence (Presence through
    // Encoding) always runs regardless of whether a task is attached;
    // a real task/action simply ALSO gets its action folded into
    // Encoding (requirement 3), which "combined" alone governs
    // reachability for (see isStepReachable's own "emotional_action"/
    // "emotional_insight" check) -- the plain "action" goalType is kept
    // only for historical/legacy sessions, never assigned to a new one
    // again. ARC GYM sessions (taskId is the same STANDALONE sentinel,
    // but DO have a real practice action) are corrected to "combined"
    // by the one caller that knows about arcGymSituationId --
    // live/NewArcLiveScreen.tsx's own reload() -- immediately after
    // this call returns, never re-derived here (this function has no
    // ARC GYM awareness of its own).
    goalType: taskId === STANDALONE_ARC_TASK_ID ? "emotion_only" : "combined",
    desiredEnding: null,
    desiredFeelingText: null,
    desiredFeelingBodyAreas: [],
    desiredFeelingBodyAreaCustomLabel: null,
    desiredFeelingNotYetPresent: false,
    selectedEmotion: null,
    customEmotionText: null,
    selectedSupportiveFeeling: null,
    customSupportiveFeelingText: null,
    selectedCognitiveThought: false,
    selectedCognitiveInterpretation: false,
    selectedCognitiveUrge: false,
    urgeText: null,
    currentThought: null,
    interpretationText: null,
    thoughtTimeOrientation: null,
    selectedFocusObject: null,
    selectedFocusColor: null,
    presenceStepsCompleted: false,
    unpleasantBodyArea: null,
    unpleasantSensationDescription: null,
    unpleasantBodyAreas: [],
    unpleasantBodyAreaCustomLabel: null,
    supportiveBodyArea: null,
    supportiveSensation: null,
    positiveMovement: null,
    supportiveBodyAreas: [],
    supportiveBodyAreaCustomLabel: null,
    bodyScanContractionRegions: [],
    bodyScanHeavinessRegions: [],
    primaryOpeningBodyScanRegion: null,
    primaryOpeningBodyScanSide: null,
    openingBodyScanRegions: [],
    emotionalActionText: null,
    emotionalInsightText: null,
    emotionalBeliefText: null,
    miniMantraText: null,
    miniBeliefText: null,
    arcGymSituationId: null,
    arcGymVisualizationText: null,
    arcFocusPracticeId: null,
    arcGymMemoryExerciseId: null,
    currentStep: "goal_select",
    subIndex: 0,
    currentStepEnteredAt: now,
    createdAt: now,
    completedAt: null,
  };
}

/**
 * Critical-bug task ("Startup Popups Still Not Working After Modal
 * Fix"): the exact same "abandoned, not merely present" rule as
 * arc/taskTimer.ts's isTaskTimerRunStale, for this single-slot session
 * -- clearNewArcLiveSession is only ever called on genuine completion
 * (live/NewArcLiveScreen.tsx), never on backgrounding/force-stop/an OS
 * kill mid-session, so an abandoned session from an earlier day used to
 * sit in storage forever and permanently suppress
 * live/DailyStartupSequenceOverlay.tsx's startup sequence on every
 * later cold start. A session only counts as genuinely active when it
 * is not already completed AND was actually created TODAY.
 */
export function isNewArcLiveSessionStale(session: NewArcLiveSessionState, now: Date): boolean {
  if (session.completedAt !== null) return true;
  return todayLocalDateString(new Date(session.createdAt)) !== todayLocalDateString(now);
}

/** Resolves the one, consistently-used sensation label for display -- callers never interpolate `supportiveSensation` directly, always through this, so a future rename stays in one place. */
export function resolveSupportiveSensationLabel(state: NewArcLiveSessionState): string {
  return state.supportiveSensation ?? "";
}

/**
 * ARC session-resume conflict fix: what the trainee is asking to start
 * right now, resolved BEFORE deciding whether an already-persisted,
 * unfinished session may be resumed in its place. The two fields here
 * are exactly the ones that make a session's own "type and
 * configuration" -- see sessionMatchesRequest.
 */
export interface ArcSessionRequest {
  arcInvocationMode: ArcInvocationMode;
  sourcePlannedArcId: string | null;
  /**
   * ARC GYM task: without this, two DIFFERENT ARC GYM situations
   * requested one after another (both "spontaneous"/"shortened" mode,
   * both sourcePlannedArcId: null) would otherwise compare EQUAL to
   * each other below -- silently resuming situation A's unfinished
   * session under situation B's new request, a real correctness bug.
   * null for every non-ARC-GYM request, which is what makes an
   * ordinary standalone/task-linked request still compare equal to
   * another ordinary one exactly as before this field existed.
   */
  arcGymSituationId: string | null;
  /** Same rationale as arcGymSituationId above, applied to ARC Focus's own preliminary check-in ARC -- without this, two different ARC Focus practices requested one after another would otherwise compare equal and silently resume the wrong one. null for every non-ARC-Focus request. */
  arcFocusPracticeId: string | null;
  /** Same rationale as arcGymSituationId above, applied to ARC Memory's own new check-in flow -- without this, two different Memory exercises requested one after another would otherwise compare equal and silently resume the wrong one. null for every non-ARC-Memory request. */
  arcGymMemoryExerciseId: string | null;
}

/**
 * The one, single-sourced answer to "is this persisted, unfinished
 * session the SAME thing as what's being requested right now?" -- every
 * entry point (the ARC window, the mid-task "צריך ARC"/"Mini ARC"
 * buttons, the end-of-timer "start_arc" choice, and running a saved
 * PlannedArc) goes through this exact comparison, in
 * live/NewArcLiveScreen.tsx's own reload(), rather than each deciding
 * "resume vs. start fresh" on its own. Two "plannedFull"/"plannedMini"
 * sessions with no specific source draft (sourcePlannedArcId: null)
 * compare equal to each other -- an ad-hoc planned run is its own
 * single "type", distinct from any one specific saved draft.
 */
export function sessionMatchesRequest(session: NewArcLiveSessionState, request: ArcSessionRequest): boolean {
  return (
    session.arcInvocationMode === request.arcInvocationMode &&
    session.sourcePlannedArcId === request.sourcePlannedArcId &&
    session.arcGymSituationId === request.arcGymSituationId &&
    session.arcFocusPracticeId === request.arcFocusPracticeId &&
    session.arcGymMemoryExerciseId === request.arcGymMemoryExerciseId
  );
}

/** A short, human Hebrew label for one ARC "type and configuration" -- used only by the resume/start/cancel conflict prompt, never by the ordinary step content (arc/newArcLiveCopy.ts stays the only owner of in-session copy). */
export function describeArcSessionConfig(request: ArcSessionRequest, plannedArcName: string | null): string {
  if (request.arcFocusPracticeId) return request.arcInvocationMode === "shortened" ? "ARC מקוצר לפני ARC Focus" : "ARC מלא לפני ARC Focus";
  if (request.arcGymMemoryExerciseId) return request.arcInvocationMode === "shortened" ? "ARC מקוצר לפני תרגיל זיכרון" : "ARC מלא לפני תרגיל זיכרון";
  if (request.arcGymSituationId) return request.arcInvocationMode === "shortened" ? "אימון ARC GYM (ARC מקוצר)" : "אימון ARC GYM (ARC מלא)";
  if (plannedArcName) return request.arcInvocationMode === "plannedMini" ? `Mini ARC מתוכנן: ${plannedArcName}` : `ARC מלא מתוכנן: ${plannedArcName}`;
  if (request.arcInvocationMode === "spontaneous") return "ARC ספונטני";
  if (request.arcInvocationMode === "shortened") return "ARC מקוצר";
  return request.arcInvocationMode === "plannedMini" ? "Mini ARC" : "ARC מלא";
}
