import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  createArcCreativityConnection,
  generateArcCreativityConnectionId,
  setArcCreativityConnectionUserExplanation,
  suggestArcCreativityConnectionPair,
} from "../arc/arcCreativityConnection.ts";
import type { ArcCreativitySuggestedPair } from "../arc/arcCreativityConnection.ts";
import type { ArcCreativityConnectionClassification } from "../arc/arcCreativityConnection.ts";
import { loadArcCreativityConnections, loadArcLearningInsights, upsertArcCreativityConnectionEntry } from "../data/storage.ts";

const CLASSIFICATION_LABELS: Record<ArcCreativityConnectionClassification, string> = {
  evidence_supported: "מבוסס על עדות",
  possible: "קשר אפשרי",
  creative_analogy: "אנלוגיה יצירתית",
  no_clear_connection: "אין קשר ברור",
};

/**
 * build/ArcCreativityModeAScreen.tsx (route /arc-creativity/suggested)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 4 Mode A ("קשרים מוצעים"): shows two insights, asks the
 * trainee to answer independently BEFORE revealing the suggestion, then
 * lets them save (optionally editing the suggested text) or reject and
 * see a different pair. The suggestion is always labeled with its own
 * classification -- "never presenting AI suggestions as established
 * fact".
 */
export default function ArcCreativityModeAScreen() {
  const [suggestion, setSuggestion] = useState<ArcCreativitySuggestedPair | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ownAnswer, setOwnAnswer] = useState("");
  const [relationshipText, setRelationshipText] = useState("");
  const [revealed, setRevealed] = useState(false);

  const loadSuggestion = useCallback(async () => {
    const [insights, connections] = await Promise.all([loadArcLearningInsights(), loadArcCreativityConnections()]);
    const next = suggestArcCreativityConnectionPair(insights, connections);
    setSuggestion(next);
    setOwnAnswer("");
    setRelationshipText(next?.suggestedRelationship ?? "");
    setRevealed(false);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSuggestion();
    }, [loadSuggestion])
  );

  async function save() {
    if (!suggestion) return;
    const now = new Date().toISOString();
    const connection = setArcCreativityConnectionUserExplanation(
      createArcCreativityConnection(
        generateArcCreativityConnectionId(),
        suggestion.insightA.id,
        suggestion.insightB.id,
        relationshipText,
        "ai_suggested",
        suggestion.suggestedClassification,
        now
      ),
      ownAnswer,
      now
    );
    await upsertArcCreativityConnectionEntry(connection);
    router.push("/arc-creativity");
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

  if (!suggestion) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>אין מספיק תובנות עדיין ליצירת הצעות קשר. הוסף עוד תובנות ב-ARC Learning.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.insightBlock}>
          <Text style={styles.insightText}>{suggestion.insightA.mainSentence}</Text>
        </View>
        <View style={styles.insightBlock}>
          <Text style={styles.insightText}>{suggestion.insightB.mainSentence}</Text>
        </View>

        <Text style={styles.question}>איזה קשר אתה מזהה בין שתי התובנות?</Text>
        <TextInput style={[styles.textInput, styles.multilineInput]} value={ownAnswer} onChangeText={setOwnAnswer} textAlign="right" multiline />

        {!revealed && (
          <Pressable style={styles.primaryButton} onPress={() => setRevealed(true)}>
            <Text style={styles.primaryButtonText}>הצג הצעה</Text>
          </Pressable>
        )}

        {revealed && (
          <>
            <View style={styles.suggestionBlock}>
              <Text style={styles.suggestionLabel}>הצעה ({CLASSIFICATION_LABELS[suggestion.suggestedClassification]}) -- לא עובדה מוכחת</Text>
              <TextInput style={[styles.textInput, styles.multilineInput]} value={relationshipText} onChangeText={setRelationshipText} textAlign="right" multiline />
            </View>
            <Pressable style={styles.primaryButton} onPress={save}>
              <Text style={styles.primaryButtonText}>שמור קשר</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={loadSuggestion}>
              <Text style={styles.secondaryButtonText}>דחה והצג זוג אחר</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 12 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  insightBlock: { backgroundColor: "#F8F0FB", borderRadius: 10, padding: 14 },
  insightText: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333" },
  question: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#6A1B9A", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#6A1B9A", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#6A1B9A", fontSize: 15 },
  suggestionBlock: { gap: 6 },
  suggestionLabel: { fontSize: 12, color: "#6A1B9A", textAlign: "right", fontWeight: "700" },
});
