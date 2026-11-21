import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  addBodyOptionToTrigger,
  areArcBodyProtocolSnapshotsEqual,
  createArcSavedBodyOption,
  generateArcSavedBodyOptionId,
  updateArcSavedBodyOption,
  updateArcSavedExercise,
} from "../arc/arcSaving.ts";
import type { ArcSavingPendingReview } from "../arc/arcSaving.ts";
import {
  clearArcSavingPendingReview,
  loadArcSavedBodyOptions,
  loadArcSavedExercises,
  loadArcSavingPendingReview,
  loadArcTriggers,
  upsertArcSavedBodyOptionEntry,
  upsertArcSavedExerciseEntry,
  upsertArcTriggerEntry,
} from "../data/storage.ts";

/**
 * build/ArcSavingReviewScreen.tsx (route /arc-saving/review)
 *
 * ARC Saving task, spec section 5 ("למידה מצטברת"): the ONE place the
 * "השתמשת באזורי גוף או בתחושות שונים מהאפשרויות השמורות. האם להוסיף
 * אותם לטריגר?" confirmation is ever shown -- live/NewArcLiveScreen.tsx's
 * own returnToTask() only ever writes the pending-review record and
 * navigates here; the real divergence check (areArcBodyProtocolSnapshotsEqual)
 * and the three-way choice both live in this screen, never inside any
 * pure engine function (same split as every other "are you sure" in
 * this codebase). A single static route -- there is only ever at most
 * one pending review at a time.
 */
export default function ArcSavingReviewScreen() {
  const [review, setReview] = useState<ArcSavingPendingReview | null>(null);
  const [existingLabel, setExistingLabel] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  async function finishAndReturn(activeTaskId: string | null) {
    await clearArcSavingPendingReview();
    setShowPrompt(false);
    router.replace(activeTaskId ? { pathname: "/tasks/[id]", params: { id: activeTaskId } } : "/");
  }

  useFocusEffect(
    useCallback(() => {
      loadArcSavingPendingReview().then(async (pending) => {
        if (!pending) return;
        let diverged = true;
        if (pending.bodyOptionId) {
          const options = await loadArcSavedBodyOptions();
          const option = options.find((candidate) => candidate.id === pending.bodyOptionId);
          setExistingLabel(option?.label ?? null);
          diverged = !option || !areArcBodyProtocolSnapshotsEqual(option.snapshot, pending.finalSnapshot);
        } else if (pending.exerciseId) {
          const exercises = await loadArcSavedExercises();
          const exercise = exercises.find((candidate) => candidate.id === pending.exerciseId);
          setExistingLabel(exercise?.label ?? null);
          diverged = !exercise || !areArcBodyProtocolSnapshotsEqual(exercise.snapshot, pending.finalSnapshot);
        }
        // No real divergence -- never bothers the trainee with a needless prompt.
        if (!diverged) {
          finishAndReturn(pending.activeTaskId);
          return;
        }
        setReview(pending);
        setShowPrompt(true);
      });
    }, [])
  );

  if (!showPrompt || !review) return <SafeAreaView style={styles.safeArea} />;
  const activeReview = review;

  async function addAsNewOption() {
    const now = new Date().toISOString();
    const newOption = createArcSavedBodyOption(
      generateArcSavedBodyOptionId(),
      existingLabel ? `${existingLabel} (עדכון)` : "אפשרות גוף חדשה",
      activeReview.finalSnapshot,
      null,
      now
    );
    await upsertArcSavedBodyOptionEntry(newOption);
    if (activeReview.bodyOptionId) {
      const triggers = await loadArcTriggers();
      const owningTriggers = triggers.filter((trigger) => trigger.bodyOptionIds.includes(activeReview.bodyOptionId as string));
      await Promise.all(owningTriggers.map((trigger) => upsertArcTriggerEntry(addBodyOptionToTrigger(trigger, newOption.id, now))));
    } else if (activeReview.triggerIdForNewOption) {
      const triggers = await loadArcTriggers();
      const trigger = triggers.find((candidate) => candidate.id === activeReview.triggerIdForNewOption);
      if (trigger) await upsertArcTriggerEntry(addBodyOptionToTrigger(trigger, newOption.id, now));
    }
    finishAndReturn(activeReview.activeTaskId);
  }

  async function updateExisting() {
    const now = new Date().toISOString();
    if (activeReview.bodyOptionId) {
      const options = await loadArcSavedBodyOptions();
      const option = options.find((candidate) => candidate.id === activeReview.bodyOptionId);
      if (option) await upsertArcSavedBodyOptionEntry(updateArcSavedBodyOption(option, { snapshot: activeReview.finalSnapshot }, now));
    } else if (activeReview.exerciseId) {
      const exercises = await loadArcSavedExercises();
      const exercise = exercises.find((candidate) => candidate.id === activeReview.exerciseId);
      if (exercise) await upsertArcSavedExerciseEntry(updateArcSavedExercise(exercise, { snapshot: activeReview.finalSnapshot }, now));
    }
    finishAndReturn(activeReview.activeTaskId);
  }

  const isFreshTriggerPath = !!activeReview.triggerIdForNewOption;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>ARC Saving</Text>
        <Text style={styles.message}>
          {isFreshTriggerPath
            ? "האם לשמור את אזורי הגוף והתחושות שבחרת כאפשרות חדשה לטריגר הזה?"
            : "השתמשת באזורי גוף או בתחושות שונים מהאפשרויות השמורות. האם להוסיף אותם?"}
        </Text>

        {isFreshTriggerPath ? (
          <Pressable style={styles.primaryButton} onPress={addAsNewOption}>
            <Text style={styles.primaryButtonText}>שמור כאפשרות גוף חדשה</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.primaryButton} onPress={addAsNewOption}>
              <Text style={styles.primaryButtonText}>הוסף אפשרות חדשה</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={updateExisting}>
              <Text style={styles.secondaryButtonText}>עדכן אפשרות קיימת</Text>
            </Pressable>
          </>
        )}
        <Pressable style={styles.tertiaryButton} onPress={() => finishAndReturn(review.activeTaskId)}>
          <Text style={styles.tertiaryButtonText}>אל תשמור</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 20, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 14 },
  message: { fontSize: 15, textAlign: "right", color: "#333", lineHeight: 22, marginBottom: 24 },
  primaryButton: { backgroundColor: "#2E7D32", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 15 },
  tertiaryButton: { paddingVertical: 12, alignItems: "center" },
  tertiaryButtonText: { color: "#999", fontWeight: "600", fontSize: 14 },
});
