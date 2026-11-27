/**
 * build/ArcAddictionHomeScreen.tsx (route: /arc-addiction)
 *
 * ARC Addiction – מסוגלות, זמן וקבלה: the route's home. Quick entry to
 * every saved behavior profile ("מרגיש דחף עכשיו" starts a session in
 * one tap), the active session (if any) to continue, profile creation,
 * and each profile's progress screen. Opened with `returnToTaskId`
 * from Task LIVE, so a session started during an active task returns to
 * it – the task timer keeps running independently the whole time.
 */

import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { AddictionProfile } from "../arc/arcAddiction.ts";
import type { AddictionSession } from "../arc/arcAddictionFlow.ts";
import { getActiveWaitRound, getWaitRemainingSeconds } from "../arc/arcAddictionFlow.ts";
import { ARC_ADDICTION_DISCLAIMER, ARC_ADDICTION_PRINCIPLES, ARC_ADDICTION_ROUTE_SUBTITLE, ARC_ADDICTION_ROUTE_TITLE } from "../arc/arcAddictionCopy.ts";
import { formatRemainingTime } from "../arc/actionTimer.ts";
import { loadAddictionProfiles } from "../data/arcAddictionStorage.ts";
import { ARC_ADDICTION_SESSION_ROUTE, loadCurrentAddictionSession, startAddictionSession } from "../data/arcAddictionSession.ts";
import { arcAddictionStyles as styles } from "../live/components/arcAddictionStyles.ts";

export default function ArcAddictionHomeScreen() {
  const { returnToTaskId } = useLocalSearchParams<{ returnToTaskId?: string }>();
  const taskId = typeof returnToTaskId === "string" && returnToTaskId.length > 0 ? returnToTaskId : null;
  const [profiles, setProfiles] = useState<AddictionProfile[] | null>(null);
  const [active, setActive] = useState<AddictionSession | null>(null);
  const [conflict, setConflict] = useState<{ profileId: string; existing: AddictionSession } | null>(null);
  const [starting, setStarting] = useState(false);

  const reload = useCallback(() => {
    Promise.all([loadAddictionProfiles(), loadCurrentAddictionSession()])
      .then(([loaded, session]) => {
        setProfiles(loaded.filter((profile) => !profile.archived));
        setActive(session);
      })
      .catch((error) => {
        console.warn("[ArcAddictionHomeScreen] load failed", error);
        setProfiles([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function start(profileId: string, replaceExisting = false) {
    if (starting) return;
    setStarting(true);
    try {
      const result = await startAddictionSession(profileId, taskId, { replaceExisting });
      if (result.status === "conflict") {
        setConflict({ profileId, existing: result.session });
        return;
      }
      if (result.status === "started") {
        setConflict(null);
        router.push(ARC_ADDICTION_SESSION_ROUTE);
      }
    } finally {
      setStarting(false);
    }
  }

  if (!profiles) return <SafeAreaView style={styles.safeArea} />;

  const activeWait = active ? getActiveWaitRound(active) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{ARC_ADDICTION_ROUTE_TITLE}</Text>
        <Text style={styles.subtitle}>{ARC_ADDICTION_ROUTE_SUBTITLE}</Text>

        {active && (
          <Pressable style={[styles.card, { borderColor: "#0a7ea4" }]} onPress={() => router.push(ARC_ADDICTION_SESSION_ROUTE)}>
            <Text style={styles.cardTitle}>{`תרגול פעיל · ${active.profileName}`}</Text>
            <Text style={styles.cardRow}>
              {activeWait ? `זמן המתנה: ${formatRemainingTime(getWaitRemainingSeconds(activeWait, new Date().toISOString()))}` : "להמשך התרגול מהנקודה שבה עצרת"}
            </Text>
            <Text style={styles.linkButtonText}>המשך ←</Text>
          </Pressable>
        )}

        <View style={styles.noticeCard}>
          {ARC_ADDICTION_PRINCIPLES.map((principle) => (
            <Text key={principle.title} style={styles.body}>
              <Text style={{ fontWeight: "700" }}>{`${principle.title}: `}</Text>
              {principle.body}
            </Text>
          ))}
        </View>

        {profiles.length === 0 && <Text style={styles.body}>עדיין אין פרופיל. צור פרופיל להתנהגות שתרצה להפחית בהדרגה.</Text>}

        {profiles.map((profile) => (
          <View key={profile.id} style={styles.card}>
            <Text style={styles.cardTitle}>{profile.name}</Text>
            {!!profile.urgeSensation && <Text style={styles.cardRow}>{`התחושה: ${profile.urgeSensation}`}</Text>}
            <Text style={styles.cardRow}>{`יעד המתנה: ${profile.waitTargetMinutes} דק'${profile.waitProgression.mode === "hold" ? " (קבוע)" : ""}`}</Text>
            {profile.behaviorDurationTargetMinutes !== null && <Text style={styles.cardRow}>{`יעד משך התנהגות: ${profile.behaviorDurationTargetMinutes} דק'`}</Text>}
            <Pressable style={[styles.button, starting && styles.disabled]} disabled={starting} onPress={() => void start(profile.id)}>
              <Text style={styles.buttonText}>מרגיש דחף עכשיו</Text>
            </Pressable>
            <View style={[styles.row, { justifyContent: "flex-end", marginTop: 6 }]}>
              <Pressable style={styles.linkButton} onPress={() => router.push({ pathname: "/arc-addiction/progress/[id]", params: { id: profile.id } })}>
                <Text style={styles.linkButtonText}>התקדמות</Text>
              </Pressable>
              <Pressable style={styles.linkButton} onPress={() => router.push({ pathname: "/arc-addiction/profile/[id]", params: { id: profile.id } })}>
                <Text style={styles.linkButtonText}>עריכה</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/arc-addiction/profile/[id]", params: { id: "new" } })}>
          <Text style={styles.secondaryButtonText}>+ פרופיל התנהגות חדש</Text>
        </Pressable>

        <Text style={[styles.muted, { marginTop: 20 }]}>{ARC_ADDICTION_DISCLAIMER}</Text>
      </ScrollView>

      <Modal visible={conflict !== null} transparent animationType="fade" onRequestClose={() => setConflict(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 20 }}>
            <Text style={styles.sectionTitle}>{`יש כבר תרגול פעיל · ${conflict?.existing.profileName ?? ""}`}</Text>
            <Text style={styles.body}>אפשר להמשיך אותו, או לסיים אותו (כל מה שתועד נשמר) ולהתחיל חדש.</Text>
            <Pressable
              style={styles.button}
              onPress={() => {
                setConflict(null);
                router.push(ARC_ADDICTION_SESSION_ROUTE);
              }}
            >
              <Text style={styles.buttonText}>המשך התרגול הפעיל</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => conflict && void start(conflict.profileId, true)}>
              <Text style={styles.secondaryButtonText}>סיום והתחלת תרגול חדש</Text>
            </Pressable>
            <Pressable style={styles.linkButton} onPress={() => setConflict(null)}>
              <Text style={styles.linkButtonText}>ביטול</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
