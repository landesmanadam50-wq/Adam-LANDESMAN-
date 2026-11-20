import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { deletePlannedArc, getTask, loadArcBeliefs, loadPlannedArcs, upsertArcBelief, upsertPlannedArc } from "../data/storage.ts";
import { disarmPlannedArcAlarm, isArcAlarmRegisteredWithOs, schedulePlannedArcAlarm } from "../data/taskAlarm.ts";
import type { PlannedArc } from "../arc/plannedArc.ts";
import { canUseBeforeTaskAlarmTiming } from "../arc/plannedArc.ts";
import { resolveNextPlannedArcAlarmOccurrence } from "../arc/plannedArcAlarm.ts";
import type { Task } from "../arc/tasks.ts";
import { beliefsOfKind, createNewPlannedBelief, generateArcBeliefId } from "../arc/arcInsightBelief.ts";
import type { ArcBelief } from "../arc/arcInsightBelief.ts";
import { EMOTION_OPTION_LABELS, PREDEFINED_EMOTION_OPTIONS } from "../arc/newArcLiveTypes.ts";
import type { EmotionSelection } from "../arc/newArcLiveTypes.ts";

const ARC_ALARM_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

function formatArcAlarmTime(date: Date | null): string | null {
  if (!date) return null;
  return `${date.toLocaleDateString("he-IL")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
// Three-levels-of-acceptance task, section 7: reused UNCHANGED from the
// existing, independent ARC Thought engine -- never a parallel label map.
import { getThoughtTimeOrientationOptions } from "../arc/thoughtLive.ts";

/**
 * build/PlannedArcEditorScreen.tsx (route /planned-arcs/[id])
 *
 * ARC-system upgrade task, Part D/E.2: edits a named planned ARC's own
 * fields (name, trigger, emotion, positive sensation/movement,
 * emotional/identity action, personal mantra) and lets the trainee pick
 * which saved belief (if any) is "active" for THIS draft, or add a new
 * one -- never retroactively changing the spontaneous exercise this
 * draft was generated from (it is a plain, independent copy; see
 * arc/plannedArc.ts's own module doc). Step durations and further
 * protocol settings (spec Part D's own list) are not yet editable here
 * -- see this task's final report.
 */
export default function PlannedArcEditorScreen({ id }: { id: string }) {
  const [item, setItem] = useState<PlannedArc | null>(null);
  const [linkedTask, setLinkedTask] = useState<Task | null>(null);
  const [beliefs, setBeliefs] = useState<ArcBelief[]>([]);
  const [newEmotionalBeliefDraft, setNewEmotionalBeliefDraft] = useState("");
  const [newIdentityBeliefDraft, setNewIdentityBeliefDraft] = useState("");
  // ARC alarm task, bug fix: the alarm time/date are REAL native
  // scheduling calls, not plain local state -- committing one on every
  // keystroke (the previous behavior) fires a flurry of overlapping
  // arm/cancel round-trips for every INTERMEDIATE, half-typed value
  // ("2", "20", "20:", "20:3", ...), some of which parse as spuriously
  // "valid" (e.g. "20:" -> hour 20, minute 0) and briefly arm the wrong
  // time. These two drafts hold the in-progress text; persistAlarm is
  // only ever called once, onBlur, with the final typed value -- never
  // on every character.
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState<string | null>(null);
  const [registeredWithOs, setRegisteredWithOs] = useState<boolean | null>(null);

  // ARC alarm task, section 1/2: immediate, concrete confirmation of
  // whether a notification id this screen just stored is ACTUALLY
  // registered with Android's own AlarmManager (notifee's own
  // getTriggerNotificationIds -- never just "we called the function and
  // it didn't throw"). Re-checked whenever the stored id itself changes,
  // not on every render.
  useEffect(() => {
    if (!item?.arcAlarmNotificationId) {
      setRegisteredWithOs(null);
      return;
    }
    isArcAlarmRegisteredWithOs(item.id).then(setRegisteredWithOs);
  }, [item?.id, item?.arcAlarmNotificationId]);

  const reload = useCallback(() => {
    Promise.all([loadPlannedArcs(), loadArcBeliefs()]).then(([items, loadedBeliefs]) => {
      const found = items.find((candidate) => candidate.id === id) ?? null;
      setItem(found);
      setBeliefs(loadedBeliefs);
      setTimeDraft(null);
      setDateDraft(null);
      if (found?.linkedTaskId) getTask(found.linkedTaskId).then(setLinkedTask);
      else setLinkedTask(null);
    });
  }, [id]);

  useFocusEffect(reload);

  async function persist(next: PlannedArc) {
    setItem(next);
    await upsertPlannedArc({ ...next, updatedAt: new Date().toISOString() });
  }

  /**
   * ARC alarm task, section 3/7: used ONLY by the alarm section's own
   * controls below (never by the other, plain text fields' persist()
   * above) -- every change here immediately re-syncs the real native
   * alarm (arm/re-arm/disarm) via schedulePlannedArcAlarm, the exact
   * same "save, then immediately reconcile the real alarm" pattern
   * build/TaskEditorScreen.tsx's own handleSave uses for a task's start
   * alarm, so a change is never left waiting for the next Today focus.
   */
  async function persistAlarm(next: PlannedArc) {
    setItem(next);
    const scheduled = await schedulePlannedArcAlarm(next, next.linkedTaskId ? linkedTask : null, new Date());
    setItem(scheduled);
    await upsertPlannedArc({ ...scheduled, updatedAt: new Date().toISOString() });
  }

  async function addNewBelief(kind: "emotional" | "identity", text: string) {
    if (!item || !text.trim()) return;
    const now = new Date().toISOString();
    const belief = createNewPlannedBelief(generateArcBeliefId(), kind, text, now);
    await upsertArcBelief(belief);
    setBeliefs((current) => [...current, belief]);
    await persist(kind === "emotional" ? { ...item, activeEmotionalBeliefId: belief.id } : { ...item, activeIdentityBeliefId: belief.id });
    if (kind === "emotional") setNewEmotionalBeliefDraft("");
    else setNewIdentityBeliefDraft("");
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const emotionalBeliefs = beliefsOfKind(beliefs, "emotional");
  const identityBeliefs = beliefsOfKind(beliefs, "identity");

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.fieldLabel}>שם התרגיל</Text>
        <TextInput style={styles.textInput} value={item.name} onChangeText={(value) => persist({ ...item, name: value })} textAlign="right" />

        <Text style={styles.fieldLabel}>טריגר</Text>
        <TextInput style={styles.textInput} value={item.triggerText ?? ""} onChangeText={(value) => persist({ ...item, triggerText: value.trim() || null })} textAlign="right" />

        <Text style={styles.fieldLabel}>רגש</Text>
        <View style={styles.chipRow}>
          {PREDEFINED_EMOTION_OPTIONS.map((option) => (
            <Pressable
              key={option}
              style={[styles.chip, item.selectedEmotion === option && styles.chipSelected]}
              onPress={() => persist({ ...item, selectedEmotion: option, customEmotionText: null })}
            >
              <Text style={styles.chipText}>{EMOTION_OPTION_LABELS[option]}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.textInput}
          value={item.selectedEmotion === "other" ? item.customEmotionText ?? "" : ""}
          onChangeText={(value) => persist({ ...item, selectedEmotion: "other" as EmotionSelection, customEmotionText: value })}
          textAlign="right"
          placeholder="או רגש אחר"
        />

        {/* Urge-stop task, requirement 6: editable here, same as every other field on this draft -- never retroactively changes the spontaneous exercise it was generated from. */}
        <Text style={styles.fieldLabel}>דחף</Text>
        <TextInput style={styles.textInput} value={item.urgeText ?? ""} onChangeText={(value) => persist({ ...item, urgeText: value.trim() || null })} textAlign="right" />

        {/* Three-levels-of-acceptance task, section 7: thought text + time classification, editable here, same as every other field on this draft -- never retroactively changes the spontaneous exercise it was generated from. */}
        <Text style={styles.fieldLabel}>מחשבה</Text>
        <TextInput style={styles.textInput} value={item.thoughtText ?? ""} onChangeText={(value) => persist({ ...item, thoughtText: value.trim() || null })} textAlign="right" />
        <View style={styles.chipRow}>
          {getThoughtTimeOrientationOptions().map((option) => (
            <Pressable
              key={option.value}
              style={[styles.chip, item.thoughtTimeOrientation === option.value && styles.chipSelected]}
              onPress={() => persist({ ...item, thoughtTimeOrientation: option.value })}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Unified awareness/urge/thought/interpretation update, section 7: a SEPARATE editable field from thoughtText above -- never merged, never auto-classified from an old thought. */}
        <Text style={styles.fieldLabel}>פרשנות</Text>
        <TextInput style={styles.textInput} value={item.interpretationText ?? ""} onChangeText={(value) => persist({ ...item, interpretationText: value.trim() || null })} textAlign="right" />

        <Text style={styles.fieldLabel}>תחושה חיובית</Text>
        <TextInput style={styles.textInput} value={item.supportiveSensation ?? ""} onChangeText={(value) => persist({ ...item, supportiveSensation: value.trim() || null })} textAlign="right" />

        <Text style={styles.fieldLabel}>תנועה חיובית</Text>
        <TextInput style={styles.textInput} value={item.positiveMovement ?? ""} onChangeText={(value) => persist({ ...item, positiveMovement: value.trim() || null })} textAlign="right" />

        {item.track !== "action" && (
          <>
            <Text style={styles.fieldLabel}>פעולה רגשית</Text>
            <TextInput
              style={styles.textInput}
              value={item.emotionalActionText ?? ""}
              onChangeText={(value) => persist({ ...item, emotionalActionText: value.trim() || null })}
              textAlign="right"
            />
          </>
        )}

        {item.track !== "emotion_only" && (
          <>
            <Text style={styles.fieldLabel}>פעולה זהותית</Text>
            <TextInput
              style={styles.textInput}
              value={item.identityActionText ?? ""}
              onChangeText={(value) => persist({ ...item, identityActionText: value.trim() || null })}
              textAlign="right"
            />
          </>
        )}

        <Text style={styles.fieldLabel}>מנטרה אישית</Text>
        <TextInput style={styles.textInput} value={item.mantraText ?? ""} onChangeText={(value) => persist({ ...item, mantraText: value.trim() || null })} textAlign="right" />

        {item.track !== "action" && (
          <>
            <Text style={styles.fieldLabel}>אמונה רגשית פעילה</Text>
            <View style={styles.chipRow}>
              {emotionalBeliefs.map((belief) => (
                <Pressable
                  key={belief.id}
                  style={[styles.chip, item.activeEmotionalBeliefId === belief.id && styles.chipSelected]}
                  onPress={() => persist({ ...item, activeEmotionalBeliefId: belief.id })}
                >
                  <Text style={styles.chipText}>{belief.text}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.textInput} value={newEmotionalBeliefDraft} onChangeText={setNewEmotionalBeliefDraft} textAlign="right" placeholder="הוספת אמונה רגשית חדשה" />
            {!!newEmotionalBeliefDraft.trim() && (
              <Pressable style={styles.secondaryButton} onPress={() => addNewBelief("emotional", newEmotionalBeliefDraft)}>
                <Text style={styles.secondaryButtonText}>הוספה ובחירה כפעילה</Text>
              </Pressable>
            )}
          </>
        )}

        {item.track !== "emotion_only" && (
          <>
            <Text style={styles.fieldLabel}>אמונת זהות פעילה</Text>
            <View style={styles.chipRow}>
              {identityBeliefs.map((belief) => (
                <Pressable
                  key={belief.id}
                  style={[styles.chip, item.activeIdentityBeliefId === belief.id && styles.chipSelected]}
                  onPress={() => persist({ ...item, activeIdentityBeliefId: belief.id })}
                >
                  <Text style={styles.chipText}>{belief.text}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.textInput} value={newIdentityBeliefDraft} onChangeText={setNewIdentityBeliefDraft} textAlign="right" placeholder="הוספת אמונת זהות חדשה" />
            {!!newIdentityBeliefDraft.trim() && (
              <Pressable style={styles.secondaryButton} onPress={() => addNewBelief("identity", newIdentityBeliefDraft)}>
                <Text style={styles.secondaryButtonText}>הוספה ובחירה כפעילה</Text>
              </Pressable>
            )}
          </>
        )}

        {/* ARC alarm task, section 3: "שעון מעורר לתרגול" -- off by
            default; never enabled without the trainee's own explicit
            choice. */}
        <Text style={styles.sectionTitle}>שעון מעורר לתרגול</Text>
        <View style={styles.chipRow}>
          <Pressable style={[styles.chip, !item.arcAlarmEnabled && styles.chipSelected]} onPress={() => persistAlarm({ ...item, arcAlarmEnabled: false })}>
            <Text style={styles.chipText}>כבוי</Text>
          </Pressable>
          <Pressable style={[styles.chip, item.arcAlarmEnabled && styles.chipSelected]} onPress={() => persistAlarm({ ...item, arcAlarmEnabled: true })}>
            <Text style={styles.chipText}>דלוק</Text>
          </Pressable>
        </View>

        {/* ARC alarm diagnostics task: immediate, concrete confirmation
            that a stored notification id is ACTUALLY registered with
            Android -- never just "we saved a field and assumed it
            worked." A full diagnostic breakdown for every alarm-enabled
            exercise, plus a real 2-minutes-out test, lives on the
            dedicated alarm diagnostics screen (/tasks/alarm-diagnostics). */}
        {item.arcAlarmEnabled && item.arcAlarmNotificationId && (
          <Text style={styles.hint}>{registeredWithOs === null ? "בודק רישום במערכת..." : registeredWithOs ? "✓ השעון רשום בפועל במערכת האנדרואיד." : "⚠ השעון אינו רשום במערכת -- משהו ביטל אותו. ראו את מסך אבחון השעונים."}</Text>
        )}

        {item.arcAlarmEnabled && (
          <>
            {canUseBeforeTaskAlarmTiming(item) && (
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, item.arcAlarmTimingKind === "before_task" && styles.chipSelected]}
                  onPress={() => persistAlarm({ ...item, arcAlarmTimingKind: "before_task" })}
                >
                  <Text style={styles.chipText}>לפני המשימה</Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, item.arcAlarmTimingKind === "standalone" && styles.chipSelected]}
                  onPress={() => persistAlarm({ ...item, arcAlarmTimingKind: "standalone" })}
                >
                  <Text style={styles.chipText}>עצמאי</Text>
                </Pressable>
              </View>
            )}

            {item.arcAlarmTimingKind === "before_task" && canUseBeforeTaskAlarmTiming(item) ? (
              <Text style={styles.hint}>
                השעה נקבעת אוטומטית לפי המשימה המקושרת.
                {(() => {
                  const next = formatArcAlarmTime(resolveNextPlannedArcAlarmOccurrence(item, linkedTask, new Date()));
                  return next ? ` התרגול הבא: ${next}.` : " אין בשלב זה זמן תרגול קרוב (בדקו את שעת המשימה או את חלון ה-ARC שלה).";
                })()}
              </Text>
            ) : (
              <>
                <Text style={styles.fieldLabel}>שעת התרגול (HH:MM)</Text>
                <TextInput
                  style={styles.textInput}
                  value={timeDraft ?? item.arcAlarmTime ?? ""}
                  onChangeText={setTimeDraft}
                  onBlur={() => {
                    if (timeDraft === null) return;
                    const value = timeDraft;
                    setTimeDraft(null);
                    persistAlarm({ ...item, arcAlarmTimingKind: "standalone", arcAlarmTime: value });
                  }}
                  textAlign="right"
                  placeholder="09:30"
                />

                <Text style={styles.fieldLabel}>חזרתיות</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    style={[styles.chip, item.arcAlarmRecurrence.kind === "once" && styles.chipSelected]}
                    onPress={() => persistAlarm({ ...item, arcAlarmTimingKind: "standalone", arcAlarmRecurrence: { kind: "once" } })}
                  >
                    <Text style={styles.chipText}>חד-פעמית</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, item.arcAlarmRecurrence.kind === "recurring" && styles.chipSelected]}
                    onPress={() => persistAlarm({ ...item, arcAlarmTimingKind: "standalone", arcAlarmRecurrence: { kind: "recurring", daysOfWeek: [] } })}
                  >
                    <Text style={styles.chipText}>חזרתית</Text>
                  </Pressable>
                </View>

                {item.arcAlarmRecurrence.kind === "once" && (
                  <>
                    <Text style={styles.fieldLabel}>תאריך (YYYY-MM-DD, רשות -- ברירת מחדל: היום)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={dateDraft ?? item.arcAlarmDate ?? ""}
                      onChangeText={setDateDraft}
                      onBlur={() => {
                        if (dateDraft === null) return;
                        const value = dateDraft;
                        setDateDraft(null);
                        persistAlarm({ ...item, arcAlarmDate: value.trim() || null });
                      }}
                      textAlign="right"
                      placeholder="2026-01-07"
                    />
                  </>
                )}

                {item.arcAlarmRecurrence.kind === "recurring" && (
                  <View style={styles.chipRow}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => persistAlarm({ ...item, arcAlarmRecurrence: { kind: "recurring", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] } })}
                    >
                      <Text style={styles.secondaryButtonText}>כל יום</Text>
                    </Pressable>
                    {ARC_ALARM_DAY_LABELS.map((label, dayOfWeek) => {
                      const recurrence = item.arcAlarmRecurrence;
                      const selected = recurrence.kind === "recurring" && recurrence.daysOfWeek.includes(dayOfWeek);
                      return (
                        <Pressable
                          key={dayOfWeek}
                          style={[styles.chip, selected && styles.chipSelected]}
                          onPress={() => {
                            if (item.arcAlarmRecurrence.kind !== "recurring") return;
                            const days = item.arcAlarmRecurrence.daysOfWeek;
                            const nextDays = days.includes(dayOfWeek) ? days.filter((day) => day !== dayOfWeek) : [...days, dayOfWeek];
                            persistAlarm({ ...item, arcAlarmRecurrence: { kind: "recurring", daysOfWeek: nextDays } });
                          }}
                        >
                          <Text style={styles.chipText}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {(() => {
                  const next = formatArcAlarmTime(resolveNextPlannedArcAlarmOccurrence(item, null, new Date()));
                  return next ? <Text style={styles.hint}>התרגול הבא: {next}.</Text> : null;
                })()}
              </>
            )}
          </>
        )}

        <Pressable
          style={styles.deleteButton}
          onPress={async () => {
            await disarmPlannedArcAlarm(item);
            await deletePlannedArc(item.id);
            router.back();
          }}
        >
          <Text style={styles.deleteButtonText}>מחיקת התרגיל המתוכנן</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 4 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  sectionTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginTop: 24 },
  fieldLabel: { fontSize: 13, color: "#888", textAlign: "right", marginTop: 14 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginTop: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 10, borderRadius: 10, alignItems: "center", marginTop: 8 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 14 },
  deleteButton: { paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 28, borderWidth: 1, borderColor: "#c0392b" },
  deleteButtonText: { color: "#c0392b", fontSize: 15, fontWeight: "600" },
});
