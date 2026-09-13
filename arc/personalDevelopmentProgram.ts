import { addCalendarDays, isValidCalendarDateString } from "../program/dateUtils.ts";
import { generatePersonalDevelopmentProgramId, generatePersonalDevelopmentWeekPracticeRecordId } from "./types.ts";
import type {
  ArcGoal,
  FourWeekProgramWeekNumber,
  FourWeekProgramWeekStatus,
  PersonalDevelopmentFourWeekProgram,
  PersonalDevelopmentProgramWeek,
  PersonalDevelopmentProtocolKind,
  PersonalDevelopmentSupportReturnContext,
  PersonalDevelopmentWeekPracticeRecord,
} from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";
import type { ArcLink } from "./routineLinks.ts";
import { resolveActiveSubGoal } from "./subGoalExecution.ts";

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
    arcLinkId: null,
    miniArcLinkId: null,
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

/**
 * Phase 9 correction: backfills a program loaded from storage that
 * predates arcLinkId/miniArcLinkId (both default to null, meaning "use
 * the existing generic trigger content" -- exactly this program's own
 * behavior before those fields existed). Object-spread order matters:
 * defaults first, then the loaded program's own fields override them,
 * so an ALREADY-present value (including one explicitly set to null) is
 * never clobbered -- only a genuinely missing key falls back to the
 * default. Called once by data/storage.ts's loadPersonalDevelopmentPrograms
 * on every parsed entry; never touches dates, reminders, week status, or
 * practice records, which every prior program already had in full.
 */
export function normalizePersonalDevelopmentProgram(program: PersonalDevelopmentFourWeekProgram): PersonalDevelopmentFourWeekProgram {
  // `program` may be a legacy JSON object parsed before these two fields
  // existed -- accessed as `unknown` first so a genuinely-missing key
  // (not merely `null`) still safely defaults, without TypeScript
  // treating this as a same-field-twice mistake (both fields are
  // declared required on the type, so a plain object-spread default
  // would never type-check even though it's exactly correct at runtime).
  const raw = program as unknown as Partial<PersonalDevelopmentFourWeekProgram>;
  return { ...program, arcLinkId: raw.arcLinkId ?? null, miniArcLinkId: raw.miniArcLinkId ?? null };
}

export function setArcLinkId(program: PersonalDevelopmentFourWeekProgram, arcLinkId: string | null): PersonalDevelopmentFourWeekProgram {
  return { ...program, arcLinkId };
}

export function setMiniArcLinkId(program: PersonalDevelopmentFourWeekProgram, miniArcLinkId: string | null): PersonalDevelopmentFourWeekProgram {
  return { ...program, miniArcLinkId };
}

/**
 * Every existing saved ArcLink (routineLinks.ts) matching this exact
 * protocolType+protocolId -- a driving screen offers these as a
 * link-existing-ArcLink picker (mirroring resolveCompatibleMiniArc's own
 * "surface real candidates, invent nothing" shape) for arcLinkId/
 * miniArcLinkId above. protocolType "arc" targets an ArcBuild/UrgeArc/
 * ThoughtArc/PresenceArc/BeliefArc id directly (the "archi_link" task,
 * state-only); "mini_arc" targets a MiniArcBuild id (the "mini_link"
 * task, every protocol kind). Never filters by ArcLink.protocolId
 * meaning anything else -- see ArcLink's own doc in arc/routineLinks.ts.
 */
export function resolveCompatibleArcLinksForProtocol(protocolType: "arc" | "mini_arc", protocolId: string, allLinks: ArcLink[]): ArcLink[] {
  return allLinks.filter((link) => link.protocolType === protocolType && link.protocolId === protocolId);
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
// Task-kind routing (Phase 9 correction, spec requirement 3/8): the ONE
// place that decides which real, existing screen a weekly task opens for
// EVERY protocol kind -- moved out of live/PersonalDevelopmentProgramDashboardScreen.tsx
// into this pure, storage/React-free module so it can be unit-tested
// directly (a React Native screen component cannot be exercised by this
// repo's node --test suite -- see arc/miniArcLink.ts/arc/arcLink.ts for
// the same "routing decision lives in a pure module, the screen is a
// thin renderer" precedent already used everywhere else in this app).
// Never converts/duplicates an UrgeArc/ThoughtArc/PresenceArc/BeliefArc
// into a fake ArcBuild -- each of the 4 non-state kinds' own combined
// LIVE screen (live/UrgeArcLiveScreen.tsx etc.) already loads its OWN
// real record type directly via its own `id` route param.
// ---------------------------------------------------------------------------

/** The 4 non-state kinds' own combined Full/Mini LIVE screen route -- "state" resolves its own routes inline below (a different shape: /live and /mini-arc/live/[id], never this map). */
const PROTOCOL_LIVE_ROUTE_PATHS: Record<Exclude<PersonalDevelopmentProtocolKind, "state">, string> = {
  urge: "/urge-arcs/live/[id]",
  thought: "/thought-arcs/live/[id]",
  presence: "/presence-arcs/live/[id]",
  belief: "/belief-arcs/live/[id]",
};

export interface PersonalDevelopmentTaskRoute {
  pathname: string;
  params: Record<string, string>;
}

/**
 * Resolves the real screen+params a weekly task should open, for EVERY
 * protocol kind -- returns null (never a crash, never invented content)
 * when the task has nothing real to route to yet: "mini"/"mini_link"
 * with no linked Mini, "archi_link" for a non-state kind (see
 * resolvePersonalDevelopmentWeekPlan's own doc on why -- unchanged by
 * this correction), or "action_independent" (never a route -- answered
 * locally by the dashboard's own confirmation, exactly as before).
 * Callers must treat null as "show the safe setup path instead of
 * navigating" (spec requirement 7), never as an error.
 */
export function resolvePersonalDevelopmentTaskRoute(
  program: PersonalDevelopmentFourWeekProgram,
  kind: PersonalDevelopmentTaskKind,
  linkedMiniArcId: string | null
): PersonalDevelopmentTaskRoute | null {
  const pdParams = { pdProgramId: program.id, pdWeek: String(program.currentWeek) };
  const protocolId = program.protocolId;

  if (kind === "full") {
    if (program.protocolKind === "state") {
      return { pathname: "/live", params: { buildId: protocolId, ...pdParams } };
    }
    return { pathname: PROTOCOL_LIVE_ROUTE_PATHS[program.protocolKind], params: { id: protocolId, mode: "full", ...pdParams } };
  }

  if (kind === "mini") {
    if (!linkedMiniArcId) return null;
    if (program.protocolKind === "state") {
      return { pathname: "/mini-arc/live/[id]", params: { id: linkedMiniArcId, ...pdParams } };
    }
    return { pathname: PROTOCOL_LIVE_ROUTE_PATHS[program.protocolKind], params: { id: protocolId, mode: "mini", ...pdParams } };
  }

  if (kind === "archi_link") {
    if (program.protocolKind !== "state") return null;
    return { pathname: "/arc-link/[id]", params: { id: protocolId, ...pdParams, ...(program.arcLinkId ? { linkId: program.arcLinkId } : {}) } };
  }

  if (kind === "mini_link") {
    if (!linkedMiniArcId) return null;
    return { pathname: "/mini-arc-link/[id]", params: { id: linkedMiniArcId, ...pdParams, ...(program.miniArcLinkId ? { linkId: program.miniArcLinkId } : {}) } };
  }

  // kind === "action_independent" -- never a route.
  return null;
}

// ---------------------------------------------------------------------------
// Normalized weekly protocol reference -- a single, reusable read-model
// describing "what protocol/Mini/Link this week's card is about" for
// EITHER track, so a future generic weekly-card renderer never needs to
// know the internal shape of PersonalDevelopmentFourWeekProgram vs.
// ArcGoal.fourWeekProgram to display or route one. Purely additive: the
// ArcGoal-side resolver below only READS ArcGoal/ArcGoalFourWeekProgram/
// resolveActiveSubGoal (arc/subGoalExecution.ts) -- it never imports
// from, writes to, or duplicates arc/fourWeekProgram.ts's own logic, so
// ArcGoal's own four-week progression stays completely unchanged.
// ---------------------------------------------------------------------------

export type PersonalDevelopmentTrack = "personal_development" | "goal_achievement";

export interface PersonalDevelopmentWeeklyProtocolReference {
  track: PersonalDevelopmentTrack;
  protocolKind: PersonalDevelopmentProtocolKind;
  /** The full protocol's own saved id (an ArcBuild/UrgeArc/ThoughtArc/PresenceArc/BeliefArc id). */
  protocolId: string;
  /** The linked ARC Mini's id, when one exists. null when none is linked yet. */
  linkedMiniArcId: string | null;
  /** An existing saved ArcLink (protocolType "arc") this reference's own Full Link task should reuse. null when none is linked -- see resolveCompatibleArcLinksForProtocol. */
  arcLinkId: string | null;
  /** An existing saved ArcLink (protocolType "mini_arc") this reference's own Mini Link task should reuse. null when none is linked. */
  miniArcLinkId: string | null;
  /** The owning ArcGoal's id, only for track "goal_achievement". null for Personal Development. */
  arcGoalId: string | null;
  /** The ArcGoal's currently active sub-goal id (resolveActiveSubGoal), only for track "goal_achievement" once sub-goals exist. null otherwise. */
  activeSubGoalId: string | null;
  /** The saved program/goal's own display name. */
  name: string;
  currentWeek: FourWeekProgramWeekNumber;
  weekStatus: FourWeekProgramWeekStatus;
  completedAt: string | null;
}

/** Projects a PersonalDevelopmentFourWeekProgram into the normalized shape above. Pure, read-only. */
export function resolvePersonalDevelopmentWeeklyProtocolReference(program: PersonalDevelopmentFourWeekProgram): PersonalDevelopmentWeeklyProtocolReference {
  return {
    track: "personal_development",
    protocolKind: program.protocolKind,
    protocolId: program.protocolId,
    linkedMiniArcId: program.linkedMiniArcId,
    arcLinkId: program.arcLinkId,
    miniArcLinkId: program.miniArcLinkId,
    arcGoalId: null,
    activeSubGoalId: null,
    name: program.name,
    currentWeek: program.currentWeek,
    weekStatus: resolveCurrentWeek(program).status,
    completedAt: program.completedAt,
  };
}

/**
 * Projects an ArcGoal's own fourWeekProgram into the SAME normalized
 * shape -- Goal Achievement is always protocolKind "state" (ArcGoal's
 * four-week program only ever targets goal.identityProtocolId, an
 * ArcBuild -- unchanged by this correction). Returns null when the goal
 * has no enabled four-week program, exactly like every other
 * "nothing to show yet" case in this module (never invented).
 */
export function resolveArcGoalWeeklyProtocolReference(goal: ArcGoal): PersonalDevelopmentWeeklyProtocolReference | null {
  const program = goal.fourWeekProgram;
  if (!program || !program.enabled || !goal.identityProtocolId) return null;
  const currentWeek = program.weeks[program.currentWeek - 1];
  return {
    track: "goal_achievement",
    protocolKind: "state",
    protocolId: goal.identityProtocolId,
    linkedMiniArcId: program.linkedMiniArcId,
    arcLinkId: null,
    miniArcLinkId: null,
    arcGoalId: goal.id,
    activeSubGoalId: resolveActiveSubGoal(goal)?.id ?? null,
    name: goal.name,
    currentWeek: program.currentWeek,
    weekStatus: currentWeek.status,
    completedAt: program.completedAt,
  };
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
