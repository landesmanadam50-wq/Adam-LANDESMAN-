import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createPositiveMemoryDraft, generatePositiveMemoryDraftId, resolvePositiveMemoryDraftsForTask, sortPositiveMemoryDraftsNewestFirst } from "../arc/positiveMemoryDraft.ts";
import type { PositiveMemoryDraft } from "../arc/positiveMemoryDraft.ts";
import type { PositiveMemoryEventType } from "../arc/positiveMemory.ts";
import { loadPositiveMemoryDrafts, upsertPositiveMemoryDraftEntry } from "../data/storage.ts";

/**
 * build/PositiveMemoryEntryScreen.tsx (route /positive-memories/new)
 *
 * Positive Memory, Success Recall & Quick Capture task, sections 3+4+7:
 * the ONE entry point "הוסף אירוע חיובי" always lands on, from both
 * quick-capture sources (the floating cube and the Android widget) and
 * any in-app button -- never two different starting screens. First
 * checks for an unfinished draft matching this exact context (section
 * 7: "offer 'המשך תיעוד קודם'... also allow 'התחל תיעוד חדש'... do not
 * overwrite an existing unfinished draft when starting a new one");
 * only once the trainee explicitly chooses "התחל תיעוד חדש" does
 * section 4's own first question ("איזה סוג אירוע תרצה לתעד?") appear.
 *
 * `returnToTaskId`, when given (the quick-capture path reached from an
 * active task), is stored on the brand-new draft's own `taskId` --
 * both the eventual "שמור הצלחה" and an early exit navigate back to
 * that exact task (section 14: "support navigating back to the
 * original screen after documenting an event"), never losing that
 * context partway through.
 */
export default function PositiveMemoryEntryScreen({ returnToTaskId = null }: { returnToTaskId?: string | null }) {
  const [resumableDrafts, setResumableDrafts] = useState<PositiveMemoryDraft[]>([]);
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPositiveMemoryDrafts().then((drafts) => {
        const relevant = returnToTaskId ? resolvePositiveMemoryDraftsForTask(drafts, returnToTaskId) : drafts.filter((draft) => draft.taskId === null);
        setResumableDrafts(sortPositiveMemoryDraftsNewestFirst(relevant));
        setLoaded(true);
      });
      setShowTypeSelect(false);
    }, [returnToTaskId])
  );

  function openDraft(draftId: string) {
    router.replace({ pathname: "/positive-memories/draft/[draftId]", params: { draftId } });
  }

  async function startNewDraft(eventType: PositiveMemoryEventType) {
    const now = new Date().toISOString();
    const firstStep = eventType === "success" ? "task_link" : "feeling_select";
    const draft = createPositiveMemoryDraft(generatePositiveMemoryDraftId(), eventType, firstStep, now, returnToTaskId);
    await upsertPositiveMemoryDraftEntry(draft);
    openDraft(draft.id);
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.hint}>טוען...</Text>
      </SafeAreaView>
    );
  }

  if (!showTypeSelect && resumableDrafts.length > 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>יש לך תיעוד לא גמור</Text>
          {resumableDrafts.map((draft) => (
            <Pressable key={draft.id} style={styles.card} onPress={() => openDraft(draft.id)}>
              <Text style={styles.cardText}>{draft.eventType === "success" ? "המשך תיעוד הצלחה" : "המשך תיעוד תחושה חיובית"}</Text>
              <Text style={styles.cardSubText}>{draft.fields.title || "טיוטה ללא כותרת"}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.secondaryButton} onPress={() => setShowTypeSelect(true)}>
            <Text style={styles.secondaryButtonText}>התחל תיעוד חדש</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>איזה סוג אירוע תרצה לתעד?</Text>
        <Pressable style={styles.primaryButton} onPress={() => startNewDraft("success")}>
          <Text style={styles.primaryButtonText}>הצלחה -- הצלחתי לבצע פעולה</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={() => startNewDraft("positive_feeling")}>
          <Text style={styles.primaryButtonText}>אירוע של תחושה חיובית</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>ביטול</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, gap: 12 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  card: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, gap: 2 },
  cardText: { fontSize: 15, fontWeight: "600", textAlign: "right" },
  cardSubText: { fontSize: 13, color: "#666", textAlign: "right" },
  primaryButton: { backgroundColor: "#D98324", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryButton: { paddingVertical: 12, alignItems: "center", marginTop: 6 },
  secondaryButtonText: { color: "#666", fontSize: 15 },
});
