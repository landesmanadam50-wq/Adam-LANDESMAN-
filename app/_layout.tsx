import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { cancelPendingReminder, resolveReminderRoute } from "../data/reminders.ts";
import { reconcileRoutineNotifications } from "../data/routines.ts";
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
        <Stack.Screen name="build/index" options={{ title: "בניית מטרה" }} />
        <Stack.Screen name="build-arc/index" options={{ title: "בניית מפת ARC" }} />
        <Stack.Screen name="live/index" options={{ title: "ARCHI LIVE" }} />
        <Stack.Screen name="stats/index" options={{ title: "התקדמות שבועית" }} />
        <Stack.Screen name="focus-success" options={{ title: "התמקדות בהצלחה" }} />
        <Stack.Screen name="routines/index" options={{ title: "השגרה שלי" }} />
      </Stack>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
