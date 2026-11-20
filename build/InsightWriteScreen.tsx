import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { createStandaloneInsight, generateArcInsightId } from "../arc/arcInsightBelief.ts";
import { appendArcInsight } from "../data/storage.ts";

/**
 * build/InsightWriteScreen.tsx (route /insights/new)
 *
 * ARCHI -- Unified Development Specification task, Part 3 ("ADD
 * INSIGHTS FROM THE HOME SCREEN") / Part 4A ("INSIGHT SETTINGS"): the
 * ONE insight-writing screen -- "do not create duplicate insight-entry
 * screens." Opened identically from build/FlexibleDailyScreen.tsx's
 * own "הוסף תובנה" button (when the Settings toggle shows it) and
 * from build/SettingsScreen.tsx's own "הוסף תובנה" button, with no
 * parameter distinguishing the two -- there is nothing to distinguish,
 * since both must behave exactly the same way.
 *
 * "Allow free-text writing... save persistently... do not require
 * task creation... optionally offer to create an implementation task
 * after saving": saving here is the ONE required step (a bare,
 * unlinked ArcInsight, via createStandaloneInsight); the optional
 * "add a task for this" step is the detail screen's own
 * "הוסף משימה ליישום התובנה" button (Part 6), reached by navigating
 * straight there right after saving -- never a second, separate
 * task-creation UI duplicated into this screen too.
 *
 * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
 * section 7: a THIRD entry point -- the unified floating panel's own
 * "💡 הוסף תובנה" button, reached while a task session is active/
 * paused -- is the first caller that actually needs "return to the
 * appropriate previous context afterward": `returnToTaskId`, when
 * given, sends the trainee back to that exact Task LIVE screen instead
 * of the insight's own detail screen. Home/Settings' own two pre-existing
 * callers never pass it, so their behavior (land on the insight's own
 * detail screen) is completely unchanged.
 */
export default function InsightWriteScreen({ returnToTaskId = null }: { returnToTaskId?: string | null }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const insight = createStandaloneInsight(generateArcInsightId(), trimmed, now);
    await appendArcInsight(insight);
    if (returnToTaskId) {
      router.replace({ pathname: "/tasks/[id]", params: { id: returnToTaskId } });
      return;
    }
    router.replace({ pathname: "/insights/[id]", params: { id: insight.id } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>הוסף תובנה</Text>
        <Text style={styles.hint}>מה למדת? מה שמת לב אליו? כתוב בחופשיות -- התובנה תישמר כמו שהיא.</Text>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          textAlign="right"
          multiline
          autoFocus
          placeholder="התובנה שלי..."
        />
        <Pressable style={[styles.primaryButton, (!text.trim() || saving) && styles.disabledButton]} disabled={!text.trim() || saving} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>שמירה</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>ביטול</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 14, color: "#666", textAlign: "right", marginBottom: 14 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 160, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  disabledButton: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { paddingVertical: 12, alignItems: "center", marginTop: 6 },
  secondaryButtonText: { color: "#666", fontSize: 15 },
});
