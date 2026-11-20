import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { loadTaskAlarmRealTaskTestResult, loadTaskAlarmTestResult } from "../data/storage.ts";
import type { ArcAlarmRealTestResult, ArcAlarmTestKind, TaskAlarmRealTaskTestResult, TaskAlarmTestResult } from "../data/storage.ts";
import {
  armRealPlannedArcAlarmTest,
  armRealTaskAlarmTest,
  armTestAlarm,
  diagnoseAllPlannedArcAlarms,
  getAlarmPowerManagerInfo,
  getExactAlarmPermissionStatus,
  openAlarmPowerManagerSettings,
  openExactAlarmPermissionSettings,
  recordTestAlarmSelfReport,
  refreshArcAlarmRealTestStatus,
  refreshRealTaskAlarmTestStatus,
} from "../data/taskAlarm.ts";
import type { AlarmPowerManagerInfo, PlannedArcAlarmDiagnostics } from "../data/taskAlarm.ts";
import type { PlannedArc } from "../arc/plannedArc.ts";
import { AndroidNotificationSetting } from "@notifee/react-native";

const ARC_ALARM_TEST_LABELS: Record<ArcAlarmTestKind, string> = {
  standalone: "ARC עצמאי",
  before_task: "ARC לפני משימה",
  mini: "Mini ARC",
};

/**
 * build/TaskAlarmDiagnosticsScreen.tsx (route /tasks/alarm-diagnostics)
 *
 * Critical-bug task ("Native Alarm Still Not Working"), Step 2: lets
 * the trainee set a REAL test alarm one minute out -- through the
 * exact same scheduling path (data/taskAlarm.ts's armTestAlarm) a real
 * task's own alarm uses -- and see, concretely:
 *   - whether SCHEDULING itself succeeded (armError, shown verbatim --
 *     never swallowed, per the trainee's own explicit requirement)
 *   - what fire time was actually saved
 *   - whether the native ring ACTUALLY STARTED (firedAt -- an
 *     objective signal set only by the foreground-service handler
 *     itself, never inferred from scheduling alone)
 *   - the trainee's own self-reported sound/vibration/screen answers
 *     (JS cannot detect those in the real world)
 *
 * Reloads on focus so returning to the app (after backgrounding it to
 * wait out the minute) picks up whatever the native side recorded
 * while this screen wasn't open.
 */
export default function TaskAlarmDiagnosticsScreen() {
  const [result, setResult] = useState<TaskAlarmTestResult | null>(null);
  const [starting, setStarting] = useState(false);
  const [realResult, setRealResult] = useState<TaskAlarmRealTaskTestResult | null>(null);
  const [startingReal, setStartingReal] = useState(false);
  const [powerInfo, setPowerInfo] = useState<AlarmPowerManagerInfo | null>(null);
  const [exactAlarmPermission, setExactAlarmPermission] = useState<AndroidNotificationSetting | null>(null);
  const [arcDiagnostics, setArcDiagnostics] = useState<{ item: PlannedArc; diagnostics: PlannedArcAlarmDiagnostics }[]>([]);
  const [arcTestResults, setArcTestResults] = useState<Record<ArcAlarmTestKind, ArcAlarmRealTestResult | null>>({ standalone: null, before_task: null, mini: null });
  const [startingArcTest, setStartingArcTest] = useState<ArcAlarmTestKind | null>(null);

  const reload = useCallback(() => {
    loadTaskAlarmTestResult().then(setResult);
    loadTaskAlarmRealTaskTestResult().then((existing) => {
      if (existing) refreshRealTaskAlarmTestStatus().then(setRealResult);
    });
    // Alarm reliability task: real, device-reported info (manufacturer/
    // model/the OEM's own background-restriction settings screen, if
    // any) -- never a guess, and this screen's own honest "nothing more
    // to do here" case is activity === null, not hidden/assumed.
    getAlarmPowerManagerInfo().then(setPowerInfo);
    // ARC alarm diagnostics task, section 2: the Android 12+ exact-alarm
    // permission state, read fresh every focus (the trainee may have
    // just come back from the system settings screen).
    getExactAlarmPermissionStatus().then(setExactAlarmPermission);
    // Section 2: every currently alarm-enabled planned ARC's own live
    // diagnostics (enabled/next time/notification id/OS registration) --
    // never just this screen's own saved test results.
    diagnoseAllPlannedArcAlarms().then(setArcDiagnostics);
    // Section 5: re-checks OS registration (never re-arms) for whichever
    // of the three ARC test kinds already has a tracked result.
    for (const kind of ["standalone", "before_task", "mini"] as const) {
      refreshArcAlarmRealTestStatus(kind).then((updated) => {
        if (updated) setArcTestResults((current) => ({ ...current, [kind]: updated }));
      });
    }
  }, []);

  useFocusEffect(reload);

  async function startTest() {
    setStarting(true);
    const next = await armTestAlarm();
    setResult(next);
    setStarting(false);
  }

  async function report(patch: Parameters<typeof recordTestAlarmSelfReport>[0]) {
    const next = await recordTestAlarmSelfReport(patch);
    if (next) setResult(next);
  }

  async function startRealTaskTest() {
    setStartingReal(true);
    const next = await armRealTaskAlarmTest();
    setRealResult(next);
    setStartingReal(false);
  }

  async function startArcTest(kind: ArcAlarmTestKind) {
    setStartingArcTest(kind);
    const next = await armRealPlannedArcAlarmTest(kind);
    setArcTestResults((current) => ({ ...current, [kind]: next }));
    setStartingArcTest(null);
  }

  function formatClock(iso: string): string {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  }

  const firedLate = result !== null && result.firedAt === null && result.armError === null && new Date(result.fireAt).getTime() < Date.now() - 5000;

  const realFiredLate =
    realResult !== null && realResult.firedAt === null && realResult.armError === null && realResult.fireAt !== null && new Date(realResult.fireAt).getTime() < Date.now() - 5000;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>בדיקת שעון מעורר</Text>
        <Text style={styles.hint}>
          לוחצים על הכפתור, ואז אפשר לנעול את המסך או לעבור לאפליקציה אחרת -- תוך דקה השעון אמור לצלצל ולרטוט. חוזרים למסך הזה כדי לראות מה קרה בפועל.
        </Text>

        <Pressable style={[styles.primaryButton, starting && styles.disabledButton]} onPress={startTest} disabled={starting}>
          <Text style={styles.primaryButtonText}>{starting ? "מתזמן..." : "קבע התראת בדיקה לעוד דקה"}</Text>
        </Pressable>

        {result && (
          <View style={styles.resultBlock}>
            <Text style={styles.resultRow}>תוזמן בשעה: {formatClock(result.scheduledAt)}</Text>
            <Text style={styles.resultRow}>שעת ההפעלה שנשמרה: {formatClock(result.fireAt)}</Text>

            {result.armError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>התזמון נכשל:</Text>
                <Text style={styles.errorText}>{result.armError}</Text>
              </View>
            )}

            {!result.armError && (
              <>
                <Text style={styles.resultRow}>
                  {result.firedAt ? `השעון הופעל בפועל בשעה ${formatClock(result.firedAt)} ✓` : firedLate ? "השעון לא הופעל בפועל, אף שהשעה שנקבעה כבר עברה." : "ממתין למועד ההפעלה..."}
                </Text>
                {firedLate && (
                  <Text style={styles.errorText}>
                    התזמון עצמו הצליח, אבל השעון לא התריע בפועל. ייתכן שהמכשיר חוסם את האפליקציה ברקע -- ראו את רשימת ההרשאות הספציפיות ל-Xiaomi/MIUI למטה.
                  </Text>
                )}
              </>
            )}

            <Text style={[styles.resultRow, styles.selfReportTitle]}>מה קרה בפועל כשהשעון היה אמור לצלצל?</Text>

            <SelfReportRow label="נשמע צליל?" value={result.soundHeard} onChange={(value) => report({ soundHeard: value })} />
            <SelfReportRow label="הורגש רטט?" value={result.vibrationFelt} onChange={(value) => report({ vibrationFelt: value })} />
            <SelfReportRow label="הופיע מסך שעון מעורר?" value={result.alarmScreenShown} onChange={(value) => report({ alarmScreenShown: value })} />
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.title}>בדיקת משימה אמיתית (שתי דקות)</Text>
        <Text style={styles.hint}>
          זה בודק את המסלול האמיתי: יצירת משימה, שמירתה, ותזמון השעון שלה -- בדיוק כמו משימה רגילה -- ולא רק את מנגנון השעון בבדיקה הידנית למעלה.
        </Text>

        <Pressable style={[styles.primaryButton, startingReal && styles.disabledButton]} onPress={startRealTaskTest} disabled={startingReal}>
          <Text style={styles.primaryButtonText}>{startingReal ? "יוצר ומתזמן..." : "צור משימת בדיקה שתתחיל בעוד 2 דקות"}</Text>
        </Pressable>

        {realResult && (
          <View style={styles.resultBlock}>
            <Text style={styles.resultRow}>1. המשימה נשמרה: &quot;{realResult.taskTitle}&quot; (מתוזמנת ל-{realResult.scheduledDate} {realResult.scheduledTime}) ✓</Text>

            {realResult.armError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>2. השעון לא תוזמן:</Text>
                <Text style={styles.errorText}>{realResult.armError}</Text>
              </View>
            ) : (
              <Text style={styles.resultRow}>2. השעון תוזמן בהצלחה ✓</Text>
            )}

            {realResult.fireAt && <Text style={styles.resultRow}>3. שעת ההפעלה המדויקת שנשמרה: {formatClock(realResult.fireAt)}</Text>}

            {!realResult.armError && (
              <Text style={styles.resultRow}>4. {realResult.registeredWithOsOnLastCheck ? "השעון רשום במערכת ה-Android כרגע ✓" : "השעון אינו רשום במערכת ה-Android כרגע -- משהו ביטל אותו."}</Text>
            )}

            {!realResult.armError && (
              <>
                <Text style={styles.resultRow}>
                  5. {realResult.firedAt ? `השעון הופעל בפועל בשעה ${formatClock(realResult.firedAt)} ✓` : realFiredLate ? "השעון לא הופעל בפועל, אף שהשעה שנקבעה כבר עברה." : "ממתין למועד ההפעלה..."}
                </Text>
                {realFiredLate && realResult.registeredWithOsOnLastCheck && (
                  <Text style={styles.errorText}>השעון תוזמן ועדיין רשום במערכת, אבל לא הופעל בפועל -- ייתכן שה-AlarmManager נחסם בזמן ההפעלה עצמו.</Text>
                )}
                {realFiredLate && !realResult.registeredWithOsOnLastCheck && (
                  <Text style={styles.errorText}>השעון תוזמן בהצלחה, אבל נעלם מהמערכת לפני שהתריע -- משהו ביטל אותו לפני הזמן (ראו גם את "הגדרות שעון מעורר" לבדוק אם ישנה סנכרון שמבטל שעונים).</Text>
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.title}>אבחון שעון ARC</Text>
        <Text style={styles.hint}>
          מידע חי מהמערכת -- לא רק הנתונים השמורים של ARCHI -- על כל תרגיל שהוגדר לו שעון מעורר, בתוספת בדיקה אמיתית בעוד שתי דקות דרך אותו מסלול תזמון בדיוק.
        </Text>

        <Text style={styles.resultRow}>
          הרשאת Exact Alarm (אנדרואיד 12+):{" "}
          {exactAlarmPermission === AndroidNotificationSetting.ENABLED
            ? "מופעלת ✓"
            : exactAlarmPermission === AndroidNotificationSetting.DISABLED
              ? "כבויה"
              : "לא רלוונטית למכשיר זה"}
        </Text>
        {exactAlarmPermission === AndroidNotificationSetting.DISABLED && (
          <Pressable style={styles.secondaryButton} onPress={() => openExactAlarmPermissionSettings()}>
            <Text style={styles.secondaryButtonText}>פתיחת הרשאת שעונים מדויקים</Text>
          </Pressable>
        )}

        {arcDiagnostics.length === 0 ? (
          <Text style={styles.hint}>אין כרגע תרגיל עם שעון מעורר דלוק.</Text>
        ) : (
          arcDiagnostics.map(({ item, diagnostics }) => (
            <View key={item.id} style={styles.resultBlock}>
              <Text style={[styles.resultRow, styles.selfReportTitle]}>
                {item.name} ({item.kind === "mini" ? "Mini" : "מלא"})
              </Text>
              <Text style={styles.resultRow}>תזמון: {diagnostics.timingKind === "before_task" ? "לפני המשימה" : "עצמאי"}</Text>
              <Text style={styles.resultRow}>התרגול הבא (מחושב עכשיו): {diagnostics.computedNextFireAt ? formatClock(diagnostics.computedNextFireAt) : "אין תרגול קרוב"}</Text>
              <Text style={styles.resultRow}>מזהה התראה שמור: {diagnostics.storedNotificationId ?? "אין"}</Text>
              <Text style={styles.resultRow}>רשום בפועל במערכת: {diagnostics.isRegisteredWithOs ? "כן ✓" : "לא"}</Text>
              {diagnostics.storedNotificationId && !diagnostics.isRegisteredWithOs && (
                <Text style={styles.errorText}>יש מזהה שמור אך הוא לא רשום במערכת בפועל -- משהו ביטל את השעון הנייטיבי מתחת לרגליים.</Text>
              )}
            </View>
          ))
        )}

        <Text style={[styles.resultRow, styles.selfReportTitle]}>בדיקת שעון ARC אמיתי בעוד שתי דקות</Text>
        {(["standalone", "before_task", "mini"] as const).map((kind) => {
          const testResult = arcTestResults[kind];
          const arcFiredLate =
            testResult !== null && testResult.firedAt === null && testResult.armError === null && testResult.fireAt !== null && new Date(testResult.fireAt).getTime() < Date.now() - 5000;
          return (
            <View key={kind} style={styles.resultBlock}>
              <Pressable style={[styles.primaryButton, startingArcTest === kind && styles.disabledButton]} onPress={() => startArcTest(kind)} disabled={startingArcTest !== null}>
                <Text style={styles.primaryButtonText}>{startingArcTest === kind ? "מתזמן..." : `בדיקת ${ARC_ALARM_TEST_LABELS[kind]}`}</Text>
              </Pressable>
              {testResult && (
                <>
                  {testResult.armError ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorTitle}>השעון לא תוזמן:</Text>
                      <Text style={styles.errorText}>{testResult.armError}</Text>
                    </View>
                  ) : (
                    <>
                      {testResult.fireAt && <Text style={styles.resultRow}>שעת ההפעלה שנשמרה: {formatClock(testResult.fireAt)}</Text>}
                      <Text style={styles.resultRow}>{testResult.registeredWithOsOnLastCheck ? "השעון רשום במערכת ה-Android כרגע ✓" : "השעון אינו רשום במערכת ה-Android כרגע -- משהו ביטל אותו."}</Text>
                      <Text style={styles.resultRow}>
                        {testResult.firedAt ? `השעון הופעל בפועל בשעה ${formatClock(testResult.firedAt)} ✓` : arcFiredLate ? "השעון לא הופעל בפועל, אף שהשעה שנקבעה כבר עברה." : "ממתין למועד ההפעלה..."}
                      </Text>
                      {arcFiredLate && testResult.registeredWithOsOnLastCheck && (
                        <Text style={styles.errorText}>השעון תוזמן ועדיין רשום במערכת, אבל לא הופעל בפועל -- ייתכן שה-AlarmManager נחסם בזמן ההפעלה עצמו.</Text>
                      )}
                      {arcFiredLate && !testResult.registeredWithOsOnLastCheck && (
                        <Text style={styles.errorText}>השעון תוזמן בהצלחה, אבל נעלם מהמערכת לפני שהתריע -- משהו ביטל אותו לפני הזמן.</Text>
                      )}
                    </>
                  )}
                </>
              )}
            </View>
          );
        })}

        <View style={styles.divider} />

        <Text style={styles.title}>שחזור שעונים אחרי הפעלה מחדש של הטלפון</Text>
        <Text style={styles.hint}>
          שעוני המשימות ו-ARC משוחזרים אוטומטית אחרי הפעלה מחדש של הטלפון, בלי לפתוח את ARCHI -- המנגנון הנייטיבי של מערכת ההתראות שומר אותם ומפעיל אותם מחדש בעצמו. לתשומת לבכם: אם הטלפון נשאר כבוי אחרי המועד שהשעון היה צריך לצלצל בו, השעון עשוי לצלצל כמעט מיידית עם ההפעלה מחדש, במקום להידחות אוטומטית למועד הבא -- זו מגבלה של המנגנון הבסיסי במערכת ואין לנו דרך בטוחה לתקן אותה בלי לכתוב ולבדוק קוד נייטיבי חדש במכשיר אמיתי.
        </Text>

        {powerInfo && (
          <View style={styles.resultBlock}>
            {(powerInfo.manufacturer || powerInfo.model) && (
              <Text style={styles.resultRow}>
                מכשיר זה: {powerInfo.manufacturer ?? ""} {powerInfo.model ?? ""}
              </Text>
            )}
            {powerInfo.activity ? (
              <Pressable style={styles.secondaryButton} onPress={() => openAlarmPowerManagerSettings()}>
                <Text style={styles.secondaryButtonText}>פתיחת הגדרות חיסכון בסוללה/רקע של היצרן</Text>
              </Pressable>
            ) : (
              <Text style={styles.resultRow}>אין למכשיר זה מסך הגדרות יצרן נפרד לזיהוי -- יש לבדוק את הגדרות הסוללה/הרקע הכלליות של Android.</Text>
            )}
          </View>
        )}

        <View style={styles.miuiBox}>
          <Text style={styles.miuiTitle}>במכשירי Xiaomi / MIUI יש לבדוק גם:</Text>
          <Text style={styles.miuiItem}>• אפליקציית האבטחה (Security) ← הרשאות ← הפעלה אוטומטית (Autostart) -- מופעל עבור ARCHI</Text>
          <Text style={styles.miuiItem}>• הגדרות סוללה עבור האפליקציה ← ללא הגבלות (No restrictions)</Text>
          <Text style={styles.miuiItem}>• הרשאות אחרות ← הצגת חלונות קופצים ברקע / הצגה על מסך הנעילה</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SelfReportRow({ label, value, onChange }: { label: string; value: boolean | null; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.selfReportRow}>
      <Text style={styles.selfReportLabel}>{label}</Text>
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, value === true && styles.chipSelected]} onPress={() => onChange(true)}>
          <Text style={[styles.chipText, value === true && styles.chipTextSelected]}>כן</Text>
        </Pressable>
        <Pressable style={[styles.chip, value === false && styles.chipSelected]} onPress={() => onChange(false)}>
          <Text style={[styles.chipText, value === false && styles.chipTextSelected]}>לא</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 16, lineHeight: 19 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 4 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  disabledButton: { opacity: 0.5 },
  resultBlock: { marginTop: 20, gap: 8 },
  resultRow: { fontSize: 14, textAlign: "right", color: "#222" },
  selfReportTitle: { fontWeight: "700", marginTop: 10 },
  errorBox: { backgroundColor: "#FDEDEE", borderRadius: 10, padding: 12, marginTop: 4 },
  errorTitle: { color: "#B00020", fontWeight: "700", textAlign: "right", marginBottom: 4 },
  errorText: { color: "#B00020", textAlign: "right", fontSize: 13, lineHeight: 18 },
  selfReportRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  selfReportLabel: { fontSize: 14, textAlign: "right", color: "#222" },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  chipTextSelected: { color: "#fff" },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 28 },
  miuiBox: { backgroundColor: "#FFF8E1", borderRadius: 10, padding: 14, marginTop: 24 },
  miuiTitle: { fontWeight: "700", textAlign: "right", marginBottom: 8, color: "#6B5300" },
  miuiItem: { fontSize: 13, textAlign: "right", color: "#6B5300", lineHeight: 19, marginBottom: 4 },
});
