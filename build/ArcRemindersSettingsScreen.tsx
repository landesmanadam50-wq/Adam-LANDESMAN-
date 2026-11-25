import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { loadArcTaskReminderSettings, saveArcTaskReminderSettings } from "../data/storage.ts";
import type { ArcTaskReminderSettings } from "../arc/arcReminders.ts";
import { topUpRemindersIfNeeded } from "../data/arcReminderScheduler.ts";
import { recomputeTaskTransitionNotification } from "../data/taskTransitionNotification.ts";
import { recomputeTaskNotStartedNotification } from "../data/taskNotStartedNotification.ts";
import { recomputeFreeTimeWindowNotification } from "../data/freeTimeWindowNotification.ts";

/**
 * build/ArcRemindersSettingsScreen.tsx (route /arc-reminders/settings)
 *
 * ARC Reminders task, Phase 5, spec section 9: 5 INDEPENDENT toggles --
 * each gates exactly one thing, and turning any one off/on never
 * touches what the others control (requirement 9, tested explicitly in
 * data/arcTaskReminderSettings.test.ts). Saving re-runs the one real
 * effect each toggle actually has:
 *  - mantraRemindersEnabled/activeRecallRemindersEnabled: re-running
 *    topUpRemindersIfNeeded() either starts topping up that family
 *    immediately (turned on) or simply stops scheduling more of it
 *    (turned off -- existing already-scheduled triggers for that
 *    family are left exactly as they are, per
 *    data/arcReminderScheduler.ts's own doc: never force-cancelled just
 *    because the toggle is off right now).
 *  - transitionNotificationEnabled: recomputeTaskTransitionNotification()
 *    either displays/updates the one transition notification right now
 *    or cancels it immediately, rather than waiting for the next task
 *    event to notice the setting changed.
 *  - completionSoundEnabled/hideContentOnLockScreen: both are read
 *    fresh at their own use sites (live/ActiveTaskScreen.tsx's
 *    completion-sound effect; scheduleNativeReminderNotification's own
 *    visibility read) -- nothing here needs to re-arm anything for
 *    either of them to take effect on the very next event.
 */
export default function ArcRemindersSettingsScreen() {
  const [settings, setSettings] = useState<ArcTaskReminderSettings | null>(null);

  const reload = useCallback(() => {
    loadArcTaskReminderSettings().then(setSettings);
  }, []);

  useFocusEffect(reload);

  async function update(patch: Partial<ArcTaskReminderSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch, updatedAt: new Date().toISOString() };
    setSettings(next);
    await saveArcTaskReminderSettings(next);
    await topUpRemindersIfNeeded();
    await recomputeTaskTransitionNotification();
    await recomputeTaskNotStartedNotification();
    await recomputeFreeTimeWindowNotification();
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
        <Text style={styles.title}>הגדרות ARC Reminders</Text>
        <Text style={styles.hint}>כל מתג כאן שולט רק בדבר אחד -- כיבוי אחד לא משפיע על האחרים.</Text>

        <View style={styles.switchRow}>
          <Switch value={settings.mantraRemindersEnabled} onValueChange={(value) => update({ mantraRemindersEnabled: value })} />
          <View style={styles.labelColumn}>
            <Text style={styles.fieldLabel}>תזכורות מנטרה ARC</Text>
            <Text style={styles.fieldHint}>תזכורות פסיביות: תחושת הסיום הרצויה, פעולה מהזיכרון, תובנת זהות נוכחית, זהות עתידית, מטרת ARC Goal הבאה.</Text>
          </View>
        </View>

        <View style={styles.switchRow}>
          <Switch value={settings.activeRecallRemindersEnabled} onValueChange={(value) => update({ activeRecallRemindersEnabled: value })} />
          <View style={styles.labelColumn}>
            <Text style={styles.fieldLabel}>ARC Active Recall</Text>
            <Text style={styles.fieldHint}>שאלות תזכורת מתובנות, קשרים, חומר למידה וזיכרונות ARC -- עם אפשרות מענה ישירות מההתראה.</Text>
          </View>
        </View>

        <View style={styles.switchRow}>
          <Switch value={settings.transitionNotificationEnabled} onValueChange={(value) => update({ transitionNotificationEnabled: value })} />
          <View style={styles.labelColumn}>
            <Text style={styles.fieldLabel}>התראת מעבר בין משימות</Text>
            <Text style={styles.fieldHint}>התראה אחת, מתעדכנת במקום, שמציגה את המשימה הנוכחית והבאה כל אימת שמשימה מסתיימת.</Text>
          </View>
        </View>

        <View style={styles.switchRow}>
          <Switch value={settings.completionSoundEnabled} onValueChange={(value) => update({ completionSoundEnabled: value })} />
          <View style={styles.labelColumn}>
            <Text style={styles.fieldLabel}>צליל השלמת משימה</Text>
            <Text style={styles.fieldHint}>צליל קצר כאשר משימה מושלמת אוטומטית בסיום הטיימר.</Text>
          </View>
        </View>

        <View style={styles.switchRow}>
          <Switch value={settings.hideContentOnLockScreen} onValueChange={(value) => update({ hideContentOnLockScreen: value })} />
          <View style={styles.labelColumn}>
            <Text style={styles.fieldLabel}>הסתרת תוכן במסך הנעילה</Text>
            <Text style={styles.fieldHint}>כאשר מופעל, תוכן התזכורות (מנטרות, שאלות, מעברים) לא יוצג על מסך הנעילה -- רק שההתראה הגיעה.</Text>
          </View>
        </View>

        <View style={styles.switchRow}>
          <Switch value={settings.taskNotStartedNotificationEnabled} onValueChange={(value) => update({ taskNotStartedNotificationEnabled: value })} />
          <View style={styles.labelColumn}>
            <Text style={styles.fieldLabel}>התראה על משימה שלא התחילה</Text>
            <Text style={styles.fieldHint}>התראה מתמשכת כאשר הגיע זמן ההתחלה של משימה בלוח היומי הגמיש ושום דבר לא התחיל בפועל.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 16, lineHeight: 19 },
  switchRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, marginTop: 8, marginBottom: 14 },
  labelColumn: { flex: 1 },
  fieldLabel: { fontSize: 16, textAlign: "right", color: "#222", fontWeight: "600" },
  fieldHint: { fontSize: 12, textAlign: "right", color: "#777", marginTop: 2, lineHeight: 17 },
});
