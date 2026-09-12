import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { getArcGoal, loadArcBuilds, loadLifeManifestTargets, loadLifeManifests, loadMiniArcBuilds, loadUrgeArcs, upsertArcGoal } from "../data/storage.ts";
import { inferTarget } from "./arcBuildSave.ts";
import { generateArcGoalMappingId, generateArcGoalUrgeMappingId } from "../arc/types.ts";
import type { ArcBuild, ArcGoal, ArcGoalFourWeekProgram, ArcGoalInterferingMapping, ArcGoalUrgeMapping, ExecutionMode, FourWeekProgramWeekNumber, UrgeArc } from "../arc/types.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import { findSubGoalOwner } from "../arc/lifeManifest.ts";
import type { SubGoalOwner } from "../arc/lifeManifest.ts";
import CollapsibleSection from "./CollapsibleSection.tsx";
import { isValidCalendarDateString, todayLocalDateString } from "../program/dateUtils.ts";
import { createFourWeekProgram, FOUR_WEEK_META, FOUR_WEEK_PROGRAM_WEEK_NUMBERS, resolveNextWeekOpeningDate, resolveWeek, setWeekEndDate, setWeekStartDate } from "../arc/fourWeekProgram.ts";

const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  full: "ARC מלא",
  mini: "Mini ARC",
  choose: "בחירה בזמן אמת",
};
const EXECUTION_MODES: ExecutionMode[] = ["full", "mini", "choose"];

/**
 * ARC Goal task: ONE screen editing ONE ArcGoal -- the goal's own
 * fields (name/description/value/goalAction/desiredResult), its
 * REFERENCE to an existing identity ArcBuild (spec section 2), and the
 * ARC Goal linking page itself (spec section 3): a repeatable list of
 * interfering-state -> supportive-protocol -> supportive-action
 * mappings, all converging on the SAME identity protocol. Every
 * reference here is stored as a plain id string -- never a copy of the
 * referenced ArcBuild's own content (see arc/types.ts's ArcGoal doc).
 *
 * Single-page BUILD task (spec section 3): rebuilt as one scrollable
 * page with expandable/collapsible sections (build/CollapsibleSection.tsx)
 * instead of the earlier step-by-step wizard -- no required "המשך"/"הבא"
 * navigation, optional/advanced sections (the urge/interfering mapping
 * lists) collapsed by default, the goal's own core fields and identity
 * protocol choice expanded by default since they're the primary content.
 * Four-Week Program task (spec section 1): adds the "תוכנית ארבעת
 * השבועות" section here -- inside this SAME single-page BUILD, still no
 * multi-screen wizard, collapsed by default (opt-in, advanced). It never
 * asks the trainee to re-enter identity content already captured on the
 * referenced identity ArcBuild -- Value/Desired identity/Desired
 * identity state/Identity Mantra/Future Mantra/Body-language cue/Small
 * identity action are all read live off that ArcBuild's own profile
 * (see identityProtocolBuild below) and shown as a read-only summary
 * with a link to edit them at their own real source; "Target habit" is
 * this goal's own existing goalAction field, also read-only here. Only
 * each week's own schedule/frequency/reminder/notes fields are actually
 * edited on this section.
 */

export default function ArcGoalEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<"loading" | "notFound" | "editing">("loading");
  const [goal, setGoal] = useState<ArcGoal | null>(null);
  const [arcBuilds, setArcBuilds] = useState<ArcBuild[]>([]);
  const [urgeArcs, setUrgeArcs] = useState<UrgeArc[]>([]);
  const [miniArcBuilds, setMiniArcBuilds] = useState<MiniArcBuild[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Sub-goal↔ARC Goal connection task: set only when this ArcGoal was created for/linked to a Life Manifest Sub-goal (goal.lifeManifestSubGoalId) -- drives the context banner + "חזרה לתת־המטרה במניפסט" button below. Never affects this screen's own ArcGoal-editing logic otherwise. */
  const [subGoalContext, setSubGoalContext] = useState<SubGoalOwner | null>(null);
  const [subGoalTargetCount, setSubGoalTargetCount] = useState(0);
  /** Four-Week Program task: the Week 1 start-date draft, only used before the program is enabled (the "enable" action reads this once to build the whole schedule) -- defaults to today, matching every other date-entry default elsewhere in this app. */
  const [week1StartDraft, setWeek1StartDraft] = useState(todayLocalDateString());

  const reloadArcBuilds = useCallback(() => {
    loadArcBuilds().then(setArcBuilds);
  }, []);

  const reloadUrgeArcsAndMiniArcs = useCallback(() => {
    loadUrgeArcs().then(setUrgeArcs);
    loadMiniArcBuilds().then(setMiniArcBuilds);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    Promise.all([getArcGoal(id), loadArcBuilds(), loadUrgeArcs(), loadMiniArcBuilds()]).then(([existing, builds, urgeArcList, miniArcList]) => {
      if (cancelled) return;
      if (!existing) {
        setStatus("notFound");
        return;
      }
      setGoal(existing);
      setArcBuilds(builds);
      setUrgeArcs(urgeArcList);
      setMiniArcBuilds(miniArcList);
      setStatus("editing");

      // Sub-goal↔ARC Goal connection task: load the owning Life Manifest
      // context only when this ArcGoal actually has a back-reference --
      // never for the overwhelming majority of ArcGoals with none.
      if (existing.lifeManifestSubGoalId) {
        Promise.all([loadLifeManifests(), loadLifeManifestTargets()]).then(([manifests, targets]) => {
          if (cancelled) return;
          const owner = findSubGoalOwner(manifests, existing.lifeManifestSubGoalId!);
          setSubGoalContext(owner);
          if (owner) setSubGoalTargetCount(targets.filter((t) => t.subGoalId === owner.subGoal.id).length);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const identityBuilds = arcBuilds.filter((build) => inferTarget(build.profile) === "identity");
  const stateBuilds = arcBuilds.filter((build) => inferTarget(build.profile) === "state");
  /** Four-Week Program task: the ArcBuild goal.identityProtocolId already references -- read here only to DISPLAY its already-configured identity content (never duplicated/re-entered) in the "תוכנית ארבעת השבועות" section below. */
  const identityProtocolBuild = goal ? (arcBuilds.find((build) => build.id === goal.identityProtocolId) ?? null) : null;

  function patchGoal(patch: Partial<ArcGoal>) {
    setGoal((current) => (current ? { ...current, ...patch } : current));
  }

  /** Four-Week Program task: every edit inside that section goes through this one updater, mirroring patchGoal's own shape -- always reads the CURRENT program off the latest goal state, never a stale closed-over copy. */
  function patchFourWeekProgram(updater: (program: ArcGoalFourWeekProgram) => ArcGoalFourWeekProgram) {
    setGoal((current) => {
      if (!current || !current.fourWeekProgram) return current;
      return { ...current, fourWeekProgram: updater(current.fourWeekProgram) };
    });
  }

  function addMapping() {
    if (!goal) return;
    const mapping: ArcGoalInterferingMapping = {
      id: generateArcGoalMappingId(),
      interferingState: "",
      supportiveProtocolId: "",
      supportiveAction: "",
    };
    patchGoal({ interferingMappings: [...goal.interferingMappings, mapping] });
  }

  function updateMapping(mappingId: string, patch: Partial<ArcGoalInterferingMapping>) {
    if (!goal) return;
    patchGoal({
      interferingMappings: goal.interferingMappings.map((m) => (m.id === mappingId ? { ...m, ...patch } : m)),
    });
  }

  function removeMapping(mappingId: string) {
    if (!goal) return;
    patchGoal({ interferingMappings: goal.interferingMappings.filter((m) => m.id !== mappingId) });
  }

  function addUrgeMapping() {
    if (!goal) return;
    const mapping: ArcGoalUrgeMapping = {
      id: generateArcGoalUrgeMappingId(),
      urgeArcId: "",
      need: null,
      miniArcId: null,
      executionMode: "full",
      identityProtocolId: null,
      goalAction: null,
    };
    patchGoal({ urgeMappings: [...goal.urgeMappings, mapping] });
  }

  function updateUrgeMapping(mappingId: string, patch: Partial<ArcGoalUrgeMapping>) {
    if (!goal) return;
    patchGoal({
      urgeMappings: goal.urgeMappings.map((m) => (m.id === mappingId ? { ...m, ...patch } : m)),
    });
  }

  function removeUrgeMapping(mappingId: string) {
    if (!goal) return;
    patchGoal({ urgeMappings: goal.urgeMappings.filter((m) => m.id !== mappingId) });
  }

  function isComplete(g: ArcGoal): boolean {
    return g.name.trim().length > 0 && g.goalAction.trim().length > 0 && g.desiredResult.trim().length > 0;
  }

  async function handleSave() {
    if (!goal) return;
    if (!isComplete(goal)) {
      setSaveError("יש להשלים שם, פעולה קשורה למטרה ותוצאה רצויה לפני השמירה.");
      return;
    }
    setSaveError(null);
    try {
      await upsertArcGoal({ ...goal, updatedAt: new Date().toISOString() });
      router.back();
    } catch {
      setSaveError("אירעה שגיאה בשמירת המטרה. נסה שוב.");
    }
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notFound" || !goal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>המטרה לא נמצאה</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/goals")}>
            <Text style={styles.buttonText}>חזרה לרשימת המטרות</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const complete = isComplete(goal);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{goal.name || "מטרה חדשה"}</Text>
        <Text style={styles.title}>עריכת מטרה</Text>

        {subGoalContext && (
          <View style={styles.subGoalBanner}>
            <Text style={styles.subGoalBannerText}>{`מניפסט חיים: ${subGoalContext.manifest.majorGoals[0]?.title || ""}`}</Text>
            <Text style={styles.subGoalBannerText}>{`מטרה גדולה: ${subGoalContext.majorGoal.title}`}</Text>
            <Text style={styles.subGoalBannerText}>{`תת־מטרה: ${subGoalContext.subGoal.title} (מספר ${subGoalContext.order})`}</Text>
            <Text style={styles.subGoalBannerText}>{`יעדים מחוברים: ${subGoalTargetCount}`}</Text>
            <Pressable
              style={styles.actionButton}
              onPress={() => router.push({ pathname: "/life-manifest/sub-goal/[subGoalId]", params: { subGoalId: subGoalContext.subGoal.id } })}
            >
              <Text style={styles.actionButtonText}>חזרה לתת־המטרה במניפסט</Text>
            </Pressable>
          </View>
        )}

        <CollapsibleSection title="פרטי המטרה" defaultExpanded>
          <View style={styles.sectionBody}>
            <Text style={styles.question}>שם המטרה</Text>
            <TextInput style={styles.textInput} value={goal.name} onChangeText={(text) => patchGoal({ name: text })} textAlign="right" />

            <Text style={styles.question}>תיאור המטרה (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={goal.description ?? ""}
              onChangeText={(text) => patchGoal({ description: text })}
              textAlign="right"
              multiline
            />

            <Text style={styles.question}>מהו הערך שעומד מאחורי המטרה הזאת? (רשות)</Text>
            <TextInput style={styles.textInput} value={goal.value ?? ""} onChangeText={(text) => patchGoal({ value: text })} textAlign="right" />

            <Text style={styles.question}>מהי הפעולה הקשורה למטרה?</Text>
            <TextInput style={styles.textInput} value={goal.goalAction} onChangeText={(text) => patchGoal({ goalAction: text })} textAlign="right" />

            <Text style={styles.question}>מהי התוצאה הרצויה?</Text>
            <TextInput
              style={styles.textInput}
              value={goal.desiredResult}
              onChangeText={(text) => patchGoal({ desiredResult: text })}
              textAlign="right"
            />
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="פרוטוקול זהות מחובר" defaultExpanded>
          <View style={styles.sectionBody}>
            {identityBuilds.length === 0 && (
              <Text style={styles.hint}>עדיין אין לך פרוטוקול זהות. אפשר ליצור אחד ב-BUILD ולחזור לכאן.</Text>
            )}
            <View style={styles.chipColumn}>
              {identityBuilds.map((build) => (
                <Pressable
                  key={build.id}
                  style={[styles.chip, goal.identityProtocolId === build.id && styles.chipSelected]}
                  onPress={() => patchGoal({ identityProtocolId: build.id })}
                >
                  <Text style={styles.chipText}>{build.name}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/build")}>
              <Text style={styles.buttonText}>צור פרוטוקול זהות חדש</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={reloadArcBuilds}>
              <Text style={styles.secondaryButtonText}>רענן רשימה</Text>
            </Pressable>
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="תוכנית ארבעת השבועות">
          <View style={styles.sectionBody}>
            {!goal.fourWeekProgram?.enabled ? (
              <View>
                <Text style={styles.hint}>
                  תוכנית זו מלווה אותך ארבעה שבועות: חיזוק הזהות עם ARCHI, מעבר ל-Mini ARC, תרגול קצר בזמן אמת, וביצוע עצמאי --
                  ורק אחריה תת־המטרה הראשונה הופכת לשלב הפעיל.
                </Text>
                {!goal.identityProtocolId && (
                  <Text style={styles.hint}>יש לבחור פרוטוקול זהות מחובר למעלה לפני הפעלת התוכנית.</Text>
                )}
                <Text style={styles.fieldLabel}>תאריך התחלה מתוכנן לשבוע 1 (YYYY-MM-DD)</Text>
                <TextInput style={styles.textInput} value={week1StartDraft} onChangeText={setWeek1StartDraft} textAlign="right" placeholder="2025-01-06" />
                {!isValidCalendarDateString(week1StartDraft) && (
                  <Text style={styles.hint}>יש להזין תאריך תקין בפורמט YYYY-MM-DD כדי להפעיל את התוכנית.</Text>
                )}
                <Pressable
                  style={[styles.button, styles.fullWidthButton, (!goal.identityProtocolId || !isValidCalendarDateString(week1StartDraft)) && styles.buttonDisabled]}
                  disabled={!goal.identityProtocolId || !isValidCalendarDateString(week1StartDraft)}
                  onPress={() => patchGoal({ fourWeekProgram: createFourWeekProgram(week1StartDraft) })}
                >
                  <Text style={styles.buttonText}>הפעל תוכנית ארבעת השבועות</Text>
                </Pressable>
              </View>
            ) : (
              <FourWeekProgramBuildSection
                program={goal.fourWeekProgram}
                identityProtocolBuild={identityProtocolBuild}
                goalAction={goal.goalAction}
                miniArcBuilds={miniArcBuilds}
                onPatch={patchFourWeekProgram}
                onReloadMiniArcs={reloadUrgeArcsAndMiniArcs}
              />
            )}
          </View>
        </CollapsibleSection>

        <CollapsibleSection title={`דחפים שעלולים להפריע (מסלול הדחף)${goal.urgeMappings.length > 0 ? ` (${goal.urgeMappings.length})` : ""}`}>
          <View style={styles.sectionBody}>
            <Text style={styles.hint}>
              דוגמה: דחף ← Urge ARC ← Mini ARC/ARC מלא ← פעולה מיטיבה חלופית ← פרוטוקול הזהות ← פעולת המטרה. אפשר לחבר כמה דחפים
              לאותו פרוטוקול זהות.
            </Text>
            {urgeArcs.length === 0 && (
              <Text style={styles.hint}>עדיין אין לך Urge ARC. אפשר ליצור אחד במסך "Urge ARC" ולחזור לכאן.</Text>
            )}
            {goal.urgeMappings.map((mapping, index) => (
              <View key={mapping.id} style={styles.mappingCard}>
                <Text style={styles.mappingLabel}>{`דחף ${index + 1}`}</Text>
                <Text style={styles.fieldLabel}>Urge ARC מחובר</Text>
                <View style={styles.chipColumn}>
                  {urgeArcs.map((urgeArc) => (
                    <Pressable
                      key={urgeArc.id}
                      style={[styles.chip, mapping.urgeArcId === urgeArc.id && styles.chipSelected]}
                      onPress={() => updateUrgeMapping(mapping.id, { urgeArcId: urgeArc.id })}
                    >
                      <Text style={styles.chipText}>{urgeArc.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>הצורך שהדחף הזה מנסה לענות עליו (רשות -- לתצוגה מקדימה בזמן זיהוי הצורך)</Text>
                <TextInput
                  style={styles.textInput}
                  value={mapping.need ?? ""}
                  onChangeText={(text) => updateUrgeMapping(mapping.id, { need: text.trim().length > 0 ? text : null })}
                  textAlign="right"
                />
                <Text style={styles.fieldLabel}>Mini ARC מהיר מחובר (רשות)</Text>
                <View style={styles.chipColumn}>
                  <Pressable
                    style={[styles.chip, mapping.miniArcId === null && styles.chipSelected]}
                    onPress={() => updateUrgeMapping(mapping.id, { miniArcId: null })}
                  >
                    <Text style={styles.chipText}>ללא</Text>
                  </Pressable>
                  {miniArcBuilds.map((miniArc) => (
                    <Pressable
                      key={miniArc.id}
                      style={[styles.chip, mapping.miniArcId === miniArc.id && styles.chipSelected]}
                      onPress={() => updateUrgeMapping(mapping.id, { miniArcId: miniArc.id })}
                    >
                      <Text style={styles.chipText}>{miniArc.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>מסלול ביצוע</Text>
                <View style={[styles.chipColumn, styles.chipRow]}>
                  {EXECUTION_MODES.map((mode) => (
                    <Pressable
                      key={mode}
                      style={[styles.chip, (mapping.executionMode ?? "full") === mode && styles.chipSelected]}
                      onPress={() => updateUrgeMapping(mapping.id, { executionMode: mode })}
                    >
                      <Text style={styles.chipText}>{EXECUTION_MODE_LABELS[mode]}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>פרוטוקול זהות מחובר (רשות -- אם ריק, ייעשה שימוש בפרוטוקול הזהות של המטרה)</Text>
                <View style={styles.chipColumn}>
                  <Pressable
                    style={[styles.chip, mapping.identityProtocolId === null && styles.chipSelected]}
                    onPress={() => updateUrgeMapping(mapping.id, { identityProtocolId: null })}
                  >
                    <Text style={styles.chipText}>ברירת מחדל של המטרה</Text>
                  </Pressable>
                  {identityBuilds.map((build) => (
                    <Pressable
                      key={build.id}
                      style={[styles.chip, mapping.identityProtocolId === build.id && styles.chipSelected]}
                      onPress={() => updateUrgeMapping(mapping.id, { identityProtocolId: build.id })}
                    >
                      <Text style={styles.chipText}>{build.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>פעולת מטרה מחוברת (רשות -- אם ריק, ייעשה שימוש בפעולת המטרה הכללית)</Text>
                <TextInput
                  style={styles.textInput}
                  value={mapping.goalAction ?? ""}
                  onChangeText={(text) => updateUrgeMapping(mapping.id, { goalAction: text.trim().length > 0 ? text : null })}
                  textAlign="right"
                />
                <Pressable style={styles.removeButton} onPress={() => removeUrgeMapping(mapping.id)}>
                  <Text style={styles.deleteText}>הסר דחף</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={addUrgeMapping}>
              <Text style={styles.buttonText}>+ הוסף דחף</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={reloadUrgeArcsAndMiniArcs}>
              <Text style={styles.secondaryButtonText}>רענן רשימה</Text>
            </Pressable>
          </View>
        </CollapsibleSection>

        <CollapsibleSection
          title={`מצבים פנימיים שעלולים להפריע${goal.interferingMappings.length > 0 ? ` (${goal.interferingMappings.length})` : ""}`}
        >
          <View style={styles.sectionBody}>
            <Text style={styles.hint}>
              דוגמה: עייפות ← פרוטוקול אנרגיה ← Mini ARC/ARC מלא ← פעולה תומכת קצרה ← פרוטוקול הזהות ← פעולת המטרה.
            </Text>
            {goal.interferingMappings.map((mapping, index) => (
              <View key={mapping.id} style={styles.mappingCard}>
                <Text style={styles.mappingLabel}>{`מיפוי ${index + 1}`}</Text>
                <Text style={styles.fieldLabel}>מצב פנימי שמפריע</Text>
                <TextInput
                  style={styles.textInput}
                  value={mapping.interferingState}
                  onChangeText={(text) => updateMapping(mapping.id, { interferingState: text })}
                  textAlign="right"
                />
                <Text style={styles.fieldLabel}>פרוטוקול המצב התומך</Text>
                {stateBuilds.length === 0 && <Text style={styles.hint}>עדיין אין לך פרוטוקול מצב. אפשר ליצור אחד ב-BUILD.</Text>}
                <View style={styles.chipColumn}>
                  {stateBuilds.map((build) => (
                    <Pressable
                      key={build.id}
                      style={[styles.chip, mapping.supportiveProtocolId === build.id && styles.chipSelected]}
                      onPress={() => updateMapping(mapping.id, { supportiveProtocolId: build.id })}
                    >
                      <Text style={styles.chipText}>{build.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>פעולה תומכת קצרה (הגשר לפרוטוקול הזהות)</Text>
                <TextInput
                  style={styles.textInput}
                  value={mapping.supportiveAction}
                  onChangeText={(text) => updateMapping(mapping.id, { supportiveAction: text })}
                  textAlign="right"
                />
                <Text style={styles.fieldLabel}>Mini ARC מהיר מחובר (רשות)</Text>
                <View style={styles.chipColumn}>
                  <Pressable
                    style={[styles.chip, (mapping.miniArcId ?? null) === null && styles.chipSelected]}
                    onPress={() => updateMapping(mapping.id, { miniArcId: null })}
                  >
                    <Text style={styles.chipText}>ללא</Text>
                  </Pressable>
                  {miniArcBuilds.map((miniArc) => (
                    <Pressable
                      key={miniArc.id}
                      style={[styles.chip, mapping.miniArcId === miniArc.id && styles.chipSelected]}
                      onPress={() => updateMapping(mapping.id, { miniArcId: miniArc.id })}
                    >
                      <Text style={styles.chipText}>{miniArc.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>מסלול ביצוע</Text>
                <View style={[styles.chipColumn, styles.chipRow]}>
                  {EXECUTION_MODES.map((mode) => (
                    <Pressable
                      key={mode}
                      style={[styles.chip, (mapping.executionMode ?? "full") === mode && styles.chipSelected]}
                      onPress={() => updateMapping(mapping.id, { executionMode: mode })}
                    >
                      <Text style={styles.chipText}>{EXECUTION_MODE_LABELS[mode]}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>פרוטוקול זהות מחובר (רשות -- אם ריק, ייעשה שימוש בפרוטוקול הזהות של המטרה)</Text>
                <View style={styles.chipColumn}>
                  <Pressable
                    style={[styles.chip, (mapping.identityProtocolId ?? null) === null && styles.chipSelected]}
                    onPress={() => updateMapping(mapping.id, { identityProtocolId: null })}
                  >
                    <Text style={styles.chipText}>ברירת מחדל של המטרה</Text>
                  </Pressable>
                  {identityBuilds.map((build) => (
                    <Pressable
                      key={build.id}
                      style={[styles.chip, mapping.identityProtocolId === build.id && styles.chipSelected]}
                      onPress={() => updateMapping(mapping.id, { identityProtocolId: build.id })}
                    >
                      <Text style={styles.chipText}>{build.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>פעולת מטרה מחוברת (רשות -- אם ריק, ייעשה שימוש בפעולת המטרה הכללית)</Text>
                <TextInput
                  style={styles.textInput}
                  value={mapping.goalAction ?? ""}
                  onChangeText={(text) => updateMapping(mapping.id, { goalAction: text.trim().length > 0 ? text : null })}
                  textAlign="right"
                />
                <Pressable style={styles.removeButton} onPress={() => removeMapping(mapping.id)}>
                  <Text style={styles.deleteText}>הסר מיפוי</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={addMapping}>
              <Text style={styles.buttonText}>+ הוסף מיפוי</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.secondaryButton, styles.fullWidthButton]}
              onPress={() => {
                reloadArcBuilds();
                reloadUrgeArcsAndMiniArcs();
              }}
            >
              <Text style={styles.secondaryButtonText}>רענן רשימה</Text>
            </Pressable>
          </View>
        </CollapsibleSection>

        {!complete && <Text style={styles.errorText}>יש להשלים שם, פעולה קשורה למטרה ותוצאה רצויה לפני השמירה.</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}
        <Pressable style={[styles.button, styles.fullWidthButton, !complete && styles.buttonDisabled]} disabled={!complete} onPress={handleSave}>
          <Text style={styles.buttonText}>שמור</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Four-Week Program task: the enabled program's own BUILD content --
 * the reused-info read-only summary, Mini ARC link/create controls, and
 * the four per-week nested sections. A local component (not inlined
 * into the main render) purely to keep ArcGoalEditorScreen's own render
 * function from growing much larger -- reads/writes only through the
 * `onPatch` callback its caller already owns (patchFourWeekProgram),
 * exactly like every other section's own update functions.
 */
function FourWeekProgramBuildSection(props: {
  program: ArcGoalFourWeekProgram;
  identityProtocolBuild: ArcBuild | null;
  goalAction: string;
  miniArcBuilds: MiniArcBuild[];
  onPatch: (updater: (program: ArcGoalFourWeekProgram) => ArcGoalFourWeekProgram) => void;
  onReloadMiniArcs: () => void;
}) {
  const { program, identityProtocolBuild, goalAction, miniArcBuilds, onPatch, onReloadMiniArcs } = props;
  const identityProfile = identityProtocolBuild?.profile;

  return (
    <View>
      <Text style={styles.fourWeekSubTitle}>מידע קיים מפרוטוקול הזהות (לעריכה -- יש לפתוח את הפרוטוקול עצמו)</Text>
      {!identityProtocolBuild && <Text style={styles.hint}>לא נבחר פרוטוקול זהות -- חלק מהמידע למטה לא יוצג.</Text>}
      <View style={styles.card}>
        <Text style={styles.body}>{`ערך: ${identityProfile?.value ?? "--"}`}</Text>
        <Text style={styles.body}>{`זהות רצויה: ${identityProfile?.desiredIdentity ?? "--"}`}</Text>
        <Text style={styles.body}>{`מצב הזהות הרצוי: ${identityProfile?.identityDesiredState ?? "--"}`}</Text>
        <Text style={styles.body}>{`הרגל יעד (פעולת המטרה): ${goalAction || "--"}`}</Text>
        <Text style={styles.body}>{`מנטרת זהות: ${identityProfile?.identityEncoding?.mantra ?? "--"}`}</Text>
        <Text style={styles.body}>{`מנטרה מכוונת עתיד: ${identityProfile?.identityFutureOrientedMantra ?? "--"}`}</Text>
        <Text style={styles.body}>{`עוגן שפת גוף: ${identityProfile?.identityEncoding?.bodyLanguageCue ?? "--"}`}</Text>
        <Text style={styles.body}>{`פעולה קטנה מבוססת זהות: ${identityProfile?.identityAction ?? "--"}`}</Text>
        {identityProtocolBuild && (
          <Pressable style={styles.actionButton} onPress={() => router.push({ pathname: "/build/[id]", params: { id: identityProtocolBuild.id } })}>
            <Text style={styles.actionButtonText}>לעריכת פרוטוקול הזהות</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.fourWeekSubTitle}>Mini ARC מקושר (לשבועות 2-3)</Text>
      <View style={styles.chipColumn}>
        <Pressable
          style={[styles.chip, program.linkedMiniArcId === null && styles.chipSelected]}
          onPress={() => onPatch((p) => ({ ...p, linkedMiniArcId: null }))}
        >
          <Text style={styles.chipText}>ללא</Text>
        </Pressable>
        {miniArcBuilds.map((miniArc) => (
          <Pressable
            key={miniArc.id}
            style={[styles.chip, program.linkedMiniArcId === miniArc.id && styles.chipSelected]}
            onPress={() => onPatch((p) => ({ ...p, linkedMiniArcId: miniArc.id }))}
          >
            <Text style={styles.chipText}>{miniArc.name}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/mini-arc")}>
        <Text style={styles.buttonText}>+ צור Mini ARC חדש</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={onReloadMiniArcs}>
        <Text style={styles.secondaryButtonText}>רענן רשימה</Text>
      </Pressable>

      {FOUR_WEEK_PROGRAM_WEEK_NUMBERS.map((weekNumber) => (
        <FourWeekWeekEditor key={weekNumber} program={program} weekNumber={weekNumber} onPatch={onPatch} />
      ))}
    </View>
  );
}

function FourWeekWeekEditor(props: {
  program: ArcGoalFourWeekProgram;
  weekNumber: FourWeekProgramWeekNumber;
  onPatch: (updater: (program: ArcGoalFourWeekProgram) => ArcGoalFourWeekProgram) => void;
}) {
  const { program, weekNumber, onPatch } = props;
  const week = resolveWeek(program, weekNumber);
  const meta = FOUR_WEEK_META[weekNumber];
  const nextOpeningDate = resolveNextWeekOpeningDate(program, weekNumber);

  function patchWeekField<K extends "practiceFrequency" | "recommendedPractice" | "completionRequirement" | "notes">(field: K, value: string) {
    onPatch((p) => {
      const weeks = [...p.weeks] as ArcGoalFourWeekProgram["weeks"];
      weeks[weekNumber - 1] = { ...weeks[weekNumber - 1], [field]: value.trim().length > 0 ? value : null };
      return { ...p, weeks };
    });
  }

  const STATUS_LABELS = { not_started: "טרם התחיל", active: "פעיל", completed: "הושלם" } as const;

  return (
    <CollapsibleSection title={`${meta.title}${week.weekNumber === program.currentWeek ? " (שבוע נוכחי)" : ""}`} defaultExpanded={week.weekNumber === program.currentWeek}>
      <View style={styles.sectionBody}>
        <Text style={styles.hint}>{meta.purpose}</Text>
        <Text style={styles.fieldLabel}>{`סטטוס: ${STATUS_LABELS[week.status]}`}</Text>

        <Text style={styles.fieldLabel}>תאריך התחלה מתוכנן (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.textInput}
          value={week.plannedStartDate ?? ""}
          onChangeText={(text) => onPatch((p) => setWeekStartDate(p, weekNumber, text))}
          textAlign="right"
        />
        <Text style={styles.fieldLabel}>תאריך סיום מתוכנן (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.textInput}
          value={week.plannedEndDate ?? ""}
          onChangeText={(text) => onPatch((p) => setWeekEndDate(p, weekNumber, text))}
          textAlign="right"
        />
        <Text style={styles.body}>{`תאריך התחלה מתוכנן: ${week.plannedStartDate ?? "--"}`}</Text>
        <Text style={styles.body}>{`תאריך סיום מתוכנן: ${week.plannedEndDate ?? "--"}`}</Text>
        {weekNumber < 4 ? (
          <Text style={styles.body}>{`השבוע הבא מתוכנן להיפתח בתאריך: ${nextOpeningDate ?? "--"}`}</Text>
        ) : (
          <Text style={styles.body}>{`תוכנית ארבעת השבועות מתוכננת להסתיים בתאריך: ${week.plannedEndDate ?? "--"}`}</Text>
        )}

        <Text style={styles.fieldLabel}>תדירות תרגול</Text>
        <TextInput style={styles.textInput} value={week.practiceFrequency ?? ""} onChangeText={(text) => patchWeekField("practiceFrequency", text)} textAlign="right" />

        <Text style={styles.fieldLabel}>תרגול מומלץ</Text>
        <TextInput
          style={styles.textInput}
          value={week.recommendedPractice ?? ""}
          onChangeText={(text) => patchWeekField("recommendedPractice", text)}
          textAlign="right"
          multiline
        />

        <View style={styles.switchRow}>
          <Switch
            value={week.remindersEnabled}
            onValueChange={(value) =>
              onPatch((p) => {
                const weeks = [...p.weeks] as ArcGoalFourWeekProgram["weeks"];
                weeks[weekNumber - 1] = { ...weeks[weekNumber - 1], remindersEnabled: value };
                return { ...p, weeks };
              })
            }
          />
          <Text style={styles.fieldLabel}>תזכורות לשבוע זה (רשות)</Text>
        </View>

        <Text style={styles.fieldLabel}>דרישת השלמה (רשות, לתצוגה בלבד)</Text>
        <TextInput
          style={styles.textInput}
          value={week.completionRequirement ?? ""}
          onChangeText={(text) => patchWeekField("completionRequirement", text)}
          textAlign="right"
        />

        <Text style={styles.fieldLabel}>הערות (רשות)</Text>
        <TextInput style={styles.textInput} value={week.notes ?? ""} onChangeText={(text) => patchWeekField("notes", text)} textAlign="right" multiline />
      </View>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, textAlign: "right", color: "#0a7ea4", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  sectionBody: { padding: 14, gap: 4 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 12, marginBottom: 8 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 8 },
  fieldLabel: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 8 },
  body: { fontSize: 15, textAlign: "right", marginBottom: 6 },
  errorText: { fontSize: 14, textAlign: "right", color: "#c0392b", marginTop: 8 },
  subGoalBanner: { backgroundColor: "#f7fbfd", borderRadius: 8, padding: 10, marginBottom: 16 },
  subGoalBannerText: { fontSize: 13, textAlign: "right", color: "#333", marginBottom: 4 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 12 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipColumn: { gap: 8, marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: "center" },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  mappingCard: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 16 },
  mappingLabel: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  removeButton: { marginTop: 12, alignItems: "center" },
  deleteText: { color: "#c0392b", fontSize: 14 },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 8 },
  card: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 12 },
  fourWeekSubTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginTop: 16, marginBottom: 8 },
});
