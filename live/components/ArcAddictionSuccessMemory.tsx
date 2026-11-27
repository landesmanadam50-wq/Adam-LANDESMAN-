/**
 * live/components/ArcAddictionSuccessMemory.tsx
 *
 * Positive Memory integration for ARC Addiction:
 *   - useAddictionSuccessMemory: picks an earlier success moment of this
 *     profile for the efficacy ARC's "success_memory" step (with
 *     "another" rotation), recording the pick in the shared selection
 *     history.
 *   - default export: the "save this as a success moment" control on the
 *     closing screen (double-tap safe; saved once per episode).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { AddictionSession } from "../../arc/arcAddictionFlow.ts";
import { SAVE_SUCCESS_MEMORY_LABEL } from "../../arc/arcAddictionCopy.ts";
import { buildAddictionSuccessMemory, selectAddictionSuccessMemory } from "../../arc/arcAddictionMemory.ts";
import type { PositiveMemory } from "../../arc/positiveMemory.ts";
import { recordPositiveMemorySelection } from "../../arc/positiveMemorySelectionHistory.ts";
import { loadPositiveMemories, loadPositiveMemorySelectionHistory, savePositiveMemorySelectionHistory, upsertPositiveMemoryEntry } from "../../data/storage.ts";
import { arcAddictionStyles as styles } from "./arcAddictionStyles.ts";

export function useAddictionSuccessMemory(profileId: string | null, active: boolean): { memory: PositiveMemory | null; another: () => void } {
  const [memory, setMemory] = useState<PositiveMemory | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);

  const resolve = useCallback(
    async (exclude: string[]) => {
      if (!profileId) return;
      try {
        const [memories, history] = await Promise.all([loadPositiveMemories(), loadPositiveMemorySelectionHistory()]);
        const picked = selectAddictionSuccessMemory(memories, profileId, history, exclude);
        setMemory(picked);
        if (picked) await savePositiveMemorySelectionHistory(recordPositiveMemorySelection(history, picked.id, "arc_addiction", profileId, new Date().toISOString()));
      } catch {
        setMemory(null);
      }
    },
    [profileId]
  );

  useEffect(() => {
    if (!active) return;
    setExcluded([]);
    void resolve([]);
  }, [active, resolve]);

  const another = useCallback(() => {
    if (!memory) return;
    const nextExcluded = [...excluded, memory.id];
    setExcluded(nextExcluded);
    void resolve(nextExcluded);
  }, [memory, excluded, resolve]);

  return { memory, another };
}

export default function ArcAddictionSuccessMemoryControls({ session, onSaved }: { session: AddictionSession; onSaved: (memoryId: string) => void }) {
  const [description, setDescription] = useState("");
  const savingRef = useRef(false);

  if (session.episode.savedPositiveMemoryId) {
    return <Text style={[styles.noticeCard, styles.body]}>נשמר ב־Positive Memory. הוא יופיע בתרגילי המסוגלות הבאים.</Text>;
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const memory = buildAddictionSuccessMemory(session.episode.profileId, session.profileName, description, new Date().toISOString());
      await upsertPositiveMemoryEntry(memory);
      onSaved(memory.id);
    } catch (error) {
      console.warn("[ArcAddictionSuccessMemory] save failed", error);
      savingRef.current = false;
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>רגע הצלחה</Text>
      <Text style={styles.muted}>מה עזר לך לבחור? (לא חובה)</Text>
      <TextInput style={[styles.input, { minHeight: 50 }]} multiline value={description} onChangeText={setDescription} placeholder="למשל: התחושה התומכת בכפות הידיים" />
      <Pressable style={styles.secondaryButton} onPress={() => void save()}>
        <Text style={styles.secondaryButtonText}>{SAVE_SUCCESS_MEMORY_LABEL}</Text>
      </Pressable>
    </View>
  );
}
