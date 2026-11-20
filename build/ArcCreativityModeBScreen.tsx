import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  createArcCreativityConnection,
  createArcLearningInsightFromConnection,
  generateArcCreativityConnectionId,
  pickRandomCrossTopicInsightPair,
  setArcCreativityConnectionNewPrincipleText,
  setArcCreativityConnectionUserExplanation,
} from "../arc/arcCreativityConnection.ts";
import type { ArcCreativityInsightPair } from "../arc/arcCreativityConnection.ts";
import { generateArcLearningInsightId } from "../arc/arcLearningInsight.ts";
import { loadArcCreativityConnections, loadArcLearningInsights, upsertArcCreativityConnectionEntry, upsertArcLearningInsightEntry } from "../data/storage.ts";

/**
 * build/ArcCreativityModeBScreen.tsx (route /arc-creativity/cross-topic)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 4 Mode B ("יצירתיות בין נושאים"): a random pair of insights
 * from DIFFERENT topics. "איזה קשר יצירתי אפשר למצוא בין שתי התובנות?"
 * then optionally "איזה רעיון חדש אפשר ליצור מהשילוב ביניהן?". Saving
 * can optionally continue straight into "הפוך לתובנה חדשה" (section 5's
 * own ARC Learning -> ARC Creativity -> New Insight -> ARC Learning
 * cycle).
 */
export default function ArcCreativityModeBScreen() {
  const [pair, setPair] = useState<ArcCreativityInsightPair | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [relationshipText, setRelationshipText] = useState("");
  const [newPrincipleText, setNewPrincipleText] = useState("");
  const [savedConnectionId, setSavedConnectionId] = useState<string | null>(null);

  const loadPair = useCallback(async () => {
    const [insights, connections] = await Promise.all([loadArcLearningInsights(), loadArcCreativityConnections()]);
    setPair(pickRandomCrossTopicInsightPair(insights, connections));
    setRelationshipText("");
    setNewPrincipleText("");
    setSavedConnectionId(null);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPair();
    }, [loadPair])
  );

  async function save() {
    if (!pair || !relationshipText.trim()) return;
    const now = new Date().toISOString();
    const connection = setArcCreativityConnectionNewPrincipleText(
      createArcCreativityConnection(generateArcCreativityConnectionId(), pair.insightA.id, pair.insightB.id, relationshipText, "random_cross_topic", "possible", now),
      newPrincipleText,
      now
    );
    await upsertArcCreativityConnectionEntry(connection);
    setSavedConnectionId(connection.id);
  }

  async function convertToNewInsight() {
    if (!savedConnectionId) return;
    const now = new Date().toISOString();
    const [connections] = await Promise.all([loadArcCreativityConnections()]);
    const connection = connections.find((candidate) => candidate.id === savedConnectionId);
    if (!connection) return;
    const insight = createArcLearningInsightFromConnection(generateArcLearningInsightId(), connection, now);
    await upsertArcLearningInsightEntry(insight);
    router.push({ pathname: "/arc-learning/insight/[id]/edit", params: { id: insight.id } });
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

  if (!pair) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>אין מספיק תובנות משני נושאים שונים עדיין.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.insightBlock}>
          <Text style={styles.insightText}>{pair.insightA.mainSentence}</Text>
        </View>
        <View style={styles.insightBlock}>
          <Text style={styles.insightText}>{pair.insightB.mainSentence}</Text>
        </View>

        {!savedConnectionId && (
          <>
            <Text style={styles.question}>איזה קשר יצירתי אפשר למצוא בין שתי התובנות?</Text>
            <TextInput style={[styles.textInput, styles.multilineInput]} value={relationshipText} onChangeText={setRelationshipText} textAlign="right" multiline />

            <Text style={styles.question}>איזה רעיון חדש אפשר ליצור מהשילוב ביניהן? (אופציונלי)</Text>
            <TextInput style={[styles.textInput, styles.multilineInput]} value={newPrincipleText} onChangeText={setNewPrincipleText} textAlign="right" multiline />

            <Pressable style={styles.primaryButton} onPress={save}>
              <Text style={styles.primaryButtonText}>שמור קשר</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={loadPair}>
              <Text style={styles.secondaryButtonText}>בחר זוג אחר</Text>
            </Pressable>
          </>
        )}

        {savedConnectionId && (
          <>
            <Text style={styles.hint}>הקשר נשמר.</Text>
            {newPrincipleText.trim().length > 0 && (
              <Pressable style={styles.primaryButton} onPress={convertToNewInsight}>
                <Text style={styles.primaryButtonText}>הפוך לתובנה חדשה</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondaryButton} onPress={loadPair}>
              <Text style={styles.secondaryButtonText}>זוג נוסף</Text>
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
});
