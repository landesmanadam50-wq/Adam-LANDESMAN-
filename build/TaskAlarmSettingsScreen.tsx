import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import notifee from "@notifee/react-native";

import { loadTaskAlarmPreferences, saveTaskAlarmPreferences } from "../data/storage.ts";
import type { TaskAlarmPreferences } from "../data/storage.ts";
import { rearmAllTaskAlarms } from "../data/taskAlarm.ts";

/**
 * build/TaskAlarmSettingsScreen.tsx (route /tasks/alarm-settings)
 *
 * Requirement: lets the trainee turn the task-alarm's sound and
 * vibration on/off SEPARATELY. Both are read fresh, at ring time, by
 * data/taskAlarm.ts's foreground-service handler -- what this screen
 * saves here is only ever the stored PREFERENCE; rearmAllTaskAlarms
 * below just re-syncs every already-pending alarm's own
 * notificationId/notificationScheduledFor bookkeeping (not the
 * sound/vibration choice itself, which needs no re-arming to take
 * effect, since it's read at ring time).
 *
 * Task-alarm task: the real alarm is explicitly allowed to ring through
 * Do Not Disturb/silent mode (the trainee's own choice for THIS alarm
 * specifically -- every other notification in the app still always
 * respects it). Android 12+ also requires the trainee to separately
 * grant "Alarms & reminders" access for an exact alarm to fire reliably
 * -- openAlarmPermissionSettings() below opens that OS settings screen;
 * it's a settings-only toggle Android doesn't expose as an in-app
 * runtime permission dialog.
 */
export default function TaskAlarmSettingsScreen() {
  const [preferences, setPreferences] = useState<TaskAlarmPreferences | null>(null);

  const reload = useCallback(() => {
    loadTaskAlarmPreferences().then(setPreferences);
  }, []);

  useFocusEffect(reload);

  async function update(patch: Partial<TaskAlarmPreferences>) {
    if (!preferences) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    await saveTaskAlarmPreferences(next);
    await rearmAllTaskAlarms();
  }

  if (!preferences) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>הגדרות שעון מעורר למשימות</Text>
        <Text style={styles.hint}>כאשר מגיעה שעת ההתחלה של משימה, ניתן לבחור אם תישמע התראה ואם הטלפון ירטוט -- בנפרד, בהתאם ליכולות המכשיר.</Text>

        <View style={styles.switchRow}>
          <Switch value={preferences.soundEnabled} onValueChange={(value) => update({ soundEnabled: value })} />
          <Text style={styles.fieldLabel}>צליל</Text>
        </View>

        <View style={styles.switchRow}>
          <Switch value={preferences.vibrationEnabled} onValueChange={(value) => update({ vibrationEnabled: value })} />
          <Text style={styles.fieldLabel}>רטט</Text>
        </View>

        <View style={styles.switchRow}>
          <Switch value={preferences.showReflectionOnLockScreen} onValueChange={(value) => update({ showReflectionOnLockScreen: value })} />
          <Text style={styles.fieldLabel}>הצגת הרפלקציה האחרונה בהתראת המשימה</Text>
        </View>
        <Text style={styles.hint}>רפלקציות עלולות לכלול מידע אישי. אם מכבים זאת, ההתראה תציג טקסט כללי בלבד, ולא את תוכן הרפלקציה.</Text>

        <Text style={styles.hint}>
          לתשומת ליבך: השעון המעורר של משימה מיועד לצלצל גם במצב שקט / נא לא להפריע. הרשאות התראות שנדחו במכשיר עדיין גוברות.
        </Text>

        {Platform.OS === "android" && (
          <Pressable style={styles.secondaryButton} onPress={() => notifee.openAlarmPermissionSettings()}>
            <Text style={styles.secondaryButtonText}>פתיחת הרשאת &quot;שעונים ותזכורות&quot; במכשיר</Text>
          </Pressable>
        )}

        {/*
         * ARCHI -- Unified Development Specification task, Part 12: "do
         * not promise that heads-up notifications can always override
         * Android user settings or Do Not Disturb" -- these two links
         * open the OS's own settings screens (notifee's own
         * openNotificationSettings/openPowerManagerSettings), never an
         * attempt to force the setting from inside the app itself. Some
         * manufacturers (Xiaomi/MIUI/HyperOS and similar) gate the
         * actual pop-up/floating display of a notification behind a
         * SEPARATE, manufacturer-specific permission that stock Android
         * channel importance alone does not control -- the battery/
         * power-manager screen is typically where that lives.
         */}
        {Platform.OS === "android" && (
          <>
            <Text style={styles.hint}>
              אם ההתראה אינה מוצגת כחלון קופץ בראש המסך (למשל במכשירי Xiaomi / MIUI / HyperOS), בדוק את הרשאות ההתראה וחיסכון
              בסוללה של האפליקציה בהגדרות המכשיר.
            </Text>
            <Pressable style={styles.secondaryButton} onPress={() => notifee.openNotificationSettings().catch(() => {})}>
              <Text style={styles.secondaryButtonText}>פתיחת הגדרות התראות של האפליקציה</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => notifee.openPowerManagerSettings().catch(() => {})}>
              <Text style={styles.secondaryButtonText}>פתיחת הגדרות חיסכון בסוללה</Text>
            </Pressable>
          </>
        )}

        {/* Critical-bug task ("Native Alarm Still Not Working"), Step 2. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/tasks/alarm-diagnostics")}>
          <Text style={styles.secondaryButtonText}>בדיקת שעון מעורר</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 16, lineHeight: 19 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 8 },
  fieldLabel: { fontSize: 16, textAlign: "right", color: "#222" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 16 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
});
