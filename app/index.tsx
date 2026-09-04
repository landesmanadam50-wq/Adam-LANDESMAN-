import { useCallback, useState } from "react";
import { Link, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { loadArcBuilds } from "../data/storage.ts";
import { DEFERRAL_OPTIONS, scheduleDeferredReminder } from "../data/reminders.ts";
import type { DeferralOption } from "../data/reminders.ts";

/**
 * Reminder/timer-update task (#5): scheduling a future ARC session
 * reminder, independently of any LIVE session in progress -- reuses
 * the exact same chip-picker/scheduling mechanism as deferred Focus
 * Success (data/reminders.ts's scheduleDeferredReminder, kind "arc"),
 * so there is only ever one reminder-scheduling system, not two.
 * arcRequested is always true for this kind (a future ARC reminder is,
 * by construction, "with ARC") -- see data/storage.ts's PendingReminder.
 */
function ScheduleArcReminder() {
  const [open, setOpen] = useState(false);
  const [confirmedOption, setConfirmedOption] = useState<DeferralOption | null>(null);

  if (!open) {
    return (
      <Pressable style={styles.secondaryButton} onPress={() => setOpen(true)}>
        <Text style={styles.secondaryButtonText}>קבע תזכורת ARC עתידית</Text>
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
              scheduleDeferredReminder({
                kind: "arc",
                option,
                arcRequested: true,
                title: "ARCHI",
                body: "זמן לסשן ARC.",
              });
              setConfirmedOption(option);
            }}
          >
            <Text style={styles.secondaryButtonText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Home() {
  const [hasArcBuilds, setHasArcBuilds] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadArcBuilds()
        .then((builds) => {
          if (!cancelled) setHasArcBuilds(builds.length > 0);
        })
        // Startup-safety fix: loadArcBuilds() itself no longer rejects,
        // but this stays as defense-in-depth so Home can never get stuck
        // showing nothing (hasArcBuilds staying null forever) if some
        // other, unrelated failure occurs here -- falls back to the
        // "no ARC Builds yet" empty state, never a blank screen.
        .catch((error) => {
          console.warn("[Home] Failed to load ARC Builds -- showing the empty state.", error);
          if (!cancelled) setHasArcBuilds(false);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Archi</Text>

        {/* Mini ARC task: an independent feature -- available regardless of
            whether the trainee has any full ARC Build yet, since it's meant
            for immediate support without the full protocol. */}
        <Link href="/mini-arc" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Mini ARC</Text>
          </Pressable>
        </Link>

        {hasArcBuilds === false && (
          <Link href="/build" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>הוסף ARC Build ראשון</Text>
            </Pressable>
          </Link>
        )}

        {hasArcBuilds === true && (
          <>
            <Link href="/live" asChild>
              <Pressable style={styles.button}>
                <Text style={styles.buttonText}>התחל סשן LIVE</Text>
              </Pressable>
            </Link>
            <Link href="/stats" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>התקדמות שבועית</Text>
              </Pressable>
            </Link>
            <Link href="/build" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>BUILD</Text>
              </Pressable>
            </Link>
            <Link href="/routines" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>השגרה שלי</Text>
              </Pressable>
            </Link>
            <Link href="/negative-action" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>פעולה שלילית מוגבלת (רשות)</Text>
              </Pressable>
            </Link>
            <ScheduleArcReminder />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 17,
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
  reminderPicker: {
    alignItems: "center",
    gap: 8,
  },
  reminderPickerLabel: {
    fontSize: 15,
    textAlign: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  chip: {
    backgroundColor: "#E6F4FE",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  confirmationText: {
    fontSize: 15,
    textAlign: "center",
    color: "#0a7ea4",
  },
});
