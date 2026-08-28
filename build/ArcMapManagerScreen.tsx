/**
 * build/ArcMapManagerScreen.tsx
 *
 * BUILD-ARC: create/view/edit/remove the ArcMaps (Interfering State ->
 * Challenge Context -> Preventive Action) attached to the trainee's
 * existing Desired State. The Desired State itself comes from
 * BuildGoalProfile -- created once by data/storage.ts's
 * getOrCreateGoalModel() -- and is only ever displayed here, never
 * asked again. This is not a parallel BUILD system: it reads/writes
 * the same BuildGoalProfile/ArcMap storage LIVE reads from, and has no
 * needs-assessment questions of its own.
 */

import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useFocusEffect } from "expo-router";

import type { ArcMap, ArcMapDraft, BuildGoalProfile } from "../arc/buildTypes.ts";
import { createArcMap, generateStableId, getArcMapDisplayLabel, removeArcMap, upsertArcMap } from "../arc/buildTypes.ts";
import { loadArcMaps, loadBuildGoalProfile, saveArcMaps } from "../data/storage.ts";

interface DraftFields {
  interferingState: string;
  challengeContext: string;
  preventiveAction: string;
}

const EMPTY_DRAFT: DraftFields = { interferingState: "", challengeContext: "", preventiveAction: "" };

function toArcMapDraft(fields: DraftFields): ArcMapDraft {
  return {
    interferingState: fields.interferingState.trim() || null,
    challengeContext: fields.challengeContext.trim() || null,
    preventiveAction: fields.preventiveAction.trim() || null,
  };
}

export default function ArcMapManagerScreen() {
  const [loaded, setLoaded] = useState(false);
  const [goalProfile, setGoalProfile] = useState<BuildGoalProfile | null>(null);
  const [arcMaps, setArcMaps] = useState<ArcMap[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // null = not editing; "new" = creating; else an existing ArcMap's id
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([loadBuildGoalProfile(), loadArcMaps()]).then(([loadedGoalProfile, loadedArcMaps]) => {
        if (cancelled) return;
        setGoalProfile(loadedGoalProfile);
        setArcMaps(loadedArcMaps);
        setLoaded(true);
        setEditingId(null);
        setDraft(EMPTY_DRAFT);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const startCreate = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
  };

  const startEdit = (arcMap: ArcMap) => {
    setDraft({
      interferingState: arcMap.interferingState ?? "",
      challengeContext: arcMap.challengeContext ?? "",
      preventiveAction: arcMap.preventiveAction ?? "",
    });
    setEditingId(arcMap.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const canSave = draft.interferingState.trim() !== "" || draft.challengeContext.trim() !== "" || draft.preventiveAction.trim() !== "";

  const saveDraft = () => {
    if (!goalProfile || !canSave || editingId === null) return;
    const fields = toArcMapDraft(draft);

    const nextArcMaps =
      editingId === "new"
        ? [...arcMaps, createArcMap(goalProfile.desiredStateId, fields, () => generateStableId("arcmap"))]
        : upsertArcMap(arcMaps, { id: editingId, desiredStateId: goalProfile.desiredStateId, ...fields });

    setArcMaps(nextArcMaps);
    saveArcMaps(nextArcMaps);
    cancelEdit();
  };

  const confirmDelete = (arcMap: ArcMap) => {
    Alert.alert("מחיקת דפוס אתגר", `למחוק את הדפוס "${getArcMapDisplayLabel(arcMap)}"?`, [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק",
        style: "destructive",
        onPress: () => {
          const next = removeArcMap(arcMaps, arcMap.id);
          setArcMaps(next);
          saveArcMaps(next);
        },
      },
    ]);
  };

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (!goalProfile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>דפוסי אתגר</Text>
          <Text style={styles.body}>כדי להוסיף דפוסי אתגר, יש להגדיר קודם מצב רצוי במסך בניית הפרופיל.</Text>
          <Link href="/build" asChild>
            <Pressable style={[styles.button, styles.fullWidthButton]}>
              <Text style={styles.buttonText}>עבור לבניית הפרופיל</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>דפוסי אתגר</Text>
        <Text style={styles.subtitle}>{`מצב רצוי: ${goalProfile.desiredState}`}</Text>

        {arcMaps.map((arcMap) => (
          <View key={arcMap.id} style={styles.card}>
            <Text style={styles.cardTitle}>{getArcMapDisplayLabel(arcMap)}</Text>
            {arcMap.interferingState && <Text style={styles.cardLine}>{`מצב מפריע: ${arcMap.interferingState}`}</Text>}
            {arcMap.challengeContext && <Text style={styles.cardLine}>{`הקשר מאתגר: ${arcMap.challengeContext}`}</Text>}
            {arcMap.preventiveAction && <Text style={styles.cardLine}>{`פעולה מונעת: ${arcMap.preventiveAction}`}</Text>}
            <View style={styles.cardActions}>
              <Pressable style={styles.secondaryButton} onPress={() => startEdit(arcMap)}>
                <Text style={styles.secondaryButtonText}>עריכה</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => confirmDelete(arcMap)}>
                <Text style={styles.dangerButtonText}>מחיקה</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {arcMaps.length === 0 && <Text style={styles.body}>עדיין לא הוגדרו דפוסי אתגר למצב הרצוי הזה.</Text>}

        {editingId === null && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={startCreate}>
            <Text style={styles.buttonText}>הוסף דפוס אתגר חדש</Text>
          </Pressable>
        )}

        {editingId !== null && (
          <View style={styles.form}>
            <Text style={styles.label}>מצב מפריע</Text>
            <TextInput
              style={styles.textInput}
              value={draft.interferingState}
              onChangeText={(value) => setDraft((d) => ({ ...d, interferingState: value }))}
              textAlign="right"
              placeholder="לדוגמה: ביקורת עצמית"
            />
            <Text style={styles.label}>הקשר מאתגר</Text>
            <TextInput
              style={styles.textInput}
              value={draft.challengeContext}
              onChangeText={(value) => setDraft((d) => ({ ...d, challengeContext: value }))}
              textAlign="right"
              placeholder="לדוגמה: אחרי טעות"
            />
            <Text style={styles.label}>פעולה מונעת</Text>
            <TextInput
              style={styles.textInput}
              value={draft.preventiveAction}
              onChangeText={(value) => setDraft((d) => ({ ...d, preventiveAction: value }))}
              textAlign="right"
              placeholder="לדוגמה: לעצור ולשים לב למה שכבר נוכח"
            />
            <View style={styles.cardActions}>
              <Pressable style={[styles.button, !canSave && styles.buttonDisabled]} disabled={!canSave} onPress={saveDraft}>
                <Text style={styles.buttonText}>שמירה</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={cancelEdit}>
                <Text style={styles.secondaryButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flexGrow: 1,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "right",
    color: "#0a7ea4",
    marginBottom: 20,
  },
  body: {
    fontSize: 16,
    textAlign: "right",
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 6,
  },
  cardLine: {
    fontSize: 14,
    textAlign: "right",
    color: "#333",
    marginBottom: 2,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 10,
  },
  form: {
    marginTop: 8,
  },
  label: {
    fontSize: 14,
    textAlign: "right",
    marginBottom: 4,
    color: "#333",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  fullWidthButton: {
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
  dangerButtonText: {
    color: "#c0392b",
    fontSize: 15,
  },
});
