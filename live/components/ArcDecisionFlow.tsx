import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  addArcDecisionOption,
  advanceArcDecisionToChoose,
  advanceArcDecisionToFocusPoint,
  advanceArcDecisionToImagineAll,
  canAdvanceFromArcDecisionOptions,
  chooseArcDecisionOption,
  goToPreviousArcDecisionStep,
  removeArcDecisionOption,
  resolveChosenArcDecisionOption,
  updateArcDecisionOption,
} from "../../arc/arcDecision.ts";
import type { ArcDecisionOption, ArcDecisionSession } from "../../arc/arcDecision.ts";

/**
 * live/components/ArcDecisionFlow.tsx
 *
 * ARC Decision -- "קבלת החלטות": the ONE shared UI for both entry
 * points (the standalone ARC Gym exercise, build/ArcGymDecisionScreen.tsx,
 * and the "אני לא יודע" button at ARC LIVE's existing action-selection
 * point, live/NewArcLiveScreen.tsx) -- see arc/arcDecision.ts's own doc.
 * A pure, controlled presentational component: every change is reported
 * via onChange (the caller owns persistence), never touches
 * AsyncStorage/navigation itself, so each caller's own context (an ARC
 * session already in progress vs. a free-standing Gym exercise) stays
 * completely intact underneath it.
 *
 * Deliberately excludes, per the spec's own "אין להוסיף" list: ranking,
 * pros/cons, comparisons, extra emotion questions, breathing exercises,
 * body movements, a timer that forces advancement, or any step beyond
 * the exact four required ones.
 */
export interface ArcDecisionFlowProps {
  session: ArcDecisionSession;
  onChange: (session: ArcDecisionSession) => void;
  onCancel: () => void;
  /** Label for the one action available once an option is chosen -- callers phrase it for their own context ("המשך" to resume ARC, "המשך" to reach the Gym finish screen). */
  finishLabel: string;
  /** Called once, only after the trainee both chose an option AND pressed the finish action -- what happens next is entirely up to the caller. */
  onFinish: (session: ArcDecisionSession, chosenOption: ArcDecisionOption) => void;
}

export default function ArcDecisionFlow({ session, onChange, onCancel, finishLabel, onFinish }: ArcDecisionFlowProps) {
  const [newOptionDraft, setNewOptionDraft] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  function startEditing(option: ArcDecisionOption) {
    setEditingOptionId(option.id);
    setEditDraft(option.text);
  }

  function commitEdit() {
    if (!editingOptionId) return;
    onChange(updateArcDecisionOption(session, editingOptionId, editDraft));
    setEditingOptionId(null);
    setEditDraft("");
  }

  function addOption() {
    if (!newOptionDraft.trim()) return;
    onChange(addArcDecisionOption(session, newOptionDraft));
    setNewOptionDraft("");
  }

  const header = (
    <View style={styles.topRow}>
      {session.currentStep !== "options" && (
        <Pressable onPress={() => onChange(goToPreviousArcDecisionStep(session))}>
          <Text style={styles.linkText}>חזרה</Text>
        </Pressable>
      )}
      <Pressable onPress={onCancel}>
        <Text style={styles.cancelLink}>ביטול</Text>
      </Pressable>
    </View>
  );

  if (session.currentStep === "options") {
    const canAdvance = canAdvanceFromArcDecisionOptions(session);
    return (
      <View>
        {header}
        <Text style={styles.prompt}>בין אילו אפשרויות אתה מתלבט?</Text>
        {session.options.map((option) => (
          <View key={option.id} style={styles.optionEditRow}>
            {editingOptionId === option.id ? (
              <>
                <TextInput style={styles.textInput} value={editDraft} onChangeText={setEditDraft} textAlign="right" onBlur={commitEdit} autoFocus />
                <Pressable onPress={commitEdit}>
                  <Text style={styles.linkText}>שמירה</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.optionRowText}>{option.text}</Text>
                <View style={styles.optionRowActions}>
                  <Pressable onPress={() => startEditing(option)}>
                    <Text style={styles.linkText}>ערוך</Text>
                  </Pressable>
                  <Pressable onPress={() => onChange(removeArcDecisionOption(session, option.id))}>
                    <Text style={styles.removeLink}>מחק</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        ))}
        <View style={styles.addRow}>
          <Pressable style={styles.addButton} onPress={addOption}>
            <Text style={styles.addButtonText}>הוספה</Text>
          </Pressable>
          <TextInput style={[styles.textInput, styles.flexInput]} value={newOptionDraft} onChangeText={setNewOptionDraft} textAlign="right" placeholder="אפשרות נוספת" />
        </View>
        {!canAdvance && <Text style={styles.hint}>יש להזין לפחות שתי אפשרויות.</Text>}
        <Pressable style={[styles.primaryButton, !canAdvance && styles.disabledButton]} disabled={!canAdvance} onPress={() => onChange(advanceArcDecisionToImagineAll(session))}>
          <Text style={styles.primaryButtonText}>המשך לדמיון</Text>
        </Pressable>
      </View>
    );
  }

  if (session.currentStep === "imagine_all") {
    return (
      <View>
        {header}
        <Text style={styles.prompt}>עצום את העיניים ודמיין את כל האפשרויות שבחרת ביחד, בו־זמנית.</Text>
        <Pressable style={styles.primaryButton} onPress={() => onChange(advanceArcDecisionToFocusPoint(session))}>
          <Text style={styles.primaryButtonText}>המשך לנקודה</Text>
        </Pressable>
      </View>
    );
  }

  if (session.currentStep === "focus_point") {
    return (
      <View>
        {header}
        <Text style={styles.prompt}>פקח את העיניים והסתכל על הנקודה. מקד את תשומת הלב שלך בה.</Text>
        <View style={styles.focusPointWrap}>
          <View style={styles.focusPoint} />
        </View>
        <Pressable style={styles.primaryButton} onPress={() => onChange(advanceArcDecisionToChoose(session))}>
          <Text style={styles.primaryButtonText}>המשך לבחירה</Text>
        </Pressable>
      </View>
    );
  }

  // currentStep === "choose"
  const chosen = resolveChosenArcDecisionOption(session);
  return (
    <View>
      {header}
      <Text style={styles.prompt}>באיזו אפשרות אתה בוחר?</Text>
      {session.options.map((option) => (
        <Pressable
          key={option.id}
          style={[styles.optionRow, session.chosenOptionId === option.id && styles.optionRowSelected]}
          onPress={() => onChange(chooseArcDecisionOption(session, option.id))}
        >
          <Text style={styles.optionText}>{option.text}</Text>
        </Pressable>
      ))}
      {chosen && (
        <View style={styles.chosenBlock}>
          <Text style={styles.chosenText}>{`בחרת: ${chosen.text}`}</Text>
          <Pressable style={styles.primaryButton} onPress={() => onFinish(session, chosen)}>
            <Text style={styles.primaryButtonText}>{finishLabel}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 14 },
  linkText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  cancelLink: { color: "#888", fontSize: 14 },
  removeLink: { color: "#b00020", fontSize: 13 },
  prompt: { fontSize: 18, textAlign: "right", color: "#333", marginBottom: 18, lineHeight: 27 },
  hint: { fontSize: 13, color: "#888", textAlign: "right", marginBottom: 8 },
  optionEditRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  optionRowText: { flex: 1, fontSize: 15, textAlign: "right" },
  optionRowActions: { flexDirection: "row-reverse", gap: 14 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 16 },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "700" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, flex: 1 },
  flexInput: { flex: 1 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 10 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabledButton: { opacity: 0.5 },
  focusPointWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  focusPoint: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#222" },
  optionRow: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 12, padding: 16, alignItems: "flex-end", marginBottom: 10 },
  optionRowSelected: { backgroundColor: "#E3F2FB" },
  optionText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600", textAlign: "right" },
  chosenBlock: { marginTop: 10 },
  chosenText: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#333", marginBottom: 6 },
});
