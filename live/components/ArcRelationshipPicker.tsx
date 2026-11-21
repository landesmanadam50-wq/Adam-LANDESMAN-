import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ArcInsight } from "../../arc/arcInsightBelief.ts";
import type { ArcInsightRelationship, ArcInsightRelationshipType } from "../../arc/arcWriting.ts";
import { createArcInsightRelationship, generateArcInsightRelationshipId, resolveRelationshipsForInsights } from "../../arc/arcWriting.ts";
import { upsertArcInsightRelationshipEntry } from "../../data/storage.ts";
import ArcInsightRelationshipMap from "./ArcInsightRelationshipMap.tsx";

/**
 * live/components/ArcRelationshipPicker.tsx
 *
 * ARC Writing & ARC Book task, spec section 2 (step 2) and section 4
 * ("מפת תובנות/קשרים"): pick an EXISTING relationship touching the
 * currently selected insights, or create a new one over them (type +
 * optional personal explanation) -- the shared repository
 * (arc/arcWriting.ts's ArcInsightRelationship), reused across every
 * text/chapter/book, never duplicated. Toggles between the map view
 * (ArcInsightRelationshipMap) and a plain list -- spec section 4's own
 * "חובה לאפשר גם תצוגת רשימה פשוטה."
 */

const RELATIONSHIP_TYPE_LABELS: Record<ArcInsightRelationshipType, string> = {
  cause_effect: "סיבה ותוצאה",
  complement: "השלמה",
  similarity: "דמיון",
  contrast: "ניגוד",
  other: "אחר",
};

const RELATIONSHIP_TYPE_OPTIONS: ArcInsightRelationshipType[] = ["cause_effect", "complement", "similarity", "contrast", "other"];

export default function ArcRelationshipPicker({
  insights,
  insightIds,
  allRelationships,
  selectedRelationshipIds,
  onToggleRelationship,
  onRelationshipCreated,
}: {
  insights: ArcInsight[];
  insightIds: string[];
  allRelationships: ArcInsightRelationship[];
  selectedRelationshipIds: string[];
  onToggleRelationship: (relationshipId: string) => void;
  onRelationshipCreated: (relationship: ArcInsightRelationship) => void;
}) {
  const [showMap, setShowMap] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newType, setNewType] = useState<ArcInsightRelationshipType>("cause_effect");
  const [newExplanation, setNewExplanation] = useState("");

  const relevant = resolveRelationshipsForInsights(allRelationships, insightIds);
  const selectedInsights = insights.filter((insight) => insightIds.includes(insight.id));

  async function handleCreate() {
    if (insightIds.length < 2) return;
    const now = new Date().toISOString();
    const relationship = createArcInsightRelationship(generateArcInsightRelationshipId(), insightIds, newType, newExplanation, now);
    await upsertArcInsightRelationshipEntry(relationship);
    onRelationshipCreated(relationship);
    setNewExplanation("");
    setShowCreateForm(false);
  }

  async function handleRemove(relationshipId: string) {
    onToggleRelationship(relationshipId);
  }

  return (
    <View>
      <View style={styles.toggleRow}>
        <Pressable onPress={() => setShowMap((prev) => !prev)}>
          <Text style={styles.linkText}>{showMap ? "תצוגת רשימה" : "תצוגת מפה"}</Text>
        </Pressable>
        <Pressable onPress={() => setShowCreateForm((prev) => !prev)}>
          <Text style={styles.linkText}>{showCreateForm ? "סגור" : "+ קשר חדש"}</Text>
        </Pressable>
      </View>

      {showCreateForm && (
        <View style={styles.createForm}>
          {insightIds.length < 2 ? (
            <Text style={styles.hint}>יש לבחור לפחות שתי תובנות כדי ליצור קשר ביניהן.</Text>
          ) : (
            <>
              <View style={styles.chipRow}>
                {RELATIONSHIP_TYPE_OPTIONS.map((option) => (
                  <Pressable key={option} style={[styles.chip, newType === option && styles.chipSelected]} onPress={() => setNewType(option)}>
                    <Text style={[styles.chipText, newType === option && styles.chipTextSelected]}>{RELATIONSHIP_TYPE_LABELS[option]}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.createInput}
                placeholder="הסבר אישי (אופציונלי)"
                value={newExplanation}
                onChangeText={setNewExplanation}
                multiline
                textAlign="right"
              />
              <Pressable style={styles.saveButton} onPress={handleCreate}>
                <Text style={styles.saveButtonText}>שמור קשר</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {showMap ? (
        <ArcInsightRelationshipMap insights={selectedInsights} relationships={relevant} onRemoveRelationship={handleRemove} />
      ) : (
        <FlatList
          data={relevant}
          keyExtractor={(item) => item.id}
          style={styles.list}
          ListEmptyComponent={<Text style={styles.hint}>אין עדיין קשרים בין התובנות שנבחרו.</Text>}
          renderItem={({ item }) => {
            const selected = selectedRelationshipIds.includes(item.id);
            return (
              <Pressable style={styles.row} onPress={() => onToggleRelationship(item.id)}>
                <View style={styles.rowTextContainer}>
                  <Text style={[styles.rowTitle, selected && styles.rowTitleSelected]}>{RELATIONSHIP_TYPE_LABELS[item.relationshipType]}</Text>
                  {!!item.explanation && <Text style={styles.rowExplanation}>{item.explanation}</Text>}
                </View>
                <Text style={styles.checkbox}>{selected ? "☑" : "☐"}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 8 },
  linkText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13 },
  createForm: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 10, marginBottom: 10 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10 },
  chipSelected: { backgroundColor: "#6A1B9A" },
  chipText: { color: "#6A1B9A", fontSize: 12 },
  chipTextSelected: { color: "#fff" },
  createInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 8, textAlign: "right", minHeight: 44 },
  saveButton: { backgroundColor: "#2E7D32", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  list: { maxHeight: 260 },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 10, marginBottom: 6 },
  rowTextContainer: { flex: 1 },
  rowTitle: { textAlign: "right", fontSize: 14, fontWeight: "700", color: "#6A1B9A" },
  rowTitleSelected: { color: "#2E7D32" },
  rowExplanation: { textAlign: "right", fontSize: 12, color: "#777", marginTop: 2 },
  checkbox: { fontSize: 16 },
  hint: { fontSize: 13, color: "#777", textAlign: "right", paddingVertical: 8 },
});
