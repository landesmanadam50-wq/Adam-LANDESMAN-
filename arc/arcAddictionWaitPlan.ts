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
  waitEnd: PlannedWaitEndNotification | null;
  ongoing: PlannedOngoingNotification | null;
}

export const EMPTY_ADDICTION_NOTIFICATION_PLAN: AddictionNotificationPlan = { waitEnd: null, ongoing: null };

export function resolveAddictionNotificationPlan(session: AddictionSession | null, nowMs: number): AddictionNotificationPlan {
  const round = getActiveWaitRound(session);
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
