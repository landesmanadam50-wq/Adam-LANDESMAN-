import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  ARC_GYM_OBSTACLE_LABELS,
  ARC_GYM_OBSTACLE_OPTIONS,
  createEmptyArcGymBehaviorObstacles,
  findArcGymBehaviorObstacles,
  findFutureBehavior,
  listArcGymSituationsForBehavior,
  setArcGymObstacleCustomText,
  toggleArcGymObstacle,
} from "../arc/arcGym.ts";
import type { ArcGymBehaviorObstacles, ArcGymObstacle, ArcGymSituation } from "../arc/arcGym.ts";
import { loadArcGymBehaviorObstacles, loadArcGymSituations, loadPurposeManifests, upsertArcGymBehaviorObstaclesEntry } from "../data/storage.ts";

/**
 * build/ArcGymBehaviorScreen.tsx (route /arc-gym/behavior/[behaviorId]?manifestId=...)
 *
 * ARC GYM task, requirements 3+4: "מה מונע ממך לפעול בצורה הזאת?"
 * (behavioral obstacles, asked and edited once per behavior -- never
 * per situation, see arc/arcGym.ts's own module doc) plus the list of
 * situations already defined for this behavior, each with its own
 * trigger/desired-action/training history.
 */
export default function ArcGymBehaviorScreen({ behaviorId, manifestId }: { behaviorId: string; manifestId: string }) {
  const [behaviorText, setBehaviorText] = useState<string | null>(null);
  const [obstacles, setObstacles] = useState<ArcGymBehaviorObstacles | null>(null);
  const [situations, setSituations] = useState<ArcGymSituation[]>([]);
  const [customDraft, setCustomDraft] = useState("");

  const reload = useCallback(() => {
    Promise.all([loadPurposeManifests(), loadArcGymBehaviorObstacles(), loadArcGymSituations()]).then(([manifests, obstacleRecords, allSituations]) => {
      const behavior = findFutureBehavior(manifests, manifestId, behaviorId);
      setBehaviorText(behavior?.description ?? "");
      const record = findArcGymBehaviorObstacles(obstacleRecords, manifestId, behaviorId);
      setObstacles(record ?? createEmptyArcGymBehaviorObstacles(manifestId, behaviorId, new Date().toISOString()));
      setCustomDraft(record?.customText ?? "");
      setSituations(listArcGymSituationsForBehavior(allSituations, manifestId, behaviorId));
    });
  }, [manifestId, behaviorId]);

  useFocusEffect(reload);

  async function toggleObstacle(obstacle: ArcGymObstacle) {
    if (!obstacles) return;
    const next = toggleArcGymObstacle(obstacles, obstacle, new Date().toISOString());
    setObstacles(next);
    await upsertArcGymBehaviorObstaclesEntry(next);
  }

  async function saveCustomText() {
    if (!obstacles) return;
    const next = setArcGymObstacleCustomText(obstacles, customDraft, new Date().toISOString());
    setObstacles(next);
    await upsertArcGymBehaviorObstaclesEntry(next);
  }

  function openSituation(situation: ArcGymSituation) {
    router.push({ pathname: "/arc-gym/situation/[id]", params: { id: situation.id } });
  }

  function addSituation() {
    router.push({ pathname: "/arc-gym/situation/[id]/edit", params: { id: "new", behaviorId, manifestId } });
  }

  if (behaviorText === null || !obstacles) {
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
        <Text style={styles.behaviorText}>{behaviorText}</Text>

        <Text style={styles.sectionTitle}>מה מונע ממך לפעול בצורה הזאת?</Text>
        <View style={styles.chipRow}>
          {ARC_GYM_OBSTACLE_OPTIONS.map((option) => (
            <Pressable
              key={option}
              style={[styles.chip, obstacles.obstacles.includes(option) && styles.chipSelected]}
              onPress={() => toggleObstacle(option)}
            >
              <Text style={[styles.chipText, obstacles.obstacles.includes(option) && styles.chipTextSelected]}>{ARC_GYM_OBSTACLE_LABELS[option]}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, obstacles.obstacles.includes("other") && styles.chipSelected]} onPress={() => toggleObstacle("other")}>
            <Text style={[styles.chipText, obstacles.obstacles.includes("other") && styles.chipTextSelected]}>אחר</Text>
          </Pressable>
        </View>
        {obstacles.obstacles.includes("other") && (
          <TextInput
            style={styles.textInput}
            value={customDraft}
            onChangeText={setCustomDraft}
            onBlur={saveCustomText}
            textAlign="right"
            placeholder="תיאור חופשי"
          />
        )}

        <Text style={styles.sectionTitle}>באילו סיטואציות הקושי הזה מופיע?</Text>
        {situations.length === 0 && <Text style={styles.hint}>עדיין לא הוגדרו סיטואציות.</Text>}
        {situations.map((situation) => (
          <Pressable key={situation.id} style={styles.situationCard} onPress={() => openSituation(situation)}>
            <Text style={styles.situationText}>{situation.situationDescription || "(ללא תיאור)"}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.primaryButton} onPress={addSituation}>
          <Text style={styles.primaryButtonText}>+ סיטואציה חדשה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  behaviorText: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginTop: 16, marginBottom: 10 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  chipTextSelected: { color: "#fff" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, marginTop: 10 },
  situationCard: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginTop: 8, alignItems: "flex-end" },
  situationText: { fontSize: 15, textAlign: "right", color: "#333" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
});
