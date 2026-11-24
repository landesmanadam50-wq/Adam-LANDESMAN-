/**
 * arc/arcReminderSchedule.ts
 *
 * ARC Reminders task: the one `ReminderSchedule` shape shared by BOTH
 * ARC Mantra reminders and ARC Active Recall reminders (the user's own
 * requirement: every mantra and every recall question gets its own,
 * independent schedule, but both families are scheduled the exact same
 * way) -- never two separate scheduling shapes. `arc/arcReminderScheduling.ts`
 * is the pure engine that resolves a schedule into concrete trigger
 * times; this file only holds the data shape and its constructors, no
 * logic, same split as every other `arc/*.ts` type-plus-constructor
 * module in this codebase.
 */

export type ReminderScheduleMode = "fixed_times" | "times_per_day_spread";

export interface ReminderSchedule {
  mode: ReminderScheduleMode;
  /** HH:mm strings, e.g. ["08:00","21:00"] -- read only when mode === "fixed_times". */
  fixedTimes: string[];
  /** How many times/day to spread across the window -- read only when mode === "times_per_day_spread". */
  timesPerDay: number;
  /** HH:mm, the day-local window "variable times" are spread inside. */
  windowStart: string;
  /** HH:mm, the day-local window "variable times" are spread inside. */
  windowEnd: string;
  /** Minimum minutes enforced between two spread times the same day, so they never cluster. */
  minGapMinutes: number;
  /** 0 (Sun) - 6 (Sat); empty array means every day. */
  daysOfWeek: number[];
  repeat: { kind: "forever" } | { kind: "until"; endDate: string };
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createFixedTimesSchedule(fixedTimes: string[], daysOfWeek: number[], now: string): ReminderSchedule {
  return {
    mode: "fixed_times",
    fixedTimes: [...fixedTimes].sort(),
    timesPerDay: fixedTimes.length,
    windowStart: "00:00",
    windowEnd: "23:59",
    minGapMinutes: 0,
    daysOfWeek: [...daysOfWeek],
    repeat: { kind: "forever" },
    paused: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSpreadSchedule(
  timesPerDay: number,
  windowStart: string,
  windowEnd: string,
  minGapMinutes: number,
  daysOfWeek: number[],
  now: string
): ReminderSchedule {
  return {
    mode: "times_per_day_spread",
    fixedTimes: [],
    timesPerDay: Math.max(1, timesPerDay),
    windowStart,
    windowEnd,
    minGapMinutes: Math.max(0, minGapMinutes),
    daysOfWeek: [...daysOfWeek],
    repeat: { kind: "forever" },
    paused: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function pauseReminderSchedule(schedule: ReminderSchedule, now: string): ReminderSchedule {
  return { ...schedule, paused: true, updatedAt: now };
}

export function resumeReminderSchedule(schedule: ReminderSchedule, now: string): ReminderSchedule {
  return { ...schedule, paused: false, updatedAt: now };
}

export function setReminderScheduleRepeatUntil(schedule: ReminderSchedule, endDate: string | null, now: string): ReminderSchedule {
  return { ...schedule, repeat: endDate === null ? { kind: "forever" } : { kind: "until", endDate }, updatedAt: now };
}
