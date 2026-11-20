/**
 * arc/plannedArc.ts
 *
 * ARC-system upgrade task, Parts C/D: a named, editable "planned ARC"
 * (Full or Mini) -- generated automatically from a completed
 * SPONTANEOUS session (Part C), and/or created and edited directly in
 * the library (Part D). Carries exactly the six practice data points
 * the spec names (Trigger, Emotion, Positive Sensation, Positive
 * Movement, Emotional Action, Identity Action) plus naming/mantra/
 * belief-selection and a frozen link back to the exercise it came from.
 *
 * A PlannedArc is a plain, independent, COPIED record -- editing it
 * never reaches back into the originating NewArcLiveSessionState (which
 * may not even still exist in storage by the time it's edited) and
 * never retroactively changes the original spontaneous exercise (spec:
 * "עריכת התרגיל המתוכנן לא תשנה את התרגיל הספונטני המקורי").
 */

import type { BodyRegion } from "./bodyRegionRoles.ts";
import type { EmotionSelection, NewArcLiveGoalType, NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { EMOTION_OPTION_LABELS, STANDALONE_ARC_TASK_ID } from "./newArcLiveTypes.ts";
import type { PlannedArcPrefillFields } from "./newArcLiveSteps.ts";
import type { ArcBelief } from "./arcInsightBelief.ts";
// Three-levels-of-acceptance task: reused UNCHANGED from the existing,
// independent ARC Thought engine -- never a second, parallel type.
import type { ThoughtTimeOrientation } from "./types.ts";
// ARC alarm task: the standalone alarm's own recurrence reuses Task's
// exact {kind:"once"} | {kind:"recurring", daysOfWeek} shape -- never a
// second, parallel recurrence type for "daily or chosen weekdays".
import type { TaskRecurrence } from "./tasks.ts";

export type PlannedArcKind = "full" | "mini";

/**
 * ARC alarm task, section 1: the two scheduling types a planned ARC's
 * own "שעון מעורר לתרגול" can use. "before_task" reuses the task this
 * item is linked to (linkedTaskId) -- its own scheduledTime/
 * scheduledDate/recurrence/arcWindowMinutesBefore, via
 * arc/taskScheduledStart.ts's resolveNextArcWindowOccurrence -- and is
 * only ever a valid choice when linkedTaskId is non-null (see
 * canUseBeforeTaskAlarmTiming below). "standalone" uses this item's
 * OWN arcAlarmTime/arcAlarmDate/arcAlarmRecurrence fields below,
 * entirely independent of any task.
 */
export type PlannedArcAlarmTimingKind = "before_task" | "standalone";

export interface PlannedArc {
  id: string;
  /** Editable at any time (Part D) -- never regenerated from the other fields once set. */
  name: string;
  kind: PlannedArcKind;
  track: NewArcLiveGoalType;
  triggerText: string | null;
  selectedEmotion: EmotionSelection | null;
  customEmotionText: string | null;
  /** Urge-stop task, requirement 6: editable here (build/PlannedArcEditorScreen.tsx), carried from the originating spontaneous session's own urgeText (requirement 5), or null if none was identified. */
  urgeText: string | null;
  /** Three-levels-of-acceptance task, section 7: the original thought text and its time classification, if present -- editable here (build/PlannedArcEditorScreen.tsx), carried from the originating spontaneous session's own currentThought/thoughtTimeOrientation, or null if no thought was identified. Never invented when the trainee didn't actually write one. */
  thoughtText: string | null;
  thoughtTimeOrientation: ThoughtTimeOrientation | null;
  /** Unified awareness/urge/thought/interpretation update, section 7: editable here (build/PlannedArcEditorScreen.tsx), carried from the originating spontaneous session's own interpretationText, or null if none was given. A SEPARATE field from thoughtText -- never merged, never auto-classified from an old thought (section 7's own backward-compatibility requirement). */
  interpretationText: string | null;
  supportiveBodyArea: BodyRegion | null;
  supportiveSensation: string | null;
  positiveMovement: string | null;
  /** Set only for the Emotional/Combined tracks. */
  emotionalActionText: string | null;
  /** The identity action text (the linked task's own firstAction at the moment of generation) -- set only when linkedTaskId is non-null. */
  identityActionText: string | null;
  /** The task this draft is linked to, if any -- a reference, never a duplicate of the task's own data (same convention as arc/libraryRelationships.ts's other library-to-task links). Null for an Emotional-track draft generated from a standalone session. */
  linkedTaskId: string | null;
  mantraText: string | null;
  /** Part E.2: which saved belief (by id, from the arc/arcInsightBelief.ts library) is active for THIS draft -- never stored on the belief itself, since several drafts may each have their own active choice among the same shared beliefs. */
  activeEmotionalBeliefId: string | null;
  activeIdentityBeliefId: string | null;
  /** The originating spontaneous session's own createdAt -- a frozen reference for traceability only, never re-read live. */
  sourceSpontaneousExerciseId: string;
  createdAt: string;
  updatedAt: string;

  /** ARC alarm task, section 3: off by default -- "אין להפעיל שעון מעורר ללא בחירה של המשתמש." */
  arcAlarmEnabled: boolean;
  /** Only meaningful when arcAlarmEnabled. Defaults to "standalone"; "before_task" requires linkedTaskId to be set (see canUseBeforeTaskAlarmTiming). */
  arcAlarmTimingKind: PlannedArcAlarmTimingKind;
  /** "HH:MM", device-local. Only meaningful for "standalone". */
  arcAlarmTime: string | null;
  /** "YYYY-MM-DD". Only meaningful for a "standalone" alarm whose arcAlarmRecurrence.kind is "once". */
  arcAlarmDate: string | null;
  /** Only meaningful for "standalone" -- "once" (a specific date) or "recurring" (daily, when daysOfWeek is all 7, or chosen weekdays). */
  arcAlarmRecurrence: TaskRecurrence;
  /** Single-slot native-alarm bookkeeping, same {notificationId, scheduledFor} pair convention as Task's own fields. */
  arcAlarmNotificationId: string | null;
  arcAlarmScheduledFor: string | null;
}

/** ARC alarm task, section 1: "before_task" timing needs an actual task to compute its time from -- never offered (and, if somehow set anyway, never resolves to an occurrence; see arc/taskScheduledStart.ts's resolveNextArcWindowOccurrence) for a draft with no linkedTaskId. */
export function canUseBeforeTaskAlarmTiming(item: Pick<PlannedArc, "linkedTaskId">): boolean {
  return item.linkedTaskId !== null;
}

/**
 * Backfills every alarm field a PlannedArc saved before the ARC alarm
 * task existed might be missing, so every other reader can assume a
 * fully-populated record -- the same normalize-at-load-time pattern as
 * arc/tasks.ts's own normalizeTask (see that function's own doc for
 * the concrete motivating bug this guards against). A disabled alarm
 * with "standalone" timing and a one-time, dateless recurrence is the
 * correct inert default -- never silently enabling an alarm nobody
 * asked for.
 */
export function normalizePlannedArc(item: PlannedArc): PlannedArc {
  return {
    ...item,
    arcAlarmEnabled: item.arcAlarmEnabled ?? false,
    arcAlarmTimingKind: item.arcAlarmTimingKind ?? "standalone",
    arcAlarmTime: item.arcAlarmTime ?? null,
    arcAlarmDate: item.arcAlarmDate ?? null,
    arcAlarmRecurrence: item.arcAlarmRecurrence ?? { kind: "once" },
    arcAlarmNotificationId: item.arcAlarmNotificationId ?? null,
    arcAlarmScheduledFor: item.arcAlarmScheduledFor ?? null,
  };
}

/** A short, deterministic default name -- never invented/guessed beyond what the trainee actually entered; always editable afterward (Part D). */
export function defaultPlannedArcName(session: NewArcLiveSessionState, kind: PlannedArcKind): string {
  const topic =
    session.triggerText?.trim() ||
    (session.selectedEmotion === "other" ? session.customEmotionText?.trim() : session.selectedEmotion ? EMOTION_OPTION_LABELS[session.selectedEmotion] : null) ||
    "תרגיל";
  return kind === "mini" ? `Mini ARC ל־${topic}` : `ARC ל־${topic}`;
}

/**
 * Builds one PlannedArc from a just-completed spontaneous session's own
 * state -- never from a planned session (spontaneous-only generation is
 * Part C's own explicit scope). Pure; the caller does the actual
 * persistence and the duplicate-prevention check (hasDraftForExercise
 * below).
 */
export function createPlannedArcFromSession(session: NewArcLiveSessionState, kind: PlannedArcKind, id: string, now: string): PlannedArc {
  const isStandalone = session.taskId === STANDALONE_ARC_TASK_ID;
  return {
    id,
    name: defaultPlannedArcName(session, kind),
    kind,
    track: session.goalType ?? "emotion_only",
    triggerText: session.triggerText,
    selectedEmotion: session.selectedEmotion,
    customEmotionText: session.customEmotionText,
    urgeText: session.urgeText,
    thoughtText: session.currentThought,
    thoughtTimeOrientation: session.thoughtTimeOrientation,
    interpretationText: session.interpretationText,
    supportiveBodyArea: session.supportiveBodyArea,
    supportiveSensation: session.supportiveSensation,
    positiveMovement: session.positiveMovement,
    emotionalActionText: session.emotionalActionText,
    identityActionText: isStandalone ? null : session.firstAction || null,
    linkedTaskId: isStandalone ? null : session.taskId,
    mantraText: session.miniMantraText,
    activeEmotionalBeliefId: null,
    activeIdentityBeliefId: null,
    sourceSpontaneousExerciseId: session.createdAt,
    createdAt: now,
    updatedAt: now,
    arcAlarmEnabled: false,
    arcAlarmTimingKind: "standalone",
    arcAlarmTime: null,
    arcAlarmDate: null,
    arcAlarmRecurrence: { kind: "once" },
    arcAlarmNotificationId: null,
    arcAlarmScheduledFor: null,
  };
}

/** Part C: "יש למנוע יצירת כפילויות כאשר אירוע סיום מעובד יותר מפעם אחת" -- checked BEFORE inserting, for this exact exercise + kind pair (one spontaneous exercise generates exactly one Full and one Mini draft, never two of the same kind). */
export function hasDraftForExercise(list: PlannedArc[], sourceSpontaneousExerciseId: string, kind: PlannedArcKind): boolean {
  return list.some((item) => item.sourceSpontaneousExerciseId === sourceSpontaneousExerciseId && item.kind === kind);
}

export function upsertPlannedArcInList(list: PlannedArc[], item: PlannedArc): PlannedArc[] {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

export function deletePlannedArcFromList(list: PlannedArc[], id: string): PlannedArc[] {
  return list.filter((item) => item.id !== id);
}

export function generatePlannedArcId(): string {
  return `planned-arc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Only the kinds of PlannedArc worth listing for the ARC window/library "run" action -- "full" and "mini" are the only two kinds that exist. */
export function plannedArcsOfKind(list: PlannedArc[], kind: PlannedArcKind): PlannedArc[] {
  return list.filter((item) => item.kind === kind).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Part 5: resolves the draft's own fields into the plain shape
 * arc/newArcLiveSteps.ts's createSessionFromPlannedArcFields expects --
 * the one place that decides WHICH belief (emotional vs. identity)
 * feeds the encoding step when the draft's own track is ambiguous
 * (combined): identity is preferred there, since encoding leads toward
 * the eventual action, falling back to the emotional belief when no
 * identity belief was chosen. `beliefsById` is the trainee's own full
 * belief library (arc/arcInsightBelief.ts) -- this never invents belief
 * text, it only looks up what the draft already references.
 */
export function resolvePlannedArcPrefillFields(item: PlannedArc, beliefsById: Map<string, ArcBelief>): PlannedArcPrefillFields {
  const identityBeliefText = item.activeIdentityBeliefId ? beliefsById.get(item.activeIdentityBeliefId)?.text ?? null : null;
  const emotionalBeliefText = item.activeEmotionalBeliefId ? beliefsById.get(item.activeEmotionalBeliefId)?.text ?? null : null;
  return {
    goalType: item.track,
    triggerText: item.triggerText,
    supportiveBodyArea: item.supportiveBodyArea,
    supportiveSensation: item.supportiveSensation,
    positiveMovement: item.positiveMovement,
    mantraText: item.mantraText,
    beliefText: item.track === "emotion_only" ? emotionalBeliefText : identityBeliefText ?? emotionalBeliefText,
    urgeText: item.urgeText,
    thoughtText: item.thoughtText,
    thoughtTimeOrientation: item.thoughtTimeOrientation,
    interpretationText: item.interpretationText,
  };
}
