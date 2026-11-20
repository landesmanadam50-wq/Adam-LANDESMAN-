import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  getArcFocusCurrentStreakSeconds,
  getArcFocusRingCount,
  getArcFocusSessionRemainingSeconds,
  getArcFocusSmileyCount,
  getArcFocusStageElapsedSeconds,
  getArcFocusStageTargetSeconds,
} from "../arc/arcFocusEngine.ts";
import type { ArcFocusAttentionAnswer } from "../arc/arcFocusEngine.ts";
import {
  buildArcFocusPracticeRecord,
  discardThoughtEntry,
  endSessionEarly,
  pauseSession,
  registerCenterTap,
  registerOuterTap,
  resolveAttentionCheck,
  resumeSession,
  saveThought,
  startFocusSession,
  tick,
} from "../arc/arcFocusSession.ts";
import type { ArcFocusPracticeRecord, ArcFocusSession } from "../arc/arcFocusSession.ts";
import { clearArcFocusSession, loadArcFocusSession, saveArcFocusPracticeRecord, saveArcFocusSession } from "../data/storage.ts";
import ArcFocusThoughtDialog from "./ArcFocusThoughtDialog.tsx";
import ArcFocusAttentionCheckDialog from "./ArcFocusAttentionCheckDialog.tsx";

const TICK_INTERVAL_MS = 200;
const MAX_RENDERED_RINGS = 6;

function formatSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/**
 * live/ArcFocusLiveScreen.tsx (route /tasks/[id]/arc-focus)
 *
 * ARC Focus task: the main exercise screen -- a center focus point with
 * an inner per-stage stopwatch, a continuously rotating surrounding
 * ring, one additional blue ring per stage advance, a bottom stats bar
 * (stage #, smileys, time remaining), and two clearly separated tap
 * zones (center = rhythmic taps, outer ring = report a thought). All
 * real elapsed-time math lives in arc/arcFocusSession.ts/
 * arc/arcFocusEngine.ts -- this component's own tick loop exists only to
 * trigger a repaint at a steady cadence, exactly like every other
 * timestamp-anchored timer in this app (arc/taskTimer.ts's own
 * getTaskTimerStatus philosophy).
 *
 * On mount, loads the SAME persisted practice by `arcFocusPracticeId`
 * (never re-picks settings) -- if it is still "idle" (the trainee just
 * came from the check-in, with no preliminary ARC or just after one
 * finished), startFocusSession starts both clocks HERE, which is the
 * exact moment "the Focus clock starts" per the spec: preliminary ARC
 * time and the check-in itself are never counted into Focus duration,
 * because the engine's own clocks simply do not exist before this call.
 */
export default function ArcFocusLiveScreen({ taskId, arcFocusPracticeId }: { taskId: string; arcFocusPracticeId: string }) {
  const [session, setSession] = useState<ArcFocusSession | null>(null);
  const [record, setRecord] = useState<ArcFocusPracticeRecord | null>(null);
  const recordSavingRef = useRef(false);
  const rotation = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      loadArcFocusSession().then((loaded) => {
        if (!loaded || loaded.practiceId !== arcFocusPracticeId) return;
        const now = new Date().toISOString();
        const started = loaded.engine.status === "idle" ? startFocusSession(loaded, now) : loaded;
        if (started !== loaded) saveArcFocusSession(started);
        setSession(started);
      });
    }, [arcFocusPracticeId])
  );

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSession((current) => {
        if (!current || current.engine.status !== "running") return current;
        const now = new Date().toISOString();
        const next = tick(current, now);
        if (next !== current) saveArcFocusSession(next);
        return next;
      });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!session || session.engine.status !== "completed" || record || recordSavingRef.current) return;
    recordSavingRef.current = true;
    const now = new Date().toISOString();
    const builtRecord = buildArcFocusPracticeRecord(session, now);
    saveArcFocusPracticeRecord(builtRecord).then(() => clearArcFocusSession()).then(() => setRecord(builtRecord));
  }, [session, record]);

  function applyTransition(next: ArcFocusSession) {
    setSession(next);
    saveArcFocusSession(next);
  }

  function handleCenterTap() {
    if (!session) return;
    applyTransition(registerCenterTap(session, new Date().toISOString()));
  }

  function handleOuterTap() {
    if (!session) return;
    applyTransition(registerOuterTap(session, new Date().toISOString()));
  }

  function handleSaveThought(text: string) {
    if (!session) return;
    applyTransition(saveThought(session, text, new Date().toISOString()));
  }

  function handleDiscardThought() {
    if (!session) return;
    applyTransition(discardThoughtEntry(session, new Date().toISOString()));
  }

  function handleAttentionAnswer(answer: ArcFocusAttentionAnswer) {
    if (!session) return;
    applyTransition(resolveAttentionCheck(session, answer, new Date().toISOString()));
  }

  function handlePauseToggle() {
    if (!session) return;
    const now = new Date().toISOString();
    applyTransition(session.engine.status === "paused" ? resumeSession(session, now) : pauseSession(session, now));
  }

  function handleEndEarly() {
    if (!session) return;
    Alert.alert("סיום מוקדם", "לסיים את התרגול עכשיו?", [
      { text: "ביטול", style: "cancel" },
      { text: "סיום", style: "destructive", onPress: () => applyTransition(endSessionEarly(session, new Date().toISOString())) },
    ]);
  }

  /**
   * ARCHI -- ARC Focus Is an Independent Exercise correction: ARC Focus is
   * always its own standalone ARC Gym exercise, whether started directly
   * from ARC Gym or reached through a scheduled taskKind: "arcFocus" Task
   * (session.taskId there is simply that Task's own id, never a
   * "different" task to redirect to). Finishing Focus always returns to
   * ARC Gym Home, with no session.taskId-based branching.
   */
  function finishAndLeave() {
    router.replace("/arc-gym");
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredContent}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (session.engine.status === "completed") {
    const summary = record ?? buildArcFocusPracticeRecord(session, new Date().toISOString());
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredContent}>
          <Text style={styles.summaryTitle}>סיכום התרגול</Text>
          <Text style={styles.summaryLine}>{`😊 חייכנים (לפי זמן תרגול פעיל): ${summary.smileyCount}`}</Text>
          <Text style={styles.summaryLine}>{`⏱ זמן תרגול פעיל: ${formatSeconds(summary.activeSeconds)}`}</Text>
          <Text style={styles.summaryLine}>{`🔵 השלב הגבוה ביותר: ${summary.highestStageReached}`}</Text>
          <Text style={styles.summaryLine}>{`💭 מחשבות שזוהו: ${summary.thoughtsLoggedCount}`}</Text>
          <Text style={styles.summaryLine}>{`🔁 חזרות למיקוד: ${summary.focusRecoveryCount}`}</Text>
          <Text style={styles.summaryLine}>{`🎯 הרצף הארוך ביותר ללא הסחה (לפי דיווח עצמי): ${formatSeconds(summary.longestFocusStreakSeconds)}`}</Text>
          <Text style={styles.summaryNote}>הרצף מבוסס על דיווח עצמי בבדיקות תשומת הלב -- אינו הוכחה אובייקטיבית לריכוז רציף.</Text>
          <Pressable style={styles.primaryButton} onPress={finishAndLeave} accessibilityLabel="בית ARC Gym">
            <Text style={styles.primaryButtonText}>🏋️ סיום וחזרה ל־ARC Gym</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const now = new Date().toISOString();
  const ringCount = getArcFocusRingCount(session.engine);
  const visibleRings = Math.min(ringCount, MAX_RENDERED_RINGS);
  const overflowRings = ringCount - visibleRings;
  const stageElapsed = getArcFocusStageElapsedSeconds(session.engine, now);
  const stageTarget = getArcFocusStageTargetSeconds(session.engine);
  const sessionRemaining = getArcFocusSessionRemainingSeconds(session.engine, now);
  const smileyCount = getArcFocusSmileyCount(session.engine, now);
  const streakSeconds = getArcFocusCurrentStreakSeconds(session.engine, now);
  const isPaused = session.engine.status === "paused";
  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.liveContent}>
        <Text style={styles.stageText}>{`שלב ${session.engine.currentStage}`}</Text>

        <Pressable style={styles.focusArea} onPress={handleOuterTap}>
          <Animated.View style={[styles.rotatingRing, { transform: [{ rotate: spin }] }]} />
          {Array.from({ length: visibleRings }).map((_, index) => (
            <View key={index} style={[styles.stageRing, { width: 140 + index * 22, height: 140 + index * 22, borderRadius: (140 + index * 22) / 2 }]} />
          ))}
          {overflowRings > 0 && (
            <View style={styles.overflowBadge}>
              <Text style={styles.overflowBadgeText}>{`+${overflowRings}`}</Text>
            </View>
          )}
          <Pressable style={styles.centerPoint} onPress={handleCenterTap}>
            <Text style={styles.centerPointText}>{formatSeconds(stageElapsed)}</Text>
            <Text style={styles.centerPointSubtext}>{`/ ${formatSeconds(stageTarget)}`}</Text>
          </Pressable>
        </Pressable>

        <Text style={styles.hint}>מרכז = הקשה קצבית · טבעת חיצונית = דיווח מחשבה</Text>
        {streakSeconds > 0 && <Text style={styles.hint}>{`רצף נוכחי (דיווח עצמי): ${formatSeconds(streakSeconds)}`}</Text>}

        <View style={styles.statsBar}>
          <Text style={styles.statsText}>{`שלב ${session.engine.currentStage}`}</Text>
          <Text style={styles.statsText}>{`😊 ${smileyCount}`}</Text>
          <Text style={styles.statsText}>{`⏳ ${formatSeconds(sessionRemaining)}`}</Text>
        </View>

        <View style={styles.controlsRow}>
          <Pressable style={styles.secondaryButton} onPress={handlePauseToggle}>
            <Text style={styles.secondaryButtonText}>{isPaused ? "המשך" : "השהיה"}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleEndEarly}>
            <Text style={styles.secondaryButtonText}>סיום מוקדם</Text>
          </Pressable>
        </View>
      </View>

      <ArcFocusThoughtDialog
        visible={session.engine.status === "thought_entry"}
        trigger={session.engine.thoughtEntryTrigger}
        onSave={handleSaveThought}
        onDiscard={handleDiscardThought}
      />
      <ArcFocusAttentionCheckDialog visible={session.engine.status === "attention_check"} onAnswer={handleAttentionAnswer} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  centeredContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 10 },
  hint: { fontSize: 13, textAlign: "center", color: "#777" },
  liveContent: { flex: 1, alignItems: "center", justifyContent: "space-between", paddingVertical: 24, paddingHorizontal: 16 },
  stageText: { fontSize: 18, fontWeight: "700", color: "#333" },
  focusArea: { width: 280, height: 280, alignItems: "center", justifyContent: "center" },
  rotatingRing: { position: "absolute", width: 260, height: 260, borderRadius: 130, borderWidth: 2, borderColor: "#90caf9", borderStyle: "dashed" },
  stageRing: { position: "absolute", borderWidth: 2, borderColor: "#1565C0" },
  overflowBadge: { position: "absolute", top: 4, right: 4, backgroundColor: "#1565C0", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  overflowBadgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  centerPoint: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#0a7ea4", alignItems: "center", justifyContent: "center" },
  centerPointText: { color: "#fff", fontWeight: "700", fontSize: 20 },
  centerPointSubtext: { color: "#e0f2fe", fontSize: 12 },
  statsBar: { flexDirection: "row-reverse", justifyContent: "space-around", width: "100%", paddingVertical: 10, borderTopWidth: 1, borderColor: "#eee" },
  statsText: { fontSize: 15, fontWeight: "600", color: "#333" },
  controlsRow: { flexDirection: "row-reverse", gap: 12, width: "100%", justifyContent: "center" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 10, marginTop: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  summaryTitle: { fontSize: 22, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  summaryLine: { fontSize: 15, textAlign: "center", color: "#333" },
  summaryNote: { fontSize: 12, textAlign: "center", color: "#888", marginTop: 8, paddingHorizontal: 20 },
});
