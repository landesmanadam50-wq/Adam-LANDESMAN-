import test from "node:test";
import assert from "node:assert/strict";

import { resolveUpcomingTriggerTimes, spreadTimesInWindow } from "./arcReminderScheduling.ts";
import { createFixedTimesSchedule, createSpreadSchedule, pauseReminderSchedule, setReminderScheduleRepeatUntil } from "./arcReminderSchedule.ts";

const NOW = "2026-01-05T12:00:00.000Z"; // a Monday

test("spreadTimesInWindow divides the window into `count` equal buckets and places one time per bucket inside it", () => {
  const times = spreadTimesInWindow("2026-02-02", "09:00", "21:00", 4, 30, "seed-a");
  assert.equal(times.length, 4);
  const minutesOfDay = times.map((d) => d.getHours() * 60 + d.getMinutes());
  assert.ok(minutesOfDay[0] >= 9 * 60 && minutesOfDay[0] < 9 * 60 + 3 * 60);
  assert.ok(minutesOfDay[3] >= 9 * 60 + 9 * 60 && minutesOfDay[3] <= 21 * 60);
  for (let i = 1; i < minutesOfDay.length; i++) assert.ok(minutesOfDay[i] > minutesOfDay[i - 1]);
});

test("spreadTimesInWindow enforces minGapMinutes even when jitter would otherwise collapse two times together", () => {
  const times = spreadTimesInWindow("2026-02-02", "09:00", "10:00", 3, 15, "seed-b");
  const minutes = times.map((d) => d.getHours() * 60 + d.getMinutes());
  for (let i = 1; i < minutes.length; i++) assert.ok(minutes[i] - minutes[i - 1] >= 15 - 0.5);
});

test("spreadTimesInWindow is deterministic -- the same (date, window, count, seed) always produces the exact same times, so rolling top-up is idempotent", () => {
  const a = spreadTimesInWindow("2026-03-10", "08:00", "22:00", 5, 15, "reminder-1");
  const b = spreadTimesInWindow("2026-03-10", "08:00", "22:00", 5, 15, "reminder-1");
  assert.deepEqual(a, b);
  const c = spreadTimesInWindow("2026-03-10", "08:00", "22:00", 5, 15, "reminder-2");
  assert.notDeepEqual(a, c);
});

test("spreadTimesInWindow returns [] for a non-positive count or an inverted/empty window", () => {
  assert.deepEqual(spreadTimesInWindow("2026-02-02", "09:00", "21:00", 0, 10, "s"), []);
  assert.deepEqual(spreadTimesInWindow("2026-02-02", "21:00", "09:00", 3, 10, "s"), []);
  assert.deepEqual(spreadTimesInWindow("2026-02-02", "bad", "21:00", 3, 10, "s"), []);
});

test("resolveUpcomingTriggerTimes with fixed_times returns exactly the given clock times on every included day, across the requested window", () => {
  const schedule = createFixedTimesSchedule(["08:00", "21:30"], [], NOW);
  const windowStart = new Date(2026, 1, 2, 0, 0, 0); // Monday 2026-02-02
  const windowEnd = new Date(2026, 1, 3, 23, 59, 0); // Tuesday
  const times = resolveUpcomingTriggerTimes(schedule, windowStart, windowEnd);
  assert.equal(times.length, 4); // 2 days x 2 fixed times
  assert.equal(times[0].getHours(), 8);
  assert.equal(times[1].getHours(), 21);
  assert.equal(times[1].getMinutes(), 30);
});

test("resolveUpcomingTriggerTimes filters by daysOfWeek -- empty array means every day, a non-empty array restricts to exactly those weekdays", () => {
  const schedule = createFixedTimesSchedule(["09:00"], [1], NOW); // Monday only
  const windowStart = new Date(2026, 1, 2, 0, 0, 0); // Monday
  const windowEnd = new Date(2026, 1, 8, 23, 59, 0); // following Sunday
  const times = resolveUpcomingTriggerTimes(schedule, windowStart, windowEnd);
  assert.equal(times.length, 1);
  assert.equal(times[0].getDay(), 1);
});

test("resolveUpcomingTriggerTimes with times_per_day_spread spreads N times inside the per-day window on every included day", () => {
  const schedule = createSpreadSchedule(3, "09:00", "21:00", 20, [], NOW);
  const windowStart = new Date(2026, 1, 2, 0, 0, 0);
  const windowEnd = new Date(2026, 1, 2, 23, 59, 0);
  const times = resolveUpcomingTriggerTimes(schedule, windowStart, windowEnd);
  assert.equal(times.length, 3);
});

test("resolveUpcomingTriggerTimes returns [] immediately when the schedule is paused, regardless of mode/days/repeat", () => {
  const schedule = pauseReminderSchedule(createFixedTimesSchedule(["08:00"], [], NOW), NOW);
  const times = resolveUpcomingTriggerTimes(schedule, new Date(2026, 1, 2), new Date(2026, 1, 9));
  assert.deepEqual(times, []);
});

test("resolveUpcomingTriggerTimes respects repeat.until -- no trigger times are produced on or after the end date", () => {
  const schedule = setReminderScheduleRepeatUntil(createFixedTimesSchedule(["08:00"], [], NOW), "2026-02-03", NOW);
  const windowStart = new Date(2026, 1, 2, 0, 0, 0);
  const windowEnd = new Date(2026, 1, 5, 23, 59, 0);
  const times = resolveUpcomingTriggerTimes(schedule, windowStart, windowEnd);
  assert.equal(times.length, 2); // Feb 2 and Feb 3 (inclusive end date), not Feb 4/5
  for (const time of times) assert.ok(time.getDate() <= 3);
});

test("resolveUpcomingTriggerTimes drops any resolved time outside the requested [windowStart, windowEnd] instant range, even on an included day", () => {
  const schedule = createFixedTimesSchedule(["08:00", "20:00"], [], NOW);
  const windowStart = new Date(2026, 1, 2, 10, 0, 0); // after 08:00 that day
  const windowEnd = new Date(2026, 1, 2, 23, 59, 0);
  const times = resolveUpcomingTriggerTimes(schedule, windowStart, windowEnd);
  assert.equal(times.length, 1);
  assert.equal(times[0].getHours(), 20);
});

test("resolveUpcomingTriggerTimes returns [] for an inverted window (end before start)", () => {
  const times = resolveUpcomingTriggerTimes(createFixedTimesSchedule(["08:00"], [], NOW), new Date(2026, 1, 5), new Date(2026, 1, 2));
  assert.deepEqual(times, []);
});
