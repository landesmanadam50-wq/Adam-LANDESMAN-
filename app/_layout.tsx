import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { cancelPendingReminder, resolveReminderRoute } from "../data/reminders.ts";
import { reconcileRoutineNotifications } from "../data/routines.ts";
import { reconcileArcGoalTargetNotification } from "../data/arcGoalTargetReminders.ts";
import { getArcGoalTarget } from "../data/storage.ts";
import type { ReminderKind } from "../data/storage.ts";

/**
 * Reminder/timer-update task (#4, #5): routes a tapped reminder
 * notification toward its relevant entry point -- resolveReminderRoute
 * is the single source of truth for which route that is (data/reminders.ts),
 * kept here purely as I/O plumbing (reading the tapped notification's
 * data payload, navigating, clearing the now-resolved pending record so
 * it's never treated as still-pending). Never touches ARC/BUILD logic
 * itself -- opening either route starts that route's own, completely
 * normal flow, exactly as if the trainee had navigated there directly.
 *
 * Multiple Scheduled ARC + Success Focus Routines: kind "routine" is
 * handled as its own branch, never through resolveReminderRoute/
 * cancelPendingReminder -- both are built around PendingReminder's
 * one-per-KIND model (data/storage.ts), which a routine notification
 * was deliberately NOT built on (see data/routines.ts's module doc: any
 * number of routines, including several at once, must each keep their
 * own independent notification). Opens the SAME /live flow every other
 * ARC entry point uses, with this routine's own id as a param --
 * live/LiveSessionScreen.tsx reads it to run this routine's post-ARC
 * Success Focus step once the protocol completes.
 * reconcileRoutineNotifications is fire-and-forget here: it schedules
 * this routine's NEXT occurrence's notification (this one has just
 * fired/been tapped), the same lazy "absolute timestamps are
 * authoritative, reconcile on the next relevant screen focus" pattern
 * data/routines.ts's own doc describes -- also reached again, safely
 * idempotently, whenever the routines screen itself gains focus.
 */
function handleReminderResponse(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  const data = response.notification.request.content.data;
  if (data?.isReminder !== true) return; // Not one of ours (or a timer-completion notification, which never navigates anywhere).
  const kind = data.kind as ReminderKind;
  if (kind === "routine") {
    const routineId = typeof data.routineId === "string" ? data.routineId : null;
    reconcileRoutineNotifications();
    if (routineId) router.push({ pathname: "/live", params: { routineId } });
    return;
  }
  // Sub-goal execution task: same "own independent notification per
  // entity, never PendingReminder's one-per-kind model" treatment as
  // "routine" above -- deep-links straight to the tapped target itself
  // (spec section 9), then reconciles that SAME target's own next
  // occurrence (fire-and-forget, mirrors reconcileRoutineNotifications'
  // own lazy-reconcile-on-next-relevant-touch pattern).
  if (kind === "arcGoalTarget") {
    const targetId = typeof data.targetId === "string" ? data.targetId : null;
    if (targetId) {
      getArcGoalTarget(targetId).then((target) => {
        if (target) reconcileArcGoalTargetNotification(target);
      });
      router.push({ pathname: "/goals/target/[targetId]", params: { targetId } });
    }
    return;
  }
  if (kind === "fourWeekProgramWeek") {
    const goalId = typeof data.arcGoalId === "string" ? data.arcGoalId : null;
    if (goalId) router.push({ pathname: "/goals/live/[goalId]", params: { goalId } });
    return;
  }
  if (kind === "personalDevelopmentProgramWeek") {
    const programId = typeof data.personalDevelopmentProgramId === "string" ? data.personalDevelopmentProgramId : null;
    if (programId) router.push({ pathname: "/personal-development-program/live/[id]", params: { id: programId } });
    return;
  }
  cancelPendingReminder(kind);
  router.push(resolveReminderRoute(kind));
}

export default function RootLayout() {
  useEffect(() => {
    // Cold start: the app was opened BY tapping a reminder notification.
    Notifications.getLastNotificationResponseAsync().then(handleReminderResponse);
    // Already running (foreground/background, not killed): the trainee taps a reminder notification now.
    const subscription = Notifications.addNotificationResponseReceivedListener(handleReminderResponse);
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerTitleAlign: "center" }}>
        <Stack.Screen name="index" options={{ title: "ARCHI" }} />
        <Stack.Screen name="self-development/index" options={{ title: "התפתחות אישית" }} />
        <Stack.Screen name="self-development/build" options={{ title: "בניית תוכנית חדשה" }} />
        <Stack.Screen name="reach-your-goal/index" options={{ title: "השגת מטרה" }} />
        <Stack.Screen name="build/index" options={{ title: "ARC Builds" }} />
        <Stack.Screen name="build/[id]" options={{ title: "עריכת ARC Build" }} />
        <Stack.Screen name="arc-state-composition/[id]" options={{ title: "הרכבת ARC State" }} />
        <Stack.Screen name="live/index" options={{ title: "ARCHI LIVE" }} />
        <Stack.Screen name="stats/index" options={{ title: "התקדמות שבועית" }} />
        <Stack.Screen name="focus-success" options={{ title: "התמקדות בהצלחה" }} />
        <Stack.Screen name="routines/index" options={{ title: "השגרה שלי" }} />
        <Stack.Screen name="link-practice/index" options={{ title: "תרגול קישורים" }} />
        <Stack.Screen name="negative-action" options={{ title: "פעולה שלילית מוגבלת" }} />
        <Stack.Screen name="mini-arc/index" options={{ title: "בניית Mini ARC" }} />
        <Stack.Screen name="mini-arc/[id]" options={{ title: "עריכת Mini ARC" }} />
        <Stack.Screen name="mini-arc/live/[id]" options={{ title: "Mini ARC LIVE" }} />
        <Stack.Screen name="mini-arc/mode/[id]" options={{ title: "מה תרצה לתרגל?" }} />
        <Stack.Screen name="live/select" options={{ title: "מה תרצה לתרגל?" }} />
        <Stack.Screen name="arc-link/[id]" options={{ title: "ARC Link" }} />
        <Stack.Screen name="mini-arc-link/[id]" options={{ title: "Mini ARC Link" }} />
        <Stack.Screen name="urge-arcs/index" options={{ title: "בניית Urge ARC" }} />
        <Stack.Screen name="urge-arcs/[id]" options={{ title: "עריכת Urge ARC" }} />
        <Stack.Screen name="urge-arcs/live/[id]" options={{ title: "Urge ARC LIVE" }} />
        <Stack.Screen name="thought-arcs/index" options={{ title: "בניית ARC Thought" }} />
        <Stack.Screen name="thought-arcs/[id]" options={{ title: "עריכת ARC Thought" }} />
        <Stack.Screen name="thought-arcs/live/[id]" options={{ title: "ARC Thought LIVE" }} />
        <Stack.Screen name="presence-arcs/index" options={{ title: "בניית ARC Presence" }} />
        <Stack.Screen name="presence-arcs/[id]" options={{ title: "עריכת ARC Presence" }} />
        <Stack.Screen name="presence-arcs/live/[id]" options={{ title: "ARC Presence LIVE" }} />
        <Stack.Screen name="belief-arcs/index" options={{ title: "בניית ARC Belief" }} />
        <Stack.Screen name="belief-arcs/[id]" options={{ title: "עריכת ARC Belief" }} />
        <Stack.Screen name="belief-arcs/live/[id]" options={{ title: "ARC Belief LIVE" }} />
        <Stack.Screen name="identity-extension/offer" options={{ title: "המשך לבניית הזהות" }} />
        <Stack.Screen name="identity-extension/live" options={{ title: "בניית הזהות והפעולה" }} />
        <Stack.Screen name="personal-development-program/index" options={{ title: "תוכניות התפתחות אישית" }} />
        <Stack.Screen name="personal-development-program/live/[id]" options={{ title: "תוכנית התפתחות אישית" }} />
        <Stack.Screen name="goals/index" options={{ title: "מטרות ARC Goal" }} />
        <Stack.Screen name="goals/[id]" options={{ title: "עריכת מטרה" }} />
        <Stack.Screen name="goals/live/[goalId]" options={{ title: "תוכנית ארבעת השבועות" }} />
        <Stack.Screen name="goals/execution/[goalId]" options={{ title: "ביצוע המטרה" }} />
        <Stack.Screen name="goals/target/[targetId]" options={{ title: "יעד" }} />
        <Stack.Screen name="calendar/index" options={{ title: "לוח שנה" }} />
        <Stack.Screen name="arc-goal/select" options={{ title: "מה תרצה לתרגל?" }} />
        <Stack.Screen name="arc-goal/live/[goalId]" options={{ title: "ARC Goal LIVE" }} />
        <Stack.Screen name="life-manifest/index" options={{ title: "מניפסט החיים שלי" }} />
        <Stack.Screen name="life-manifest/[id]" options={{ title: "עריכת מניפסט חיים" }} />
        <Stack.Screen name="life-manifest/sub-goal/[subGoalId]" options={{ title: "ניהול תת־מטרה" }} />
        <Stack.Screen name="life-manifest/visualize/[majorGoalId]" options={{ title: "דמיון מודרך" }} />
      </Stack>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
