import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import type { ArcInsightRelationship, ArcVideoRecording, ArcWritingText } from "../arc/arcWriting.ts";
import {
  linkArcGymGoalToVideoRecording,
  linkInsightToVideoRecording,
  linkRelationshipToVideoRecording,
  publishArcVideoRecording,
  unlinkArcGymGoalFromVideoRecording,
  unlinkInsightFromVideoRecording,
  unlinkRelationshipFromVideoRecording,
  unpublishArcVideoRecording,
  updateArcVideoRecording,
} from "../arc/arcWriting.ts";
import { deleteRecordingFile } from "../arc/arcVideoFile.ts";
import {
  deleteArcVideoRecordingEntry,
  loadArcGymGoals,
  loadArcInsightRelationships,
  loadArcInsights,
  loadArcVideoRecordings,
  loadArcWritingTexts,
  upsertArcVideoRecordingEntry,
} from "../data/storage.ts";
import ArcInsightPicker from "../live/components/ArcInsightPicker.tsx";
import ArcRelationshipPicker from "../live/components/ArcRelationshipPicker.tsx";

const AUTO_SAVE_DEBOUNCE_MS = 600;

/**
 * build/ArcVideoDetailScreen.tsx (route /arc-gym/video/[id])
 *
 * ARC Video task, spec section 4: a video's own metadata (title/topic/
 * purpose/description), its private/published visibility (publishing
 * always goes through ONE confirmation dialog before
 * publishArcVideoRecording -- the single function that can flip it),
 * and linking it to the insights/relationships/goals it came from.
 * Playback itself is never duplicated here -- "▶ הצג סרטון" routes to
 * build/ArcVideoPreviewScreen.tsx, the one other screen permitted to
 * import expo-video, keeping the "one screen per native capability"
 * discipline this feature established.
 */
export default function ArcVideoDetailScreen({ id }: { id: string }) {
  const [recording, setRecording] = useState<ArcVideoRecording | null>(null);
  const [script, setScript] = useState<ArcWritingText | null>(null);
  const [insights, setInsights] = useState<ArcInsight[]>([]);
  const [relationships, setRelationships] = useState<ArcInsightRelationship[]>([]);
  const [goals, setGoals] = useState<ArcGymGoal[]>([]);
  const [showLinking, setShowLinking] = useState(false);
  const [showGoalLinking, setShowGoalLinking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcVideoRecordings(), loadArcWritingTexts(), loadArcInsights(), loadArcInsightRelationships(), loadArcGymGoals()]).then(
        ([recordings, texts, loadedInsights, loadedRelationships, loadedGoals]) => {
          const found = recordings.find((candidate) => candidate.id === id) ?? null;
          setRecording(found);
          setScript(found ? texts.find((candidate) => candidate.id === found.scriptId) ?? null : null);
          setInsights(loadedInsights);
          setRelationships(loadedRelationships);
          setGoals(loadedGoals);
        }
      );
    }, [id])
  );

  function persist(next: ArcVideoRecording, debounce: boolean) {
    setRecording(next);
    if (!debounce) {
      upsertArcVideoRecordingEntry(next);
      return;
    }
    setTimeout(() => upsertArcVideoRecordingEntry(next), AUTO_SAVE_DEBOUNCE_MS);
  }

  if (!recording) return <SafeAreaView style={styles.safeArea} />;

  function handleTitleChange(value: string) {
    if (!recording) return;
    persist(updateArcVideoRecording(recording, { title: value }, new Date().toISOString()), true);
  }

  function handleTopicChange(value: string) {
    if (!recording) return;
    persist(updateArcVideoRecording(recording, { topic: value }, new Date().toISOString()), true);
  }

  function handlePurposeChange(value: string) {
    if (!recording) return;
    persist(updateArcVideoRecording(recording, { purpose: value }, new Date().toISOString()), true);
  }

  function handleDescriptionChange(value: string) {
    if (!recording) return;
    persist(updateArcVideoRecording(recording, { description: value }, new Date().toISOString()), true);
  }

  function handleToggleDraft() {
    if (!recording) return;
    persist(updateArcVideoRecording(recording, { isDraft: !recording.isDraft }, new Date().toISOString()), false);
  }

  function handleTogglePublish() {
    if (!recording) return;
    if (recording.visibility === "published") {
      persist(unpublishArcVideoRecording(recording, new Date().toISOString()), false);
      return;
    }
    Alert.alert("פרסום סרטון", "האם לפרסם את הסרטון? סרטון מפורסם יהיה נגיש וניתן לשיתוף.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "פרסם",
        onPress: () => persist(publishArcVideoRecording(recording, new Date().toISOString()), false),
      },
    ]);
  }

  function handleDelete() {
    if (!recording) return;
    Alert.alert("מחיקת סרטון", "האם למחוק את הסרטון? הפעולה אינה הפיכה.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק",
        style: "destructive",
        onPress: async () => {
          deleteRecordingFile(recording.localUri);
          await deleteArcVideoRecordingEntry(recording.id);
          router.back();
        },
      },
    ]);
  }

  function toggleInsight(insightId: string) {
    if (!recording) return;
    const now = new Date().toISOString();
    persist(recording.insightIds.includes(insightId) ? unlinkInsightFromVideoRecording(recording, insightId, now) : linkInsightToVideoRecording(recording, insightId, now), false);
  }

  function toggleRelationship(relationshipId: string) {
    if (!recording) return;
    const now = new Date().toISOString();
    persist(
      recording.relationshipIds.includes(relationshipId)
        ? unlinkRelationshipFromVideoRecording(recording, relationshipId, now)
        : linkRelationshipToVideoRecording(recording, relationshipId, now),
      false
    );
  }

  function toggleGoal(goalId: string) {
    if (!recording) return;
    const now = new Date().toISOString();
    persist(recording.linkedGoalIds.includes(goalId) ? unlinkArcGymGoalFromVideoRecording(recording, goalId, now) : linkArcGymGoalToVideoRecording(recording, goalId, now), false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput style={styles.titleInput} placeholder="כותרת" value={recording.title} onChangeText={handleTitleChange} textAlign="right" />
        <TextInput style={styles.fieldInput} placeholder="נושא" value={recording.topic} onChangeText={handleTopicChange} textAlign="right" />
        <TextInput style={styles.fieldInput} placeholder="מטרה" value={recording.purpose} onChangeText={handlePurposeChange} textAlign="right" />
        <TextInput
          style={styles.fieldInput}
          placeholder="תיאור (אופציונלי)"
          value={recording.description ?? ""}
          onChangeText={handleDescriptionChange}
          multiline
          textAlign="right"
        />

        <Pressable style={styles.primaryButton} onPress={() => router.push({ pathname: "/arc-gym/video/preview/[id]", params: { id: recording.id } })}>
          <Text style={styles.primaryButtonText}>▶ הצג סרטון</Text>
        </Pressable>

        {script && (
          <Pressable onPress={() => router.push({ pathname: "/arc-gym/writing/[id]", params: { id: script.id } })}>
            <Text style={styles.linkToggleText}>⬅ חזרה לתסריט</Text>
          </Pressable>
        )}

        <View style={styles.row}>
          <Text style={styles.sectionTitle}>{recording.isDraft ? "טיוטה" : "סופי"}</Text>
          <Switch value={!recording.isDraft} onValueChange={handleToggleDraft} />
        </View>

        <View style={styles.row}>
          <Text style={styles.sectionTitle}>{recording.visibility === "published" ? "🌐 פורסם" : "🔒 פרטי"}</Text>
          <Pressable style={styles.secondaryButton} onPress={handleTogglePublish}>
            <Text style={styles.secondaryButtonText}>{recording.visibility === "published" ? "הפוך לפרטי" : "פרסם"}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.linkToggle} onPress={() => setShowLinking((prev) => !prev)}>
          <Text style={styles.linkToggleText}>{showLinking ? "סגור תובנות וקשרים" : "תובנות וקשרים"}</Text>
        </Pressable>
        {showLinking && (
          <View>
            <ArcInsightPicker
              insights={insights}
              selectedInsightIds={recording.insightIds}
              onToggle={toggleInsight}
              onInsightCreated={(insight) => {
                setInsights((prev) => [...prev, insight]);
                toggleInsight(insight.id);
              }}
            />
            <ArcRelationshipPicker
              insights={insights}
              insightIds={recording.insightIds}
              allRelationships={relationships}
              selectedRelationshipIds={recording.relationshipIds}
              onToggleRelationship={toggleRelationship}
              onRelationshipCreated={(relationship) => {
                setRelationships((prev) => [...prev, relationship]);
                toggleRelationship(relationship.id);
              }}
            />
          </View>
        )}

        <View style={styles.goalSection}>
          <Text style={styles.sectionTitle}>שיוך למטרות</Text>
          {goals
            .filter((goal) => recording.linkedGoalIds.includes(goal.id))
            .map((goal) => (
              <Text key={goal.id} style={styles.hint}>
                • {goal.title}
              </Text>
            ))}
          <Pressable onPress={() => setShowGoalLinking((prev) => !prev)}>
            <Text style={styles.linkToggleText}>{showGoalLinking ? "סגור" : "שייך למטרה"}</Text>
          </Pressable>
          {showGoalLinking &&
            goals.map((goal) => {
              const linked = recording.linkedGoalIds.includes(goal.id);
              return (
                <Pressable key={goal.id} style={styles.chapterRow} onPress={() => toggleGoal(goal.id)}>
                  <Text style={[styles.hint, linked && styles.hintLinked]}>{goal.title}</Text>
                </Pressable>
              );
            })}
        </View>

        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>🗑 מחק סרטון</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 60 },
  titleInput: { fontSize: 18, fontWeight: "700", textAlign: "right", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 8, marginBottom: 10 },
  fieldInput: { fontSize: 14, textAlign: "right", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 6, marginBottom: 8, color: "#333" },
  primaryButton: { backgroundColor: "#C62828", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginVertical: 10 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "700", textAlign: "right", color: "#333" },
  secondaryButton: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  secondaryButtonText: { color: "#6A1B9A", fontSize: 13, fontWeight: "600" },
  linkToggle: { alignSelf: "flex-end", marginTop: 14, marginBottom: 6 },
  linkToggleText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13 },
  goalSection: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 12, marginTop: 14 },
  hint: { fontSize: 13, color: "#777", textAlign: "right", marginVertical: 4 },
  hintLinked: { color: "#6A1B9A", fontWeight: "700" },
  chapterRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f3f3f3" },
  deleteButton: { marginTop: 24, alignItems: "center" },
  deleteButtonText: { color: "#C62828", fontSize: 14, fontWeight: "600" },
});
