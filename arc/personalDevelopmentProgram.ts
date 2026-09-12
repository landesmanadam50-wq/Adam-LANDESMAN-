import { addCalendarDays, isValidCalendarDateString } from "../program/dateUtils.ts";
import { generatePersonalDevelopmentProgramId, generatePersonalDevelopmentWeekPracticeRecordId } from "./types.ts";
import type {
  FourWeekProgramWeekNumber,
  PersonalDevelopmentFourWeekProgram,
  PersonalDevelopmentProgramWeek,
  PersonalDevelopmentProtocolKind,
  PersonalDevelopmentSupportReturnContext,
  PersonalDevelopmentWeekPracticeRecord,
} from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

/**
 * arc/personalDevelopmentProgram.ts
 *
 * Phase 9: Personal Development's own four-week program engine -- pure
 * (React/storage-free) logic only, mirroring arc/fourWeekProgram.ts's
 * own "every function takes a program and returns a new one" shape, but
 * deliberately its OWN independent module rather than a modification of
 * that file: arc/fourWeekProgram.ts is explicitly preserved exactly as
 * it is (spec section 5, "Goal Achievement / ARC Goal must remain
 * unchanged") -- this module never imports from or writes onto it, and
 * PersonalDevelopmentFourWeekProgram is never nested on, or confused
 * with, ArcGoalFourWeekProgram.
 *
 * The core new capability this module adds beyond arc/fourWeekProgram.ts
 * is resolvePersonalDevelopmentWeekPlan below -- the pure "what's
 * recommended vs. manually available this week" resolver spec sections
 * 3-4/8-9 describe. Deliberately simpler than the ArcGoal engine: no
 * manual date-cascade editing, no dateExtensions, no weekly reflection
 * (the PD spec never asks for either).
 *
 * "Mini ARC Link" (guided, Week 1-2) and "ARC Mini Link" (speed/fluency,
 * Week 3-4) are a TRACKING distinction only, mirroring the exact
 * precedent arc/fourWeekProgram.ts/live/ArcGoalFourWeekDashboardScreen.tsx
 * already established for "Mini ARCHI Link" vs "Mini ARC Link" (both
 * already route through the SAME live/MiniArcLinkScreen.tsx rehearsal,
 * with_archi mode, differing only in which practice-record kind gets
 * logged and which copy/label the dashboard shows) -- never a second,
 * duplicated rehearsal mechanism in arc/miniArcLink.ts.
 */

const WEEK_LENGTH_DAYS = 7;

export const PERSONAL_DEVELOPMENT_WEEK_NUMBERS: FourWeekProgramWeekNumber[] = [1, 2, 3, 4];

export interface PersonalDevelopmentWeekMeta {
  title: string;
  purpose: string;
}

/** Hebrew titles/purposes for each week -- spec sections 3-4's own conceptual progression ("Understand the full process -> use the short process immediately -> develop fluency -> act independently"). */
export const PERSONAL_DEVELOPMENT_WEEK_META: Record<FourWeekProgramWeekNumber, PersonalDevelopmentWeekMeta> = {
  1: {
    title: "שבוע 1 — לימוד ה-ARC המלא ושימוש מיידי ב-Mini",
    purpose: "להכיר את התהליך המלא, ולהתחיל להשתמש ב-ARC Mini מיד במצבים אמיתיים.",
  },
  2: {
    title: "שבוע 2 — ARC Mini הופך למומלץ העיקרי",
    purpose: "לעבור למי שמוביל בזמן אמת: ה-ARC Mini, עם ARC מלא זמין לתרגול נוסף בעת הצורך.",
  },
  3: {
    title: "שבוע 3 — שטף ועצמאות גוברת",
    purpose: "לתרגל שטף עם ARC Mini Link, ולבצע את הפעולה המיטיבה או המיועדת בעצמאות גוברת.",
  },
  4: {
    title: "שבוע 4 — ביצוע עצמאי",
    purpose: "לזהות את הטריגר, להשתמש בתגובת הוויסות והקידוד שנלמדה, ולבצע את הפעולה -- ללא צורך ב-ARCHI.",
  },
};

function weekIndex(weekNumber: FourWeekProgramWeekNumber): number {
  return weekNumber - 1;
}

function createProgramWeek(weekNumber: FourWeekProgramWeekNumber, plannedStartDate: string, plannedEndDate: string): PersonalDevelopmentProgramWeek {
  return {
    weekNumber,
    plannedStartDate,
    plannedEndDate,
    remindersEnabled: false,
    reminderNotificationId: null,
    reminderScheduledFor: null,
    status: weekNumber === 1 ? "active" : "not_started",
    actualCompletedAt: null,
    practiceRecords: [],
  };
}

/** Builds a brand-new four-week program from a Week 1 start date -- same contiguous 7-day-per-week construction as arc/fourWeekProgram.ts's own createFourWeekProgram, never a second date-math implementation. */
export function createPersonalDevelopmentProgram(
  protocolKind: PersonalDevelopmentProtocolKind,
  protocolId: string,
  name: string,
  week1StartDate: string,
  linkedMiniArcId: string | null,
  now: string
): PersonalDevelopmentFourWeekProgram {
  const week1End = addCalendarDays(week1StartDate, WEEK_LENGTH_DAYS - 1);
  const week2Start = addCalendarDays(week1End, 1);
  const week2End = addCalendarDays(week2Start, WEEK_LENGTH_DAYS - 1);
  const week3Start = addCalendarDays(week2End, 1);
  const week3End = addCalendarDays(week3Start, WEEK_LENGTH_DAYS - 1);
  const week4Start = addCalendarDays(week3End, 1);
  const week4End = addCalendarDays(week4Start, WEEK_LENGTH_DAYS - 1);

  return {
    id: generatePersonalDevelopmentProgramId(),
    protocolKind,
    protocolId,
    name,
    linkedMiniArcId,
    currentWeek: 1,
    weeks: [
      createProgramWeek(1, week1StartDate, week1End),
      createProgramWeek(2, week2Start, week2End),
      createProgramWeek(3, week3Start, week3End),
      createProgramWeek(4, week4Start, week4End),
    ],
    startedAt: null,
    completedAt: null,
    returnContext: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveWeek(program: PersonalDevelopmentFourWeekProgram, weekNumber: FourWeekProgramWeekNumber): PersonalDevelopmentProgramWeek {
  return program.weeks[weekIndex(weekNumber)];
}

export function resolveCurrentWeek(program: PersonalDevelopmentFourWeekProgram): PersonalDevelopmentProgramWeek {
  return resolveWeek(program, program.currentWeek);
}

function replaceWeek(program: PersonalDevelopmentFourWeekProgram, updated: PersonalDevelopmentProgramWeek): PersonalDevelopmentFourWeekProgram {
  const weeks = [...program.weeks] as PersonalDevelopmentFourWeekProgram["weeks"];
  weeks[weekIndex(updated.weekNumber)] = updated;
  return { ...program, weeks };
}

/** Resolves this program's own MiniArcBuild reference (the ONE compatible Mini for this exact protocolKind+protocolId, never a second/independently-editable copy of that relationship) -- null when none exists yet, never invented. Callers persist the result onto linkedMiniArcId themselves (see setLinkedMiniArc). */
export function resolveCompatibleMiniArc(protocolKind: PersonalDevelopmentProtocolKind, protocolId: string, miniArcs: MiniArcBuild[]): MiniArcBuild | null {
  return miniArcs.find((m) => m.protocolKind === protocolKind && m.parentArcBuildId === protocolId) ?? null;
}

export function setLinkedMiniArc(program: PersonalDevelopmentFourWeekProgram, miniArcId: string | null): PersonalDevelopmentFourWeekProgram {
  return { ...program, linkedMiniArcId: miniArcId };
}

export function addPracticeRecord(
  program: PersonalDevelopmentFourWeekProgram,
  weekNumber: FourWeekProgramWeekNumber,
  kind: PersonalDevelopmentWeekPracticeRecord["kind"],
  label: string,
  now: string
): PersonalDevelopmentFourWeekProgram {
  const week = resolveWeek(program, weekNumber);
  const record: PersonalDevelopmentWeekPracticeRecord = { id: generatePersonalDevelopmentWeekPracticeRecordId(), kind, label, occurredAt: now };
  return replaceWeek(program, { ...week, practiceRecords: [...week.practiceRecords, record] });
}

/** Saved right before leaving the LIVE dashboard for a support flow -- mirrors arc/fourWeekProgram.ts's own setReturnContext. */
export function setReturnContext(program: PersonalDevelopmentFourWeekProgram, week: FourWeekProgramWeekNumber, actionLabel: string, now: string): PersonalDevelopmentFourWeekProgram {
  const returnContext: PersonalDevelopmentSupportReturnContext = { week, actionLabel, savedAt: now };
  return { ...program, returnContext };
}

export function clearReturnContext(program: PersonalDevelopmentFourWeekProgram): PersonalDevelopmentFourWeekProgram {
  return { ...program, returnContext: null };
}

/**
 * True once "today" has reached (or passed) a week's own planned end
 * date -- same "surface a decision, never auto-advance" signal as
 * arc/fourWeekProgram.ts's own isPastPlannedEndDate.
 */
export function isPastPlannedEndDate(week: PersonalDevelopmentProgramWeek, todayLocal: string): boolean {
  if (!isValidCalendarDateString(week.plannedEndDate) || !isValidCalendarDateString(todayLocal)) return false;
  return week.plannedEndDate <= todayLocal;
}

/**
 * The ONLY function that actually completes a week and moves the
 * program forward -- called after the trainee explicitly confirms, no
 * reflection step (unlike ArcGoal's own confirmWeekCompleteAndAdvance --
 * the PD spec never asks for one). Marks the CURRENT week completed and
 * either activates the next week, or (from Week 4) marks the whole
 * program complete.
 */
export function confirmWeekCompleteAndAdvance(program: PersonalDevelopmentFourWeekProgram, now: string): PersonalDevelopmentFourWeekProgram {
  const current = resolveCurrentWeek(program);
  const completedCurrent = replaceWeek(program, { ...current, status: "completed", actualCompletedAt: now });

  if (current.weekNumber >= 4) {
    return { ...completedCurrent, completedAt: now };
  }

  const nextWeekNumber = (current.weekNumber + 1) as FourWeekProgramWeekNumber;
  const nextWeek = resolveWeek(completedCurrent, nextWeekNumber);
  const activated = replaceWeek(completedCurrent, { ...nextWeek, status: "active" });
  return { ...activated, currentWeek: nextWeekNumber, startedAt: activated.startedAt ?? now };
}

/** A week's own reminder fires once, at a fixed 9:00 local time on its planned start date -- identical rule to arc/fourWeekProgram.ts's own resolveWeekReminderFireAt (same "no time-of-day picker on this toggle" reasoning). */
const WEEK_REMINDER_HOUR = 9;

export function resolveWeekReminderFireAt(week: PersonalDevelopmentProgramWeek, now: Date = new Date()): Date | null {
  if (!week.remindersEnabled) return null;
  if (!isValidCalendarDateString(week.plannedStartDate)) return null;
  const fireAt = new Date(`${week.plannedStartDate}T00:00:00`);
  fireAt.setHours(WEEK_REMINDER_HOUR, 0, 0, 0);
  return fireAt.getTime() > now.getTime() ? fireAt : null;
}

// ---------------------------------------------------------------------------
// Weekly recommendation / availability resolver -- spec sections 3, 4, 8,
// 9. Pure function of (week number, whether a compatible Mini exists);
// entirely protocol-kind-agnostic (the SAME plan shape applies to
// State/Urge/Thought/Presence/Belief, per spec's own "apply equivalent
// correct target behavior" -- only the screen deciding WHERE each task
// kind routes to needs to know the protocol kind, never this resolver).
// ---------------------------------------------------------------------------

/**
 * One recommendable/available task this week. "full"/"mini" open the
 * real protocol directly; "archi_link" opens the guided ARCHI Link
 * rehearsal (with_archi mode, rehearsing the full response); "mini_link"
 * opens the ARC Mini Link rehearsal (guided in Week 1-2, speed/fluency
 * framing in Week 3-4 -- see module doc: a tracking/copy distinction
 * only); "action_independent" is Week 4's own direct "I performed the
 * action, without ARCHI" confirmation -- never itself a protocol/Link
 * route.
 */
export type PersonalDevelopmentTaskKind = "full" | "mini" | "archi_link" | "mini_link" | "action_independent";

export interface PersonalDevelopmentWeekPlan {
  /** Primary, recommended-today tasks, in display order -- spec's own "מומלץ השבוע". */
  recommended: PersonalDevelopmentTaskKind[];
  /** Secondary, still fully reachable tasks -- spec's own "זמין לתרגול נוסף". Never means locked/hidden/deleted -- see module doc. */
  manuallyAvailable: PersonalDevelopmentTaskKind[];
}

/**
 * Spec sections 3-4's own week-by-week plan. `hasMini` reflects whether
 * a compatible ARC Mini already exists (resolveCompatibleMiniArc) --
 * when false, "mini"/"mini_link" are never recommended nor manually
 * listed (spec: "Do not invent Mini content... offer a clear path to
 * create/configure the ARC Mini, keep Full ARC available" -- the caller
 * is responsible for showing that setup path itself, this resolver just
 * never lists a task kind that has nothing real behind it).
 *
 * `protocolKind` gates "archi_link": live/ArcLinkScreen.tsx (the only
 * existing full, guided ARCHI Link rehearsal) only ever loads an
 * ArcBuild (getArcBuild(id)) -- confirmed it has no equivalent for
 * UrgeArc/ThoughtArc/PresenceArc/BeliefArc, whose shapes are unrelated
 * to ArcProfile. Rather than inventing a new rehearsal screen for those
 * 4 kinds (out of this phase's scope) or silently routing them to the
 * wrong record type, "archi_link" is only ever listed for "state" --
 * never invented, matching this function's own hasMini guard above.
 */
export function resolvePersonalDevelopmentWeekPlan(
  weekNumber: FourWeekProgramWeekNumber,
  protocolKind: PersonalDevelopmentProtocolKind,
  hasMini: boolean
): PersonalDevelopmentWeekPlan {
  const hasArchiLink = protocolKind === "state";
  const withArchiLink = (kinds: PersonalDevelopmentTaskKind[]): PersonalDevelopmentTaskKind[] =>
    hasArchiLink ? kinds : kinds.filter((kind) => kind !== "archi_link");

  switch (weekNumber) {
    case 1:
      return {
        recommended: withArchiLink(hasMini ? ["full", "archi_link", "mini", "mini_link"] : ["full", "archi_link"]),
        manuallyAvailable: [],
      };
    case 2:
      return {
        recommended: hasMini ? ["mini", "mini_link"] : [],
        manuallyAvailable: withArchiLink(["full", "archi_link"]),
      };
    case 3:
      return {
        recommended: hasMini ? ["mini", "mini_link"] : [],
        manuallyAvailable: withArchiLink(["full", "archi_link"]),
      };
    case 4:
      return {
        recommended: hasMini ? ["action_independent", "mini"] : ["action_independent"],
        manuallyAvailable: withArchiLink(hasMini ? ["full", "archi_link", "mini_link"] : ["full", "archi_link"]),
      };
  }
}

/**
 * Whether this task kind's own guided ARCHI Link/Mini Link rehearsal
 * should use the "guided" (with_archi, spec's Week 1-2 framing) or
 * "speed/fluency" (spec's Week 3-4 framing) copy/label -- never a second
 * rehearsal mechanism (see module doc: the underlying rehearsal content
 * is identical either way, live/MiniArcLinkScreen.tsx's own with_archi
 * mode -- this only decides which Hebrew label/practice-record kind the
 * dashboard shows).
 */
export function isSpeedFluencyWeek(weekNumber: FourWeekProgramWeekNumber): boolean {
  return weekNumber >= 3;
}

// ---------------------------------------------------------------------------
// List CRUD -- mirrors arc/arcGoals.ts's own upsertArcGoalInList/
// deleteArcGoalFromList pattern (pure logic here, data/storage.ts stays a
// thin AsyncStorage wrapper around it).
// ---------------------------------------------------------------------------

export function upsertPersonalDevelopmentProgramInList(
  programs: PersonalDevelopmentFourWeekProgram[],
  program: PersonalDevelopmentFourWeekProgram
): PersonalDevelopmentFourWeekProgram[] {
  const index = programs.findIndex((existing) => existing.id === program.id);
  if (index === -1) return [...programs, program];
  return programs.map((existing, i) => (i === index ? program : existing));
}

export function deletePersonalDevelopmentProgramFromList(programs: PersonalDevelopmentFourWeekProgram[], id: string): PersonalDevelopmentFourWeekProgram[] {
  return programs.filter((program) => program.id !== id);
}

/** Every existing program for this exact protocolKind+protocolId -- a driving screen uses this to find "the one program tracking this record", never inventing a duplicate one. */
export function findProgramsForProtocol(
  programs: PersonalDevelopmentFourWeekProgram[],
  protocolKind: PersonalDevelopmentProtocolKind,
  protocolId: string
): PersonalDevelopmentFourWeekProgram[] {
  return programs.filter((program) => program.protocolKind === protocolKind && program.protocolId === protocolId);
}
