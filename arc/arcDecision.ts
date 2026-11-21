/**
 * arc/arcDecision.ts
 *
 * ARC Decision -- "קבלת החלטות": a short, self-paced tool that helps a
 * trainee choose between several options by imagining all of them
 * together, then focusing attention on a fixed point, then choosing.
 * Deliberately NOT a ranking/pros-and-cons/comparison engine -- see
 * createArcDecisionSession's own doc.
 *
 * Reached from two places, both sharing this exact module and the
 * shared UI built on it (live/components/ArcDecisionFlow.tsx):
 *   - "arc_gym": a standalone ARC Gym exercise (build/ArcGymDecisionScreen.tsx).
 *   - "arc": the "אני לא יודע" button at the existing action-selection
 *     point inside ARC LIVE's Regulation/mini_acceptance_transition
 *     screens (live/NewArcLiveScreen.tsx's renderActionSelector()).
 *
 * No AsyncStorage, no navigation, no React here -- same split as every
 * other arc/*.ts module; data/storage.ts holds the thin I/O wrapper.
 */

export type ArcDecisionSource = "arc_gym" | "arc";

/**
 * First-step task ("הבנת הסיטואציה"): a new leading step, "situation",
 * added before the original four. Fixed order, matching the spec's own
 * required sequence exactly: "הבנת הסיטואציה <- הגדרת אפשרויות <- דמיון
 * כל האפשרויות ביחד <- מיקוד בנקודה <- בחירה מתוך האפשרויות שהוגדרו."
 * Never reordered, never skipped, never given extra steps -- see this
 * module's own ARC_DECISION_STEP_ORDER below.
 */
export type ArcDecisionStep = "situation" | "options" | "imagine_all" | "focus_point" | "choose";

export const ARC_DECISION_STEP_ORDER: ArcDecisionStep[] = ["situation", "options", "imagine_all", "focus_point", "choose"];

export interface ArcDecisionOption {
  id: string;
  text: string;
}

/**
 * The full persisted shape -- see this module's own doc for the
 * required-data checklist this mirrors field-for-field (spec section 4).
 * completedAt is null while in progress; createdTaskId is null unless
 * the trainee explicitly turned the chosen option into a real Task
 * (ARC Gym entry point only -- see build/ArcGymDecisionScreen.tsx).
 */
export interface ArcDecisionSession {
  id: string;
  source: ArcDecisionSource;
  /**
   * Identifies "which ARC session this was launched from," for the
   * "arc" source -- there is only ever one ARC LIVE session in flight
   * app-wide (NewArcLiveSessionState is a global singleton, never
   * id-keyed), so the session's own taskId already uniquely identifies
   * it for resume-matching purposes. Null for "arc_gym".
   */
  arcSessionId: string | null;
  /** The task that was actively running (Task LIVE origin) when this was launched, if any. Null for "arc_gym" and for a spontaneous/standalone ARC session. */
  activeTaskId: string | null;
  /**
   * First-step task: "מה הסיטואציה כרגע?" -- required to leave the
   * "situation" step (canAdvanceFromArcDecisionSituation below), but
   * stored as a plain string (never null) so the field's own TextInput
   * can bind to it directly, the same convention TaskDraft's own text
   * fields use. Whitespace-only text is treated as empty by the gate,
   * but kept verbatim here -- trimming only ever happens at the gate
   * check, never silently rewriting what the trainee typed.
   */
  situationDescription: string;
  /**
   * "איזו תוצאה היית רוצה להשיג?" -- entirely optional (spec: "לא בכל
   * סיטואציה יש תוצאה מוגדרת"), so advancing never requires this to be
   * non-empty. Also a plain string for the same direct-binding reason
   * as situationDescription; resolveArcDecisionDesiredOutcome below is
   * the one place that turns a blank/whitespace-only value into null,
   * so nothing downstream ever has to invent or guess at an outcome the
   * trainee left blank.
   */
  desiredOutcome: string;
  /** Always in entry order -- never resorted, even after edits. */
  options: ArcDecisionOption[];
  currentStep: ArcDecisionStep;
  chosenOptionId: string | null;
  createdTaskId: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function generateArcDecisionId(): string {
  return `arc-decision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateArcDecisionOptionId(): string {
  return `arc-decision-option-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcDecisionSession(source: ArcDecisionSource, arcSessionId: string | null, activeTaskId: string | null, now: string): ArcDecisionSession {
  return {
    id: generateArcDecisionId(),
    source,
    arcSessionId,
    activeTaskId,
    situationDescription: "",
    desiredOutcome: "",
    options: [],
    currentStep: "situation",
    chosenOptionId: null,
    createdTaskId: null,
    startedAt: now,
    completedAt: null,
  };
}

/** Mirrors the TextInput's own value exactly -- never trimmed here, so the trainee can type/edit freely; the gate (canAdvanceFromArcDecisionSituation) is the one place whitespace-only text is treated as empty. */
export function setArcDecisionSituation(session: ArcDecisionSession, situationDescription: string): ArcDecisionSession {
  return { ...session, situationDescription };
}

/** Same direct-mirror convention as setArcDecisionSituation -- optional, so nothing here ever validates or rejects an empty value. */
export function setArcDecisionDesiredOutcome(session: ArcDecisionSession, desiredOutcome: string): ArcDecisionSession {
  return { ...session, desiredOutcome };
}

/** "המשתמש חייב להזין תיאור של הסיטואציה כדי להמשיך" -- the one gate on leaving the situation step. */
export function canAdvanceFromArcDecisionSituation(session: ArcDecisionSession): boolean {
  return session.situationDescription.trim().length > 0;
}

export function advanceArcDecisionToOptions(session: ArcDecisionSession): ArcDecisionSession {
  if (!canAdvanceFromArcDecisionSituation(session)) return session;
  return { ...session, currentStep: "options" };
}

/** Never invents a desired outcome the trainee left blank -- a whitespace-only (or never-typed) value resolves to null, exactly like resolveChosenArcDecisionOption's own "nothing chosen" null. */
export function resolveArcDecisionDesiredOutcome(session: ArcDecisionSession): string | null {
  const trimmed = session.desiredOutcome.trim();
  return trimmed ? trimmed : null;
}

/** Ignores a blank entry rather than adding an empty option -- the trainee's own "+ הוסף אפשרות" action never creates a silently-unusable row. */
export function addArcDecisionOption(session: ArcDecisionSession, text: string): ArcDecisionSession {
  const trimmed = text.trim();
  if (!trimmed) return session;
  return { ...session, options: [...session.options, { id: generateArcDecisionOptionId(), text: trimmed }] };
}

/** A blank edit is ignored (same rule as adding) rather than leaving a now-empty option in the list. */
export function updateArcDecisionOption(session: ArcDecisionSession, optionId: string, text: string): ArcDecisionSession {
  const trimmed = text.trim();
  if (!trimmed) return session;
  return { ...session, options: session.options.map((option) => (option.id === optionId ? { ...option, text: trimmed } : option)) };
}

/** Removing the currently-chosen option clears the choice too -- a stale pick pointing at a now-deleted option must never survive to the finish screen. */
export function removeArcDecisionOption(session: ArcDecisionSession, optionId: string): ArcDecisionSession {
  return {
    ...session,
    options: session.options.filter((option) => option.id !== optionId),
    chosenOptionId: session.chosenOptionId === optionId ? null : session.chosenOptionId,
  };
}

/** "המשתמש מזין לפחות שתי אפשרויות" -- the one gate on leaving the options step. */
export function canAdvanceFromArcDecisionOptions(session: ArcDecisionSession): boolean {
  return session.options.length >= 2;
}

export function advanceArcDecisionToImagineAll(session: ArcDecisionSession): ArcDecisionSession {
  if (!canAdvanceFromArcDecisionOptions(session)) return session;
  return { ...session, currentStep: "imagine_all" };
}

export function advanceArcDecisionToFocusPoint(session: ArcDecisionSession): ArcDecisionSession {
  return { ...session, currentStep: "focus_point" };
}

export function advanceArcDecisionToChoose(session: ArcDecisionSession): ArcDecisionSession {
  return { ...session, currentStep: "choose" };
}

/**
 * Back navigation, one step at a time, never below "situation" (the
 * new first step). Landing back on "options" clears any existing
 * chosenOptionId -- "אם המשתמש חוזר לשלב הראשון ועורך את האפשרויות, ודא
 * שהרשימה המעודכנת היא זו שמוצגת בסיום": the trainee must choose again
 * from whatever the list looks like now, never carry a choice made
 * against the old list. Landing back on "situation" itself never
 * clears situationDescription/desiredOutcome -- "לא לאבד את המידע
 * במעבר בין שלבים," so whatever was already written is shown again
 * exactly as left.
 */
export function goToPreviousArcDecisionStep(session: ArcDecisionSession): ArcDecisionSession {
  const index = ARC_DECISION_STEP_ORDER.indexOf(session.currentStep);
  if (index <= 0) return session;
  const previous = ARC_DECISION_STEP_ORDER[index - 1];
  return { ...session, currentStep: previous, chosenOptionId: previous === "options" ? null : session.chosenOptionId };
}

/** Choosing never itself ends the session -- "לאחר הבחירה הצג: בחרת: [שם האפשרות]"; what happens next depends on the entry point (see this module's own doc), so that's left to the caller. */
export function chooseArcDecisionOption(session: ArcDecisionSession, optionId: string): ArcDecisionSession {
  if (!session.options.some((option) => option.id === optionId)) return session;
  return { ...session, chosenOptionId: optionId };
}

export function resolveChosenArcDecisionOption(session: ArcDecisionSession): ArcDecisionOption | null {
  if (!session.chosenOptionId) return null;
  return session.options.find((option) => option.id === session.chosenOptionId) ?? null;
}

export function completeArcDecisionSession(session: ArcDecisionSession, now: string, createdTaskId: string | null = null): ArcDecisionSession {
  return { ...session, completedAt: now, createdTaskId };
}
