/**
 * data/todoList.ts
 *
 * Smart To-Do List task: a thin IO wrapper around arc/todoList.ts's own
 * pure resolveTodoList, mirroring data/dailyPlan.ts's own
 * resolveTodaysScheduledPlan exactly (same loadTasks + todayLocalDateString
 * recipe) -- never a second "what's today" date-resolution convention.
 */
import { resolveTodoList } from "../arc/todoList.ts";
import type { TodoPlanEntry } from "../arc/todoList.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { loadTasks } from "./storage.ts";

export async function resolveTodaysTodoList(now: Date = new Date()): Promise<TodoPlanEntry[]> {
  const tasks = await loadTasks();
  const dateLocal = todayLocalDateString(now);
  return resolveTodoList(tasks, dateLocal);
}
