/**
 * arc/calendar.ts
 *
 * Sub-goal execution task, spec section 8: ONE calendar aggregator --
 * pure (React/storage-free) logic that reads across every ArcGoal's own
 * four-week program + execution sub-goals/targets and produces a single,
 * uniform list of CalendarItem rows. This is the calendar's entire
 * "engine"; live/CalendarScreen.tsx only renders what this returns and
 * deep-links using each item's own arcGoalId/subGoalId/targetId -- no
 * second calendar data source, no per-screen ad-hoc date scanning.
 *
 * Never touches ScheduledRoutine directly: a target linked to one
 * (linkedScheduledRoutineId) is still represented by its OWN
 * ArcGoalTarget row here (type "routine_linked_target") -- the routine
 * itself is never duplicated as a second calendar entry, satisfying "do
 * not create duplicate ... calendar ... systems."
 */

import { isTargetOccurrenceCompleted, resolveTargetNextOccurrenceDate, resolveTargetTodayOccurrenceDate } from "./subGoalExecution.ts";
import type { ArcGoalTargetOccurrenceCompletion } from "./subGoalExecution.ts";
import { isValidCalendarDateString } from "../program/dateUtils.ts";
import type { ArcGoal, ArcGoalTarget } from "./types.ts";

export type CalendarItemType = "four_week_practice" | "sub_goal_deadline" | "target" | "routine_linked_target";

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  arcGoalId: string;
  subGoalId: string | null;
  targetId: string | null;
  title: string;
  /** ISO instant (targets/four-week practice) or "YYYY-MM-DD" (a sub-goal deadline with no time-of-day) -- always safe to pass straight to `new Date(...)` or display as-is. */
  scheduledAt: string;
  completed: boolean;
}

/**
 * "Four-week practices when still relevant" (spec section 8) -- one item
 * per goal whose program is enabled and not yet completed, for the
 * CURRENT week's own planned end date (the next real decision point a
 * trainee needs to see on a calendar; every day-to-day practice inside
 * that week is already the four-week dashboard's own concern, not the
 * calendar's).
 */
function buildFourWeekProgramItems(goals: ArcGoal[]): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const goal of goals) {
    const program = goal.fourWeekProgram;
    if (!program?.enabled || program.completedAt) continue;
    const currentWeek = program.weeks[program.currentWeek - 1];
    if (!currentWeek || !isValidCalendarDateString(currentWeek.plannedEndDate)) continue;
    items.push({
      id: `four-week-${goal.id}-${currentWeek.weekNumber}`,
      type: "four_week_practice",
      arcGoalId: goal.id,
      subGoalId: null,
      targetId: null,
      title: `${goal.name}: שבוע ${currentWeek.weekNumber}`,
      scheduledAt: currentWeek.plannedEndDate!,
      completed: false,
    });
  }
  return items;
}

/** One item per sub-goal with a planned completion date -- a completed sub-goal still shows (completed: true), so its own history stays visible on the calendar rather than disappearing. */
function buildSubGoalDeadlineItems(goals: ArcGoal[]): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const goal of goals) {
    for (const subGoal of goal.subGoals ?? []) {
      if (!isValidCalendarDateString(subGoal.plannedCompletionDate)) continue;
      items.push({
        id: `subgoal-${subGoal.id}`,
        type: "sub_goal_deadline",
        arcGoalId: goal.id,
        subGoalId: subGoal.id,
        targetId: null,
        title: subGoal.name,
        scheduledAt: subGoal.plannedCompletionDate!,
        completed: subGoal.status === "completed",
      });
    }
  }
  return items;
}

/**
 * One item per target -- its own next relevant occurrence (today's, if
 * any, else the next future one) for a recurring target, or its own
 * plannedDate for a one-time target regardless of past/future (so an
 * overdue one-time target still shows, per "upcoming targets"/"completed
 * targets" both being calendar-visible, spec section 8).
 */
function buildTargetItems(targets: ArcGoalTarget[], completions: ArcGoalTargetOccurrenceCompletion[], now: Date): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const target of targets) {
    const type: CalendarItemType = target.linkedScheduledRoutineId ? "routine_linked_target" : "target";
    if (target.recurrenceDaysOfWeek !== null) {
      const occurrence = resolveTargetTodayOccurrenceDate(target, now) ?? resolveTargetNextOccurrenceDate(target, now);
      if (!occurrence) continue;
      const occurrenceDateLocal = occurrence.toISOString().slice(0, 10);
      items.push({
        id: `target-${target.id}-${occurrenceDateLocal}`,
        type,
        arcGoalId: target.arcGoalId,
        subGoalId: target.subGoalId,
        targetId: target.id,
        title: target.name,
        scheduledAt: occurrence.toISOString(),
        completed: isTargetOccurrenceCompleted(target.id, occurrenceDateLocal, completions),
      });
      continue;
    }
    if (!target.plannedDate) continue;
    items.push({
      id: `target-${target.id}`,
      type,
      arcGoalId: target.arcGoalId,
      subGoalId: target.subGoalId,
      targetId: target.id,
      title: target.name,
      scheduledAt: `${target.plannedDate}T${target.plannedTime ?? "09:00"}:00`,
      completed: target.status === "completed",
    });
  }
  return items;
}

/** Every calendar row across every goal, sorted chronologically -- the single source live/CalendarScreen.tsx renders. */
export function buildCalendarItems(goals: ArcGoal[], targets: ArcGoalTarget[], completions: ArcGoalTargetOccurrenceCompletion[], now: Date = new Date()): CalendarItem[] {
  const items = [
    ...buildFourWeekProgramItems(goals),
    ...buildSubGoalDeadlineItems(goals),
    ...buildTargetItems(targets, completions, now),
  ];
  return items.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}
