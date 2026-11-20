import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { loadFloatingTimerOverlayPreferences, saveFloatingTimerOverlayPreferences } from "../data/storage.ts";
import type { FloatingTimerOverlayPreferences } from "../data/storage.ts";
import { hasFloatingOverlayPermissionAsync, requestFloatingOverlayPermissionAsync } from "../data/floatingTimerOverlay.ts";

/**
 * build/FloatingTimerSettingsScreen.tsx (route /tasks/floating-timer-settings)
 *
 * Floating task timer task, requirement 1's own closing line + requirement
 * 2: lets the trainee turn the system-wide floating timer overlay on/off,
 * and explains + requests the one Android permission it needs
 * (SYSTEM_ALERT_WINDOW -- "draw over other apps"). That permission has no
 * in-app runtime grant dialog of its own; the ONLY way to grant it is the
 * OS settings screen requestFloatingOverlayPermissionAsync opens, so
 * "request" and "open settings" are the same single action here, and the
 * granted/denied status is re-checked every time this screen regains
 * focus (the trainee's only path back from that settings screen).
 *
 * Never gates the regular in-app timer on this permission or on the
 * overlay preference (requirement 2: "אין לחסום את פעולת הטיימר הרגיל") --
 * this screen only ever affects the OPTIONAL floating overlay and its
 * own permission; live/ActiveTaskScreen.tsx's own timer keeps working
 * exactly the same regardless of anything shown here. The ongoing
 * notification (requirement 3) is never a toggle here either -- it isn't
 * optional, and always runs alongside whatever this screen decides.
 */
export default function FloatingTimerSettingsScreen() {
  const [preferences, setPreferences] = useState<FloatingTimerOverlayPreferences | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const reload = useCallback(() => {
    loadFloatingTimerOverlayPreferences().then(setPreferences);
    hasFloatingOverlayPermissionAsync().then(setHasPermission);
  }, []);

  useFocusEffect(reload);

  async function update(patch: Partial<FloatingTimerOverlayPreferences>) {
    if (!preferences) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    await saveFloatingTimerOverlayPreferences(next);
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
        <Text style={styles.title}>טיימר צף</Text>
        <Text style={styles.hint}>
          כאשר הטיימר הצף פעיל, הזמן שנותר למשימה מוצג בחלונית קטנה מעל אפליקציות אחרות -- גם ב-WhatsApp, בדפדפן או ב-YouTube. אפשר לגרור אותה למיקום נוח, ולחיצה עליה פותחת את המשימה הפעילה.
        </Text>

        <View style={styles.switchRow}>
          <Switch value={preferences.enabled} onValueChange={(value) => update({ enabled: value })} />
          <Text style={styles.fieldLabel}>הצגת טיימר צף</Text>
        </View>

        {Platform.OS === "android" && (
          <>
            <Text style={styles.hint}>
              כדי שהחלונית תוכל להופיע מעל אפליקציות אחרות, יש לאשר למכשיר הרשאה מיוחדת של Android ("הצגה מעל אפליקציות אחרות"). ללא ההרשאה הזו, הטיימר הרגיל של המשימה וההתראה המתמשכת ממשיכים לעבוד כרגיל -- רק החלונית הצפה לא תוצג.
            </Text>
            <Text style={styles.permissionStatus}>
              {hasPermission === null ? "בודק הרשאה..." : hasPermission ? "ההרשאה מאושרת." : "ההרשאה עדיין לא אושרה."}
            </Text>
            <Pressable style={styles.secondaryButton} onPress={() => requestFloatingOverlayPermissionAsync()}>
              <Text style={styles.secondaryButtonText}>פתיחת הגדרות ההרשאה</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.hint}>
          לתשומת ליבך: התראה מתמשכת המציגה את שם המשימה והזמן שנותר תמיד תופיע כאשר טיימר פעיל, בנוסף לחלונית הצפה (ולא במקומה) -- גם אם הטיימר הצף כבוי.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 16, lineHeight: 19 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 16 },
  fieldLabel: { fontSize: 16, textAlign: "right", color: "#222" },
  permissionStatus: { fontSize: 13, textAlign: "right", color: "#222", marginBottom: 10, fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 16 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
});
