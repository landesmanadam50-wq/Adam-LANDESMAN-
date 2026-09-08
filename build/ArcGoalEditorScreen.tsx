import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcGoal, loadArcBuilds, upsertArcGoal } from "../data/storage.ts";
import { inferTarget } from "./arcBuildSave.ts";
import { generateArcGoalMappingId } from "../arc/types.ts";
import type { ArcBuild, ArcGoal, ArcGoalInterferingMapping } from "../arc/types.ts";

/**
 * ARC Goal task: ONE screen editing ONE ArcGoal -- the goal's own
 * fields (name/description/value/goalAction/desiredResult), its
 * REFERENCE to an existing identity ArcBuild (spec section 2), and the
 * ARC Goal linking page itself (spec section 3): a repeatable list of
 * interfering-state -> supportive-protocol -> supportive-action
 * mappings, all converging on the SAME identity protocol. Every
 * reference here is stored as a plain id string -- never a copy of the
 * referenced ArcBuild's own content (see arc/types.ts's ArcGoal doc).
 * Mirrors build/ArcBuildEditorScreen.tsx's step-wizard shape, scoped to
 * ArcGoal's own much smaller field set -- no shared step machinery is
 * reused since there is no branching-by-target here.
 */

type Step = "name" | "description" | "value" | "goalAction" | "desiredResult" | "identityProtocol" | "interferingMappings" | "review";

const STEP_ORDER: Step[] = [
  "name",
  "description",
  "value",
  "goalAction",
  "desiredResult",
  "identityProtocol",
  "interferingMappings",
  "review",
];

const STEP_TITLES: Record<Step, string> = {
  name: "שם המטרה",
  description: "תיאור המטרה (רשות)",
  value: "מהו הערך שעומד מאחורי המטרה הזאת? (רשות)",
  goalAction: "מהי הפעולה הקשורה למטרה?",
  desiredResult: "מהי התוצאה הרצויה?",
  identityProtocol: "פרוטוקול הזהות המחובר למטרה",
  interferingMappings: "מצבים פנימיים שעלולים להפריע",
  review: "סיכום",
};

export default function ArcGoalEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "editing">("loading");
  const [goal, setGoal] = useState<ArcGoal | null>(null);
  const [step, setStep] = useState<Step>("name");
  const [arcBuilds, setArcBuilds] = useState<ArcBuild[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reloadArcBuilds = useCallback(() => {
    loadArcBuilds().then(setArcBuilds);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    Promise.all([getArcGoal(id), loadArcBuilds()]).then(([existing, builds]) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setGoal(existing);
      setArcBuilds(builds);
      setStatus("editing");
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const identityBuilds = arcBuilds.filter((build) => inferTarget(build.profile) === "identity");
  const stateBuilds = arcBuilds.filter((build) => inferTarget(build.profile) === "state");

  function patchGoal(patch: Partial<ArcGoal>) {
    setGoal((current) => (current ? { ...current, ...patch } : current));
  }

  function goNext() {
    const currentIndex = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.min(currentIndex + 1, STEP_ORDER.length - 1)]);
  }

  function goBack() {
    const currentIndex = STEP_ORDER.indexOf(step);
    if (currentIndex === 0) return;
    setStep(STEP_ORDER[currentIndex - 1]);
  }

  function addMapping() {
    if (!goal) return;
    const mapping: ArcGoalInterferingMapping = {
      id: generateArcGoalMappingId(),
      interferingState: "",
      supportiveProtocolId: "",
      supportiveAction: "",
    };
    patchGoal({ interferingMappings: [...goal.interferingMappings, mapping] });
  }

  function updateMapping(mappingId: string, patch: Partial<ArcGoalInterferingMapping>) {
    if (!goal) return;
    patchGoal({
      interferingMappings: goal.interferingMappings.map((m) => (m.id === mappingId ? { ...m, ...patch } : m)),
    });
  }

  function removeMapping(mappingId: string) {
    if (!goal) return;
    patchGoal({ interferingMappings: goal.interferingMappings.filter((m) => m.id !== mappingId) });
  }

  function isComplete(g: ArcGoal): boolean {
    return g.name.trim().length > 0 && g.goalAction.trim().length > 0 && g.desiredResult.trim().length > 0;
  }

  async function handleSave() {
    if (!goal) return;
    if (!isComplete(goal)) {
      setSaveError("יש להשלים שם, פעולה קשורה למטרה ותוצאה רצויה לפני השמירה.");
      return;
    }
    setSaveError(null);
    try {
      await upsertArcGoal({ ...goal, updatedAt: new Date().toISOString() });
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת המטרה. נסה שוב.");
    }
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound" || !goal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>המטרה לא נמצאה</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/goals")}>
            <Text style={styles.buttonText}>חזרה לרשימת המטרות</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{goal.name}</Text>
        <Text style={styles.title}>{STEP_TITLES[step]}</Text>

        {step === "name" && (
          <View>
            <TextInput style={styles.textInput} value={goal.name} onChangeText={(text) => patchGoal({ name: text })} textAlign="right" autoFocus />
            <Pressable
              style={[styles.button, styles.fullWidthButton, goal.name.trim().length === 0 && styles.buttonDisabled]}
              disabled={goal.name.trim().length === 0}
              onPress={goNext}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "description" && (
          <View>
            <TextInput
              style={styles.textInput}
              value={goal.description ?? ""}
              onChangeText={(text) => patchGoal({ description: text })}
              textAlign="right"
              multiline
            />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={goNext}>
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "value" && (
          <View>
            <TextInput style={styles.textInput} value={goal.value ?? ""} onChangeText={(text) => patchGoal({ value: text })} textAlign="right" />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={goNext}>
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "goalAction" && (
          <View>
            <TextInput
              style={styles.textInput}
              value={goal.goalAction}
              onChangeText={(text) => patchGoal({ goalAction: text })}
              textAlign="right"
              autoFocus
            />
            <Pressable
              style={[styles.button, styles.fullWidthButton, goal.goalAction.trim().length === 0 && styles.buttonDisabled]}
              disabled={goal.goalAction.trim().length === 0}
              onPress={goNext}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "desiredResult" && (
          <View>
            <TextInput
              style={styles.textInput}
              value={goal.desiredResult}
              onChangeText={(text) => patchGoal({ desiredResult: text })}
              textAlign="right"
              autoFocus
            />
            <Pressable
              style={[styles.button, styles.fullWidthButton, goal.desiredResult.trim().length === 0 && styles.buttonDisabled]}
              disabled={goal.desiredResult.trim().length === 0}
              onPress={goNext}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "identityProtocol" && (
          <View>
            {identityBuilds.length === 0 && (
              <Text style={styles.hint}>עדיין אין לך פרוטוקול זהות. אפשר ליצור אחד ב-BUILD ולחזור לכאן.</Text>
            )}
            <View style={styles.chipColumn}>
              {identityBuilds.map((build) => (
                <Pressable
                  key={build.id}
                  style={[styles.chip, goal.identityProtocolId === build.id && styles.chipSelected]}
                  onPress={() => patchGoal({ identityProtocolId: build.id })}
                >
                  <Text style={styles.buttonText}>{build.name}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => router.push("/build")}
            >
              <Text style={styles.buttonText}>צור פרוטוקול זהות חדש</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={reloadArcBuilds}>
              <Text style={styles.buttonText}>רענן רשימה</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.fullWidthButton, goal.identityProtocolId === null && styles.buttonDisabled]}
              disabled={goal.identityProtocolId === null}
              onPress={goNext}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "interferingMappings" && (
          <View>
            <Text style={styles.hint}>
              דוגמה: עייפות ← פרוטוקול אנרגיה ← פעולה תומכת קצרה ← פרוטוקול הזהות ← פעולת המטרה.
            </Text>
            {goal.interferingMappings.map((mapping, index) => (
              <View key={mapping.id} style={styles.mappingCard}>
                <Text style={styles.mappingLabel}>{`מיפוי ${index + 1}`}</Text>
                <Text style={styles.fieldLabel}>מצב פנימי שמפריע</Text>
                <TextInput
                  style={styles.textInput}
                  value={mapping.interferingState}
                  onChangeText={(text) => updateMapping(mapping.id, { interferingState: text })}
                  textAlign="right"
                />
                <Text style={styles.fieldLabel}>פרוטוקול המצב התומך</Text>
                {stateBuilds.length === 0 && <Text style={styles.hint}>עדיין אין לך פרוטוקול מצב. אפשר ליצור אחד ב-BUILD.</Text>}
                <View style={styles.chipColumn}>
                  {stateBuilds.map((build) => (
                    <Pressable
                      key={build.id}
                      style={[styles.chip, mapping.supportiveProtocolId === build.id && styles.chipSelected]}
                      onPress={() => updateMapping(mapping.id, { supportiveProtocolId: build.id })}
                    >
                      <Text style={styles.buttonText}>{build.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>פעולה תומכת קצרה (הגשר לפרוטוקול הזהות)</Text>
                <TextInput
                  style={styles.textInput}
                  value={mapping.supportiveAction}
                  onChangeText={(text) => updateMapping(mapping.id, { supportiveAction: text })}
                  textAlign="right"
                />
                <Pressable style={styles.removeButton} onPress={() => removeMapping(mapping.id)}>
                  <Text style={styles.deleteText}>הסר מיפוי</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={addMapping}>
              <Text style={styles.buttonText}>+ הוסף מיפוי</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={reloadArcBuilds}>
              <Text style={styles.buttonText}>רענן רשימה</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={goNext}>
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {step === "review" && (
          <View>
            <Text style={styles.body}>{`שם: ${goal.name}`}</Text>
            {goal.description && <Text style={styles.body}>{`תיאור: ${goal.description}`}</Text>}
            {goal.value && <Text style={styles.body}>{`ערך: ${goal.value}`}</Text>}
            <Text style={styles.body}>{`פעולה קשורה למטרה: ${goal.goalAction}`}</Text>
            <Text style={styles.body}>{`תוצאה רצויה: ${goal.desiredResult}`}</Text>
            <Text style={styles.body}>
              {`פרוטוקול זהות: ${identityBuilds.find((b) => b.id === goal.identityProtocolId)?.name ?? "לא נבחר"}`}
            </Text>
            <Text style={styles.body}>{`מספר מיפויים: ${goal.interferingMappings.length}`}</Text>
            {!isComplete(goal) && <Text style={styles.errorText}>יש להשלים שם, פעולה קשורה למטרה ותוצאה רצויה לפני השמירה.</Text>}
            {saveError && <Text style={styles.errorText}>{saveError}</Text>}
            <Pressable style={[styles.button, styles.fullWidthButton, !isComplete(goal) && styles.buttonDisabled]} disabled={!isComplete(goal)} onPress={handleSave}>
              <Text style={styles.buttonText}>שמור</Text>
            </Pressable>
          </View>
        )}

        {step !== "name" && (
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>חזור</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8 },
  fieldLabel: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 8 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 8 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipColumn: { gap: 8, marginTop: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: "center" },
  chipSelected: { backgroundColor: "#0a7ea4" },
  backButton: { marginTop: 24, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  mappingCard: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 16 },
  mappingLabel: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  removeButton: { marginTop: 12, alignItems: "center" },
  deleteText: { color: "#c0392b", fontSize: 14 },
});
