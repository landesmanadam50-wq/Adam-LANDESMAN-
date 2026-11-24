import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcRecallChatMessage, ArcRecallSourceKind } from "../arc/arcReminders.ts";
import { revealArcRecallChatMessage } from "../arc/arcReminders.ts";
import { loadArcRecallChatHistory, updateArcRecallChatMessageEntry } from "../data/storage.ts";
import { recordArcRecallAnswer, resolveArcRecallSourceQuestion } from "../data/arcRecallDelivery.ts";

const SOURCE_ROUTE_BY_KIND: Record<ArcRecallSourceKind, string> = {
  insight: "/insights/[id]",
  insight_relationship: "/arc-creativity/connections/[id]",
  learning_material: "/arc-learning/insight/[id]",
  arc_memory: "/arc-gym/memory/[id]",
};

/**
 * build/ArcRecallChatScreen.tsx (route /arc-recall/chat/[reminderId])
 *
 * ARC Reminders task, Phase 5: the WhatsApp-style thread for one
 * ArcRecallReminder's own permanent ArcRecallChatMessage history --
 * question bubbles received/right, answer bubbles sent/left, matching
 * this codebase's own RTL chat convention. The reveal affordance stays
 * locked until an answer is given, UNLESS the trainee explicitly opts
 * into revealing early (a confirmed, separate action, never the
 * default) -- `revealArcRecallChatMessage`'s own `revealedEarly` flag
 * records exactly which path was taken. "View source" always re-reads
 * the live record through its own real detail screen -- never a stale
 * snapshot captured at delivery time.
 */
export default function ArcRecallChatScreen({ reminderId }: { reminderId: string }) {
  const [messages, setMessages] = useState<ArcRecallChatMessage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealTexts, setRevealTexts] = useState<Record<string, string | null>>({});

  const reload = useCallback(() => {
    loadArcRecallChatHistory().then(async (all) => {
      const own = all.filter((message) => message.reminderId === reminderId).sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt));
      setMessages(own);
      const revealed = own.filter((message) => message.revealedOriginalAt !== null);
      const resolved = await Promise.all(revealed.map(async (message) => [message.id, (await resolveArcRecallSourceQuestion(message.sourceRef))?.revealText ?? null] as const));
      setRevealTexts(Object.fromEntries(resolved));
    });
  }, [reminderId]);

  useFocusEffect(reload);

  async function sendAnswer(messageId: string) {
    const text = (drafts[messageId] ?? "").trim();
    if (!text) return;
    await recordArcRecallAnswer(messageId, text, new Date().toISOString());
    setDrafts((previous) => ({ ...previous, [messageId]: "" }));
    reload();
  }

  async function reveal(message: ArcRecallChatMessage) {
    await updateArcRecallChatMessageEntry(revealArcRecallChatMessage(message, new Date().toISOString()));
    reload();
  }

  function confirmRevealEarly(message: ArcRecallChatMessage) {
    Alert.alert("גילוי מוקדם", "לגלות את התשובה המקורית בלי לענות קודם?", [
      { text: "ביטול", style: "cancel" },
      { text: "גלה", onPress: () => reveal(message) },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {messages.length === 0 && <Text style={styles.hint}>אין עדיין הודעות בשיח הזה.</Text>}
        {messages.map((message) => (
          <View key={message.id} style={styles.messageGroup}>
            <View style={[styles.bubble, styles.receivedBubble]}>
              <Text style={styles.bubbleText}>{message.questionText}</Text>
            </View>

            {message.userAnswerText !== null && (
              <View style={[styles.bubble, styles.sentBubble]}>
                <Text style={styles.bubbleText}>{message.userAnswerText}</Text>
              </View>
            )}

            {message.revealedOriginalAt !== null ? (
              <View style={styles.revealBox}>
                <Text style={styles.revealLabel}>{message.revealedEarly ? "גולה מוקדם:" : "התשובה המקורית:"}</Text>
                <Text style={styles.revealText}>{revealTexts[message.id] ?? "..."}</Text>
                <Pressable
                  style={styles.sourceLink}
                  onPress={() => router.push({ pathname: SOURCE_ROUTE_BY_KIND[message.sourceRef.kind] as never, params: { id: message.sourceRef.sourceId } })}
                >
                  <Text style={styles.sourceLinkText}>צפה במקור החי</Text>
                </Pressable>
              </View>
            ) : (
              <View>
                {message.userAnswerText === null && (
                  <View style={styles.answerRow}>
                    <Pressable style={styles.sendButton} onPress={() => sendAnswer(message.id)}>
                      <Text style={styles.sendButtonText}>שלח</Text>
                    </Pressable>
                    <TextInput
                      style={styles.answerInput}
                      value={drafts[message.id] ?? ""}
                      onChangeText={(value) => setDrafts((previous) => ({ ...previous, [message.id]: value }))}
                      placeholder="התשובה שלך..."
                      multiline
                    />
                  </View>
                )}
                {message.userAnswerText === null ? (
                  <Pressable style={styles.revealEarlyLink} onPress={() => confirmRevealEarly(message)}>
                    <Text style={styles.revealEarlyLinkText}>גלה בכל זאת (לפני מענה)</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.revealEarlyLink} onPress={() => reveal(message)}>
                    <Text style={styles.revealEarlyLinkText}>גלה את התשובה המקורית</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#ece5dd" },
  content: { flexGrow: 1, padding: 16 },
  hint: { fontSize: 13, textAlign: "center", color: "#777", marginTop: 20 },
  messageGroup: { marginBottom: 18 },
  bubble: { maxWidth: "82%", borderRadius: 14, padding: 12, marginBottom: 6 },
  receivedBubble: { backgroundColor: "#fff", alignSelf: "flex-end" },
  sentBubble: { backgroundColor: "#dcf8c6", alignSelf: "flex-start" },
  bubbleText: { fontSize: 15, textAlign: "right", color: "#222", lineHeight: 20 },
  answerRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 8, marginTop: 4 },
  answerInput: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 10, textAlign: "right", fontSize: 15, minHeight: 40 },
  sendButton: { backgroundColor: "#0a7ea4", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  sendButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  revealEarlyLink: { alignSelf: "flex-end", marginTop: 6 },
  revealEarlyLinkText: { fontSize: 12, color: "#888", textDecorationLine: "underline" },
  revealBox: { backgroundColor: "#fff8e1", borderRadius: 12, padding: 12, alignSelf: "flex-end", maxWidth: "82%" },
  revealLabel: { fontSize: 12, fontWeight: "700", textAlign: "right", color: "#996600", marginBottom: 4 },
  revealText: { fontSize: 14, textAlign: "right", color: "#333", lineHeight: 19 },
  sourceLink: { marginTop: 8 },
  sourceLinkText: { fontSize: 12, color: "#0a7ea4", textDecorationLine: "underline", textAlign: "right" },
});
