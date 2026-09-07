import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { deleteArcLink, upsertArcLink, upsertRoutineTrigger, upsertWeeklyAction } from "../data/storage.ts";
import { ARC_LINK_TRIGGER_TYPE_LABELS } from "../arc/bodyImagery.ts";
import type { ArcLinkTriggerType } from "../arc/bodyImagery.ts";
import {
  ARC_LINK_TRIGGER_CATEGORY_LABELS,
  describeArcLinkKindAndCategory,
  generateArcLinkId,
  generateRoutineTriggerId,
  generateWeeklyActionId,
  resolveArcLinkKind,
  resolveArcLinkTriggerCategory,
} from "../arc/routineLinks.ts";
import type { ArcLink, ArcLinkKind, ArcLinkMode, ArcLinkTriggerCategory, RoutineTrigger, WeeklyAction } from "../arc/routineLinks.ts";
import type { ArcBuild } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";

const DAY_LABELS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]; // index === Date.getDay()

/**
 * Extended ARC Link trigger system: "category" (the 5-way type chip:
 * מתוזמן/לשגרה/מניעתי/תגובתי/מגשר) and "bridging" (the Bridging ARC
 * Link's own supportive-state-protocol + variant + category picker) are
 * NEW steps, additive to the original 6-step flow -- shown ONLY for
 * protocolType "arc" (kind/triggerCategory/bridging are all full-ARC
 * concepts, since Bridging specifically needs a state ARC + an
 * identity ARC, a split Mini ARC has no equivalent of). For "mini_arc",
 * `step` starts at "protocol" exactly as before and NEVER visits either
 * new step -- Mini ARC Link's own flow is byte-for-byte unchanged.
 */
type BuildStep = "category" | "bridging" | "protocol" | "weeklyAction" | "trigger" | "mode" | "schedule" | "review";

const BRIDGING_CATEGORY_OPTIONS: ArcLinkTriggerCategory[] = ["routine", "preventive", "reactive"];

interface ArcLinkFormState {
  id: string | null;
  protocolId: string | null;
  weeklyActionId: string | null;
  triggerId: string | null;
  mode: ArcLinkMode;
  practiceDays: number[];
  practiceTimeText: string;
  weeklyTargetText: string;
  enabled: boolean;
  kind: ArcLinkKind;
  triggerCategory: ArcLinkTriggerCategory;
  bridgingSupportiveProtocolId: string | null;
  bridgingVariant: "full" | "short";
}

function emptyForm(): ArcLinkFormState {
  return {
    id: null,
    protocolId: null,
    weeklyActionId: null,
    triggerId: null,
    mode: "with_archi",
    practiceDays: [],
    practiceTimeText: "",
    weeklyTargetText: "",
    enabled: true,
    kind: "standard",
    triggerCategory: "scheduled",
    bridgingSupportiveProtocolId: null,
    bridgingVariant: "full",
  };
}

function formFromLink(link: ArcLink): ArcLinkFormState {
  return {
    id: link.id,
    protocolId: link.protocolId,
    weeklyActionId: link.weeklyActionId,
    triggerId: link.triggerId,
    mode: link.mode,
    practiceDays: link.practiceDays,
    practiceTimeText: link.practiceTime ?? "",
    weeklyTargetText: link.weeklyTarget !== null ? String(link.weeklyTarget) : "",
    enabled: link.enabled,
    kind: resolveArcLinkKind(link),
    triggerCategory: resolveArcLinkTriggerCategory(link),
    bridgingSupportiveProtocolId: link.bridging?.supportiveProtocolId ?? null,
    bridgingVariant: link.bridging?.variant ?? "full",
  };
}

function protocolName(protocolType: "arc" | "mini_arc", id: string, arcBuilds: ArcBuild[], miniArcBuilds: MiniArcBuild[]): string {
  if (protocolType === "arc") return arcBuilds.find((b) => b.id === id)?.name ?? "פרוטוקול לא נמצא";
  return miniArcBuilds.find((b) => b.id === id)?.name ?? "פרוטוקול לא נמצא";
}

/**
 * build/ArcLinkBuildForm.tsx
 *
 * Weekly Routine + ARC Link management task: the "בניית ARC Link" /
 * "בניית Mini ARC Link" step flow (Sections 4-6 of the task spec),
 * rendered INLINE inside the Routine page (app/routines/index.tsx) --
 * never a separate route, matching that page's own existing "one
 * screen, a few internal views" pattern (RoutineForm). Reused for BOTH
 * ARC Link and Mini ARC Link via `protocolType` -- Mini ARC Link never
 * gets any full-ARC-only field (there are none here to begin with; the
 * only branching is which protocol list Step 1 shows). Editing an
 * existing ArcLink opens this exact same flow with its data prefilled
 * (formFromLink) -- never a separate editor. Only references
 * (protocolId/weeklyActionId/triggerId) are ever stored; the linked
 * protocol's own content is never copied or edited here.
 */
export default function ArcLinkBuildForm({
  protocolType,
  editingLink,
  arcBuilds,
  miniArcBuilds,
  weeklyActions,
  triggers,
  onSaved,
  onCancel,
}: {
  protocolType: "arc" | "mini_arc";
  editingLink: ArcLink | null;
  arcBuilds: ArcBuild[];
  miniArcBuilds: MiniArcBuild[];
  weeklyActions: WeeklyAction[];
  triggers: RoutineTrigger[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ArcLinkFormState>(editingLink ? formFromLink(editingLink) : emptyForm());
  const [step, setStep] = useState<BuildStep>(protocolType === "arc" ? "category" : "protocol");
  const [newWeeklyActionName, setNewWeeklyActionName] = useState("");
  const [newTriggerType, setNewTriggerType] = useState<ArcLinkTriggerType>("time");
  const [newTriggerText, setNewTriggerText] = useState("");
  const [localWeeklyActions, setLocalWeeklyActions] = useState<WeeklyAction[]>(weeklyActions);
  const [localTriggers, setLocalTriggers] = useState<RoutineTrigger[]>(triggers);

  const protocolOptions = protocolType === "arc" ? arcBuilds : miniArcBuilds;
  const protocolLabel = protocolType === "arc" ? "ARC" : "Mini ARC";

  async function handleAddWeeklyAction() {
    const name = newWeeklyActionName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const action: WeeklyAction = {
      id: generateWeeklyActionId(),
      name,
      days: [],
      times: [],
      durationMinutes: null,
      triggerId: null,
      weeklyTarget: 1,
      linkedProtocolId: form.protocolId,
      linkedProtocolType: protocolType,
      completedDates: [],
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await upsertWeeklyAction(action);
    setLocalWeeklyActions([...localWeeklyActions, action]);
    setForm({ ...form, weeklyActionId: action.id });
    setNewWeeklyActionName("");
  }

  async function handleAddTrigger() {
    const text = newTriggerText.trim();
    if (!text) return;
    const trigger: RoutineTrigger = {
      id: generateRoutineTriggerId(),
      type: newTriggerType,
      text,
      time: newTriggerType === "time" ? text : null,
      createdAt: new Date().toISOString(),
    };
    await upsertRoutineTrigger(trigger);
    setLocalTriggers([...localTriggers, trigger]);
    setForm({ ...form, triggerId: trigger.id });
    setNewTriggerText("");
  }

  async function handleSave() {
    if (!form.protocolId || !form.weeklyActionId || !form.triggerId) return;
    if (form.kind === "bridging" && !form.bridgingSupportiveProtocolId) return;
    const now = new Date().toISOString();
    const weeklyTarget = form.weeklyTargetText.trim() ? Number.parseInt(form.weeklyTargetText, 10) : null;
    const link: ArcLink = {
      id: form.id ?? generateArcLinkId(),
      protocolId: form.protocolId,
      protocolType,
      weeklyActionId: form.weeklyActionId,
      triggerId: form.triggerId,
      mode: form.mode,
      practiceDays: form.practiceDays,
      practiceTime: form.practiceTimeText.trim() || null,
      weeklyTarget: weeklyTarget !== null && !Number.isNaN(weeklyTarget) ? weeklyTarget : null,
      completedPracticeDates: editingLink?.completedPracticeDates ?? [],
      enabled: form.enabled,
      createdAt: editingLink?.createdAt ?? now,
      updatedAt: now,
      kind: form.kind,
      triggerCategory: form.triggerCategory,
      triggerLevels: editingLink?.triggerLevels ?? null,
      bridging: form.kind === "bridging" && form.bridgingSupportiveProtocolId ? { supportiveProtocolId: form.bridgingSupportiveProtocolId, variant: form.bridgingVariant } : null,
    };
    await upsertArcLink(link);
    onSaved();
  }

  async function handleDelete() {
    if (!form.id) return;
    await deleteArcLink(form.id);
    onSaved();
  }

  function toggleDay(day: number) {
    setForm({
      ...form,
      practiceDays: form.practiceDays.includes(day) ? form.practiceDays.filter((d) => d !== day) : [...form.practiceDays, day].sort(),
    });
  }

  // ---- Step 0a: select ARC Link category (arc protocolType only -- Mini
  // ARC Link never visits this step, so its own flow stays unchanged) ----
  if (step === "category") {
    return (
      <View>
        <Text style={styles.title}>איזה סוג ARC Link תרצה לבנות?</Text>
        <View style={styles.chipRow}>
          {(["scheduled", "routine", "preventive", "reactive"] as ArcLinkTriggerCategory[]).map((category) => (
            <Pressable
              key={category}
              style={[styles.chip, form.kind === "standard" && form.triggerCategory === category && styles.chipSelected]}
              onPress={() => setForm({ ...form, kind: "standard", triggerCategory: category })}
            >
              <Text style={styles.chipText}>{`ARC Link ${ARC_LINK_TRIGGER_CATEGORY_LABELS[category]}`}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.chip, form.kind === "bridging" && styles.chipSelected]}
            onPress={() => setForm({ ...form, kind: "bridging", triggerCategory: form.triggerCategory === "scheduled" ? "routine" : form.triggerCategory })}
          >
            <Text style={styles.chipText}>ARC Link מגשר</Text>
          </Pressable>
        </View>
        <Text style={styles.emptyText}>
          {form.kind === "bridging"
            ? "מחבר בין רמז מצב תומך שכבר אימנת לבין הזהות הרצויה והפעולה המיטיבה."
            : "מתוזמן: שעה קבועה. לשגרה: הקשר קבוע. מניעתי: זיהוי מוקדם של סיטואציה. תגובתי: זיהוי של מה שכבר מתחיל להופיע."}
        </Text>
        <View style={styles.stepButtons}>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={() => setStep(form.kind === "bridging" ? "bridging" : "protocol")}>
            <Text style={styles.saveButtonText}>המשך</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Step 0b: Bridging ARC Link's own supportive-state ARC + variant +
  // category (only reached when kind === "bridging") ----
  if (step === "bridging") {
    return (
      <View>
        <Text style={styles.title}>מהו ה-ARC של המצב התומך?</Text>
        <Text style={styles.emptyText}>הרמז הקצר של ה-ARC הזה יהפוך להיות הטריגר שמתחיל את מעבר הזהות.</Text>
        {arcBuilds.length === 0 && <Text style={styles.emptyText}>עדיין אין ARC שמור.</Text>}
        {arcBuilds.map((build) => (
          <Pressable
            key={build.id}
            style={[styles.optionRow, form.bridgingSupportiveProtocolId === build.id && styles.optionRowSelected]}
            onPress={() => setForm({ ...form, bridgingSupportiveProtocolId: build.id })}
          >
            <Text style={styles.optionRowText}>{build.name}</Text>
          </Pressable>
        ))}

        <Text style={styles.fieldLabel}>אורך התרגול</Text>
        <View style={styles.chipRow}>
          <Pressable style={[styles.chip, form.bridgingVariant === "full" && styles.chipSelected]} onPress={() => setForm({ ...form, bridgingVariant: "full" })}>
            <Text style={styles.chipText}>מלא (כולל הטריגר והמצב התומך)</Text>
          </Pressable>
          <Pressable style={[styles.chip, form.bridgingVariant === "short" && styles.chipSelected]} onPress={() => setForm({ ...form, bridgingVariant: "short" })}>
            <Text style={styles.chipText}>מקוצר (רמז ← זהות ← פעולה)</Text>
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>קטגוריית הטריגר</Text>
        <View style={styles.chipRow}>
          {BRIDGING_CATEGORY_OPTIONS.map((category) => (
            <Pressable
              key={category}
              style={[styles.chip, form.triggerCategory === category && styles.chipSelected]}
              onPress={() => setForm({ ...form, triggerCategory: category })}
            >
              <Text style={styles.chipText}>{ARC_LINK_TRIGGER_CATEGORY_LABELS[category]}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.stepButtons}>
          <Pressable style={styles.cancelButton} onPress={() => setStep("category")}>
            <Text style={styles.cancelButtonText}>חזרה</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, !form.bridgingSupportiveProtocolId && styles.buttonDisabled]}
            disabled={!form.bridgingSupportiveProtocolId}
            onPress={() => setStep("protocol")}
          >
            <Text style={styles.saveButtonText}>המשך</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Step 1: select protocol (the identity+action ARC, when kind === "bridging") ----
  if (step === "protocol") {
    return (
      <View>
        <Text style={styles.title}>
          {form.kind === "bridging" ? `באיזה ${protocolLabel} נמצאת הזהות הרצויה והפעולה המיטיבה?` : `איזה ${protocolLabel} תרצה לחבר לשגרה?`}
        </Text>
        {protocolOptions.length === 0 && <Text style={styles.emptyText}>{`עדיין אין ${protocolLabel} שמור.`}</Text>}
        {protocolOptions.map((build) => (
          <Pressable
            key={build.id}
            style={[styles.optionRow, form.protocolId === build.id && styles.optionRowSelected]}
            onPress={() => setForm({ ...form, protocolId: build.id })}
          >
            <Text style={styles.optionRowText}>{build.name}</Text>
          </Pressable>
        ))}
        <View style={styles.stepButtons}>
          <Pressable
            style={styles.cancelButton}
            onPress={() => (protocolType === "arc" ? setStep(form.kind === "bridging" ? "bridging" : "category") : onCancel())}
          >
            <Text style={styles.cancelButtonText}>{protocolType === "arc" ? "חזרה" : "ביטול"}</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, !form.protocolId && styles.buttonDisabled]}
            disabled={!form.protocolId}
            onPress={() => setStep("weeklyAction")}
          >
            <Text style={styles.saveButtonText}>המשך</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Step 2: select / create weekly action ----
  if (step === "weeklyAction") {
    return (
      <View>
        <Text style={styles.title}>{`לאיזו פעולה תרצה לחבר את ה-${protocolLabel}?`}</Text>
        {localWeeklyActions.length === 0 && <Text style={styles.emptyText}>עדיין אין פעולות שבועיות.</Text>}
        {localWeeklyActions.map((action) => (
          <Pressable
            key={action.id}
            style={[styles.optionRow, form.weeklyActionId === action.id && styles.optionRowSelected]}
            onPress={() => setForm({ ...form, weeklyActionId: action.id })}
          >
            <Text style={styles.optionRowText}>{action.name}</Text>
          </Pressable>
        ))}
        <Text style={styles.fieldLabel}>+ הוספת פעולה שבועית</Text>
        <View style={styles.inlineAddRow}>
          <TextInput
            style={styles.textInputFlex}
            value={newWeeklyActionName}
            onChangeText={setNewWeeklyActionName}
            placeholder="שם הפעולה"
            textAlign="right"
          />
          <Pressable style={styles.smallAddButton} onPress={handleAddWeeklyAction}>
            <Text style={styles.smallAddButtonText}>הוסף</Text>
          </Pressable>
        </View>
        <View style={styles.stepButtons}>
          <Pressable style={styles.cancelButton} onPress={() => setStep("protocol")}>
            <Text style={styles.cancelButtonText}>חזרה</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, !form.weeklyActionId && styles.buttonDisabled]}
            disabled={!form.weeklyActionId}
            onPress={() => setStep("trigger")}
          >
            <Text style={styles.saveButtonText}>המשך</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Step 3: select / create trigger ----
  if (step === "trigger") {
    return (
      <View>
        <Text style={styles.title}>מתי או אחרי מה תרצה לזכור להתחיל?</Text>
        {localTriggers.length === 0 && <Text style={styles.emptyText}>עדיין אין טריגרים שמורים.</Text>}
        {localTriggers.map((trigger) => (
          <Pressable
            key={trigger.id}
            style={[styles.optionRow, form.triggerId === trigger.id && styles.optionRowSelected]}
            onPress={() => setForm({ ...form, triggerId: trigger.id })}
          >
            <Text style={styles.optionRowText}>{trigger.text}</Text>
          </Pressable>
        ))}
        <Text style={styles.fieldLabel}>טריגר חדש</Text>
        <View style={styles.chipRow}>
          {(Object.keys(ARC_LINK_TRIGGER_TYPE_LABELS) as ArcLinkTriggerType[]).map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, newTriggerType === type && styles.chipSelected]}
              onPress={() => setNewTriggerType(type)}
            >
              <Text style={styles.chipText}>{ARC_LINK_TRIGGER_TYPE_LABELS[type]}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.inlineAddRow}>
          <TextInput
            style={styles.textInputFlex}
            value={newTriggerText}
            onChangeText={setNewTriggerText}
            placeholder='לדוגמה: "בשעה 10:00" או "אחרי שאני קם מהמיטה"'
            textAlign="right"
          />
          <Pressable style={styles.smallAddButton} onPress={handleAddTrigger}>
            <Text style={styles.smallAddButtonText}>הוסף</Text>
          </Pressable>
        </View>
        <View style={styles.stepButtons}>
          <Pressable style={styles.cancelButton} onPress={() => setStep("weeklyAction")}>
            <Text style={styles.cancelButtonText}>חזרה</Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, !form.triggerId && styles.buttonDisabled]}
            disabled={!form.triggerId}
            onPress={() => setStep(form.kind === "bridging" ? "schedule" : "mode")}
          >
            <Text style={styles.saveButtonText}>המשך</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Step 4: with / without ARCHI ----
  if (step === "mode") {
    return (
      <View>
        <Text style={styles.title}>איך תרצה לתרגל את הקישור?</Text>
        <Pressable style={[styles.modeCard, form.mode === "with_archi" && styles.modeCardSelected]} onPress={() => setForm({ ...form, mode: "with_archi" })}>
          <Text style={styles.modeCardTitle}>עם ARCHI</Text>
          <Text style={styles.modeCardBody}>לדמיין את הטריגר, לפתוח את ARCHI ולבצע את הפרוטוקול בעזרת האפליקציה.</Text>
        </Pressable>
        <Pressable style={[styles.modeCard, form.mode === "without_archi" && styles.modeCardSelected]} onPress={() => setForm({ ...form, mode: "without_archi" })}>
          <Text style={styles.modeCardTitle}>ללא ARCHI</Text>
          <Text style={styles.modeCardBody}>לדמיין את הטריגר ולבצע את הפרוטוקול מהזיכרון, בלי לפתוח את האפליקציה.</Text>
        </Pressable>
        <View style={styles.stepButtons}>
          <Pressable style={styles.cancelButton} onPress={() => setStep("trigger")}>
            <Text style={styles.cancelButtonText}>חזרה</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={() => setStep("schedule")}>
            <Text style={styles.saveButtonText}>המשך</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Step 5: practice schedule ----
  if (step === "schedule") {
    return (
      <View>
        <Text style={styles.title}>{`מתי תרצה לתרגל את ה-${protocolLabel} Link?`}</Text>
        <Text style={styles.fieldLabel}>ימי תרגול (רשות)</Text>
        <View style={styles.chipRow}>
          {DAY_LABELS.map((label, day) => (
            <Pressable key={day} style={[styles.chip, form.practiceDays.includes(day) && styles.chipSelected]} onPress={() => toggleDay(day)}>
              <Text style={styles.chipText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.fieldLabel}>שעת תרגול (רשות, HH:MM)</Text>
        <TextInput
          style={styles.textInput}
          value={form.practiceTimeText}
          onChangeText={(text) => setForm({ ...form, practiceTimeText: text })}
          placeholder="09:00"
          textAlign="right"
        />
        <Text style={styles.fieldLabel}>יעד תרגול שבועי (רשות)</Text>
        <TextInput
          style={styles.textInput}
          value={form.weeklyTargetText}
          onChangeText={(text) => setForm({ ...form, weeklyTargetText: text.replace(/[^0-9]/g, "") })}
          placeholder="לדוגמה: 4"
          keyboardType="number-pad"
          textAlign="right"
        />
        <View style={styles.stepButtons}>
          <Pressable style={styles.cancelButton} onPress={() => setStep(form.kind === "bridging" ? "trigger" : "mode")}>
            <Text style={styles.cancelButtonText}>חזרה</Text>
          </Pressable>
          <Pressable style={styles.saveButton} onPress={() => setStep("review")}>
            <Text style={styles.saveButtonText}>המשך</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Step 6: review + save ----
  const selectedProtocolName = form.protocolId ? protocolName(protocolType, form.protocolId, arcBuilds, miniArcBuilds) : "";
  const selectedWeeklyAction = localWeeklyActions.find((a) => a.id === form.weeklyActionId);
  const selectedTrigger = localTriggers.find((t) => t.id === form.triggerId);
  const selectedBridgingProtocolName =
    form.kind === "bridging" && form.bridgingSupportiveProtocolId ? protocolName("arc", form.bridgingSupportiveProtocolId, arcBuilds, miniArcBuilds) : "";
  return (
    <View>
      <Text style={styles.title}>סקירה</Text>
      {protocolType === "arc" && (
        <Text style={styles.reviewLine}>{`סוג: ${describeArcLinkKindAndCategory({ kind: form.kind, triggerCategory: form.triggerCategory })}`}</Text>
      )}
      {form.kind === "bridging" ? (
        <>
          <Text style={styles.reviewLine}>{`ARC של המצב התומך: ${selectedBridgingProtocolName}`}</Text>
          <Text style={styles.reviewLine}>{`ARC של הזהות והפעולה: ${selectedProtocolName}`}</Text>
          <Text style={styles.reviewLine}>{`אורך התרגול: ${form.bridgingVariant === "full" ? "מלא" : "מקוצר"}`}</Text>
        </>
      ) : (
        <Text style={styles.reviewLine}>{`פרוטוקול: ${selectedProtocolName}`}</Text>
      )}
      <Text style={styles.reviewLine}>{`פעולה שבועית: ${selectedWeeklyAction?.name ?? ""}`}</Text>
      <Text style={styles.reviewLine}>{`טריגר: ${selectedTrigger?.text ?? ""}`}</Text>
      {form.kind !== "bridging" && (
        <Text style={styles.reviewLine}>{form.mode === "with_archi" ? "אופן התרגול: עם ARCHI" : "אופן התרגול: ללא ARCHI"}</Text>
      )}
      {form.practiceDays.length > 0 && <Text style={styles.reviewLine}>{`ימי תרגול: ${form.practiceDays.map((d) => DAY_LABELS[d]).join(", ")}`}</Text>}
      {form.practiceTimeText.trim() && <Text style={styles.reviewLine}>{`שעת תרגול: ${form.practiceTimeText.trim()}`}</Text>}
      {form.weeklyTargetText.trim() && <Text style={styles.reviewLine}>{`יעד שבועי: ${form.weeklyTargetText.trim()}`}</Text>}

      <View style={styles.stepButtons}>
        <Pressable style={styles.cancelButton} onPress={() => setStep("schedule")}>
          <Text style={styles.cancelButtonText}>חזרה</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{protocolType === "arc" ? "שמירת ARC Link" : "שמירת Mini ARC Link"}</Text>
        </Pressable>
      </View>
      {editingLink && (
        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>מחק קישור</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  emptyText: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 8 },
  optionRow: {
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  optionRowSelected: { borderColor: "#0a7ea4", backgroundColor: "#E6F4FE" },
  optionRowText: { fontSize: 15, textAlign: "right" },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginTop: 12, marginBottom: 6 },
  inlineAddRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  textInputFlex: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  smallAddButton: { backgroundColor: "#0a7ea4", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  smallAddButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontWeight: "600", fontSize: 14 },
  modeCard: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 14, marginBottom: 10 },
  modeCardSelected: { borderColor: "#0a7ea4", backgroundColor: "#E6F4FE" },
  modeCardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  modeCardBody: { fontSize: 14, textAlign: "right", color: "#333" },
  reviewLine: { fontSize: 15, textAlign: "right", color: "#333", marginBottom: 6 },
  stepButtons: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 20, gap: 10 },
  saveButton: { flex: 1, backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  buttonDisabled: { opacity: 0.4 },
  cancelButton: { flex: 1, paddingVertical: 12, alignItems: "center" },
  cancelButtonText: { color: "#0a7ea4", fontSize: 15 },
  deleteButton: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  deleteButtonText: { color: "#c0392b", fontSize: 15 },
});
