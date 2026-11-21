import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ArcInsight, ArcInsightClassification } from "../../arc/arcInsightBelief.ts";
import { classifyArcInsight, createStandaloneInsight, generateArcInsightId } from "../../arc/arcInsightBelief.ts";
import { appendArcInsight } from "../../data/storage.ts";

/**
 * live/components/ArcInsightPicker.tsx
 *
 * ARC Writing & ARC Book task, spec sections 1 (step 1), 2 (step 2) and
 * 5 ("אימות/סיווג תובנות"): the ONE shared insight-selection UI reused by
 * both the ARC Writing text editor and the ARC Book detail/chapter
 * screens -- search/filter over the SAME shared ArcInsight repository
 * (arc/arcInsightBelief.ts / data/storage.ts's loadArcInsights), never a
 * second repository. "+ תובנה" creates a real ArcInsight inline (the
 * exact same createStandaloneInsight/appendArcInsight pair
 * build/InsightWriteScreen.tsx itself uses), rather than round-tripping
 * through a navigation that would risk losing whatever the caller screen
 * is mid-typing -- same constructor, just surfaced inline here.
 *
 * Multi-select is a plain checkbox-row FlatList, same tap-to-toggle
 * convention as build/ArcGymSituationScreen.tsx's own "שיוך למטרות"
 * section -- never a second selection mechanism.
 */

const CLASSIFICATION_LABELS: Record<ArcInsightClassification, string> = {
  personal_experience: "חוויה אישית",
  hypothesis: "השערה",
  conclusion: "מסקנה",
  evidence_based_claim: "טענה מבוססת עדות",
};

const CLASSIFICATION_OPTIONS: ArcInsightClassification[] = ["personal_experience", "hypothesis", "conclusion", "evidence_based_claim"];

export default function ArcInsightPicker({
  insights,
  selectedInsightIds,
  onToggle,
  onInsightCreated,
}: {
  insights: ArcInsight[];
  selectedInsightIds: string[];
  onToggle: (insightId: string) => void;
  onInsightCreated: (insight: ArcInsight) => void;
}) {
  const [query, setQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newClassification, setNewClassification] = useState<ArcInsightClassification | null>(null);
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return insights;
    return insights.filter((insight) => insight.text.includes(trimmed));
  }, [insights, query]);

  async function handleCreate() {
    const trimmed = newText.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    const now = new Date().toISOString();
    let insight = createStandaloneInsight(generateArcInsightId(), trimmed, now);
    if (newClassification) insight = classifyArcInsight(insight, newClassification, newNote);
    await appendArcInsight(insight);
    onInsightCreated(insight);
    setNewText("");
    setNewClassification(null);
    setNewNote("");
    setShowCreateForm(false);
    setCreating(false);
  }

  return (
    <View>
      <TextInput style={styles.searchInput} placeholder="חיפוש תובנות..." value={query} onChangeText={setQuery} textAlign="right" />
      <Pressable style={styles.addButton} onPress={() => setShowCreateForm((prev) => !prev)}>
        <Text style={styles.addButtonText}>{showCreateForm ? "סגור" : "+ תובנה"}</Text>
      </Pressable>
      {showCreateForm && (
        <View style={styles.createForm}>
          <TextInput
            style={styles.createInput}
            placeholder="מה התובנה שלך?"
            value={newText}
            onChangeText={setNewText}
            multiline
            textAlign="right"
          />
          <View style={styles.chipRow}>
            {CLASSIFICATION_OPTIONS.map((option) => (
              <Pressable
                key={option}
                style={[styles.chip, newClassification === option && styles.chipSelected]}
                onPress={() => setNewClassification((prev) => (prev === option ? null : option))}
              >
                <Text style={[styles.chipText, newClassification === option && styles.chipTextSelected]}>{CLASSIFICATION_LABELS[option]}</Text>
              </Pressable>
            ))}
          </View>
          {newClassification && (
            <TextInput
              style={styles.createInput}
              placeholder="הסבר או עדות תומכת (אופציונלי)"
              value={newNote}
              onChangeText={setNewNote}
              multiline
              textAlign="right"
            />
          )}
          <Pressable style={styles.saveButton} onPress={handleCreate} disabled={creating || !newText.trim()}>
            <Text style={styles.saveButtonText}>שמור תובנה</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={<Text style={styles.hint}>לא נמצאו תובנות.</Text>}
        renderItem={({ item }) => {
          const selected = selectedInsightIds.includes(item.id);
          return (
            <Pressable style={styles.row} onPress={() => onToggle(item.id)}>
              <Text style={[styles.rowText, selected && styles.rowTextSelected]}>{item.text}</Text>
              {item.classification && <Text style={styles.classificationBadge}>{CLASSIFICATION_LABELS[item.classification]}</Text>}
              <Text style={styles.checkbox}>{selected ? "☑" : "☐"}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 8, textAlign: "right" },
  addButton: { alignSelf: "flex-end", backgroundColor: "#0a7ea4", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginBottom: 8 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  createForm: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 10, marginBottom: 10 },
  createInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 8, textAlign: "right", minHeight: 44 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 12 },
  chipTextSelected: { color: "#fff" },
  saveButton: { backgroundColor: "#2E7D32", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  list: { maxHeight: 260 },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 10, marginBottom: 6 },
  rowText: { flex: 1, textAlign: "right", fontSize: 14, color: "#222" },
  rowTextSelected: { color: "#0a7ea4", fontWeight: "700" },
  classificationBadge: { fontSize: 11, color: "#777", marginHorizontal: 6 },
  checkbox: { fontSize: 16 },
  hint: { fontSize: 13, color: "#777", textAlign: "right", paddingVertical: 8 },
});
