import test from "node:test";
import assert from "node:assert/strict";
import { addCalendarDays, daysBetweenCalendarDates, parseCalendarDate, todayLocalDateString } from "./dateUtils.ts";

test("parseCalendarDate parses a strict YYYY-MM-DD string", () => {
  assert.deepEqual(parseCalendarDate("2026-08-27"), { year: 2026, month: 8, day: 27 });
});

test("parseCalendarDate rejects a full ISO timestamp", () => {
  assert.throws(() => parseCalendarDate("2026-08-27T10:00:00Z"));
});

test("parseCalendarDate rejects an invalid month/day", () => {
  assert.throws(() => parseCalendarDate("2026-13-01"));
  assert.throws(() => parseCalendarDate("2026-02-32"));
});

test("daysBetweenCalendarDates is 0 for the same date", () => {
  assert.equal(daysBetweenCalendarDates("2026-08-27", "2026-08-27"), 0);
});

test("daysBetweenCalendarDates is 1 for consecutive days", () => {
  assert.equal(daysBetweenCalendarDates("2026-08-27", "2026-08-28"), 1);
});

test("daysBetweenCalendarDates is negative when b is before a", () => {
  assert.equal(daysBetweenCalendarDates("2026-08-28", "2026-08-27"), -1);
});

test("daysBetweenCalendarDates crosses a month boundary correctly", () => {
  assert.equal(daysBetweenCalendarDates("2026-08-30", "2026-09-02"), 3);
});

test("daysBetweenCalendarDates crosses a year boundary correctly", () => {
  assert.equal(daysBetweenCalendarDates("2026-12-30", "2027-01-02"), 3);
});

test("daysBetweenCalendarDates handles a leap year February correctly", () => {
  // 2028 is a leap year: Feb has 29 days.
  assert.equal(daysBetweenCalendarDates("2028-02-28", "2028-03-01"), 2);
  // 2026 is not: Feb has 28 days.
  assert.equal(daysBetweenCalendarDates("2026-02-28", "2026-03-01"), 1);
});

test("daysBetweenCalendarDates is unaffected by the classic US DST transition dates", () => {
  // Spring-forward 2026-03-08 (US) -- a naive Date-based ms/day calc can misfire here.
  assert.equal(daysBetweenCalendarDates("2026-03-07", "2026-03-09"), 2);
});

test("addCalendarDays adds within a month", () => {
  assert.equal(addCalendarDays("2026-08-20", 6), "2026-08-26");
});

test("addCalendarDays crosses a month boundary", () => {
  assert.equal(addCalendarDays("2026-08-30", 6), "2026-09-05");
});

test("addCalendarDays crosses a year boundary", () => {
  assert.equal(addCalendarDays("2026-12-30", 6), "2027-01-05");
});

test("addCalendarDays handles a leap day correctly", () => {
  assert.equal(addCalendarDays("2028-02-27", 2), "2028-02-29");
  assert.equal(addCalendarDays("2028-02-27", 3), "2028-03-01");
});

test("addCalendarDays with a negative offset subtracts", () => {
  assert.equal(addCalendarDays("2026-08-01", -1), "2026-07-31");
});

test("addCalendarDays and daysBetweenCalendarDates round-trip for a range of offsets", () => {
  for (const offset of [0, 1, 6, 7, 30, 365, -1, -30]) {
    const shifted = addCalendarDays("2026-08-27", offset);
    assert.equal(daysBetweenCalendarDates("2026-08-27", shifted), offset, `offset ${offset}`);
  }
});

test("addCalendarDays round-trips across a wide spread of base dates and offsets", () => {
  const bases = ["1970-01-01", "1999-12-31", "2000-01-01", "2000-02-29", "2024-02-29", "2026-08-27", "2100-03-01"];
  const offsets = [0, 1, 7, 29, 30, 365, 366, 1000, -1, -7, -365];
  for (const base of bases) {
    for (const offset of offsets) {
      const shifted = addCalendarDays(base, offset);
      assert.equal(daysBetweenCalendarDates(base, shifted), offset, `base ${base}, offset ${offset}`);
    }
  }
});

test("todayLocalDateString uses local getters, not UTC -- matches an injected Date's own y/m/d", () => {
  const injected = new Date(2026, 7, 27, 23, 30); // local: Aug 27 2026, 23:30 -- month is 0-indexed
  assert.equal(todayLocalDateString(injected), "2026-08-27");
});

test("todayLocalDateString pads single-digit month and day", () => {
  const injected = new Date(2026, 0, 5); // local: Jan 5 2026
  assert.equal(todayLocalDateString(injected), "2026-01-05");
});

test("daysFromCivil/civilFromDays agree with known reference points", () => {
  // 1970-01-01 is the epoch: 0 days from itself in either direction.
  assert.equal(daysBetweenCalendarDates("1970-01-01", "1970-01-01"), 0);
  assert.equal(addCalendarDays("1970-01-01", 0), "1970-01-01");
  // 2000-03-01 is a well-known reference date one day after the leap day in a leap year.
  assert.equal(addCalendarDays("2000-02-29", 1), "2000-03-01");
});
