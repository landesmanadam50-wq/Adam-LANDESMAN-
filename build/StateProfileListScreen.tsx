import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { disableStateProfile, archiveStateProfile, loadStateProfiles, restoreStateProfile } from "../data/storage.ts";
import { isStateProfileCompleteForPractice } from "../arc/stateProfile.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import type { LibraryItemStatus } from "../arc/libraryItemStatus.ts";

const STATUS_LABELS: Record<LibraryItemStatus, string> = {
  enabled: "פעיל",
  disabled: "מושבת",
  archived: "בארכיון",
};

/**
 * build/StateProfileListScreen.tsx (route: /state-profiles)
 *
 * Adaptive ARC architecture task, Phase 10: the management screen for
 * the new StateProfile library ("המצבים הרצויים שלי") -- lists every
 * saved StateProfile (data/storage.ts's loadStateProfiles/
 * ARC_STATE_PROFILES_KEY, a collection entirely separate from
 * ARC_BUILDS_KEY) and lets the trainee create, edit, disable, enable,
 * archive, and restore any of them, mirroring
 * build/UrgeArcListScreen.tsx's own row+action-button conventions.
 *
 * Multiple StateProfiles may exist and be enabled at once -- there is
 * no one-active-State selection here or anywhere else in this phase
 * (see arc/libraryItemStatus.ts's own "One active Self Development
 * program may contain: Many StateProfiles" doc); which ONE State a
 * given LIVE session uses is a later phase's own per-session choice,
 * never a global pointer stored on this list.
 *
 * Archived profiles are hidden by default (showArchived toggle reveals
 * them) but never deleted -- disable/archive/restore only ever change
 * `status` via the existing Phase 3 CRUD, the same record/id is kept
 * forever. Tapping a row opens the editor; nothing here starts a LIVE
 * session -- that wiring is explicitly deferred to a later phase.
 */
export default function StateProfileListScreen() {
  const [profiles, setProfiles] = useState<StateProfile[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const reload = useCallback(() => {
    loadStateProfiles()
      .then(setProfiles)
      .catch((error) => {
        console.warn("[StateProfileListScreen] Failed to load State Profiles -- showing the empty state.", error);
        setProfiles([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleDisable(id: string) {
    await disableStateProfile(id, new Date().toISOString());
    reload();
  }

  async function handleArchive(id: string) {
    await archiveStateProfile(id, new Date().toISOString());
    reload();
  }

  async function handleRestore(id: string) {
    await restoreStateProfile(id, new Date().toISOString());
    reload();
  }

  if (!profiles) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const visibleProfiles = profiles.filter((profile) => showArchived || profile.status !== "archived");

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>המצבים הרצויים שלי</Text>
        <Text style={styles.subtitle}>יצירה וניהול של מצבים פנימיים שתרצה לחזק ולתרגל.</Text>

        <Pressable style={styles.toggleRow} onPress={() => setShowArchived((current) => !current)}>
          <Text style={styles.toggleText}>{showArchived ? "הסתר מצבים בארכיון" : "הצג גם מצבים בארכיון"}</Text>
        </Pressable>

        {profiles.length === 0 && <Text style={styles.emptyText}>עדיין אין כאן מצבים רצויים שמורים. אפשר להוסיף אחד חדש למטה.</Text>}
        {profiles.length > 0 && visibleProfiles.length === 0 && <Text style={styles.emptyText}>כל המצבים הרצויים שלך נמצאים כרגע בארכיון.</Text>}

        {visibleProfiles.map((profile) => {
          const completeForPractice = isStateProfileCompleteForPractice(profile);
          return (
          <View key={profile.id} style={styles.card}>
            <Pressable onPress={() => router.push({ pathname: "/state-profiles/[id]", params: { id: profile.id } })}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{profile.name}</Text>
                <Text style={[styles.statusBadge, styles[`statusBadge_${profile.status}`]]}>{STATUS_LABELS[profile.status]}</Text>
              </View>
              {profile.description && <Text style={styles.cardRow}>{profile.description}</Text>}
              <Text style={[styles.readinessBadge, completeForPractice ? styles.readinessBadge_ready : styles.readinessBadge_draft]}>
                {completeForPractice ? "מוכן לתרגול LIVE" : "חסר: עוגן ויסות, רמז קידוד ו/או פעולה -- הקש לעריכה"}
              </Text>
            </Pressable>

            <View style={styles.cardActions}>
              <Pressable style={styles.actionButton} onPress={() => router.push({ pathname: "/state-profiles/[id]", params: { id: profile.id } })}>
                <Text style={styles.actionButtonText}>ערוך</Text>
              </Pressable>
              {profile.status === "enabled" && (
                <>
                  {/*
                    Adaptive ARC architecture task, Phase 13: shown only
                    for an enabled StateProfile -- a disabled/archived
                    State can never have its combined configuration
                    edited as though it were active (see
                    build/CombinedInterferenceSelectionScreen.tsx's own
                    "stateNotEnabled" read-only handling for anyone who
                    still reaches that route directly, e.g. an old link).
                  */}
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => router.push({ pathname: "/combined-selection/[stateProfileId]", params: { stateProfileId: profile.id } })}
                  >
                    <Text style={styles.actionButtonText}>הגדרת גורמים מפריעים</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => handleDisable(profile.id)}>
                    <Text style={styles.actionButtonText}>השבת</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => handleArchive(profile.id)}>
                    <Text style={styles.actionButtonText}>העבר לארכיון</Text>
                  </Pressable>
                </>
              )}
              {profile.status === "disabled" && (
                <>
                  <Pressable style={styles.actionButton} onPress={() => handleRestore(profile.id)}>
                    <Text style={styles.actionButtonText}>הפעל</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => handleArchive(profile.id)}>
                    <Text style={styles.actionButtonText}>העבר לארכיון</Text>
                  </Pressable>
                </>
              )}
              {profile.status === "archived" && (
                <Pressable style={styles.actionButton} onPress={() => handleRestore(profile.id)}>
                  <Text style={styles.actionButtonText}>שחזר</Text>
                </Pressable>
              )}
            </View>
          </View>
          );
        })}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/state-profiles/[id]", params: { id: "new" } })}>
          <Text style={styles.buttonText}>+ הוספת מצב רצוי</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>חזרה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 12 },
  toggleRow: { alignItems: "flex-end", marginBottom: 16 },
  toggleText: { fontSize: 14, color: "#0a7ea4" },
  emptyText: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 16 },
  card: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 14,
  },
  cardHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4" },
  statusBadge: { fontSize: 12, fontWeight: "600", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12, overflow: "hidden" },
  statusBadge_enabled: { backgroundColor: "#E3F7E8", color: "#1a6b4a" },
  statusBadge_disabled: { backgroundColor: "#FDF3D9", color: "#8a6d1a" },
  statusBadge_archived: { backgroundColor: "#F0F0F0", color: "#666" },
  cardRow: { fontSize: 14, textAlign: "right", color: "#333", marginTop: 6 },
  readinessBadge: { fontSize: 12, fontWeight: "600", textAlign: "right", marginTop: 6 },
  readinessBadge_ready: { color: "#1a6b4a" },
  readinessBadge_draft: { color: "#8a6d1a" },
  cardActions: { flexDirection: "row-reverse", gap: 16, marginTop: 10, justifyContent: "flex-end" },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backButton: { marginTop: 20, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});
