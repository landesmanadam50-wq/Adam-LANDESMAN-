/**
 * arc/postponementDraft.ts
 *
 * Productivity roadmap, Stage W: "when postponing, ask why; whether
 * it's practical or internal; when you'll return; the first action on
 * return; whether you want ARC now; and which supportive state may
 * help next time. A postponed task must receive either a defined
 * return date/time or explicit movement to the unscheduled list --
 * never silently lost."
 */

import { postponeTask, setTaskCurrentAction } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { isValidCalendarDateString } from "../program/dateUtils.ts";

export type PostponementCategory = "practical" | "internal";
export type PostponementReturnChoice = "specificTime" | "unscheduled";

export interface PostponementDraft {
  reason: string;
  category: PostponementCategory | null;
  returnChoice: PostponementReturnChoice;
  returnDate: string;
  returnTime: string;
  firstActionOnReturn: string;
  wantsArcNow: boolean;
  supportiveStateForNextTime: string;
}

export function createEmptyPostponementDraft(): PostponementDraft {
  return {
    reason: "",
    category: null,
    returnChoice: "unscheduled",
    returnDate: "",
    returnTime: "",
    firstActionOnReturn: "",
    wantsArcNow: false,
    supportiveStateForNextTime: "",
  };
}

/** A specific return time requires a valid returnDate -- never silently falls back to "unscheduled" for a malformed date, so the trainee always knows which outcome they got. Returns null for "unscheduled" or an invalid/missing date, meaning the explicit "move to unscheduled" ending. */
export function resolvePostponementReturnAt(draft: PostponementDraft): string | null {
  if (draft.returnChoice !== "specificTime") return null;
  if (!isValidCalendarDateString(draft.returnDate.trim())) return null;
  const [year, month, day] = draft.returnDate.trim().split("-").map(Number);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(draft.returnTime.trim());
  const [hour, minute] = timeMatch ? [Number(timeMatch[1]), Number(timeMatch[2])] : [9, 0];
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  return result.toISOString();
}

/**
 * Applies the full postponement: status + reason + returnAt (via
 * arc/tasks.ts's own postponeTask, never a local status mutation),
 * narrows currentAction when a return action was given (never
 * overwriting firstAction, matching setTaskCurrentAction's own
 * contract), and saves the chosen supportive state as the task's own
 * new default for next time (read back automatically by Stage K's own
 * preparation screen) when one was given.
 */
export function buildPostponedTask(task: Task, draft: PostponementDraft, now: string): Task {
  const returnAt = resolvePostponementReturnAt(draft);
  let next = postponeTask(task, draft.reason.trim() ? draft.reason.trim() : null, returnAt, now);
  if (draft.firstActionOnReturn.trim()) next = setTaskCurrentAction(next, draft.firstActionOnReturn.trim(), now);
  if (draft.supportiveStateForNextTime.trim()) next = { ...next, defaultSupportiveStateId: draft.supportiveStateForNextTime.trim(), updatedAt: now };
  return next;
}
