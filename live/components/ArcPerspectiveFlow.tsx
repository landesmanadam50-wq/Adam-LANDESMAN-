import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  advanceArcPerspectiveFromMoodCheckIn,
  advanceArcPerspectiveToLinkBehaviour,
  advanceArcPerspectiveToMoodCheckIn,
  advanceArcPerspectiveToNewInterpretation,
  canAdvanceFromArcPerspectiveEvent,
  canAdvanceFromArcPerspectiveNewInterpretation,
  chooseArcPerspectiveMood,
  goToPreviousArcPerspectiveStep,
  linkArcGymSituationToArcPerspectiveSession,
  resolveArcPerspectiveDesiredInterpretationPreset,
  setArcPerspectiveDesiredInterpretationPreset,
  setArcPerspectiveEventDescription,
  setArcPerspectiveInitialInterpretation,
  setArcPerspectiveNewInterpretation,
  unlinkArcGymSituationFromArcPerspectiveSession,
} from "../../arc/arcPerspective.ts";
import type { ArcPerspectiveSession } from "../../arc/arcPerspective.ts";
import type { ArcGymSituation } from "../../arc/arcGym.ts";
import EmotionalCheckInButtons from "./EmotionalCheckInButtons.tsx";

/**
 * live/components/ArcPerspectiveFlow.tsx
 *
 * ARC Perspective -- "שינוי פרשנות": the ONE shared UI for both entry
 * points (the real-time Home button and the saved ARC Gym exercise) --
 * see arc/arcPerspective.ts's own doc. A pure, controlled presentational
 * component, same convention as live/components/ArcDecisionFlow.tsx:
 * every change is reported via onChange (the caller owns persistence
 * and navigation), never touches AsyncStorage/navigation itself.
 *
 * The mood check-in step never performs the ARC routing itself -- 😄
 * advances in place via onChange; 😟/🙂 call onMoodCheckIn, and the
 * caller (build/ArcPerspectiveFlowScreen.tsx) is the one that saves the
 * session and opens Full/Shortened ARC (data/emotionalCheckInRouting.ts's
 * handleArcPerspectiveCheckInChoice), since leaving this component
 * unmounts it.
 */
export interface ArcPerspectiveFlowProps {
  session: ArcPerspectiveSession;
  onChange: (session: ArcPerspectiveSession) => void;
  onCancel: () => void;
  onMoodCheckIn: (choice: "full_arc" | "shortened_arc") => void;
  /** Existing ARC Behaviour exercises available to link to, for the "link_behaviour" step's own picker -- loaded by the caller. */
  situations: ArcGymSituation[];
  /** "ליצור תרגיל התנהגות חדש" -- a plain navigation hint to ARC Gym; optional, since not every host screen may want to offer it. */
  onCreateNewBehaviour?: () => void;
  /** Called once the trainee is done with the "link_behaviour" step, whether or not they chose to link -- what happens next (persisting the link snapshot, clearing in-progress state, rendering a summary) is entirely up to the caller. */
  onFinish: (session: ArcPerspectiveSession) => void;
}

export default function ArcPerspectiveFlow({ session, onChange, onCancel, onMoodCheckIn, situations, onCreateNewBehaviour, onFinish }: ArcPerspectiveFlowProps) {
  const header = (
    <View style={styles.topRow}>
      {session.currentStep !== "event" && (
        <Pressable onPress={() => onChange(goToPreviousArcPerspectiveStep(session))}>
          <Text style={styles.linkText}>חזרה</Text>
        </Pressable>
      )}
      <Pressable onPress={onCancel}>
        <Text style={styles.cancelLink}>ביטול</Text>
      </Pressable>
    </View>
  );

  if (session.currentStep === "event") {
    const canAdvance = canAdvanceFromArcPerspectiveEvent(session);
    return (
      <View>
        {header}
        <Text style={styles.fieldLabel}>מה האירוע?</Text>
        <Text style={styles.fieldHint}>מה קרה או מה מתרחש כרגע?</Text>
        <TextInput
          style={[styles.textInput, styles.multilineInput]}
          value={session.eventDescription}
          onChangeText={(text) => onChange(setArcPerspectiveEventDescription(session, text))}
          textAlign="right"
          multiline
          placeholder="לדוגמה: מישהו אומר לי שהכול בסדר."
        />
        <Text style={[styles.fieldLabel, styles.secondFieldLabel]}>מה הפרשנות הראשונית שלך?</Text>
        <Text style={styles.fieldHint}>איזו פרשנות נתת לאירוע?</Text>
        <TextInput
          style={[styles.textInput, styles.multilineInput]}
          value={session.initialInterpretation}
          onChangeText={(text) => onChange(setArcPerspectiveInitialInterpretation(session, text))}
          textAlign="right"
          multiline
          placeholder="לדוגמה: הוא חושב שמשהו לא בסדר איתי."
        />
        <Text style={[styles.fieldLabel, styles.secondFieldLabel]}>איזו פרשנות חדשה היית רוצה לאמץ? (לא חובה)</Text>
        <Text style={styles.fieldHint}>אפשר להשאיר ריק ולנסח פרשנות חדשה רק בסיום התרגיל.</Text>
        <TextInput
          style={styles.textInput}
          value={session.desiredInterpretationPreset}
          onChangeText={(text) => onChange(setArcPerspectiveDesiredInterpretationPreset(session, text))}
          textAlign="right"
          placeholder="לדוגמה: יכול להיות שהוא פשוט מנסה להרגיע אותי."
        />
        {!canAdvance && <Text style={styles.hint}>יש לתאר את האירוע ואת הפרשנות הראשונית כדי להמשיך.</Text>}
        <Pressable style={[styles.primaryButton, !canAdvance && styles.disabledButton]} disabled={!canAdvance} onPress={() => onChange(advanceArcPerspectiveToMoodCheckIn(session))}>
          <Text style={styles.primaryButtonText}>המשך</Text>
        </Pressable>
      </View>
    );
  }

  if (session.currentStep === "mood_check_in") {
    return (
      <View>
        {header}
        <Text style={styles.prompt}>איך אתה מרגיש עכשיו, לאחר שתיארת את האירוע והפרשנות?</Text>
        <EmotionalCheckInButtons
          onFullArc={() => {
            onChange(chooseArcPerspectiveMood(session, "full_arc"));
            onMoodCheckIn("full_arc");
          }}
          onShortenedArc={() => {
            onChange(chooseArcPerspectiveMood(session, "shortened_arc"));
            onMoodCheckIn("shortened_arc");
          }}
          onExcellent={() => onChange(advanceArcPerspectiveFromMoodCheckIn(chooseArcPerspectiveMood(session, "excellent")))}
        />
      </View>
    );
  }

  if (session.currentStep === "perspective_shift") {
    return (
      <View>
        {header}
        {session.mode === "planned" ? (
          <>
            <Text style={styles.prompt}>תדמיין את האירוע.</Text>
            <Text style={styles.subPrompt}>דמיין את אותה תמונה של האירוע הופכת בהדרגה לבהירה וצבעונית יותר.</Text>
            <Text style={styles.instructionLine}>1. דמיין את האירוע שבחרת.</Text>
            <Text style={styles.instructionLine}>2. שמור בדמיון על אותו אירוע ואותם פרטים מרכזיים.</Text>
            <Text style={styles.instructionLine}>3. הפוך בהדרגה את התמונה לבהירה וצבעונית יותר.</Text>
            <Text style={styles.instructionLine}>4. שהה עם התמונה החדשה לפי בחירתך.</Text>
            <Text style={styles.instructionLine}>5. לחץ על "המשך" כשאתה מוכן.</Text>
            <Text style={styles.hint}>אם אתה מתקשה לדמיין תמונה, אפשר להמשיך תוך התמקדות בתיאור מילולי של האירוע.</Text>
          </>
        ) : (
          <>
            <Text style={styles.prompt}>שים לב לאירוע שמתרחש כרגע.</Text>
            <Text style={styles.subPrompt}>המשך לשים לב לאירוע, ובמקביל הפנה את תשומת הלב לצבעים הבהירים או הצבעוניים יותר שאתה רואה בסביבה.</Text>
            <Text style={styles.hint}>אין צורך לדמיין שהתמונה משתנה, ואין צורך להמציא צבעים. אם אין צבעים בולטים בסביבה, אפשר להמשיך באמצעות התבוננות רגילה.</Text>
          </>
        )}
        <Pressable style={styles.primaryButton} onPress={() => onChange(advanceArcPerspectiveToNewInterpretation(session))}>
          <Text style={styles.primaryButtonText}>המשך</Text>
        </Pressable>
      </View>
    );
  }

  if (session.currentStep === "new_interpretation") {
    const canAdvance = canAdvanceFromArcPerspectiveNewInterpretation(session);
    const preset = resolveArcPerspectiveDesiredInterpretationPreset(session);
    return (
      <View>
        {header}
        <Text style={styles.prompt}>איזו פרשנות חדשה אתה בוחר לתת לאירוע?</Text>
        {!!preset && (
          <Pressable style={styles.suggestionChip} onPress={() => onChange(setArcPerspectiveNewInterpretation(session, preset))}>
            <Text style={styles.suggestionChipText}>{`אמץ את הפרשנות שהגדרת מראש: ${preset}`}</Text>
          </Pressable>
        )}
        <TextInput
          style={[styles.textInput, styles.multilineInput]}
          value={session.newInterpretation}
          onChangeText={(text) => onChange(setArcPerspectiveNewInterpretation(session, text))}
          textAlign="right"
          multiline
          placeholder="לדוגמה: יכול להיות שהוא מנסה לעזור לי, ואני יכול להסביר לו מה אני באמת מרגיש."
        />
        {!canAdvance && <Text style={styles.hint}>יש לכתוב פרשנות חדשה כדי להמשיך.</Text>}
        <Pressable style={[styles.primaryButton, !canAdvance && styles.disabledButton]} disabled={!canAdvance} onPress={() => onChange(advanceArcPerspectiveToLinkBehaviour(session))}>
          <Text style={styles.primaryButtonText}>המשך</Text>
        </Pressable>
      </View>
    );
  }

  // currentStep === "link_behaviour"
  return (
    <View>
      {header}
      <Text style={styles.prompt}>קישור ל-ARC Behaviour</Text>
      <Text style={styles.fieldHint}>אפשר לקשר את הפרשנות החדשה לתרגיל התנהגות קיים, כדי לתרגל כיצד לפעול -- או לדלג.</Text>
      {situations.length === 0 && <Text style={styles.hint}>אין עדיין תרגילי ARC Behaviour שמורים.</Text>}
      {situations.map((situation) => {
        const linked = session.linkedArcGymSituationId === situation.id;
        return (
          <Pressable
            key={situation.id}
            style={[styles.situationRow, linked && styles.situationRowLinked]}
            onPress={() => onChange(linked ? unlinkArcGymSituationFromArcPerspectiveSession(session) : linkArcGymSituationToArcPerspectiveSession(session, situation.id))}
          >
            <Text style={styles.situationRowText}>{situation.situationDescription || situation.desiredAction || situation.behaviorText}</Text>
            <Text style={styles.hint}>{linked ? "מקושר ☑" : ""}</Text>
          </Pressable>
        );
      })}
      {!!onCreateNewBehaviour && (
        <Pressable onPress={onCreateNewBehaviour}>
          <Text style={styles.linkText}>ליצור תרגיל התנהגות חדש ב-ARC Gym</Text>
        </Pressable>
      )}
      <Pressable style={styles.primaryButton} onPress={() => onFinish(session)}>
        <Text style={styles.primaryButtonText}>{session.linkedArcGymSituationId ? "סיום" : "דלג וסיום"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 14 },
  linkText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  cancelLink: { color: "#888", fontSize: 14 },
  prompt: { fontSize: 18, textAlign: "right", color: "#333", marginBottom: 10, lineHeight: 27 },
  subPrompt: { fontSize: 15, textAlign: "right", color: "#555", marginBottom: 14, lineHeight: 23 },
  instructionLine: { fontSize: 14, textAlign: "right", color: "#444", marginBottom: 4 },
  hint: { fontSize: 13, color: "#888", textAlign: "right", marginBottom: 8, marginTop: 8 },
  fieldLabel: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#333", marginBottom: 4 },
  secondFieldLabel: { marginTop: 18 },
  fieldHint: { fontSize: 13, color: "#777", textAlign: "right", marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 14 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabledButton: { opacity: 0.5 },
  suggestionChip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: "#F5FAFD" },
  suggestionChipText: { color: "#0a7ea4", fontSize: 13, textAlign: "right" },
  situationRow: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  situationRowLinked: { borderColor: "#0a7ea4", backgroundColor: "#E3F2FB" },
  situationRowText: { flex: 1, fontSize: 14, textAlign: "right", color: "#333" },
});
