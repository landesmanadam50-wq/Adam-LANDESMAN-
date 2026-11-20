import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { createArcCreativityConnection, generateArcCreativityConnectionId, pickRandomWithinTopicInsightPair, setArcCreativityConnectionNewPrincipleText } from "../arc/arcCreativityConnection.ts";
import type { ArcCreativityInsightPair } from "../arc/arcCreativityConnection.ts";
import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { loadArcCreativityConnections, loadArcLearningInsights, loadArcLearningTopics, upsertArcCreativityConnectionEntry } from "../data/storage.ts";

/**
 * build/ArcCreativityModeCScreen.tsx (route /arc-creativity/within-topic)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 4 Mode C ("יצירתיות בתוך נושא"): the trainee picks a topic,
 * then two insights from WITHIN it. "מה הקשר בין שתי התובנות בתוך הנושא
 * הזה?" then optionally "איזה עיקרון כללי אפשר להסיק מהשילוב ביניהן?".
 * "אין קשר ברור" is a valid, acceptable, directly saveable answer --
 * never treated as an error state.
 */
export default function ArcCreativityModeCScreen() {
  const [topics, setTopics] = useState<ArcLearningTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [pair, setPair] = useState<ArcCreativityInsightPair | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [relationshipText, setRelationshipText] = useState("");
  const [newPrincipleText, setNewPrincipleText] = useState("");
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadArcLearningTopics().then((loaded) => {
        setTopics(loaded);
        setLoaded(true);
      });
    }, [])
  );

  const loadPairForTopic = useCallback(async (topicId: string) => {
    const [insights, connections] = await Promise.all([loadArcLearningInsights(), loadArcCreativityConnections()]);
    setPair(pickRandomWithinTopicInsightPair(insights, topicId, connections));
    setRelationshipText("");
    setNewPrincipleText("");
    setSaved(false);
  }, []);

  async function selectTopic(topicId: string) {
    setSelectedTopicId(topicId);
    await loadPairForTopic(topicId);
  }

  async function save(relationship: string) {
    if (!pair) return;
    const now = new Date().toISOString();
    const classification = relationship.trim() === "אין קשר ברור" ? "no_clear_connection" : "possible";
    const connection = setArcCreativityConnectionNewPrincipleText(
      createArcCreativityConnection(generateArcCreativityConnectionId(), pair.insightA.id, pair.insightB.id, relationship, "random_within_topic", classification, now),
      newPrincipleText,
      now
    );
    await upsertArcCreativityConnectionEntry(connection);
    setSaved(true);
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

  if (!selectedTopicId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.question}>בחר נושא</Text>
          {topics.map((topic) => (
            <Pressable key={topic.id} style={styles.optionCard} onPress={() => selectTopic(topic.id)}>
              <Text style={styles.optionText}>{topic.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!pair) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>אין מספיק תובנות בנושא הזה עדיין.</Text>
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

        {!saved && (
          <>
            <Text style={styles.question}>מה הקשר בין שתי התובנות בתוך הנושא הזה?</Text>
            <TextInput style={[styles.textInput, styles.multilineInput]} value={relationshipText} onChangeText={setRelationshipText} textAlign="right" multiline />

            <Text style={styles.question}>איזה עיקרון כללי אפשר להסיק מהשילוב ביניהן? (אופציונלי)</Text>
            <TextInput style={[styles.textInput, styles.multilineInput]} value={newPrincipleText} onChangeText={setNewPrincipleText} textAlign="right" multiline />

            <Pressable style={styles.primaryButton} onPress={() => save(relationshipText)}>
              <Text style={styles.primaryButtonText}>שמור קשר</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => save("אין קשר ברור")}>
              <Text style={styles.secondaryButtonText}>אין קשר ברור</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => loadPairForTopic(selectedTopicId)}>
              <Text style={styles.secondaryButtonText}>בחר זוג אחר</Text>
            </Pressable>
          </>
        )}

        {saved && (
          <>
            <Text style={styles.hint}>הקשר נשמר.</Text>
            <Pressable style={styles.secondaryButton} onPress={() => loadPairForTopic(selectedTopicId)}>
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
  question: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  optionCard: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 10, padding: 14, alignItems: "flex-end" },
  optionText: { color: "#6A1B9A", fontSize: 15, fontWeight: "600", textAlign: "right" },
  insightBlock: { backgroundColor: "#F8F0FB", borderRadius: 10, padding: 14 },
  insightText: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#6A1B9A", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#6A1B9A", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#6A1B9A", fontSize: 15 },
});
