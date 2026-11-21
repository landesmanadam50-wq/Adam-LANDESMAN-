import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { addTriggerToActiveList, pruneActiveTriggerList, removeTriggerFromActiveList, reorderActiveTriggerList } from "../arc/arcSaving.ts";
import type { ArcTrigger } from "../arc/arcSaving.ts";
import { loadActiveArcTriggerIds, loadArcTriggers, saveActiveArcTriggerIds } from "../data/storage.ts";

/**
 * build/ArcActiveTriggersScreen.tsx (route /arc-saving/active-triggers, "עריכת טריגרים")
 *
 * ARC Saving task, spec section 9: add an existing trigger to the
 * active/displayed list, remove one without deleting it from the
 * master list, swap, multi-select, and reorder -- every change is
 * persisted immediately (saveActiveArcTriggerIds), so Home/the cube/
 * the widget all read the SAME, already up-to-date list on their own
 * next focus/push (section 14's "השינוי יתעדכן בכל הממשקים").
 */
export default function ArcActiveTriggersScreen() {
  const [triggers, setTriggers] = useState<ArcTrigger[]>([]);
  const [activeIds, setActiveIds] = useState<string[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcTriggers(), loadActiveArcTriggerIds()]).then(([loadedTriggers, loadedActiveIds]) => {
        setTriggers(loadedTriggers);
        setActiveIds(pruneActiveTriggerList(loadedActiveIds, loadedTriggers));
      });
    }, [])
  );

  async function persist(next: string[]) {
    setActiveIds(next);
    await saveActiveArcTriggerIds(next);
  }

  function labelFor(id: string): string {
    return triggers.find((trigger) => trigger.id === id)?.label ?? id;
  }

  const inactiveTriggers = triggers.filter((trigger) => !(activeIds ?? []).includes(trigger.id));
  const activeList = activeIds ?? [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>עריכת טריגרים</Text>
        <Text style={styles.subtitle}>בחר אילו טריגרים יוצגו כקיצורי דרך במסך הבית ובקובייה, ובאיזה סדר.</Text>

        <Text style={styles.sectionTitle}>הטריגרים הפעילים</Text>
        {activeIds !== null && activeList.length === 0 && <Text style={styles.hint}>לא נבחרו טריגרים פעילים.</Text>}
        <View style={styles.listContent}>
          {activeList.map((id, index) => (
            <View key={id} style={styles.activeRow}>
              <Text style={styles.activeRowLabel}>{labelFor(id)}</Text>
              <View style={styles.activeRowControls}>
                <Pressable disabled={index === 0} onPress={() => persist(reorderActiveTriggerList(activeList, index, index - 1))}>
                  <Text style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}>▲</Text>
                </Pressable>
                <Pressable disabled={index === activeList.length - 1} onPress={() => persist(reorderActiveTriggerList(activeList, index, index + 1))}>
                  <Text style={[styles.moveButton, index === activeList.length - 1 && styles.moveButtonDisabled]}>▼</Text>
                </Pressable>
                <Pressable onPress={() => persist(removeTriggerFromActiveList(activeList, id))}>
                  <Text style={styles.removeButton}>הסר</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>כל הטריגרים</Text>
        {inactiveTriggers.length === 0 && <Text style={styles.hint}>כל הטריגרים שלך כבר פעילים.</Text>}
        <View style={styles.listContent}>
          {inactiveTriggers.map((item) => (
            <Pressable key={item.id} style={styles.inactiveRow} onPress={() => persist(addTriggerToActiveList(activeList, item.id))}>
              <Text style={styles.inactiveRowLabel}>{item.label}</Text>
              <Text style={styles.addLabel}>+ הוסף</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.doneButton} onPress={() => router.back()}>
          <Text style={styles.doneButtonText}>סיום</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  subtitle: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 6, lineHeight: 19 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginTop: 16, marginBottom: 6 },
  hint: { fontSize: 13, color: "#777", textAlign: "right" },
  listContent: { gap: 6 },
  activeRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2E7D32",
    borderRadius: 10,
    padding: 10,
  },
  activeRowLabel: { fontSize: 14, fontWeight: "700", color: "#222" },
  activeRowControls: { flexDirection: "row-reverse", gap: 14, alignItems: "center" },
  moveButton: { fontSize: 16, color: "#0a7ea4" },
  moveButtonDisabled: { color: "#ccc" },
  removeButton: { fontSize: 13, color: "#c0392b", fontWeight: "600" },
  inactiveRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 10 },
  inactiveRowLabel: { fontSize: 14, color: "#333" },
  addLabel: { fontSize: 13, color: "#0a7ea4", fontWeight: "700" },
  doneButton: { backgroundColor: "#2E7D32", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginHorizontal: 20, marginTop: 24, marginBottom: 20 },
  doneButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
