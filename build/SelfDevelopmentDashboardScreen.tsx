import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, router, useFocusEffect } from "expo-router";

import { loadArcBuilds, loadMiniArcBuilds } from "../data/storage.ts";
import type { ArcBuild } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import { DEFERRAL_OPTIONS, scheduleDeferredReminder } from "../data/reminders.ts";
import type { DeferralOption } from "../data/reminders.ts";

/**
 * New architecture task, Phase 1 (spec section 2): the Self Development
 * mode's own dashboard -- "everyday emotions, urges, thoughts, internal
 * states and interfering habits," deliberately never requiring a Life
 * Manifest/ARC Goal/four-week program/sub-goals/targets. Reached only
 * from Home's "כניסה להתפתחות אישית" button.
 *
 * Reuses every existing collection/screen as-is (no duplicate data, no
 * placeholder screens): ArcBuild (Full ARC) and MiniArcBuild lists are
 * the real, currently-saved self-development protocols. Single-page
 * BUILD task (spec section 3): the old two separate creation entry
 * points ("בניית תוכנית" -> /build, "בניית Mini ARC" -> /mini-arc, each
 * its own inline "+" creation flow) are replaced here by ONE "+ בניית
 * תוכנית חדשה" button, routing to the new unified single-page BUILD
 * (build/SelfDevelopmentBuildScreen.tsx, route /self-development/build)
 * that lets a trainee build Full ARC only, Mini ARC only, or both
 * together, from one scrollable page. /build and /mini-arc themselves
 * are fully preserved, unchanged routes -- still reachable here as
 * "ניהול" links for renaming/deleting/reopening an already-saved
 * program, exactly as before. "LIVE התפתחות אישית" reuses
 * build/LiveModeSelectScreen.tsx's own ArcBuild-picking/ARC-Link logic
 * via its new `mode=self_development` param (see that file's own doc),
 * which skips its old mixed "ARC רגיל / ARC Goal" chooser entirely --
 * Self Development LIVE never offers ARC Goal, per spec section 2.
 *
 * Session-scoped utilities that only ever apply to ARC-Build-based
 * practice (routines, weekly stats, the optional Negative Action timer,
 * scheduling a future ARC reminder) moved here from the old mixed Home
 * screen -- their own routes/screens are completely unchanged, only
 * their entry point moved, per spec section 19's own removal ordering
 * ("remove obsolete entry buttons from the new UI" first).
 */
export default function SelfDevelopmentDashboardScreen() {
  const [arcBuilds, setArcBuilds] = useState<ArcBuild[] | null>(null);
  const [miniArcBuilds, setMiniArcBuilds] = useState<MiniArcBuild[] | null>(null);

  const reload = useCallback(() => {
    Promise.all([loadArcBuilds(), loadMiniArcBuilds()])
      .then(([builds, miniArcs]) => {
        setArcBuilds(builds);
        setMiniArcBuilds(miniArcs);
      })
      .catch((error) => {
        console.warn("[SelfDevelopmentDashboardScreen] Failed to load saved programs -- showing the empty state.", error);
        setArcBuilds([]);
        setMiniArcBuilds([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const loading = arcBuilds === null || miniArcBuilds === null;
  const hasAnyProgram = !loading && (arcBuilds!.length > 0 || miniArcBuilds!.length > 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>התפתחות אישית</Text>
        <Text style={styles.subtitle}>עבודה על רגש, דחף, מחשבה, מצב פנימי או הרגל מפריע -- ללא צורך במניפסט חיים או במטרה.</Text>

        {!loading && !hasAnyProgram && (
          <Text style={styles.hint}>עדיין אין כאן תוכניות שמורות. אפשר להתחיל למטה.</Text>
        )}

        <Pressable
          style={[styles.button, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/live/select", params: { mode: "self_development" } })}
        >
          <Text style={styles.buttonText}>LIVE התפתחות אישית</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.buildButton, styles.fullWidthButton]} onPress={() => router.push("/self-development/build")}>
          <Text style={styles.buttonText}>+ בניית תוכנית חדשה</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{`תוכניות ARC מלא${!loading ? ` (${arcBuilds!.length})` : ""}`}</Text>
        {!loading &&
          arcBuilds!.map((build) => (
            <Pressable
              key={build.id}
              style={styles.itemRow}
              onPress={() => router.push({ pathname: "/build/[id]", params: { id: build.id } })}
            >
              <Text style={styles.itemText}>{build.name}</Text>
            </Pressable>
          ))}
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/build")}>
          <Text style={styles.secondaryButtonText}>ניהול תוכניות ARC מלא</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{`תוכניות Mini ARC${!loading ? ` (${miniArcBuilds!.length})` : ""}`}</Text>
        {!loading &&
          miniArcBuilds!.map((miniArc) => (
            <Pressable
              key={miniArc.id}
              style={styles.itemRow}
              onPress={() => router.push({ pathname: "/mini-arc/[id]", params: { id: miniArc.id } })}
            >
              <Text style={styles.itemText}>{miniArc.name}</Text>
            </Pressable>
          ))}
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/mini-arc")}>
          <Text style={styles.secondaryButtonText}>ניהול תוכניות Mini ARC</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>כלים נוספים</Text>
        <Link href="/urge-arcs" asChild>
          <Pressable style={styles.itemRow}>
            <Text style={styles.itemText}>Urge ARC</Text>
          </Pressable>
        </Link>
        <Link href="/thought-arcs" asChild>
          <Pressable style={styles.itemRow}>
            <Text style={styles.itemText}>ARC Thought</Text>
          </Pressable>
        </Link>
        <Link href="/routines" asChild>
          <Pressable style={styles.itemRow}>
            <Text style={styles.itemText}>השגרה שלי</Text>
          </Pressable>
        </Link>
        <Link href="/link-practice" asChild>
          <Pressable style={styles.itemRow}>
            <Text style={styles.itemText}>תרגול קישורים</Text>
          </Pressable>
        </Link>
        <Link href="/stats" asChild>
          <Pressable style={styles.itemRow}>
            <Text style={styles.itemText}>התקדמות שבועית</Text>
          </Pressable>
        </Link>
        <Link href="/negative-action" asChild>
          <Pressable style={styles.itemRow}>
            <Text style={styles.itemText}>פעולה שלילית מוגבלת (רשות)</Text>
          </Pressable>
        </Link>
        <ScheduleArcReminder />

        <Pressable style={styles.backButton} onPress={() => router.replace("/")}>
          <Text style={styles.backButtonText}>חזרה לבחירת מצב</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Moved verbatim from the old app/index.tsx -- same scheduleDeferredReminder("arc") mechanism, no new reminder system. */
function ScheduleArcReminder() {
  const [open, setOpen] = useState(false);
  const [confirmedOption, setConfirmedOption] = useState<DeferralOption | null>(null);

  if (!open) {
    return (
      <Pressable style={styles.itemRow} onPress={() => setOpen(true)}>
        <Text style={styles.itemText}>קבע תזכורת ARC עתידית</Text>
      </Pressable>
    );
  }

  if (confirmedOption) {
    return <Text style={styles.confirmationText}>{`תזכורת נקבעה: ${confirmedOption.label}.`}</Text>;
  }

  return (
    <View style={styles.reminderPicker}>
      <Text style={styles.reminderPickerLabel}>מתי תרצה לקבל תזכורת לסשן ARC?</Text>
      <View style={styles.chipRow}>
        {DEFERRAL_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={styles.chip}
            onPress={() => {
              scheduleDeferredReminder({ kind: "arc", option, arcRequested: true, title: "ARCHI", body: "זמן לסשן ARC." });
              setConfirmedOption(option);
            }}
          >
            <Text style={styles.itemText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginTop: 24, marginBottom: 8 },
  itemRow: {
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  itemText: { fontSize: 16, textAlign: "right", color: "#0a7ea4" },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  buildButton: { backgroundColor: "#1a6b4a" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  backButton: { marginTop: 28, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
  reminderPicker: { alignItems: "flex-end", gap: 8, marginBottom: 8 },
  reminderPickerLabel: { fontSize: 14, textAlign: "right" },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  confirmationText: { fontSize: 14, textAlign: "right", color: "#0a7ea4", marginBottom: 8 },
});
