/**
 * arc/taskTransitionMantra.ts
 *
 * ARC Reminders task, requirement 6: the task-transition notification
 * must read as a second-person, present-tense MANTRA ("אתה מתאמן עכשיו,
 * ולאחר מכן אתה מתקלח"), never a bare technical list of task names.
 * This is the one function that renders that line -- the new
 * transition notification (data/taskTransitionNotification.ts) calls
 * this and nothing else for its body text, so there is exactly one
 * place that decides the wording.
 *
 * Uses `Task.transitionMantraTemplate` (arc/tasks.ts) when the trainee
 * set one for the current task, else a plain, grammatically valid
 * default -- never inventing a custom phrasing the trainee never
 * wrote. Shows only the current task's own line when there is no next
 * task (exact requirement 6 behavior), and a fixed "all done" message
 * when there is no current task at all (everything today is finished).
 */

import type { Task } from "./tasks.ts";

export const ALL_DONE_TRANSITION_MANTRA = "סיימת את כל מה שתוכנן להיום.";

const DEFAULT_WITH_NEXT_TEMPLATE = "אתה עכשיו {current}, ולאחר מכן {next}.";
const DEFAULT_NO_NEXT_TEMPLATE = "אתה עכשיו {current}.";

function fillTemplate(template: string, values: { current: string; next: string }): string {
  return template.replace("{current}", values.current).replace("{next}", values.next);
}

/**
 * `current`/`next` are whatever Task.title already is (never reworded
 * here) -- the trainee's own `transitionMantraTemplate`, when set on
 * the CURRENT task, decides the whole sentence's phrasing via its own
 * "{current}"/"{next}" placeholders; an unset template falls back to a
 * default pair of templates (with/without a next task) that are
 * already grammatically valid Hebrew on their own.
 */
export function resolveTransitionMantra(current: Task | null, next: Task | null): string {
  if (!current) return ALL_DONE_TRANSITION_MANTRA;
  const template = current.transitionMantraTemplate?.trim() || (next ? DEFAULT_WITH_NEXT_TEMPLATE : DEFAULT_NO_NEXT_TEMPLATE);
  return fillTemplate(template, { current: current.title, next: next?.title ?? "" });
}
