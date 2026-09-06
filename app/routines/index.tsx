/**
 * app/routines/index.tsx
 *
 * Weekly Routine + ARC Link management task: the Routine page now has
 * THREE distinct, additive sections above the pre-existing "השגרה שלי"
 * (Multiple Scheduled ARC + Success Focus Routines) content, which is
 * extracted below into ScheduledRoutinesSection with ZERO behavior
 * changes -- same state, same handlers, same RoutineForm/RoutineRow,
 * only its own outer SafeAreaView/ScrollView/back-link removed since
 * it's now nested inside this page's own single outer scroll view.
 *
 *   Routine
 *   ├── Weekly Routine        (WeeklyActionsSection)
 *   ├── ARC Link -- Build and Manage  (ArcLinkManageSection)
 *   ├── ARC Link Practice     (ArcLinkPracticeSection)
 *   └── (existing) השגרה שלי  (ScheduledRoutinesSection, unchanged)
 *
 * WeeklyAction/RoutineTrigger/ArcLink (arc/routineLinks.ts) are brand
 * new, independent entities/storage keys -- never read by
 * ScheduledRoutine, normal ARC/Mini ARC, or program/. An ArcLink stores
 * only references (protocolId/weeklyActionId/triggerId); its rehearsal
 * content is always read live from the linked ArcBuild/MiniArcBuild, so
 * a BUILD edit there is automatically reflected here.
 */

import { useCallback, useState } from "react";
import { Link, router, useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  deleteWeeklyAction,
  loadArcBuilds,
  loadArcLinks,
  loadMiniArcBuilds,
  loadRoutineOccurrenceCompletions,
  loadRoutineTriggers,
  loadScheduledRoutines,
  loadWeeklyActions,
  saveScheduledRoutines,
  upsertArcLink,
  upsertRoutineTrigger,
  upsertWeeklyAction,
} from "../../data/storage.ts";
import type { RoutineOccurrenceCompletion, ScheduledRoutine } from "../../data/storage.ts";
import { cancelRoutineNotification, reconcileRoutineNotifications, rescheduleRoutineNotification } from "../../data/routines.ts";
import { buildRoutineListItems, generateRoutineId, resolveNextOccurrenceDate, resolveTodayOccurrenceDate, sortRoutineListItems } from "../../arc/routines.ts";
import type { RoutineListItem, RoutineStatus } from "../../arc/routines.ts";
import {
  arcLinkPracticeSchedule,
  countCompletionsThisWeek,
  describeTrigger,
  generateRoutineTriggerId,
  generateWeeklyActionId,
  resolveRoutineTrigger,
  resolveWeeklyAction,
} from "../../arc/routineLinks.ts";
import type { ArcLink, RoutineTrigger, WeeklyAction } from "../../arc/routineLinks.ts";
import { ARC_LINK_TRIGGER_TYPE_LABELS } from "../../arc/bodyImagery.ts";
import type { ArcLinkTriggerType } from "../../arc/bodyImagery.ts";
import { todayLocalDateString } from "../../program/dateUtils.ts";
import type { ArcBuild } from "../../arc/types.ts";
import type { MiniArcBuild } from "../../arc/miniArc.ts";
import ArcLinkBuildForm from "../../build/ArcLinkBuildForm.tsx";

const DAY_LABELS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]; // index === Date.getDay()
const DAY_FULL_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const SUCCESS_FOCUS_DURATION_OPTIONS = [5, 10, 15, 20, 30];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatHm(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function formatOccurrence(date: Date): string {
  return `יום ${DAY_FULL_NAMES[date.getDay()]}, ${formatHm(date.getHours(), date.getMinutes())}`;
}

/** "ראשון, שלישי וחמישי" -- Hebrew list join with a final "ו" before the last item. Empty for no days, matching a weekly action/Link with no schedule configured yet. */
function formatDaysList(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((day) => DAY_FULL_NAMES[day]);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ו${names[names.length - 1]}`;
}

// ===========================================================================
// Section 1: Weekly Routine ("השגרה השבועית שלי")
// ===========================================================================

interface WeeklyActionFormState {
  id: string | null;
  name: string;
  days: number[];
  timesText: string;
  durationText: string;
  triggerId: string | null;
  weeklyTargetText: string;
  linkedProtocolType: "none" | "arc" | "mini_arc";
  linkedProtocolId: string | null;
  enabled: boolean;
}

function emptyWeeklyActionForm(): WeeklyActionFormState {
  return {
    id: null,
    name: "",
    days: [],
    timesText: "",
    durationText: "",
    triggerId: null,
    weeklyTargetText: "",
    linkedProtocolType: "none",
    linkedProtocolId: null,
    enabled: true,
  };
}

function formFromWeeklyAction(action: WeeklyAction): WeeklyActionFormState {
  return {
    id: action.id,
    name: action.name,
    days: action.days,
    timesText: action.times.join(", "),
    durationText: action.durationMinutes !== null ? String(action.durationMinutes) : "",
    triggerId: action.triggerId,
    weeklyTargetText: String(action.weeklyTarget),
    linkedProtocolType: action.linkedProtocolType ?? "none",
    linkedProtocolId: action.linkedProtocolId ?? null,
    enabled: action.enabled,
  };
}

function WeeklyActionsSection() {
  const [actions, setActions] = useState<WeeklyAction[]>([]);
  const [triggers, setTriggers] = useState<RoutineTrigger[]>([]);
  const [arcBuilds, setArcBuilds] = useState<ArcBuild[]>([]);
  const [miniArcBuilds, setMiniArcBuilds] = useState<MiniArcBuild[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<WeeklyActionFormState | null>(null);
  const [newTriggerType, setNewTriggerType] = useState<ArcLinkTriggerType>("time");
  const [newTriggerText, setNewTriggerText] = useState("");

  const reload = useCallback(() => {
    Promise.all([loadWeeklyActions(), loadRoutineTriggers(), loadArcBuilds(), loadMiniArcBuilds()]).then(
      ([loadedActions, loadedTriggers, loadedArc, loadedMini]) => {
        setActions(loadedActions);
        setTriggers(loadedTriggers);
        setArcBuilds(loadedArc);
        setMiniArcBuilds(loadedMini);
        setLoaded(true);
      }
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleSave() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const times = form.timesText
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const duration = form.durationText.trim() ? Number.parseInt(form.durationText, 10) : null;
    const weeklyTarget = form.weeklyTargetText.trim() ? Number.parseInt(form.weeklyTargetText, 10) : 1;
    const existing = form.id ? actions.find((a) => a.id === form.id) ?? null : null;
    const action: WeeklyAction = {
      id: form.id ?? generateWeeklyActionId(),
      name,
      days: form.days,
      times,
      durationMinutes: duration !== null && !Number.isNaN(duration) ? duration : null,
      triggerId: form.triggerId,
      weeklyTarget: !Number.isNaN(weeklyTarget) && weeklyTarget > 0 ? weeklyTarget : 1,
      linkedProtocolId: form.linkedProtocolType === "none" ? null : form.linkedProtocolId,
      linkedProtocolType: form.linkedProtocolType === "none" ? null : form.linkedProtocolType,
      completedDates: existing?.completedDates ?? [],
      enabled: form.enabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await upsertWeeklyAction(action);
    setForm(null);
    reload();
  }

  async function handleDelete(id: string) {
    await deleteWeeklyAction(id);
    setForm(null);
    reload();
  }

  async function handleAddTrigger() {
    const text = newTriggerText.trim();
    if (!text || !form) return;
    const trigger: RoutineTrigger = {
      id: generateRoutineTriggerId(),
      type: newTriggerType,
      text,
      time: newTriggerType === "time" ? text : null,
      createdAt: new Date().toISOString(),
    };
    await upsertRoutineTrigger(trigger);
    setTriggers([...triggers, trigger]);
    setForm({ ...form, triggerId: trigger.id });
    setNewTriggerText("");
  }

  async function handleStart(action: WeeklyAction) {
    if (action.linkedProtocolType === "arc" && action.linkedProtocolId) {
      router.push({ pathname: "/live/select", params: { buildId: action.linkedProtocolId } });
      return;
    }
    if (action.linkedProtocolType === "mini_arc" && action.linkedProtocolId) {
      router.push({ pathname: "/mini-arc/mode/[id]", params: { id: action.linkedProtocolId } });
      return;
    }
    // No linked protocol -- a plain check-off for today.
    const today = todayLocalDateString();
    const updated: WeeklyAction = {
      ...action,
      completedDates: action.completedDates.includes(today) ? action.completedDates : [...action.completedDates, today],
      updatedAt: new Date().toISOString(),
    };
    await upsertWeeklyAction(updated);
    reload();
  }

  function toggleDay(day: number) {
    if (!form) return;
    setForm({ ...form, days: form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day].sort() });
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>השגרה השבועית שלי</Text>

      {form ? (
        <View>
          <Text style={styles.fieldLabel}>שם הפעולה</Text>
          <TextInput style={styles.textInput} value={form.name} onChangeText={(text) => setForm({ ...form, name: text })} placeholder="לדוגמה: פעילות גופנית" textAlign="right" />

          <Text style={styles.fieldLabel}>ימים</Text>
          <View style={styles.chipRow}>
            {DAY_LABELS.map((label, day) => (
              <Pressable key={day} style={[styles.chip, form.days.includes(day) && styles.chipSelected]} onPress={() => toggleDay(day)}>
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>שעה או שעות (מופרדות בפסיק)</Text>
          <TextInput style={styles.textInput} value={form.timesText} onChangeText={(text) => setForm({ ...form, timesText: text })} placeholder="18:00" textAlign="right" />

          <Text style={styles.fieldLabel}>משך (בדקות, רשות)</Text>
          <TextInput
            style={styles.textInput}
            value={form.durationText}
            onChangeText={(text) => setForm({ ...form, durationText: text.replace(/[^0-9]/g, "") })}
            keyboardType="number-pad"
            textAlign="right"
          />

          <Text style={styles.fieldLabel}>יעד שבועי (ביצועים)</Text>
          <TextInput
            style={styles.textInput}
            value={form.weeklyTargetText}
            onChangeText={(text) => setForm({ ...form, weeklyTargetText: text.replace(/[^0-9]/g, "") })}
            keyboardType="number-pad"
            placeholder="3"
            textAlign="right"
          />

          <Text style={styles.fieldLabel}>טריגר (רשות)</Text>
          <View style={styles.chipRow}>
            {triggers.map((trigger) => (
              <Pressable
                key={trigger.id}
                style={[styles.chip, form.triggerId === trigger.id && styles.chipSelected]}
                onPress={() => setForm({ ...form, triggerId: trigger.id })}
              >
                <Text style={styles.chipText}>{trigger.text}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipRow}>
            {(Object.keys(ARC_LINK_TRIGGER_TYPE_LABELS) as ArcLinkTriggerType[]).map((type) => (
              <Pressable key={type} style={[styles.chip, newTriggerType === type && styles.chipSelected]} onPress={() => setNewTriggerType(type)}>
                <Text style={styles.chipText}>{ARC_LINK_TRIGGER_TYPE_LABELS[type]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.inlineAddRow}>
            <TextInput style={styles.textInputFlex} value={newTriggerText} onChangeText={setNewTriggerText} placeholder="טריגר חדש" textAlign="right" />
            <Pressable style={styles.smallAddButton} onPress={handleAddTrigger}>
              <Text style={styles.smallAddButtonText}>הוסף</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>קישור ל-ARC / Mini ARC (רשות)</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, form.linkedProtocolType === "none" && styles.chipSelected]}
              onPress={() => setForm({ ...form, linkedProtocolType: "none", linkedProtocolId: null })}
            >
              <Text style={styles.chipText}>ללא</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, form.linkedProtocolType === "arc" && styles.chipSelected]}
              onPress={() => setForm({ ...form, linkedProtocolType: "arc", linkedProtocolId: null })}
            >
              <Text style={styles.chipText}>ARC</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, form.linkedProtocolType === "mini_arc" && styles.chipSelected]}
              onPress={() => setForm({ ...form, linkedProtocolType: "mini_arc", linkedProtocolId: null })}
            >
              <Text style={styles.chipText}>Mini ARC</Text>
            </Pressable>
          </View>
          {form.linkedProtocolType === "arc" && (
            <View style={styles.chipRow}>
              {arcBuilds.map((build) => (
                <Pressable
                  key={build.id}
                  style={[styles.chip, form.linkedProtocolId === build.id && styles.chipSelected]}
                  onPress={() => setForm({ ...form, linkedProtocolId: build.id })}
                >
                  <Text style={styles.chipText}>{build.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {form.linkedProtocolType === "mini_arc" && (
            <View style={styles.chipRow}>
              {miniArcBuilds.map((build) => (
                <Pressable
                  key={build.id}
                  style={[styles.chip, form.linkedProtocolId === build.id && styles.chipSelected]}
                  onPress={() => setForm({ ...form, linkedProtocolId: build.id })}
                >
                  <Text style={styles.chipText}>{build.name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.stepButtons}>
            <Pressable style={styles.cancelButton} onPress={() => setForm(null)}>
              <Text style={styles.cancelButtonText}>ביטול</Text>
            </Pressable>
            <Pressable style={[styles.saveButton, !form.name.trim() && styles.buttonDisabled]} disabled={!form.name.trim()} onPress={handleSave}>
              <Text style={styles.saveButtonText}>שמור</Text>
            </Pressable>
          </View>
          {form.id && (
            <Pressable style={styles.deleteButton} onPress={() => handleDelete(form.id!)}>
              <Text style={styles.deleteButtonText}>מחק פעולה</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          {loaded && actions.length === 0 && <Text style={styles.emptyText}>עדיין לא נוספו פעולות שבועיות.</Text>}
          {actions.map((action) => {
            const trigger = resolveRoutineTrigger(action.triggerId, triggers);
            const completedThisWeek = countCompletionsThisWeek(action.completedDates);
            const linkedName =
              action.linkedProtocolType === "arc"
                ? arcBuilds.find((b) => b.id === action.linkedProtocolId)?.name
                : action.linkedProtocolType === "mini_arc"
                  ? miniArcBuilds.find((b) => b.id === action.linkedProtocolId)?.name
                  : null;
            return (
              <View key={action.id} style={styles.card}>
                <Text style={styles.cardTitle}>{action.name}</Text>
                {action.days.length > 0 && <Text style={styles.cardRow}>{`ימים: ${formatDaysList(action.days)}`}</Text>}
                {action.times.length > 0 && <Text style={styles.cardRow}>{`שעה: ${action.times.join(", ")}`}</Text>}
                {action.durationMinutes !== null && <Text style={styles.cardRow}>{`משך: ${action.durationMinutes} דקות`}</Text>}
                <Text style={styles.cardRow}>{`טריגר: ${describeTrigger(trigger)}`}</Text>
                <Text style={styles.cardRow}>{`השבוע: ${completedThisWeek} מתוך ${action.weeklyTarget} ביצועים`}</Text>
                {linkedName && <Text style={styles.cardRow}>{`מקושר ל: ${linkedName}`}</Text>}
                <View style={styles.cardActions}>
                  <Pressable style={styles.startButton} onPress={() => handleStart(action)}>
                    <Text style={styles.startButtonText}>התחלת הפעולה</Text>
                  </Pressable>
                  <Pressable style={styles.toggleButton} onPress={() => setForm(formFromWeeklyAction(action))}>
                    <Text style={styles.toggleButtonText}>עריכה</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          <Pressable style={styles.addButton} onPress={() => setForm(emptyWeeklyActionForm())}>
            <Text style={styles.addButtonText}>+ הוסף פעולה שבועית</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ===========================================================================
// Section 2: ARC Link -- Build and Manage ("בניית וניהול ARC Link")
// ===========================================================================

type LinkFilter = "all" | "arc" | "mini_arc";

function ArcLinkManageSection() {
  const [links, setLinks] = useState<ArcLink[]>([]);
  const [arcBuilds, setArcBuilds] = useState<ArcBuild[]>([]);
  const [miniArcBuilds, setMiniArcBuilds] = useState<MiniArcBuild[]>([]);
  const [weeklyActions, setWeeklyActions] = useState<WeeklyAction[]>([]);
  const [triggers, setTriggers] = useState<RoutineTrigger[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<LinkFilter>("all");
  const [building, setBuilding] = useState<{ protocolType: "arc" | "mini_arc"; editingLink: ArcLink | null } | null>(null);

  const reload = useCallback(() => {
    Promise.all([loadArcLinks(), loadArcBuilds(), loadMiniArcBuilds(), loadWeeklyActions(), loadRoutineTriggers()]).then(
      ([loadedLinks, loadedArc, loadedMini, loadedActions, loadedTriggers]) => {
        setLinks(loadedLinks);
        setArcBuilds(loadedArc);
        setMiniArcBuilds(loadedMini);
        setWeeklyActions(loadedActions);
        setTriggers(loadedTriggers);
        setLoaded(true);
      }
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleToggleEnabled(link: ArcLink) {
    await upsertArcLink({ ...link, enabled: !link.enabled, updatedAt: new Date().toISOString() });
    reload();
  }

  const visibleLinks = links.filter((link) => filter === "all" || link.protocolType === filter);

  if (building) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{building.protocolType === "arc" ? "בניית ARC Link" : "בניית Mini ARC Link"}</Text>
        <ArcLinkBuildForm
          protocolType={building.protocolType}
          editingLink={building.editingLink}
          arcBuilds={arcBuilds}
          miniArcBuilds={miniArcBuilds}
          weeklyActions={weeklyActions}
          triggers={triggers}
          onSaved={() => {
            setBuilding(null);
            reload();
          }}
          onCancel={() => setBuilding(null)}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>בניית וניהול ARC Link</Text>
      <Text style={styles.sectionDescription}>חבר בין טריגר, פרוטוקול קיים ופעולה שבועית.</Text>

      <View style={styles.stepButtons}>
        <Pressable style={styles.saveButton} onPress={() => setBuilding({ protocolType: "arc", editingLink: null })}>
          <Text style={styles.saveButtonText}>+ בניית ARC Link</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={() => setBuilding({ protocolType: "mini_arc", editingLink: null })}>
          <Text style={styles.saveButtonText}>+ בניית Mini ARC Link</Text>
        </Pressable>
      </View>

      <Text style={styles.subheading}>הקישורים שלי</Text>
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, filter === "all" && styles.chipSelected]} onPress={() => setFilter("all")}>
          <Text style={styles.chipText}>הכול</Text>
        </Pressable>
        <Pressable style={[styles.chip, filter === "arc" && styles.chipSelected]} onPress={() => setFilter("arc")}>
          <Text style={styles.chipText}>ARC Link</Text>
        </Pressable>
        <Pressable style={[styles.chip, filter === "mini_arc" && styles.chipSelected]} onPress={() => setFilter("mini_arc")}>
          <Text style={styles.chipText}>Mini ARC Link</Text>
        </Pressable>
      </View>

      {loaded && visibleLinks.length === 0 && <Text style={styles.emptyText}>עדיין אין קישורים שמורים.</Text>}
      {visibleLinks.map((link) => {
        const protocolName =
          link.protocolType === "arc"
            ? arcBuilds.find((b) => b.id === link.protocolId)?.name ?? "פרוטוקול לא נמצא"
            : miniArcBuilds.find((b) => b.id === link.protocolId)?.name ?? "פרוטוקול לא נמצא";
        const weeklyAction = resolveWeeklyAction(link.weeklyActionId, weeklyActions);
        const trigger = resolveRoutineTrigger(link.triggerId, triggers);
        return (
          <View key={link.id} style={styles.card}>
            <Text style={styles.cardTitle}>{link.protocolType === "arc" ? `ARC Link – ${protocolName}` : `Mini ARC Link – ${protocolName}`}</Text>
            <Text style={styles.cardRow}>{`פעולה שבועית: ${weeklyAction?.name ?? "לא נמצאה"}`}</Text>
            <Text style={styles.cardRow}>{`טריגר: ${describeTrigger(trigger)}`}</Text>
            <Text style={styles.cardRow}>{link.mode === "with_archi" ? "אופן התרגול: עם ARCHI" : "אופן התרגול: ללא ARCHI"}</Text>
            <Text style={styles.cardRow}>{link.enabled ? "סטטוס: פעיל" : "סטטוס: מושבת"}</Text>

            <View style={styles.cardActions}>
              <Pressable
                style={styles.startButton}
                onPress={() =>
                  router.push(
                    link.protocolType === "arc"
                      ? { pathname: "/arc-link/[id]", params: { id: link.protocolId, linkId: link.id } }
                      : { pathname: "/mini-arc-link/[id]", params: { id: link.protocolId, linkId: link.id } }
                  )
                }
              >
                <Text style={styles.startButtonText}>מעבר לתרגול</Text>
              </Pressable>
              <Pressable style={styles.toggleButton} onPress={() => setBuilding({ protocolType: link.protocolType, editingLink: link })}>
                <Text style={styles.toggleButtonText}>עריכה</Text>
              </Pressable>
              <Pressable style={styles.toggleButton} onPress={() => handleToggleEnabled(link)}>
                <Text style={styles.toggleButtonText}>{link.enabled ? "השבתה" : "הפעלה"}</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.shortcutLink}
              onPress={() =>
                router.push(
                  link.protocolType === "arc" ? { pathname: "/build/[id]", params: { id: link.protocolId } } : { pathname: "/mini-arc/[id]", params: { id: link.protocolId } }
                )
              }
            >
              <Text style={styles.shortcutLinkText}>{link.protocolType === "arc" ? "עריכת ה-ARC ב-BUILD" : "עריכת ה-Mini ARC ב-BUILD"}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// ===========================================================================
// Section 3: ARC Link Practice ("תרגול ARC Link")
// ===========================================================================

function ArcLinkPracticeSection() {
  const [links, setLinks] = useState<ArcLink[]>([]);
  const [arcBuilds, setArcBuilds] = useState<ArcBuild[]>([]);
  const [miniArcBuilds, setMiniArcBuilds] = useState<MiniArcBuild[]>([]);
  const [triggers, setTriggers] = useState<RoutineTrigger[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<LinkFilter>("all");

  const reload = useCallback(() => {
    Promise.all([loadArcLinks(), loadArcBuilds(), loadMiniArcBuilds(), loadRoutineTriggers()]).then(([loadedLinks, loadedArc, loadedMini, loadedTriggers]) => {
      setLinks(loadedLinks.filter((link) => link.enabled));
      setArcBuilds(loadedArc);
      setMiniArcBuilds(loadedMini);
      setTriggers(loadedTriggers);
      setLoaded(true);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const visibleLinks = links.filter((link) => filter === "all" || link.protocolType === filter);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>תרגול ARC Link</Text>
      <Text style={styles.sectionDescription}>בחר את הקישור שתרצה לחזק עכשיו.</Text>

      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, filter === "all" && styles.chipSelected]} onPress={() => setFilter("all")}>
          <Text style={styles.chipText}>הכול</Text>
        </Pressable>
        <Pressable style={[styles.chip, filter === "arc" && styles.chipSelected]} onPress={() => setFilter("arc")}>
          <Text style={styles.chipText}>ARC Link</Text>
        </Pressable>
        <Pressable style={[styles.chip, filter === "mini_arc" && styles.chipSelected]} onPress={() => setFilter("mini_arc")}>
          <Text style={styles.chipText}>Mini ARC Link</Text>
        </Pressable>
      </View>

      {loaded && visibleLinks.length === 0 && <Text style={styles.emptyText}>אין קישורים פעילים לתרגול כרגע.</Text>}
      {visibleLinks.map((link) => {
        const protocolName =
          link.protocolType === "arc"
            ? arcBuilds.find((b) => b.id === link.protocolId)?.name ?? "פרוטוקול לא נמצא"
            : miniArcBuilds.find((b) => b.id === link.protocolId)?.name ?? "פרוטוקול לא נמצא";
        const beneficialAction =
          link.protocolType === "arc"
            ? (() => {
                const profile = arcBuilds.find((b) => b.id === link.protocolId)?.profile;
                return profile?.internalAction || profile?.identityAction || profile?.beneficialAction || "";
              })()
            : miniArcBuilds.find((b) => b.id === link.protocolId)?.beneficialAction ?? "";
        const trigger = resolveRoutineTrigger(link.triggerId, triggers);
        const completedThisWeek = countCompletionsThisWeek(link.completedPracticeDates);
        const schedule = arcLinkPracticeSchedule(link);
        let nextPractice: string | null = null;
        if (schedule) {
          const today = resolveTodayOccurrenceDate(schedule);
          const now = new Date();
          if (today && today.getTime() >= now.getTime()) {
            nextPractice = `היום בשעה ${formatHm(today.getHours(), today.getMinutes())}`;
          } else {
            const next = resolveNextOccurrenceDate(schedule);
            nextPractice = next ? formatOccurrence(next) : null;
          }
        }

        return (
          <View key={link.id} style={styles.card}>
            <Text style={styles.cardTitle}>{link.protocolType === "arc" ? `ARC Link – ${protocolName}` : `Mini ARC Link – ${protocolName}`}</Text>
            <Text style={styles.cardRow}>{`טריגר: ${describeTrigger(trigger)}`}</Text>
            {beneficialAction && <Text style={styles.cardRow}>{`פעולה: ${beneficialAction}`}</Text>}
            <Text style={styles.cardRow}>{link.mode === "with_archi" ? "אופן התרגול: עם ARCHI" : "אופן התרגול: ללא ARCHI"}</Text>
            {nextPractice && <Text style={styles.cardRow}>{`התרגול הבא: ${nextPractice}`}</Text>}
            {link.weeklyTarget !== null && <Text style={styles.cardRow}>{`השבוע: ${completedThisWeek} מתוך ${link.weeklyTarget} תרגולים`}</Text>}

            <Pressable
              style={[styles.startButton, styles.fullWidthButton]}
              onPress={() =>
                router.push(
                  link.protocolType === "arc"
                    ? { pathname: "/arc-link/[id]", params: { id: link.protocolId, linkId: link.id } }
                    : { pathname: "/mini-arc-link/[id]", params: { id: link.protocolId, linkId: link.id } }
                )
              }
            >
              <Text style={styles.startButtonText}>התחלת התרגול</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// ===========================================================================
// Existing "השגרה שלי" section (Multiple Scheduled ARC + Success Focus
// Routines) -- extracted verbatim, ZERO behavior changes. Only its own
// outer SafeAreaView/ScrollView/back-link were removed since it's now
// nested inside this page's single outer scroll view.
// ===========================================================================

const STATUS_LABELS: Record<RoutineStatus, string> = {
  completed: "הושלם ✓",
  dueOrOverdue: "ממתין",
  upcoming: "בהמשך",
  disabled: "מושבת",
  noOccurrenceToday: "אין היום",
};

interface RoutineFormState {
  id: string | null; // null = creating a new routine
  title: string;
  hourText: string;
  minuteText: string;
  recurrenceDays: number[];
  successFocusDurationMinutes: number;
  notificationsEnabled: boolean;
  enabled: boolean;
}

function emptyForm(): RoutineFormState {
  return {
    id: null,
    title: "",
    hourText: "08",
    minuteText: "00",
    recurrenceDays: [],
    successFocusDurationMinutes: 10,
    notificationsEnabled: true,
    enabled: true,
  };
}

function formFromRoutine(routine: ScheduledRoutine): RoutineFormState {
  return {
    id: routine.id,
    title: routine.title,
    hourText: pad2(routine.hour),
    minuteText: pad2(routine.minute),
    recurrenceDays: routine.recurrenceDays,
    successFocusDurationMinutes: routine.successFocusDurationMinutes,
    notificationsEnabled: routine.notificationsEnabled,
    enabled: routine.enabled,
  };
}

/** Clamps free-typed hour/minute text into a valid wall-clock value -- never NaN, never out of range, so an in-progress or malformed edit can't produce an invalid schedule. */
function parseClampedTimePart(text: string, max: number): number {
  const parsed = Number.parseInt(text, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
}

function ScheduledRoutinesSection() {
  const [routines, setRoutines] = useState<ScheduledRoutine[]>([]);
  const [completions, setCompletions] = useState<RoutineOccurrenceCompletion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<RoutineFormState | null>(null);

  const reload = useCallback(() => {
    // reconcileRoutineNotifications both refreshes any stale/missing
    // per-routine notification AND returns the current routine list --
    // one round trip, always the freshest data/notifications state.
    Promise.all([reconcileRoutineNotifications(), loadRoutineOccurrenceCompletions()]).then(([reconciledRoutines, loadedCompletions]) => {
      setRoutines(reconciledRoutines);
      setCompletions(loadedCompletions);
      setLoaded(true);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function persistRoutines(next: ScheduledRoutine[]) {
    await saveScheduledRoutines(next);
    setRoutines(next);
  }

  async function handleSaveForm() {
    if (!form) return;
    const title = form.title.trim();
    if (title.length === 0 || form.recurrenceDays.length === 0) return;
    const hour = parseClampedTimePart(form.hourText, 23);
    const minute = parseClampedTimePart(form.minuteText, 59);

    const existing = form.id ? (await loadScheduledRoutines()).find((item) => item.id === form.id) ?? null : null;
    const base: ScheduledRoutine = existing ?? {
      id: generateRoutineId(),
      title,
      hour,
      minute,
      recurrenceDays: form.recurrenceDays,
      successFocusDurationMinutes: form.successFocusDurationMinutes,
      notificationsEnabled: form.notificationsEnabled,
      enabled: form.enabled,
      nextOccurrenceNotificationId: null,
      nextOccurrenceScheduledFor: null,
      createdAt: new Date().toISOString(),
    };
    const updated: ScheduledRoutine = {
      ...base,
      title,
      hour,
      minute,
      recurrenceDays: form.recurrenceDays,
      successFocusDurationMinutes: form.successFocusDurationMinutes,
      notificationsEnabled: form.notificationsEnabled,
      enabled: form.enabled,
    };
    const rescheduled = await rescheduleRoutineNotification(updated);

    const current = await loadScheduledRoutines();
    const next = existing
      ? current.map((item) => (item.id === rescheduled.id ? rescheduled : item))
      : [...current, rescheduled];
    await persistRoutines(next);
    setForm(null);
  }

  async function handleDelete(routine: ScheduledRoutine) {
    await cancelRoutineNotification(routine);
    const current = await loadScheduledRoutines();
    await persistRoutines(current.filter((item) => item.id !== routine.id));
    setForm(null);
  }

  async function handleToggleEnabled(routine: ScheduledRoutine) {
    const updated = await rescheduleRoutineNotification({ ...routine, enabled: !routine.enabled });
    const current = await loadScheduledRoutines();
    await persistRoutines(current.map((item) => (item.id === updated.id ? updated : item)));
  }

  function startRoutineNow(routine: ScheduledRoutine) {
    router.push({ pathname: "/live", params: { routineId: routine.id } });
  }

  const items: RoutineListItem[] = sortRoutineListItems(buildRoutineListItems(routines, completions));

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>השגרה שלי</Text>

      {form ? (
        <RoutineForm
          form={form}
          onChange={setForm}
          onSave={handleSaveForm}
          onCancel={() => setForm(null)}
          onDelete={form.id ? () => handleDelete(routines.find((item) => item.id === form.id)!) : undefined}
        />
      ) : (
        <>
          {loaded && items.length === 0 && <Text style={styles.emptyText}>עדיין לא נוספה שגרה.</Text>}
          {items.map((item) => (
            <RoutineRow
              key={item.routine.id}
              item={item}
              onPress={() => setForm(formFromRoutine(item.routine))}
              onStartNow={() => startRoutineNow(item.routine)}
              onToggleEnabled={() => handleToggleEnabled(item.routine)}
            />
          ))}
          <Pressable style={styles.addButton} onPress={() => setForm(emptyForm())}>
            <Text style={styles.addButtonText}>+ הוסף שגרה</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function RoutineRow({
  item,
  onPress,
  onStartNow,
  onToggleEnabled,
}: {
  item: RoutineListItem;
  onPress: () => void;
  onStartNow: () => void;
  onToggleEnabled: () => void;
}) {
  const { routine, status } = item;
  const canStartNow = status === "dueOrOverdue" || status === "upcoming";
  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={onPress}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowTime}>{formatHm(routine.hour, routine.minute)}</Text>
          <Text style={styles.rowTitle}>{routine.title}</Text>
          <Text style={styles.rowStatus}>{STATUS_LABELS[status]}</Text>
        </View>
        <Text style={styles.rowNextOccurrence}>
          {item.nextOccurrenceDate ? `הבא בתור: ${formatOccurrence(item.nextOccurrenceDate)}` : "אין מועד קרוב מוגדר"}
        </Text>
      </Pressable>
      <View style={styles.rowActions}>
        {canStartNow && (
          <Pressable style={styles.startButton} onPress={onStartNow}>
            <Text style={styles.startButtonText}>התחל עכשיו</Text>
          </Pressable>
        )}
        <Pressable style={styles.toggleButton} onPress={onToggleEnabled}>
          <Text style={styles.toggleButtonText}>{routine.enabled ? "השבת" : "הפעל"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RoutineForm({
  form,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  form: RoutineFormState;
  onChange: (form: RoutineFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  function toggleDay(day: number) {
    const has = form.recurrenceDays.includes(day);
    onChange({
      ...form,
      recurrenceDays: has ? form.recurrenceDays.filter((d) => d !== day) : [...form.recurrenceDays, day].sort(),
    });
  }

  const canSave = form.title.trim().length > 0 && form.recurrenceDays.length > 0;

  return (
    <View>
      <Text style={styles.fieldLabel}>שם השגרה</Text>
      <TextInput
        style={styles.textInput}
        value={form.title}
        onChangeText={(text) => onChange({ ...form, title: text })}
        placeholder="לדוגמה: מיקוד בוקר"
        textAlign="right"
      />

      <Text style={styles.fieldLabel}>שעה מקומית</Text>
      <View style={styles.timeRow}>
        <TextInput
          style={styles.timeInput}
          value={form.hourText}
          onChangeText={(text) => onChange({ ...form, hourText: text.replace(/[^0-9]/g, "") })}
          keyboardType="number-pad"
          maxLength={2}
          textAlign="center"
        />
        <Text style={styles.timeSeparator}>:</Text>
        <TextInput
          style={styles.timeInput}
          value={form.minuteText}
          onChangeText={(text) => onChange({ ...form, minuteText: text.replace(/[^0-9]/g, "") })}
          keyboardType="number-pad"
          maxLength={2}
          textAlign="center"
        />
      </View>

      <Text style={styles.fieldLabel}>ימי חזרה</Text>
      <View style={styles.chipRow}>
        {DAY_LABELS.map((label, day) => (
          <Pressable
            key={day}
            style={[styles.chip, form.recurrenceDays.includes(day) && styles.chipSelected]}
            onPress={() => toggleDay(day)}
          >
            <Text style={styles.chipText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>משך התמקדות בהצלחה</Text>
      <View style={styles.chipRow}>
        {SUCCESS_FOCUS_DURATION_OPTIONS.map((minutes) => (
          <Pressable
            key={minutes}
            style={[styles.chip, form.successFocusDurationMinutes === minutes && styles.chipSelected]}
            onPress={() => onChange({ ...form, successFocusDurationMinutes: minutes })}
          >
            <Text style={styles.chipText}>{minutes} דק&apos;</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>התראות</Text>
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, form.notificationsEnabled && styles.chipSelected]}
          onPress={() => onChange({ ...form, notificationsEnabled: true })}
        >
          <Text style={styles.chipText}>מופעלות</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, !form.notificationsEnabled && styles.chipSelected]}
          onPress={() => onChange({ ...form, notificationsEnabled: false })}
        >
          <Text style={styles.chipText}>כבויות</Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>מצב</Text>
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, form.enabled && styles.chipSelected]} onPress={() => onChange({ ...form, enabled: true })}>
          <Text style={styles.chipText}>פעילה</Text>
        </Pressable>
        <Pressable style={[styles.chip, !form.enabled && styles.chipSelected]} onPress={() => onChange({ ...form, enabled: false })}>
          <Text style={styles.chipText}>מושבתת</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.saveButton, !canSave && styles.buttonDisabled]} onPress={canSave ? onSave : undefined} disabled={!canSave}>
        <Text style={styles.saveButtonText}>שמור</Text>
      </Pressable>
      <Pressable style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>ביטול</Text>
      </Pressable>
      {onDelete && (
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteButtonText}>מחק שגרה</Text>
        </Pressable>
      )}
    </View>
  );
}

// ===========================================================================
// Page
// ===========================================================================

export default function RoutinesScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>השגרה</Text>

        <WeeklyActionsSection />
        <View style={styles.sectionDivider} />
        <ArcLinkManageSection />
        <View style={styles.sectionDivider} />
        <ArcLinkPracticeSection />
        <View style={styles.sectionDivider} />
        <ScheduledRoutinesSection />

        <Link href="/" style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה לדף הבית</Text>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flexGrow: 1,
    padding: 24,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 20,
  },
  section: {
    marginBottom: 8,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 6,
    color: "#0a7ea4",
  },
  sectionDescription: {
    fontSize: 14,
    textAlign: "right",
    color: "#666",
    marginBottom: 14,
  },
  subheading: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
    marginTop: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "right",
    color: "#666",
    marginBottom: 16,
  },
  row: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  rowMain: {
    marginBottom: 8,
  },
  rowHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTime: {
    fontSize: 17,
    fontWeight: "700",
  },
  rowTitle: {
    fontSize: 16,
    flex: 1,
    textAlign: "right",
    marginHorizontal: 8,
  },
  rowStatus: {
    fontSize: 14,
    color: "#0a7ea4",
    fontWeight: "600",
  },
  rowNextOccurrence: {
    fontSize: 13,
    color: "#666",
    textAlign: "right",
    marginTop: 4,
  },
  rowActions: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  card: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginBottom: 6 },
  cardRow: { fontSize: 14, textAlign: "right", color: "#333", marginBottom: 2 },
  cardActions: { flexDirection: "row-reverse", gap: 8, marginTop: 10, flexWrap: "wrap" },
  shortcutLink: { marginTop: 10, alignItems: "flex-end" },
  shortcutLinkText: { color: "#0a7ea4", fontSize: 13 },
  startButton: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  startButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  fullWidthButton: { marginTop: 10, alignItems: "center" },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0a7ea4",
  },
  toggleButtonText: {
    color: "#0a7ea4",
    fontWeight: "600",
    fontSize: 14,
  },
  addButton: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  backLink: {
    marginTop: 20,
    alignSelf: "center",
  },
  backLinkText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "right",
    marginBottom: 6,
    marginTop: 14,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textInputFlex: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  inlineAddRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center", marginTop: 6 },
  smallAddButton: { backgroundColor: "#0a7ea4", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  smallAddButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 20,
    width: 64,
  },
  timeSeparator: {
    fontSize: 20,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: "#E6F4FE",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  chipSelected: {
    backgroundColor: "#0a7ea4",
  },
  chipText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  stepButtons: { flexDirection: "row-reverse", gap: 10, marginTop: 16 },
  saveButton: {
    flex: 1,
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
  deleteButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#c0392b",
    fontSize: 15,
  },
});
