import { addCalendarDays, daysBetweenCalendarDates, isValidCalendarDateString } from "../program/dateUtils.ts";
import { generateArcGoalWeekPracticeRecordId } from "./types.ts";
import type {
  ArcGoalFourWeekProgram,
  ArcGoalProgramWeek,
  ArcGoalSupportReturnContext,
  ArcGoalWeekPracticeRecord,
  ArcGoalWeekReflection,
  FourWeekProgramWeekNumber,
} from "./types.ts";

/**
 * arc/fourWeekProgram.ts
 *
 * Four-Week Program task (Reach Your Goal, "Core order": Life Manifest
 * -> ARC Goal -> four-week identity-and-habit program -> sub-goals/
 * targets in a later phase). Pure (React/storage-free) logic only --
 * every function here takes an ArcGoalFourWeekProgram and returns a new
 * one, exactly like arc/lifeManifest.ts's own pure-logic functions;
 * build/ArcGoalEditorScreen.tsx (BUILD) and
 * live/ArcGoalFourWeekDashboardScreen.tsx (LIVE) are the only two
 * callers, both patching the owning ArcGoal through the existing
 * upsertArcGoal (data/storage.ts) the same way every other ArcGoal edit
 * already does -- no new storage module.
 *
 * Central design rule, repeated at each function that touches it: a
 * week's plannedEndDate reaching "today" NEVER by itself advances
 * anything. It only ever means the LIVE dashboard should show the
 * end-date decision prompt (spec section 2) -- confirmWeekCompleteAndAdvance
 * below is the ONLY function that actually completes a week, and it is
 * only ever called after the trainee explicitly confirms (optionally
 * after answering the weekly reflection, section 9).
 */

const WEEK_LENGTH_DAYS = 7;

export const FOUR_WEEK_PROGRAM_WEEK_NUMBERS: FourWeekProgramWeekNumber[] = [1, 2, 3, 4];

export interface FourWeekMeta {
  title: string;
  purpose: string;
  defaultPracticeFrequency: string;
  defaultRecommendedPractice: string;
}

/** Hebrew titles/purposes/defaults for each week -- spec sections 3-6, used both as BUILD's safe defaults (editable) and as the LIVE dashboard's own copy when a week's own fields are still unset. */
export const FOUR_WEEK_META: Record<FourWeekProgramWeekNumber, FourWeekMeta> = {
  1: {
    title: "שבוע 1 — חיזוק הזהות עם ARCHI",
    purpose: "לחזק את הזהות הנדרשת למטרה, לחבר את הטריגר האמיתי לכניסה ל-ARCHI, ולהתחיל את ההרגל המיועד בליווי מלא.",
    defaultPracticeFrequency: "יומי",
    defaultRecommendedPractice: "ARC מלא לחיזוק הזהות + ARC Link, דימוי פעולה, עוגן שפת גוף, מנטרת זהות ומנטרת עתיד, פעולה קטנה מבוססת זהות, והתמקדות בהצלחה.",
  },
  2: {
    title: "שבוע 2 — מעבר ל-Mini ARC",
    purpose: "לעבור בהדרגה מהתהליך המלא ל-Mini ARC, תוך שמירה על הקשר למטרה.",
    defaultPracticeFrequency: "יומי",
    defaultRecommendedPractice: "Mini ARC בהנחיית ARCHI + תרגול הכנה מקושר, ביצוע ההרגל/הפעולה בזמן אמת, ARC מלא רק אם צריך תמיכה נוספת, והתמקדות בהצלחה לאחר הפעולה.",
  },
  3: {
    title: "שבוע 3 — תרגול קצר בזמן אמת",
    purpose: "להפחית את התלות בתהליך המודרך המלא.",
    defaultPracticeFrequency: "לפי הצורך",
    defaultRecommendedPractice: "Mini ARC Link, Mini ARC כשצריך, היזכרות בזהות, עוגן שפת גוף ומנטרת זהות, ואז ביצוע ההרגל בזמן אמת וסימון הפעולה כהושלמה.",
  },
  4: {
    title: "שבוע 4 — ביצוע עצמאי",
    purpose: "לבצע את ההרגל ללא צורך ב-ARCHI לפני הפעולה.",
    defaultPracticeFrequency: "לפי הצורך",
    defaultRecommendedPractice: "תזכורת או טריגר אמיתי בעולם, ביצוע ההרגל, וסימון הפעולה כהושלמה -- ללא צורך ב-ARC מלא, Mini ARC, ARC Link או Mini ARC Link.",
  },
};

function weekIndex(weekNumber: FourWeekProgramWeekNumber): number {
  return weekNumber - 1;
}

function createProgramWeek(weekNumber: FourWeekProgramWeekNumber, plannedStartDate: string, plannedEndDate: string): ArcGoalProgramWeek {
  const meta = FOUR_WEEK_META[weekNumber];
  return {
    weekNumber,
    plannedStartDate,
    plannedEndDate,
    datesManuallyEdited: false,
    practiceFrequency: meta.defaultPracticeFrequency,
    recommendedPractice: meta.defaultRecommendedPractice,
    remindersEnabled: false,
    reminderNotificationId: null,
    reminderScheduledFor: null,
    completionRequirement: null,
    notes: null,
    status: weekNumber === 1 ? "active" : "not_started",
    actualCompletedAt: null,
    dateExtensions: [],
    practiceRecords: [],
    reflection: null,
  };
}

/**
 * Builds a brand-new four-week program from just a Week 1 start date --
 * "By default, calculate the four-week schedule automatically using
 * seven days per week" (spec section 2). Every week gets a contiguous
 * 7-day window (week N+1 starts the day week N ends), none manually
 * edited yet, Week 1 already active (currentWeek=1) -- "New programs
 * begin in Week 1."
 */
export function createFourWeekProgram(week1StartDate: string): ArcGoalFourWeekProgram {
  const week1End = addCalendarDays(week1StartDate, WEEK_LENGTH_DAYS - 1);
  const week2Start = addCalendarDays(week1End, 1);
  const week2End = addCalendarDays(week2Start, WEEK_LENGTH_DAYS - 1);
  const week3Start = addCalendarDays(week2End, 1);
  const week3End = addCalendarDays(week3Start, WEEK_LENGTH_DAYS - 1);
  const week4Start = addCalendarDays(week3End, 1);
  const week4End = addCalendarDays(week4Start, WEEK_LENGTH_DAYS - 1);

  return {
    enabled: true,
    currentWeek: 1,
    linkedMiniArcId: null,
    weeks: [
      createProgramWeek(1, week1StartDate, week1End),
      createProgramWeek(2, week2Start, week2End),
      createProgramWeek(3, week3Start, week3End),
      createProgramWeek(4, week4Start, week4End),
    ],
    startedAt: null,
    completedAt: null,
    readyForSubGoalActivation: false,
    returnContext: null,
  };
}

export function resolveWeek(program: ArcGoalFourWeekProgram, weekNumber: FourWeekProgramWeekNumber): ArcGoalProgramWeek {
  return program.weeks[weekIndex(weekNumber)];
}

export function resolveCurrentWeek(program: ArcGoalFourWeekProgram): ArcGoalProgramWeek {
  return resolveWeek(program, program.currentWeek);
}

function replaceWeek(program: ArcGoalFourWeekProgram, updated: ArcGoalProgramWeek): ArcGoalFourWeekProgram {
  const weeks = [...program.weeks] as ArcGoalFourWeekProgram["weeks"];
  weeks[weekIndex(updated.weekNumber)] = updated;
  return { ...program, weeks };
}

/**
 * Cascades a start-date change forward: every LATER week that has never
 * been manually edited gets pushed to stay contiguous with the week
 * before it (same 7-day span it already had); a manually-edited later
 * week is left exactly as it is -- "recalculate the following weeks
 * while preserving manually edited dates where appropriate" (spec
 * section 2). Called after any edit that changes a week's own
 * plannedEndDate (a direct edit, or extending the current week).
 *
 * Defensive-validation fix: a trainee's Week N date field is a raw
 * "YYYY-MM-DD" TextInput (no native picker/modal), so plannedStartDate/
 * plannedEndDate can transiently hold a partial or malformed string
 * while mid-typing. Every date read here is checked with
 * isValidCalendarDateString BEFORE any arithmetic -- an invalid
 * previous.plannedEndDate skips that week entirely (left untouched)
 * instead of throwing and blanking the whole BUILD screen.
 */
function cascadeFrom(program: ArcGoalFourWeekProgram, changedWeekNumber: FourWeekProgramWeekNumber): ArcGoalFourWeekProgram {
  let next = program;
  for (let n = changedWeekNumber + 1; n <= 4; n++) {
    const weekNumber = n as FourWeekProgramWeekNumber;
    const week = resolveWeek(next, weekNumber);
    if (week.datesManuallyEdited) continue;
    const previous = resolveWeek(next, (weekNumber - 1) as FourWeekProgramWeekNumber);
    if (!isValidCalendarDateString(previous.plannedEndDate)) continue;
    const span =
      isValidCalendarDateString(week.plannedStartDate) && isValidCalendarDateString(week.plannedEndDate)
        ? daysBetweenCalendarDates(week.plannedStartDate, week.plannedEndDate)
        : WEEK_LENGTH_DAYS - 1;
    const newStart = addCalendarDays(previous.plannedEndDate, 1);
    const newEnd = addCalendarDays(newStart, Math.max(span, 0));
    next = replaceWeek(next, { ...week, plannedStartDate: newStart, plannedEndDate: newEnd });
  }
  return next;
}

/**
 * Directly edits one week's own planned start date -- keeps that week's
 * existing duration (end shifts by the same amount), marks it manually
 * edited (so it's never silently overwritten by a later cascade from an
 * earlier week's own edit), then cascades every later, still-automatic
 * week forward so no overlapping/invalid range is ever produced.
 *
 * Defensive-validation fix: newStart comes straight from a raw TextInput
 * (onChangeText fires per keystroke, with no native picker/modal), so it
 * is very often a partial string mid-typing (e.g. "2025-01-1"). When
 * it isn't yet a valid "YYYY-MM-DD" date, the raw text is still stored
 * (so the field keeps showing exactly what the trainee typed) but NO
 * date arithmetic or cascade runs -- never throw/blank the screen over
 * a value that isn't finished yet.
 */
export function setWeekStartDate(program: ArcGoalFourWeekProgram, weekNumber: FourWeekProgramWeekNumber, newStart: string): ArcGoalFourWeekProgram {
  const week = resolveWeek(program, weekNumber);
  if (!isValidCalendarDateString(newStart)) {
    return replaceWeek(program, { ...week, plannedStartDate: newStart, datesManuallyEdited: true });
  }
  const span =
    isValidCalendarDateString(week.plannedStartDate) && isValidCalendarDateString(week.plannedEndDate)
      ? Math.max(daysBetweenCalendarDates(week.plannedStartDate, week.plannedEndDate), 0)
      : WEEK_LENGTH_DAYS - 1;
  const newEnd = addCalendarDays(newStart, span);
  const updated = replaceWeek(program, { ...week, plannedStartDate: newStart, plannedEndDate: newEnd, datesManuallyEdited: true });
  return cascadeFrom(updated, weekNumber);
}

/**
 * Directly edits one week's own planned end date -- clamps it to never
 * fall before that week's own start (a week can never have a negative
 * or zero-day invalid range), marks it manually edited, then cascades
 * every later, still-automatic week forward from the new end date.
 *
 * Defensive-validation fix: same partial-input handling as
 * setWeekStartDate above -- an invalid/incomplete newEnd is stored as
 * typed with no arithmetic or cascade attempted.
 */
export function setWeekEndDate(program: ArcGoalFourWeekProgram, weekNumber: FourWeekProgramWeekNumber, newEnd: string): ArcGoalFourWeekProgram {
  const week = resolveWeek(program, weekNumber);
  if (!isValidCalendarDateString(newEnd)) {
    return replaceWeek(program, { ...week, plannedEndDate: newEnd, datesManuallyEdited: true });
  }
  const clampedEnd =
    isValidCalendarDateString(week.plannedStartDate) && daysBetweenCalendarDates(week.plannedStartDate, newEnd) < 0 ? week.plannedStartDate : newEnd;
  const updated = replaceWeek(program, { ...week, plannedEndDate: clampedEnd, datesManuallyEdited: true });
  return cascadeFrom(updated, weekNumber);
}

/**
 * "If the user continues the current week... allow selecting a new
 * planned end date... recalculate the following planned opening dates
 * safely... preserve all completed practices and reflections" (spec
 * section 2). Records the extension in the week's own dateExtensions
 * (never discards the original planned end date) and otherwise reuses
 * setWeekEndDate's own cascade -- practiceRecords/reflection are never
 * touched by this function, so they survive automatically.
 */
export function extendCurrentWeek(program: ArcGoalFourWeekProgram, weekNumber: FourWeekProgramWeekNumber, newPlannedEndDate: string, now: string): ArcGoalFourWeekProgram {
  const week = resolveWeek(program, weekNumber);
  const extended = replaceWeek(program, {
    ...week,
    dateExtensions: [
      ...week.dateExtensions,
      { extendedAt: now, previousPlannedEndDate: week.plannedEndDate, newPlannedEndDate },
    ],
  });
  return setWeekEndDate(extended, weekNumber, newPlannedEndDate);
}

/**
 * "For every current week show... 'השבוע הבא מתוכנן להיפתח בתאריך'"
 * (spec section 2) -- simply the next week's own plannedStartDate,
 * since weeks are always kept contiguous (week N+1 starts the day week
 * N ends) by construction/cascade. null for Week 4 (the caller shows
 * the program's own planned completion date -- resolveWeek(program,
 * 4).plannedEndDate -- instead, per spec section 2's "For Week 4,
 * replace the next-week message with the planned completion date").
 */
export function resolveNextWeekOpeningDate(program: ArcGoalFourWeekProgram, weekNumber: FourWeekProgramWeekNumber): string | null {
  if (weekNumber >= 4) return null;
  return resolveWeek(program, (weekNumber + 1) as FourWeekProgramWeekNumber).plannedStartDate;
}

/**
 * True once "today" has reached (or passed) a week's own planned end
 * date -- the LIVE dashboard's own signal to show the decision prompt,
 * NEVER to advance anything by itself. An invalid/incomplete stored
 * plannedEndDate (mid-typing in BUILD, or missing) OR an invalid
 * todayLocal safely reads as "not past yet" rather than throwing --
 * there is no sound date to compare against, so no prompt is the only
 * safe answer.
 */
export function isPastPlannedEndDate(week: ArcGoalProgramWeek, todayLocal: string): boolean {
  if (!isValidCalendarDateString(week.plannedEndDate) || !isValidCalendarDateString(todayLocal)) return false;
  return daysBetweenCalendarDates(week.plannedEndDate, todayLocal) >= 0;
}

export function addPracticeRecord(
  program: ArcGoalFourWeekProgram,
  weekNumber: FourWeekProgramWeekNumber,
  kind: ArcGoalWeekPracticeRecord["kind"],
  label: string,
  now: string
): ArcGoalFourWeekProgram {
  const week = resolveWeek(program, weekNumber);
  const record: ArcGoalWeekPracticeRecord = { id: generateArcGoalWeekPracticeRecordId(), kind, label, occurredAt: now };
  return replaceWeek(program, { ...week, practiceRecords: [...week.practiceRecords, record] });
}

/** Saves the weekly-reflection answers (spec section 9) onto the given week -- always overwrites any previous answer for that same week (there is only ever one reflection per week, matching a trainee revisiting it before finally confirming completion). */
export function saveWeekReflection(
  program: ArcGoalFourWeekProgram,
  weekNumber: FourWeekProgramWeekNumber,
  reflection: Omit<ArcGoalWeekReflection, "answeredAt">,
  now: string
): ArcGoalFourWeekProgram {
  const week = resolveWeek(program, weekNumber);
  return replaceWeek(program, { ...week, reflection: { ...reflection, answeredAt: now } });
}

/**
 * The ONLY function that actually completes a week and moves the
 * program forward -- called after the trainee explicitly confirms
 * ("כן, להשלים ולעבור לשבוע הבא"), optionally after saveWeekReflection
 * above. Marks the CURRENT week completed (status + actualCompletedAt),
 * and either activates the next week (currentWeek++, that week's own
 * status -> "active") or, from Week 4, marks the whole program complete
 * and sets readyForSubGoalActivation -- the later phase's own safe
 * integration point, otherwise inert here.
 */
export function confirmWeekCompleteAndAdvance(program: ArcGoalFourWeekProgram, now: string): ArcGoalFourWeekProgram {
  const current = resolveCurrentWeek(program);
  const completedCurrent = replaceWeek(program, { ...current, status: "completed", actualCompletedAt: now });

  if (current.weekNumber >= 4) {
    return { ...completedCurrent, completedAt: now, readyForSubGoalActivation: true };
  }

  const nextWeekNumber = (current.weekNumber + 1) as FourWeekProgramWeekNumber;
  const nextWeek = resolveWeek(completedCurrent, nextWeekNumber);
  const activated = replaceWeek(completedCurrent, { ...nextWeek, status: "active" });
  return { ...activated, currentWeek: nextWeekNumber, startedAt: activated.startedAt ?? now };
}

export function setLinkedMiniArc(program: ArcGoalFourWeekProgram, miniArcId: string | null): ArcGoalFourWeekProgram {
  return { ...program, linkedMiniArcId: miniArcId };
}

/** Saved right before leaving the LIVE dashboard for a support flow (spec section 10) -- see ArcGoalSupportReturnContext's own doc. */
export function setReturnContext(program: ArcGoalFourWeekProgram, week: FourWeekProgramWeekNumber, actionLabel: string, now: string): ArcGoalFourWeekProgram {
  const returnContext: ArcGoalSupportReturnContext = { week, actionLabel, savedAt: now };
  return { ...program, returnContext };
}

export function clearReturnContext(program: ArcGoalFourWeekProgram): ArcGoalFourWeekProgram {
  return { ...program, returnContext: null };
}

/**
 * Informational only (never gates anything): a simple, deterministic
 * 0-100 read of how much a week has going on -- any reflection answered
 * counts for half, and each logged practice/action/support record
 * contributes toward the other half (capped at 4 records). A completed
 * week always reads 100 regardless, since "the planned date should
 * trigger a decision, not automatic progression" means a week can be
 * confirmed complete with little logged activity -- this function must
 * never contradict that by showing a completed week as anything but
 * fully progressed.
 */
export function computeWeekProgress(week: ArcGoalProgramWeek): number {
  if (week.status === "completed") return 100;
  const reflectionShare = week.reflection ? 50 : 0;
  const recordsShare = Math.min(week.practiceRecords.length, 4) * 12.5;
  return Math.round(reflectionShare + recordsShare);
}

/** Overall four-week progress: each of the 4 weeks contributes an equal quarter, using that week's own computeWeekProgress for its share. */
export function computeOverallProgress(program: ArcGoalFourWeekProgram): number {
  const total = program.weeks.reduce((sum, week) => sum + computeWeekProgress(week), 0);
  return Math.round(total / 4);
}

/** A week's own reminder fires once, at a fixed 9:00 local time on its planned start date -- there is no per-week time-of-day field to read (remindersEnabled is a plain toggle, spec section 9's "without changing their existing UI"). */
const WEEK_REMINDER_HOUR = 9;

/**
 * Sub-goal execution task, spec section 9 ("Also wire the four-week
 * reminder toggles created in Phase 4 to real notifications"): the pure
 * "when should this week's reminder fire" decision, mirroring
 * isValidCalendarDateString-guarded date reads used throughout this
 * file. Returns null (never schedule) when remindersEnabled is off, the
 * week has no valid plannedStartDate, or that date's own 9:00 moment has
 * already passed -- "Do not schedule reminders in the past" is satisfied
 * by simply never producing a past moment here; there is no time-of-day
 * picker on this toggle to instead ask the trainee to pick a future
 * time.
 */
export function resolveWeekReminderFireAt(week: ArcGoalProgramWeek, now: Date = new Date()): Date | null {
  if (!week.remindersEnabled) return null;
  if (!isValidCalendarDateString(week.plannedStartDate)) return null;
  const fireAt = new Date(`${week.plannedStartDate}T00:00:00`);
  fireAt.setHours(WEEK_REMINDER_HOUR, 0, 0, 0);
  return fireAt.getTime() > now.getTime() ? fireAt : null;
}

// ---------------------------------------------------------------------------
// ARC Goal four-week correction: Week 1's own OPTIONAL internal-support
// step (spec section 2, "ask whether internal support is currently
// needed"), inserted BEFORE the mandatory full Identity Extension. Pure
// routing logic only -- never converts/duplicates an UrgeArc/ThoughtArc/
// PresenceArc/BeliefArc into a fake ArcBuild; each of the 4 non-state
// kinds routes to its OWN real standalone LIVE screen (already mandatory-
// routes into Identity Extension via its own `goalId` param, see each
// screen's own Phase 8 doc), with `mode: "full"` -- Week 1 is explicitly
// FULL-only, never Mini. "state" is the one kind still routed through
// the general-purpose /live screen (LiveSessionScreen.tsx), which gained
// its own `thenIdentityGoalId` param for exactly this purpose -- see that
// screen's own doc for why this is a SEPARATE param from fourWeekGoalId
// (whose existing "return straight to the dashboard" behavior for the
// goal's own identity build is completely unchanged by this correction).
// ---------------------------------------------------------------------------

export type ArcGoalInternalSupportKind = "state" | "urge" | "thought" | "presence" | "belief";

export const ARC_GOAL_WEEK1_SUPPORT_QUESTION = "האם יש כרגע מצב פנימי, דחף, מחשבה או אמונה שצריך לעבוד עליהם לפני הפעולה?";

export interface ArcGoalInternalSupportKindOption {
  value: ArcGoalInternalSupportKind;
  label: string;
}

/** The 5 Week-1 internal-support choices -- "no internal support currently needed" is offered as its own separate button by the driving screen, never a 6th value here (there is nothing to route to for "none"). */
export function getArcGoalInternalSupportKindOptions(): ArcGoalInternalSupportKindOption[] {
  return [
    { value: "state", label: "מצב פנימי (ARC State)" },
    { value: "urge", label: "דחף (ARC Urge)" },
    { value: "thought", label: "מחשבה (ARC Thought)" },
    { value: "presence", label: "נוכחות (ARC Presence)" },
    { value: "belief", label: "אמונה (ARC Belief)" },
  ];
}

export interface ArcGoalWeek1SupportRoute {
  pathname: string;
  params: Record<string, string>;
}

const ARC_GOAL_INTERNAL_SUPPORT_LIVE_ROUTES: Record<Exclude<ArcGoalInternalSupportKind, "state">, string> = {
  urge: "/urge-arcs/live/[id]",
  thought: "/thought-arcs/live/[id]",
  presence: "/presence-arcs/live/[id]",
  belief: "/belief-arcs/live/[id]",
};

/**
 * Resolves the route for Week 1's chosen internal-support protocol --
 * always the FULL version (spec: "optional selected Full ARC support
 * protocol"), always continuing mandatorily into Identity Extension on
 * completion, never a direct return to the dashboard (the trainee must
 * still complete the mandatory identity step).
 */
export function resolveArcGoalInternalSupportRoute(goalId: string, kind: ArcGoalInternalSupportKind, protocolId: string): ArcGoalWeek1SupportRoute {
  if (kind === "state") {
    return { pathname: "/live", params: { buildId: protocolId, thenIdentityGoalId: goalId } };
  }
  return { pathname: ARC_GOAL_INTERNAL_SUPPORT_LIVE_ROUTES[kind], params: { id: protocolId, goalId, mode: "full" } };
}

/** Week 1's own "no internal support needed" answer (or the automatic continuation once a chosen support protocol finishes) -- always the mandatory full Identity Extension, never skipped, never the Personal Development identity-skip question. */
export function resolveArcGoalIdentityExtensionRoute(goalId: string): ArcGoalWeek1SupportRoute {
  return { pathname: "/identity-extension/live", params: { track: "goal_achievement", goalId } };
}
