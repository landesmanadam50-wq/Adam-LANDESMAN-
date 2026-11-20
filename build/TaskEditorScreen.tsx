import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  addSubtaskToDraft,
  buildTaskFromDraft,
  createEmptyTaskDraft,
  emptyTaskBase,
  removeSubtaskFromDraft,
  selectAllRecurrenceDaysInDraft,
  taskDraftFromTask,
  toggleRecurrenceDayInDraft,
  validateTaskDraft,
} from "../arc/taskDraft.ts";
import type { TaskDraft } from "../arc/taskDraft.ts";
import { archiveTask, generateTaskId, type Task } from "../arc/tasks.ts";
import { getTask, loadArcBuilds, loadArcGoals, loadStateProfiles, loadTaskOccurrenceOverrides, upsertTask, upsertTaskOccurrenceOverrideEntry } from "../data/storage.ts";
import { cancelScheduledNotification } from "../data/notifications.ts";
import { cancelAnyAlarmFor, reconcilePlannedArcAlarms, scheduleTaskAlarm } from "../data/taskAlarm.ts";
import type { ArcBuild } from "../arc/types.ts";
import type { ArcGoal } from "../arc/types.ts";
import { PREPARATION_STATE_IDS, PREPARATION_STATE_LABELS } from "../arc/preparationStates.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import { buildTaskOccurrenceOverride, findTaskOccurrenceOverride, resolveEffectiveOccurrence } from "../arc/taskOccurrenceOverride.ts";
import MonthlyCalendar from "../live/components/MonthlyCalendar.tsx";

const RECURRENCE_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

/** A live, display-only total while the trainee is still typing -- an invalid/partial duration field contributes 0 rather than NaN, never blocking the running total from showing something sensible; the actual saved total is always recomputed properly (arc/taskDraft.ts's buildTaskFromDraft) after validateTaskDraft passes. */
function resolveDraftStageTotalMinutes(draft: TaskDraft): number {
  const triggerMinutes = draft.triggerEnabled ? Number(draft.triggerDurationMinutes) || 0 : 0;
  const smallMinutes = draft.smallEnabled ? Number(draft.smallDurationMinutes) || 0 : 0;
  const mainMinutes = Number(draft.mainDurationMinutes) || 0;
  return triggerMinutes + smallMinutes + mainMinutes;
}

/**
 * build/TaskEditorScreen.tsx (route /tasks/[id]/edit, id === "new" to create)
 *
 * Productivity roadmap, Stage H: the full task creation/editing screen,
 * exposing every field arc/tasks.ts's Task already models. Reached from
 * build/TasksListScreen.tsx's own "+ משימה מלאה" button (for a new
 * task) and live/ActiveTaskScreen.tsx's own "ערוך" button (for an
 * existing one) -- never a second task store: every save goes through
 * the exact same data/storage.ts upsertTask as the quick-create path
 * already on TasksListScreen.tsx, which stays untouched.
 *
 * Linked ArcGoal/ArcBuild are chosen from the trainee's own saved
 * records (loadArcGoals/loadArcBuilds) -- a deterministic pick from a
 * real list, never a free-text id field and never inferred.
 */
export default function TaskEditorScreen({
  id,
  occurrenceDate = null,
  initialScheduledDate = null,
  initialTitle = null,
  initialArcGymGoalId = null,
}: {
  id: string;
  occurrenceDate?: string | null;
  /** Weekly & Daily Routine Redesign task: prefills a brand-new task's own scheduledDate -- e.g. the Flexible Daily Routine's own "+ משימה" direct-add action, for the exact date it was pressed from. Never applies to an EXISTING task (reload() below always overwrites the draft from that task's own real data once it loads), and ignored entirely once `id` isn't "new". */
  initialScheduledDate?: string | null;
  /** ARC Decision task: prefills a brand-new task's own title from a chosen decision option -- e.g. ARC Gym's own "הפוך את ההחלטה למשימה" action. Same isNew-only, never-auto-saves rule as initialScheduledDate above -- the trainee still has to review/confirm and explicitly press "יצירת משימה". */
  initialTitle?: string | null;
  /** ARC Gym + ARC Goal Integration task: links a brand-new task to its ArcGymGoal, the same way an existing task's own arcGymGoalId already survives every save (buildTaskFromDraft spreads `...base` and never overrides this field) -- here `base` for a NEW task is built from this value instead of arc/tasks.ts's own always-null default. Never applies to an EXISTING task and ignored once `id` isn't "new", same rule as the two props above. */
  initialArcGymGoalId?: string | null;
}) {
  const isNew = id === "new";
  const [existingTask, setExistingTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() =>
    isNew ? { ...createEmptyTaskDraft(), ...(initialScheduledDate ? { scheduledDate: initialScheduledDate } : {}), ...(initialTitle ? { title: initialTitle } : {}) } : createEmptyTaskDraft()
  );
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [arcGoals, setArcGoals] = useState<ArcGoal[]>([]);
  const [arcBuilds, setArcBuilds] = useState<ArcBuild[]>([]);
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // Fixed Weekly Routine / Flexible Daily Routine task, "One Unified Task
  // Editor" requirement: editing a recurring (weekly-origin) task FROM the
  // Flexible Daily Routine edits only that one date's occurrence, via the
  // SAME screen/route (never a second, competing editor) -- scoped to just
  // time/duration, since the spec's own per-date actions are limited to
  // remove/retime/reduration/reorder/add/replace, never a per-date title or
  // first-action edit. isOverrideMode is only ever true for an EXISTING
  // recurring task reached with an occurrenceDate param; a brand-new task,
  // or editing the Fixed Weekly Routine's own template (no occurrenceDate),
  // both fall through to the full editor below completely unchanged.
  const isOverrideMode = !isNew && occurrenceDate !== null && existingTask !== null && existingTask.recurrence.kind === "recurring";
  const [overrideTime, setOverrideTime] = useState("");
  const [overrideDuration, setOverrideDuration] = useState("");
  /** ARCHI -- Unified Development Specification task, Part 7 ("MONTHLY
   * CALENDAR FOR ALL TASKS"): opens the SAME live/components/MonthlyCalendar
   * used elsewhere (InsightDetailScreen's own task-creation mini-form) --
   * never a second grid implementation. The plain "YYYY-MM-DD" TextInput
   * below stays as a manual-entry fallback; this just gives a picker on
   * top of it, writing to the exact same draft.scheduledDate field. */
  const [showDateCalendar, setShowDateCalendar] = useState(false);

  const reload = useCallback(() => {
    Promise.all([
      isNew ? Promise.resolve(null) : getTask(id),
      loadArcGoals(),
      loadArcBuilds(),
      loadStateProfiles(),
      occurrenceDate ? loadTaskOccurrenceOverrides() : Promise.resolve([]),
    ]).then(([task, goals, builds, profiles, overrides]) => {
      setArcGoals(goals);
      setArcBuilds(builds);
      setStateProfiles(profiles);
      if (task) {
        setExistingTask(task);
        setDraft(taskDraftFromTask(task));
        if (occurrenceDate && task.recurrence.kind === "recurring") {
          const effective = resolveEffectiveOccurrence(task, occurrenceDate, overrides);
          setOverrideTime(effective.scheduledTime ?? "");
          setOverrideDuration(effective.expectedDurationMinutes !== null ? String(effective.expectedDurationMinutes) : "");
        }
      }
      setLoaded(true);
    });
  }, [id, isNew, occurrenceDate]);

  useFocusEffect(reload);

  async function handleOverrideSave() {
    if (!existingTask || !occurrenceDate) return;
    const overrides = await loadTaskOccurrenceOverrides();
    const existingOverride = findTaskOccurrenceOverride(existingTask.id, occurrenceDate, overrides);
    const patch = {
      scheduledTime: overrideTime.trim() || null,
      expectedDurationMinutes: overrideDuration.trim() ? Number(overrideDuration) || null : null,
    };
    const next = buildTaskOccurrenceOverride(existingTask, occurrenceDate, existingOverride, patch, new Date().toISOString());
    await upsertTaskOccurrenceOverrideEntry(next);
    // Flexible Daily Routine task, integration fix: a retime/re-duration
    // override is only meaningful if the task's own alarm (if it's
    // still "planned") actually re-syncs to it immediately -- the same
    // "re-sync right after save" discipline handleSave below already
    // follows for the Fixed Weekly Routine template itself. Without
    // this, an alarm already armed for the template's original time
    // would keep ringing at the WRONG time even though the screen now
    // shows the override.
    const reconciledTask = existingTask.status === "planned" ? await scheduleTaskAlarm(existingTask, new Date()) : existingTask;
    if (reconciledTask !== existingTask) await upsertTask(reconciledTask);
    router.back();
  }

  async function handleSave() {
    const validationErrors = validateTaskDraft(draft);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    const base = existingTask ?? { ...emptyTaskBase(generateTaskId(), new Date().toISOString()), arcGymGoalId: initialArcGymGoalId };
    const saved = buildTaskFromDraft(draft, base, new Date().toISOString());
    // Productivity upgrade task, requirement 2: the schedule the trainee
    // just saved (date/time/recurrence) may have changed what "it's time
    // to start" alarm, if any, this task should have -- reconciled right
    // here so editing a task's time always re-syncs it immediately,
    // never waiting for Today's own next focus-triggered reconcile. Only
    // for a "planned" task: an active/paused/postponed/completed task's
    // existing notificationId (e.g. a postponed-return reminder) belongs
    // to a different concern and must never be touched here.
    const withStartNotification = saved.status === "planned" ? await scheduleTaskAlarm(saved, new Date()) : saved;
    await upsertTask(withStartNotification);
    // ARC alarm task, section 1.א/7: this save may have just changed
    // the very schedule a "before_task" ARC alarm linked to THIS task
    // depends on (scheduledTime/scheduledDate/recurrence/
    // arcWindowMinutesBefore) -- reconciled immediately, same
    // "re-sync right after save" discipline as scheduleTaskAlarm above,
    // never left waiting for Today's own next focus.
    await reconcilePlannedArcAlarms(new Date());
    router.replace({ pathname: "/tasks/[id]", params: { id: saved.id } });
  }

  async function handleArchive() {
    if (!existingTask) return;
    if (existingTask.notificationId) await cancelScheduledNotification(existingTask.notificationId);
    // Alarm-automation task, requirement 4 ("מחיקת משימה -- ביטול
    // השעון"): cancelScheduledNotification above only knows about
    // expo-notifications' own reminders -- the real native alarm needs
    // its own cancellation, same fix as handleComplete/handleSkipTask,
    // or an archived task's alarm stays armed and fires anyway.
    await cancelAnyAlarmFor(existingTask.id);
    const now = new Date().toISOString();
    await upsertTask({ ...archiveTask(existingTask, now), notificationId: null, notificationScheduledFor: null });
    // ARC alarm task, section 1.א: archiving is this app's own "task
    // deleted/unscheduled" -- any "before_task" ARC alarm linked to it
    // must be disarmed immediately too, not just on Today's next focus.
    await reconcilePlannedArcAlarms(new Date());
    setConfirmArchive(false);
    router.replace("/tasks");
  }

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isOverrideMode) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>עריכת היום הזה בלבד</Text>
          <Text style={styles.hint}>{existingTask!.title} -- השינוי יחול רק על התאריך הזה; השבוע הקבוע לא ישתנה.</Text>
          <Field label="שעה (לתאריך זה בלבד)">
            <TextInput style={styles.textInput} value={overrideTime} onChangeText={setOverrideTime} textAlign="right" placeholder="HH:MM" />
          </Field>
          <Field label="משך בדקות (לתאריך זה בלבד)">
            <TextInput style={styles.textInput} value={overrideDuration} onChangeText={setOverrideDuration} textAlign="right" keyboardType="numeric" />
          </Field>
          <Pressable style={styles.primaryButton} onPress={handleOverrideSave}>
            <Text style={styles.primaryButtonText}>שמירה להיום</Text>
          </Pressable>
          <Pressable style={styles.overrideCancelButton} onPress={() => router.back()}>
            <Text style={styles.overrideCancelButtonText}>ביטול</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isNew ? "משימה חדשה" : "עריכת משימה"}</Text>

        {errors.map((error) => (
          <Text key={error} style={styles.errorText}>
            {error}
          </Text>
        ))}

        <Field label="כותרת">
          <TextInput style={styles.textInput} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} textAlign="right" />
        </Field>

        <Field label="סוג משימה">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, draft.taskKind === "standard" && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, taskKind: "standard" })}
            >
              <Text style={styles.chipText}>רגילה</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, draft.taskKind === "manifest" && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, taskKind: "manifest" })}
            >
              <Text style={styles.chipText}>Manifest</Text>
            </Pressable>
          </View>
        </Field>

        {draft.taskKind === "manifest" && (
          <>
            <Field label="מטרה ארוכת טווח">
              <TextInput
                style={styles.textInput}
                value={draft.manifestLongTermGoal}
                onChangeText={(manifestLongTermGoal) => setDraft({ ...draft, manifestLongTermGoal })}
                textAlign="right"
              />
            </Field>
            <Field label="התוצאה הרצויה">
              <TextInput
                style={styles.textInput}
                value={draft.manifestDesiredResult}
                onChangeText={(manifestDesiredResult) => setDraft({ ...draft, manifestDesiredResult })}
                textAlign="right"
              />
            </Field>
            <Field label="הזהות שתרצה לפתח">
              <TextInput
                style={styles.textInput}
                value={draft.manifestDesiredIdentity}
                onChangeText={(manifestDesiredIdentity) => setDraft({ ...draft, manifestDesiredIdentity })}
                textAlign="right"
              />
            </Field>
            <Field label="שפת הגוף המאפיינת את הזהות הרצויה">
              <TextInput
                style={styles.textInput}
                value={draft.manifestBodyLanguageDescription}
                onChangeText={(manifestBodyLanguageDescription) => setDraft({ ...draft, manifestBodyLanguageDescription })}
                textAlign="right"
                multiline
              />
            </Field>
          </>
        )}

        <Field label="תיאור (רשות)">
          <TextInput
            style={styles.textInput}
            value={draft.description}
            onChangeText={(description) => setDraft({ ...draft, description })}
            textAlign="right"
            multiline
          />
        </Field>

        <Field label="מיקום (רשות)">
          <TextInput style={styles.textInput} value={draft.location} onChangeText={(location) => setDraft({ ...draft, location })} textAlign="right" />
        </Field>

        <Field label="פעולה פיזית ראשונה">
          <TextInput
            style={styles.textInput}
            value={draft.firstAction}
            onChangeText={(firstAction) => setDraft({ ...draft, firstAction })}
            textAlign="right"
          />
        </Field>

        <Field label="תאריך מתוכנן (YYYY-MM-DD, רשות)">
          <TextInput
            style={styles.textInput}
            value={draft.scheduledDate}
            onChangeText={(scheduledDate) => setDraft({ ...draft, scheduledDate })}
            textAlign="right"
            placeholder="2026-01-15"
          />
          <Pressable style={styles.calendarLinkButton} onPress={() => setShowDateCalendar(true)}>
            <Text style={styles.calendarLinkButtonText}>בחירה מלוח שנה</Text>
          </Pressable>
        </Field>

        <Field label="שעה מתוכננת (HH:MM, רשות)">
          <TextInput
            style={styles.textInput}
            value={draft.scheduledTime}
            onChangeText={(scheduledTime) => setDraft({ ...draft, scheduledTime })}
            textAlign="right"
            placeholder="09:30"
          />
        </Field>

        {!draft.stagesEnabled && (
          <Field label="משך מתוכנן בדקות (רשות)">
            <TextInput
              style={styles.textInput}
              value={draft.expectedDurationMinutes}
              onChangeText={(expectedDurationMinutes) => setDraft({ ...draft, expectedDurationMinutes })}
              textAlign="right"
              keyboardType="number-pad"
            />
          </Field>
        )}

        {/*
          Unified Task Stages task: an OPTIONAL breakdown of this task
          into up to three sequential action stages -- environmental
          trigger (optional), small action (optional), main action
          (always present once this is turned on at all). Turning
          stages OFF (the default, and every pre-existing task) hides
          this whole block and restores the plain single duration field
          above exactly as before this task. While stages are ON, the
          overall "משך מתוכנן" is the SUM of the stages' own durations
          (requirement 3's own worked example, 2+3+25=30) -- computed
          and saved automatically (arc/taskDraft.ts's buildTaskFromDraft),
          never a second, independently-editable number that could drift
          out of sync with the stages themselves.
        */}
        <Field label="פיצול המשימה לשלבי פעולה (רשות)">
          <View style={styles.chipRow}>
            <Pressable style={[styles.chip, !draft.stagesEnabled && styles.chipSelected]} onPress={() => setDraft({ ...draft, stagesEnabled: false })}>
              <Text style={styles.chipText}>פעולה אחת (ללא שלבים)</Text>
            </Pressable>
            <Pressable style={[styles.chip, draft.stagesEnabled && styles.chipSelected]} onPress={() => setDraft({ ...draft, stagesEnabled: true })}>
              <Text style={styles.chipText}>פיצול לשלבים</Text>
            </Pressable>
          </View>
        </Field>

        {draft.stagesEnabled && (
          <View style={styles.stagesBlock}>
            <View style={styles.stageCard}>
              <Text style={styles.stageCardTitle}>שלב 1: פעולה שיוצרת טריגר (רשות)</Text>
              <View style={styles.chipRow}>
                <Pressable style={[styles.chip, !draft.triggerEnabled && styles.chipSelected]} onPress={() => setDraft({ ...draft, triggerEnabled: false })}>
                  <Text style={styles.chipText}>ללא</Text>
                </Pressable>
                <Pressable style={[styles.chip, draft.triggerEnabled && styles.chipSelected]} onPress={() => setDraft({ ...draft, triggerEnabled: true })}>
                  <Text style={styles.chipText}>הוספת פעולת טריגר</Text>
                </Pressable>
              </View>
              {draft.triggerEnabled && (
                <>
                  <Field label="תיאור הפעולה">
                    <TextInput
                      style={styles.textInput}
                      value={draft.triggerDescription}
                      onChangeText={(triggerDescription) => setDraft({ ...draft, triggerDescription })}
                      textAlign="right"
                      placeholder="לדוגמה: לוקח את הספר ומניח אותו על השולחן"
                    />
                  </Field>
                  <Field label="התוצאה הסביבתית (רשות)">
                    <TextInput
                      style={styles.textInput}
                      value={draft.triggerCueDescription}
                      onChangeText={(triggerCueDescription) => setDraft({ ...draft, triggerCueDescription })}
                      textAlign="right"
                      placeholder="לדוגמה: הספר מונח על השולחן"
                    />
                  </Field>
                  <Field label="משך מתוכנן בדקות">
                    <TextInput
                      style={styles.textInput}
                      value={draft.triggerDurationMinutes}
                      onChangeText={(triggerDurationMinutes) => setDraft({ ...draft, triggerDurationMinutes })}
                      textAlign="right"
                      keyboardType="number-pad"
                    />
                  </Field>
                </>
              )}
            </View>

            <View style={styles.stageCard}>
              <Text style={styles.stageCardTitle}>שלב 2: פעולה קטנה (רשות)</Text>
              <View style={styles.chipRow}>
                <Pressable style={[styles.chip, !draft.smallEnabled && styles.chipSelected]} onPress={() => setDraft({ ...draft, smallEnabled: false })}>
                  <Text style={styles.chipText}>ללא</Text>
                </Pressable>
                <Pressable style={[styles.chip, draft.smallEnabled && styles.chipSelected]} onPress={() => setDraft({ ...draft, smallEnabled: true })}>
                  <Text style={styles.chipText}>הוספת פעולה קטנה</Text>
                </Pressable>
              </View>
              {draft.smallEnabled && (
                <>
                  <Field label="תיאור הפעולה">
                    <TextInput
                      style={styles.textInput}
                      value={draft.smallDescription}
                      onChangeText={(smallDescription) => setDraft({ ...draft, smallDescription })}
                      textAlign="right"
                      placeholder="לדוגמה: פותח את הספר וקורא פסקה אחת"
                    />
                  </Field>
                  <Field label="משך מתוכנן בדקות">
                    <TextInput
                      style={styles.textInput}
                      value={draft.smallDurationMinutes}
                      onChangeText={(smallDurationMinutes) => setDraft({ ...draft, smallDurationMinutes })}
                      textAlign="right"
                      keyboardType="number-pad"
                    />
                  </Field>
                </>
              )}
            </View>

            <View style={styles.stageCard}>
              <Text style={styles.stageCardTitle}>שלב 3: פעולה מרכזית (חובה)</Text>
              <Field label="תיאור הפעולה">
                <TextInput
                  style={styles.textInput}
                  value={draft.mainDescription}
                  onChangeText={(mainDescription) => setDraft({ ...draft, mainDescription })}
                  textAlign="right"
                  placeholder="לדוגמה: ממשיך לקרוא את הספר"
                />
              </Field>
              <Field label="משך מתוכנן בדקות">
                <TextInput
                  style={styles.textInput}
                  value={draft.mainDurationMinutes}
                  onChangeText={(mainDurationMinutes) => setDraft({ ...draft, mainDurationMinutes })}
                  textAlign="right"
                  keyboardType="number-pad"
                />
              </Field>
            </View>

            <Text style={styles.hint}>{`משך כולל מחושב: ${resolveDraftStageTotalMinutes(draft)} דקות`}</Text>
          </View>
        )}

        {/* ARC-system upgrade task, Part 2: an OPTIONAL time window for
            ARC right before this task -- never required, never
            auto-added; "דילוג" (skipping it) never affects the task
            itself. */}
        <Field label="חלון ARC אופציונלי לפני המשימה (רשות)">
          <View style={styles.chipRow}>
            <Pressable style={[styles.chip, !draft.arcWindowMinutesBefore && styles.chipSelected]} onPress={() => setDraft({ ...draft, arcWindowMinutesBefore: "" })}>
              <Text style={styles.chipText}>ללא</Text>
            </Pressable>
            {["5", "10", "15"].map((minutes) => (
              <Pressable
                key={minutes}
                style={[styles.chip, draft.arcWindowMinutesBefore === minutes && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, arcWindowMinutesBefore: minutes })}
              >
                <Text style={styles.chipText}>{minutes} דק&apos;</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="חזרתיות">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, draft.recurrenceKind === "once" && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, recurrenceKind: "once" })}
            >
              <Text style={styles.chipText}>חד-פעמית</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, draft.recurrenceKind === "recurring" && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, recurrenceKind: "recurring" })}
            >
              <Text style={styles.chipText}>חזרתית</Text>
            </Pressable>
          </View>
          {draft.recurrenceKind === "recurring" && (
            <View style={styles.chipRow}>
              {RECURRENCE_DAY_LABELS.map((label, dayOfWeek) => (
                <Pressable
                  key={dayOfWeek}
                  style={[styles.chip, draft.recurrenceDays.includes(dayOfWeek) && styles.chipSelected]}
                  onPress={() => setDraft(toggleRecurrenceDayInDraft(draft, dayOfWeek))}
                >
                  <Text style={styles.chipText}>{label}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.chip, draft.recurrenceDays.length === 7 && styles.chipSelected]}
                onPress={() => setDraft(selectAllRecurrenceDaysInDraft(draft))}
              >
                <Text style={styles.chipText}>כל הימים</Text>
              </Pressable>
            </View>
          )}
        </Field>

        <Field label="תתי-משימות (רשות)">
          {draft.subtasks.map((subtask) => (
            <View key={subtask.id} style={styles.subtaskRow}>
              <Pressable onPress={() => setDraft(removeSubtaskFromDraft(draft, subtask.id))}>
                <Text style={styles.removeLink}>הסרה</Text>
              </Pressable>
              <Text style={styles.subtaskRowText}>{subtask.title}</Text>
            </View>
          ))}
          <View style={styles.addRow}>
            <Pressable
              style={styles.addButton}
              onPress={() => {
                setDraft(addSubtaskToDraft(draft, newSubtaskTitle));
                setNewSubtaskTitle("");
              }}
            >
              <Text style={styles.addButtonText}>הוספה</Text>
            </Pressable>
            <TextInput style={[styles.textInput, styles.flexInput]} value={newSubtaskTitle} onChangeText={setNewSubtaskTitle} textAlign="right" />
          </View>
        </Field>

        <Field label="ערך (רשות)">
          <TextInput style={styles.textInput} value={draft.value} onChangeText={(value) => setDraft({ ...draft, value })} textAlign="right" />
        </Field>

        <Field label="זהות (רשות)">
          <TextInput style={styles.textInput} value={draft.identity} onChangeText={(identity) => setDraft({ ...draft, identity })} textAlign="right" />
        </Field>

        <Field label="מצב תומך מועדף להכנה לפני המשימה (רשות)">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !draft.defaultSupportiveStateId && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, defaultSupportiveStateId: "" })}
            >
              <Text style={styles.chipText}>ללא</Text>
            </Pressable>
            {PREPARATION_STATE_IDS.map((stateId) => (
              <Pressable
                key={stateId}
                style={[styles.chip, draft.defaultSupportiveStateId === stateId && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, defaultSupportiveStateId: stateId })}
              >
                <Text style={styles.chipText}>{PREPARATION_STATE_LABELS[stateId]}</Text>
              </Pressable>
            ))}
            {stateProfiles.map((profile) => (
              <Pressable
                key={profile.id}
                style={[styles.chip, draft.defaultSupportiveStateId === profile.id && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, defaultSupportiveStateId: profile.id })}
              >
                <Text style={styles.chipText}>{profile.name}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="מטרת ARC Goal מקושרת (רשות)">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, draft.linkedArcGoalId === null && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, linkedArcGoalId: null })}
            >
              <Text style={styles.chipText}>ללא</Text>
            </Pressable>
            {arcGoals.map((goal) => (
              <Pressable
                key={goal.id}
                style={[styles.chip, draft.linkedArcGoalId === goal.id && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, linkedArcGoalId: goal.id })}
              >
                <Text style={styles.chipText}>{goal.name}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="תרגול ARC מקושר (רשות)">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, draft.linkedArcBuildId === null && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, linkedArcBuildId: null })}
            >
              <Text style={styles.chipText}>ללא</Text>
            </Pressable>
            {arcBuilds.map((build) => (
              <Pressable
                key={build.id}
                style={[styles.chip, draft.linkedArcBuildId === build.id && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, linkedArcBuildId: build.id })}
              >
                <Text style={styles.chipText}>{build.name}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Pressable style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>{isNew ? "יצירת משימה" : "שמירת שינויים"}</Text>
        </Pressable>

        {!isNew && (
          <Pressable style={styles.archiveButton} onPress={() => setConfirmArchive(true)}>
            <Text style={styles.archiveButtonText}>העברה לארכיון</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal visible={confirmArchive} transparent animationType="fade" onRequestClose={() => setConfirmArchive(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>להעביר את המשימה לארכיון?</Text>
            <Text style={styles.hint}>המשימה תוסתר מהרשימות, אך לא תימחק -- ההיסטוריה שלה תישמר.</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.primaryButton, styles.modalButton, styles.archiveConfirmButton]} onPress={handleArchive}>
                <Text style={styles.primaryButtonText}>העברה לארכיון</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmArchive(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDateCalendar} transparent animationType="fade" onRequestClose={() => setShowDateCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <MonthlyCalendar
              selectedDate={draft.scheduledDate || null}
              onSelectDate={(scheduledDate) => setDraft({ ...draft, scheduledDate })}
              onConfirm={() => setShowDateCalendar(false)}
              onCancel={() => setShowDateCalendar(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  stagesBlock: { marginTop: 4, marginBottom: 12 },
  stageCard: { backgroundColor: "#F5FAFD", borderRadius: 12, padding: 14, marginBottom: 12 },
  stageCardTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginBottom: 8 },
  content: { padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  errorText: { color: "#b00020", textAlign: "right", fontSize: 14, marginBottom: 4 },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  flexInput: { flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  subtaskRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 6 },
  subtaskRowText: { fontSize: 15, textAlign: "right" },
  removeLink: { color: "#b00020", fontSize: 13 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "600" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  archiveButton: { borderWidth: 1, borderColor: "#b00020", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
  archiveButtonText: { color: "#b00020", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16 },
  modalButton: { flex: 0, marginTop: 0, paddingHorizontal: 20 },
  archiveConfirmButton: { backgroundColor: "#b00020" },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  overrideCancelButton: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  overrideCancelButtonText: { color: "#555", fontSize: 15 },
  calendarLinkButton: { alignSelf: "flex-end", marginTop: 6 },
  calendarLinkButtonText: { color: "#0a7ea4", fontSize: 13, textDecorationLine: "underline" },
});
