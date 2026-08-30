/**
 * arc/reminders.ts
 *
 * The pure half of the "come back later" reminder feature (#4, #5) --
 * deferred Focus Success and the independently-scheduled future ARC
 * session reminder. Split out from data/reminders.ts (which owns the
 * actual I/O: AsyncStorage persistence + expo-notifications scheduling)
 * for the same reason arc/actionTimer.ts is separate from
 * data/storage.ts/data/notifications.ts: data/notifications.ts imports
 * `Platform` from "react-native", which can't be loaded under plain
 * node --test -- so nothing this project unit-tests may import it,
 * even transitively. This file has no such dependency and is fully
 * unit-tested directly.
 */

import type { ReminderKind } from "../data/storage.ts";

export interface DeferralOption {
  id: string;
  label: string;
  offsetMinutes: number;
}

/**
 * Deliberately plain relative offsets ("in 1 hour", not "tomorrow at
 * 9am") -- this avoids any time-of-day/timezone computation entirely,
 * unlike program/dateUtils.ts's calendar-date arithmetic (that module
 * answers "how many calendar days apart", which isn't what a "remind
 * me in a few hours" chip needs). No date/time-picker UI dependency
 * exists in this project (and none is added for this feature): the
 * trainee picks from this small preset set instead of an arbitrary
 * calendar date/time, the same "chip picker" interaction already used
 * everywhere else in this app.
 */
export const DEFERRAL_OPTIONS: DeferralOption[] = [
  { id: "1h", label: "בעוד שעה", offsetMinutes: 60 },
  { id: "3h", label: "בעוד 3 שעות", offsetMinutes: 180 },
  { id: "tomorrow", label: "מחר, באותה שעה", offsetMinutes: 24 * 60 },
  { id: "2days", label: "בעוד יומיים", offsetMinutes: 2 * 24 * 60 },
];

/** The absolute moment a DeferralOption resolves to, from `now`. */
export function resolveReminderFireDate(option: DeferralOption, now: Date = new Date()): Date {
  return new Date(now.getTime() + option.offsetMinutes * 60_000);
}

export type ReminderRoute = "/live" | "/focus-success";

/**
 * Which route opening a reminder notification should lead to (#4
 * "opening the reminder resumes/opens the appropriate flow", #5
 * "opening it should lead toward the relevant ARC entry point"). Mid-
 * session LIVE state is never persisted (see
 * live/LiveSessionScreen.tsx's module doc) -- there is no partial ARC
 * protocol to "resume" here, only a fresh entry point to open -- so
 * both "arc" reminders and "focusSuccess with ARC" reminders correctly
 * lead to a fresh LIVE session (the relevant ARC entry point); only
 * "focusSuccess without ARC" leads to the standalone Focus Success
 * screen (app/focus-success.tsx), which starts the SAME Success Focus
 * timer directly, without requiring the full protocol.
 */
export function resolveReminderRoute(kind: ReminderKind, arcRequested: boolean): ReminderRoute {
  if (kind === "focusSuccess" && !arcRequested) return "/focus-success";
  return "/live";
}
