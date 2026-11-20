import { useCallback, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { loadMorningAlarmConfig, saveMorningAlarmConfig } from "../data/storage.ts";
import type { MorningAlarmConfig } from "../data/storage.ts";
import { syncMorningAlarm } from "../data/morningAlarm.ts";
import { getAlarmPowerManagerInfo, openAlarmPowerManagerSettings } from "../data/taskAlarm.ts";
import type { AlarmPowerManagerInfo } from "../data/taskAlarm.ts";

const RECURRENCE_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTime(draft: string): { hour: number; minute: number } | null {
  const match = draft.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * build/MorningAlarmSettingsScreen.tsx (route /tasks/morning-alarm-settings)
 *
 * Nine Functional Improvements task, Improvement 9 ("Configurable
 * Morning Daily Visualization Alarm"): "editable later from Home/
 * Settings" -- the one place the trainee changes the real Android
 * alarm's own time/weekday repeat/enable toggle AFTER the one-time
 * offer (live/DailyStartupSequenceOverlay.tsx's own "alarmOffer" step)
 * has already come and gone. Every edit here calls syncMorningAlarm
 * (data/morningAlarm.ts) immediately, so the native alarm is always
 * in sync with whatever is currently saved -- never a stale alarm
 * left armed for a time/day the trainee already changed.
 */
export default function MorningAlarmSettingsScreen() {
  const [config, setConfig] = useState<MorningAlarmConfig | null>(null);
  const [timeDraft, setTimeDraft] = useState("");
  const [powerManagerInfo, setPowerManagerInfo] = useState<AlarmPowerManagerInfo | null>(null);

  const reload = useCallback(() => {
    loadMorningAlarmConfig().then((loaded) => {
      setConfig(loaded);
      setTimeDraft(formatTime(loaded.hour, loaded.minute));
    });
    getAlarmPowerManagerInfo().then(setPowerManagerInfo);
  }, []);

  useFocusEffect(reload);

  async function update(patch: Partial<MorningAlarmConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    await saveMorningAlarmConfig(next);
    const synced = await syncMorningAlarm();
    setConfig(synced);
  }

  function commitTimeDraft() {
    const parsed = parseTime(timeDraft);
    if (!parsed) {
      if (config) setTimeDraft(formatTime(config.hour, config.minute));
      return;
    }
    update(parsed);
  }

  function toggleDay(dayOfWeek: number) {
    if (!config) return;
    const days = config.recurrenceDays.includes(dayOfWeek)
      ? config.recurrenceDays.filter((day) => day !== dayOfWeek)
      : [...config.recurrenceDays, dayOfWeek].sort();
    update({ recurrenceDays: days });
  }

  if (!config) {
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
        <Text style={styles.title}>שעון מעורר להכנה יומית</Text>
        <Text style={styles.hint}>שעון מעורר אמיתי של המכשיר, עם צליל/רטט, נודניק וסגירה -- לא תזכורת פנימית בלבד. הוא פותח את ההכנה היומית הקיימת, ולא יוצר רצף הכנה חדש.</Text>

        <View style={styles.switchRow}>
          <Switch value={config.enabled} onValueChange={(value) => update({ enabled: value })} />
          <Text style={styles.fieldLabel}>הפעלת השעון המעורר</Text>
        </View>

        <Text style={styles.fieldLabel}>שעה (HH:MM):</Text>
        <TextInput style={styles.textInput} value={timeDraft} onChangeText={setTimeDraft} onBlur={commitTimeDraft} placeholder="07:00" keyboardType="numbers-and-punctuation" />

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>ימים חזרה:</Text>
        <View style={styles.dayRow}>
          {RECURRENCE_DAY_LABELS.map((label, dayOfWeek) => (
            <Pressable key={label} style={[styles.chip, config.recurrenceDays.includes(dayOfWeek) && styles.chipSelected]} onPress={() => toggleDay(dayOfWeek)}>
              <Text style={[styles.chipText, config.recurrenceDays.includes(dayOfWeek) && styles.chipTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {config.enabled && config.scheduledFor && <Text style={styles.hint}>הצלצול הקרוב: {new Date(config.scheduledFor).toLocaleString("he-IL")}</Text>}
        {config.enabled && !config.scheduledFor && <Text style={styles.hint}>לא ניתן לתזמן את השעון המעורר כרגע במכשיר הזה -- ראה ההגדרות למטה.</Text>}

        <Text style={styles.hint}>
          לתשומת ליבך: האמינות של שעון מעורר תלויה במכשיר -- אתחול המכשיר, שינוי שעה/אזור זמן, אנדרואיד 13 (הרשאת התראות) ויצרנים כגון
          שיאומי/MIUI (הגבלות רקע) יכולים להשפיע. סגירה או נודניק של השעון המעורר אינם מסמנים את ההכנה היומית כהושלמה -- ניתן לפתוח אותה בכל עת
          מהמסך הראשי.
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
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 16, lineHeight: 19 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 12 },
  fieldLabel: { fontSize: 16, textAlign: "right", color: "#222", marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 16, textAlign: "center", width: 100 },
  dayRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  chipTextSelected: { color: "#fff" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 16 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
});
