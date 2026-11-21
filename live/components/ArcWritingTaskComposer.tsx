import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { buildTaskFromDraft, createEmptyTaskDraft, emptyTaskBase } from "../../arc/taskDraft.ts";
import { generateTaskId } from "../../arc/tasks.ts";
import { upsertTask } from "../../data/storage.ts";
import { reconcileTaskAlarms } from "../../data/taskAlarm.ts";

/**
 * live/components/ArcWritingTaskComposer.tsx
 *
 * ARC Writing & ARC Book task, spec section 6 ("משימת כתיבה"): lets the
 * trainee schedule a writing task ("כתוב 200 מילים בפרק 2" / "כתוב במשך
 * 30 דקות") straight onto ARCHI's EXISTING task board -- the exact same
 * createEmptyTaskDraft/buildTaskFromDraft/upsertTask/reconcileTaskAlarms
 * pipeline build/ArcFocusSettingsScreen.tsx's own handleSchedule()
 * already uses, never a parallel task-creation mechanism. The one new
 * piece is the back-reference: arcWritingTextId/arcWritingChapterId
 * (arc/tasks.ts) aren't TaskDraft fields (buildTaskFromDraft never
 * touches them), so they're set directly on the built Task afterward,
 * exactly once, before the single upsertTask call.
 */
export default function ArcWritingTaskComposer({
  targetKind,
  targetId,
  defaultTitle,
}: {
  targetKind: "text" | "chapter";
  targetId: string;
  defaultTitle: string;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const newTaskId = generateTaskId();
      const draft = {
        ...createEmptyTaskDraft(),
        title: trimmed,
        firstAction: "להתחיל לכתוב",
        taskKind: "arcWriting" as const,
      };
      const built = buildTaskFromDraft(draft, emptyTaskBase(newTaskId, now), now);
      const task = { ...built, arcWritingTextId: targetKind === "text" ? targetId : null, arcWritingChapterId: targetKind === "chapter" ? targetId : null };
      await upsertTask(task);
      await reconcileTaskAlarms();
      setExpanded(false);
      setTitle(defaultTitle);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => setExpanded((prev) => !prev)}>
        <Text style={styles.linkText}>{expanded ? "סגור" : "+ משימת כתיבה"}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.form}>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} textAlign="right" placeholder="לדוגמה: כתוב 200 מילים" />
          <Pressable style={styles.saveButton} onPress={handleCreate} disabled={busy}>
            <Text style={styles.saveButtonText}>הוסף למשימות היום</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/tasks")}>
            <Text style={styles.hint}>עריכת תזמון מלאה אפשרית מרשימת המשימות.</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10 },
  linkText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13, textAlign: "right" },
  form: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 10, marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 8, textAlign: "right" },
  saveButton: { backgroundColor: "#2E7D32", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginBottom: 6 },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  hint: { fontSize: 11, color: "#999", textAlign: "right" },
});
