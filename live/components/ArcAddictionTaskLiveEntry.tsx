/**
 * live/components/ArcAddictionTaskLiveEntry.tsx
 *
 * ARC Addiction inside Task LIVE (live/ActiveTaskScreen.tsx): one
 * compact row that either
 *   - opens ARC Addiction for this task ("🌱 דחף – ARC Addiction"), with
 *     returnToTaskId so the session comes back here, or
 *   - while a session is active, shows its state / the waiting countdown
 *     and reopens it.
 * It never pauses or touches the task timer: the waiting timer and the
 * task timer run independently.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";

import type { AddictionSession } from "../../arc/arcAddictionFlow.ts";
import { getActiveWaitRound, getWaitRemainingSeconds } from "../../arc/arcAddictionFlow.ts";
import { formatRemainingTime } from "../../arc/actionTimer.ts";
import { ARC_ADDICTION_SESSION_ROUTE, loadCurrentAddictionSession, subscribeAddictionSession } from "../../data/arcAddictionSession.ts";

export default function ArcAddictionTaskLiveEntry({ taskId }: { taskId: string }) {
  const [session, setSession] = useState<AddictionSession | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      loadCurrentAddictionSession()
        .then(setSession)
        .catch(() => setSession(null));
      return subscribeAddictionSession(setSession);
    }, [])
  );

  const wait = getActiveWaitRound(session);
  useEffect(() => {
    if (!wait) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [wait]);

  if (session) {
    const label = wait ? `🌱 ${session.profileName} · ⏳ ${formatRemainingTime(getWaitRemainingSeconds(wait, new Date(now).toISOString()))}` : `🌱 ${session.profileName} · להמשך התרגול`;
    return (
      <Pressable accessibilityRole="button" style={[styles.row, styles.active]} onPress={() => router.push(ARC_ADDICTION_SESSION_ROUTE)}>
        <Text style={styles.activeText}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable accessibilityRole="button" style={styles.row} onPress={() => router.push({ pathname: "/arc-addiction", params: { returnToTaskId: taskId } })}>
      <Text style={styles.text}>🌱 דחף – ARC Addiction</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderColor: "#2E7D32", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, alignItems: "center" },
  active: { backgroundColor: "#E8F5E9" },
  text: { color: "#2E7D32", fontSize: 15, fontWeight: "600" },
  activeText: { color: "#1B5E20", fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
