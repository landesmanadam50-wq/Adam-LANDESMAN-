/**
 * arc/arcAddictionWaitPlan.ts
 *
 * Pure description of the OS notifications an ARC Addiction session
 * needs right now. data/arcAddictionWaitNotification.ts applies it to
 * notifee. Keeping the decision pure makes "no duplicates" testable:
 *
 *   - At most ONE end-of-wait trigger exists, under a FIXED id, so
 *     re-arming always replaces and two can never coexist.
 *   - At most ONE ongoing countdown notification, also a fixed id.
 *   - No active wait => the plan is empty => both get cancelled.
 *
 * The end-of-wait trigger is a real scheduled alarm (notifee
 * TIMESTAMP trigger, AlarmManager SET_ALARM_CLOCK), so it fires on time
 * even when the app is closed or killed. Its two action buttons open
 * the app (launchActivity) with the answer already recorded.
 */

import type { AddictionSession } from "./arcAddictionFlow.ts";
import { getActiveWaitRound } from "./arcAddictionFlow.ts";
import { ARC_ADDICTION_ANSWER_NO, ARC_ADDICTION_ANSWER_YES, ARC_ADDICTION_DECISION_QUESTION, getWaitNotificationTitle } from "./arcAddictionCopy.ts";

export const ARC_ADDICTION_WAIT_END_NOTIFICATION_ID = "arc-addiction-wait-end";
export const ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID = "arc-addiction-wait-ongoing";

export const ARC_ADDICTION_WAIT_END_KIND = "arcAddictionWaitEnd";
export const ARC_ADDICTION_WAIT_ONGOING_KIND = "arcAddictionWaitOngoing";

export const ACTION_ARC_ADDICTION_YES = "arc_addiction_act_yes";
export const ACTION_ARC_ADDICTION_NO = "arc_addiction_act_no";
export const ACTION_ARC_ADDICTION_END_WAIT = "arc_addiction_end_wait";

export interface PlannedNotificationAction {
  title: string;
  pressActionId: string;
}

export interface PlannedWaitEndNotification {
  id: typeof ARC_ADDICTION_WAIT_END_NOTIFICATION_ID;
  fireAtMs: number;
  title: string;
  body: string;
  data: { kind: typeof ARC_ADDICTION_WAIT_END_KIND; episodeId: string };
  actions: PlannedNotificationAction[];
}

export interface PlannedOngoingNotification {
  id: typeof ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID;
  endsAtMs: number;
  title: string;
  body: string;
  data: { kind: typeof ARC_ADDICTION_WAIT_ONGOING_KIND; episodeId: string };
  actions: PlannedNotificationAction[];
}

export interface AddictionNotificationPlan {
  /** The trigger to (re-)arm; null => no trigger should be pending. */
  waitEnd: PlannedWaitEndNotification | null;
  ongoing: PlannedOngoingNotification | null;
  /**
   * Whether an already DISPLAYED "כן / לא" notification should be removed.
   * false while the session is on its decision step – that notification IS
   * how the user answers; true once answered / ended / no session.
   */
  dismissDisplayedWaitEnd: boolean;
}

export const EMPTY_ADDICTION_NOTIFICATION_PLAN: AddictionNotificationPlan = { waitEnd: null, ongoing: null, dismissDisplayedWaitEnd: true };

export function resolveAddictionNotificationPlan(session: AddictionSession | null, nowMs: number): AddictionNotificationPlan {
  const round = getActiveWaitRound(session);
  if (session?.stage === "decision") return { waitEnd: null, ongoing: null, dismissDisplayedWaitEnd: false };
  if (!session || !round) return EMPTY_ADDICTION_NOTIFICATION_PLAN;
  const endsAtMs = Date.parse(round.endsAt);
  if (!Number.isFinite(endsAtMs)) return EMPTY_ADDICTION_NOTIFICATION_PLAN;
  const episodeId = session.episode.id;
  const waitEnd: PlannedWaitEndNotification | null =
    endsAtMs > nowMs
      ? {
          id: ARC_ADDICTION_WAIT_END_NOTIFICATION_ID,
          fireAtMs: endsAtMs,
          title: getWaitNotificationTitle(session.profileName),
          body: ARC_ADDICTION_DECISION_QUESTION,
          data: { kind: ARC_ADDICTION_WAIT_END_KIND, episodeId },
          actions: [
            { title: ARC_ADDICTION_ANSWER_YES, pressActionId: ACTION_ARC_ADDICTION_YES },
            { title: ARC_ADDICTION_ANSWER_NO, pressActionId: ACTION_ARC_ADDICTION_NO },
          ],
        }
      : null;
  return {
    waitEnd,
    // A wait is running again (e.g. an extra round): any older displayed "כן / לא" is outdated.
    dismissDisplayedWaitEnd: true,
    ongoing: {
      id: ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID,
      endsAtMs,
      title: session.profileName.trim() ? `ARC Addiction · ${session.profileName.trim()}` : "ARC Addiction",
      body: `זמן המתנה (${round.targetMinutes} דק'). אפשר להמשיך בשגרה – תקבל התראה בסיום.`,
      data: { kind: ARC_ADDICTION_WAIT_ONGOING_KIND, episodeId },
      actions: [{ title: "סיום הטיימר", pressActionId: ACTION_ARC_ADDICTION_END_WAIT }],
    },
  };
}

/** Maps a notification action id to the session event it records (null = just open the session screen). */
export function resolveAddictionNotificationAction(pressActionId: string | null | undefined): { type: "ANSWER"; choice: "act" | "not_act" } | { type: "END_WAIT_EARLY" } | null {
  switch (pressActionId) {
    case ACTION_ARC_ADDICTION_YES:
      return { type: "ANSWER", choice: "act" };
    case ACTION_ARC_ADDICTION_NO:
      return { type: "ANSWER", choice: "not_act" };
    case ACTION_ARC_ADDICTION_END_WAIT:
      return { type: "END_WAIT_EARLY" };
    default:
      return null;
  }
}

export function isArcAddictionNotificationKind(kind: unknown): boolean {
  return kind === ARC_ADDICTION_WAIT_END_KIND || kind === ARC_ADDICTION_WAIT_ONGOING_KIND;
}

/** The floating overlay's second line: the running wait only (label + absolute end time). */
export function resolveAddictionOverlaySecondary(session: AddictionSession | null): { label: string; endsAtMs: number } | null {
  const round = getActiveWaitRound(session);
  if (!session || !round) return null;
  const endsAtMs = Date.parse(round.endsAt);
  if (!Number.isFinite(endsAtMs)) return null;
  return { label: session.profileName.trim() || "זמן המתנה", endsAtMs };
}

/** A pending "open the session screen" request (set by a notification press) older than this is ignored – never a surprise redirect later. */
export const PENDING_OPEN_MAX_AGE_MS = 2 * 60_000;

export function isPendingOpenFresh(value: string | null, nowMs: number): boolean {
  if (value === null) return false;
  const at = Number(value);
  return Number.isFinite(at) && nowMs - at >= 0 && nowMs - at <= PENDING_OPEN_MAX_AGE_MS;
}
