/**
 * arc/arcGym.ts
 *
 * ARC GYM task: pure data model + logic for "חדר הכושר של ARC" -- a
 * personalized behavioral training environment built ENTIRELY on top
 * of data this app already has or already models elsewhere. No
 * AsyncStorage, no navigation, no React -- same split as every other
 * arc/*.ts module.
 *
 * ARC GYM never duplicates:
 * - The Manifest behavior itself (arc/purposeManifest.ts's own
 *   FutureBehavior.description) -- read verbatim, never copied into a
 *   second "behavior" entity. An ArcGymSituation only ever stores a
 *   snapshot of the TEXT (behaviorText) alongside the originating
 *   (manifestId, behaviorId) pair, so "preserve the original wording"
 *   holds even if the Manifest behavior is later edited or the whole
 *   Manifest removed.
 * - The ARC LIVE engine (arc/newArcLiveSteps.ts/arc/newArcLiveCopy.ts) --
 *   ARC GYM only ever SUPPLIES a session with an arcGymSituationId +
 *   a pre-resolved arcGymVisualizationText (see
 *   resolveArcGymActionVisualization below); it never re-implements
 *   emotion/presence/body-scan/acceptance/regulation/encoding.
 * - Body-scan types (arc/bodyScanSelection.ts) -- ArcGymMemory's own
 *   body-sensation fields are the EXACT same selection types a
 *   NewArcLiveSessionState already carries, never a parallel shape.
 *
 * "One shared visualization mechanism" (requirement 7's own closing
 * instruction): resolveArcGymActionVisualization is the ONE function
 * every pathway (Full ARC's Encoding override, Shortened ARC's Encoding
 * override, and the dedicated visualization-only screen) calls --
 * never three independent copies that could drift out of sync.
 */

import type { BodyRegion } from "./bodyRegionRoles.ts";
import type { BodyScanRegion } from "./bodyScanRegions.ts";
import type { BodyScanContractionSelection, BodyScanHeavinessSelection, BodyScanSide } from "./bodyScanSelection.ts";
import type { FutureBehavior, PurposeManifest } from "./purposeManifest.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";

// --- Behavioral obstacles (requirement 3) ---------------------------------

export const ARC_GYM_OBSTACLE_OPTIONS = [
  "hesitation",
  "fear",
  "insecurity",
  "lack_of_focus",
  "existing_habits",
  "procrastination",
  "avoidance",
  "lack_of_motivation",
  "emotional_overload",
  "hindering_thoughts",
] as const;
export type ArcGymObstacleOption = (typeof ARC_GYM_OBSTACLE_OPTIONS)[number];
/** "other" means a free-typed obstacle instead of a fixed option -- same convention as EmotionSelection's own "other". Deliberately just a plain, user-described label: never classified as (or stored alongside) a medical diagnosis. */
export type ArcGymObstacle = ArcGymObstacleOption | "other";

export const ARC_GYM_OBSTACLE_LABELS: Record<ArcGymObstacleOption, string> = {
  hesitation: "הססנות",
  fear: "פחד",
  insecurity: "חוסר ביטחון",
  lack_of_focus: "חוסר ריכוז",
  existing_habits: "הרגלים קיימים",
  procrastination: "דחיינות",
  avoidance: "הימנעות",
  lack_of_motivation: "חוסר מוטיבציה",
  emotional_overload: "עומס רגשי",
  hindering_thoughts: "מחשבות מעכבות",
};

/**
 * One record per Manifest behavior (keyed by (manifestId, behaviorId)) --
 * obstacles are asked once per behavior (requirement 3) and every
 * situation under that behavior reads this SAME record for "relevant
 * behavioral obstacles" (requirement 4's own point 2), never a
 * redundant per-situation copy that could silently drift out of sync.
 * Editable at any time (requirement 3's own "edit, add or remove
 * obstacles later").
 */
export interface ArcGymBehaviorObstacles {
  manifestId: string;
  behaviorId: string;
  obstacles: ArcGymObstacle[];
  /** Only meaningful when "other" is included above -- the trainee's own free-typed obstacle description. */
  customText: string | null;
  updatedAt: string;
}

export function createEmptyArcGymBehaviorObstacles(manifestId: string, behaviorId: string, now: string): ArcGymBehaviorObstacles {
  return { manifestId, behaviorId, obstacles: [], customText: null, updatedAt: now };
}

export function findArcGymBehaviorObstacles(records: ArcGymBehaviorObstacles[], manifestId: string, behaviorId: string): ArcGymBehaviorObstacles | null {
  return records.find((record) => record.manifestId === manifestId && record.behaviorId === behaviorId) ?? null;
}

export function toggleArcGymObstacle(record: ArcGymBehaviorObstacles, obstacle: ArcGymObstacle, now: string): ArcGymBehaviorObstacles {
  const has = record.obstacles.includes(obstacle);
  return { ...record, obstacles: has ? record.obstacles.filter((candidate) => candidate !== obstacle) : [...record.obstacles, obstacle], updatedAt: now };
}

export function setArcGymObstacleCustomText(record: ArcGymBehaviorObstacles, customText: string, now: string): ArcGymBehaviorObstacles {
  const trimmed = customText.trim();
  const obstacles = trimmed && !record.obstacles.includes("other") ? [...record.obstacles, "other" as ArcGymObstacle] : record.obstacles;
  return { ...record, obstacles, customText: trimmed || null, updatedAt: now };
}

export function upsertArcGymBehaviorObstaclesInList(records: ArcGymBehaviorObstacles[], record: ArcGymBehaviorObstacles): ArcGymBehaviorObstacles[] {
  const index = records.findIndex((existing) => existing.manifestId === record.manifestId && existing.behaviorId === record.behaviorId);
  if (index === -1) return [...records, record];
  const next = [...records];
  next[index] = record;
  return next;
}

// --- Resolving selectable behaviors from the existing Manifest data ------

export interface ArcGymBehaviorOption {
  manifestId: string;
  behaviorId: string;
  /** Verbatim FutureBehavior.description -- never reworded, never truncated. */
  text: string;
}

/**
 * Requirement 2: "retrieve behaviors from the existing Manifest data,
 * do not invent or hardcode behaviors." Flattens every non-blank
 * behavior across every saved PurposeManifest (a manifest need not be
 * fully "complete" -- arc/purposeManifest.ts's own isPurposeManifestComplete
 * gate is for the unrelated daily-rotation popup, never a requirement
 * for ARC GYM to let the trainee train a behavior they've already
 * written down).
 */
export function resolveArcGymBehaviorOptions(manifests: PurposeManifest[]): ArcGymBehaviorOption[] {
  const options: ArcGymBehaviorOption[] = [];
  for (const manifest of manifests) {
    for (const behavior of manifest.behaviors) {
      if (behavior.description.trim()) options.push({ manifestId: manifest.id, behaviorId: behavior.id, text: behavior.description.trim() });
    }
  }
  return options;
}

export function findFutureBehavior(manifests: PurposeManifest[], manifestId: string, behaviorId: string): FutureBehavior | null {
  const manifest = manifests.find((candidate) => candidate.id === manifestId);
  if (!manifest) return null;
  return manifest.behaviors.find((behavior) => behavior.id === behaviorId) ?? null;
}

// --- Situations (requirement 4) -------------------------------------------

export interface ArcGymSituation {
  id: string;
  manifestId: string;
  behaviorId: string;
  /** Snapshot of the behavior's own wording at the moment this situation was created -- "preserve the original wording and meaning," even across a later Manifest edit or deletion. */
  behaviorText: string;
  /** "באילו סיטואציות הקושי הזה מופיע?" */
  situationDescription: string;
  /** The specific trigger, e.g. "כשאני רואה את הנהג ורוצה לפנות אליו." */
  trigger: string;
  /** "מה בדיוק היית רוצה לעשות בסיטואציה הזאת?" -- a concrete, observable behavior whenever possible. The PRIMARY instruction resolveArcGymActionVisualization reads -- never overridden by behaviorText when this is present (requirement 4's own "do not rely only on a broad Manifest value when the user has defined a more specific action"). */
  desiredAction: string;
  /** Optional free-text contextual/visualization notes the trainee adds themselves (requirement 4's own point 6) -- never auto-generated. */
  visualizationDetails: string | null;
  /** ARC Gym + ARC Goal Integration task: ArcGymGoal.id values -- same many-to-many linking convention as ArcResultExercise.linkedTaskIds. */
  linkedGoalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function generateArcGymSituationId(): string {
  return `arc-gym-situation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcGymSituation(
  id: string,
  manifestId: string,
  behaviorId: string,
  behaviorText: string,
  situationDescription: string,
  trigger: string,
  desiredAction: string,
  now: string
): ArcGymSituation {
  return {
    id,
    manifestId,
    behaviorId,
    behaviorText: behaviorText.trim(),
    situationDescription: situationDescription.trim(),
    trigger: trigger.trim(),
    desiredAction: desiredAction.trim(),
    visualizationDetails: null,
    linkedGoalIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** ARC Gym + ARC Goal Integration task: backfills linkedGoalIds for a situation saved before that field existed -- an empty array is exactly its true pre-existing state, never invented. Called once per record by data/storage.ts's own loadArcGymSituations, same convention as normalizePurposeManifest. */
export function normalizeArcGymSituation(situation: ArcGymSituation): ArcGymSituation {
  return { ...situation, linkedGoalIds: Array.isArray(situation.linkedGoalIds) ? situation.linkedGoalIds : [] };
}

export function linkGoalToArcGymSituation(situation: ArcGymSituation, goalId: string, now: string): ArcGymSituation {
  if (situation.linkedGoalIds.includes(goalId)) return situation;
  return { ...situation, linkedGoalIds: [...situation.linkedGoalIds, goalId], updatedAt: now };
}

export function unlinkGoalFromArcGymSituation(situation: ArcGymSituation, goalId: string, now: string): ArcGymSituation {
  if (!situation.linkedGoalIds.includes(goalId)) return situation;
  return { ...situation, linkedGoalIds: situation.linkedGoalIds.filter((id) => id !== goalId), updatedAt: now };
}

/** Requirement 4's own "allow the user to edit the desired action later" / requirement 9's own "update the desired action, edit the imagined situation" -- every field here is independently editable, re-trimmed the same way creation does. */
export function updateArcGymSituation(
  situation: ArcGymSituation,
  patch: Partial<Pick<ArcGymSituation, "situationDescription" | "trigger" | "desiredAction" | "visualizationDetails">>,
  now: string
): ArcGymSituation {
  return {
    ...situation,
    situationDescription: patch.situationDescription !== undefined ? patch.situationDescription.trim() : situation.situationDescription,
    trigger: patch.trigger !== undefined ? patch.trigger.trim() : situation.trigger,
    desiredAction: patch.desiredAction !== undefined ? patch.desiredAction.trim() : situation.desiredAction,
    visualizationDetails: patch.visualizationDetails !== undefined ? patch.visualizationDetails?.trim() || null : situation.visualizationDetails,
    updatedAt: now,
  };
}

export function upsertArcGymSituationInList(situations: ArcGymSituation[], situation: ArcGymSituation): ArcGymSituation[] {
  const index = situations.findIndex((existing) => existing.id === situation.id);
  if (index === -1) return [...situations, situation];
  const next = [...situations];
  next[index] = situation;
  return next;
}

export function listArcGymSituationsForBehavior(situations: ArcGymSituation[], manifestId: string, behaviorId: string): ArcGymSituation[] {
  return situations.filter((situation) => situation.manifestId === manifestId && situation.behaviorId === behaviorId);
}

// --- The ONE shared personalized action-visualization resolver (requirement 7) ---

/**
 * Requirement 7's own central rule: "generate specific, natural Hebrew
 * action-visualization guidance using the actual saved content,"
 * "never substitute generic motivational statements when specific
 * behavior data exists," "do not invent actions, dialogue, details or
 * outcomes." A deterministic TEMPLATE around the trainee's OWN verbatim
 * text is the only way to satisfy both "specific and personalized" AND
 * "never invented" at once without a live language model in the loop:
 * this embeds situationDescription and desiredAction exactly as saved,
 * joined by a fixed, safe connecting phrase -- never rewording,
 * translating person, or adding invented sensory/dialogue detail. This
 * is the ONE function Full ARC's Encoding override, Shortened ARC's
 * Encoding override, and the dedicated visualization-only screen all
 * call -- never three independent copies that could disagree.
 */
export function resolveArcGymActionVisualization(situation: Pick<ArcGymSituation, "situationDescription" | "desiredAction">): string {
  const situationText = situation.situationDescription.trim();
  const actionText = situation.desiredAction.trim();
  if (!situationText && !actionText) return "";
  if (!situationText) return `דמיין את עצמך עושה את זה כרגע: ${actionText}`;
  if (!actionText) return `דמיין את הסיטואציה הזאת: ${situationText}`;
  return `דמיין את הסיטואציה הזאת: ${situationText} כשזה קורה, ${actionText}`;
}

/**
 * Requirement 5's own personalized SITUATION visualization (distinct
 * from the ACTION visualization above -- this happens BEFORE the
 * emotional check-in, imagining the scene itself; the other happens
 * INSIDE Encoding, imagining performing the action). Four fixed,
 * generic prompts, personalized only by substituting the trainee's own
 * verbatim situationDescription/trigger into the first/last -- never
 * inventing new scene details (lighting, other people's reactions,
 * etc.) the trainee never described.
 */
export function resolveArcGymSituationVisualizationPrompts(situation: Pick<ArcGymSituation, "situationDescription" | "trigger">): string[] {
  const prompts = [`דמיין את הסיטואציה הבאה: ${situation.situationDescription}`, "איפה אתה נמצא?", "מה אתה רואה סביבך?"];
  const trigger = situation.trigger.trim();
  prompts.push(trigger ? `מה קורה בדיוק ברגע שבו ${trigger}` : "מה קורה בדיוק ברגע שבו אתה רוצה לפעול?");
  return prompts;
}

// --- Memory: historical thoughts + body sensations (requirements 8+9) ----

/**
 * One record per situation -- "remember information from previous
 * exercises," read on the situation's own screen before training
 * starts (requirement 9) and written back once a training session
 * actually completes (never mid-session, and never for an abandoned
 * session). Deliberately separate from a live NewArcLiveSessionState:
 * "past sensations are historical observations, not necessarily the
 * user's current bodily state" -- this is the ONE place that
 * historical fact lives, never confused with (or silently merged
 * into) whatever a CURRENT session's own fields say.
 */
export interface ArcGymMemory {
  situationId: string;
  lastThought: string | null;
  lastInterpretation: string | null;
  lastContractionRegions: BodyScanContractionSelection[];
  lastHeavinessRegions: BodyScanHeavinessSelection[];
  lastPrimaryOpeningRegion: BodyScanRegion | null;
  lastPrimaryOpeningSide: BodyScanSide;
  lastSupportiveBodyArea: BodyRegion | null;
  lastSupportiveSensation: string | null;
  updatedAt: string;
}

export function createEmptyArcGymMemory(situationId: string, now: string): ArcGymMemory {
  return {
    situationId,
    lastThought: null,
    lastInterpretation: null,
    lastContractionRegions: [],
    lastHeavinessRegions: [],
    lastPrimaryOpeningRegion: null,
    lastPrimaryOpeningSide: null,
    lastSupportiveBodyArea: null,
    lastSupportiveSensation: null,
    updatedAt: now,
  };
}

export function findArcGymMemory(memories: ArcGymMemory[], situationId: string): ArcGymMemory | null {
  return memories.find((memory) => memory.situationId === situationId) ?? null;
}

/**
 * Folds a just-COMPLETED ARC GYM session's own already-captured fields
 * into this situation's memory -- reusing the EXACT same fields a
 * NewArcLiveSessionState already carries (never re-asking for anything
 * twice, never a parallel data-entry mechanism). Called once, at
 * session completion, never mid-session. A Shortened ARC session
 * (which never visits emotion/thought/body-scan at all) simply leaves
 * those fields null/empty on the session, which this correctly treats
 * as "nothing new to remember for that part" -- it never OVERWRITES
 * still-relevant prior memory with blanks: each field is only replaced
 * when the session itself actually captured something for it.
 */
export function recordArcGymMemoryFromSession(memory: ArcGymMemory, session: NewArcLiveSessionState, now: string): ArcGymMemory {
  return {
    ...memory,
    lastThought: session.currentThought ?? memory.lastThought,
    lastInterpretation: session.interpretationText ?? memory.lastInterpretation,
    lastContractionRegions: session.bodyScanContractionRegions.length > 0 ? session.bodyScanContractionRegions : memory.lastContractionRegions,
    lastHeavinessRegions: session.bodyScanHeavinessRegions.length > 0 ? session.bodyScanHeavinessRegions : memory.lastHeavinessRegions,
    lastPrimaryOpeningRegion: session.primaryOpeningBodyScanRegion ?? memory.lastPrimaryOpeningRegion,
    lastPrimaryOpeningSide: session.primaryOpeningBodyScanRegion ? session.primaryOpeningBodyScanSide : memory.lastPrimaryOpeningSide,
    lastSupportiveBodyArea: session.supportiveBodyArea ?? memory.lastSupportiveBodyArea,
    lastSupportiveSensation: session.supportiveSensation ?? memory.lastSupportiveSensation,
    updatedAt: now,
  };
}

/** Requirement 9's own "start a fresh body scan" -- clears only the body-sensation fields, never the thought history (a separate, explicit action from clearing thoughts, since the trainee may want one without the other). */
export function clearArcGymBodySensationMemory(memory: ArcGymMemory, now: string): ArcGymMemory {
  return {
    ...memory,
    lastContractionRegions: [],
    lastHeavinessRegions: [],
    lastPrimaryOpeningRegion: null,
    lastPrimaryOpeningSide: null,
    lastSupportiveBodyArea: null,
    lastSupportiveSensation: null,
    updatedAt: now,
  };
}

export function upsertArcGymMemoryInList(memories: ArcGymMemory[], memory: ArcGymMemory): ArcGymMemory[] {
  const index = memories.findIndex((existing) => existing.situationId === memory.situationId);
  if (index === -1) return [...memories, memory];
  const next = [...memories];
  next[index] = memory;
  return next;
}

// --- Training history (requirement 11) ------------------------------------

export type ArcGymCheckInChoice = "full_arc" | "shortened_arc" | "visualization_only";

export interface ArcGymTrainingRecord {
  id: string;
  situationId: string;
  checkInChoice: ArcGymCheckInChoice;
  startedAt: string;
  /** null while the training is still in progress -- "support resuming interrupted training sessions" reads this to find an unfinished record for the same situation. */
  completedAt: string | null;
  /** Optional, trainee-written, never auto-generated. */
  reflection: string | null;
}

export function generateArcGymTrainingRecordId(): string {
  return `arc-gym-training-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcGymTrainingRecord(id: string, situationId: string, checkInChoice: ArcGymCheckInChoice, now: string): ArcGymTrainingRecord {
  return { id, situationId, checkInChoice, startedAt: now, completedAt: null, reflection: null };
}

export function completeArcGymTrainingRecord(record: ArcGymTrainingRecord, now: string, reflection: string | null = null): ArcGymTrainingRecord {
  return { ...record, completedAt: now, reflection: reflection?.trim() || null };
}

export function upsertArcGymTrainingRecordInList(records: ArcGymTrainingRecord[], record: ArcGymTrainingRecord): ArcGymTrainingRecord[] {
  const index = records.findIndex((existing) => existing.id === record.id);
  if (index === -1) return [...records, record];
  const next = [...records];
  next[index] = record;
  return next;
}

export function listArcGymTrainingRecordsForSituation(records: ArcGymTrainingRecord[], situationId: string): ArcGymTrainingRecord[] {
  return records
    .filter((record) => record.situationId === situationId)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/** "Support resuming interrupted training sessions": the most recent STILL-OPEN (completedAt null) record for this situation, or null if none -- never more than meaningfully one at a time in practice, but this always picks the most recent if duplicates somehow exist. */
export function findOpenArcGymTrainingRecord(records: ArcGymTrainingRecord[], situationId: string): ArcGymTrainingRecord | null {
  const open = records.filter((record) => record.situationId === situationId && record.completedAt === null);
  if (open.length === 0) return null;
  return open.reduce((latest, candidate) => (candidate.startedAt > latest.startedAt ? candidate : latest));
}

// --- ARC Memory: a second, independent ARC GYM exercise type (ARCHI --
// Unified Development Specification task, Part 1) ---------------------

/**
 * A prospective-memory training exercise -- "remember to do X when Y
 * happens" -- entirely independent of the Behaviour exercise type
 * above (ArcGymSituation/ArcGymBehaviorObstacles): it is never derived
 * from a Manifest behavior and never shares a situationId with one.
 * Named ArcGymMemoryExercise, not ArcGymMemory, because ArcGymMemory
 * ALREADY means something else in this file (historical
 * thoughts/sensations remembered BETWEEN training sessions, above) --
 * reusing that name here would silently collide two unrelated
 * concepts under one identifier.
 *
 * Exactly two free-text questions, per the spec: situationText answers
 * "in what situation/when will this come up?" and actionText answers
 * "what do you want to remember to do?" -- both are read back verbatim
 * by resolveArcGymMemoryMantraSteps below, never reworded.
 */
export interface ArcGymMemoryExercise {
  id: string;
  situationText: string;
  actionText: string;
  /** ARC Gym + ARC Goal Integration task: ArcGymGoal.id values -- same many-to-many linking convention as ArcResultExercise.linkedTaskIds. */
  linkedGoalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function generateArcGymMemoryExerciseId(): string {
  return `arc-gym-memory-exercise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcGymMemoryExercise(id: string, situationText: string, actionText: string, now: string): ArcGymMemoryExercise {
  return { id, situationText: situationText.trim(), actionText: actionText.trim(), linkedGoalIds: [], createdAt: now, updatedAt: now };
}

/** ARC Gym + ARC Goal Integration task: same backfill convention as normalizeArcGymSituation above, for data/storage.ts's own loadArcGymMemoryExercises. */
export function normalizeArcGymMemoryExercise(exercise: ArcGymMemoryExercise): ArcGymMemoryExercise {
  return { ...exercise, linkedGoalIds: Array.isArray(exercise.linkedGoalIds) ? exercise.linkedGoalIds : [] };
}

export function linkGoalToArcGymMemoryExercise(exercise: ArcGymMemoryExercise, goalId: string, now: string): ArcGymMemoryExercise {
  if (exercise.linkedGoalIds.includes(goalId)) return exercise;
  return { ...exercise, linkedGoalIds: [...exercise.linkedGoalIds, goalId], updatedAt: now };
}

export function unlinkGoalFromArcGymMemoryExercise(exercise: ArcGymMemoryExercise, goalId: string, now: string): ArcGymMemoryExercise {
  if (!exercise.linkedGoalIds.includes(goalId)) return exercise;
  return { ...exercise, linkedGoalIds: exercise.linkedGoalIds.filter((id) => id !== goalId), updatedAt: now };
}

export function updateArcGymMemoryExercise(exercise: ArcGymMemoryExercise, patch: Partial<Pick<ArcGymMemoryExercise, "situationText" | "actionText">>, now: string): ArcGymMemoryExercise {
  return {
    ...exercise,
    situationText: patch.situationText !== undefined ? patch.situationText.trim() : exercise.situationText,
    actionText: patch.actionText !== undefined ? patch.actionText.trim() : exercise.actionText,
    updatedAt: now,
  };
}

export function upsertArcGymMemoryExerciseInList(exercises: ArcGymMemoryExercise[], exercise: ArcGymMemoryExercise): ArcGymMemoryExercise[] {
  const index = exercises.findIndex((existing) => existing.id === exercise.id);
  if (index === -1) return [...exercises, exercise];
  const next = [...exercises];
  next[index] = exercise;
  return next;
}

export function deleteArcGymMemoryExerciseFromList(exercises: ArcGymMemoryExercise[], id: string): ArcGymMemoryExercise[] {
  return exercises.filter((exercise) => exercise.id !== id);
}

/**
 * The 4-step first-person Hebrew mantra sequence generated ENTIRELY
 * from this exercise's own saved situationText/actionText -- the
 * spec's own "generating the 4-step first-person Hebrew mantras from
 * saved situation+action text," following the exact same
 * never-invent-detail discipline as resolveArcGymActionVisualization
 * above: situationText/actionText are embedded verbatim inside fixed,
 * deterministic Hebrew phrases, never reworded, translated in person,
 * or elaborated with invented detail. Step 4 is the one generic,
 * non-personalized step -- plain self-reinforcement, matching this
 * app's own established "every track ends with reinforcement" pattern
 * (see live/ActiveTaskScreen.tsx's identity-insight prompt) -- it
 * names no new fact about the situation/action that wasn't already
 * stated in steps 1-3.
 */
export function resolveArcGymMemoryMantraSteps(exercise: Pick<ArcGymMemoryExercise, "situationText" | "actionText">): string[] {
  const situationText = exercise.situationText.trim();
  const actionText = exercise.actionText.trim();
  return [
    `אני נמצא בסיטואציה הזאת: ${situationText}`,
    `אני שם לב לרגע הזה, ונזכר: זה הרגע שבו רציתי לפעול.`,
    `אני נזכר בדיוק מה רציתי לעשות: ${actionText}`,
    `אני בוחר לפעול עכשיו, ועושה את זה: ${actionText}`,
  ];
}

export function listArcGymTrainingRecordsForMemoryExercise(records: ArcGymTrainingRecord[], exerciseId: string): ArcGymTrainingRecord[] {
  return listArcGymTrainingRecordsForSituation(records, exerciseId);
}

// --- ARC GYM reminders (ARCHI -- Unified Development Specification task, Part 2) ---

/**
 * A plain date+time reminder to go train -- for EITHER exercise type
 * above (ArcGymSituation, "behaviour", or ArcGymMemoryExercise,
 * "memory"), distinguished by `exerciseKind` rather than two separate
 * reminder types, since the scheduling math and the notification
 * itself are otherwise identical. "Reusing MorningAlarmConfig's
 * recurrenceDays shape" (the spec's own words): `recurrenceDaysOfWeek`
 * is the exact same `number[]` (0=Sunday..6=Saturday) MorningAlarmConfig
 * and ScheduledRoutine already use -- but, unlike those two (always
 * recurring), null here means "one-time," reusing ArcGoalTarget's own
 * "null recurrence = one-time, read dateLocal instead" convention
 * (arc/subGoalExecution.ts) rather than inventing a third shape.
 *
 * "Never creates a Task LIVE session or imposes a duration" (the
 * spec's own explicit requirement): an ArcGymReminder carries no
 * duration field at all, and firing/tapping it only ever deep-links to
 * the named exercise's own existing detail screen -- never a Task,
 * never a timer.
 */
export type ArcGymReminderExerciseKind = "behaviour" | "memory";

export interface ArcGymReminder {
  id: string;
  exerciseKind: ArcGymReminderExerciseKind;
  /** ArcGymSituation.id when exerciseKind is "behaviour", ArcGymMemoryExercise.id when "memory". */
  exerciseId: string;
  hour: number;
  minute: number;
  /** null = one-time (dateLocal below is then the authority); non-empty = recurring on these weekdays. An empty array is never a valid stored state -- treat it the same as null (see resolveArcGymReminderNextOccurrenceDate). */
  recurrenceDaysOfWeek: number[] | null;
  /** Only meaningful when recurrenceDaysOfWeek is null -- the "YYYY-MM-DD" local date this one-time reminder fires on. */
  dateLocal: string | null;
  enabled: boolean;
  /** Only meaningful for a one-time reminder -- true once its single occurrence has fired/been handled, so it's never rescheduled (same role as ArcGoalTarget.status === "completed" for a one-time target). A recurring reminder is never "completed," only ever enabled/disabled. */
  completed: boolean;
  notificationId: string | null;
  notificationScheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

export function generateArcGymReminderId(): string {
  return `arc-gym-reminder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcGymReminder(
  id: string,
  exerciseKind: ArcGymReminderExerciseKind,
  exerciseId: string,
  hour: number,
  minute: number,
  recurrenceDaysOfWeek: number[] | null,
  dateLocal: string | null,
  now: string
): ArcGymReminder {
  return {
    id,
    exerciseKind,
    exerciseId,
    hour,
    minute,
    recurrenceDaysOfWeek,
    dateLocal,
    enabled: true,
    completed: false,
    notificationId: null,
    notificationScheduledFor: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateArcGymReminder(
  reminder: ArcGymReminder,
  patch: Partial<Pick<ArcGymReminder, "hour" | "minute" | "recurrenceDaysOfWeek" | "dateLocal" | "enabled">>,
  now: string
): ArcGymReminder {
  return {
    ...reminder,
    hour: patch.hour ?? reminder.hour,
    minute: patch.minute ?? reminder.minute,
    recurrenceDaysOfWeek: patch.recurrenceDaysOfWeek !== undefined ? patch.recurrenceDaysOfWeek : reminder.recurrenceDaysOfWeek,
    dateLocal: patch.dateLocal !== undefined ? patch.dateLocal : reminder.dateLocal,
    enabled: patch.enabled ?? reminder.enabled,
    // Editing the time/date/recurrence of a one-time reminder that already fired un-completes it -- the trainee is explicitly re-scheduling it, so it must become schedulable again.
    completed: patch.hour !== undefined || patch.minute !== undefined || patch.recurrenceDaysOfWeek !== undefined || patch.dateLocal !== undefined ? false : reminder.completed,
    updatedAt: now,
  };
}

export function isArcGymReminderRecurring(reminder: Pick<ArcGymReminder, "recurrenceDaysOfWeek">): boolean {
  return reminder.recurrenceDaysOfWeek !== null && reminder.recurrenceDaysOfWeek.length > 0;
}

/**
 * The next strictly-future occurrence, mirroring arc/subGoalExecution.ts's
 * own resolveTargetNextOccurrenceDate exactly (same 14-day scan for the
 * recurring case, same "past one-time occurrence has no next one"
 * rule for the one-time case) -- never a second, independently-written
 * date-math implementation.
 */
export function resolveArcGymReminderNextOccurrenceDate(reminder: ArcGymReminder, now: Date = new Date()): Date | null {
  if (!isArcGymReminderRecurring(reminder) && reminder.completed) return null;
  if (isArcGymReminderRecurring(reminder)) {
    const days = reminder.recurrenceDaysOfWeek!;
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const candidateDay = new Date(now);
      candidateDay.setDate(candidateDay.getDate() + dayOffset);
      if (!days.includes(candidateDay.getDay())) continue;
      const candidate = new Date(candidateDay);
      candidate.setHours(reminder.hour, reminder.minute, 0, 0);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
    return null; // Unreachable when days is non-empty.
  }
  if (!reminder.dateLocal) return null;
  const candidate = new Date(`${reminder.dateLocal}T00:00:00`);
  candidate.setHours(reminder.hour, reminder.minute, 0, 0);
  return candidate.getTime() > now.getTime() ? candidate : null;
}

/** Mirrors arc/subGoalExecution.ts's own isTargetNotificationInSync -- "leave it alone" when the already-scheduled notification still matches a freshly-computed next occurrence, so editing a reminder's unrelated fields never churns its notification. */
export function isArcGymReminderNotificationInSync(reminder: ArcGymReminder, now: Date = new Date()): boolean {
  if (!reminder.enabled) return reminder.notificationId === null && reminder.notificationScheduledFor === null;
  const nextOccurrence = resolveArcGymReminderNextOccurrenceDate(reminder, now);
  const targetIso = nextOccurrence ? nextOccurrence.toISOString() : null;
  return reminder.notificationScheduledFor === targetIso && (targetIso === null || reminder.notificationId !== null);
}

export function upsertArcGymReminderInList(reminders: ArcGymReminder[], reminder: ArcGymReminder): ArcGymReminder[] {
  const index = reminders.findIndex((existing) => existing.id === reminder.id);
  if (index === -1) return [...reminders, reminder];
  const next = [...reminders];
  next[index] = reminder;
  return next;
}

export function deleteArcGymReminderFromList(reminders: ArcGymReminder[], id: string): ArcGymReminder[] {
  return reminders.filter((reminder) => reminder.id !== id);
}

export function listArcGymRemindersForExercise(reminders: ArcGymReminder[], exerciseKind: ArcGymReminderExerciseKind, exerciseId: string): ArcGymReminder[] {
  return reminders.filter((reminder) => reminder.exerciseKind === exerciseKind && reminder.exerciseId === exerciseId);
}

const ARC_GYM_REMINDER_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

/** One shared, human-readable summary line for a reminder's own schedule -- used by every screen that lists ArcGymReminders (build/ArcGymSituationScreen.tsx, build/ArcGymMemoryDetailScreen.tsx), never a second, independently-worded formatter. */
export function describeArcGymReminderSchedule(reminder: Pick<ArcGymReminder, "hour" | "minute" | "recurrenceDaysOfWeek" | "dateLocal">): string {
  const time = `${String(reminder.hour).padStart(2, "0")}:${String(reminder.minute).padStart(2, "0")}`;
  if (reminder.recurrenceDaysOfWeek === null || reminder.recurrenceDaysOfWeek.length === 0) {
    return reminder.dateLocal ? `${reminder.dateLocal} בשעה ${time}` : time;
  }
  return `${reminder.recurrenceDaysOfWeek.map((day) => ARC_GYM_REMINDER_DAY_LABELS[day]).join(", ")} בשעה ${time}`;
}
