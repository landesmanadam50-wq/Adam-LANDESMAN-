/**
 * arc/arcPerspective.ts
 *
 * ARC Perspective -- "שינוי פרשנות": a short tool that helps a trainee
 * separate an EVENT from the INTERPRETATION they gave it, regulate
 * their state via the existing ARC engine, shift perspective
 * (imagination for a planned/ARC Gym practice, attention-to-real-colors
 * for a real-time practice), and choose a new interpretation -- never
 * changing the event's own facts, never forcing a positive
 * interpretation. No AsyncStorage, no navigation, no React here -- same
 * split as every other arc/*.ts module (data/storage.ts holds the thin
 * I/O wrapper).
 *
 * Two record types, same "template vs. execution" split as
 * ArcGymMemoryExercise (template) + ArcGymTrainingRecord (one record
 * per practice): ArcPerspectiveEvent is the reusable, editable "saved
 * event" (ARC Gym's own list); ArcPerspectiveSession is one practice of
 * it -- a FROZEN SNAPSHOT of the event's own text at the moment this
 * practice started (same "never silently rewritten by a later template
 * edit" principle as ArcGymSituation.behaviorText), plus everything
 * specific to that one run (mood choice, the new interpretation chosen,
 * which ARC Behaviour exercise it was linked to). A real-time practice
 * creates its OWN event record together with its session -- there is
 * no separate "must save a template first" step; the flow's own first
 * ("event") screen IS the event-creation form either way.
 *
 * Reached from two places, sharing this exact module and the shared UI
 * built on it (live/components/ArcPerspectiveFlow.tsx):
 *   - "planned": a saved ARC Gym exercise (build/ArcGymPerspectiveEventDetailScreen.tsx),
 *     reusable and repeatable across many practices of the same event.
 *   - "real_time": the immediate action-area button on Home
 *     (build/FlexibleDailyScreen.tsx) -- never disrupts an active
 *     task's own timer, since it only ever links the preliminary ARC
 *     check-in to whichever task was already active (activeTaskId,
 *     captured once at session creation, same convention as
 *     ArcDecisionSession.activeTaskId).
 */

export type ArcPerspectiveMode = "planned" | "real_time";

/**
 * Fixed order, matching the spec's own required sequence: event
 * (separating the event from the initial interpretation) -> mood
 * check-in (routes through the EXISTING ARC engine) -> perspective
 * shift (imagination or attention, by mode) -> choosing the new
 * interpretation -> optionally linking it to an ARC Behaviour exercise.
 * Never reordered, never skipped. There is no separate "summary" step
 * value -- once completedAt is set, every caller renders its own
 * finished/summary UI instead of this step sequence, same pattern as
 * ArcDecisionSession (whose own currentStep also never has a "done"
 * value of its own).
 */
export type ArcPerspectiveStep = "event" | "mood_check_in" | "perspective_shift" | "new_interpretation" | "link_behaviour";

export const ARC_PERSPECTIVE_STEP_ORDER: ArcPerspectiveStep[] = ["event", "mood_check_in", "perspective_shift", "new_interpretation", "link_behaviour"];

export type ArcPerspectiveMoodChoice = "full_arc" | "shortened_arc" | "excellent";

/**
 * The reusable, editable "saved event" -- ARC Gym's own list
 * (build/ArcGymPerspectiveListScreen.tsx). Editing this later never
 * rewrites any already-completed ArcPerspectiveSession's own snapshot
 * fields below -- same non-retroactive principle as every other
 * template/execution split in this codebase.
 */
export interface ArcPerspectiveEvent {
  id: string;
  /** "מה האירוע?" -- the factual event, never the interpretation. */
  eventDescription: string;
  /** "מה הפרשנות הראשונית שלך?" -- the negative/unpleasant meaning given to the event. */
  initialInterpretation: string;
  /** "איזו פרשנות חדשה היית רוצה לאמץ?" -- entirely optional; null means never set, as opposed to deliberately cleared (callers always write "" via the setter, never null, so this is only ever null on a freshly created event before any field is touched -- see resolveArcPerspectiveDesiredInterpretationPreset for the one place a blank value is actually read as "none"). */
  desiredInterpretationPreset: string | null;
  createdAt: string;
  updatedAt: string;
}

export function generateArcPerspectiveEventId(): string {
  return `arc-perspective-event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcPerspectiveEvent(id: string, now: string): ArcPerspectiveEvent {
  return { id, eventDescription: "", initialInterpretation: "", desiredInterpretationPreset: null, createdAt: now, updatedAt: now };
}

/** "לערוך אירועים ופרשנויות" -- every field independently editable, trimmed the same way every other update function in this app trims text. */
export function updateArcPerspectiveEvent(
  event: ArcPerspectiveEvent,
  patch: Partial<Pick<ArcPerspectiveEvent, "eventDescription" | "initialInterpretation" | "desiredInterpretationPreset">>,
  now: string
): ArcPerspectiveEvent {
  return {
    ...event,
    eventDescription: patch.eventDescription !== undefined ? patch.eventDescription.trim() : event.eventDescription,
    initialInterpretation: patch.initialInterpretation !== undefined ? patch.initialInterpretation.trim() : event.initialInterpretation,
    desiredInterpretationPreset: patch.desiredInterpretationPreset !== undefined ? (patch.desiredInterpretationPreset?.trim() || null) : event.desiredInterpretationPreset,
    updatedAt: now,
  };
}

export function upsertArcPerspectiveEventInList(events: ArcPerspectiveEvent[], event: ArcPerspectiveEvent): ArcPerspectiveEvent[] {
  const index = events.findIndex((existing) => existing.id === event.id);
  if (index === -1) return [...events, event];
  const next = [...events];
  next[index] = event;
  return next;
}

export function deleteArcPerspectiveEventFromList(events: ArcPerspectiveEvent[], id: string): ArcPerspectiveEvent[] {
  return events.filter((event) => event.id !== id);
}

/**
 * One practice of an event -- "להבדיל בין האירוע השמור לבין כל ביצוע של
 * התרגיל, כך שהמשתמש יוכל לתרגל אירוע אחד מספר פעמים ולשמור פרשנויות
 * שונות לאורך זמן." Also the one, single in-progress record persisted
 * across the ARC detour (data/storage.ts's single-slot
 * loadArcPerspectiveInProgress/saveArcPerspectiveInProgress, same
 * convention as ArcDecision's own in-progress slot) -- completedAt null
 * while in progress, non-null once finished.
 */
export interface ArcPerspectiveSession {
  id: string;
  eventId: string;
  mode: ArcPerspectiveMode;
  /** The task that was actively running (real_time mode) when this session started, if any -- captured ONCE, never re-resolved later, same convention as ArcDecisionSession.activeTaskId. Always null for "planned". */
  activeTaskId: string | null;
  /**
   * Snapshots of the event's own text at the moment this practice
   * started -- plain strings bound directly to the step-1 TextInputs
   * (same direct-bind convention as ArcDecisionSession's own fields),
   * never trimmed until a gate/read function actually needs to.
   */
  eventDescription: string;
  initialInterpretation: string;
  /** Plain string (never null) for the same direct-bind reason as above; "" means none set. resolveArcPerspectiveDesiredInterpretationPreset is the one place a blank value is read as "none," exactly mirroring resolveArcDecisionDesiredOutcome. */
  desiredInterpretationPreset: string;
  moodCheckInChoice: ArcPerspectiveMoodChoice | null;
  currentStep: ArcPerspectiveStep;
  /** "המשתמש יכתוב את הפרשנות החדשה" -- never invented, never auto-filled from desiredInterpretationPreset (the UI only ever offers it as an adoptable suggestion). */
  newInterpretation: string;
  /** ArcGymSituation.id this practice's new interpretation was linked to, if any -- optional, per spec 7.1 ("הקישור יהיה אופציונלי"). */
  linkedArcGymSituationId: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function generateArcPerspectiveSessionId(): string {
  return `arc-perspective-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcPerspectiveSession(mode: ArcPerspectiveMode, eventId: string, activeTaskId: string | null, now: string): ArcPerspectiveSession {
  return {
    id: generateArcPerspectiveSessionId(),
    eventId,
    mode,
    activeTaskId,
    eventDescription: "",
    initialInterpretation: "",
    desiredInterpretationPreset: "",
    moodCheckInChoice: null,
    currentStep: "event",
    newInterpretation: "",
    linkedArcGymSituationId: null,
    startedAt: now,
    completedAt: null,
  };
}

/**
 * Snapshots an existing saved event's own fields into a fresh session
 * -- "לבחור אירוע ששמר... ולבצע תרגול חוזר." The trainee can still edit
 * these per-practice copies on the "event" step without that ever
 * rewriting the event's own template (only its dedicated detail screen
 * does that, via updateArcPerspectiveEvent).
 */
export function seedArcPerspectiveSessionFromEvent(session: ArcPerspectiveSession, event: ArcPerspectiveEvent): ArcPerspectiveSession {
  return {
    ...session,
    eventDescription: event.eventDescription,
    initialInterpretation: event.initialInterpretation,
    desiredInterpretationPreset: event.desiredInterpretationPreset ?? "",
  };
}

/** Mirrors the TextInput's own value exactly -- never trimmed here, so the trainee can type/edit freely; the gate is the one place whitespace-only text is treated as empty. */
export function setArcPerspectiveEventDescription(session: ArcPerspectiveSession, eventDescription: string): ArcPerspectiveSession {
  return { ...session, eventDescription };
}

export function setArcPerspectiveInitialInterpretation(session: ArcPerspectiveSession, initialInterpretation: string): ArcPerspectiveSession {
  return { ...session, initialInterpretation };
}

/** Optional -- nothing here ever validates or rejects an empty value. */
export function setArcPerspectiveDesiredInterpretationPreset(session: ArcPerspectiveSession, desiredInterpretationPreset: string): ArcPerspectiveSession {
  return { ...session, desiredInterpretationPreset };
}

/** "חובה" on both the event and the initial interpretation; the optional desired-interpretation field is never part of this gate. */
export function canAdvanceFromArcPerspectiveEvent(session: ArcPerspectiveSession): boolean {
  return session.eventDescription.trim().length > 0 && session.initialInterpretation.trim().length > 0;
}

export function advanceArcPerspectiveToMoodCheckIn(session: ArcPerspectiveSession): ArcPerspectiveSession {
  if (!canAdvanceFromArcPerspectiveEvent(session)) return session;
  return { ...session, currentStep: "mood_check_in" };
}

/** Never invents a desired interpretation the trainee left blank -- mirrors resolveArcDecisionDesiredOutcome exactly. */
export function resolveArcPerspectiveDesiredInterpretationPreset(session: ArcPerspectiveSession): string | null {
  const trimmed = session.desiredInterpretationPreset.trim();
  return trimmed ? trimmed : null;
}

/** Records which of the three smileys the trainee picked -- the ARC routing itself (😟/🙂) is the caller's job (data/emotionalCheckInRouting.ts's handleArcPerspectiveCheckInChoice); this is purely bookkeeping, matching ArcGymTrainingRecord.checkInChoice. */
export function chooseArcPerspectiveMood(session: ArcPerspectiveSession, choice: ArcPerspectiveMoodChoice): ArcPerspectiveSession {
  return { ...session, moodCheckInChoice: choice };
}

/**
 * mood_check_in -> perspective_shift. Called either immediately in
 * place (😄 "מעולה" -- never leaves the screen, same precedent as ARC
 * Memory's own check-in) or once the preliminary ARC round-trip
 * actually finishes (😟/🙂 -- live/NewArcLiveScreen.tsx's own
 * returnToTask() calls this on the persisted in-progress record before
 * routing back).
 */
export function advanceArcPerspectiveFromMoodCheckIn(session: ArcPerspectiveSession): ArcPerspectiveSession {
  return { ...session, currentStep: "perspective_shift" };
}

/** User-paced, never gated -- "אם המשתמש מתקשה לדמיין... אין לחסום את התרגיל" applies equally to the attention track; both sides of the shift are self-directed with no completion condition to check. */
export function advanceArcPerspectiveToNewInterpretation(session: ArcPerspectiveSession): ArcPerspectiveSession {
  return { ...session, currentStep: "new_interpretation" };
}

export function setArcPerspectiveNewInterpretation(session: ArcPerspectiveSession, newInterpretation: string): ArcPerspectiveSession {
  return { ...session, newInterpretation };
}

/** "המשתמש יכתוב את הפרשנות החדשה" -- required to leave this step, same shape as every other required-field gate in this module. */
export function canAdvanceFromArcPerspectiveNewInterpretation(session: ArcPerspectiveSession): boolean {
  return session.newInterpretation.trim().length > 0;
}

export function advanceArcPerspectiveToLinkBehaviour(session: ArcPerspectiveSession): ArcPerspectiveSession {
  if (!canAdvanceFromArcPerspectiveNewInterpretation(session)) return session;
  return { ...session, currentStep: "link_behaviour" };
}

/** Section 7.1: "לקשר את האירוע והפרשנות החדשה להתנהגות" -- optional, re-linkable (overwrites any previous link on this SESSION, never on the ArcGymSituation side, which is a separate, explicit call -- see arc/arcGym.ts's own linkArcPerspectiveToArcGymSituation). */
export function linkArcGymSituationToArcPerspectiveSession(session: ArcPerspectiveSession, situationId: string): ArcPerspectiveSession {
  return { ...session, linkedArcGymSituationId: situationId };
}

export function unlinkArcGymSituationFromArcPerspectiveSession(session: ArcPerspectiveSession): ArcPerspectiveSession {
  return { ...session, linkedArcGymSituationId: null };
}

/** "השלמת תרגול ללא קישור ל-ARC Behaviour" (spec test 17) is simply completing with linkedArcGymSituationId left null -- this function itself never requires a link. */
export function completeArcPerspectiveSession(session: ArcPerspectiveSession, now: string): ArcPerspectiveSession {
  return { ...session, completedAt: now };
}

/** Back navigation, one step at a time, never below "event" -- same floor convention as goToPreviousArcDecisionStep. Harmless even after the ARC detour already ran: nothing here re-triggers or double-counts anything, it only ever moves currentStep. */
export function goToPreviousArcPerspectiveStep(session: ArcPerspectiveSession): ArcPerspectiveSession {
  const index = ARC_PERSPECTIVE_STEP_ORDER.indexOf(session.currentStep);
  if (index <= 0) return session;
  return { ...session, currentStep: ARC_PERSPECTIVE_STEP_ORDER[index - 1] };
}

export function findArcPerspectiveSessionById(sessions: ArcPerspectiveSession[], id: string): ArcPerspectiveSession | null {
  return sessions.find((session) => session.id === id) ?? null;
}

/**
 * Upsert-by-id, never append-only -- unlike ArcDecision's own
 * one-shot recordArcDecisionHistory, a session's own link to an
 * ArcGymSituation can be set or changed AFTER it is already completed
 * (from either side: this flow's own "link_behaviour" step, or
 * build/ArcGymSituationScreen.tsx's own reverse picker), so the history
 * list must support replacing an existing entry by id.
 */
export function upsertArcPerspectiveSessionInList(sessions: ArcPerspectiveSession[], session: ArcPerspectiveSession): ArcPerspectiveSession[] {
  const index = sessions.findIndex((existing) => existing.id === session.id);
  if (index === -1) return [...sessions, session];
  const next = [...sessions];
  next[index] = session;
  return next;
}

/** All practices of one saved event, for the event's own detail screen -- insertion order (createdAt/startedAt ascending in practice), never re-sorted here. */
export function listArcPerspectiveSessionsForEvent(sessions: ArcPerspectiveSession[], eventId: string): ArcPerspectiveSession[] {
  return sessions.filter((session) => session.eventId === eventId);
}
