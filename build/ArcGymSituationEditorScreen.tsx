import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createArcGymSituation, findFutureBehavior, generateArcGymSituationId, updateArcGymSituation } from "../arc/arcGym.ts";
import type { ArcGymSituation } from "../arc/arcGym.ts";
import { loadArcGymSituations, loadPurposeManifests, upsertArcGymSituationEntry } from "../data/storage.ts";

/**
 * build/ArcGymSituationEditorScreen.tsx (route /arc-gym/situation/[id]/edit,
 * id === "new" to create -- same convention as build/TaskEditorScreen.tsx)
 *
 * ARC GYM task, requirement 4: saves, for a situation, the related
 * behavior (by reference, snapshotting its CURRENT wording), the
 * situation description, the trigger, and -- critically -- the exact
 * desired action ("מה בדיוק היית רוצה לעשות בסיטואציה הזאת?"), never
 * relying on the broader Manifest behavior text alone once this more
 * specific action exists. Also the one place requirement 4's/9's own
 * "allow the user to edit the desired action/situation later" is
 * satisfied -- the SAME form, for both creating and editing.
 */
export default function ArcGymSituationEditorScreen({
  id,
  behaviorId = null,
  manifestId = null,
}: {
  id: string;
  behaviorId?: string | null;
  manifestId?: string | null;
}) {
  const isNew = id === "new";
  const [existing, setExisting] = useState<ArcGymSituation | null>(null);
  const [behaviorText, setBehaviorText] = useState("");
  const [situationDescription, setSituationDescription] = useState("");
  const [trigger, setTrigger] = useState("");
  const [desiredAction, setDesiredAction] = useState("");
  const [visualizationDetails, setVisualizationDetails] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcGymSituations(), loadPurposeManifests()]).then(([situations, manifests]) => {
        if (isNew) {
          const behavior = manifestId && behaviorId ? findFutureBehavior(manifests, manifestId, behaviorId) : null;
          setBehaviorText(behavior?.description ?? "");
        } else {
          const situation = situations.find((candidate) => candidate.id === id) ?? null;
          setExisting(situation);
          if (situation) {
            setBehaviorText(situation.behaviorText);
            setSituationDescription(situation.situationDescription);
            setTrigger(situation.trigger);
            setDesiredAction(situation.desiredAction);
            setVisualizationDetails(situation.visualizationDetails ?? "");
          }
        }
        setLoaded(true);
      });
    }, [id, isNew, behaviorId, manifestId])
  );

  async function save() {
    const validationErrors: string[] = [];
    if (!situationDescription.trim()) validationErrors.push("יש לתאר את הסיטואציה.");
    if (!desiredAction.trim()) validationErrors.push("יש להגדיר מה בדיוק היית רוצה לעשות בסיטואציה הזאת.");
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    const now = new Date().toISOString();
    const saved =
      existing !== null
        ? updateArcGymSituation(existing, { situationDescription, trigger, desiredAction, visualizationDetails }, now)
        : createArcGymSituation(generateArcGymSituationId(), manifestId!, behaviorId!, behaviorText, situationDescription, trigger, desiredAction, now);
    await upsertArcGymSituationEntry(saved);
    router.replace({ pathname: "/arc-gym/situation/[id]", params: { id: saved.id } });
  }

  if (!loaded) {
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
        <Text style={styles.title}>{isNew ? "סיטואציה חדשה" : "עריכת סיטואציה"}</Text>
        <Text style={styles.behaviorText}>{behaviorText}</Text>

        {errors.map((error) => (
          <Text key={error} style={styles.errorText}>
            {error}
          </Text>
        ))}

        <Field label="באילו סיטואציות הקושי הזה מופיע?">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={situationDescription}
            onChangeText={setSituationDescription}
            textAlign="right"
            multiline
            placeholder="לדוגמה: כשאני רואה נהג במכונית."
          />
        </Field>

        <Field label="מה הטריגר הספציפי? (רשות)">
          <TextInput
            style={styles.textInput}
            value={trigger}
            onChangeText={setTrigger}
            textAlign="right"
            placeholder="לדוגמה: כשאני רואה את הנהג ורוצה לפנות אליו."
          />
        </Field>

        <Field label="מה בדיוק היית רוצה לעשות בסיטואציה הזאת?">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={desiredAction}
            onChangeText={setDesiredAction}
            textAlign="right"
            multiline
            placeholder="לדוגמה: לגשת לנהג, ליצור קשר עין ולדבר בצורה ברורה."
          />
        </Field>

        <Field label="פרטי דימיון נוספים (רשות)">
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={visualizationDetails}
            onChangeText={setVisualizationDetails}
            textAlign="right"
            multiline
          />
        </Field>

        <Pressable style={styles.primaryButton} onPress={save}>
          <Text style={styles.primaryButtonText}>{isNew ? "יצירת סיטואציה" : "שמירת שינויים"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 4 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  behaviorText: { fontSize: 14, color: "#666", textAlign: "right", marginBottom: 16 },
  errorText: { color: "#b00020", textAlign: "right", fontSize: 14, marginBottom: 4 },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
