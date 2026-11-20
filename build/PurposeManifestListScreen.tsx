import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { isPurposeManifestComplete, type PurposeManifest } from "../arc/purposeManifest.ts";
import { loadPurposeManifests } from "../data/storage.ts";

/**
 * build/PurposeManifestListScreen.tsx (route /purpose-manifests)
 *
 * Manifest Upgrade task, requirement 2: lists every saved
 * PurposeManifest ("add, edit, and view ... without overwriting
 * existing ones"). A manifest missing any of its own four questions is
 * marked "לא שלם" -- still fully listed and editable, just excluded
 * from the daily random selection (arc/purposeManifest.ts's
 * resolveEligibleManifests) until completed.
 */
export default function PurposeManifestListScreen() {
  const [manifests, setManifests] = useState<PurposeManifest[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPurposeManifests().then(setManifests);
    }, []),
  );

  if (!manifests) {
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
        <Text style={styles.title}>המניפסטים שלי</Text>
        {manifests.length === 0 && <Text style={styles.hint}>עדיין לא נוספו מניפסטים.</Text>}
        {manifests.map((manifest) => (
          <View key={manifest.id} style={styles.card}>
            <Pressable onPress={() => router.push({ pathname: "/purpose-manifests/[id]", params: { id: manifest.id } })}>
              <Text style={styles.cardTitle}>{manifest.longTermGoal.trim() || "מניפסט ללא מטרה עדיין"}</Text>
              {!isPurposeManifestComplete(manifest) && <Text style={styles.incompleteBadge}>לא שלם -- לא ישתתף בבחירה היומית</Text>}
            </Pressable>
            <Pressable style={styles.goalsLink} onPress={() => router.push({ pathname: "/purpose-manifests/[id]/goals", params: { id: manifest.id } })}>
              <Text style={styles.goalsLinkText}>יעדים ומשימות</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.addButton} onPress={() => router.push({ pathname: "/purpose-manifests/[id]", params: { id: "new" } })}>
          <Text style={styles.addButtonText}>+ הוספת מניפסט</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  incompleteBadge: { fontSize: 12, color: "#b35900", textAlign: "right", marginTop: 4 },
  goalsLink: { marginTop: 10, alignItems: "flex-end" },
  goalsLinkText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  addButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
