import { useCallback, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { loadEmotionalCheckInNotificationSettings, saveEmotionalCheckInNotificationSettings } from "../data/storage.ts";
import type { EmotionalCheckInNotificationSettings } from "../data/storage.ts";
import { syncEmotionalCheckInNotification } from "../data/emotionalCheckInNotification.ts";
import { getAlarmPowerManagerInfo, openAlarmPowerManagerSettings } from "../data/taskAlarm.ts";
import type { AlarmPowerManagerInfo } from "../data/taskAlarm.ts";
import { isHomeScreenWidgetPinSupported, requestHomeScreenWidgetPin } from "../data/emotionalCheckInWidget.ts";

/**
 * build/EmotionalCheckInNotificationSettingsScreen.tsx (route /tasks/emotional-checkin-settings)
 *
 * Nine Functional Improvements task, Improvement 8 ("Emotional
 * Check-In on the Android Lock Screen"): the one place the trainee
 * turns the quiet lock-screen check-in notification on/off
 * (data/emotionalCheckInNotification.ts), and reads an HONEST account
 * of what it can and can't guarantee on their specific device --
 * never a claim of guaranteed functionality this app cannot back up.
 *
 * getAlarmPowerManagerInfo/openAlarmPowerManagerSettings are reused
 * UNCHANGED from data/taskAlarm.ts (the exact same OEM
 * background-permission escape hatch the alarm-reliability work
 * already built) -- the Xiaomi/MIUI-style restriction that can delay
 * or suppress a quiet notification is the SAME restriction that
 * threatens a real alarm, so the SAME one settings screen (never a
 * second, duplicated OEM-detection mechanism) is the honest answer
 * here too.
 *
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 1: this is now also the ONE combined
 * entry point for "הוסף כפתורי ARC למסך הבית ולמסך הנעילה" -- the
 * lock-screen half (above) was already fully built; the home-screen
 * half, right below, is the one genuinely new capability this task
 * adds -- a single tap that asks the OS to pin the existing three-mood
 * (😟/🙂/😄) widget to the home screen, instead of a second, separate
 * settings screen. "Never claim unsupported... functionality": the
 * button only ever appears once isHomeScreenWidgetPinSupported()
 * confirms the device's own launcher actually supports the pin-request
 * flow (API 26+ AND an implementing launcher) -- never shown
 * unconditionally and left to fail silently.
 */
export default function EmotionalCheckInNotificationSettingsScreen() {
  const [settings, setSettings] = useState<EmotionalCheckInNotificationSettings | null>(null);
  const [powerManagerInfo, setPowerManagerInfo] = useState<AlarmPowerManagerInfo | null>(null);
  const [widgetPinSupported, setWidgetPinSupported] = useState(false);
  const [widgetPinResult, setWidgetPinResult] = useState<"idle" | "requested" | "unsupported">("idle");

  const reload = useCallback(() => {
    loadEmotionalCheckInNotificationSettings().then(setSettings);
    getAlarmPowerManagerInfo().then(setPowerManagerInfo);
    isHomeScreenWidgetPinSupported().then(setWidgetPinSupported);
  }, []);

  useFocusEffect(reload);

  async function handleToggle(enabled: boolean) {
    const next: EmotionalCheckInNotificationSettings = { enabled };
    setSettings(next);
    await saveEmotionalCheckInNotificationSettings(next);
    await syncEmotionalCheckInNotification();
  }

  async function handleRequestWidgetPin() {
    const accepted = await requestHomeScreenWidgetPin();
    setWidgetPinResult(accepted ? "requested" : "unsupported");
  }

  if (!settings) {
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
        <Text style={styles.title}>הוסף כפתורי ARC למסך הבית ולמסך הנעילה</Text>
        <Text style={styles.hint}>
          שלושה כפתורי מצב -- 😟 פחות טוב, 🙂 סבבה, 😄 מעולה -- זמינים גם כווידג'ט למסך הבית וגם כהתראה שקטה במסך הנעילה. 😟 פותח ARC מלא, 🙂 פותח ARC
          מקוצר, 😄 מחזיר אותך למשימה הפעילה או למשימה הבאה בלי ARC מיותר. ההתראה שקטה בכוונה (ללא צליל, ללא קפיצה למסך מלא) -- ולא עוקפת את אבטחת המכשיר.
        </Text>

        <Text style={styles.sectionTitle}>מסך הבית</Text>
        {Platform.OS === "android" && widgetPinSupported ? (
          <>
            <Pressable style={styles.secondaryButton} onPress={handleRequestWidgetPin}>
              <Text style={styles.secondaryButtonText}>הוספת הווידג'ט למסך הבית</Text>
            </Pressable>
            {widgetPinResult === "requested" && <Text style={styles.hint}>אם הבקשה אושרה, אפשר לבחור את המיקום הסופי של הווידג'ט במסך הבית.</Text>}
          </>
        ) : (
          <Text style={styles.hint}>
            {Platform.OS === "android"
              ? "המכשיר/הלאנצ'ר הנוכחי לא תומך בהוספה אוטומטית של הווידג'ט -- אפשר להוסיף אותו ידנית: לחיצה ארוכה על מסך הבית -> ווידג'טים -> ARCHI."
              : "הווידג'ט למסך הבית זמין באנדרואיד בלבד."}
          </Text>
        )}

        <Text style={styles.sectionTitle}>מסך הנעילה</Text>
        <View style={styles.switchRow}>
          <Switch value={settings.enabled} onValueChange={handleToggle} />
          <Text style={styles.fieldLabel}>הפעלת ההתראה</Text>
        </View>

        <Text style={styles.hint}>
          לתשומת ליבך: הצגת כפתורי הפעולה במסך הנעילה (לפני פתיחת המכשיר) תלויה בהגדרות המכשיר ובגרסת האנדרואיד/היצרן, ולא בשליטת האפליקציה בלבד.
          במכשירי אנדרואיד 13 ומעלה יש לאשר הרשאת התראות לפחות פעם אחת, אחרת לא תוצג אף התראה. ביצרנים מסוימים (כגון שיאומי/MIUI) יש הגבלות רקע
          נוספות שעלולות לעכב או להסתיר התראות שקטות -- האפשרות למטה פותחת, כשקיימת, את מסך ההרשאות הרלוונטי של היצרן.
        </Text>

        {Platform.OS === "android" && powerManagerInfo?.activity && (
          <Pressable style={styles.secondaryButton} onPress={openAlarmPowerManagerSettings}>
            <Text style={styles.secondaryButtonText}>פתיחת הרשאת רקע של היצרן ({powerManagerInfo.manufacturer})</Text>
          </Pressable>
        )}

        {Platform.OS === "android" && (
          <Pressable style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.secondaryButtonText}>פתיחת הגדרות ההתראות של האפליקציה</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginTop: 20, marginBottom: 4 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 16, lineHeight: 19 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 8 },
  fieldLabel: { fontSize: 16, textAlign: "right", color: "#222" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 16 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
});
