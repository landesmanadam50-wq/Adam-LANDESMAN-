/**
 * program/dateUtils.ts
 *
 * ARC week windows are defined by LOCAL CALENDAR DATE, not elapsed
 * milliseconds. The previous `new Date(dateString)` + ms-per-day
 * arithmetic in progress.ts (removed) is timezone/DST-sensitive: e.g.
 * new Date("2026-03-08") and new Date("2026-03-09") can be less than
 * 24 real hours apart across a DST transition, and does not answer
 * "how many calendar days apart are these" the way a trainee means it.
 *
 * parseCalendarDate + daysBetweenCalendarDates work entirely in
 * year/month/day integers, so they're immune to timezone offset, DST,
 * and time-of-day -- there is no time-of-day, only a date.
 *
 * The day-count conversion is Howard Hinnant's days_from_civil /
 * civil_from_days algorithm (a well-known, widely used, exhaustively
 * verified proleptic-Gregorian <-> day-count conversion), adapted to
 * use Math.floor throughout for true floor division.
 */

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a strict "YYYY-MM-DD" string. Throws on anything else, including a full ISO timestamp. */
export function parseCalendarDate(localDate: string): CalendarDate {
  const match = CALENDAR_DATE_PATTERN.exec(localDate);
  if (!match) {
    throw new Error(`Expected a "YYYY-MM-DD" calendar date, got "${localDate}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`"${localDate}" is not a valid calendar date`);
  }
  return { year, month, day };
}

function daysFromCivil(date: CalendarDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // [0, 399]
  const mAdj = date.month > 2 ? date.month - 3 : date.month + 9; // [0, 11]
  const doy = Math.floor((153 * mAdj + 2) / 5) + date.day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468; // days since 1970-01-01
}

function civilFromDays(daysSinceEpoch: number): CalendarDate {
  const z = daysSinceEpoch + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365); // [0, 399]
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const month = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

function formatCalendarDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/** b - a, in whole calendar days. Negative if b is before a. */
export function daysBetweenCalendarDates(a: string, b: string): number {
  return daysFromCivil(parseCalendarDate(b)) - daysFromCivil(parseCalendarDate(a));
}

/** localDate + days (days may be negative), as a "YYYY-MM-DD" string. */
export function addCalendarDays(localDate: string, days: number): string {
  return formatCalendarDate(civilFromDays(daysFromCivil(parseCalendarDate(localDate)) + days));
}

/**
 * Today as "YYYY-MM-DD" in the DEVICE's local timezone. Deliberately
 * uses Date's local getters (getFullYear/getMonth/getDate), not
 * toISOString() (which is UTC) -- a trainee near midnight in a
 * timezone ahead of UTC would otherwise get "tomorrow"'s date, exactly
 * the class of bug this module exists to avoid.
 */
export function todayLocalDateString(now: Date = new Date()): string {
  return formatCalendarDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
