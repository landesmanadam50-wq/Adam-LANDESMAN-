/**
 * data/storage.ts
 *
 * Thin AsyncStorage wrapper. There's no accounts/auth system yet, so
 * "per tester" persistence means per-device: each pilot tester runs
 * their own install and gets their own local profile + session log.
 *
 * Depends on the native AsyncStorage module, so unlike the rest of
 * data/ this isn't unit-tested with node --test — it's exercised for
 * real by actually running the app.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateArcBuildId } from "../arc/types.ts";
import type {
  ArcBuild,
  ArcBuildProfile,
  ArcGoal,
  ArcGoalTarget,
  ArcProgramProgress,
  BeliefArc,
  PersonalDevelopmentFourWeekProgram,
  PresenceArc,
  ThoughtArc,
  UrgeArc,
} from "../arc/types.ts";
import { migratePostTaskRewardsState } from "../arc/postTaskRewards.ts";
import type { PostTaskRewardsState } from "../arc/postTaskRewards.ts";
import { deletePersonalDevelopmentProgramFromList, normalizePersonalDevelopmentProgram, upsertPersonalDevelopmentProgramInList } from "../arc/personalDevelopmentProgram.ts";
import type { FrozenCombinedActionSnapshot } from "../arc/frozenCombinedActionRecovery.ts";
import { splitProfileIntoArcBuilds } from "../arc/arcEngine.ts";
import { deleteArcBuildFromList, upsertArcBuildInList } from "../arc/arcBuilds.ts";
import { deleteMiniArcFromList, upsertMiniArcInList } from "../arc/miniArc.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import { deleteArcGoalFromList, normalizeArcGoal, upsertArcGoalInList } from "../arc/arcGoals.ts";
import { deleteArcGoalTargetFromList, upsertArcGoalTargetInList } from "../arc/subGoalExecution.ts";
import type { ArcGoalTargetOccurrenceCompletion } from "../arc/subGoalExecution.ts";
import { deleteUrgeArcFromList, normalizeUrgeArc, upsertUrgeArcInList } from "../arc/urgeArcs.ts";
import { deleteThoughtArcFromList, normalizeThoughtArc, upsertThoughtArcInList } from "../arc/thoughtArcs.ts";
import { deleteBeliefArcFromList, normalizeBeliefArc, upsertBeliefArcInList } from "../arc/beliefArcs.ts";
import { deletePresenceArcFromList, normalizePresenceArc, upsertPresenceArcInList } from "../arc/presenceArcs.ts";
import {
  deleteLifeManifestFromList,
  deleteTargetFromList,
  normalizeLifeManifest,
  normalizeTarget,
  upsertLifeManifestInList,
  upsertTargetInList,
} from "../arc/lifeManifest.ts";
import type { LifeManifest, Target } from "../arc/lifeManifest.ts";
import {
  deleteArcLinkFromList,
  deleteRoutineTriggerFromList,
  deleteWeeklyActionFromList,
  upsertArcLinkInList,
  upsertRoutineTriggerInList,
  upsertWeeklyActionInList,
} from "../arc/routineLinks.ts";
import type { ArcLink, RoutineTrigger, WeeklyAction } from "../arc/routineLinks.ts";
import type { ArcProgramSelection } from "../program/programTypes.ts";
import { PROGRAM_DEFINITIONS } from "../program/config.ts";
import type { SessionLogEntry } from "./sessionLog.ts";
import type { LifeManifestJournalEntry } from "./lifeManifestJournal.ts";
import { normalizeStateProfile, upsertStateProfileInList } from "../arc/stateProfile.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import { normalizeIdentityProfile, upsertIdentityProfileInList } from "../arc/identityProfile.ts";
import type { IdentityProfile } from "../arc/identityProfile.ts";
import { normalizeInterferenceItem, upsertInterferenceItemInList } from "../arc/interferenceItem.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import { normalizeCombinedInterferenceSelection, upsertCombinedInterferenceSelectionInList } from "../arc/combinedInterferenceSelection.ts";
import type { CombinedInterferenceSelection } from "../arc/combinedInterferenceSelection.ts";
import { normalizePersonalDevelopmentRouteConfig, upsertPersonalDevelopmentRouteConfigInList } from "../arc/personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import {
  archiveLibraryItem,
  disableLibraryItem,
  restoreLibraryItem,
  resolveEnabledLibraryItemsForProgram,
} from "../arc/libraryItemStatus.ts";
import type { MappingProgressionStore } from "../arc/reactiveProactiveProgression.ts";
import type { PersonalDevelopmentRouteProgress } from "../arc/personalDevelopmentRouteProgress.ts";
import { normalizePersonalDevelopmentRouteProgress } from "../arc/personalDevelopmentRouteProgress.ts";
import type { ArcGoalSessionProgress } from "../arc/arcGoalSessionProgress.ts";
import { normalizeArcGoalSessionProgress } from "../arc/arcGoalSessionProgress.ts";
import type { PendingSharedActionExecution } from "../arc/pendingSharedActionExecution.ts";
import { deleteTaskFromList, normalizeTask, upsertTaskInList } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { normalizeTaskJournalEntry } from "./taskJournal.ts";
import type { TaskJournalEntry } from "./taskJournal.ts";
import { normalizeTaskReflection } from "../arc/taskReflection.ts";
import type { TaskReflection } from "../arc/taskReflection.ts";
import { normalizeTaskStageProgress } from "../arc/taskStageProgress.ts";
import type { TaskStageProgress } from "../arc/taskStageProgress.ts";
import { normalizeTodoSplitSession } from "../arc/todoSplitSession.ts";
import type { TodoSplitSession } from "../arc/todoSplitSession.ts";
import { normalizeTaskSplitProgress } from "../arc/taskSplitProgress.ts";
import type { TaskSplitProgress } from "../arc/taskSplitProgress.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import type { TaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
import type { TaskOccurrenceOverride } from "../arc/taskOccurrenceOverride.ts";
import { upsertTaskOccurrenceOverride } from "../arc/taskOccurrenceOverride.ts";
import type { DailyRoutineTemplate } from "../arc/dailyRoutine.ts";
import { normalizeDailyRoutineTemplate } from "../arc/dailyRoutine.ts";
import type { ContinuousRoutineGroup } from "../arc/continuousRoutineGroup.ts";
import type { PostponementObstacleOutcome } from "../arc/postponementObstacle.ts";
import { upsertPostponementObstacleOutcomeInList } from "../arc/postponementObstacle.ts";
import type { DailyManifestSelection, DailyStartupSequenceState, PurposeManifest, PurposeManifestRotationState } from "../arc/purposeManifest.ts";
import { emptyDailyStartupSequenceState, emptyPurposeManifestRotationState, normalizePurposeManifest, upsertPurposeManifestInList } from "../arc/purposeManifest.ts";
import type { ArcGymBehaviorObstacles, ArcGymMemory, ArcGymMemoryExercise, ArcGymReminder, ArcGymSituation, ArcGymTrainingRecord } from "../arc/arcGym.ts";
import {
  normalizeArcGymMemoryExercise,
  normalizeArcGymSituation,
  upsertArcGymBehaviorObstaclesInList,
  upsertArcGymMemoryExerciseInList,
  upsertArcGymMemoryInList,
  upsertArcGymReminderInList,
  upsertArcGymSituationInList,
  upsertArcGymTrainingRecordInList,
} from "../arc/arcGym.ts";
import type { ArcResultExercise } from "../arc/arcResult.ts";
import { normalizeArcResultExercise, upsertArcResultExerciseInList } from "../arc/arcResult.ts";
import type { ArcGymGoal, ArcGymGoalObjective } from "../arc/arcGymGoal.ts";
import { upsertArcGymGoalInList, upsertArcGymGoalObjectiveInList } from "../arc/arcGymGoal.ts";
import type { ArcMantraReminder, ArcRecallChatMessage, ArcRecallReminder, ArcTaskReminderSettings } from "../arc/arcReminders.ts";
import {
  createDefaultArcTaskReminderSettings,
  normalizeArcTaskReminderSettings,
  upsertArcMantraReminderInList,
  upsertArcRecallReminderInList,
} from "../arc/arcReminders.ts";
import type { ArcFocusExercise } from "../arc/arcFocusExercise.ts";
import { upsertArcFocusExerciseInList } from "../arc/arcFocusExercise.ts";
import type { FeelingActionLink, InternalAction, SupportiveFeeling, TaskFeelingLink } from "../arc/supportiveFeelings.ts";
import {
  addFeelingActionLink,
  addTaskFeelingLink,
  deleteFeelingActionLinksForAction,
  deleteInternalActionFromList,
  deleteSupportiveFeelingFromList,
  deleteTaskFeelingLinksForFeeling,
  removeFeelingActionLink,
  removeTaskFeelingLink,
  upsertInternalActionInList,
  upsertSupportiveFeelingInList,
} from "../arc/supportiveFeelings.ts";
import type { ArcTrackChosen, InternalActionUsage, InternalState } from "../arc/internalActionRating.ts";
import type { SupportiveBodySensationUsage } from "../arc/supportiveBodySensation.ts";
import type { TaskContinuationLoopState } from "../arc/taskContinuationLoop.ts";
import type { ArcGymMemoryCheckInProgress } from "../arc/arcGymMemoryCheckInProgress.ts";
import type { ArcDecisionSession } from "../arc/arcDecision.ts";
import type { ArcPerspectiveEvent, ArcPerspectiveSession } from "../arc/arcPerspective.ts";
import { upsertArcPerspectiveEventInList, upsertArcPerspectiveSessionInList } from "../arc/arcPerspective.ts";
import type { ArcSavedExercise, ArcSavedBodyOption, ArcTrigger, ArcSavingPendingReview } from "../arc/arcSaving.ts";
import { upsertArcSavedExerciseInList, upsertArcSavedBodyOptionInList, upsertArcTriggerInList } from "../arc/arcSaving.ts";
import type { ArcInsightRelationship, ArcWritingText, ArcBook, ArcBookChapter, ArcVideoRecording } from "../arc/arcWriting.ts";
import {
  upsertArcInsightRelationshipInList,
  upsertArcWritingTextInList,
  upsertArcBookInList,
  upsertArcBookChapterInList,
  upsertArcVideoRecordingInList,
  normalizeArcWritingText,
} from "../arc/arcWriting.ts";
import type { ArcQuestion } from "../arc/arcQuestions.ts";
import { normalizeArcQuestion, upsertArcQuestionInList } from "../arc/arcQuestions.ts";
import type { ArcDiaryEntry } from "../arc/arcDiary.ts";
import { upsertArcDiaryEntryInList } from "../arc/arcDiary.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { normalizeArcLearningTopic, upsertArcLearningTopicInList } from "../arc/arcLearningTopic.ts";
import type { ArcLearningInsight } from "../arc/arcLearningInsight.ts";
import { normalizeArcLearningInsight, upsertArcLearningInsightInList } from "../arc/arcLearningInsight.ts";
import type { ArcLearningRecallRecord, ArcLearningRecallSessionProgress, ArcLearningReviewSchedule } from "../arc/arcLearningReview.ts";
import { normalizeArcLearningReviewSchedule, recordArcLearningRecall, upsertArcLearningReviewScheduleInList } from "../arc/arcLearningReview.ts";
import type { ArcCreativityConnection } from "../arc/arcCreativityConnection.ts";
import { normalizeArcCreativityConnection, upsertArcCreativityConnectionInList } from "../arc/arcCreativityConnection.ts";
import type { ArcCreativityRecallRecord, ArcCreativityRecallSessionProgress, ArcCreativityReviewSchedule } from "../arc/arcCreativityReview.ts";
import { normalizeArcCreativityReviewSchedule, recordArcCreativityRecall, upsertArcCreativityReviewScheduleInList } from "../arc/arcCreativityReview.ts";
import type { ArcRecallRating } from "../arc/spacedRepetition.ts";
import type { ManifestGoal } from "../arc/manifestGoals.ts";
import { upsertManifestGoalInList } from "../arc/manifestGoals.ts";
import type { PositiveMemory } from "../arc/positiveMemory.ts";
import { normalizePositiveMemory, upsertPositiveMemoryInList } from "../arc/positiveMemory.ts";
import type { PositiveMemoryDraft } from "../arc/positiveMemoryDraft.ts";
import { finalizePositiveMemoryDraft, normalizePositiveMemoryDraft, upsertPositiveMemoryDraftInList } from "../arc/positiveMemoryDraft.ts";
import type { TodoBankItem } from "../arc/todoBank.ts";
import { normalizeTodoBankItem, upsertTodoBankItemInList } from "../arc/todoBank.ts";
import type { PositiveMemorySelectionHistoryEntry } from "../arc/positiveMemorySelectionHistory.ts";
import type { FreeTimeWindowDismissal } from "../arc/freeTimeWindowDismissal.ts";
import { upsertLastEncodingFeeling } from "../arc/lastEncodingFeeling.ts";
import type { LastEncodingFeelingRecord } from "../arc/lastEncodingFeeling.ts";
import type { DailyVisualizationDailyProgress, DailyVisualizationProfile } from "../arc/dailyVisualization.ts";
import { normalizeDailyVisualizationDailyProgress, normalizeDailyVisualizationProfile } from "../arc/dailyVisualization.ts";
import type { ArcFocusSettings } from "../arc/arcFocusSettings.ts";
import { createDefaultArcFocusSettings, normalizeArcFocusSettings } from "../arc/arcFocusSettings.ts";
import type { TeleprompterSettings } from "../arc/teleprompterSettings.ts";
import { createDefaultTeleprompterSettings, normalizeTeleprompterSettings } from "../arc/teleprompterSettings.ts";
import type { ArcFocusPracticeRecord, ArcFocusSession } from "../arc/arcFocusSession.ts";
import { migrateLegacyArcFocusSession } from "../arc/arcFocusSession.ts";
import type { ReviewLaterFactor } from "../arc/reviewLaterFactor.ts";
import type { NewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import { migrateLegacyNewArcLiveStep } from "../arc/newArcLiveSteps.ts";
import { DEFAULT_ARC_APPEARANCE_SETTINGS } from "../arc/arcAppearanceSettings.ts";
import type { ArcAppearanceSettings } from "../arc/arcAppearanceSettings.ts";
import { upsertDailyScheduleModeOverride } from "../arc/weeklyScheduleMode.ts";
import type { DailyScheduleModeOverride, WeeklyScheduleMode } from "../arc/weeklyScheduleMode.ts";
import type { ManifestRunState } from "../arc/manifestTaskSteps.ts";
import { upsertCoachingWorkspaceEntryInList } from "../arc/coachingWorkspace.ts";
import type { CoachingWorkspaceEntry } from "../arc/coachingWorkspace.ts";
import { upsertBeliefInList } from "../arc/arcInsightBelief.ts";
import type { ArcBelief, ArcInsight } from "../arc/arcInsightBelief.ts";
import { deletePlannedArcFromList, normalizePlannedArc, upsertPlannedArcInList } from "../arc/plannedArc.ts";
import type { PlannedArc } from "../arc/plannedArc.ts";

const PROFILE_KEY = "archi.buildProfile.v2";
const PROGRAM_SELECTION_KEY = "archi.programSelection.v1";
const PROGRAM_PROGRESS_KEY = "archi.programProgress.v2";
const SESSION_LOG_KEY = "archi.sessionLog.v1";
const PILOT_STARTED_AT_KEY = "archi.pilotStartedAt.v1";
const ARC_BUILDS_KEY = "archi.arcBuilds.v1";
/** Mini ARC task: a brand-new, independent collection -- never read/written by any full-ARC code path, never migrated from or into ARC_BUILDS_KEY/PROFILE_KEY. Deleting/editing/duplicating a Mini ARC can never affect a full ArcBuild, and vice versa. */
const MINI_ARC_BUILDS_KEY = "archi.miniArcBuilds.v1";
/** ARC Goal task: a brand-new, independent collection, storing only REFERENCES to existing ArcBuilds (never their content) -- see arc/types.ts's ArcGoal doc. No legacy migration: there is no prior data format for ARC Goal, so an absent key simply means "no ARC Goals yet". Deleting/editing an ArcGoal never touches ARC_BUILDS_KEY/PROFILE_KEY/MINI_ARC_BUILDS_KEY, and vice versa. */
const ARC_GOALS_KEY = "archi.arcGoals.v1";
/** Urge route task: a brand-new, independent collection storing full UrgeArc records -- never read/written by regular ARC, Mini ARC, or ARC Goal's own key. No legacy migration: there is no prior data format for UrgeArc, so an absent key simply means "no Urge ARCs yet". ArcGoal.urgeMappings only ever stores a UrgeArc's id, never its content -- deleting/editing a UrgeArc never touches ARC_GOALS_KEY, and vice versa. */
const ARC_URGE_ARCS_KEY = "archi.urgeArcs.v1";
/** Life Manifest task: a brand-new, independent top-level collection -- Major Goals and Sub-goals nest inside each LifeManifest record; Targets (below) are a separate flat store. Never read/written by ARC/ArcGoal/MiniArc/UrgeArc/ArcLink/routine code -- REFERENCES those by plain id only (see arc/lifeManifest.ts's own module doc). No legacy migration: there is no prior data format, so an absent key simply means "no Life Manifests yet". */
const LIFE_MANIFESTS_KEY = "archi.lifeManifests.v1";
/** Life Manifest task: a separate flat store for Targets (referenced by subGoalId, never nested inside LifeManifest) -- see arc/lifeManifest.ts's own module doc for why. Not yet created by any screen in this phase of the feature; wired now so its storage/id shape never needs a breaking change later. */
const LIFE_MANIFEST_TARGETS_KEY = "archi.lifeManifestTargets.v1";
/** Sub-goal↔ARC Goal connection task: the Life Manifest journal -- append-only, mirrors SESSION_LOG_KEY's own shape/guarantees exactly (see data/lifeManifestJournal.ts's module doc). Never read/written by any other Life Manifest key, ARC/ArcGoal/MiniArc/UrgeArc/ArcLink/routine code. */
const LIFE_MANIFEST_JOURNAL_KEY = "archi.lifeManifestJournal.v1";
/** Adaptive ARC architecture task, Phase 3 (data-layer foundations): a brand-new, independent collection of reusable StateProfile records (arc/stateProfile.ts) -- never read/written by any existing ARC/ArcGoal/MiniArc/UrgeArc/ThoughtArc/BeliefArc/PresenceArc key. No legacy migration: there is no prior data format for StateProfile, so an absent key simply means "no State Profiles yet". */
const STATE_PROFILES_KEY = "archi.stateProfiles.v1";
/** Adaptive ARC architecture task, Phase 3: a brand-new, independent collection of reusable IdentityProfile records (arc/identityProfile.ts) -- same non-migrated, non-conflicting key convention as STATE_PROFILES_KEY. */
const IDENTITY_PROFILES_KEY = "archi.identityProfiles.v1";
/** Adaptive ARC architecture task, Phase 3: a brand-new, independent collection of InterferenceItem records (arc/interferenceItem.ts) -- storing only REFERENCES to StateProfile/IdentityProfile (never their content), same "reference, never duplicate" convention as ARC_GOALS_KEY. Legacy UrgeArc/ThoughtArc/BeliefArc records are never migrated into this key -- they remain readable at their own existing keys and are only ever projected into this shape at read time (arc/legacyDerivativeAdapter.ts's adaptUrgeArcToInterferenceItem/adaptThoughtArcToInterferenceItem/adaptBeliefArcToInterferenceItem), never written back here. */
const INTERFERENCE_ITEMS_KEY = "archi.interferenceItems.v1";
/** Adaptive ARC architecture task, Phase 12: a brand-new, independent collection of CombinedInterferenceSelection records (arc/combinedInterferenceSelection.ts) -- storing only a REFERENCE to one StateProfile plus REFERENCES to InterferenceItem ids (never their content), same "reference, never duplicate" convention as INTERFERENCE_ITEMS_KEY. No legacy migration: there is no prior data format for this, so an absent key simply means "no combined selections configured yet". Never read/written by any other key above, including STATE_PROFILES_KEY/INTERFERENCE_ITEMS_KEY themselves (both stay completely untouched by this phase). */
const COMBINED_INTERFERENCE_SELECTIONS_KEY = "archi.combinedInterferenceSelections.v1";
/** Adaptive ARC architecture task, Phase 14B-2: a brand-new, independent collection of PersonalDevelopmentRouteConfig records (arc/personalDevelopmentRouteConfig.ts) -- never restructures or migrates COMBINED_INTERFERENCE_SELECTIONS_KEY, which stays completely untouched and remains valid, State-scoped BUILD-authoring data in its own right. No legacy migration: there is no prior data format for this record, so an absent key simply means "no Personal Development route configurations yet". */
const PERSONAL_DEVELOPMENT_ROUTE_CONFIGS_KEY = "archi.personalDevelopmentRouteConfigs.v1";
/** Adaptive ARC architecture task, Phase 8 (progression persistence): a brand-new key storing the whole MappingProgressionStore (arc/reactiveProactiveProgression.ts) as one plain JSON object map, keyed by the mapping-key strings arc/progressionSessionBridge.ts's own resolveProgressionMappingKey produces -- never a flat array like every other key above. No legacy migration: there is no prior data format for per-mapping progression, so an absent key simply means "no progression recorded yet". Never read/written by any other key above. */
const PROGRESSION_MAPPING_STORE_KEY = "archi.progressionMappingStore.v1";
/** Adaptive ARC architecture task, Phase 15: a brand-new key storing the whole PersonalDevelopmentRouteProgressStore (arc/personalDevelopmentRouteProgress.ts) as one plain JSON object map, keyed by PersonalDevelopmentRouteConfig.id -- deliberately separate from PROGRESSION_MAPPING_STORE_KEY (that store is keyed by a single-InterferenceItem/StateProfile mapping key and belongs to the unrelated Stage 1-4 legacy progression system; combined multi-factor sessions never write to it). No legacy migration: an absent key simply means "no combined-route sessions counted yet" -- every existing PersonalDevelopmentRouteConfig loads with zero progress. Never read/written by any other key above. */
const PERSONAL_DEVELOPMENT_ROUTE_PROGRESS_KEY = "archi.personalDevelopmentRouteProgress.v1";
const ARC_GOAL_SESSION_PROGRESS_KEY = "archi.arcGoalSessionProgress.v1";
const PENDING_SHARED_ACTION_EXECUTION_KEY = "archi.pendingSharedActionExecution.v1";
/** ARCHI productivity task, Stage 1 foundation: a brand-new, independent collection of Task records (arc/tasks.ts) -- a trainee's own to-do items, never read/written by any existing ARC/ArcGoal/MiniArc/UrgeArc/Life Manifest/routine key. References ArcGoal only by id (linkedArcGoalId), never duplicates its content, same "reference, never duplicate" convention as ARC_GOALS_KEY. No legacy migration: there is no prior data format for Task, so an absent key simply means "no tasks yet". */
const TASKS_KEY = "archi.tasks.v1";
/** ARCHI productivity task, Stage 1 foundation: the Task journal -- append-only, exact mirror of LIFE_MANIFEST_JOURNAL_KEY's own shape/guarantees (see data/taskJournal.ts's module doc). Never read/written by TASKS_KEY or any other key above. */
const TASK_JOURNAL_KEY = "archi.taskJournal.v1";
/** Hebrew BUILD/LIVE rework spec, page 4: a single-slot store for the ONE currently in-flight TaskTimerRun (arc/taskTimer.ts) -- a trainee works on one timed task at a time, same singleton-per-slot convention as TIMER_RUN_KEY's own ARC-internal timers, deliberately never merged with that key/type (see arc/taskTimer.ts's own module doc for why). */
const TASK_TIMER_RUN_KEY = "archi.taskTimerRun.v1";
/** Automatic Routine Builder: a single-slot store for the ONE recurring DailyRoutineTemplate (arc/dailyRoutine.ts) -- a trainee has exactly one daily routine template, same singleton convention as TASK_TIMER_RUN_KEY. Absent key means first-time setup hasn't run yet. Never read/written by TASKS_KEY -- the template's own task/break definitions are a separate, independent record from the real Task rows data/dailyRoutine.ts materializes from it. */
const DAILY_ROUTINE_TEMPLATE_KEY = "archi.dailyRoutineTemplate.v1";
const CONTINUOUS_ROUTINE_GROUPS_KEY = "archi.continuousRoutineGroups.v1";
const CONTINUOUS_ROUTINE_PENDING_SMILES_KEY = "archi.continuousRoutinePendingSmiles.v1";
/** Smart Postponement Flow: PostponementObstacleOutcome records (arc/postponementObstacle.ts) -- a trainee's own measurement data on which "what's stopping you" intervention they picked and whether it helped them start. Upsert-by-id (never strict append-only, see that module's own doc on why), independent of TASKS_KEY and TASK_JOURNAL_KEY. */
const POSTPONEMENT_OBSTACLE_OUTCOMES_KEY = "archi.postponementObstacleOutcomes.v1";
/** Productivity roadmap, Stage I: append-only per-occurrence completions for RECURRING tasks -- see arc/taskOccurrence.ts's own module doc for why this is a separate collection rather than a field on Task itself. */
const TASK_OCCURRENCE_COMPLETIONS_KEY = "archi.taskOccurrenceCompletions.v1";
const TASK_OCCURRENCE_OVERRIDES_KEY = "archi.taskOccurrenceOverrides.v1";
/** Weekly & Daily Routine Redesign task, section 4: the PERMANENT, per-weekday (0-6) continuous/spaced setting -- the template itself, never cleared by an ordinary weekly reset. See arc/weeklyScheduleMode.ts's own module doc. */
const WEEKLY_SCHEDULE_MODE_SETTINGS_KEY = "archi.weeklyScheduleModeSettings.v1";
/** Same task: OPTIONAL, per-date overrides of the above -- cleared by a weekly reset, exactly like TASK_OCCURRENCE_OVERRIDES_KEY's own time/duration fields. */
const DAILY_SCHEDULE_MODE_OVERRIDES_KEY = "archi.dailyScheduleModeOverrides.v1";
/** Productivity roadmap, Stages Q/R/S: append-only "review later" factors (a new, unmatched urge/thought/belief captured during a task) -- see arc/reviewLaterFactor.ts's own module doc. */
const REVIEW_LATER_FACTORS_KEY = "archi.reviewLaterFactors.v1";
/** ARC-system upgrade task, Part E: append-only history of every captured "מה התובנה שלמדת?" answer -- exact mirror of REVIEW_LATER_FACTORS_KEY's own shape/guarantees. Never read/written by any existing key above; see arc/arcInsightBelief.ts's own module doc. */
const ARC_INSIGHTS_KEY = "archi.arcInsights.v1";
/** ARC-system upgrade task, Part E: the trainee's own reusable belief library (learned/new/updated) -- upsert-by-id, never a destructive overwrite of a different id (arc/arcInsightBelief.ts's upsertBeliefInList). Which belief is "active" for a given planned ARC is a field on that planned ARC's own record, never stored here. */
const ARC_BELIEFS_KEY = "archi.arcBeliefs.v1";
/** ARC-system upgrade task, Parts C/D: the trainee's own named, editable library of planned Full/Mini ARCs -- upsert-by-id, see arc/plannedArc.ts's own module doc. Never read/written by any existing ARC_BUILDS_KEY/MINI_ARC_BUILDS_KEY collection (the legacy, BUILD-driven library) -- a completely separate, additive mechanism. */
const PLANNED_ARCS_KEY = "archi.plannedArcs.v1";
/** ARC-system upgrade task, Part I: a single-slot marker set by live/NewArcLiveScreen.tsx right before handing back to a Task/Combined-track task whose identity action is about to happen -- "אם ARC ספונטני מקושר למשימה שעדיין מתבצעת, שאלת אמונת הזהות תופיע רק לאחר שהמשימה הושלמה בפועל." live/ActiveTaskScreen.tsx's handleComplete checks this (matched by taskId) to decide whether to show the identity-insight prompt before advancing -- never shown for a task that never went through this ARC path. Plain string, not JSON -- there is nothing else to store. */
const PENDING_IDENTITY_INSIGHT_KEY = "archi.pendingIdentityInsightTaskId.v1";
/** Productivity roadmap, Stage Z: the local, trainee-owned coaching workspace -- see arc/coachingWorkspace.ts's own module doc. */
const COACHING_WORKSPACE_ENTRIES_KEY = "archi.coachingWorkspaceEntries.v1";
/** Simplified-architecture task, Phase 2: a single-slot store for the ONE in-progress new-ARC-LIVE session (arc/newArcLiveTypes.ts) -- same singleton-per-slot convention as TASK_TIMER_RUN_KEY (a trainee runs one ARC LIVE session at a time), deliberately its own key, never merged with any older ARC-internal session/state key. */
const NEW_ARC_LIVE_SESSION_KEY = "archi.newArcLiveSession.v1";
/** Productivity & Personal Development upgrade task, requirement 6: a single-slot store for the ONE in-progress Manifest-task run (arc/manifestTaskSteps.ts) -- same singleton-per-slot convention as NEW_ARC_LIVE_SESSION_KEY, its own key since a Manifest run and a new-ARC-LIVE session are never the same thing. */
const MANIFEST_RUN_STATE_KEY = "archi.manifestRunState.v1";
/** Productivity roadmap, Stage AB: a single persisted flag -- has the trainee already seen the in-app explanation of why ARCHI asks for notification permission? Shown once, on live/ActiveTaskScreen.tsx, BEFORE the first action that would trigger the real OS permission dialog. */
const NOTIFICATION_EXPLANATION_SEEN_KEY = "archi.notificationExplanationSeen.v1";

function isKnownProgramPath(programPath: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROGRAM_DEFINITIONS, programPath);
}

/**
 * Startup-safety fix: JSON.parse on stored data must never be allowed to
 * throw uncaught -- this is reachable from app/index.tsx's (Home's) very
 * first useFocusEffect on every cold start via loadArcBuilds' migration
 * path below, with no .catch() at any call site. An unguarded throw here
 * became an unhandled promise rejection on the very first screen the app
 * renders, which is exactly the class of very-early fatal failure Expo
 * Updates' rollback-to-previous-update safety net watches for. A
 * corrupted/unparseable PROFILE_KEY record is treated as "no legacy
 * profile" (never crashes, never invents data) -- the raw bytes are left
 * untouched in storage (never deleted/overwritten by this read), so nothing
 * about the trainee's actual data is destroyed, only this one read safely
 * degrades to null.
 */
export async function loadProfile(): Promise<ArcBuildProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArcBuildProfile;
  } catch (error) {
    console.warn("[storage] Stored profile is not valid JSON -- treating as no legacy profile.", error);
    return null;
  }
}

export async function saveProfile(profile: ArcBuildProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * ARC Builds task: the standalone collection BUILD and LIVE now operate
 * on, replacing the old single global profile (PROFILE_KEY, above) as
 * the user-facing source of truth. Stored as one plain array, the same
 * "keyed by its own stable id, read-modify-write the whole list" style
 * already used for ScheduledRoutine (loadScheduledRoutines/
 * saveScheduledRoutines, further down) -- appropriate for the same
 * reason: a trainee's own handful of ARC Builds, not an unbounded log.
 *
 * Migration (#10): the OLD BUILD-GOAL -> BUILD-ARC flow persisted
 * exactly one profile (PROFILE_KEY) that could bundle a state target
 * AND an identity target AND a habit target together -- never a list,
 * never one-target-per-build. The very first time this collection is
 * loaded and found empty, if that legacy profile exists, it is split
 * into one standalone ArcBuild PER target actually configured
 * (arc/arcEngine.ts's splitProfileIntoArcBuilds -- never one bundled
 * build covering several targets), each named from that target's own
 * Desired State/Identity/Habit text, and persisted into the new
 * collection -- so an existing trainee's already-configured ARC
 * protocol(s) are carried forward automatically rather than silently
 * discarded, exactly once (every subsequent load just returns the
 * persisted collection as-is, even if it's still empty because the
 * trainee deleted every migrated build or never had legacy data to
 * begin with -- saveArcBuilds always persists the array, even an empty
 * one, so `raw` is truthy on every later load and this branch is never
 * re-entered). The legacy PROFILE_KEY record itself is left
 * untouched/inert -- never deleted -- so program/'s week-based
 * progression and the Stats screen keep reading exactly what they
 * always did for any pre-existing data, unaffected by this migration.
 */
export async function loadArcBuilds(): Promise<ArcBuild[]> {
  const raw = await AsyncStorage.getItem(ARC_BUILDS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ArcBuild[];
      // Defensive: a stored value that parses but isn't actually an
      // array (e.g. corrupted into an object/null) must not reach
      // callers that immediately call .length/.find/.map on it.
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      // Startup-safety fix: this key already exists (raw is truthy), so
      // re-running migration below would risk creating duplicate builds
      // from the still-present legacy profile -- corruption here must
      // degrade to "no builds visible right now", never to "migrate
      // again". The raw bytes are left in storage untouched; nothing is
      // deleted or overwritten by this read.
      console.warn("[storage] Stored ARC Builds are not valid JSON -- returning an empty list rather than crashing or re-migrating.", error);
      return [];
    }
  }

  // No ARC_BUILDS_KEY at all yet -- migrate once from any legacy profile.
  // Wrapped defensively end to end: any unexpected failure here (a
  // corrupted legacy profile loadProfile() couldn't parse, or the split
  // itself throwing on a truly malformed record) must never crash
  // startup -- it simply resolves to "no builds yet", the same state a
  // trainee with no legacy data already sees, and never writes anything
  // to ARC_BUILDS_KEY, so the migration remains eligible to run again
  // correctly with better data if this call was a transient failure.
  try {
    const legacyProfile = await loadProfile();
    if (!legacyProfile) return [];

    const migrated = splitProfileIntoArcBuilds(legacyProfile, generateArcBuildId, new Date().toISOString());
    await saveArcBuilds(migrated);
    return migrated;
  } catch (error) {
    console.warn("[storage] Legacy-profile migration into ARC Builds failed -- returning an empty list rather than crashing startup.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching loadScheduledRoutines/saveScheduledRoutines' own style. */
export async function saveArcBuilds(builds: ArcBuild[]): Promise<void> {
  await AsyncStorage.setItem(ARC_BUILDS_KEY, JSON.stringify(builds));
}

export async function getArcBuild(id: string): Promise<ArcBuild | null> {
  const builds = await loadArcBuilds();
  return builds.find((build) => build.id === id) ?? null;
}

/** Upserts by id -- see arc/arcBuilds.ts's upsertArcBuildInList (the actual, unit-tested list logic) for the exact guarantee: updates the one matching build in place, never touching any other build's own fields, or appends it as a new build. Never matches by name/Desired State text, only by id -- two builds sharing the same Desired State never collide. */
export async function upsertArcBuild(build: ArcBuild): Promise<void> {
  const builds = await loadArcBuilds();
  await saveArcBuilds(upsertArcBuildInList(builds, build));
}

/** Removes exactly the one matching build (by id) -- see arc/arcBuilds.ts's deleteArcBuildFromList. Every other build is left completely untouched; a no-op if the id doesn't match any build. */
export async function deleteArcBuild(id: string): Promise<void> {
  const builds = await loadArcBuilds();
  await saveArcBuilds(deleteArcBuildFromList(builds, id));
}

/**
 * Mini ARC task: an independent collection, parallel to loadArcBuilds
 * above but with NO legacy migration step -- there is no prior data
 * format for Mini ARC, so an absent/empty key simply means "no Mini ARC
 * Builds yet". Same defensive parse (corrupt JSON, or JSON that parses
 * but isn't actually an array) as loadArcBuilds, for the same reason:
 * malformed data here must degrade to an empty list, never crash
 * startup or any Mini ARC screen.
 */
export async function loadMiniArcBuilds(): Promise<MiniArcBuild[]> {
  const raw = await AsyncStorage.getItem(MINI_ARC_BUILDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MiniArcBuild[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored Mini ARC Builds are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcBuilds' own style. */
export async function saveMiniArcBuilds(builds: MiniArcBuild[]): Promise<void> {
  await AsyncStorage.setItem(MINI_ARC_BUILDS_KEY, JSON.stringify(builds));
}

export async function getMiniArcBuild(id: string): Promise<MiniArcBuild | null> {
  const builds = await loadMiniArcBuilds();
  return builds.find((build) => build.id === id) ?? null;
}

/** Upserts by id -- see arc/miniArc.ts's upsertMiniArcInList. Updates the one matching Mini ARC in place, never touching any other Mini ARC's own fields, or appends it as new. Never touches ARC_BUILDS_KEY/PROFILE_KEY. */
export async function upsertMiniArcBuild(build: MiniArcBuild): Promise<void> {
  const builds = await loadMiniArcBuilds();
  await saveMiniArcBuilds(upsertMiniArcInList(builds, build));
}

/** Removes exactly the one matching Mini ARC (by id) -- see arc/miniArc.ts's deleteMiniArcFromList. Every other Mini ARC (and every full ArcBuild) is left completely untouched; a no-op if the id doesn't match any Mini ARC. */
export async function deleteMiniArcBuild(id: string): Promise<void> {
  const builds = await loadMiniArcBuilds();
  await saveMiniArcBuilds(deleteMiniArcFromList(builds, id));
}

/**
 * ARC Goal task: an independent collection, parallel to loadMiniArcBuilds
 * above -- same "no legacy migration, defensive parse degrades to an
 * empty list rather than crashing" shape.
 *
 * Urge route task: every parsed goal is run through normalizeArcGoal so
 * fields added after a goal was first saved (urgeMappings, and each
 * mapping's miniArcId/executionMode/identityProtocolId/goalAction) always
 * come back with their safe defaults -- callers never need to null-check
 * these themselves.
 */
export async function loadArcGoals(): Promise<ArcGoal[]> {
  const raw = await AsyncStorage.getItem(ARC_GOALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGoal[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcGoal) : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Goals are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcBuilds/saveMiniArcBuilds' own style. */
export async function saveArcGoals(goals: ArcGoal[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GOALS_KEY, JSON.stringify(goals));
}

export async function getArcGoal(id: string): Promise<ArcGoal | null> {
  const goals = await loadArcGoals();
  return goals.find((goal) => goal.id === id) ?? null;
}

/** Upserts by id -- see arc/arcGoals.ts's upsertArcGoalInList. Updates the one matching goal in place, never touching any other goal's own fields, or appends it as new. */
export async function upsertArcGoal(goal: ArcGoal): Promise<void> {
  const goals = await loadArcGoals();
  await saveArcGoals(upsertArcGoalInList(goals, goal));
}

/** Removes exactly the one matching ArcGoal (by id) -- see arc/arcGoals.ts's deleteArcGoalFromList. Every other ArcGoal (and every referenced ArcBuild, which this never touches) is left completely untouched; a no-op if the id doesn't match any goal. */
export async function deleteArcGoal(id: string): Promise<void> {
  const goals = await loadArcGoals();
  await saveArcGoals(deleteArcGoalFromList(goals, id));
}

/**
 * Sub-goal execution task: a separate flat store for ArcGoalTarget
 * (referenced by arcGoalId/subGoalId, never nested inside ArcGoal) --
 * same "flat list + foreign key" convention as LIFE_MANIFEST_TARGETS_KEY
 * above, and a completely independent collection from it (a Life
 * Manifest Target and an ArcGoal execution Target are different entities
 * that happen to share a similar shape). A missing/corrupt key always
 * loads as an empty list, never a crash and never invented data.
 */
const ARC_GOAL_TARGETS_KEY = "archi.arcGoalTargets.v1";
/** Sub-goal execution task: append-only, per-occurrence completion record for a RECURRING ArcGoalTarget -- exact mirror of RoutineOccurrenceCompletion's own shape/guarantees (see that interface's own doc): completing today's occurrence of target A never marks yesterday's, tomorrow's, or any other target's occurrence complete. */
const ARC_GOAL_TARGET_OCCURRENCE_COMPLETIONS_KEY = "archi.arcGoalTargetOccurrenceCompletions.v1";
/** Phase 9: Personal Development's own four-week programs -- see arc/personalDevelopmentProgram.ts's own module doc. */
const PERSONAL_DEVELOPMENT_PROGRAMS_KEY = "archi.personalDevelopmentPrograms.v1";

export async function loadArcGoalTargets(): Promise<ArcGoalTarget[]> {
  const raw = await AsyncStorage.getItem(ARC_GOAL_TARGETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGoalTarget[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcGoal Targets are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveLifeManifestTargets/saveArcGoals' own style. */
export async function saveArcGoalTargets(targets: ArcGoalTarget[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GOAL_TARGETS_KEY, JSON.stringify(targets));
}

export async function getArcGoalTarget(id: string): Promise<ArcGoalTarget | null> {
  const targets = await loadArcGoalTargets();
  return targets.find((target) => target.id === id) ?? null;
}

/** Upserts by id -- see arc/subGoalExecution.ts's upsertArcGoalTargetInList. */
export async function upsertArcGoalTarget(target: ArcGoalTarget): Promise<void> {
  const targets = await loadArcGoalTargets();
  await saveArcGoalTargets(upsertArcGoalTargetInList(targets, target));
}

/** Removes exactly the one matching ArcGoalTarget (by id) -- see arc/subGoalExecution.ts's deleteArcGoalTargetFromList. A no-op if the id doesn't match any target. Callers are responsible for also cancelling its scheduled notification first (data/arcGoalTargetReminders.ts's cancelArcGoalTargetNotification) -- this function never does I/O beyond AsyncStorage itself. */
export async function deleteArcGoalTarget(id: string): Promise<void> {
  const targets = await loadArcGoalTargets();
  await saveArcGoalTargets(deleteArcGoalTargetFromList(targets, id));
}

export async function loadArcGoalTargetOccurrenceCompletions(): Promise<ArcGoalTargetOccurrenceCompletion[]> {
  const raw = await AsyncStorage.getItem(ARC_GOAL_TARGET_OCCURRENCE_COMPLETIONS_KEY);
  return raw ? (JSON.parse(raw) as ArcGoalTargetOccurrenceCompletion[]) : [];
}

/** Records one occurrence as done -- never removes or rewrites any earlier entry, so completion history survives app restarts and one target's completion can never affect another's. */
export async function appendArcGoalTargetOccurrenceCompletion(entry: ArcGoalTargetOccurrenceCompletion): Promise<void> {
  const existing = await loadArcGoalTargetOccurrenceCompletions();
  existing.push(entry);
  await AsyncStorage.setItem(ARC_GOAL_TARGET_OCCURRENCE_COMPLETIONS_KEY, JSON.stringify(existing));
}

/**
 * Phase 9: Personal Development's own four-week programs -- a brand-new,
 * independent collection, entirely separate from ARC_GOALS_KEY (never
 * read/written by it, and vice versa -- see
 * arc/personalDevelopmentProgram.ts's own module doc on why this is a
 * new top-level entity rather than nested onto ArcGoal or any of the
 * five protocol record types). No legacy migration: there is no prior
 * data format for this, so an absent key simply means "no Personal
 * Development programs yet".
 */
export async function loadPersonalDevelopmentPrograms(): Promise<PersonalDevelopmentFourWeekProgram[]> {
  const raw = await AsyncStorage.getItem(PERSONAL_DEVELOPMENT_PROGRAMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PersonalDevelopmentFourWeekProgram[];
    return Array.isArray(parsed) ? parsed.map(normalizePersonalDevelopmentProgram) : [];
  } catch (error) {
    console.warn("[storage] Stored Personal Development programs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcGoals' own style. */
export async function savePersonalDevelopmentPrograms(programs: PersonalDevelopmentFourWeekProgram[]): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_DEVELOPMENT_PROGRAMS_KEY, JSON.stringify(programs));
}

export async function getPersonalDevelopmentProgram(id: string): Promise<PersonalDevelopmentFourWeekProgram | null> {
  const programs = await loadPersonalDevelopmentPrograms();
  return programs.find((program) => program.id === id) ?? null;
}

/** Upserts by id -- see arc/personalDevelopmentProgram.ts's upsertPersonalDevelopmentProgramInList. Updates the one matching program in place, never touching any other program's own fields, or appends it as new. */
export async function upsertPersonalDevelopmentProgram(program: PersonalDevelopmentFourWeekProgram): Promise<void> {
  const programs = await loadPersonalDevelopmentPrograms();
  await savePersonalDevelopmentPrograms(upsertPersonalDevelopmentProgramInList(programs, program));
}

/** Removes exactly the one matching program (by id) -- a no-op if the id doesn't match any program. Never touches the underlying protocol record this program merely referenced. */
export async function deletePersonalDevelopmentProgram(id: string): Promise<void> {
  const programs = await loadPersonalDevelopmentPrograms();
  await savePersonalDevelopmentPrograms(deletePersonalDevelopmentProgramFromList(programs, id));
}

/**
 * Urge route task: a brand-new, independent collection, storing full
 * UrgeArc records (mirrors ARC_BUILDS_KEY, not MINI_ARC_BUILDS_KEY's
 * reference-only ArcGoal collection -- a UrgeArc IS the protocol, not a
 * reference to one). No legacy migration: there is no prior data format
 * for UrgeArc, so an absent key simply means "no Urge ARCs yet". Same
 * defensive parse as loadMiniArcBuilds/loadArcGoals.
 */
export async function loadUrgeArcs(): Promise<UrgeArc[]> {
  const raw = await AsyncStorage.getItem(ARC_URGE_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UrgeArc[];
    return Array.isArray(parsed) ? parsed.map(normalizeUrgeArc) : [];
  } catch (error) {
    console.warn("[storage] Stored Urge ARCs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcGoals/saveMiniArcBuilds' own style. */
export async function saveUrgeArcs(urgeArcs: UrgeArc[]): Promise<void> {
  await AsyncStorage.setItem(ARC_URGE_ARCS_KEY, JSON.stringify(urgeArcs));
}

export async function getUrgeArc(id: string): Promise<UrgeArc | null> {
  const urgeArcs = await loadUrgeArcs();
  return urgeArcs.find((urgeArc) => urgeArc.id === id) ?? null;
}

/** Upserts by id -- see arc/urgeArcs.ts's upsertUrgeArcInList. Updates the one matching Urge ARC in place, never touching any other Urge ARC's own fields, or appends it as new. */
export async function upsertUrgeArc(urgeArc: UrgeArc): Promise<void> {
  const urgeArcs = await loadUrgeArcs();
  await saveUrgeArcs(upsertUrgeArcInList(urgeArcs, urgeArc));
}

/** Removes exactly the one matching Urge ARC (by id) -- see arc/urgeArcs.ts's deleteUrgeArcFromList. Every other Urge ARC is left completely untouched; a no-op if the id doesn't match any row. Mappings referencing a deleted UrgeArc are handled safely at read time by the live engine, not here -- this never cascades into ArcGoal.urgeMappings. */
export async function deleteUrgeArc(id: string): Promise<void> {
  const urgeArcs = await loadUrgeArcs();
  await saveUrgeArcs(deleteUrgeArcFromList(urgeArcs, id));
}

/**
 * Phase 4 (ARC Thought and ARC Mini Thought): a brand-new, independent
 * collection storing full ThoughtArc records -- mirrors
 * ARC_URGE_ARCS_KEY exactly (a ThoughtArc IS the protocol, never a
 * reference to one). No legacy migration: there is no prior data
 * format, so an absent key simply means "no ARC Thoughts yet".
 */
const ARC_THOUGHT_ARCS_KEY = "archi.thoughtArcs.v1";

export async function loadThoughtArcs(): Promise<ThoughtArc[]> {
  const raw = await AsyncStorage.getItem(ARC_THOUGHT_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ThoughtArc[];
    return Array.isArray(parsed) ? parsed.map(normalizeThoughtArc) : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Thoughts are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveUrgeArcs' own style. */
export async function saveThoughtArcs(thoughtArcs: ThoughtArc[]): Promise<void> {
  await AsyncStorage.setItem(ARC_THOUGHT_ARCS_KEY, JSON.stringify(thoughtArcs));
}

export async function getThoughtArc(id: string): Promise<ThoughtArc | null> {
  const thoughtArcs = await loadThoughtArcs();
  return thoughtArcs.find((thoughtArc) => thoughtArc.id === id) ?? null;
}

/** Upserts by id -- see arc/thoughtArcs.ts's upsertThoughtArcInList. Updates the one matching ARC Thought in place, never touching any other's own fields, or appends it as new. */
export async function upsertThoughtArc(thoughtArc: ThoughtArc): Promise<void> {
  const thoughtArcs = await loadThoughtArcs();
  await saveThoughtArcs(upsertThoughtArcInList(thoughtArcs, thoughtArc));
}

/** Removes exactly the one matching ARC Thought (by id) -- see arc/thoughtArcs.ts's deleteThoughtArcFromList. Every other ARC Thought is left completely untouched; a no-op if the id doesn't match any row. */
export async function deleteThoughtArc(id: string): Promise<void> {
  const thoughtArcs = await loadThoughtArcs();
  await saveThoughtArcs(deleteThoughtArcFromList(thoughtArcs, id));
}

/**
 * Phase 6 (ARC Belief and ARC Mini Belief): a brand-new, independent
 * collection storing full BeliefArc records -- mirrors
 * ARC_THOUGHT_ARCS_KEY exactly. No legacy migration: there is no prior
 * data format, so an absent key simply means "no ARC Beliefs yet".
 */
const ARC_BELIEF_ARCS_KEY = "archi.beliefArcs.v1";

export async function loadBeliefArcs(): Promise<BeliefArc[]> {
  const raw = await AsyncStorage.getItem(ARC_BELIEF_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BeliefArc[];
    return Array.isArray(parsed) ? parsed.map(normalizeBeliefArc) : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Beliefs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveThoughtArcs' own style. */
export async function saveBeliefArcs(beliefArcs: BeliefArc[]): Promise<void> {
  await AsyncStorage.setItem(ARC_BELIEF_ARCS_KEY, JSON.stringify(beliefArcs));
}

export async function getBeliefArc(id: string): Promise<BeliefArc | null> {
  const beliefArcs = await loadBeliefArcs();
  return beliefArcs.find((beliefArc) => beliefArc.id === id) ?? null;
}

/** Upserts by id -- see arc/beliefArcs.ts's upsertBeliefArcInList. */
export async function upsertBeliefArc(beliefArc: BeliefArc): Promise<void> {
  const beliefArcs = await loadBeliefArcs();
  await saveBeliefArcs(upsertBeliefArcInList(beliefArcs, beliefArc));
}

/** Removes exactly the one matching ARC Belief (by id) -- see arc/beliefArcs.ts's deleteBeliefArcFromList. */
export async function deleteBeliefArc(id: string): Promise<void> {
  const beliefArcs = await loadBeliefArcs();
  await saveBeliefArcs(deleteBeliefArcFromList(beliefArcs, id));
}

/**
 * Phase 5 (ARC Presence and ARC Mini Presence): a brand-new, independent
 * collection storing full PresenceArc records -- mirrors
 * ARC_THOUGHT_ARCS_KEY/ARC_URGE_ARCS_KEY exactly. No legacy migration:
 * there is no prior data format, so an absent key simply means "no ARC
 * Presences yet".
 */
const ARC_PRESENCE_ARCS_KEY = "archi.presenceArcs.v1";

export async function loadPresenceArcs(): Promise<PresenceArc[]> {
  const raw = await AsyncStorage.getItem(ARC_PRESENCE_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PresenceArc[];
    return Array.isArray(parsed) ? parsed.map(normalizePresenceArc) : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Presences are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveThoughtArcs' own style. */
export async function savePresenceArcs(presenceArcs: PresenceArc[]): Promise<void> {
  await AsyncStorage.setItem(ARC_PRESENCE_ARCS_KEY, JSON.stringify(presenceArcs));
}

export async function getPresenceArc(id: string): Promise<PresenceArc | null> {
  const presenceArcs = await loadPresenceArcs();
  return presenceArcs.find((presenceArc) => presenceArc.id === id) ?? null;
}

/** Upserts by id -- see arc/presenceArcs.ts's upsertPresenceArcInList. */
export async function upsertPresenceArc(presenceArc: PresenceArc): Promise<void> {
  const presenceArcs = await loadPresenceArcs();
  await savePresenceArcs(upsertPresenceArcInList(presenceArcs, presenceArc));
}

/** Removes exactly the one matching ARC Presence (by id) -- see arc/presenceArcs.ts's deletePresenceArcFromList. */
export async function deletePresenceArc(id: string): Promise<void> {
  const presenceArcs = await loadPresenceArcs();
  await savePresenceArcs(deletePresenceArcFromList(presenceArcs, id));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 3 (data-layer foundations): CRUD
// for the three new library collections (StateProfile/IdentityProfile/
// InterferenceItem) -- mirrors loadUrgeArcs/loadThoughtArcs/
// loadBeliefArcs' own defensive-parse + normalize pattern exactly.
// "Avoid destructive deletion APIs" (spec section 7): unlike UrgeArc/
// ThoughtArc/etc. above, none of these three get a delete* function --
// only archive (non-destructive) and restore, per spec section 7's own
// explicit instruction.
// ---------------------------------------------------------------------------

export async function loadStateProfiles(): Promise<StateProfile[]> {
  const raw = await AsyncStorage.getItem(STATE_PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StateProfile[];
    return Array.isArray(parsed) ? parsed.map(normalizeStateProfile) : [];
  } catch (error) {
    console.warn("[storage] Stored State Profiles are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveUrgeArcs/saveThoughtArcs' own style. */
export async function saveStateProfiles(profiles: StateProfile[]): Promise<void> {
  await AsyncStorage.setItem(STATE_PROFILES_KEY, JSON.stringify(profiles));
}

export async function getStateProfile(id: string): Promise<StateProfile | null> {
  const profiles = await loadStateProfiles();
  return profiles.find((profile) => profile.id === id) ?? null;
}

/** Create or update -- upserts by id, see arc/stateProfile.ts's upsertStateProfileInList. */
export async function upsertStateProfile(profile: StateProfile): Promise<void> {
  const profiles = await loadStateProfiles();
  await saveStateProfiles(upsertStateProfileInList(profiles, profile));
}

/** "Archive/disable without deletion" -- marks the one matching StateProfile disabled (never removes it). A no-op if the id doesn't match any row. */
export async function disableStateProfile(id: string, now: string): Promise<void> {
  const profiles = await loadStateProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveStateProfiles(upsertStateProfileInList(profiles, disableLibraryItem(target, now)));
}

/** Retires the one matching StateProfile (kept for history, never offered live) -- never deletes it. A no-op if the id doesn't match any row. */
export async function archiveStateProfile(id: string, now: string): Promise<void> {
  const profiles = await loadStateProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveStateProfiles(upsertStateProfileInList(profiles, archiveLibraryItem(target, now)));
}

/** "Restore/enable" -- returns the one matching StateProfile to "enabled" regardless of whether it was disabled or archived. A no-op if the id doesn't match any row. */
export async function restoreStateProfile(id: string, now: string): Promise<void> {
  const profiles = await loadStateProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveStateProfiles(upsertStateProfileInList(profiles, restoreLibraryItem(target, now)));
}

/** "Resolve enabled items for a program" -- only the ENABLED StateProfiles owned by `programId`. */
export async function resolveEnabledStateProfilesForProgram(programId: string): Promise<StateProfile[]> {
  const profiles = await loadStateProfiles();
  return resolveEnabledLibraryItemsForProgram(profiles, programId);
}

export async function loadIdentityProfiles(): Promise<IdentityProfile[]> {
  const raw = await AsyncStorage.getItem(IDENTITY_PROFILES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as IdentityProfile[];
    return Array.isArray(parsed) ? parsed.map(normalizeIdentityProfile) : [];
  } catch (error) {
    console.warn("[storage] Stored Identity Profiles are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveIdentityProfiles(profiles: IdentityProfile[]): Promise<void> {
  await AsyncStorage.setItem(IDENTITY_PROFILES_KEY, JSON.stringify(profiles));
}

export async function getIdentityProfile(id: string): Promise<IdentityProfile | null> {
  const profiles = await loadIdentityProfiles();
  return profiles.find((profile) => profile.id === id) ?? null;
}

export async function upsertIdentityProfile(profile: IdentityProfile): Promise<void> {
  const profiles = await loadIdentityProfiles();
  await saveIdentityProfiles(upsertIdentityProfileInList(profiles, profile));
}

export async function disableIdentityProfile(id: string, now: string): Promise<void> {
  const profiles = await loadIdentityProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveIdentityProfiles(upsertIdentityProfileInList(profiles, disableLibraryItem(target, now)));
}

export async function archiveIdentityProfile(id: string, now: string): Promise<void> {
  const profiles = await loadIdentityProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveIdentityProfiles(upsertIdentityProfileInList(profiles, archiveLibraryItem(target, now)));
}

export async function restoreIdentityProfile(id: string, now: string): Promise<void> {
  const profiles = await loadIdentityProfiles();
  const target = profiles.find((profile) => profile.id === id);
  if (!target) return;
  await saveIdentityProfiles(upsertIdentityProfileInList(profiles, restoreLibraryItem(target, now)));
}

export async function resolveEnabledIdentityProfilesForProgram(programId: string): Promise<IdentityProfile[]> {
  const profiles = await loadIdentityProfiles();
  return resolveEnabledLibraryItemsForProgram(profiles, programId);
}

export async function loadInterferenceItems(): Promise<InterferenceItem[]> {
  const raw = await AsyncStorage.getItem(INTERFERENCE_ITEMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as InterferenceItem[];
    return Array.isArray(parsed) ? parsed.map(normalizeInterferenceItem) : [];
  } catch (error) {
    console.warn("[storage] Stored Interference Items are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveInterferenceItems(items: InterferenceItem[]): Promise<void> {
  await AsyncStorage.setItem(INTERFERENCE_ITEMS_KEY, JSON.stringify(items));
}

export async function getInterferenceItem(id: string): Promise<InterferenceItem | null> {
  const items = await loadInterferenceItems();
  return items.find((item) => item.id === id) ?? null;
}

export async function upsertInterferenceItem(item: InterferenceItem): Promise<void> {
  const items = await loadInterferenceItems();
  await saveInterferenceItems(upsertInterferenceItemInList(items, item));
}

export async function disableInterferenceItem(id: string, now: string): Promise<void> {
  const items = await loadInterferenceItems();
  const target = items.find((item) => item.id === id);
  if (!target) return;
  await saveInterferenceItems(upsertInterferenceItemInList(items, disableLibraryItem(target, now)));
}

export async function archiveInterferenceItem(id: string, now: string): Promise<void> {
  const items = await loadInterferenceItems();
  const target = items.find((item) => item.id === id);
  if (!target) return;
  await saveInterferenceItems(upsertInterferenceItemInList(items, archiveLibraryItem(target, now)));
}

export async function restoreInterferenceItem(id: string, now: string): Promise<void> {
  const items = await loadInterferenceItems();
  const target = items.find((item) => item.id === id);
  if (!target) return;
  await saveInterferenceItems(upsertInterferenceItemInList(items, restoreLibraryItem(target, now)));
}

export async function resolveEnabledInterferenceItemsForProgram(programId: string): Promise<InterferenceItem[]> {
  const items = await loadInterferenceItems();
  return resolveEnabledLibraryItemsForProgram(items, programId);
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 12: CRUD for CombinedInterferenceSelection
// (arc/combinedInterferenceSelection.ts) -- mirrors loadStateProfiles/
// loadInterferenceItems' own defensive-parse + normalize pattern exactly.
// Same "avoid destructive deletion APIs" rule as StateProfile/InterferenceItem:
// only disable/archive (non-destructive) and restore, never a delete*
// function.
// ---------------------------------------------------------------------------

export async function loadCombinedInterferenceSelections(): Promise<CombinedInterferenceSelection[]> {
  const raw = await AsyncStorage.getItem(COMBINED_INTERFERENCE_SELECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CombinedInterferenceSelection[];
    return Array.isArray(parsed) ? parsed.map(normalizeCombinedInterferenceSelection) : [];
  } catch (error) {
    console.warn("[storage] Stored Combined Interference Selections are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveStateProfiles/saveInterferenceItems' own style. */
export async function saveCombinedInterferenceSelections(selections: CombinedInterferenceSelection[]): Promise<void> {
  await AsyncStorage.setItem(COMBINED_INTERFERENCE_SELECTIONS_KEY, JSON.stringify(selections));
}

export async function getCombinedInterferenceSelection(id: string): Promise<CombinedInterferenceSelection | null> {
  const selections = await loadCombinedInterferenceSelections();
  return selections.find((selection) => selection.id === id) ?? null;
}

/** Create or update -- upserts by id, see arc/combinedInterferenceSelection.ts's upsertCombinedInterferenceSelectionInList. For the sanctioned "one per StateProfile" write path, see that module's own applyConfiguredSelectionForState instead -- this function alone does not enforce that invariant. */
export async function upsertCombinedInterferenceSelection(selection: CombinedInterferenceSelection): Promise<void> {
  const selections = await loadCombinedInterferenceSelections();
  await saveCombinedInterferenceSelections(upsertCombinedInterferenceSelectionInList(selections, selection));
}

export async function disableCombinedInterferenceSelection(id: string, now: string): Promise<void> {
  const selections = await loadCombinedInterferenceSelections();
  const target = selections.find((selection) => selection.id === id);
  if (!target) return;
  await saveCombinedInterferenceSelections(upsertCombinedInterferenceSelectionInList(selections, disableLibraryItem(target, now)));
}

export async function archiveCombinedInterferenceSelection(id: string, now: string): Promise<void> {
  const selections = await loadCombinedInterferenceSelections();
  const target = selections.find((selection) => selection.id === id);
  if (!target) return;
  await saveCombinedInterferenceSelections(upsertCombinedInterferenceSelectionInList(selections, archiveLibraryItem(target, now)));
}

export async function restoreCombinedInterferenceSelection(id: string, now: string): Promise<void> {
  const selections = await loadCombinedInterferenceSelections();
  const target = selections.find((selection) => selection.id === id);
  if (!target) return;
  await saveCombinedInterferenceSelections(upsertCombinedInterferenceSelectionInList(selections, restoreLibraryItem(target, now)));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 14B-2: CRUD for PersonalDevelopmentRouteConfig
// (arc/personalDevelopmentRouteConfig.ts) -- mirrors loadCombinedInterferenceSelections'
// own defensive-parse + normalize pattern exactly. Same "avoid destructive
// deletion APIs" rule as every other library key: only disable/archive
// (non-destructive) and restore, never a delete* function.
// ---------------------------------------------------------------------------

export async function loadPersonalDevelopmentRouteConfigs(): Promise<PersonalDevelopmentRouteConfig[]> {
  const raw = await AsyncStorage.getItem(PERSONAL_DEVELOPMENT_ROUTE_CONFIGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PersonalDevelopmentRouteConfig[];
    return Array.isArray(parsed) ? parsed.map(normalizePersonalDevelopmentRouteConfig) : [];
  } catch (error) {
    console.warn("[storage] Stored Personal Development Route Configs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveCombinedInterferenceSelections' own style. */
export async function savePersonalDevelopmentRouteConfigs(configs: PersonalDevelopmentRouteConfig[]): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_DEVELOPMENT_ROUTE_CONFIGS_KEY, JSON.stringify(configs));
}

export async function getPersonalDevelopmentRouteConfig(id: string): Promise<PersonalDevelopmentRouteConfig | null> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  return configs.find((config) => config.id === id) ?? null;
}

/** Create or update -- upserts by id, see arc/personalDevelopmentRouteConfig.ts's upsertPersonalDevelopmentRouteConfigInList. For the idempotent "convert this legacy CombinedInterferenceSelection" write path, see that module's own resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection instead -- this function alone does not enforce that invariant. */
export async function upsertPersonalDevelopmentRouteConfig(config: PersonalDevelopmentRouteConfig): Promise<void> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  await savePersonalDevelopmentRouteConfigs(upsertPersonalDevelopmentRouteConfigInList(configs, config));
}

export async function disablePersonalDevelopmentRouteConfig(id: string, now: string): Promise<void> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return;
  await savePersonalDevelopmentRouteConfigs(upsertPersonalDevelopmentRouteConfigInList(configs, disableLibraryItem(target, now)));
}

export async function archivePersonalDevelopmentRouteConfig(id: string, now: string): Promise<void> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return;
  await savePersonalDevelopmentRouteConfigs(upsertPersonalDevelopmentRouteConfigInList(configs, archiveLibraryItem(target, now)));
}

export async function restorePersonalDevelopmentRouteConfig(id: string, now: string): Promise<void> {
  const configs = await loadPersonalDevelopmentRouteConfigs();
  const target = configs.find((config) => config.id === id);
  if (!target) return;
  await savePersonalDevelopmentRouteConfigs(upsertPersonalDevelopmentRouteConfigInList(configs, restoreLibraryItem(target, now)));
}

/**
 * Bug-fix task: every parsed manifest is run through normalizeLifeManifest
 * (arc/lifeManifest.ts), mirroring loadArcGoals' own normalizeArcGoal.
 * This WAS true-and-safe to skip when this feature first shipped (every
 * field really was optional/nullable from day one), but Part A/B later
 * added several required fields to MajorGoal/SubGoal (embodiedIdentityCue,
 * achievedStateMantra, connectedArcGoalId, completionMode, etc.) -- a
 * manifest saved before those existed is missing them entirely, and code
 * that reads them unconditionally (e.g. the visualization screen) used
 * to crash on such a record with no error boundary to catch it. Backfill
 * here once so every other reader in this app can keep assuming a fully-
 * populated record.
 */
export async function loadLifeManifests(): Promise<LifeManifest[]> {
  const raw = await AsyncStorage.getItem(LIFE_MANIFESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LifeManifest[];
    return Array.isArray(parsed) ? parsed.map(normalizeLifeManifest) : [];
  } catch (error) {
    console.warn("[storage] Stored Life Manifests are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching saveArcGoals/saveUrgeArcs' own style. */
export async function saveLifeManifests(manifests: LifeManifest[]): Promise<void> {
  await AsyncStorage.setItem(LIFE_MANIFESTS_KEY, JSON.stringify(manifests));
}

export async function getLifeManifest(id: string): Promise<LifeManifest | null> {
  const manifests = await loadLifeManifests();
  return manifests.find((manifest) => manifest.id === id) ?? null;
}

/** Upserts by id -- see arc/lifeManifest.ts's upsertLifeManifestInList. Updates the one matching manifest in place (including any nested Major Goal/Sub-goal changes the caller has already applied), never touching any other manifest's own fields, or appends it as new. */
export async function upsertLifeManifest(manifest: LifeManifest): Promise<void> {
  const manifests = await loadLifeManifests();
  await saveLifeManifests(upsertLifeManifestInList(manifests, manifest));
}

/** Removes exactly the one matching Life Manifest (by id) -- see arc/lifeManifest.ts's deleteLifeManifestFromList. Every other Life Manifest is left completely untouched; a no-op if the id doesn't match any manifest. Never cascades into LIFE_MANIFEST_TARGETS_KEY or any referenced ArcBuild/ArcGoal/MiniArcBuild/UrgeArc/ArcLink. */
export async function deleteLifeManifest(id: string): Promise<void> {
  const manifests = await loadLifeManifests();
  await saveLifeManifests(deleteLifeManifestFromList(manifests, id));
}

/**
 * Life Manifest task: Targets live in their own flat store, separate
 * from LIFE_MANIFESTS_KEY -- see arc/lifeManifest.ts's own module doc.
 * Not yet written by any screen in this phase; wired now so later
 * phases (journal entries, Scheduled Actions) attach to a stable id
 * surface from day one.
 */
export async function loadLifeManifestTargets(): Promise<Target[]> {
  const raw = await AsyncStorage.getItem(LIFE_MANIFEST_TARGETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Target[];
    return Array.isArray(parsed) ? parsed.map(normalizeTarget) : [];
  } catch (error) {
    console.warn("[storage] Stored Life Manifest Targets are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching every other saveX above. */
export async function saveLifeManifestTargets(targets: Target[]): Promise<void> {
  await AsyncStorage.setItem(LIFE_MANIFEST_TARGETS_KEY, JSON.stringify(targets));
}

export async function getLifeManifestTarget(id: string): Promise<Target | null> {
  const targets = await loadLifeManifestTargets();
  return targets.find((target) => target.id === id) ?? null;
}

/** Upserts by id -- see arc/lifeManifest.ts's upsertTargetInList. */
export async function upsertLifeManifestTarget(target: Target): Promise<void> {
  const targets = await loadLifeManifestTargets();
  await saveLifeManifestTargets(upsertTargetInList(targets, target));
}

/** Removes exactly the one matching Target (by id) -- see arc/lifeManifest.ts's deleteTargetFromList. A no-op if the id doesn't match any Target. */
export async function deleteLifeManifestTarget(id: string): Promise<void> {
  const targets = await loadLifeManifestTargets();
  await saveLifeManifestTargets(deleteTargetFromList(targets, id));
}

/**
 * Sub-goal↔ARC Goal connection task: the Life Manifest journal --
 * append-only, exact mirror of loadSessionLog/appendSessionLogEntry
 * (data/sessionLog.ts's own CRUD, defined below in this file). No
 * update/delete function exists on purpose -- a journal entry, once
 * appended, is permanent history (see data/lifeManifestJournal.ts's own
 * module doc).
 */
export async function loadLifeManifestJournal(): Promise<LifeManifestJournalEntry[]> {
  const raw = await AsyncStorage.getItem(LIFE_MANIFEST_JOURNAL_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LifeManifestJournalEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored Life Manifest journal is not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function appendLifeManifestJournalEntry(entry: LifeManifestJournalEntry): Promise<void> {
  const existing = await loadLifeManifestJournal();
  existing.push(entry);
  await AsyncStorage.setItem(LIFE_MANIFEST_JOURNAL_KEY, JSON.stringify(existing));
}

/**
 * The real source of truth for what a trainee needs (state/identity/
 * habit, and whether identity was wanted immediately) -- BUILD reads
 * this back instead of inferring from ArcBuildProfile.identityActionNeeded,
 * which is legacy-only. Validated the same way loadProgramProgress()
 * is: an unrecognized programPath returns null instead of a value
 * downstream code would crash on.
 */
export async function loadProgramSelection(): Promise<ArcProgramSelection | null> {
  const raw = await AsyncStorage.getItem(PROGRAM_SELECTION_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as ArcProgramSelection;
  if (!isKnownProgramPath(parsed.programPath)) {
    console.warn(
      `[storage] Stored program selection has an unknown programPath "${parsed.programPath}" -- discarding it rather than letting downstream code use it.`
    );
    return null;
  }
  return parsed;
}

export async function saveProgramSelection(selection: ArcProgramSelection): Promise<void> {
  await AsyncStorage.setItem(PROGRAM_SELECTION_KEY, JSON.stringify(selection));
}

/**
 * Validates programPath against PROGRAM_DEFINITIONS before returning:
 * every real caller (program/progress.ts, stats/StatsScreen.tsx) calls
 * getProgramDefinition(progress.programPath), which throws on an
 * unrecognized path. Rather than let that throw reach the UI, treat a
 * corrupt/legacy-incompatible programPath as "no progress yet" -- a
 * fresh ArcProgramProgress is created the next time BUILD completes.
 */
export async function loadProgramProgress(): Promise<ArcProgramProgress | null> {
  const raw = await AsyncStorage.getItem(PROGRAM_PROGRESS_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as ArcProgramProgress;
  if (!isKnownProgramPath(parsed.programPath)) {
    console.warn(
      `[storage] Stored program progress has an unknown programPath "${parsed.programPath}" -- discarding it rather than crashing downstream.`
    );
    return null;
  }
  return parsed;
}

export async function saveProgramProgress(progress: ArcProgramProgress): Promise<void> {
  await AsyncStorage.setItem(PROGRAM_PROGRESS_KEY, JSON.stringify(progress));
}

export async function loadSessionLog(): Promise<SessionLogEntry[]> {
  const raw = await AsyncStorage.getItem(SESSION_LOG_KEY);
  return raw ? (JSON.parse(raw) as SessionLogEntry[]) : [];
}

export async function appendSessionLogEntry(entry: SessionLogEntry): Promise<void> {
  const existing = await loadSessionLog();
  existing.push(entry);
  await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(existing));
}

/**
 * Attaches an optional Gratitude note -- protocol-linked, per the
 * evidence-encoding task (#4): "על מה אתה מוקיר תודה מתוך מה שקרה עכשיו
 * בתרגול?" -- and, when the trainee also supplied one, ONE concrete
 * memory detail from that SAME experience (#5), to the most recently
 * logged session. Called after appendSessionLogEntry() already logged
 * the session itself (so a completed session is never left unlogged
 * just because the trainee is still on the Gratitude screen), once the
 * trainee submits (or explicitly leaves blank) either field. Both are
 * written together in this ONE call, onto this ONE SessionLogEntry --
 * never two separate writes that could end up describing different
 * sessions (#6/#13's same-source guarantee starts here). `memoryDetail`
 * defaults to null so every pre-existing call site (there were none
 * outside this task, but this keeps the signature backward-compatible
 * regardless) keeps working unchanged. A no-op if the log is empty
 * (defensive; shouldn't happen in practice since this is only ever
 * called right after appendSessionLogEntry).
 */
export async function updateLastSessionLogEntryGratitude(
  gratitude: string | null,
  memoryDetail: string | null = null,
  /**
   * Coherent-architecture task (#13 "Evidence of Progress"): the
   * trainee's own optional progress note, saved onto this SAME entry
   * in this SAME call -- see SessionLogEntry.progressEvidence's doc.
   * Defaults to null so both pre-existing callers (there was only one)
   * keep working unchanged.
   */
  progressEvidence: string | null = null,
  /**
   * Post-action reflection/imagery task: the trainee's own "מה אפשר
   * לשפר בפעם הבאה?" answer, saved onto this SAME entry in this SAME
   * call -- see SessionLogEntry.improvementReflection's doc. Defaults
   * to null so every pre-existing caller keeps working unchanged.
   */
  improvementReflection: string | null = null,
  /**
   * Post-action reflection/imagery task: whether this session earned
   * full completion-star credit -- see
   * SessionLogEntry.fullReflectionCreditEarned's doc. Defaults to null
   * (never ran the reflection sequence at all) so every pre-existing
   * caller keeps working unchanged.
   */
  fullReflectionCreditEarned: boolean | null = null
): Promise<void> {
  const existing = await loadSessionLog();
  if (existing.length === 0) return;
  existing[existing.length - 1] = {
    ...existing[existing.length - 1],
    gratitude,
    gratitudeMemoryDetail: memoryDetail,
    progressEvidence,
    improvementReflection,
    fullReflectionCreditEarned,
  };
  await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(existing));
}

/**
 * The trainee's pilot clock starts the first time this is called (normally
 * right after BUILD saves their profile) and never moves after that --
 * editing the profile later doesn't reset it. Idempotent, so it's also
 * safe to call defensively wherever pilot progress is displayed.
 *
 * Independent of program/ (a trainee's own program can be 1-3 weeks
 * depending on what they need): this is the fixed pilot testing window
 * (data/pilotConfig.ts), not their program length.
 */
export async function getOrCreatePilotStartedAt(): Promise<string> {
  const existing = await AsyncStorage.getItem(PILOT_STARTED_AT_KEY);
  if (existing) return existing;
  const now = new Date().toISOString();
  await AsyncStorage.setItem(PILOT_STARTED_AT_KEY, now);
  return now;
}

/**
 * Task-start alarm vibration task, requirement 7: the trainee's own
 * choice of whether a task's "it's time to start" alarm (data/
 * taskScheduledStart.ts) includes sound and/or vibration, kept separate
 * since Android lets a channel be sound-only/vibration-only/both/
 * neither (data/notifications.ts's resolveTaskStartChannelId). Both
 * default to true (sound AND vibration, requirement 1) until the
 * trainee changes them -- never silently off.
 */
export interface TaskAlarmPreferences {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  /**
   * Task Reflection Memory task, requirement 7: the trainee's own
   * choice of whether a saved reflection (which may contain personal
   * information) is ever shown in the task alarm's own notification --
   * default true (requirement 2's behavior is the default), backfilled
   * for every preference record saved before this field existed by the
   * same `{...DEFAULT_TASK_ALARM_PREFERENCES, ...stored}` spread
   * loadTaskAlarmPreferences already uses below, no separate migration
   * needed. When false, the reflection is withheld from the
   * notification's content entirely (title/body both fall back to the
   * pre-existing default text) rather than only redacted on the lock
   * screen specifically -- see data/taskAlarm.ts's own doc for why.
   */
  showReflectionOnLockScreen: boolean;
}

const TASK_ALARM_PREFERENCES_KEY = "archi.taskAlarmPreferences.v1";
const DEFAULT_TASK_ALARM_PREFERENCES: TaskAlarmPreferences = { soundEnabled: true, vibrationEnabled: true, showReflectionOnLockScreen: true };

export async function loadTaskAlarmPreferences(): Promise<TaskAlarmPreferences> {
  const raw = await AsyncStorage.getItem(TASK_ALARM_PREFERENCES_KEY);
  return raw ? { ...DEFAULT_TASK_ALARM_PREFERENCES, ...(JSON.parse(raw) as Partial<TaskAlarmPreferences>) } : DEFAULT_TASK_ALARM_PREFERENCES;
}

export async function saveTaskAlarmPreferences(preferences: TaskAlarmPreferences): Promise<void> {
  await AsyncStorage.setItem(TASK_ALARM_PREFERENCES_KEY, JSON.stringify(preferences));
}

/**
 * Nine Functional Improvements task, Improvement 8 ("Emotional
 * Check-In on the Android Lock Screen"): defaults to OFF -- "a quiet,
 * optional, user-ENABLED notification," never shown until the trainee
 * explicitly turns it on in build/EmotionalCheckInNotificationSettingsScreen.tsx.
 */
export interface EmotionalCheckInNotificationSettings {
  enabled: boolean;
}

const EMOTIONAL_CHECKIN_NOTIFICATION_SETTINGS_KEY = "archi.emotionalCheckInNotificationSettings.v1";
const DEFAULT_EMOTIONAL_CHECKIN_NOTIFICATION_SETTINGS: EmotionalCheckInNotificationSettings = { enabled: false };

export async function loadEmotionalCheckInNotificationSettings(): Promise<EmotionalCheckInNotificationSettings> {
  const raw = await AsyncStorage.getItem(EMOTIONAL_CHECKIN_NOTIFICATION_SETTINGS_KEY);
  return raw
    ? { ...DEFAULT_EMOTIONAL_CHECKIN_NOTIFICATION_SETTINGS, ...(JSON.parse(raw) as Partial<EmotionalCheckInNotificationSettings>) }
    : DEFAULT_EMOTIONAL_CHECKIN_NOTIFICATION_SETTINGS;
}

export async function saveEmotionalCheckInNotificationSettings(settings: EmotionalCheckInNotificationSettings): Promise<void> {
  await AsyncStorage.setItem(EMOTIONAL_CHECKIN_NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * ARCHI -- Unified 7-Part Update task, Part 7.2 ("ARC APPEARANCE
 * SETTINGS"): the one persistent point-color/circle-color pair --
 * same single-blob load/save convention as every other settings type
 * in this file. "Persist across app restarts... preserve current
 * defaults until changed": a missing/partial stored blob always
 * backfills from DEFAULT_ARC_APPEARANCE_SETTINGS (both fields null,
 * meaning "use the app's own existing built-in default").
 */
const ARC_APPEARANCE_SETTINGS_KEY = "archi.arcAppearanceSettings.v1";

export async function loadArcAppearanceSettings(): Promise<ArcAppearanceSettings> {
  const raw = await AsyncStorage.getItem(ARC_APPEARANCE_SETTINGS_KEY);
  return raw ? { ...DEFAULT_ARC_APPEARANCE_SETTINGS, ...(JSON.parse(raw) as Partial<ArcAppearanceSettings>) } : DEFAULT_ARC_APPEARANCE_SETTINGS;
}

export async function saveArcAppearanceSettings(settings: ArcAppearanceSettings): Promise<void> {
  await AsyncStorage.setItem(ARC_APPEARANCE_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * ARCHI -- Unified Development Specification task, Part 4 ("INSIGHT
 * SETTINGS"): the one persistent "show the Home-screen 'הוסף תובנה'
 * button" preference -- same single-blob load/save convention as
 * ARC_APPEARANCE_SETTINGS_KEY above. "For existing installations
 * without a saved preference, default safely to ON": a missing stored
 * value always backfills to `true`, never `false` -- OFF is only ever
 * reached by an explicit trainee choice, same as every other
 * opt-OUT-style toggle in this app.
 */
const SHOW_HOME_INSIGHT_BUTTON_KEY = "archi.showHomeInsightButton.v1";

export async function loadShowHomeInsightButtonSetting(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(SHOW_HOME_INSIGHT_BUTTON_KEY);
  return raw === null ? true : raw === "true";
}

export async function saveShowHomeInsightButtonSetting(value: boolean): Promise<void> {
  await AsyncStorage.setItem(SHOW_HOME_INSIGHT_BUTTON_KEY, value ? "true" : "false");
}

/**
 * To-Do Bank + Duration/Split Selection task: mutes/unmutes
 * data/timerSound.ts's own playBreakStartSound only -- an opt-OUT-style
 * toggle (default true = enabled), same convention as
 * SHOW_HOME_INSIGHT_BUTTON_KEY above. Never affects
 * playTimerCompletionSound/playContinueAvailableCue, which stay
 * unconditional exactly as they already are.
 */
const BREAK_SOUND_ENABLED_KEY = "archi.breakSoundEnabled.v1";

export async function loadBreakSoundEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(BREAK_SOUND_ENABLED_KEY);
  return raw === null ? true : raw === "true";
}

export async function saveBreakSoundEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(BREAK_SOUND_ENABLED_KEY, value ? "true" : "false");
}

/**
 * "התבוננות וחיבור לעצמי" task: the trainee's own personal first name,
 * asked once (on the self_observation_exercise screen, the first time
 * it's reached with none saved) and never re-asked afterward. A single
 * raw-string AsyncStorage key -- same minimal shape as
 * SHOW_HOME_INSIGHT_BUTTON_KEY above -- since there is exactly one
 * field, no JSON envelope is needed. `null` means "never saved."
 */
const PERSONAL_NAME_KEY = "archi.personalName.v1";

export async function loadPersonalName(): Promise<string | null> {
  return AsyncStorage.getItem(PERSONAL_NAME_KEY);
}

export async function savePersonalName(name: string): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_NAME_KEY, name);
}

/**
 * Nine Functional Improvements task, Improvement 9 ("Configurable
 * Morning Daily Visualization Alarm"): a single-slot, user-configured
 * recurring alarm -- hour/minute/recurrenceDays mirror ScheduledRoutine's
 * own exact field shape (data/routines.ts), so arc/routines.ts's
 * already-tested resolveNextOccurrenceDate is reused DIRECTLY for this
 * alarm's own next-occurrence math, never a second implementation.
 * notificationId/scheduledFor are the SAME "native-armed bookkeeping,
 * re-synced by reconciliation" pair every other alarm kind in this app
 * already carries (TaskAlarmPreferences' siblings on Task/PlannedArc).
 * `hasOfferedSetup` is permanent and separate from `enabled` -- the
 * ONE-TIME offer (live/DailyStartupSequenceOverlay.tsx's own new
 * "alarmOffer" step) is shown at most once ever, REGARDLESS of whether
 * the trainee enabled the alarm or declined it; `enabled` alone is
 * freely toggled afterward from build/MorningAlarmSettingsScreen.tsx
 * without ever re-triggering that one-time offer.
 */
export interface MorningAlarmConfig {
  enabled: boolean;
  hour: number;
  minute: number;
  /** 0 = Sunday .. 6 = Saturday (Date.getDay() convention), matching ScheduledRoutine.recurrenceDays/TaskRecurrence.daysOfWeek. */
  recurrenceDays: number[];
  notificationId: string | null;
  scheduledFor: string | null;
  hasOfferedSetup: boolean;
}

const MORNING_ALARM_CONFIG_KEY = "archi.morningAlarmConfig.v1";
const DEFAULT_MORNING_ALARM_CONFIG: MorningAlarmConfig = {
  enabled: false,
  hour: 7,
  minute: 0,
  recurrenceDays: [0, 1, 2, 3, 4, 5, 6],
  notificationId: null,
  scheduledFor: null,
  hasOfferedSetup: false,
};

export async function loadMorningAlarmConfig(): Promise<MorningAlarmConfig> {
  const raw = await AsyncStorage.getItem(MORNING_ALARM_CONFIG_KEY);
  return raw ? { ...DEFAULT_MORNING_ALARM_CONFIG, ...(JSON.parse(raw) as Partial<MorningAlarmConfig>) } : DEFAULT_MORNING_ALARM_CONFIG;
}

export async function saveMorningAlarmConfig(config: MorningAlarmConfig): Promise<void> {
  await AsyncStorage.setItem(MORNING_ALARM_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Floating task timer task, requirement 1's own closing line: "יש
 * לאפשר למשתמש להפעיל או לכבות את הטיימר הצף בהגדרות האפליקציה." Only
 * the floating WindowManager overlay itself is gated by this -- the
 * ongoing notification (requirement 3) is never optional and keeps
 * showing regardless, exactly as that requirement's own "אינה תחליף
 * לטיימר הצף" instruction implies in both directions. Defaults to
 * enabled (requirement 1 describes it as the normal, expected
 * behavior) until the trainee turns it off.
 */
export interface FloatingTimerOverlayPreferences {
  enabled: boolean;
}

const FLOATING_TIMER_OVERLAY_PREFERENCES_KEY = "archi.floatingTimerOverlayPreferences.v1";
const DEFAULT_FLOATING_TIMER_OVERLAY_PREFERENCES: FloatingTimerOverlayPreferences = { enabled: true };

export async function loadFloatingTimerOverlayPreferences(): Promise<FloatingTimerOverlayPreferences> {
  const raw = await AsyncStorage.getItem(FLOATING_TIMER_OVERLAY_PREFERENCES_KEY);
  return raw
    ? { ...DEFAULT_FLOATING_TIMER_OVERLAY_PREFERENCES, ...(JSON.parse(raw) as Partial<FloatingTimerOverlayPreferences>) }
    : DEFAULT_FLOATING_TIMER_OVERLAY_PREFERENCES;
}

export async function saveFloatingTimerOverlayPreferences(preferences: FloatingTimerOverlayPreferences): Promise<void> {
  await AsyncStorage.setItem(FLOATING_TIMER_OVERLAY_PREFERENCES_KEY, JSON.stringify(preferences));
}

/**
 * Critical-bug task ("Native Alarm Still Not Working"), Step 2: the
 * record behind the "בדיקת שעון מעורר" (Test Alarm) diagnostic screen.
 * `armError` is shown VERBATIM, never swallowed (the trainee's own
 * explicit requirement: "יש להציג שגיאות במקום להתעלם מהן"). `firedAt`
 * is set ONLY by data/taskAlarm.ts's own foreground-service handler,
 * the moment the native ring actually starts -- an OBJECTIVE signal
 * the scheduling truly worked end-to-end, never inferred from
 * scheduling having merely been requested without error.
 * soundHeard/vibrationFelt/alarmScreenShown are the trainee's own,
 * necessarily self-reported answers (JS cannot detect real-world
 * sound/vibration/screen-wake), recorded so the record stays complete
 * even if the trainee backgrounds the app and returns later.
 */
export interface TaskAlarmTestResult {
  scheduledAt: string;
  fireAt: string;
  armError: string | null;
  firedAt: string | null;
  soundHeard: boolean | null;
  vibrationFelt: boolean | null;
  alarmScreenShown: boolean | null;
}

const TASK_ALARM_TEST_RESULT_KEY = "archi.taskAlarmTestResult.v1";

export async function loadTaskAlarmTestResult(): Promise<TaskAlarmTestResult | null> {
  const raw = await AsyncStorage.getItem(TASK_ALARM_TEST_RESULT_KEY);
  return raw ? (JSON.parse(raw) as TaskAlarmTestResult) : null;
}

export async function saveTaskAlarmTestResult(result: TaskAlarmTestResult): Promise<void> {
  await AsyncStorage.setItem(TASK_ALARM_TEST_RESULT_KEY, JSON.stringify(result));
}

/**
 * Critical-bug task ("Test Alarm Works, Scheduled Task Alarm Does
 * Not"), Step 3: unlike TaskAlarmTestResult above (which schedules
 * directly, bypassing Task Planning entirely), this traces a REAL task
 * through the REAL path end to end -- created and saved exactly like
 * any other task, scheduled via the exact same data/taskAlarm.ts
 * functions build/TaskEditorScreen.tsx itself calls, so a difference
 * between "the manual test works" and "a planned task doesn't" would
 * show up here as hard evidence, not a guess.
 * `registeredWithOsAfterArm`/`registeredWithOsOnLastCheck` come from
 * notifee's own getTriggerNotificationIds() -- the OS's own bookkeeping,
 * never this app's -- so a disconnect between "my code thinks it
 * armed this" and "Android actually still has it scheduled" is
 * directly visible, distinguishing "never scheduled" from "scheduled
 * but silently dropped" from "scheduled, stayed registered, but never
 * actually rang."
 */
export interface TaskAlarmRealTaskTestResult {
  taskId: string;
  taskTitle: string;
  scheduledDate: string;
  scheduledTime: string;
  savedAt: string;
  fireAt: string | null;
  armError: string | null;
  registeredWithOsAfterArm: boolean;
  registeredWithOsOnLastCheck: boolean;
  firedAt: string | null;
}

const TASK_ALARM_REAL_TASK_TEST_RESULT_KEY = "archi.taskAlarmRealTaskTestResult.v1";

export async function loadTaskAlarmRealTaskTestResult(): Promise<TaskAlarmRealTaskTestResult | null> {
  const raw = await AsyncStorage.getItem(TASK_ALARM_REAL_TASK_TEST_RESULT_KEY);
  return raw ? (JSON.parse(raw) as TaskAlarmRealTaskTestResult) : null;
}

export async function saveTaskAlarmRealTaskTestResult(result: TaskAlarmRealTaskTestResult): Promise<void> {
  await AsyncStorage.setItem(TASK_ALARM_REAL_TASK_TEST_RESULT_KEY, JSON.stringify(result));
}

/**
 * ARC alarm diagnostics task ("שעון ARC שאינו מצלצל"): exact mirror of
 * TaskAlarmRealTaskTestResult above, generalized to three independently
 * trackable kinds (standalone / before_task / mini) since section 5 of
 * the spec explicitly asks to test all three separately, not just one
 * shared slot. Same "OS's own bookkeeping, never just our own saved
 * data" discipline -- registeredWithOsAfterArm/OnLastCheck come from
 * notifee's own getTriggerNotificationIds().
 */
export type ArcAlarmTestKind = "standalone" | "before_task" | "mini";

export interface ArcAlarmRealTestResult {
  kind: ArcAlarmTestKind;
  plannedArcId: string;
  linkedTaskId: string | null;
  savedAt: string;
  fireAt: string | null;
  armError: string | null;
  registeredWithOsAfterArm: boolean;
  registeredWithOsOnLastCheck: boolean;
  firedAt: string | null;
}

const ARC_ALARM_REAL_TEST_RESULTS_KEY = "archi.arcAlarmRealTestResults.v1";

function emptyArcAlarmRealTestResults(): Record<ArcAlarmTestKind, ArcAlarmRealTestResult | null> {
  return { standalone: null, before_task: null, mini: null };
}

export async function loadArcAlarmRealTestResults(): Promise<Record<ArcAlarmTestKind, ArcAlarmRealTestResult | null>> {
  const raw = await AsyncStorage.getItem(ARC_ALARM_REAL_TEST_RESULTS_KEY);
  if (!raw) return emptyArcAlarmRealTestResults();
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ArcAlarmTestKind, ArcAlarmRealTestResult>>;
    return { ...emptyArcAlarmRealTestResults(), ...parsed };
  } catch {
    return emptyArcAlarmRealTestResults();
  }
}

/** Upserts by kind -- never drops the other two kinds' own already-saved results. */
export async function saveArcAlarmRealTestResult(result: ArcAlarmRealTestResult): Promise<void> {
  const existing = await loadArcAlarmRealTestResults();
  await AsyncStorage.setItem(ARC_ALARM_REAL_TEST_RESULTS_KEY, JSON.stringify({ ...existing, [result.kind]: result }));
}

/**
 * The shared timer-persistence model behind all three of ARCHI's real
 * timed activities -- the Beneficial Action Timer ("act"'s "performing"
 * sub-phase), the Success Focus / Success Coding Timer, and the
 * Negative Action Timer. Each TimerType gets its OWN storage key
 * (timerRunKey below), so the three timers can never read, overwrite,
 * or complete one another -- starting a new Negative Action Timer run
 * cannot touch a Beneficial Action run's record, even if one happened
 * to still exist. This is deliberately its own storage category,
 * separate from both PROFILE_KEY (persistent BUILD data -- e.g. the
 * planned action/duration/base allowance -- never touched by this) and
 * ArcLiveState (session-only, never persisted -- see
 * live/LiveSessionScreen.tsx's module doc): a narrow, explicit
 * exception to "session state is never persisted," whose only purpose
 * is letting a real timer survive navigating away from LIVE, the app
 * backgrounding/locking, or a full close/reopen, per
 * arc/actionTimer.ts's getActionTimerStatusFromStartedAt.
 *
 * actionStartedAt is the absolute anchor everything is recomputed
 * from; copyTitle/copyBody are a snapshot of the exact screen text at
 * the moment the timer began, so resuming shows the same action/cue
 * the trainee actually started with rather than re-deriving it from a
 * necessarily incomplete reconstructed session. runId distinguishes
 * this specific timer run from any other (past or future) run of the
 * same timerType -- e.g. so a stale notification from an earlier
 * Negative Action Timer run can never be mistaken for completing a
 * newer one. notificationId is the scheduled local notification this
 * run owns (see data/notifications.ts), cancelled once completion is
 * handled so it can never fire a redundant/delayed completion signal.
 * completedAt is the idempotency guard: null until completion has
 * actually been processed (sound played, notification cancelled) --
 * once set, it is never processed a second time for this run.
 */
/**
 * Adaptive ARC architecture task, Phase 14B-4: three new timer types for
 * the combined Personal Development LIVE route's own action(s) --
 * "combinedStateAction" and "combinedFactorAction" are DISTINCT stable
 * identities so a state_then_factor outcome's two sequential actions
 * never collide in this singleton-per-type storage slot; a
 * shared_explicit/legacy_shared_state_fallback outcome uses its own
 * third, unambiguous "combinedSharedAction" slot rather than overloading
 * either of the other two with a second meaning. Every existing timer
 * type/call site is completely unaffected -- this is a pure addition.
 */
export type TimerType = "beneficialAction" | "successCoding" | "negativeAction" | "routineSuccessFocus" | "combinedStateAction" | "combinedFactorAction" | "combinedSharedAction";

export interface TimerRun {
  timerType: TimerType;
  runId: string;
  actionStartedAt: string;
  durationMinutes: number | null;
  copyTitle: string;
  copyBody: string;
  notificationId: string | null;
  completedAt: string | null;
  /**
   * Only ever set for timerType "routineSuccessFocus" -- which
   * ScheduledRoutine's post-ARC Success Focus timer this specific run
   * belongs to, so resuming it (surviving backgrounding/locking/a full
   * close-reopen, the same as every other TimerRun) can record
   * completion against the correct routine occurrence. Optional (never
   * present on the other three timer types, and absent on any TimerRun
   * persisted before this field existed) rather than `string | null`,
   * so a legacy record simply parses with it `undefined` -- never a
   * literal "undefined" read as a real id.
   */
  relatedRoutineId?: string | null;
  /**
   * Adaptive ARC architecture task, Phase 14B-4: only ever set for the
   * three "combined*Action" timer types above -- the owning combined LIVE
   * session's own sessionId (minted once by arc/combinedLiveSession.ts).
   * Mirrors relatedRoutineId's exact shape/purpose for a different owner:
   * lets a resumed run be validated against the CURRENT in-memory
   * session before being trusted (a mismatch means the run belongs to an
   * earlier, abandoned session -- treated as stale, never silently
   * resumed into unrelated session state). Optional for the same legacy-
   * record-safety reason as relatedRoutineId.
   */
  relatedCombinedSessionId?: string | null;
  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
   * correction: only ever set for the three "combined*Action" timer
   * types above -- the frozen terminal facts + action-role-progress
   * array captured the moment THIS action role's timer began (see
   * arc/frozenCombinedActionRecovery.ts's own header doc for why this is
   * sufficient to resume, confirm, chain to a second required action,
   * and finish recording progress after a restart, without ever
   * reconstructing the full, never-persisted CombinedLiveSessionState).
   * Optional/nullable for the same legacy-record-safety reason as
   * relatedCombinedSessionId -- a record persisted before this field
   * existed simply parses with it undefined, never resumed as this kind
   * of restart (falls back to the pre-existing "abandoned, start fresh"
   * behavior).
   */
  frozenCombinedActionSnapshot?: FrozenCombinedActionSnapshot | null;
}

function timerRunKey(timerType: TimerType): string {
  return `archi.timerRun.v1.${timerType}`;
}

export async function loadTimerRun(timerType: TimerType): Promise<TimerRun | null> {
  const raw = await AsyncStorage.getItem(timerRunKey(timerType));
  return raw ? (JSON.parse(raw) as TimerRun) : null;
}

/** Persists (or re-persists, e.g. once a notificationId or completedAt is resolved) this timer's current run -- always keyed by its own timerType, so this can never overwrite a different timer type's record. */
export async function saveTimerRun(run: TimerRun): Promise<void> {
  await AsyncStorage.setItem(timerRunKey(run.timerType), JSON.stringify(run));
}

/** Called once a timer's real activity is actually completed and acknowledged (or a brand-new session explicitly restarts) -- never on a routine LIVE-screen focus, which is exactly the event this record needs to survive. Only ever clears the ONE named timerType's record. */
export async function clearTimerRun(timerType: TimerType): Promise<void> {
  await AsyncStorage.removeItem(timerRunKey(timerType));
}

/**
 * A "come back later" reminder -- a distinct concept from TimerRun
 * above (which times an activity already in progress): this persists
 * the trainee's own intention for a FUTURE moment that hasn't happened
 * yet, scheduled via data/notifications.ts's scheduleReminderNotification.
 * Two independent kinds -- kind "focusSuccess" is the START ping for a
 * future-scheduled Success Focus (see data/reminders.ts's
 * scheduleFutureSuccessFocus, and TimerRun above for the paired
 * "successCoding" run this ping's own moment feeds into) -- can never
 * overwrite or be confused with a separately-scheduled future ARC
 * session reminder (kind "arc", see app/index.tsx), and vice versa. At
 * most one pending reminder per kind -- scheduling a new one for the
 * same kind (data/reminders.ts's scheduleDeferredReminder/
 * scheduleFutureSuccessFocus) always cancels and replaces whatever was
 * pending for that kind first, so a trainee can never end up with two
 * overlapping reminders of the same kind. notificationId is cleared
 * alongside the record once the reminder is resolved (its notification
 * fires and is handled, or the trainee replaces/cancels it) -- never
 * left dangling to fire a redundant signal later.
 */
/**
 * Sub-goal↔ARC Goal connection task: "lifeManifestSubGoal"/"lifeManifestTarget"
 * are used only via scheduleReminderNotification directly (data/notifications.ts),
 * never via PendingReminder below -- PendingReminder is stored one-per-kind,
 * which doesn't fit "many Sub-goals/Targets, each with its own reminder."
 * SubGoal.deadlineNotificationId/Target's own equivalent (arc/lifeManifest.ts)
 * play PendingReminder's role instead, one pair per entity -- see
 * data/lifeManifestReminders.ts.
 */
export type ReminderKind =
  | "focusSuccess"
  | "arc"
  | "routine"
  | "lifeManifestSubGoal"
  | "lifeManifestTarget"
  | "arcGoalTarget"
  | "fourWeekProgramWeek"
  | "personalDevelopmentProgramWeek"
  /** Hebrew BUILD/LIVE rework spec, page 4: fires once a task's own timer completes (or would complete) while the app is backgrounded/the screen isn't open -- tapping it deep-links to that task's own screen (app/_layout.tsx's handleReminderResponse), which then shows the 3-choice end-of-timer prompt itself. Spec's own sanctioned fallback for "if not all three choices can be shown in the notification, tapping it opens the choice screen". */
  | "taskTimerEnded"
  /** Productivity roadmap, Stage AB: fires once the "I need rest" sub-timer (arc/taskTimer.ts's TaskTimerRun, kind "rest") completes -- tapping deep-links to the same task screen, which shows the rest timer's own "סיום המנוחה" state. */
  | "restTimerEnded"
  /** Productivity roadmap, Stage AB: fires at a postponed task's own chosen return time (Stage W's PostponementScreen, only when returnChoice is "specificTime") -- tapping deep-links straight to that task's own screen. */
  | "postponedTaskReturn"
  /** Productivity upgrade task, requirement 2: fires at a "planned" task's own scheduledDate/scheduledTime (or, for a recurring task, its next qualifying day) -- "it's time to start this task." Tapping deep-links straight to that task's own screen (app/_layout.tsx's handleReminderResponse), same as the other task-kind reminders above. Reuses Task.notificationId/notificationScheduledFor -- a task only ever has ONE pending task-level notification at a time (this, taskTimerEnded's own active-timer notification lives on TaskTimerRun instead, restTimerEnded likewise, or postponedTaskReturn once postponed), so no new field was needed. */
  | "taskScheduledStart"
  /** ARCHI -- Unified Development Specification task, Part 2 ("ARC GYM REMINDERS"): own independent notification per ArcGymReminder (arc/arcGym.ts), never PendingReminder's one-per-kind model -- same "own notification per entity" treatment as "arcGoalTarget"/"routine" above. Tapping deep-links straight to the named exercise's own detail screen (never Task LIVE, never a timer -- this reminder kind never imposes one). */
  | "arcGymReminder"
  /** ARC Reminders task: one independent notification per ArcMantraReminder (arc/arcReminders.ts) -- own-notification-per-entity, same treatment as "arcGymReminder"/"routine" above, never PendingReminder's one-per-kind model (a trainee may have several mantra reminders of the same subtype at once). Never interruptive of an active session in the sense that matters here -- it still goes through the SAME busy-state-respecting native path every other non-current-task kind does (deliberately NOT added to CURRENT_TASK_REMINDER_KINDS below), so it is automatically suppressed while a task/ARC session is already active, satisfying "must never disrupt an active ARC session" by construction. */
  | "arcMantraDesiredFeeling"
  | "arcMantraMemory"
  | "arcMantraPresentIdentity"
  | "arcMantraFutureIdentity"
  | "arcMantraGoal"
  /** ARC Reminders task: one independent notification per ArcRecallReminder -- same own-notification-per-entity treatment as the mantra kinds above. Tapping opens the WhatsApp-style recall chat screen for this reminder (data/reminders.ts's routeTappedReminder); an inline reply is handled separately, by the native RemoteInput background-event path (data/arcRecallDelivery.ts), never through this tap-routing function at all. */
  | "arcRecallQuestion";

export interface PendingReminder {
  kind: ReminderKind;
  /** ISO timestamp of when this reminder is scheduled to fire. */
  fireAt: string;
  /**
   * Only meaningful for kind "focusSuccess": true = "Focus Success with
   * ARC" was chosen, false = "Focus Success without ARC". Always true
   * for kind "arc" (a future ARC session is, by construction, "with
   * ARC") -- kept on every record rather than a separate optional field
   * so the shape stays uniform across both kinds.
   */
  arcRequested: boolean;
  notificationId: string | null;
  createdAt: string;
}

function pendingReminderKey(kind: ReminderKind): string {
  return `archi.pendingReminder.v1.${kind}`;
}

export async function loadPendingReminder(kind: ReminderKind): Promise<PendingReminder | null> {
  const raw = await AsyncStorage.getItem(pendingReminderKey(kind));
  return raw ? (JSON.parse(raw) as PendingReminder) : null;
}

/** Always keyed by this reminder's own kind, so saving one kind's reminder can never overwrite the other's. */
export async function savePendingReminder(reminder: PendingReminder): Promise<void> {
  await AsyncStorage.setItem(pendingReminderKey(reminder.kind), JSON.stringify(reminder));
}

/** Called once a reminder's notification has actually fired and been handled, or when it's being replaced by a newly-scheduled one of the same kind. Only ever clears the ONE named kind's record. */
export async function clearPendingReminder(kind: ReminderKind): Promise<void> {
  await AsyncStorage.removeItem(pendingReminderKey(kind));
}

/**
 * Multiple Scheduled ARC + Success Focus Routines: a trainee-defined
 * recurring routine (e.g. "08:00 -- Morning Focus"), distinct from
 * PendingReminder above -- that type is deliberately one-per-kind
 * (see its own doc), which cannot represent "any number of independent
 * named routines, each with its own schedule". ScheduledRoutine records
 * are instead stored as a single list (loadScheduledRoutines/
 * saveScheduledRoutines below), each with its own stable `id`, so any
 * number of routines -- including several scheduled for the exact same
 * clock time -- can exist, be edited, and be notified independently,
 * never overwriting one another.
 *
 * hour/minute are the device's LOCAL wall-clock time (never a UTC or
 * elapsed-time value) the routine should begin; recurrenceDays uses
 * JS's own Date.getDay() convention (0 = Sunday .. 6 = Saturday) so the
 * exact same values can be compared directly against a live Date
 * without any extra conversion. nextOccurrenceNotificationId/
 * nextOccurrenceScheduledFor are this routine's OWN currently-scheduled
 * local notification for its next occurrence (see data/routines.ts's
 * rescheduleRoutineNotification/reconcileRoutineNotifications) --
 * always kept in sync with a fresh resolveNextOccurrenceDate result,
 * cancelled and replaced rather than ever left stale or duplicated.
 */
export interface ScheduledRoutine {
  id: string;
  title: string;
  hour: number;
  minute: number;
  /** 0 = Sunday .. 6 = Saturday (Date.getDay() convention). */
  recurrenceDays: number[];
  successFocusDurationMinutes: number;
  notificationsEnabled: boolean;
  enabled: boolean;
  nextOccurrenceNotificationId: string | null;
  /** ISO timestamp this routine's currently-scheduled notification (if any) actually fires at -- lets reconciliation detect a stale schedule without re-deriving it from the notification itself. */
  nextOccurrenceScheduledFor: string | null;
  createdAt: string;
  /**
   * Sub-goal execution task: an optional REFERENCE back to the
   * ArcGoalTarget that links to THIS routine (ArcGoalTarget.
   * linkedScheduledRoutineId is the primary/forward link -- see that
   * field's own doc) -- lets the routines page itself offer "open the
   * linked target," satisfying "be opened from the routine" (spec
   * section 4) without a second, disconnected lookup table. Undefined
   * for every routine saved before this field existed or never linked;
   * always read with `?? null`, since loadScheduledRoutines has no
   * normalize step (see its own doc).
   */
  linkedArcGoalTargetId?: string | null;
}

/**
 * One completed occurrence of one routine, keyed by the LOCAL calendar
 * date (program/dateUtils.ts's todayLocalDateString -- never an hour-only
 * or UTC-based key, so a trainee near midnight always gets the correct
 * day's occurrence marked, not the wrong one). Completing today's
 * occurrence of routine A can never mark routine B -- or a different
 * day's occurrence of routine A -- complete, since both routineId and
 * occurrenceDateLocal must match. This list only ever grows
 * (appendRoutineOccurrenceCompletion below); nothing in this feature
 * removes a past completion.
 */
export interface RoutineOccurrenceCompletion {
  routineId: string;
  occurrenceDateLocal: string;
  completedAt: string;
}

const SCHEDULED_ROUTINES_KEY = "archi.scheduledRoutines.v1";
const ROUTINE_OCCURRENCE_COMPLETIONS_KEY = "archi.routineOccurrenceCompletions.v1";
/**
 * Weekly Routine + ARC Link management task: three brand-new, independent
 * collections (arc/routineLinks.ts) -- never read/written by any normal
 * ARC/Mini ARC code path, ScheduledRoutine, or program/. A missing key
 * (a trainee's existing install, before this feature existed) always
 * loads as an empty list, never a crash and never invented data.
 */
const ROUTINE_TRIGGERS_KEY = "archi.routineTriggers.v1";
const WEEKLY_ACTIONS_KEY = "archi.weeklyActions.v1";
const ARC_LINKS_KEY = "archi.arcLinks.v1";

export async function loadScheduledRoutines(): Promise<ScheduledRoutine[]> {
  const raw = await AsyncStorage.getItem(SCHEDULED_ROUTINES_KEY);
  return raw ? (JSON.parse(raw) as ScheduledRoutine[]) : [];
}

/** Always the FULL list -- callers read-modify-write (load, change one routine, save the whole array back) rather than a per-id upsert, matching loadSessionLog/appendSessionLogEntry's own simple whole-array persistence style for a list this small (a trainee's own handful of routines, not an unbounded log). */
export async function saveScheduledRoutines(routines: ScheduledRoutine[]): Promise<void> {
  await AsyncStorage.setItem(SCHEDULED_ROUTINES_KEY, JSON.stringify(routines));
}

/** Sub-goal execution task: a single-routine lookup, read-modify-write against the same full list above -- reused by live/ArcGoalTargetScreen.tsx to show a linked routine's own title without loading the whole routines screen. */
export async function getScheduledRoutine(id: string): Promise<ScheduledRoutine | null> {
  const routines = await loadScheduledRoutines();
  return routines.find((routine) => routine.id === id) ?? null;
}

export async function loadRoutineOccurrenceCompletions(): Promise<RoutineOccurrenceCompletion[]> {
  const raw = await AsyncStorage.getItem(ROUTINE_OCCURRENCE_COMPLETIONS_KEY);
  return raw ? (JSON.parse(raw) as RoutineOccurrenceCompletion[]) : [];
}

/** Records one occurrence as done -- never removes or rewrites any earlier entry, so completion history survives app restarts and one routine's completion can never affect another's. */
export async function appendRoutineOccurrenceCompletion(entry: RoutineOccurrenceCompletion): Promise<void> {
  const existing = await loadRoutineOccurrenceCompletions();
  existing.push(entry);
  await AsyncStorage.setItem(ROUTINE_OCCURRENCE_COMPLETIONS_KEY, JSON.stringify(existing));
}

// ---------------------------------------------------------------------------
// Weekly Routine + ARC Link management task -- three independent
// collections, each the same "load full list / save full list / upsert-
// by-id / delete-by-id" style already used for ArcBuild/MiniArcBuild
// above. Defensive parsing (corrupt JSON, or JSON that parses but isn't
// actually an array) degrades to an empty list, never a crash -- same
// guarantee loadArcBuilds/loadMiniArcBuilds already give.
// ---------------------------------------------------------------------------

export async function loadRoutineTriggers(): Promise<RoutineTrigger[]> {
  const raw = await AsyncStorage.getItem(ROUTINE_TRIGGERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RoutineTrigger[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored routine triggers are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveRoutineTriggers(triggers: RoutineTrigger[]): Promise<void> {
  await AsyncStorage.setItem(ROUTINE_TRIGGERS_KEY, JSON.stringify(triggers));
}

export async function upsertRoutineTrigger(trigger: RoutineTrigger): Promise<void> {
  const triggers = await loadRoutineTriggers();
  await saveRoutineTriggers(upsertRoutineTriggerInList(triggers, trigger));
}

export async function deleteRoutineTrigger(id: string): Promise<void> {
  const triggers = await loadRoutineTriggers();
  await saveRoutineTriggers(deleteRoutineTriggerFromList(triggers, id));
}

export async function loadWeeklyActions(): Promise<WeeklyAction[]> {
  const raw = await AsyncStorage.getItem(WEEKLY_ACTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as WeeklyAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored weekly actions are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveWeeklyActions(actions: WeeklyAction[]): Promise<void> {
  await AsyncStorage.setItem(WEEKLY_ACTIONS_KEY, JSON.stringify(actions));
}

export async function getWeeklyAction(id: string): Promise<WeeklyAction | null> {
  const actions = await loadWeeklyActions();
  return actions.find((action) => action.id === id) ?? null;
}

export async function upsertWeeklyAction(action: WeeklyAction): Promise<void> {
  const actions = await loadWeeklyActions();
  await saveWeeklyActions(upsertWeeklyActionInList(actions, action));
}

export async function deleteWeeklyAction(id: string): Promise<void> {
  const actions = await loadWeeklyActions();
  await saveWeeklyActions(deleteWeeklyActionFromList(actions, id));
}

export async function loadArcLinks(): Promise<ArcLink[]> {
  const raw = await AsyncStorage.getItem(ARC_LINKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcLink[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ARC Links are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveArcLinks(links: ArcLink[]): Promise<void> {
  await AsyncStorage.setItem(ARC_LINKS_KEY, JSON.stringify(links));
}

export async function getArcLink(id: string): Promise<ArcLink | null> {
  const links = await loadArcLinks();
  return links.find((link) => link.id === id) ?? null;
}

export async function upsertArcLink(link: ArcLink): Promise<void> {
  const links = await loadArcLinks();
  await saveArcLinks(upsertArcLinkInList(links, link));
}

export async function deleteArcLink(id: string): Promise<void> {
  const links = await loadArcLinks();
  await saveArcLinks(deleteArcLinkFromList(links, id));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 8 (progression persistence): the
// whole MappingProgressionStore (arc/reactiveProactiveProgression.ts) is
// stored as ONE plain JSON object map under PROGRESSION_MAPPING_STORE_KEY
// -- unlike every array-shaped collection above, so the defensive parse
// below validates "a plain object, not an array/null/primitive" rather
// than Array.isArray. Mirrors every loadX function's own "never throw,
// fall back to a safe empty default" guarantee exactly.
// ---------------------------------------------------------------------------

export async function loadProgressionMappingStore(): Promise<MappingProgressionStore> {
  const raw = await AsyncStorage.getItem(PROGRESSION_MAPPING_STORE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    return isPlainObject ? (parsed as MappingProgressionStore) : {};
  } catch (error) {
    console.warn("[storage] Stored progression mapping store is not valid JSON -- returning an empty store rather than crashing.", error);
    return {};
  }
}

/** Always the FULL store -- callers read-modify-write, matching every other saveX function's own style. Never catches its own AsyncStorage.setItem failure -- a genuine write failure propagates to the caller exactly like every other saveX function here, never silently swallowed. */
export async function saveProgressionMappingStore(store: MappingProgressionStore): Promise<void> {
  await AsyncStorage.setItem(PROGRESSION_MAPPING_STORE_KEY, JSON.stringify(store));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 15: the combined Personal
// Development route-level progress store -- same "one plain JSON object
// map" shape/defensive-parse convention as PROGRESSION_MAPPING_STORE_KEY
// above, keyed by routeConfigId instead of a single-item mapping key.
// ---------------------------------------------------------------------------

export type PersonalDevelopmentRouteProgressStore = Record<string, PersonalDevelopmentRouteProgress>;

export async function loadPersonalDevelopmentRouteProgressStore(): Promise<PersonalDevelopmentRouteProgressStore> {
  const raw = await AsyncStorage.getItem(PERSONAL_DEVELOPMENT_ROUTE_PROGRESS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    if (!isPlainObject) return {};
    const store = parsed as PersonalDevelopmentRouteProgressStore;
    // Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: every
    // record backfills its new 4-stage-program fields (and every other
    // defensive default normalizePersonalDevelopmentRouteProgress already
    // covers) at read time -- no migration step, mirrors every other
    // normalize-on-load store in this module.
    const normalized: PersonalDevelopmentRouteProgressStore = {};
    for (const [routeConfigId, progress] of Object.entries(store)) {
      normalized[routeConfigId] = normalizePersonalDevelopmentRouteProgress(progress);
    }
    return normalized;
  } catch (error) {
    console.warn("[storage] Stored Personal Development route progress store is not valid JSON -- returning an empty store rather than crashing.", error);
    return {};
  }
}

/** Always the FULL store. Never catches its own AsyncStorage.setItem failure -- a genuine write failure propagates to the caller exactly like every other saveX function here, never silently swallowed. */
export async function savePersonalDevelopmentRouteProgressStore(store: PersonalDevelopmentRouteProgressStore): Promise<void> {
  await AsyncStorage.setItem(PERSONAL_DEVELOPMENT_ROUTE_PROGRESS_KEY, JSON.stringify(store));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task (unified PD/ARC Goal), Phase 3: the
// per-goal ArcGoal LIVE-session progress store -- ArcGoal's own analog of
// PersonalDevelopmentRouteProgressStore above, keyed by ArcGoal.id, a
// wholly separate store from it (see arc/arcGoalSessionProgress.ts's own
// header doc for why).
// ---------------------------------------------------------------------------

export type ArcGoalSessionProgressStore = Record<string, ArcGoalSessionProgress>;

export async function loadArcGoalSessionProgressStore(): Promise<ArcGoalSessionProgressStore> {
  const raw = await AsyncStorage.getItem(ARC_GOAL_SESSION_PROGRESS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    if (!isPlainObject) return {};
    const store = parsed as ArcGoalSessionProgressStore;
    const normalized: ArcGoalSessionProgressStore = {};
    for (const [arcGoalId, progress] of Object.entries(store)) {
      normalized[arcGoalId] = normalizeArcGoalSessionProgress(progress);
    }
    return normalized;
  } catch (error) {
    console.warn("[storage] Stored ArcGoal session progress store is not valid JSON -- returning an empty store rather than crashing.", error);
    return {};
  }
}

/** Always the FULL store. Never catches its own AsyncStorage.setItem failure -- a genuine write failure propagates to the caller exactly like every other saveX function here, never silently swallowed. */
export async function saveArcGoalSessionProgressStore(store: ArcGoalSessionProgressStore): Promise<void> {
  await AsyncStorage.setItem(ARC_GOAL_SESSION_PROGRESS_KEY, JSON.stringify(store));
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task (unified PD/ARC Goal), Phase 4: the
// persistent PendingSharedActionExecution store -- keyed by
// arc/pendingSharedActionExecution.ts's own resolvePendingSharedActionExecutionKey
// (track:ownerId), shared by both tracks. This is what makes a session's
// explicit action-role confirmations survive an app restart.
// ---------------------------------------------------------------------------

export type PendingSharedActionExecutionStore = Record<string, PendingSharedActionExecution>;

export async function loadPendingSharedActionExecutionStore(): Promise<PendingSharedActionExecutionStore> {
  const raw = await AsyncStorage.getItem(PENDING_SHARED_ACTION_EXECUTION_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    const isPlainObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    return isPlainObject ? (parsed as PendingSharedActionExecutionStore) : {};
  } catch (error) {
    console.warn("[storage] Stored PendingSharedActionExecution store is not valid JSON -- returning an empty store rather than crashing.", error);
    return {};
  }
}

/** Always the FULL store. Never catches its own AsyncStorage.setItem failure -- a genuine write failure propagates to the caller exactly like every other saveX function here, never silently swallowed. */
export async function savePendingSharedActionExecutionStore(store: PendingSharedActionExecutionStore): Promise<void> {
  await AsyncStorage.setItem(PENDING_SHARED_ACTION_EXECUTION_KEY, JSON.stringify(store));
}

// ---------------------------------------------------------------------------
// ARCHI productivity task, Stage 1 foundation: CRUD for Task
// (arc/tasks.ts) and its append-only TaskJournalEntry log
// (data/taskJournal.ts) -- mirrors loadPersonalDevelopmentRouteConfigs'
// own defensive-parse + normalize pattern for Task, and
// loadLifeManifestJournal/appendLifeManifestJournalEntry's own
// append-only, no-update-no-delete pattern for the journal.
// ---------------------------------------------------------------------------

export async function loadTasks(): Promise<Task[]> {
  const raw = await AsyncStorage.getItem(TASKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Task[];
    return Array.isArray(parsed) ? parsed.map(normalizeTask) : [];
  } catch (error) {
    console.warn("[storage] Stored Tasks are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching every other saveX function here. */
export async function saveTasks(tasks: Task[]): Promise<void> {
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export async function getTask(id: string): Promise<Task | null> {
  const tasks = await loadTasks();
  return tasks.find((task) => task.id === id) ?? null;
}

/** Create or update -- upserts by id, see arc/tasks.ts's upsertTaskInList. */
export async function upsertTask(task: Task): Promise<void> {
  const tasks = await loadTasks();
  await saveTasks(upsertTaskInList(tasks, task));
}

/** A Task is a trainee's own to-do item, not a shared library record referenced by id from elsewhere -- unlike InterferenceItem/StateProfile it supports real deletion rather than disable-only status transitions. Callers are responsible for also cancelling any scheduled notification first, once a later reminders stage adds one. A no-op if the id doesn't match any task. */
export async function deleteTask(id: string): Promise<void> {
  const tasks = await loadTasks();
  await saveTasks(deleteTaskFromList(tasks, id));
}

/** null means first-time routine setup hasn't completed yet -- callers show the setup wizard in that case. */
export async function loadDailyRoutineTemplate(): Promise<DailyRoutineTemplate | null> {
  const raw = await AsyncStorage.getItem(DAILY_ROUTINE_TEMPLATE_KEY);
  if (!raw) return null;
  try {
    return normalizeDailyRoutineTemplate(JSON.parse(raw) as DailyRoutineTemplate);
  } catch (error) {
    console.warn("[storage] Stored DailyRoutineTemplate is not valid JSON -- treating as not-yet-set-up rather than crashing.", error);
    return null;
  }
}

export async function saveDailyRoutineTemplate(template: DailyRoutineTemplate): Promise<void> {
  await AsyncStorage.setItem(DAILY_ROUTINE_TEMPLATE_KEY, JSON.stringify(template));
}

/**
 * Unified ARC & Productivity Update task, requirement 9: ad-hoc,
 * per-day "select consecutive tasks, group as שגרה רצופה" groups --
 * see arc/continuousRoutineGroup.ts's own module doc for how this
 * differs from the pre-existing per-PERIOD routineMode toggle above.
 * All groups across every date live in one array (groups are few and
 * short-lived -- no per-date key needed), same convention as
 * PostponementObstacleOutcome[] below.
 */
export async function loadContinuousRoutineGroups(): Promise<ContinuousRoutineGroup[]> {
  const raw = await AsyncStorage.getItem(CONTINUOUS_ROUTINE_GROUPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ContinuousRoutineGroup[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ContinuousRoutineGroups are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveContinuousRoutineGroups(groups: ContinuousRoutineGroup[]): Promise<void> {
  await AsyncStorage.setItem(CONTINUOUS_ROUTINE_GROUPS_KEY, JSON.stringify(groups));
}

/**
 * Requirement 9: "accumulate eligible smiles (not points) silently...
 * one combined smile-reward experience at the end" -- a plain
 * groupKey -> running-total map (see data/continuousRoutineGroup.ts's
 * own add/take wrapper functions for the actual read-and-clear
 * semantics that prevent a total from ever being consumed twice).
 */
export async function loadContinuousRoutinePendingSmiles(): Promise<Record<string, number>> {
  const raw = await AsyncStorage.getItem(CONTINUOUS_ROUTINE_PENDING_SMILES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    console.warn("[storage] Stored continuous-routine pending-smiles map is not valid JSON -- treating as empty rather than crashing.", error);
    return {};
  }
}

export async function saveContinuousRoutinePendingSmiles(map: Record<string, number>): Promise<void> {
  await AsyncStorage.setItem(CONTINUOUS_ROUTINE_PENDING_SMILES_KEY, JSON.stringify(map));
}

export async function loadPostponementObstacleOutcomes(): Promise<PostponementObstacleOutcome[]> {
  const raw = await AsyncStorage.getItem(POSTPONEMENT_OBSTACLE_OUTCOMES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PostponementObstacleOutcome[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored PostponementObstacleOutcomes are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function savePostponementObstacleOutcomes(outcomes: PostponementObstacleOutcome[]): Promise<void> {
  await AsyncStorage.setItem(POSTPONEMENT_OBSTACLE_OUTCOMES_KEY, JSON.stringify(outcomes));
}

/** Create or update -- upserts by id, see arc/postponementObstacle.ts's own upsertPostponementObstacleOutcomeInList. */
export async function upsertPostponementObstacleOutcome(outcome: PostponementObstacleOutcome): Promise<void> {
  const outcomes = await loadPostponementObstacleOutcomes();
  await savePostponementObstacleOutcomes(upsertPostponementObstacleOutcomeInList(outcomes, outcome));
}

/**
 * Append-only, exact mirror of loadLifeManifestJournal/
 * appendLifeManifestJournalEntry. No update/delete function exists on
 * purpose -- a journal entry, once appended, is permanent history (see
 * data/taskJournal.ts's own module doc).
 */
export async function loadTaskJournal(): Promise<TaskJournalEntry[]> {
  const raw = await AsyncStorage.getItem(TASK_JOURNAL_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TaskJournalEntry[];
    return Array.isArray(parsed) ? parsed.map(normalizeTaskJournalEntry) : [];
  } catch (error) {
    console.warn("[storage] Stored Task journal is not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function appendTaskJournalEntry(entry: TaskJournalEntry): Promise<void> {
  const existing = await loadTaskJournal();
  existing.push(entry);
  await AsyncStorage.setItem(TASK_JOURNAL_KEY, JSON.stringify(existing));
}

/**
 * Task Reflection Memory task: TaskReflection's own store -- a
 * deliberately separate key from TASK_JOURNAL_KEY (see arc/
 * taskReflection.ts's own doc for why), editable/deletable in full,
 * unlike the Task journal above.
 */
const TASK_REFLECTIONS_KEY = "archi.taskReflections.v1";

export async function loadTaskReflections(): Promise<TaskReflection[]> {
  const raw = await AsyncStorage.getItem(TASK_REFLECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TaskReflection[];
    return Array.isArray(parsed) ? parsed.map(normalizeTaskReflection) : [];
  } catch (error) {
    console.warn("[storage] Stored Task reflections are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveTaskReflections(reflections: TaskReflection[]): Promise<void> {
  await AsyncStorage.setItem(TASK_REFLECTIONS_KEY, JSON.stringify(reflections));
}

/** Single-slot read, mirroring loadTimerRun's own shape -- null when no task timer is currently in flight. `kind` defaults to "task" for a run persisted before that field existed (Stage J), so an in-flight main timer from an earlier app version is never misread as a rest timer. */
export async function loadTaskTimerRun(): Promise<TaskTimerRun | null> {
  const raw = await AsyncStorage.getItem(TASK_TIMER_RUN_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Omit<TaskTimerRun, "kind"> & { kind?: "task" | "rest" };
  return { ...parsed, kind: parsed.kind ?? "task" };
}

export async function saveTaskTimerRun(run: TaskTimerRun): Promise<void> {
  await AsyncStorage.setItem(TASK_TIMER_RUN_KEY, JSON.stringify(run));
}

/**
 * Unified Task Stages task: clearing the in-flight TaskTimerRun always
 * clears its own TaskStageProgress in the SAME call -- the two are only
 * ever meaningful together (a stage's own active timer IS the single
 * TaskTimerRun currently in flight), so bundling this here means every
 * existing call site that already clears the timer run (task
 * completion, early finish, postponement) automatically stays correct
 * with no change of its own, rather than needing a second clear call
 * added at each one individually.
 *
 * Smart To-Do List task: the same reasoning applies to TodoSplitSession
 * (arc/todoSplitSession.ts) -- a split session is only ever meaningful
 * for the one TaskTimerRun it was started alongside, so it is cleared
 * here too, with zero changes needed at any existing call site.
 *
 * To-Do Bank + Duration/Split Selection task: the same reasoning
 * applies a third time to TaskSplitProgress (arc/taskSplitProgress.ts,
 * the NEW multi-segment "עבודה מחולקת" plan) -- cleared here too, so
 * every existing completion/finish-early/postponement/ARC-entry call
 * site stays correct with zero other edits.
 */
export async function clearTaskTimerRun(): Promise<void> {
  await AsyncStorage.removeItem(TASK_TIMER_RUN_KEY);
  await AsyncStorage.removeItem(TASK_STAGE_PROGRESS_KEY);
  await AsyncStorage.removeItem(TODO_SPLIT_SESSION_KEY);
  await AsyncStorage.removeItem(TASK_SPLIT_PROGRESS_KEY);
}

/**
 * Unified Task Stages task: single-slot store for the ONE in-flight
 * TaskStageProgress (arc/taskStageProgress.ts), exact mirror of
 * TASK_TIMER_RUN_KEY's own singleton convention -- see that key's doc
 * and clearTaskTimerRun above for why the two are always cleared
 * together. Absent/null means either no staged task is currently
 * active, or the active task has no stage breakdown at all.
 */
const TASK_STAGE_PROGRESS_KEY = "archi.taskStageProgress.v1";

export async function loadTaskStageProgress(): Promise<TaskStageProgress | null> {
  const raw = await AsyncStorage.getItem(TASK_STAGE_PROGRESS_KEY);
  if (!raw) return null;
  try {
    return normalizeTaskStageProgress(JSON.parse(raw) as TaskStageProgress);
  } catch (error) {
    console.warn("[storage] Stored TaskStageProgress is not valid JSON -- treating as none rather than crashing.", error);
    return null;
  }
}

export async function saveTaskStageProgress(progress: TaskStageProgress): Promise<void> {
  await AsyncStorage.setItem(TASK_STAGE_PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Smart To-Do List task, optional splitting: single-slot store for the
 * ONE in-flight TodoSplitSession (arc/todoSplitSession.ts), exact mirror
 * of TASK_STAGE_PROGRESS_KEY's own convention above -- see
 * clearTaskTimerRun's own doc for why the two are always cleared
 * together. Absent/null means the current TaskTimerRun (if any) is an
 * ordinary, non-split session.
 */
const TODO_SPLIT_SESSION_KEY = "archi.todoSplitSession.v1";

export async function loadTodoSplitSession(): Promise<TodoSplitSession | null> {
  const raw = await AsyncStorage.getItem(TODO_SPLIT_SESSION_KEY);
  if (!raw) return null;
  try {
    return normalizeTodoSplitSession(JSON.parse(raw) as TodoSplitSession);
  } catch (error) {
    console.warn("[storage] Stored TodoSplitSession is not valid JSON -- treating as none rather than crashing.", error);
    return null;
  }
}

export async function saveTodoSplitSession(session: TodoSplitSession): Promise<void> {
  await AsyncStorage.setItem(TODO_SPLIT_SESSION_KEY, JSON.stringify(session));
}

/**
 * To-Do Bank + Duration/Split Selection task: single-slot store for the
 * ONE in-flight TaskSplitProgress (arc/taskSplitProgress.ts, the NEW
 * multi-segment "עבודה מחולקת" plan), exact mirror of
 * TASK_STAGE_PROGRESS_KEY's/TODO_SPLIT_SESSION_KEY's own convention
 * above -- see clearTaskTimerRun's own doc for why all three are
 * always cleared together. Absent/null means the current TaskTimerRun
 * (if any) is not part of a multi-segment split plan.
 */
const TASK_SPLIT_PROGRESS_KEY = "archi.taskSplitProgress.v1";

export async function loadTaskSplitProgress(): Promise<TaskSplitProgress | null> {
  const raw = await AsyncStorage.getItem(TASK_SPLIT_PROGRESS_KEY);
  if (!raw) return null;
  try {
    return normalizeTaskSplitProgress(JSON.parse(raw) as TaskSplitProgress);
  } catch (error) {
    console.warn("[storage] Stored TaskSplitProgress is not valid JSON -- treating as none rather than crashing.", error);
    return null;
  }
}

export async function saveTaskSplitProgress(progress: TaskSplitProgress): Promise<void> {
  await AsyncStorage.setItem(TASK_SPLIT_PROGRESS_KEY, JSON.stringify(progress));
}

/** Single-slot read, exact mirror of loadTaskTimerRun's own shape -- null when no ARC LIVE session is currently in progress. The session must survive backgrounding and app restart (the task's own explicit requirement); this is the only mechanism that provides that, written on every step transition by live/NewArcLiveScreen.tsx. */
export async function loadNewArcLiveSession(): Promise<NewArcLiveSessionState | null> {
  const raw = await AsyncStorage.getItem(NEW_ARC_LIVE_SESSION_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as NewArcLiveSessionState;
  // Physical questionnaire placement task: backfills the two fields it
  // added, for an in-flight session saved before they existed -- an
  // empty array/null is exactly this session's own pre-existing state
  // for those fields, never invented. Body region selection correction
  // task: same backfill for the negative side's own new pair. Body
  // Scan Upgrade task (required test 9, "saved selections are not
  // overwritten by defaults"): same backfill for its own four new
  // fields -- ?? only ever supplies the true empty/unset default for a
  // session saved before this task existed, and never touches a
  // present value (including an already-populated array/region) at all.
  const backfilled: NewArcLiveSessionState = {
    ...parsed,
    // ARC Focus task: the true "not an ARC Focus preliminary" default
    // for a session saved before this field existed -- never invented,
    // same ?? convention as every field below.
    arcFocusPracticeId: parsed.arcFocusPracticeId ?? null,
    // ARC Gym + ARC Goal Integration task: the true "not an ARC Memory
    // check-in" default for a session saved before this field existed --
    // same ?? convention as arcFocusPracticeId above.
    arcGymMemoryExerciseId: parsed.arcGymMemoryExerciseId ?? null,
    // ARC Perspective task: the true "not an ARC Perspective preliminary"
    // default for a session saved before this field existed -- same ??
    // convention as arcFocusPracticeId/arcGymMemoryExerciseId above.
    arcPerspectiveId: parsed.arcPerspectiveId ?? null,
    // ARC Saving task: the true "not launched from a trigger/saved
    // exercise" default for a session saved before these two fields
    // existed -- same ?? convention as every parallel id field above.
    arcSavingBodyOptionId: parsed.arcSavingBodyOptionId ?? null,
    arcSavingExerciseId: parsed.arcSavingExerciseId ?? null,
    arcSavingTriggerIdForNewOption: parsed.arcSavingTriggerIdForNewOption ?? null,
    // "התבוננות וחיבור לעצמי" task: the true "branch screen not yet
    // answered" default for a session saved before this field existed.
    selfObservationChoice: parsed.selfObservationChoice ?? null,
    supportiveBodyAreas: parsed.supportiveBodyAreas ?? [],
    supportiveBodyAreaCustomLabel: parsed.supportiveBodyAreaCustomLabel ?? null,
    unpleasantBodyAreas: parsed.unpleasantBodyAreas ?? [],
    unpleasantBodyAreaCustomLabel: parsed.unpleasantBodyAreaCustomLabel ?? null,
    bodyScanContractionRegions: parsed.bodyScanContractionRegions ?? [],
    bodyScanHeavinessRegions: parsed.bodyScanHeavinessRegions ?? [],
    primaryOpeningBodyScanRegion: parsed.primaryOpeningBodyScanRegion ?? null,
    primaryOpeningBodyScanSide: parsed.primaryOpeningBodyScanSide ?? null,
    // ARC Full Sequence Update task, Part 13: backfills the four new
    // desired-feeling fields for a session saved before this task
    // existed -- the true, never-invented "not chosen/not yet present"
    // default for each, same ?? convention as every field above.
    desiredFeelingText: parsed.desiredFeelingText ?? null,
    // ARCHI -- Combined Emotion & Supportive Feeling Selection task:
    // backfills the one new override field -- null is exactly a
    // pre-existing session's own true "no explicit override" state
    // (resolveFinalSupportiveFeeling then falls through to the
    // automatic mapping, same as it always has), never invented.
    selectedSupportiveFeeling: parsed.selectedSupportiveFeeling ?? null,
    customSupportiveFeelingText: parsed.customSupportiveFeelingText ?? null,
    desiredFeelingBodyAreas: parsed.desiredFeelingBodyAreas ?? [],
    desiredFeelingBodyAreaCustomLabel: parsed.desiredFeelingBodyAreaCustomLabel ?? null,
    desiredFeelingNotYetPresent: parsed.desiredFeelingNotYetPresent ?? false,
    // Final ARC Flow & Body Animation task, "Select Opening Regions":
    // same backfill convention for the new multi-select opening-region
    // field -- an empty array is exactly a pre-existing session's own
    // true "nothing chosen yet" state, never invented. The old singular
    // primaryOpeningBodyScanRegion/Side fields above are backfilled
    // unchanged, still only for a session that predates even those.
    //
    // ARCHI -- Update ARC Body Sensation Selection: Green and Blue
    // Logic task, section 8 ("preserve compatibility with existing ARC
    // sessions... avoid destructive migrations"): a session saved
    // before this task existed has plain {region, side} entries here,
    // with no `role` field at all -- each is normalized to role
    // "opening" (green), the EXACT SAME undifferentiated opening
    // treatment every entry already had before blue/supportive even
    // existed as a concept, never silently upgraded to "blue" (which
    // would invent a supportive selection the trainee never actually
    // made). A session saved AFTER this task already has `role` on
    // every entry, so `entry.role ?? "opening"` is a no-op for it.
    openingBodyScanRegions: (parsed.openingBodyScanRegions ?? []).map((entry) => ({ region: entry.region, side: entry.side, role: entry.role ?? "opening" })),
    // ARCHI -- Body-Sensation Discovery & Four-Component Learning task:
    // a session saved before this task existed has none of these four
    // fields at all -- the true "no suggestions cached yet / nothing
    // discovered yet" default, same ?? convention as every field above.
    suggestedBodySensations: parsed.suggestedBodySensations ?? [],
    bodySensationUsageId: parsed.bodySensationUsageId ?? null,
    sensationEffectivenessRating: parsed.sensationEffectivenessRating ?? null,
    readinessImprovedAfterSensation: parsed.readinessImprovedAfterSensation ?? null,
    // ARCHI -- Universal ARC Routing, Emotion Identification & Android
    // Shortcuts task, requirement 2/9: backfills the four new fields --
    // the true "never chosen"/"not Task-LIVE-triggered" default for a
    // session saved before this task existed, same ?? convention as
    // every field above. A session resumed mid-flight with these
    // defaulted to false still renders and advances correctly (see
    // migrateLegacyNewArcLiveStep's own reality_acceptance/mode-A
    // migration below for the one case that needs an explicit step
    // move, not just a field default).
    selectedCognitiveThought: parsed.selectedCognitiveThought ?? false,
    selectedCognitiveInterpretation: parsed.selectedCognitiveInterpretation ?? false,
    selectedCognitiveUrge: parsed.selectedCognitiveUrge ?? false,
    isActiveTaskLiveOrigin: parsed.isActiveTaskLiveOrigin ?? false,
    // ARCHI -- Unified Final Specification task, section 1: the true
    // "not started via the combined 'מחשבה / דחף' shortcut" default for
    // a session saved before this field existed -- same ?? convention
    // as every field above; such a session's own emotion-step
    // reachability is completely unaffected either way. (The field's
    // earlier name, urgeShortcutPreset, was introduced so recently in
    // this same codebase that no persisted session under that old name
    // needs a migration path here -- a plain rename, not a shim.)
    skipEmotionSelection: parsed.skipEmotionSelection ?? false,
    // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task: a
    // session saved before this step existed, or one that never
    // reached it (e.g. "shortened," which never does), simply has no
    // ratings/outcome of its own -- isStepReachable/DIRECT_ACTION_
    // SKIPPED_STEPS both already treat null actionReadinessOutcome as
    // "no decision made," so every existing session continues exactly
    // as before.
    unpleasantIntensityRating: parsed.unpleasantIntensityRating ?? null,
    actionReadinessRating: parsed.actionReadinessRating ?? null,
    actionReadinessOutcome: parsed.actionReadinessOutcome ?? null,
    // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
    // Background task: the true "intro not yet shown" default for a
    // session saved before this task existed -- a session already
    // mid-flight past where "free_breathing" would have sat simply
    // never gets the persistent background for the rest of that one
    // run (no destructive migration, no replayed intro); a brand-new
    // session created after this task always walks through
    // "free_breathing" normally and sets this itself.
    freeBreathingIntroShown: parsed.freeBreathingIntroShown ?? false,
  };
  // ARC LIVE Body Scan and Protocol Restructuring task, section 9 /
  // Final ARC Flow & Body Animation task: a session persisted while
  // mid-flight on any now-removed step (supportive_sensation_select/
  // supportive_movement_select/unpleasant_area_question/
  // unpleasant_area_select/body_scan_heaviness/desired_feeling_locate)
  // forward-migrates here, once, to the nearest still-active step --
  // every other session passes through this call completely unchanged.
  // See migrateLegacyNewArcLiveStep's own doc comment for exactly which
  // step each one lands on.
  return migrateLegacyNewArcLiveStep(backfilled);
}

export async function saveNewArcLiveSession(session: NewArcLiveSessionState): Promise<void> {
  await AsyncStorage.setItem(NEW_ARC_LIVE_SESSION_KEY, JSON.stringify(session));
}

export async function clearNewArcLiveSession(): Promise<void> {
  await AsyncStorage.removeItem(NEW_ARC_LIVE_SESSION_KEY);
}

/**
 * Nine Functional Improvements task, Improvement 3 ("Internal Action"
 * timer -- the emotional_action step's own meditation/tai-chi/
 * relaxation/breathing choice): a single-slot store for the ONE
 * in-flight internal-action timer, reusing arc/taskTimer.ts's own
 * TaskTimerRun type and PURE pause/resume math exactly as-is (never a
 * duplicated second implementation of that math) but under its OWN,
 * separate key -- deliberately never TASK_TIMER_RUN_KEY itself, so
 * starting this timer can never silently clobber (or be clobbered by) a
 * real Task's own in-flight TaskTimerRun, and deliberately never
 * TIMER_RUN_KEY's 7-kind ARC-internal union either (that type has no
 * pause/resume at all -- see arc/taskTimer.ts's own module doc for why
 * ARC's other internal timers never needed it, unlike this one).
 * `taskId` on the stored run is this session's own arc/newArcLiveTypes.ts
 * taskId (or its STANDALONE_ARC_TASK_ID sentinel for a standalone
 * session) purely for consistency with the shared TaskTimerRun shape --
 * nothing here ever reads it to resolve a real Task.
 */
const INTERNAL_ACTION_TIMER_RUN_KEY = "archi.internalActionTimerRun.v1";

export async function loadInternalActionTimerRun(): Promise<TaskTimerRun | null> {
  const raw = await AsyncStorage.getItem(INTERNAL_ACTION_TIMER_RUN_KEY);
  return raw ? (JSON.parse(raw) as TaskTimerRun) : null;
}

export async function saveInternalActionTimerRun(run: TaskTimerRun): Promise<void> {
  await AsyncStorage.setItem(INTERNAL_ACTION_TIMER_RUN_KEY, JSON.stringify(run));
}

export async function clearInternalActionTimerRun(): Promise<void> {
  await AsyncStorage.removeItem(INTERNAL_ACTION_TIMER_RUN_KEY);
}

/** Single-slot read, same shape/guarantees as loadNewArcLiveSession -- null when no Manifest run is currently in progress. */
export async function loadManifestRunState(): Promise<ManifestRunState | null> {
  const raw = await AsyncStorage.getItem(MANIFEST_RUN_STATE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as ManifestRunState;
}

export async function saveManifestRunState(state: ManifestRunState): Promise<void> {
  await AsyncStorage.setItem(MANIFEST_RUN_STATE_KEY, JSON.stringify(state));
}

export async function clearManifestRunState(): Promise<void> {
  await AsyncStorage.removeItem(MANIFEST_RUN_STATE_KEY);
}

/** Exact mirror of loadRoutineOccurrenceCompletions -- defensive parse, empty list on anything unexpected, never a crash. */
export async function loadTaskOccurrenceCompletions(): Promise<TaskOccurrenceCompletion[]> {
  const raw = await AsyncStorage.getItem(TASK_OCCURRENCE_COMPLETIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TaskOccurrenceCompletion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored Task occurrence completions are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Records one occurrence as done -- never removes or rewrites any earlier entry, exactly mirroring appendRoutineOccurrenceCompletion's own guarantees. */
export async function appendTaskOccurrenceCompletion(entry: TaskOccurrenceCompletion): Promise<void> {
  const existing = await loadTaskOccurrenceCompletions();
  existing.push(entry);
  await AsyncStorage.setItem(TASK_OCCURRENCE_COMPLETIONS_KEY, JSON.stringify(existing));
}

/**
 * Fixed Weekly Routine task: the FULL list -- read-modify-write, same
 * convention as saveTasks. The one caller that needs this (as opposed
 * to appendTaskOccurrenceCompletion's own add-only path) is the Weekly
 * Routine screen's own "reset this week's completions" action
 * (arc/weeklyRoutine.ts's resetWeekCompletions), which must be able to
 * REMOVE entries -- never possible through append alone.
 */
export async function saveTaskOccurrenceCompletions(completions: TaskOccurrenceCompletion[]): Promise<void> {
  await AsyncStorage.setItem(TASK_OCCURRENCE_COMPLETIONS_KEY, JSON.stringify(completions));
}

/** Exact mirror of loadTaskOccurrenceCompletions -- defensive parse, empty list on anything unexpected, never a crash. */
export async function loadTaskOccurrenceOverrides(): Promise<TaskOccurrenceOverride[]> {
  const raw = await AsyncStorage.getItem(TASK_OCCURRENCE_OVERRIDES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TaskOccurrenceOverride[];
    if (!Array.isArray(parsed)) return [];
    // Weekly & Daily Routine Redesign task: backfills timeIsManual for an
    // override saved before this field existed -- every one of those WAS
    // an explicit trainee edit (there was no auto-scheduler yet to have
    // written it instead), so it backfills to `true`, never invented as
    // `false` (which would wrongly let the auto-scheduler move a time the
    // trainee actually fixed on purpose).
    return parsed.map((entry) => ({ ...entry, timeIsManual: entry.timeIsManual ?? true }));
  } catch (error) {
    console.warn("[storage] Stored Task occurrence overrides are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write via arc/taskOccurrenceOverride.ts's own upsertTaskOccurrenceOverride, same convention as saveTasks. */
export async function saveTaskOccurrenceOverrides(overrides: TaskOccurrenceOverride[]): Promise<void> {
  await AsyncStorage.setItem(TASK_OCCURRENCE_OVERRIDES_KEY, JSON.stringify(overrides));
}

/** Create/replace one date's override -- read-modify-write via upsertTaskOccurrenceOverride, so a second edit to the same (taskId, date) replaces the first rather than accumulating. */
export async function upsertTaskOccurrenceOverrideEntry(entry: TaskOccurrenceOverride): Promise<void> {
  const existing = await loadTaskOccurrenceOverrides();
  await saveTaskOccurrenceOverrides(upsertTaskOccurrenceOverride(existing, entry));
}

/** The permanent, per-weekday continuous/spaced settings -- {} (every weekday falls back to continuous via resolveWeekdayScheduleMode) when never configured. Defensive parse, same convention as every other list/map read in this file. */
export async function loadWeeklyScheduleModeSettings(): Promise<Record<number, WeeklyScheduleMode>> {
  const raw = await AsyncStorage.getItem(WEEKLY_SCHEDULE_MODE_SETTINGS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<number, WeeklyScheduleMode>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("[storage] Stored weekly schedule mode settings are not valid JSON -- treating as none rather than crashing.", error);
    return {};
  }
}

/** Always the FULL map -- callers read-modify-write via arc/weeklyScheduleMode.ts's own setWeekdayScheduleMode. */
export async function saveWeeklyScheduleModeSettings(settings: Record<number, WeeklyScheduleMode>): Promise<void> {
  await AsyncStorage.setItem(WEEKLY_SCHEDULE_MODE_SETTINGS_KEY, JSON.stringify(settings));
}

/** Exact mirror of loadTaskOccurrenceOverrides -- defensive parse, empty list on anything unexpected, never a crash. */
export async function loadDailyScheduleModeOverrides(): Promise<DailyScheduleModeOverride[]> {
  const raw = await AsyncStorage.getItem(DAILY_SCHEDULE_MODE_OVERRIDES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DailyScheduleModeOverride[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored daily schedule mode overrides are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write via arc/weeklyScheduleMode.ts's own upsertDailyScheduleModeOverride/resetWeekScheduleModeOverrides. */
export async function saveDailyScheduleModeOverrides(overrides: DailyScheduleModeOverride[]): Promise<void> {
  await AsyncStorage.setItem(DAILY_SCHEDULE_MODE_OVERRIDES_KEY, JSON.stringify(overrides));
}

/** Create/replace one date's mode override -- read-modify-write via upsertDailyScheduleModeOverride, so a second edit to the same date replaces the first rather than accumulating. */
export async function upsertDailyScheduleModeOverrideEntry(entry: DailyScheduleModeOverride): Promise<void> {
  const existing = await loadDailyScheduleModeOverrides();
  await saveDailyScheduleModeOverrides(upsertDailyScheduleModeOverride(existing, entry));
}

/** Exact mirror of loadTaskOccurrenceCompletions -- defensive parse, empty list on anything unexpected, never a crash. */
export async function loadReviewLaterFactors(): Promise<ReviewLaterFactor[]> {
  const raw = await AsyncStorage.getItem(REVIEW_LATER_FACTORS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ReviewLaterFactor[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored review-later factors are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Append-only -- a captured factor is permanent history until a later coaching/BUILD review stage explicitly removes or converts it; nothing in this stage does either. */
export async function appendReviewLaterFactor(entry: ReviewLaterFactor): Promise<void> {
  const existing = await loadReviewLaterFactors();
  existing.push(entry);
  await AsyncStorage.setItem(REVIEW_LATER_FACTORS_KEY, JSON.stringify(existing));
}

/** Exact mirror of loadReviewLaterFactors -- defensive parse, empty list on anything unexpected, never a crash. */
export async function loadCoachingWorkspaceEntries(): Promise<CoachingWorkspaceEntry[]> {
  const raw = await AsyncStorage.getItem(COACHING_WORKSPACE_ENTRIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CoachingWorkspaceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored coaching workspace entries are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Create or update -- upserts by id (one entry per coaching session), see arc/coachingWorkspace.ts's upsertCoachingWorkspaceEntryInList. */
export async function upsertCoachingWorkspaceEntry(entry: CoachingWorkspaceEntry): Promise<void> {
  const entries = await loadCoachingWorkspaceEntries();
  await AsyncStorage.setItem(COACHING_WORKSPACE_ENTRIES_KEY, JSON.stringify(upsertCoachingWorkspaceEntryInList(entries, entry)));
}

/** False for a trainee who has never seen the explanation yet (including a missing key, the common case) -- never throws, so a storage read failure fails toward SHOWING the explanation again rather than silently skipping it. */
export async function hasSeenNotificationExplanation(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NOTIFICATION_EXPLANATION_SEEN_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function markNotificationExplanationSeen(): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_EXPLANATION_SEEN_KEY, "true");
}

/**
 * Psychology/Smiling/Positive-Reinforcement task, feature 1: which
 * psychology fact was shown on the MOST RECENT app launch -- null
 * before the very first launch. arc/psychologyFacts.ts's own
 * resolveNextPsychologyFactIndex(lastFactIndex) decides the next one
 * to show; this is the one place that index is persisted so it
 * survives app restarts.
 */
export interface PsychologyFactProgress {
  lastFactIndex: number | null;
}

const PSYCHOLOGY_FACT_PROGRESS_KEY = "archi.psychologyFactProgress.v1";
const DEFAULT_PSYCHOLOGY_FACT_PROGRESS: PsychologyFactProgress = { lastFactIndex: null };

export async function loadPsychologyFactProgress(): Promise<PsychologyFactProgress> {
  try {
    const raw = await AsyncStorage.getItem(PSYCHOLOGY_FACT_PROGRESS_KEY);
    return raw ? { ...DEFAULT_PSYCHOLOGY_FACT_PROGRESS, ...(JSON.parse(raw) as Partial<PsychologyFactProgress>) } : DEFAULT_PSYCHOLOGY_FACT_PROGRESS;
  } catch {
    return DEFAULT_PSYCHOLOGY_FACT_PROGRESS;
  }
}

export async function savePsychologyFactProgress(progress: PsychologyFactProgress): Promise<void> {
  await AsyncStorage.setItem(PSYCHOLOGY_FACT_PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Unified ARC & Productivity Update task, requirement 1 ("if ARC is
 * interrupted, retain its progress and the pending morning step"):
 * persisted (unlike live/DailyStartupSequenceOverlay.tsx's own
 * in-memory `awaitingCheckInReturn`, which is lost on a process
 * restart) so that choosing Full/Shortened ARC from the morning
 * check-in survives the OS killing the app mid-session. Set true the
 * instant the trainee picks Full/Shortened ARC from "checkin" --
 * BEFORE navigating away -- and cleared only once the morning
 * sequence has actually resumed into "fact" afterward. A later cold
 * start's mount effect reads this to tell "an active session right
 * now is the morning check-in's own ARC pathway, still in progress"
 * apart from "an active session right now is something unrelated
 * (e.g. a scheduled task's own ARC entry) that must not be treated as
 * part of the morning sequence at all" -- the exact ambiguity that
 * otherwise collapses "no session yet" and "session genuinely
 * finished" into the same signal.
 */
export interface MorningFlowCheckInState {
  awaitingArcCompletion: boolean;
}

const MORNING_FLOW_CHECK_IN_STATE_KEY = "archi.morningFlowCheckInState.v1";
const DEFAULT_MORNING_FLOW_CHECK_IN_STATE: MorningFlowCheckInState = { awaitingArcCompletion: false };

export async function loadMorningFlowCheckInState(): Promise<MorningFlowCheckInState> {
  try {
    const raw = await AsyncStorage.getItem(MORNING_FLOW_CHECK_IN_STATE_KEY);
    return raw ? { ...DEFAULT_MORNING_FLOW_CHECK_IN_STATE, ...(JSON.parse(raw) as Partial<MorningFlowCheckInState>) } : DEFAULT_MORNING_FLOW_CHECK_IN_STATE;
  } catch {
    return DEFAULT_MORNING_FLOW_CHECK_IN_STATE;
  }
}

export async function saveMorningFlowCheckInState(state: MorningFlowCheckInState): Promise<void> {
  await AsyncStorage.setItem(MORNING_FLOW_CHECK_IN_STATE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Manifest Upgrade task: PurposeManifest (arc/purposeManifest.ts) -- a
// brand-new, independent collection, never read/written by
// ManifestProfile (Task's own guided-run setup) or LifeManifest (the
// Major Goal/Sub-goal/Target hierarchy). See that module's own doc for
// why this is deliberately a THIRD, distinct "manifest" concept.
// ---------------------------------------------------------------------------

const PURPOSE_MANIFESTS_KEY = "archi.purposeManifests.v1";
const PURPOSE_MANIFEST_ROTATION_KEY = "archi.purposeManifestRotation.v1";
const PURPOSE_MANIFEST_DAILY_SELECTION_KEY = "archi.purposeManifestDailySelection.v1";
const DAILY_STARTUP_SEQUENCE_STATE_KEY = "archi.dailyStartupSequenceState.v1";

/**
 * Final Manifest & Startup Popup Updates task: every manifest is run
 * through normalizePurposeManifest -- a record saved before
 * futureMantra/focusPointColor/futureBodyMovement existed must still
 * load without crashing, with those fields simply defaulted to "" (see
 * that function's own doc in arc/purposeManifest.ts). Never a
 * destructive migration/rewrite of storage -- this only shapes what is
 * returned to the caller in memory.
 */
export async function loadPurposeManifests(): Promise<PurposeManifest[]> {
  const raw = await AsyncStorage.getItem(PURPOSE_MANIFESTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PurposeManifest[];
    return Array.isArray(parsed) ? parsed.map(normalizePurposeManifest) : [];
  } catch (error) {
    console.warn("[storage] Stored PurposeManifests are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function savePurposeManifests(manifests: PurposeManifest[]): Promise<void> {
  await AsyncStorage.setItem(PURPOSE_MANIFESTS_KEY, JSON.stringify(manifests));
}

/** Create or update -- upserts by id, see arc/purposeManifest.ts's own upsertPurposeManifestInList. Never overwrites any OTHER manifest. */
export async function upsertPurposeManifest(manifest: PurposeManifest): Promise<void> {
  const manifests = await loadPurposeManifests();
  await savePurposeManifests(upsertPurposeManifestInList(manifests, manifest));
}

export async function loadPurposeManifestRotation(): Promise<PurposeManifestRotationState> {
  const raw = await AsyncStorage.getItem(PURPOSE_MANIFEST_ROTATION_KEY);
  if (!raw) return emptyPurposeManifestRotationState();
  try {
    return { ...emptyPurposeManifestRotationState(), ...(JSON.parse(raw) as Partial<PurposeManifestRotationState>) };
  } catch {
    return emptyPurposeManifestRotationState();
  }
}

export async function savePurposeManifestRotation(rotation: PurposeManifestRotationState): Promise<void> {
  await AsyncStorage.setItem(PURPOSE_MANIFEST_ROTATION_KEY, JSON.stringify(rotation));
}

/** null means no selection has ever been made (or storage was cleared) -- the caller (data/purposeManifest.ts's resolveTodaysManifestSelection) treats that exactly like a stale/yesterday selection. */
export async function loadDailyManifestSelection(): Promise<DailyManifestSelection | null> {
  const raw = await AsyncStorage.getItem(PURPOSE_MANIFEST_DAILY_SELECTION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DailyManifestSelection;
  } catch {
    return null;
  }
}

export async function saveDailyManifestSelection(selection: DailyManifestSelection): Promise<void> {
  await AsyncStorage.setItem(PURPOSE_MANIFEST_DAILY_SELECTION_KEY, JSON.stringify(selection));
}

export async function loadDailyStartupSequenceState(): Promise<DailyStartupSequenceState> {
  const raw = await AsyncStorage.getItem(DAILY_STARTUP_SEQUENCE_STATE_KEY);
  if (!raw) return emptyDailyStartupSequenceState();
  try {
    return { ...emptyDailyStartupSequenceState(), ...(JSON.parse(raw) as Partial<DailyStartupSequenceState>) };
  } catch {
    return emptyDailyStartupSequenceState();
  }
}

export async function saveDailyStartupSequenceState(state: DailyStartupSequenceState): Promise<void> {
  await AsyncStorage.setItem(DAILY_STARTUP_SEQUENCE_STATE_KEY, JSON.stringify(state));
}

// ---------------------------------------------------------------------------
// Manifest Goals & Automatic Task Scheduling task: ManifestGoal
// (arc/manifestGoals.ts) -- a brand-new, lightweight collection. The
// TASKS under a goal are never stored here as a second copy; they are
// ordinary Tasks in TASKS_KEY above, linked back via their own
// purposeManifestId/purposeManifestGoalId fields. See data/manifestGoals.ts
// for the goal/task orchestration logic built on top of these primitives.
// ---------------------------------------------------------------------------

const MANIFEST_GOALS_KEY = "archi.manifestGoals.v1";

export async function loadManifestGoals(): Promise<ManifestGoal[]> {
  const raw = await AsyncStorage.getItem(MANIFEST_GOALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ManifestGoal[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ManifestGoals are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveManifestGoals(goals: ManifestGoal[]): Promise<void> {
  await AsyncStorage.setItem(MANIFEST_GOALS_KEY, JSON.stringify(goals));
}

/** Create or update -- upserts by id, see arc/manifestGoals.ts's own upsertManifestGoalInList. */
export async function upsertManifestGoal(goal: ManifestGoal): Promise<void> {
  const goals = await loadManifestGoals();
  await saveManifestGoals(upsertManifestGoalInList(goals, goal));
}

// ---------------------------------------------------------------------------
// Daily Visualization, Body Awareness & Morning Preparation task:
// arc/dailyVisualization.ts's DailyVisualizationProfile (cross-day) and
// DailyVisualizationDailyProgress (one record, reset every local day) --
// a brand-new, independent feature. The alarm's own single-slot
// notification state is kept here too, same convention as every other
// single-slot alarm-tracking field in this file.
// ---------------------------------------------------------------------------

const DAILY_VISUALIZATION_PROFILE_KEY = "archi.dailyVisualizationProfile.v1";
const DAILY_VISUALIZATION_PROGRESS_KEY = "archi.dailyVisualizationProgress.v1";
const DAILY_VISUALIZATION_ALARM_STATE_KEY = "archi.dailyVisualizationAlarmState.v1";

export async function loadDailyVisualizationProfile(): Promise<DailyVisualizationProfile | null> {
  const raw = await AsyncStorage.getItem(DAILY_VISUALIZATION_PROFILE_KEY);
  if (!raw) return null;
  try {
    return normalizeDailyVisualizationProfile(JSON.parse(raw) as DailyVisualizationProfile);
  } catch (error) {
    console.warn("[storage] Stored DailyVisualizationProfile is not valid JSON -- treating as never set rather than crashing.", error);
    return null;
  }
}

export async function saveDailyVisualizationProfile(profile: DailyVisualizationProfile): Promise<void> {
  await AsyncStorage.setItem(DAILY_VISUALIZATION_PROFILE_KEY, JSON.stringify(profile));
}

/** null means no record at all exists yet for ANY day -- every caller checks the record's own dateLocal against today before treating it as relevant (arc/dailyVisualization.ts's isDailyVisualizationDoneForToday/resolveResumableProgress), never assumed here. */
export async function loadDailyVisualizationDailyProgress(): Promise<DailyVisualizationDailyProgress | null> {
  const raw = await AsyncStorage.getItem(DAILY_VISUALIZATION_PROGRESS_KEY);
  if (!raw) return null;
  try {
    return normalizeDailyVisualizationDailyProgress(JSON.parse(raw) as DailyVisualizationDailyProgress);
  } catch (error) {
    console.warn("[storage] Stored DailyVisualizationDailyProgress is not valid JSON -- treating as not-yet-started rather than crashing.", error);
    return null;
  }
}

export async function saveDailyVisualizationDailyProgress(progress: DailyVisualizationDailyProgress): Promise<void> {
  await AsyncStorage.setItem(DAILY_VISUALIZATION_PROGRESS_KEY, JSON.stringify(progress));
}

export interface DailyVisualizationAlarmState {
  notificationId: string | null;
  scheduledFor: string | null;
}

function emptyDailyVisualizationAlarmState(): DailyVisualizationAlarmState {
  return { notificationId: null, scheduledFor: null };
}

export async function loadDailyVisualizationAlarmState(): Promise<DailyVisualizationAlarmState> {
  const raw = await AsyncStorage.getItem(DAILY_VISUALIZATION_ALARM_STATE_KEY);
  if (!raw) return emptyDailyVisualizationAlarmState();
  try {
    return { ...emptyDailyVisualizationAlarmState(), ...(JSON.parse(raw) as Partial<DailyVisualizationAlarmState>) };
  } catch {
    return emptyDailyVisualizationAlarmState();
  }
}

export async function saveDailyVisualizationAlarmState(state: DailyVisualizationAlarmState): Promise<void> {
  await AsyncStorage.setItem(DAILY_VISUALIZATION_ALARM_STATE_KEY, JSON.stringify(state));
}

/**
 * Psychology/Smiling/Positive-Reinforcement task, feature 4: which
 * positive-imagery prompt was shown after the MOST RECENT completed
 * task -- null before the first one. Mirrors PsychologyFactProgress
 * exactly, for the separate rotation in arc/positiveImagery.ts.
 */
export interface PositiveImageryProgress {
  lastImageryIndex: number | null;
}

const POSITIVE_IMAGERY_PROGRESS_KEY = "archi.positiveImageryProgress.v1";
const DEFAULT_POSITIVE_IMAGERY_PROGRESS: PositiveImageryProgress = { lastImageryIndex: null };

export async function loadPositiveImageryProgress(): Promise<PositiveImageryProgress> {
  try {
    const raw = await AsyncStorage.getItem(POSITIVE_IMAGERY_PROGRESS_KEY);
    return raw ? { ...DEFAULT_POSITIVE_IMAGERY_PROGRESS, ...(JSON.parse(raw) as Partial<PositiveImageryProgress>) } : DEFAULT_POSITIVE_IMAGERY_PROGRESS;
  } catch {
    return DEFAULT_POSITIVE_IMAGERY_PROGRESS;
  }
}

export async function savePositiveImageryProgress(progress: PositiveImageryProgress): Promise<void> {
  await AsyncStorage.setItem(POSITIVE_IMAGERY_PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Psychology/Smiling/Positive-Reinforcement task, features 2+3: the
 * single persisted record behind arc/postTaskRewards.ts's own
 * PostTaskRewardsState -- see that module's doc for the full shape and
 * the rules governing it. Missing/corrupt storage falls back to a
 * fresh state anchored on TODAY (never an invented past anchor date),
 * exactly like every other load function in this file. A record saved
 * under the pre-"Smile & Grow" points-based shape is migrated via
 * arc/postTaskRewards.ts's own migratePostTaskRewardsState before
 * being returned, so a trainee's already-earned smiles are never lost
 * just because the points system was later removed.
 */
const POST_TASK_REWARDS_STATE_KEY = "archi.postTaskRewardsState.v1";

export async function loadPostTaskRewardsState(): Promise<PostTaskRewardsState | null> {
  try {
    const raw = await AsyncStorage.getItem(POST_TASK_REWARDS_STATE_KEY);
    if (!raw) return null;
    return migratePostTaskRewardsState(JSON.parse(raw)) as PostTaskRewardsState;
  } catch {
    return null;
  }
}

export async function savePostTaskRewardsState(state: PostTaskRewardsState): Promise<void> {
  await AsyncStorage.setItem(POST_TASK_REWARDS_STATE_KEY, JSON.stringify(state));
}

/**
 * ARC-system upgrade task, Part E: append-only, exact mirror of
 * loadReviewLaterFactors/appendReviewLaterFactor. No update/delete
 * function exists on purpose -- a captured insight is permanent history,
 * never edited or removed just because a later belief was formulated
 * from it (spec rule: editing a planned belief never changes the
 * original experience retroactively).
 */
export async function loadArcInsights(): Promise<ArcInsight[]> {
  const raw = await AsyncStorage.getItem(ARC_INSIGHTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcInsight[];
    // Insight Collection x ARC Learning linking task: backfills an insight
    // saved before arcLearningTopicIds existed -- never a crash, never an
    // invented link. ARC Writing & ARC Book task: backfills classification/
    // classificationNote the same way for an insight saved before they existed.
    return Array.isArray(parsed)
      ? parsed.map((insight) => ({
          ...insight,
          arcLearningTopicIds: Array.isArray(insight.arcLearningTopicIds) ? insight.arcLearningTopicIds : [],
          classification: insight.classification ?? null,
          classificationNote: insight.classificationNote ?? null,
        }))
      : [];
  } catch (error) {
    console.warn("[storage] Stored ARC insights are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function appendArcInsight(entry: ArcInsight): Promise<void> {
  const existing = await loadArcInsights();
  existing.push(entry);
  await AsyncStorage.setItem(ARC_INSIGHTS_KEY, JSON.stringify(existing));
}

/**
 * ARCHI -- Unified Development Specification task, Part 5 ("INSIGHT
 * COLLECTION"): replaces the entry with the SAME id, or appends a new
 * one -- never drops an existing row, never merges two different ids
 * into one. The one write path "view/edit/delete" and "link/unlink a
 * task" both funnel through (edit and link are both just field
 * updates on the SAME record), so appendArcInsight above stays the
 * one-shot "just captured this, never existed before" path and this
 * is everything afterward.
 */
export async function upsertArcInsight(insight: ArcInsight): Promise<void> {
  const existing = await loadArcInsights();
  const index = existing.findIndex((candidate) => candidate.id === insight.id);
  const next = index === -1 ? [...existing, insight] : existing.map((candidate) => (candidate.id === insight.id ? insight : candidate));
  await AsyncStorage.setItem(ARC_INSIGHTS_KEY, JSON.stringify(next));
}

/**
 * Part 5: "Delete it with confirmation" -- the confirmation itself is
 * the caller's own UI responsibility (a plain Alert, same convention
 * as every other destructive action in this app); this is only ever
 * called once that confirmation has already happened. Deleting an
 * insight never touches any task it was linked to -- "completing,
 * postponing, or deleting a linked task must not delete the original
 * insight" is the same guarantee in reverse: neither record's own
 * deletion ever cascades into the other.
 */
export async function deleteArcInsight(id: string): Promise<void> {
  const existing = await loadArcInsights();
  await AsyncStorage.setItem(ARC_INSIGHTS_KEY, JSON.stringify(existing.filter((candidate) => candidate.id !== id)));
}

/** Defensive parse, empty list on anything unexpected, never a crash -- exact mirror of loadCoachingWorkspaceEntries. */
export async function loadArcBeliefs(): Promise<ArcBelief[]> {
  const raw = await AsyncStorage.getItem(ARC_BELIEFS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcBelief[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ARC beliefs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Create or update -- upserts by id, never drops a different belief's own row (arc/arcInsightBelief.ts's upsertBeliefInList, spec rule 15: a new belief never deletes/overwrites an existing one). */
export async function upsertArcBelief(belief: ArcBelief): Promise<void> {
  const beliefs = await loadArcBeliefs();
  await AsyncStorage.setItem(ARC_BELIEFS_KEY, JSON.stringify(upsertBeliefInList(beliefs, belief)));
}

/** Defensive parse, empty list on anything unexpected, never a crash -- exact mirror of loadArcBeliefs. Every item is run through normalizePlannedArc (ARC alarm task) so a record saved before that feature existed still loads with its alarm fields safely defaulted, never crashing an unguarded reader. */
export async function loadPlannedArcs(): Promise<PlannedArc[]> {
  const raw = await AsyncStorage.getItem(PLANNED_ARCS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PlannedArc[];
    return Array.isArray(parsed) ? parsed.map(normalizePlannedArc) : [];
  } catch (error) {
    console.warn("[storage] Stored planned ARCs are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Create or update -- upserts by id (arc/plannedArc.ts's upsertPlannedArcInList). Editing a draft here never reaches back into the session it was generated from. */
export async function upsertPlannedArc(item: PlannedArc): Promise<void> {
  const items = await loadPlannedArcs();
  await AsyncStorage.setItem(PLANNED_ARCS_KEY, JSON.stringify(upsertPlannedArcInList(items, item)));
}

export async function deletePlannedArc(id: string): Promise<void> {
  const items = await loadPlannedArcs();
  await AsyncStorage.setItem(PLANNED_ARCS_KEY, JSON.stringify(deletePlannedArcFromList(items, id)));
}

/** ARC alarm task: always the FULL list -- callers read-modify-write, matching saveTasks/every other batched saveX function here. Used by data/taskAlarm.ts's reconcilePlannedArcAlarms so reconciling several items costs one write, not one per item. */
export async function savePlannedArcs(items: PlannedArc[]): Promise<void> {
  await AsyncStorage.setItem(PLANNED_ARCS_KEY, JSON.stringify(items));
}

/** Part I: null when no task is currently awaiting its post-action identity-insight prompt. */
export async function loadPendingIdentityInsightTaskId(): Promise<string | null> {
  return (await AsyncStorage.getItem(PENDING_IDENTITY_INSIGHT_KEY)) || null;
}

export async function savePendingIdentityInsightTaskId(taskId: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_IDENTITY_INSIGHT_KEY, taskId);
}

export async function clearPendingIdentityInsightTaskId(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_IDENTITY_INSIGHT_KEY);
}

// ---------------------------------------------------------------------------
// ARC GYM task: four new, additive collections -- situations, per-behavior
// obstacles, per-situation memory, and training history. Every one of them
// only ever REFERENCES an existing PurposeManifest/FutureBehavior by id
// (never copies or migrates that data), and none of this is read by any
// pre-existing screen -- see arc/arcGym.ts's own module doc for the full
// "reuse, never duplicate" rationale.
// ---------------------------------------------------------------------------

const ARC_GYM_SITUATIONS_KEY = "archi.arcGymSituations.v1";
const ARC_GYM_BEHAVIOR_OBSTACLES_KEY = "archi.arcGymBehaviorObstacles.v1";
const ARC_GYM_MEMORIES_KEY = "archi.arcGymMemories.v1";
const ARC_GYM_TRAINING_RECORDS_KEY = "archi.arcGymTrainingRecords.v1";

export async function loadArcGymSituations(): Promise<ArcGymSituation[]> {
  const raw = await AsyncStorage.getItem(ARC_GYM_SITUATIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGymSituation[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcGymSituation) : [];
  } catch (error) {
    console.warn("[storage] Stored ArcGymSituations are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcGymSituations(situations: ArcGymSituation[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_SITUATIONS_KEY, JSON.stringify(situations));
}

export async function upsertArcGymSituationEntry(situation: ArcGymSituation): Promise<void> {
  const situations = await loadArcGymSituations();
  await saveArcGymSituations(upsertArcGymSituationInList(situations, situation));
}

export async function loadArcGymBehaviorObstacles(): Promise<ArcGymBehaviorObstacles[]> {
  const raw = await AsyncStorage.getItem(ARC_GYM_BEHAVIOR_OBSTACLES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGymBehaviorObstacles[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcGymBehaviorObstacles are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcGymBehaviorObstacles(records: ArcGymBehaviorObstacles[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_BEHAVIOR_OBSTACLES_KEY, JSON.stringify(records));
}

export async function upsertArcGymBehaviorObstaclesEntry(record: ArcGymBehaviorObstacles): Promise<void> {
  const records = await loadArcGymBehaviorObstacles();
  await saveArcGymBehaviorObstacles(upsertArcGymBehaviorObstaclesInList(records, record));
}

/**
 * Privacy requirement (section 13): thoughts and body-sensation history
 * are sensitive -- this collection, like every other AsyncStorage
 * collection in this app, is local-device-only, never sent to any
 * notification/logging surface. No code anywhere reads ArcGymMemory
 * for a notification body or a console log beyond the same best-effort
 * JSON-parse-failure warning every other collection here already uses
 * (which never includes the record's own content, only the fact that
 * parsing failed).
 */
export async function loadArcGymMemories(): Promise<ArcGymMemory[]> {
  const raw = await AsyncStorage.getItem(ARC_GYM_MEMORIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGymMemory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcGymMemories are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveArcGymMemories(memories: ArcGymMemory[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_MEMORIES_KEY, JSON.stringify(memories));
}

export async function upsertArcGymMemoryEntry(memory: ArcGymMemory): Promise<void> {
  const memories = await loadArcGymMemories();
  await saveArcGymMemories(upsertArcGymMemoryInList(memories, memory));
}

export async function loadArcGymTrainingRecords(): Promise<ArcGymTrainingRecord[]> {
  const raw = await AsyncStorage.getItem(ARC_GYM_TRAINING_RECORDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGymTrainingRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcGymTrainingRecords are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveArcGymTrainingRecords(records: ArcGymTrainingRecord[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_TRAINING_RECORDS_KEY, JSON.stringify(records));
}

export async function upsertArcGymTrainingRecordEntry(record: ArcGymTrainingRecord): Promise<void> {
  const records = await loadArcGymTrainingRecords();
  await saveArcGymTrainingRecords(upsertArcGymTrainingRecordInList(records, record));
}

const ARC_GYM_MEMORY_EXERCISES_KEY = "archi.arcGymMemoryExercises.v1";

/**
 * ARCHI -- Unified Development Specification task, Part 1: storage for
 * the NEW ArcGymMemoryExercise type -- its own key, entirely separate
 * from ARC_GYM_SITUATIONS_KEY/ARC_GYM_MEMORIES_KEY above, since it is
 * a second, independent ARC GYM exercise type, never a variant of the
 * Behaviour exercise's own situations.
 */
export async function loadArcGymMemoryExercises(): Promise<ArcGymMemoryExercise[]> {
  const raw = await AsyncStorage.getItem(ARC_GYM_MEMORY_EXERCISES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGymMemoryExercise[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcGymMemoryExercise) : [];
  } catch {
    console.warn("[storage] Stored ArcGymMemoryExercises are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveArcGymMemoryExercises(exercises: ArcGymMemoryExercise[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_MEMORY_EXERCISES_KEY, JSON.stringify(exercises));
}

export async function upsertArcGymMemoryExerciseEntry(exercise: ArcGymMemoryExercise): Promise<void> {
  const exercises = await loadArcGymMemoryExercises();
  await saveArcGymMemoryExercises(upsertArcGymMemoryExerciseInList(exercises, exercise));
}

export async function deleteArcGymMemoryExerciseEntry(id: string): Promise<void> {
  const exercises = await loadArcGymMemoryExercises();
  await saveArcGymMemoryExercises(exercises.filter((exercise) => exercise.id !== id));
}

const ARC_RESULT_EXERCISES_KEY = "archi.arcResultExercises.v1";

/**
 * ARCHI -- ARC Result: Automatic, Optional Suggestion Without Extra
 * Shortcuts task: storage for the NEW ArcResultExercise type -- its
 * own key, entirely separate from the Behaviour/Memory exercise keys
 * above, since it is a third, independent ARC GYM exercise type.
 */
export async function loadArcResultExercises(): Promise<ArcResultExercise[]> {
  const raw = await AsyncStorage.getItem(ARC_RESULT_EXERCISES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcResultExercise[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcResultExercise) : [];
  } catch {
    console.warn("[storage] Stored ArcResultExercises are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveArcResultExercises(exercises: ArcResultExercise[]): Promise<void> {
  await AsyncStorage.setItem(ARC_RESULT_EXERCISES_KEY, JSON.stringify(exercises));
}

export async function upsertArcResultExerciseEntry(exercise: ArcResultExercise): Promise<void> {
  const exercises = await loadArcResultExercises();
  await saveArcResultExercises(upsertArcResultExerciseInList(exercises, exercise));
}

export async function deleteArcResultExerciseEntry(id: string): Promise<void> {
  const exercises = await loadArcResultExercises();
  await saveArcResultExercises(exercises.filter((exercise) => exercise.id !== id));
}

const ARC_GYM_REMINDERS_KEY = "archi.arcGymReminders.v1";

/**
 * ARCHI -- Unified Development Specification task, Part 2: storage for
 * ArcGymReminder -- any number of independent reminders, for either
 * ARC GYM exercise type, each with its own notificationId (never
 * PendingReminder's one-per-kind model, same reasoning as
 * data/arcGoalTargetReminders.ts's own module doc).
 */
export async function loadArcGymReminders(): Promise<ArcGymReminder[]> {
  const raw = await AsyncStorage.getItem(ARC_GYM_REMINDERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGymReminder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcGymReminders are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveArcGymReminders(reminders: ArcGymReminder[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_REMINDERS_KEY, JSON.stringify(reminders));
}

export async function upsertArcGymReminderEntry(reminder: ArcGymReminder): Promise<void> {
  const reminders = await loadArcGymReminders();
  await saveArcGymReminders(upsertArcGymReminderInList(reminders, reminder));
}

export async function deleteArcGymReminderEntry(id: string): Promise<void> {
  const reminders = await loadArcGymReminders();
  await saveArcGymReminders(reminders.filter((reminder) => reminder.id !== id));
}

// ---------------------------------------------------------------------------
// ARC Focus task: a fourth, independent ARC GYM exercise type -- its own
// keys, entirely separate from the Behaviour/Memory/Result keys above.
// Reuses the real Task/weekly-routine/daily-plan/taskOccurrenceOverride
// machinery for scheduling (no calendar/record of its own here); these
// three collections are only the exercise's own settings, in-progress
// session, and completed-session history. See arc/arcFocusSession.ts's
// own module doc for the "reuse, never duplicate" rationale.
// ---------------------------------------------------------------------------

const ARC_FOCUS_SETTINGS_KEY = "archi.arcFocusSettings.v1";

interface ArcFocusSettingsStore {
  default: ArcFocusSettings;
  byTaskId: Record<string, ArcFocusSettings>;
}

async function loadArcFocusSettingsStore(): Promise<ArcFocusSettingsStore> {
  const raw = await AsyncStorage.getItem(ARC_FOCUS_SETTINGS_KEY);
  if (!raw) return { default: createDefaultArcFocusSettings(), byTaskId: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<ArcFocusSettingsStore>;
    return {
      default: normalizeArcFocusSettings(parsed.default),
      byTaskId: parsed.byTaskId && typeof parsed.byTaskId === "object" ? parsed.byTaskId : {},
    };
  } catch {
    console.warn("[storage] Stored ArcFocusSettings are not valid JSON -- returning defaults rather than crashing.");
    return { default: createDefaultArcFocusSettings(), byTaskId: {} };
  }
}

async function saveArcFocusSettingsStore(store: ArcFocusSettingsStore): Promise<void> {
  await AsyncStorage.setItem(ARC_FOCUS_SETTINGS_KEY, JSON.stringify(store));
}

/** `taskId` omitted (or null) reads/writes the standalone "last used" default (quick-start from ARC GYM); a scheduled task's own id reads/writes that task's own override, settings read falling back to the default when that task has never customized its own. */
export async function loadArcFocusSettings(taskId?: string | null): Promise<ArcFocusSettings> {
  const store = await loadArcFocusSettingsStore();
  if (taskId && store.byTaskId[taskId]) return normalizeArcFocusSettings(store.byTaskId[taskId]);
  return store.default;
}

export async function saveArcFocusSettings(settings: ArcFocusSettings, taskId?: string | null): Promise<void> {
  const store = await loadArcFocusSettingsStore();
  if (taskId) {
    await saveArcFocusSettingsStore({ ...store, byTaskId: { ...store.byTaskId, [taskId]: settings } });
  } else {
    await saveArcFocusSettingsStore({ ...store, default: settings });
  }
}

const ARC_FOCUS_SESSION_KEY = "archi.arcFocusSession.v1";

/**
 * Single resumable slot, mirroring loadNewArcLiveSession's own
 * convention -- there is only ever one ARC Focus session in flight at a
 * time, surviving backgrounding/app-restart exactly like that session
 * and like arc/taskTimer.ts's own single-slot TaskTimerRun.
 */
export async function loadArcFocusSession(): Promise<ArcFocusSession | null> {
  const raw = await AsyncStorage.getItem(ARC_FOCUS_SESSION_KEY);
  if (!raw) return null;
  try {
    return migrateLegacyArcFocusSession(JSON.parse(raw), new Date().toISOString());
  } catch {
    console.warn("[storage] Stored ArcFocusSession is not valid JSON -- treating as no session in progress rather than crashing.");
    return null;
  }
}

export async function saveArcFocusSession(session: ArcFocusSession): Promise<void> {
  await AsyncStorage.setItem(ARC_FOCUS_SESSION_KEY, JSON.stringify(session));
}

/** Only ever called after a completed session's own summary record has already been durably saved (see buildArcFocusPracticeRecord) -- so a crash between "session completed" and "summary saved" resumes into the summary step itself, never silently dropping the result or double-saving it. */
export async function clearArcFocusSession(): Promise<void> {
  await AsyncStorage.removeItem(ARC_FOCUS_SESSION_KEY);
}

const ARC_FOCUS_PRACTICE_HISTORY_KEY = "archi.arcFocusPracticeHistory.v1";

/** Append-only completed-session summaries, for the summary/review screen. */
export async function loadArcFocusPracticeHistory(): Promise<ArcFocusPracticeRecord[]> {
  const raw = await AsyncStorage.getItem(ARC_FOCUS_PRACTICE_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcFocusPracticeRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcFocusPracticeHistory is not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

export async function saveArcFocusPracticeRecord(record: ArcFocusPracticeRecord): Promise<void> {
  const history = await loadArcFocusPracticeHistory();
  await AsyncStorage.setItem(ARC_FOCUS_PRACTICE_HISTORY_KEY, JSON.stringify([...history, record]));
}

// ---------------------------------------------------------------------------
// ARC Gym + ARC Goal Integration task: ArcGymGoal/ArcGymGoalObjective/
// ArcFocusExercise -- all brand-new keys, nothing pre-existing to
// backfill. ArcGymMemoryCheckInProgress is a single resumable slot,
// mirroring loadArcFocusSession's own convention above.
// ---------------------------------------------------------------------------

const ARC_GYM_GOALS_KEY = "archi.arcGymGoals.v1";

export async function loadArcGymGoals(): Promise<ArcGymGoal[]> {
  const raw = await AsyncStorage.getItem(ARC_GYM_GOALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGymGoal[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcGymGoals are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcGymGoals(goals: ArcGymGoal[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_GOALS_KEY, JSON.stringify(goals));
}

export async function upsertArcGymGoalEntry(goal: ArcGymGoal): Promise<void> {
  const goals = await loadArcGymGoals();
  await saveArcGymGoals(upsertArcGymGoalInList(goals, goal));
}

export async function deleteArcGymGoalEntry(id: string): Promise<void> {
  const goals = await loadArcGymGoals();
  await saveArcGymGoals(goals.filter((goal) => goal.id !== id));
}

const ARC_GYM_GOAL_OBJECTIVES_KEY = "archi.arcGymGoalObjectives.v1";

export async function loadArcGymGoalObjectives(): Promise<ArcGymGoalObjective[]> {
  const raw = await AsyncStorage.getItem(ARC_GYM_GOAL_OBJECTIVES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcGymGoalObjective[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcGymGoalObjectives are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Exported (not wrapped) so callers doing a bulk operation across one goal's objectives -- e.g. reorderArcGymGoalObjectives's own full-list return -- can save directly, same convention as saveManifestGoals above. */
export async function saveArcGymGoalObjectives(objectives: ArcGymGoalObjective[]): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_GOAL_OBJECTIVES_KEY, JSON.stringify(objectives));
}

export async function upsertArcGymGoalObjectiveEntry(objective: ArcGymGoalObjective): Promise<void> {
  const objectives = await loadArcGymGoalObjectives();
  await saveArcGymGoalObjectives(upsertArcGymGoalObjectiveInList(objectives, objective));
}

export async function deleteArcGymGoalObjectiveEntry(id: string): Promise<void> {
  const objectives = await loadArcGymGoalObjectives();
  await saveArcGymGoalObjectives(objectives.filter((objective) => objective.id !== id));
}

const ARC_FOCUS_EXERCISES_KEY = "archi.arcFocusExercises.v1";

export async function loadArcFocusExercises(): Promise<ArcFocusExercise[]> {
  const raw = await AsyncStorage.getItem(ARC_FOCUS_EXERCISES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcFocusExercise[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcFocusExercises are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcFocusExercises(exercises: ArcFocusExercise[]): Promise<void> {
  await AsyncStorage.setItem(ARC_FOCUS_EXERCISES_KEY, JSON.stringify(exercises));
}

export async function upsertArcFocusExerciseEntry(exercise: ArcFocusExercise): Promise<void> {
  const exercises = await loadArcFocusExercises();
  await saveArcFocusExercises(upsertArcFocusExerciseInList(exercises, exercise));
}

export async function deleteArcFocusExerciseEntry(id: string): Promise<void> {
  const exercises = await loadArcFocusExercises();
  await saveArcFocusExercises(exercises.filter((exercise) => exercise.id !== id));
}

const ARC_GYM_MEMORY_CHECK_IN_PROGRESS_KEY = "archi.arcGymMemoryCheckInProgress.v1";

/**
 * Single resumable slot, mirroring loadArcFocusSession's own convention --
 * at most one ARC Memory check-in resume is ever in flight. Written once
 * (live/NewArcLiveScreen.tsx's finishArcGymMemoryCheckIn, on actually
 * finishing the preliminary ARC) and consumed exactly once
 * (live/ArcGymMemoryVisualizationScreen.tsx, on focus) -- never touches
 * ArcGymMemory/ArcGymTrainingRecord, kept deliberately separate.
 */
export async function loadArcGymMemoryCheckInProgress(): Promise<ArcGymMemoryCheckInProgress | null> {
  const raw = await AsyncStorage.getItem(ARC_GYM_MEMORY_CHECK_IN_PROGRESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArcGymMemoryCheckInProgress;
  } catch {
    console.warn("[storage] Stored ArcGymMemoryCheckInProgress is not valid JSON -- treating as no resume in progress rather than crashing.");
    return null;
  }
}

export async function saveArcGymMemoryCheckInProgress(progress: ArcGymMemoryCheckInProgress): Promise<void> {
  await AsyncStorage.setItem(ARC_GYM_MEMORY_CHECK_IN_PROGRESS_KEY, JSON.stringify(progress));
}

export async function clearArcGymMemoryCheckInProgress(): Promise<void> {
  await AsyncStorage.removeItem(ARC_GYM_MEMORY_CHECK_IN_PROGRESS_KEY);
}

// ---------------------------------------------------------------------------
// ARC Decision -- "קבלת החלטות": single resumable in-progress slot (mirroring
// loadArcFocusSession's own convention -- at most one ARC Decision flow is
// ever in flight, whichever entry point started it) + an append-only history
// of completed sessions, for the data-retention checklist in arc/arcDecision.ts.
// ---------------------------------------------------------------------------

const ARC_DECISION_IN_PROGRESS_KEY = "archi.arcDecisionInProgress.v1";

export async function loadArcDecisionInProgress(): Promise<ArcDecisionSession | null> {
  const raw = await AsyncStorage.getItem(ARC_DECISION_IN_PROGRESS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ArcDecisionSession;
    // First-step task ("הבנת הסיטואציה"): backfills a session persisted
    // before these two fields existed -- never crashes, never invents a
    // non-empty value, matches this app's own `?? default` convention.
    return { ...parsed, situationDescription: parsed.situationDescription ?? "", desiredOutcome: parsed.desiredOutcome ?? "" };
  } catch {
    console.warn("[storage] Stored ArcDecisionSession is not valid JSON -- treating as no session in progress rather than crashing.");
    return null;
  }
}

export async function saveArcDecisionInProgress(session: ArcDecisionSession): Promise<void> {
  await AsyncStorage.setItem(ARC_DECISION_IN_PROGRESS_KEY, JSON.stringify(session));
}

export async function clearArcDecisionInProgress(): Promise<void> {
  await AsyncStorage.removeItem(ARC_DECISION_IN_PROGRESS_KEY);
}

const ARC_DECISION_HISTORY_KEY = "archi.arcDecisionHistory.v1";

export async function loadArcDecisionHistory(): Promise<ArcDecisionSession[]> {
  const raw = await AsyncStorage.getItem(ARC_DECISION_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcDecisionSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcDecisionHistory is not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

/** Appends a completed session's own final record -- called once, right after completeArcDecisionSession, never before. */
export async function recordArcDecisionHistory(session: ArcDecisionSession): Promise<void> {
  const history = await loadArcDecisionHistory();
  await AsyncStorage.setItem(ARC_DECISION_HISTORY_KEY, JSON.stringify([...history, session]));
}

// --- ARC Perspective task ---------------------------------------------

const ARC_PERSPECTIVE_EVENTS_KEY = "archi.arcPerspectiveEvents.v1";

/** The reusable, editable "saved event" list -- same load/save/upsert shape as loadArcGymSituations/upsertArcGymSituationEntry. */
export async function loadArcPerspectiveEvents(): Promise<ArcPerspectiveEvent[]> {
  const raw = await AsyncStorage.getItem(ARC_PERSPECTIVE_EVENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcPerspectiveEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcPerspectiveEvents are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcPerspectiveEventEntry(event: ArcPerspectiveEvent): Promise<void> {
  const events = await loadArcPerspectiveEvents();
  await AsyncStorage.setItem(ARC_PERSPECTIVE_EVENTS_KEY, JSON.stringify(upsertArcPerspectiveEventInList(events, event)));
}

export async function deleteArcPerspectiveEventEntry(id: string): Promise<void> {
  const events = await loadArcPerspectiveEvents();
  await AsyncStorage.setItem(ARC_PERSPECTIVE_EVENTS_KEY, JSON.stringify(events.filter((event) => event.id !== id)));
}

const ARC_PERSPECTIVE_SESSIONS_KEY = "archi.arcPerspectiveSessions.v1";

/** Full practice history across every event -- upsert-by-id (see arc/arcPerspective.ts's own upsertArcPerspectiveSessionInList doc for why this is never append-only). */
export async function loadArcPerspectiveSessions(): Promise<ArcPerspectiveSession[]> {
  const raw = await AsyncStorage.getItem(ARC_PERSPECTIVE_SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcPerspectiveSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcPerspectiveSessions are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcPerspectiveSessionEntry(session: ArcPerspectiveSession): Promise<void> {
  const sessions = await loadArcPerspectiveSessions();
  await AsyncStorage.setItem(ARC_PERSPECTIVE_SESSIONS_KEY, JSON.stringify(upsertArcPerspectiveSessionInList(sessions, session)));
}

const ARC_PERSPECTIVE_IN_PROGRESS_KEY = "archi.arcPerspectiveInProgress.v1";

/** Single resumable slot, mirroring loadArcDecisionInProgress's own shape exactly -- survives the ARC mood-check-in detour and an app close/reopen in between. */
export async function loadArcPerspectiveInProgress(): Promise<ArcPerspectiveSession | null> {
  const raw = await AsyncStorage.getItem(ARC_PERSPECTIVE_IN_PROGRESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArcPerspectiveSession;
  } catch {
    console.warn("[storage] Stored ArcPerspectiveSession in progress is not valid JSON -- treating as no session in progress rather than crashing.");
    return null;
  }
}

export async function saveArcPerspectiveInProgress(session: ArcPerspectiveSession): Promise<void> {
  await AsyncStorage.setItem(ARC_PERSPECTIVE_IN_PROGRESS_KEY, JSON.stringify(session));
}

export async function clearArcPerspectiveInProgress(): Promise<void> {
  await AsyncStorage.removeItem(ARC_PERSPECTIVE_IN_PROGRESS_KEY);
}

// ---------------------------------------------------------------------------
// ARC Saving, Trigger Management & Quick-Action Buttons task: four strictly
// separate entities (arc/arcSaving.ts's own doc), each with its own storage
// key -- never a combined blob, so deleting/editing one never risks
// corrupting another. Same load/save/upsert shape as every other section in
// this file.
// ---------------------------------------------------------------------------

const ARC_SAVED_EXERCISES_KEY = "archi.arcSavedExercises.v1";

/** (a) Standalone, trigger-independent saved exercises -- build/ArcSavingScreen.tsx's own "התרגילים השמורים שלי" list. */
export async function loadArcSavedExercises(): Promise<ArcSavedExercise[]> {
  const raw = await AsyncStorage.getItem(ARC_SAVED_EXERCISES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcSavedExercise[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcSavedExercises are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcSavedExerciseEntry(exercise: ArcSavedExercise): Promise<void> {
  const exercises = await loadArcSavedExercises();
  await AsyncStorage.setItem(ARC_SAVED_EXERCISES_KEY, JSON.stringify(upsertArcSavedExerciseInList(exercises, exercise)));
}

/** Deleting a saved exercise never deletes a body option promoted FROM it (ArcSavedBodyOption.sourceSavedExerciseId simply stops resolving to a live exercise, same "delete never cascades" convention as every other link in this codebase) -- spec section 14: "מחיקת תרגיל שמור תסיר קיצורים שאינם תקפים, אך לא תמחק את ההיסטוריה." */
export async function deleteArcSavedExerciseEntry(id: string): Promise<void> {
  const exercises = await loadArcSavedExercises();
  await AsyncStorage.setItem(ARC_SAVED_EXERCISES_KEY, JSON.stringify(exercises.filter((entry) => entry.id !== id)));
}

const ARC_SAVED_BODY_OPTIONS_KEY = "archi.arcSavedBodyOptions.v1";

/** (c) Every reusable body option across every trigger -- a trigger merely holds a list of these ids (arc/arcSaving.ts's own ArcTrigger.bodyOptionIds), never a copy of the option itself, so two triggers can genuinely share one option. */
export async function loadArcSavedBodyOptions(): Promise<ArcSavedBodyOption[]> {
  const raw = await AsyncStorage.getItem(ARC_SAVED_BODY_OPTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcSavedBodyOption[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcSavedBodyOptions are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcSavedBodyOptionEntry(option: ArcSavedBodyOption): Promise<void> {
  const options = await loadArcSavedBodyOptions();
  await AsyncStorage.setItem(ARC_SAVED_BODY_OPTIONS_KEY, JSON.stringify(upsertArcSavedBodyOptionInList(options, option)));
}

/** Deletes one option only -- the caller (build/ArcTriggerEditorScreen.tsx) is separately responsible for calling removeBodyOptionFromTrigger on every trigger that referenced it, never implied here. */
export async function deleteArcSavedBodyOptionEntry(id: string): Promise<void> {
  const options = await loadArcSavedBodyOptions();
  await AsyncStorage.setItem(ARC_SAVED_BODY_OPTIONS_KEY, JSON.stringify(options.filter((entry) => entry.id !== id)));
}

const ARC_TRIGGERS_KEY = "archi.arcTriggers.v1";

/** (b) The master trigger list -- independent of which triggers are currently "active"/displayed (see ACTIVE_ARC_TRIGGER_IDS_KEY below). */
export async function loadArcTriggers(): Promise<ArcTrigger[]> {
  const raw = await AsyncStorage.getItem(ARC_TRIGGERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcTrigger[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcTriggers are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcTriggerEntry(trigger: ArcTrigger): Promise<void> {
  const triggers = await loadArcTriggers();
  await AsyncStorage.setItem(ARC_TRIGGERS_KEY, JSON.stringify(upsertArcTriggerInList(triggers, trigger)));
}

/** Deletes a trigger from the master list. The caller is separately responsible for pruning it out of the active list (pruneActiveTriggerList below) -- never implied automatically here, matching arc/arcSaving.ts's own deleteArcTriggerFromList doc. */
export async function deleteArcTriggerEntry(id: string): Promise<void> {
  const triggers = await loadArcTriggers();
  await AsyncStorage.setItem(ARC_TRIGGERS_KEY, JSON.stringify(triggers.filter((entry) => entry.id !== id)));
}

const ACTIVE_ARC_TRIGGER_IDS_KEY = "archi.activeArcTriggerIds.v1";

/** (d) The trainee's own currently-displayed trigger shortcuts, in display order -- spec section 16: a fourth entity, deliberately separate from the trigger list itself. Removing a trigger from this list never deletes it from loadArcTriggers above (section 9.2/14). */
export async function loadActiveArcTriggerIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(ACTIVE_ARC_TRIGGER_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch (error) {
    console.warn("[storage] Stored active ARC trigger ids are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

/** Plain full-array replace -- add/remove/swap/reorder (arc/arcSaving.ts's own pure helpers) are all computed client-side first, then persisted in one call, so every surface reading this key always sees one consistent, already-ordered list. */
export async function saveActiveArcTriggerIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_ARC_TRIGGER_IDS_KEY, JSON.stringify(ids));
}

const ARC_SAVING_PENDING_REVIEW_KEY = "archi.arcSavingPendingReview.v1";

/** Single resumable slot carried across the ARC round-trip -- see arc/arcSaving.ts's own ArcSavingPendingReview doc. Read exactly once by build/ArcSavingReviewScreen.tsx on focus. */
export async function loadArcSavingPendingReview(): Promise<ArcSavingPendingReview | null> {
  const raw = await AsyncStorage.getItem(ARC_SAVING_PENDING_REVIEW_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArcSavingPendingReview;
  } catch {
    console.warn("[storage] Stored ArcSavingPendingReview is not valid JSON -- treating as no review pending rather than crashing.");
    return null;
  }
}

export async function saveArcSavingPendingReview(review: ArcSavingPendingReview): Promise<void> {
  await AsyncStorage.setItem(ARC_SAVING_PENDING_REVIEW_KEY, JSON.stringify(review));
}

export async function clearArcSavingPendingReview(): Promise<void> {
  await AsyncStorage.removeItem(ARC_SAVING_PENDING_REVIEW_KEY);
}

// ============================================================
// ARC Learning + ARC Creativity + Integrated Spaced Repetition
// ============================================================

const ARC_LEARNING_TOPICS_KEY = "archi.arcLearningTopics.v1";

export async function loadArcLearningTopics(): Promise<ArcLearningTopic[]> {
  const raw = await AsyncStorage.getItem(ARC_LEARNING_TOPICS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcLearningTopic[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcLearningTopic) : [];
  } catch (error) {
    console.warn("[storage] Stored ArcLearningTopics are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcLearningTopics(topics: ArcLearningTopic[]): Promise<void> {
  await AsyncStorage.setItem(ARC_LEARNING_TOPICS_KEY, JSON.stringify(topics));
}

export async function upsertArcLearningTopicEntry(topic: ArcLearningTopic): Promise<void> {
  const topics = await loadArcLearningTopics();
  await saveArcLearningTopics(upsertArcLearningTopicInList(topics, topic));
}

/** Never cascades -- leaves any insight that pointed at this topic with a dangling topicId, same convention as every other delete<Type>Entry in this file. */
export async function deleteArcLearningTopicEntry(id: string): Promise<void> {
  const topics = await loadArcLearningTopics();
  await saveArcLearningTopics(topics.filter((topic) => topic.id !== id));
}

const ARC_LEARNING_INSIGHTS_KEY = "archi.arcLearningInsights.v1";

export async function loadArcLearningInsights(): Promise<ArcLearningInsight[]> {
  const raw = await AsyncStorage.getItem(ARC_LEARNING_INSIGHTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcLearningInsight[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcLearningInsight) : [];
  } catch (error) {
    console.warn("[storage] Stored ArcLearningInsights are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcLearningInsights(insights: ArcLearningInsight[]): Promise<void> {
  await AsyncStorage.setItem(ARC_LEARNING_INSIGHTS_KEY, JSON.stringify(insights));
}

export async function upsertArcLearningInsightEntry(insight: ArcLearningInsight): Promise<void> {
  const insights = await loadArcLearningInsights();
  await saveArcLearningInsights(upsertArcLearningInsightInList(insights, insight));
}

/** Never cascades -- leaves this insight's own review schedule/recall history and any ArcCreativityConnection referencing it in place, dangling by id, same convention as every other delete<Type>Entry in this file. */
export async function deleteArcLearningInsightEntry(id: string): Promise<void> {
  const insights = await loadArcLearningInsights();
  await saveArcLearningInsights(insights.filter((insight) => insight.id !== id));
}

const ARC_LEARNING_REVIEW_SCHEDULES_KEY = "archi.arcLearningReviewSchedules.v1";

export async function loadArcLearningReviewSchedules(): Promise<ArcLearningReviewSchedule[]> {
  const raw = await AsyncStorage.getItem(ARC_LEARNING_REVIEW_SCHEDULES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcLearningReviewSchedule[];
    const now = new Date().toISOString();
    return Array.isArray(parsed) ? parsed.map((schedule) => normalizeArcLearningReviewSchedule(schedule, now)) : [];
  } catch (error) {
    console.warn("[storage] Stored ArcLearningReviewSchedules are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcLearningReviewSchedules(schedules: ArcLearningReviewSchedule[]): Promise<void> {
  await AsyncStorage.setItem(ARC_LEARNING_REVIEW_SCHEDULES_KEY, JSON.stringify(schedules));
}

export async function upsertArcLearningReviewScheduleEntry(schedule: ArcLearningReviewSchedule): Promise<void> {
  const schedules = await loadArcLearningReviewSchedules();
  await saveArcLearningReviewSchedules(upsertArcLearningReviewScheduleInList(schedules, schedule));
}

export async function deleteArcLearningReviewScheduleEntry(insightId: string): Promise<void> {
  const schedules = await loadArcLearningReviewSchedules();
  await saveArcLearningReviewSchedules(schedules.filter((schedule) => schedule.insightId !== insightId));
}

const ARC_LEARNING_RECALL_RECORDS_KEY = "archi.arcLearningRecallRecords.v1";

export async function loadArcLearningRecallRecords(): Promise<ArcLearningRecallRecord[]> {
  const raw = await AsyncStorage.getItem(ARC_LEARNING_RECALL_RECORDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcLearningRecallRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcLearningRecallRecords are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcLearningRecallRecords(records: ArcLearningRecallRecord[]): Promise<void> {
  await AsyncStorage.setItem(ARC_LEARNING_RECALL_RECORDS_KEY, JSON.stringify(records));
}

/**
 * Records one completed individual-insight recall: loads both the
 * schedule and history collections, advances them together via
 * arc/arcLearningReview.ts's own recordArcLearningRecall (one call, so
 * the two can never drift apart), and persists both. The one
 * orchestration entry point every recall-completion call site (direct
 * ARC Learning interface, a weekly review block, a flexible daily
 * review task) should call -- never duplicated inline.
 */
export async function recordArcLearningRecallEntry(insightId: string, rating: ArcRecallRating, recordId: string, now: string): Promise<void> {
  const [schedules, records] = await Promise.all([loadArcLearningReviewSchedules(), loadArcLearningRecallRecords()]);
  const result = recordArcLearningRecall(schedules, records, insightId, rating, recordId, now);
  await Promise.all([saveArcLearningReviewSchedules(result.schedules), saveArcLearningRecallRecords(result.records)]);
}

const ARC_LEARNING_RECALL_SESSION_PROGRESS_KEY = "archi.arcLearningRecallSessionProgress.v1";

/** Single resumable slot, same convention as loadArcGymMemoryCheckInProgress above -- at most one ARC Learning recall queue is ever in flight. */
export async function loadArcLearningRecallSessionProgress(): Promise<ArcLearningRecallSessionProgress | null> {
  const raw = await AsyncStorage.getItem(ARC_LEARNING_RECALL_SESSION_PROGRESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArcLearningRecallSessionProgress;
  } catch {
    console.warn("[storage] Stored ArcLearningRecallSessionProgress is not valid JSON -- treating as no session in progress rather than crashing.");
    return null;
  }
}

export async function saveArcLearningRecallSessionProgress(progress: ArcLearningRecallSessionProgress): Promise<void> {
  await AsyncStorage.setItem(ARC_LEARNING_RECALL_SESSION_PROGRESS_KEY, JSON.stringify(progress));
}

export async function clearArcLearningRecallSessionProgress(): Promise<void> {
  await AsyncStorage.removeItem(ARC_LEARNING_RECALL_SESSION_PROGRESS_KEY);
}

const ARC_CREATIVITY_CONNECTIONS_KEY = "archi.arcCreativityConnections.v1";

export async function loadArcCreativityConnections(): Promise<ArcCreativityConnection[]> {
  const raw = await AsyncStorage.getItem(ARC_CREATIVITY_CONNECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcCreativityConnection[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcCreativityConnection) : [];
  } catch (error) {
    console.warn("[storage] Stored ArcCreativityConnections are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcCreativityConnections(connections: ArcCreativityConnection[]): Promise<void> {
  await AsyncStorage.setItem(ARC_CREATIVITY_CONNECTIONS_KEY, JSON.stringify(connections));
}

export async function upsertArcCreativityConnectionEntry(connection: ArcCreativityConnection): Promise<void> {
  const connections = await loadArcCreativityConnections();
  await saveArcCreativityConnections(upsertArcCreativityConnectionInList(connections, connection));
}

/** Never cascades -- leaves both referenced insights and this connection's own review schedule/recall history dangling by id, same convention as every other delete<Type>Entry in this file. */
export async function deleteArcCreativityConnectionEntry(id: string): Promise<void> {
  const connections = await loadArcCreativityConnections();
  await saveArcCreativityConnections(connections.filter((connection) => connection.id !== id));
}

const ARC_CREATIVITY_REVIEW_SCHEDULES_KEY = "archi.arcCreativityReviewSchedules.v1";

export async function loadArcCreativityReviewSchedules(): Promise<ArcCreativityReviewSchedule[]> {
  const raw = await AsyncStorage.getItem(ARC_CREATIVITY_REVIEW_SCHEDULES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcCreativityReviewSchedule[];
    const now = new Date().toISOString();
    return Array.isArray(parsed) ? parsed.map((schedule) => normalizeArcCreativityReviewSchedule(schedule, now)) : [];
  } catch (error) {
    console.warn("[storage] Stored ArcCreativityReviewSchedules are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcCreativityReviewSchedules(schedules: ArcCreativityReviewSchedule[]): Promise<void> {
  await AsyncStorage.setItem(ARC_CREATIVITY_REVIEW_SCHEDULES_KEY, JSON.stringify(schedules));
}

export async function upsertArcCreativityReviewScheduleEntry(schedule: ArcCreativityReviewSchedule): Promise<void> {
  const schedules = await loadArcCreativityReviewSchedules();
  await saveArcCreativityReviewSchedules(upsertArcCreativityReviewScheduleInList(schedules, schedule));
}

export async function deleteArcCreativityReviewScheduleEntry(connectionId: string): Promise<void> {
  const schedules = await loadArcCreativityReviewSchedules();
  await saveArcCreativityReviewSchedules(schedules.filter((schedule) => schedule.connectionId !== connectionId));
}

const ARC_CREATIVITY_RECALL_RECORDS_KEY = "archi.arcCreativityRecallRecords.v1";

export async function loadArcCreativityRecallRecords(): Promise<ArcCreativityRecallRecord[]> {
  const raw = await AsyncStorage.getItem(ARC_CREATIVITY_RECALL_RECORDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcCreativityRecallRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcCreativityRecallRecords are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveArcCreativityRecallRecords(records: ArcCreativityRecallRecord[]): Promise<void> {
  await AsyncStorage.setItem(ARC_CREATIVITY_RECALL_RECORDS_KEY, JSON.stringify(records));
}

/**
 * Mode D's own recall-completion orchestration -- the exact mirror of
 * recordArcLearningRecallEntry above, kept on a fully separate pair of
 * storage keys so connection recall history can never be confused with,
 * or counted as, individual-insight recall history.
 */
export async function recordArcCreativityRecallEntry(connectionId: string, rating: ArcRecallRating, recordId: string, now: string): Promise<void> {
  const [schedules, records] = await Promise.all([loadArcCreativityReviewSchedules(), loadArcCreativityRecallRecords()]);
  const result = recordArcCreativityRecall(schedules, records, connectionId, rating, recordId, now);
  await Promise.all([saveArcCreativityReviewSchedules(result.schedules), saveArcCreativityRecallRecords(result.records)]);
}

const ARC_CREATIVITY_RECALL_SESSION_PROGRESS_KEY = "archi.arcCreativityRecallSessionProgress.v1";

/** Single resumable slot for Mode D's own cumulative recall queue -- fully separate from ArcLearningRecallSessionProgress's own slot above. */
export async function loadArcCreativityRecallSessionProgress(): Promise<ArcCreativityRecallSessionProgress | null> {
  const raw = await AsyncStorage.getItem(ARC_CREATIVITY_RECALL_SESSION_PROGRESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArcCreativityRecallSessionProgress;
  } catch {
    console.warn("[storage] Stored ArcCreativityRecallSessionProgress is not valid JSON -- treating as no session in progress rather than crashing.");
    return null;
  }
}

export async function saveArcCreativityRecallSessionProgress(progress: ArcCreativityRecallSessionProgress): Promise<void> {
  await AsyncStorage.setItem(ARC_CREATIVITY_RECALL_SESSION_PROGRESS_KEY, JSON.stringify(progress));
}

export async function clearArcCreativityRecallSessionProgress(): Promise<void> {
  await AsyncStorage.removeItem(ARC_CREATIVITY_RECALL_SESSION_PROGRESS_KEY);
}

/**
 * Positive Memory, Success Recall & Quick Capture task, Stage A: the
 * ONE persistent library of finalized positive memories -- section 7's
 * own "an automatically saved draft is not a completed positive
 * memory" is why drafts live in a completely separate collection
 * (below) that this loader never touches.
 */
const POSITIVE_MEMORIES_KEY = "archi.positiveMemories.v1";

export async function loadPositiveMemories(): Promise<PositiveMemory[]> {
  const raw = await AsyncStorage.getItem(POSITIVE_MEMORIES_KEY);
  if (!raw) return [];
  const now = new Date().toISOString();
  try {
    const parsed = JSON.parse(raw) as PositiveMemory[];
    return Array.isArray(parsed) ? parsed.map((memory) => normalizePositiveMemory(memory, now)) : [];
  } catch (error) {
    console.warn("[storage] Stored PositiveMemories are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function savePositiveMemories(memories: PositiveMemory[]): Promise<void> {
  await AsyncStorage.setItem(POSITIVE_MEMORIES_KEY, JSON.stringify(memories));
}

export async function upsertPositiveMemoryEntry(memory: PositiveMemory): Promise<void> {
  const memories = await loadPositiveMemories();
  await savePositiveMemories(upsertPositiveMemoryInList(memories, memory));
}

export async function deletePositiveMemoryEntry(id: string): Promise<void> {
  const memories = await loadPositiveMemories();
  await savePositiveMemories(memories.filter((memory) => memory.id !== id));
}

const TODO_BANK_ITEMS_KEY = "archi.todoBankItems.v1";

export async function loadTodoBankItems(): Promise<TodoBankItem[]> {
  const raw = await AsyncStorage.getItem(TODO_BANK_ITEMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TodoBankItem[];
    return Array.isArray(parsed) ? parsed.map(normalizeTodoBankItem) : [];
  } catch (error) {
    console.warn("[storage] Stored TodoBankItems are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveTodoBankItems(items: TodoBankItem[]): Promise<void> {
  await AsyncStorage.setItem(TODO_BANK_ITEMS_KEY, JSON.stringify(items));
}

export async function upsertTodoBankItemEntry(item: TodoBankItem): Promise<void> {
  const items = await loadTodoBankItems();
  await saveTodoBankItems(upsertTodoBankItemInList(items, item));
}

export async function deleteTodoBankItemEntry(id: string): Promise<void> {
  const items = await loadTodoBankItems();
  await saveTodoBankItems(items.filter((item) => item.id !== id));
}

const POSITIVE_MEMORY_DRAFTS_KEY = "archi.positiveMemoryDrafts.v1";

/** Section 7: "support multiple independent drafts" -- a collection, never a single resumable slot. */
export async function loadPositiveMemoryDrafts(): Promise<PositiveMemoryDraft[]> {
  const raw = await AsyncStorage.getItem(POSITIVE_MEMORY_DRAFTS_KEY);
  if (!raw) return [];
  const now = new Date().toISOString();
  try {
    const parsed = JSON.parse(raw) as PositiveMemoryDraft[];
    return Array.isArray(parsed) ? parsed.map((draft) => normalizePositiveMemoryDraft(draft, now)) : [];
  } catch (error) {
    console.warn("[storage] Stored PositiveMemoryDrafts are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function savePositiveMemoryDrafts(drafts: PositiveMemoryDraft[]): Promise<void> {
  await AsyncStorage.setItem(POSITIVE_MEMORY_DRAFTS_KEY, JSON.stringify(drafts));
}

export async function upsertPositiveMemoryDraftEntry(draft: PositiveMemoryDraft): Promise<void> {
  const drafts = await loadPositiveMemoryDrafts();
  await savePositiveMemoryDrafts(upsertPositiveMemoryDraftInList(drafts, draft));
}

export async function deletePositiveMemoryDraftEntry(id: string): Promise<void> {
  const drafts = await loadPositiveMemoryDrafts();
  await savePositiveMemoryDrafts(drafts.filter((draft) => draft.id !== id));
}

/**
 * Section 12: the ONE place a draft is turned into a real memory AND
 * removed from the drafts collection, in one call -- so a caller can
 * never persist the finalized memory while accidentally leaving the
 * now-stale draft behind (which would otherwise resurface as "resume
 * previous documentation" for an already-saved memory).
 */
export async function finalizePositiveMemoryDraftEntry(draft: PositiveMemoryDraft, memoryId: string, now: string): Promise<PositiveMemory> {
  const memory = finalizePositiveMemoryDraft(draft, memoryId, now);
  await upsertPositiveMemoryEntry(memory);
  await deletePositiveMemoryDraftEntry(draft.id);
  return memory;
}

const POSITIVE_MEMORY_SELECTION_HISTORY_KEY = "archi.positiveMemorySelectionHistory.v1";

export async function loadPositiveMemorySelectionHistory(): Promise<PositiveMemorySelectionHistoryEntry[]> {
  const raw = await AsyncStorage.getItem(POSITIVE_MEMORY_SELECTION_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PositiveMemorySelectionHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored PositiveMemorySelectionHistory is not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function savePositiveMemorySelectionHistory(history: PositiveMemorySelectionHistoryEntry[]): Promise<void> {
  await AsyncStorage.setItem(POSITIVE_MEMORY_SELECTION_HISTORY_KEY, JSON.stringify(history));
}

const FREE_TIME_WINDOW_DISMISSALS_KEY = "archi.freeTimeWindowDismissals.v1";

export async function loadFreeTimeWindowDismissals(): Promise<FreeTimeWindowDismissal[]> {
  const raw = await AsyncStorage.getItem(FREE_TIME_WINDOW_DISMISSALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FreeTimeWindowDismissal[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored FreeTimeWindowDismissal list is not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function saveFreeTimeWindowDismissals(dismissals: FreeTimeWindowDismissal[]): Promise<void> {
  await AsyncStorage.setItem(FREE_TIME_WINDOW_DISMISSALS_KEY, JSON.stringify(dismissals));
}

const LAST_ENCODING_FEELING_KEY = "archi.lastEncodingFeelingByTask.v1";

async function loadLastEncodingFeelings(): Promise<LastEncodingFeelingRecord[]> {
  const raw = await AsyncStorage.getItem(LAST_ENCODING_FEELING_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LastEncodingFeelingRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored LastEncodingFeelingRecord list is not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

async function saveLastEncodingFeelings(records: LastEncodingFeelingRecord[]): Promise<void> {
  await AsyncStorage.setItem(LAST_ENCODING_FEELING_KEY, JSON.stringify(records));
}

/** Overwrites (never accumulates a history) the one real supportive feeling resolved during this task's most recent ARC encoding step -- a display convenience for the post-completion reflection screen, never a source of truth for memory selection. */
export async function recordLastEncodingFeelingForTask(taskId: string, feeling: string, now: string): Promise<void> {
  const records = await loadLastEncodingFeelings();
  await saveLastEncodingFeelings(upsertLastEncodingFeeling(records, taskId, feeling, now));
}

export async function loadLastEncodingFeelingForTask(taskId: string): Promise<string | null> {
  const records = await loadLastEncodingFeelings();
  const match = records.find((record) => record.taskId === taskId);
  return match ? match.feeling : null;
}

// ---------------------------------------------------------------------------
// ARC Writing & ARC Book task: five strictly separate entities (arc/arcWriting.ts's
// own doc, extended by the ARC Video task for ArcVideoRecording), each
// with its own storage key -- never a combined blob, so deleting/editing
// one never risks corrupting another. Same load/upsert/delete shape as
// every other section in this file.
// ---------------------------------------------------------------------------

const ARC_INSIGHT_RELATIONSHIPS_KEY = "archi.arcInsightRelationships.v1";

/** The shared, reusable relationship repository -- never duplicated per text/chapter/book. */
export async function loadArcInsightRelationships(): Promise<ArcInsightRelationship[]> {
  const raw = await AsyncStorage.getItem(ARC_INSIGHT_RELATIONSHIPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcInsightRelationship[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcInsightRelationships are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcInsightRelationshipEntry(relationship: ArcInsightRelationship): Promise<void> {
  const relationships = await loadArcInsightRelationships();
  await AsyncStorage.setItem(ARC_INSIGHT_RELATIONSHIPS_KEY, JSON.stringify(upsertArcInsightRelationshipInList(relationships, relationship)));
}

export async function deleteArcInsightRelationshipEntry(id: string): Promise<void> {
  const relationships = await loadArcInsightRelationships();
  await AsyncStorage.setItem(ARC_INSIGHT_RELATIONSHIPS_KEY, JSON.stringify(relationships.filter((relationship) => relationship.id !== id)));
}

const ARC_WRITING_TEXTS_KEY = "archi.arcWritingTexts.v1";

export async function loadArcWritingTexts(): Promise<ArcWritingText[]> {
  const raw = await AsyncStorage.getItem(ARC_WRITING_TEXTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcWritingText[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcWritingText) : [];
  } catch (error) {
    console.warn("[storage] Stored ArcWritingTexts are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcWritingTextEntry(text: ArcWritingText): Promise<void> {
  const texts = await loadArcWritingTexts();
  await AsyncStorage.setItem(ARC_WRITING_TEXTS_KEY, JSON.stringify(upsertArcWritingTextInList(texts, text)));
}

export async function deleteArcWritingTextEntry(id: string): Promise<void> {
  const texts = await loadArcWritingTexts();
  await AsyncStorage.setItem(ARC_WRITING_TEXTS_KEY, JSON.stringify(texts.filter((text) => text.id !== id)));
}

const ARC_QUESTIONS_KEY = "archi.arcQuestions.v1";

export async function loadArcQuestions(): Promise<ArcQuestion[]> {
  const raw = await AsyncStorage.getItem(ARC_QUESTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcQuestion[];
    return Array.isArray(parsed) ? parsed.map(normalizeArcQuestion) : [];
  } catch (error) {
    console.warn("[storage] Stored ArcQuestions are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcQuestionEntry(question: ArcQuestion): Promise<void> {
  const questions = await loadArcQuestions();
  await AsyncStorage.setItem(ARC_QUESTIONS_KEY, JSON.stringify(upsertArcQuestionInList(questions, question)));
}

export async function deleteArcQuestionEntry(id: string): Promise<void> {
  const questions = await loadArcQuestions();
  await AsyncStorage.setItem(ARC_QUESTIONS_KEY, JSON.stringify(questions.filter((question) => question.id !== id)));
}

const ARC_DIARY_ENTRIES_KEY = "archi.arcDiaryEntries.v1";

export async function loadArcDiaryEntries(): Promise<ArcDiaryEntry[]> {
  const raw = await AsyncStorage.getItem(ARC_DIARY_ENTRIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcDiaryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcDiaryEntries are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcDiaryEntryEntry(entry: ArcDiaryEntry): Promise<void> {
  const entries = await loadArcDiaryEntries();
  await AsyncStorage.setItem(ARC_DIARY_ENTRIES_KEY, JSON.stringify(upsertArcDiaryEntryInList(entries, entry)));
}

export async function deleteArcDiaryEntryEntry(id: string): Promise<void> {
  const entries = await loadArcDiaryEntries();
  await AsyncStorage.setItem(ARC_DIARY_ENTRIES_KEY, JSON.stringify(entries.filter((entry) => entry.id !== id)));
}

const ARC_BOOKS_KEY = "archi.arcBooks.v1";

export async function loadArcBooks(): Promise<ArcBook[]> {
  const raw = await AsyncStorage.getItem(ARC_BOOKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcBook[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcBooks are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcBookEntry(book: ArcBook): Promise<void> {
  const books = await loadArcBooks();
  await AsyncStorage.setItem(ARC_BOOKS_KEY, JSON.stringify(upsertArcBookInList(books, book)));
}

export async function deleteArcBookEntry(id: string): Promise<void> {
  const books = await loadArcBooks();
  await AsyncStorage.setItem(ARC_BOOKS_KEY, JSON.stringify(books.filter((book) => book.id !== id)));
}

const ARC_BOOK_CHAPTERS_KEY = "archi.arcBookChapters.v1";

export async function loadArcBookChapters(): Promise<ArcBookChapter[]> {
  const raw = await AsyncStorage.getItem(ARC_BOOK_CHAPTERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcBookChapter[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcBookChapters are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcBookChapterEntry(chapter: ArcBookChapter): Promise<void> {
  const chapters = await loadArcBookChapters();
  await AsyncStorage.setItem(ARC_BOOK_CHAPTERS_KEY, JSON.stringify(upsertArcBookChapterInList(chapters, chapter)));
}

export async function deleteArcBookChapterEntry(id: string): Promise<void> {
  const chapters = await loadArcBookChapters();
  await AsyncStorage.setItem(ARC_BOOK_CHAPTERS_KEY, JSON.stringify(chapters.filter((chapter) => chapter.id !== id)));
}

/** ARC Video task: the fifth ArcWriting-family entity -- its own storage key, same non-cascading "deleting one never risks another" convention as the four above. Only the recording's OWN metadata lives here; the actual video file lives on disk (arc/arcVideoFile.ts), never in AsyncStorage. */
const ARC_VIDEO_RECORDINGS_KEY = "archi.arcVideoRecordings.v1";

export async function loadArcVideoRecordings(): Promise<ArcVideoRecording[]> {
  const raw = await AsyncStorage.getItem(ARC_VIDEO_RECORDINGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcVideoRecording[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[storage] Stored ArcVideoRecordings are not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function upsertArcVideoRecordingEntry(recording: ArcVideoRecording): Promise<void> {
  const recordings = await loadArcVideoRecordings();
  await AsyncStorage.setItem(ARC_VIDEO_RECORDINGS_KEY, JSON.stringify(upsertArcVideoRecordingInList(recordings, recording)));
}

export async function deleteArcVideoRecordingEntry(id: string): Promise<void> {
  const recordings = await loadArcVideoRecordings();
  await AsyncStorage.setItem(ARC_VIDEO_RECORDINGS_KEY, JSON.stringify(recordings.filter((recording) => recording.id !== id)));
}

/**
 * ARC Video task: the camera/microphone analogue of
 * hasSeenNotificationExplanation/markNotificationExplanationSeen above --
 * a one-time, dismissible, in-app explanation shown immediately before
 * the FIRST action that would trigger the real OS camera/microphone
 * permission dialog (entering the record screen), never shown again
 * once dismissed. Fails toward `false` (shows the explanation again) on
 * any storage error, same "never silently skip the explanation" fail
 * direction as the notification pair.
 */
const CAMERA_EXPLANATION_SEEN_KEY = "archi.cameraExplanationSeen.v1";

export async function hasSeenCameraExplanation(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CAMERA_EXPLANATION_SEEN_KEY)) === "true";
  } catch (error) {
    console.warn("[storage] Could not read camera-explanation-seen flag -- showing the explanation again rather than silently skipping it.", error);
    return false;
  }
}

export async function markCameraExplanationSeen(): Promise<void> {
  await AsyncStorage.setItem(CAMERA_EXPLANATION_SEEN_KEY, "true");
}

/**
 * ARC Video task: the teleprompter overlay's own "last used" settings --
 * a single standalone object, never scoped per-task/per-script (the
 * trainee's preferred text size/scroll speed/position is a personal
 * reading preference, not tied to any one recording), same defensive
 * load/save convention as every other section in this file.
 */
const TELEPROMPTER_SETTINGS_KEY = "archi.teleprompterSettings.v1";

export async function loadTeleprompterSettings(): Promise<TeleprompterSettings> {
  const raw = await AsyncStorage.getItem(TELEPROMPTER_SETTINGS_KEY);
  if (!raw) return createDefaultTeleprompterSettings();
  try {
    return normalizeTeleprompterSettings(JSON.parse(raw) as Partial<TeleprompterSettings>);
  } catch (error) {
    console.warn("[storage] Stored TeleprompterSettings are not valid JSON -- returning defaults rather than crashing.", error);
    return createDefaultTeleprompterSettings();
  }
}

export async function saveTeleprompterSettings(settings: TeleprompterSettings): Promise<void> {
  await AsyncStorage.setItem(TELEPROMPTER_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * ARC Reminders task: storage for the three reminder families (ARC
 * Mantras, ARC Active Recall + its chat history, and the ARC Task
 * Reminders settings/transition-notification state), each its own
 * key, same flat-list-CRUD / single-blob-settings convention as every
 * other collection/settings record in this file.
 */
const ARC_MANTRA_REMINDERS_KEY = "archi.arcMantraReminders.v1";

export async function loadArcMantraReminders(): Promise<ArcMantraReminder[]> {
  const raw = await AsyncStorage.getItem(ARC_MANTRA_REMINDERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcMantraReminder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcMantraReminders are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveArcMantraReminders(reminders: ArcMantraReminder[]): Promise<void> {
  await AsyncStorage.setItem(ARC_MANTRA_REMINDERS_KEY, JSON.stringify(reminders));
}

export async function upsertArcMantraReminderEntry(reminder: ArcMantraReminder): Promise<void> {
  const reminders = await loadArcMantraReminders();
  await saveArcMantraReminders(upsertArcMantraReminderInList(reminders, reminder));
}

export async function deleteArcMantraReminderEntry(id: string): Promise<void> {
  const reminders = await loadArcMantraReminders();
  await saveArcMantraReminders(reminders.filter((reminder) => reminder.id !== id));
}

const ARC_RECALL_REMINDERS_KEY = "archi.arcRecallReminders.v1";

export async function loadArcRecallReminders(): Promise<ArcRecallReminder[]> {
  const raw = await AsyncStorage.getItem(ARC_RECALL_REMINDERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcRecallReminder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcRecallReminders are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveArcRecallReminders(reminders: ArcRecallReminder[]): Promise<void> {
  await AsyncStorage.setItem(ARC_RECALL_REMINDERS_KEY, JSON.stringify(reminders));
}

export async function upsertArcRecallReminderEntry(reminder: ArcRecallReminder): Promise<void> {
  const reminders = await loadArcRecallReminders();
  await saveArcRecallReminders(upsertArcRecallReminderInList(reminders, reminder));
}

export async function deleteArcRecallReminderEntry(id: string): Promise<void> {
  const reminders = await loadArcRecallReminders();
  await saveArcRecallReminders(reminders.filter((reminder) => reminder.id !== id));
}

/**
 * The recall chat history is a permanent append-only log (requirement:
 * "answers persist permanently") -- never pruned, never deleted
 * wholesale even if its owning ArcRecallReminder is later deleted (the
 * message's own denormalized sourceRef keeps "view source" working
 * regardless).
 */
const ARC_RECALL_CHAT_HISTORY_KEY = "archi.arcRecallChatHistory.v1";

export async function loadArcRecallChatHistory(): Promise<ArcRecallChatMessage[]> {
  const raw = await AsyncStorage.getItem(ARC_RECALL_CHAT_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcRecallChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcRecallChatHistory is not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveArcRecallChatHistory(messages: ArcRecallChatMessage[]): Promise<void> {
  await AsyncStorage.setItem(ARC_RECALL_CHAT_HISTORY_KEY, JSON.stringify(messages));
}

export async function appendArcRecallChatMessageEntry(message: ArcRecallChatMessage): Promise<void> {
  const messages = await loadArcRecallChatHistory();
  await saveArcRecallChatHistory([...messages, message]);
}

/** Replaces one already-appended message in place (by id) -- used for recording an answer or a reveal, never for creating a new message. */
export async function updateArcRecallChatMessageEntry(message: ArcRecallChatMessage): Promise<void> {
  const messages = await loadArcRecallChatHistory();
  const index = messages.findIndex((existing) => existing.id === message.id);
  if (index === -1) return;
  const next = [...messages];
  next[index] = message;
  await saveArcRecallChatHistory(next);
}

const ARC_TASK_REMINDER_SETTINGS_KEY = "archi.arcTaskReminderSettings.v1";

export async function loadArcTaskReminderSettings(): Promise<ArcTaskReminderSettings> {
  const raw = await AsyncStorage.getItem(ARC_TASK_REMINDER_SETTINGS_KEY);
  const now = new Date().toISOString();
  if (!raw) return createDefaultArcTaskReminderSettings(now);
  try {
    return normalizeArcTaskReminderSettings(JSON.parse(raw) as Partial<ArcTaskReminderSettings>, now);
  } catch (error) {
    console.warn("[storage] Stored ArcTaskReminderSettings are not valid JSON -- returning defaults rather than crashing.", error);
    return createDefaultArcTaskReminderSettings(now);
  }
}

export async function saveArcTaskReminderSettings(settings: ArcTaskReminderSettings): Promise<void> {
  await AsyncStorage.setItem(ARC_TASK_REMINDER_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * The ONE transition notification's own persisted state -- its stable
 * notificationId plus the current/next/fromTask ids it was last shown
 * with, so recomputeTaskTransitionNotification (data/taskTransitionNotification.ts)
 * always updates the SAME displayed notification in place, never
 * creates a second one, even across an app restart.
 */
export interface TaskTransitionNotificationState {
  notificationId: string;
  fromTaskId: string | null;
  currentTaskId: string | null;
  nextTaskId: string | null;
  allDone: boolean;
  updatedAt: string;
}

const ARC_TASK_TRANSITION_NOTIFICATION_STATE_KEY = "archi.arcTaskTransitionNotificationState.v1";

export async function loadTaskTransitionNotificationState(): Promise<TaskTransitionNotificationState | null> {
  const raw = await AsyncStorage.getItem(ARC_TASK_TRANSITION_NOTIFICATION_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TaskTransitionNotificationState;
  } catch (error) {
    console.warn("[storage] Stored TaskTransitionNotificationState is not valid JSON -- treating as unset rather than crashing.", error);
    return null;
  }
}

export async function saveTaskTransitionNotificationState(state: TaskTransitionNotificationState): Promise<void> {
  await AsyncStorage.setItem(ARC_TASK_TRANSITION_NOTIFICATION_STATE_KEY, JSON.stringify(state));
}

/**
 * ARC Reminders task: what data/arcReminderScheduler.ts's own rolling
 * top-up believes is CURRENTLY scheduled for one mantra/recall reminder
 * -- one entry per native trigger, keyed by its own deterministic
 * `triggerId` (arc/reminderRollingSchedule.ts's `triggerIdForTime`)
 * alongside the REAL notification id `scheduleReminderNotification`
 * returned for it, since only that real id can actually be passed to
 * `cancelScheduledNotification`. Keyed per reminderId (never a single
 * flat list) so topping up/cancelling one reminder's own stale slots
 * can never touch a different reminder's own schedule.
 */
export interface ArcReminderScheduledTrigger {
  triggerId: string;
  notificationId: string;
  fireAt: string;
}

const ARC_REMINDER_SCHEDULED_TRIGGERS_KEY_PREFIX = "archi.arcReminderScheduledTriggers.v1.";

export async function loadArcReminderScheduledTriggers(reminderId: string): Promise<ArcReminderScheduledTrigger[]> {
  const raw = await AsyncStorage.getItem(`${ARC_REMINDER_SCHEDULED_TRIGGERS_KEY_PREFIX}${reminderId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArcReminderScheduledTrigger[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored ArcReminderScheduledTriggers are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

export async function saveArcReminderScheduledTriggers(reminderId: string, triggers: ArcReminderScheduledTrigger[]): Promise<void> {
  await AsyncStorage.setItem(`${ARC_REMINDER_SCHEDULED_TRIGGERS_KEY_PREFIX}${reminderId}`, JSON.stringify(triggers));
}

/** Called when a reminder is deleted -- clears its own scheduled-triggers record so a later reminder id can never accidentally read stale leftovers (ids are randomly generated, but this is a cheap, correct guarantee regardless). */
export async function clearArcReminderScheduledTriggers(reminderId: string): Promise<void> {
  await AsyncStorage.removeItem(`${ARC_REMINDER_SCHEDULED_TRIGGERS_KEY_PREFIX}${reminderId}`);
}

/**
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 3: the supportive-feeling/internal-action bank and its two link
 * collections, same flat-list-CRUD convention as ARC_MANTRA_REMINDERS_KEY
 * above. Four separate keys (never one combined blob) so editing one
 * collection never requires reading/rewriting the others.
 */
const SUPPORTIVE_FEELINGS_KEY = "archi.supportiveFeelings.v1";

export async function loadSupportiveFeelings(): Promise<SupportiveFeeling[]> {
  const raw = await AsyncStorage.getItem(SUPPORTIVE_FEELINGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SupportiveFeeling[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored SupportiveFeelings are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveSupportiveFeelings(feelings: SupportiveFeeling[]): Promise<void> {
  await AsyncStorage.setItem(SUPPORTIVE_FEELINGS_KEY, JSON.stringify(feelings));
}

export async function upsertSupportiveFeelingEntry(feeling: SupportiveFeeling): Promise<void> {
  const feelings = await loadSupportiveFeelings();
  await saveSupportiveFeelings(upsertSupportiveFeelingInList(feelings, feeling));
}

/** Also clears every TaskFeelingLink pointing at this feeling -- its InternalActions and historical InternalActionUsage rows are deliberately left untouched (see arc/supportiveFeelings.ts's own module doc on why usage history must survive a deleted bank entry). */
export async function deleteSupportiveFeelingEntry(id: string): Promise<void> {
  const feelings = await loadSupportiveFeelings();
  await saveSupportiveFeelings(deleteSupportiveFeelingFromList(feelings, id));
  const links = await loadTaskFeelingLinks();
  await saveTaskFeelingLinks(deleteTaskFeelingLinksForFeeling(links, id));
}

const INTERNAL_ACTIONS_KEY = "archi.internalActions.v1";

export async function loadInternalActions(): Promise<InternalAction[]> {
  const raw = await AsyncStorage.getItem(INTERNAL_ACTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as InternalAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored InternalActions are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveInternalActions(actions: InternalAction[]): Promise<void> {
  await AsyncStorage.setItem(INTERNAL_ACTIONS_KEY, JSON.stringify(actions));
}

export async function upsertInternalActionEntry(action: InternalAction): Promise<void> {
  const actions = await loadInternalActions();
  await saveInternalActions(upsertInternalActionInList(actions, action));
}

/** Also clears every FeelingActionLink pointing at this action -- historical InternalActionUsage rows are left untouched, same reasoning as deleteSupportiveFeelingEntry above. */
export async function deleteInternalActionEntry(id: string): Promise<void> {
  const actions = await loadInternalActions();
  await saveInternalActions(deleteInternalActionFromList(actions, id));
  const links = await loadFeelingActionLinks();
  await saveFeelingActionLinks(deleteFeelingActionLinksForAction(links, id));
}

const TASK_FEELING_LINKS_KEY = "archi.taskFeelingLinks.v1";

export async function loadTaskFeelingLinks(): Promise<TaskFeelingLink[]> {
  const raw = await AsyncStorage.getItem(TASK_FEELING_LINKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TaskFeelingLink[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored TaskFeelingLinks are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveTaskFeelingLinks(links: TaskFeelingLink[]): Promise<void> {
  await AsyncStorage.setItem(TASK_FEELING_LINKS_KEY, JSON.stringify(links));
}

export async function linkSupportiveFeelingToTask(taskId: string, feelingId: string, now: string): Promise<void> {
  const links = await loadTaskFeelingLinks();
  await saveTaskFeelingLinks(addTaskFeelingLink(links, taskId, feelingId, now));
}

export async function unlinkSupportiveFeelingFromTask(taskId: string, feelingId: string): Promise<void> {
  const links = await loadTaskFeelingLinks();
  await saveTaskFeelingLinks(removeTaskFeelingLink(links, taskId, feelingId));
}

const FEELING_ACTION_LINKS_KEY = "archi.feelingActionLinks.v1";

export async function loadFeelingActionLinks(): Promise<FeelingActionLink[]> {
  const raw = await AsyncStorage.getItem(FEELING_ACTION_LINKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as FeelingActionLink[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored FeelingActionLinks are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveFeelingActionLinks(links: FeelingActionLink[]): Promise<void> {
  await AsyncStorage.setItem(FEELING_ACTION_LINKS_KEY, JSON.stringify(links));
}

export async function linkInternalActionToFeeling(feelingId: string, actionId: string, now: string): Promise<void> {
  const links = await loadFeelingActionLinks();
  await saveFeelingActionLinks(addFeelingActionLink(links, feelingId, actionId, now));
}

export async function unlinkInternalActionFromFeeling(feelingId: string, actionId: string): Promise<void> {
  const links = await loadFeelingActionLinks();
  await saveFeelingActionLinks(removeFeelingActionLink(links, feelingId, actionId));
}

/**
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 5: the flat, append-only effectiveness-rating history behind the
 * personal internal-action ranking (arc/internalActionRating.ts's own
 * computeInternalActionRanking). Never pruned, never aggregated at
 * write time -- every consumer recomputes its own ranking/aggregate on
 * demand from the full history, same convention as arc/factorRating.ts's
 * own FactorRating[].
 */
const INTERNAL_ACTION_USAGES_KEY = "archi.internalActionUsages.v1";

export async function loadInternalActionUsages(): Promise<InternalActionUsage[]> {
  const raw = await AsyncStorage.getItem(INTERNAL_ACTION_USAGES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as InternalActionUsage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored InternalActionUsages are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveInternalActionUsages(usages: InternalActionUsage[]): Promise<void> {
  await AsyncStorage.setItem(INTERNAL_ACTION_USAGES_KEY, JSON.stringify(usages));
}

export async function appendInternalActionUsageEntry(usage: InternalActionUsage): Promise<void> {
  const usages = await loadInternalActionUsages();
  await saveInternalActionUsages([...usages, usage]);
}

/** Finds and replaces one usage by id (used when a usage transitions from "started, unrated" to "rated") -- never appends a second row for the same use. */
export async function updateInternalActionUsageEntry(usage: InternalActionUsage): Promise<void> {
  const usages = await loadInternalActionUsages();
  const index = usages.findIndex((existing) => existing.id === usage.id);
  if (index === -1) return;
  const next = [...usages];
  next[index] = usage;
  await saveInternalActionUsages(next);
}

/**
 * ARCHI -- Body-Sensation Discovery & Four-Component Learning task: the
 * flat, append-only history behind arc/supportiveBodySensation.ts's own
 * computeBodySensationRanking -- a SEPARATE key from INTERNAL_ACTION_USAGES_KEY
 * above, same rationale as that module's own doc comment (a body-sensation
 * discovery is a structurally different event, with fields the internal-
 * action history has no business holding). Never pruned, never
 * aggregated at write time, same convention as every other flat history
 * in this file.
 */
const SUPPORTIVE_BODY_SENSATION_USAGES_KEY = "archi.supportiveBodySensationUsages.v1";

export async function loadSupportiveBodySensationUsages(): Promise<SupportiveBodySensationUsage[]> {
  const raw = await AsyncStorage.getItem(SUPPORTIVE_BODY_SENSATION_USAGES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SupportiveBodySensationUsage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[storage] Stored SupportiveBodySensationUsages are not valid JSON -- returning an empty list rather than crashing.");
    return [];
  }
}

async function saveSupportiveBodySensationUsages(usages: SupportiveBodySensationUsage[]): Promise<void> {
  await AsyncStorage.setItem(SUPPORTIVE_BODY_SENSATION_USAGES_KEY, JSON.stringify(usages));
}

export async function appendSupportiveBodySensationUsageEntry(usage: SupportiveBodySensationUsage): Promise<void> {
  const usages = await loadSupportiveBodySensationUsages();
  await saveSupportiveBodySensationUsages([...usages, usage]);
}

/** Finds and replaces one usage by id (used when a discovery transitions to "rated") -- never appends a second row for the same discovery. */
export async function updateSupportiveBodySensationUsageEntry(usage: SupportiveBodySensationUsage): Promise<void> {
  const usages = await loadSupportiveBodySensationUsages();
  const index = usages.findIndex((existing) => existing.id === usage.id);
  if (index === -1) return;
  const next = [...usages];
  next[index] = usage;
  await saveSupportiveBodySensationUsages(next);
}

/**
 * Resolves "was the task actually started" (section 7's own separately-
 * measured outcome) from OUTSIDE ARC entirely -- called once from
 * live/ActiveTaskScreen.tsx's performStart() with `started: true`, and
 * once from data/taskNotStartedNotification.ts's finishOrGiveUpTask()
 * give-up branch with `started: false`. Only touches rows still
 * unresolved (taskStarted === null) under one of the given context
 * keys -- a row already resolved by an earlier, more specific signal is
 * never overwritten.
 */
export async function markSupportiveBodySensationUsagesTaskOutcome(contextKeys: string[], started: boolean, now: string): Promise<void> {
  if (contextKeys.length === 0) return;
  const usages = await loadSupportiveBodySensationUsages();
  let changed = false;
  const next = usages.map((usage) => {
    if (usage.taskStarted !== null || !contextKeys.includes(usage.contextKey)) return usage;
    changed = true;
    return { ...usage, taskStarted: started, startedCheckedAt: now };
  });
  if (changed) await saveSupportiveBodySensationUsages(next);
}

/**
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, sections
 * 7-10: single-slot store for the ONE in-progress Task LIVE continuation
 * loop (arc/taskContinuationLoop.ts) -- same singleton convention as
 * TASK_TIMER_RUN_KEY (a trainee runs one continuation loop at a time,
 * for whichever task is currently active). Survives app close/reopen by
 * construction, same as every other single-slot session record in this
 * file.
 */
const TASK_CONTINUATION_LOOP_KEY = "archi.taskContinuationLoop.v1";

export async function loadTaskContinuationLoop(): Promise<TaskContinuationLoopState | null> {
  const raw = await AsyncStorage.getItem(TASK_CONTINUATION_LOOP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TaskContinuationLoopState;
  } catch (error) {
    console.warn("[storage] Stored TaskContinuationLoopState is not valid JSON -- treating as unset rather than crashing.", error);
    return null;
  }
}

export async function saveTaskContinuationLoop(state: TaskContinuationLoopState): Promise<void> {
  await AsyncStorage.setItem(TASK_CONTINUATION_LOOP_KEY, JSON.stringify(state));
}

export async function clearTaskContinuationLoop(): Promise<void> {
  await AsyncStorage.removeItem(TASK_CONTINUATION_LOOP_KEY);
}

/**
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 12: a loop's own segments/totalWorkedSeconds/lastArcTrack/endReason
 * already capture everything the spec asks to "store separately" --
 * this is simply where that record survives PAST the single-slot
 * TaskContinuationLoop above being cleared when the loop ends, so a
 * "user_stopped"/"next_task_boundary" (partial) loop's real worked time
 * and choices are never deleted, same append-only precedent as
 * appendTaskOccurrenceCompletion above. The caller appends the loop's
 * own final state (after endTaskContinuationLoop) right before clearing
 * the live slot -- never pruned, never aggregated away.
 */
const TASK_CONTINUATION_LOOP_HISTORY_KEY = "archi.taskContinuationLoopHistory.v1";

export async function loadTaskContinuationLoopHistory(): Promise<TaskContinuationLoopState[]> {
  const raw = await AsyncStorage.getItem(TASK_CONTINUATION_LOOP_HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TaskContinuationLoopState[];
  } catch (error) {
    console.warn("[storage] Stored TaskContinuationLoopState history is not valid JSON -- returning an empty list rather than crashing.", error);
    return [];
  }
}

export async function appendTaskContinuationLoopHistoryEntry(entry: TaskContinuationLoopState): Promise<void> {
  const existing = await loadTaskContinuationLoopHistory();
  await AsyncStorage.setItem(TASK_CONTINUATION_LOOP_HISTORY_KEY, JSON.stringify([...existing, entry]));
}

/**
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 4: live/SupportiveActionFlowScreen.tsx's own in-progress state --
 * single-slot, same convention as every other session record in this
 * file. Exists ONLY so the flow survives navigating away to the
 * existing Full/Shortened ARC route (never NewArcLiveScreen.tsx's own
 * internals, which this task must not touch) and back: `awaitingArcReturn`
 * is set right before that navigation and is the ONE signal
 * live/ActiveTaskScreen.tsx's own small redirect effect acts on, so an
 * ordinary visit to a task with no pending flow is never affected.
 */
export interface SupportiveActionFlowPendingState {
  taskId: string;
  feelingId: string;
  actionId: string;
  internalStateAtStart: InternalState;
  arcTrackChosen: ArcTrackChosen;
  usageId: string;
  step: "perform" | "rating";
  awaitingArcReturn: boolean;
}

const SUPPORTIVE_ACTION_FLOW_PENDING_KEY = "archi.supportiveActionFlowPending.v1";

export async function loadSupportiveActionFlowPending(): Promise<SupportiveActionFlowPendingState | null> {
  const raw = await AsyncStorage.getItem(SUPPORTIVE_ACTION_FLOW_PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SupportiveActionFlowPendingState;
  } catch (error) {
    console.warn("[storage] Stored SupportiveActionFlowPendingState is not valid JSON -- treating as unset rather than crashing.", error);
    return null;
  }
}

export async function saveSupportiveActionFlowPending(state: SupportiveActionFlowPendingState): Promise<void> {
  await AsyncStorage.setItem(SUPPORTIVE_ACTION_FLOW_PENDING_KEY, JSON.stringify(state));
}

export async function clearSupportiveActionFlowPending(): Promise<void> {
  await AsyncStorage.removeItem(SUPPORTIVE_ACTION_FLOW_PENDING_KEY);
}

/**
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 2: the ONE "task not started" notification's own persisted state --
 * its stable notificationId plus which task it was last shown for, so
 * recomputeTaskNotStartedNotification (data/taskNotStartedNotification.ts)
 * always updates the SAME displayed notification in place (never a
 * duplicate) and can tell, on redisplay for the exact same task, that no
 * new alert sound should play. Mirrors TaskTransitionNotificationState's
 * own shape and purpose exactly.
 */
export interface TaskNotStartedNotificationState {
  notificationId: string;
  alertedTaskId: string | null;
  alertedAt: string;
  /** ARCHI -- Dynamic Time Planning & Free-Window Utilization task, section 2: the resolveFreeTimeWindowKey of the later-today window the move-suggestion body line was offered against, so a body tap knows whether to route to the move-confirm screen; null when no later window qualified (backfilled to null for pre-existing records). */
  moveSuggestionWindowKey: string | null;
}

const TASK_NOT_STARTED_NOTIFICATION_STATE_KEY = "archi.taskNotStartedNotificationState.v1";

export async function loadTaskNotStartedNotificationState(): Promise<TaskNotStartedNotificationState | null> {
  const raw = await AsyncStorage.getItem(TASK_NOT_STARTED_NOTIFICATION_STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TaskNotStartedNotificationState;
    return { ...parsed, moveSuggestionWindowKey: parsed.moveSuggestionWindowKey ?? null };
  } catch (error) {
    console.warn("[storage] Stored TaskNotStartedNotificationState is not valid JSON -- treating as unset rather than crashing.", error);
    return null;
  }
}

export async function saveTaskNotStartedNotificationState(state: TaskNotStartedNotificationState): Promise<void> {
  await AsyncStorage.setItem(TASK_NOT_STARTED_NOTIFICATION_STATE_KEY, JSON.stringify(state));
}

export async function clearTaskNotStartedNotificationState(): Promise<void> {
  await AsyncStorage.removeItem(TASK_NOT_STARTED_NOTIFICATION_STATE_KEY);
}

/**
 * ARCHI -- Dynamic Time Planning & Free-Window Utilization task: own
 * persisted state for the free-time-window notification
 * (data/freeTimeWindowNotification.ts), mirroring TaskNotStartedNotificationState's
 * shape/purpose exactly but never merged into it -- this codebase's
 * convention is one storage key per notification kind. `windowKey` is
 * resolveFreeTimeWindowKey's own identity string, so a redisplay/cancel can
 * tell whether the currently-shown notification is still for the same
 * window. `shownTaskIds` is what makes "הצע משימה אחרת" work with the app
 * fully closed: each tap re-displays excluding every id already shown for
 * this exact window.
 */
export interface FreeTimeWindowNotificationState {
  notificationId: string;
  windowKey: string;
  shownTaskIds: string[];
  displayedAt: string;
}

const FREE_TIME_WINDOW_NOTIFICATION_STATE_KEY = "archi.freeTimeWindowNotificationState.v1";

export async function loadFreeTimeWindowNotificationState(): Promise<FreeTimeWindowNotificationState | null> {
  const raw = await AsyncStorage.getItem(FREE_TIME_WINDOW_NOTIFICATION_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FreeTimeWindowNotificationState;
  } catch (error) {
    console.warn("[storage] Stored FreeTimeWindowNotificationState is not valid JSON -- treating as unset rather than crashing.", error);
    return null;
  }
}

export async function saveFreeTimeWindowNotificationState(state: FreeTimeWindowNotificationState): Promise<void> {
  await AsyncStorage.setItem(FREE_TIME_WINDOW_NOTIFICATION_STATE_KEY, JSON.stringify(state));
}

export async function clearFreeTimeWindowNotificationState(): Promise<void> {
  await AsyncStorage.removeItem(FREE_TIME_WINDOW_NOTIFICATION_STATE_KEY);
}

/**
 * ARCHI -- Replan Time task: the ONE "replan time" notification's own
 * persisted state, mirroring TaskNotStartedNotificationState's shape
 * and purpose exactly (own storage key -- this codebase's standing
 * convention is one key per notification kind) so
 * recomputeReplanTimeNotification (data/replanTimeNotification.ts)
 * always updates the SAME displayed notification in place.
 */
export interface ReplanTimeNotificationState {
  notificationId: string;
  alertedTaskId: string | null;
  alertedAt: string;
}

const REPLAN_TIME_NOTIFICATION_STATE_KEY = "archi.replanTimeNotificationState.v1";

export async function loadReplanTimeNotificationState(): Promise<ReplanTimeNotificationState | null> {
  const raw = await AsyncStorage.getItem(REPLAN_TIME_NOTIFICATION_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReplanTimeNotificationState;
  } catch (error) {
    console.warn("[storage] Stored ReplanTimeNotificationState is not valid JSON -- treating as unset rather than crashing.", error);
    return null;
  }
}

export async function saveReplanTimeNotificationState(state: ReplanTimeNotificationState): Promise<void> {
  await AsyncStorage.setItem(REPLAN_TIME_NOTIFICATION_STATE_KEY, JSON.stringify(state));
}

export async function clearReplanTimeNotificationState(): Promise<void> {
  await AsyncStorage.removeItem(REPLAN_TIME_NOTIFICATION_STATE_KEY);
}
