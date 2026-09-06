/**
 * arc/routineLinks.ts
 *
 * Weekly Routine + ARC Link management task: the pure data layer behind
 * the new Routine-page entities -- RoutineTrigger (a reusable, named
 * trigger), WeeklyAction (a trainee-defined recurring action, optionally
 * linked to a protocol), and ArcLink (a reference-only link between an
 * existing ARC or Mini ARC protocol, a weekly action, and a trigger).
 *
 * None of these are read by normal ARC, normal Mini ARC, Proactive/
 * Reactive ARC, Presence routing, existing timers, Success Focus,
 * Gratitude, Negative Action, or program/ -- this is a brand-new,
 * independent collection of small entities, each stored as its own
 * plain array (data/storage.ts), matching the exact "keyed by its own
 * stable id, read-modify-write the whole list" style already used for
 * ArcBuild/MiniArcBuild/ScheduledRoutine.
 *
 * ArcLink deliberately stores ONLY references (protocolId/weeklyActionId/
 * triggerId) -- never a copy of the linked protocol's own content. Every
 * other piece of Link rehearsal content (Presence, regulation/encoding,
 * actions, states) is read live from the linked ArcBuild/MiniArcBuild at
 * render time (arc/arcLink.ts / arc/miniArcLink.ts), so a BUILD edit is
 * automatically reflected the next time the Link is opened.
 */

import { getIsoWeekKey } from "../data/weeklyStats.ts";
import type { ArcLinkTriggerType } from "./bodyImagery.ts";

export type RoutineProtocolType = "arc" | "mini_arc";
export type ArcLinkMode = "with_archi" | "without_archi";

/**
 * A reusable, named trigger -- "מתי או אחרי מה תרצה לזכור להתחיל?".
 * Independent of any one protocol/weekly action, so the same trigger
 * (e.g. "אחרי ארוחת הערב") can be picked for several weekly actions or
 * Links without being redefined each time. `time` is only meaningful
 * for triggerType "time" (a fixed "HH:MM" wall-clock moment); every
 * other triggerType leaves it null and relies on `text` alone.
 */
export interface RoutineTrigger {
  id: string;
  type: ArcLinkTriggerType;
  text: string;
  time?: string | null;
  createdAt: string;
}

/**
 * A trainee-defined recurring action (e.g. "פעילות גופנית") -- distinct
 * from ScheduledRoutine (data/storage.ts), which is specifically "start
 * an ARC session, then a Success Focus timer" on a schedule. A
 * WeeklyAction is more general: it may optionally reference an ARC or
 * Mini ARC protocol (linkedProtocolId/linkedProtocolType), but doesn't
 * have to -- a plain habit like "לצאת להליכה" with no protocol at all is
 * just as valid. completedDates is a plain, ever-growing list of local
 * "YYYY-MM-DD" completion dates (program/dateUtils.ts's
 * todayLocalDateString), the same simple shape ArcLink.completedPracticeDates
 * below uses -- countCompletionsThisWeek reads it directly, no separate
 * completions collection.
 */
export interface WeeklyAction {
  id: string;
  name: string;
  /** 0 = Sunday .. 6 = Saturday (Date.getDay() convention, same as ScheduledRoutine.recurrenceDays). */
  days: number[];
  /** "HH:MM" wall-clock times -- a weekly action may recur at more than one time per day. */
  times: string[];
  durationMinutes: number | null;
  triggerId: string | null;
  weeklyTarget: number;
  linkedProtocolId?: string | null;
  linkedProtocolType?: RoutineProtocolType | null;
  completedDates: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * References an existing ARC or Mini ARC protocol -- never a copy of
 * its content (see module doc). weeklyActionId is required (BUILD ARC
 * Link's own Step 2 always selects or creates one); triggerId is
 * required (Step 3 always selects or creates one). practiceDays/
 * practiceTime/weeklyTarget are the Link's OWN practice schedule
 * (Step 5), deliberately independent of the linked weekly action's own
 * schedule -- "The Link practice schedule must remain separate from the
 * scheduled time of the beneficial action."
 */
export interface ArcLink {
  id: string;
  protocolId: string;
  protocolType: RoutineProtocolType;
  weeklyActionId: string;
  triggerId: string;
  mode: ArcLinkMode;
  practiceDays: number[];
  practiceTime: string | null;
  weeklyTarget: number | null;
  completedPracticeDates: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Id generation -- same stable-id-string pattern already used throughout
// (arc/types.ts's generateArcBuildId, arc/routines.ts's generateRoutineId).
// ---------------------------------------------------------------------------

export function generateRoutineTriggerId(): string {
  return `trigger-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateWeeklyActionId(): string {
  return `weeklyaction-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateArcLinkId(): string {
  return `arclink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// List CRUD -- pure, mirrors arc/arcBuilds.ts's upsertArcBuildInList/
// deleteArcBuildFromList exactly: editing/deleting one entity by id never
// touches any other entity's own fields.
// ---------------------------------------------------------------------------

export function upsertRoutineTriggerInList(triggers: RoutineTrigger[], trigger: RoutineTrigger): RoutineTrigger[] {
  const index = triggers.findIndex((existing) => existing.id === trigger.id);
  if (index === -1) return [...triggers, trigger];
  return triggers.map((existing, i) => (i === index ? trigger : existing));
}

export function deleteRoutineTriggerFromList(triggers: RoutineTrigger[], id: string): RoutineTrigger[] {
  return triggers.filter((trigger) => trigger.id !== id);
}

export function upsertWeeklyActionInList(actions: WeeklyAction[], action: WeeklyAction): WeeklyAction[] {
  const index = actions.findIndex((existing) => existing.id === action.id);
  if (index === -1) return [...actions, action];
  return actions.map((existing, i) => (i === index ? action : existing));
}

export function deleteWeeklyActionFromList(actions: WeeklyAction[], id: string): WeeklyAction[] {
  return actions.filter((action) => action.id !== id);
}

export function upsertArcLinkInList(links: ArcLink[], link: ArcLink): ArcLink[] {
  const index = links.findIndex((existing) => existing.id === link.id);
  if (index === -1) return [...links, link];
  return links.map((existing, i) => (i === index ? link : existing));
}

export function deleteArcLinkFromList(links: ArcLink[], id: string): ArcLink[] {
  return links.filter((link) => link.id !== id);
}

// ---------------------------------------------------------------------------
// Lookup / display helpers -- always safe (never throw, never invent data)
// for a reference (triggerId/weeklyActionId/protocolId) that no longer
// resolves, e.g. because the referenced record was deleted independently.
// ---------------------------------------------------------------------------

export function resolveRoutineTrigger(triggerId: string | null | undefined, triggers: RoutineTrigger[]): RoutineTrigger | null {
  if (!triggerId) return null;
  return triggers.find((trigger) => trigger.id === triggerId) ?? null;
}

export function resolveWeeklyAction(weeklyActionId: string | null | undefined, actions: WeeklyAction[]): WeeklyAction | null {
  if (!weeklyActionId) return null;
  return actions.find((action) => action.id === weeklyActionId) ?? null;
}

/** Safe, always-displayable trigger description -- "לא הוגדר טריגר" for a missing/deleted reference, never "undefined"/"null"/a crash. */
export function describeTrigger(trigger: RoutineTrigger | null): string {
  if (!trigger || typeof trigger.text !== "string" || trigger.text.trim().length === 0) return "לא הוגדר טריגר";
  return trigger.text.trim();
}

// ---------------------------------------------------------------------------
// Weekly completion counting -- reuses data/weeklyStats.ts's own ISO-week
// key (Monday-start weeks) rather than duplicating week-boundary math.
// ---------------------------------------------------------------------------

/** How many of `dates` (local "YYYY-MM-DD" strings) fall in the same ISO week as `now`. Malformed entries (fail to parse into a real date) are safely ignored, never thrown. */
export function countCompletionsThisWeek(dates: string[], now: Date = new Date()): number {
  const currentWeekKey = getIsoWeekKey(now);
  let count = 0;
  for (const dateString of dates) {
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) continue;
    if (getIsoWeekKey(parsed) === currentWeekKey) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// ArcLink practice-schedule date math -- deliberately adapts an ArcLink's
// own practiceDays/practiceTime into the exact {hour, minute, recurrenceDays}
// shape arc/routines.ts's resolveTodayOccurrenceDate/resolveNextOccurrenceDate
// already take, so THAT existing, already-tested pure date math is reused
// directly rather than re-implemented here. Returns null when no practice
// time is configured at all (the Link practice schedule is optional --
// Step 5's "Allow: practice days; practice time; weekly practice target").
// ---------------------------------------------------------------------------

export interface ArcLinkPracticeScheduleShape {
  hour: number;
  minute: number;
  recurrenceDays: number[];
}

const TIME_PATTERN = /^(\d{1,2}):(\d{1,2})$/;

export function arcLinkPracticeSchedule(link: Pick<ArcLink, "practiceDays" | "practiceTime">): ArcLinkPracticeScheduleShape | null {
  if (!link.practiceTime || link.practiceDays.length === 0) return null;
  const match = TIME_PATTERN.exec(link.practiceTime);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute, recurrenceDays: link.practiceDays };
}
