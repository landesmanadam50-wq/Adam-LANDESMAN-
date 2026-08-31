import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";

import { cancelPendingReminder, resolveReminderRoute } from "../data/reminders.ts";
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
 */
function handleReminderResponse(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  const data = response.notification.request.content.data;
  if (data?.isReminder !== true) return; // Not one of ours (or a timer-completion notification, which never navigates anywhere).
  const kind = data.kind as ReminderKind;
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
      </Stack>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
