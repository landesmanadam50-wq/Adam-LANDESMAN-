/**
 * build/ArcAddictionProfileEditorScreen.tsx (route: /arc-addiction/profile/[id], id="new" to create)
 *
 * Creates / edits an ARC Addiction behavior profile: the behavior's
 * name, the bodily sensation tied to the urge and where it is felt, the
 * supportive sensations that helped, whether the behavior may cause
 * bodily harm (=> retrospective logging only), the waiting target
 * (initial value chosen by the user, default 1 minute) and the pace of
 * both progressions. Everything can be edited at any time – including
 * holding or lowering a target. Nothing is saved until "שמירה".
 */

import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { AddictionProfile, AddictionProgressionMode } from "../arc/arcAddiction.ts";
import {
  createAddictionProfile,
  DEFAULT_INITIAL_WAIT_MINUTES,
  generateAddictionProfileId,
  MAX_DURATION_STEP_MINUTES,
  MAX_WAIT_MINUTES,
  MAX_WAIT_STEP_MINUTES,
  MIN_WAIT_MINUTES,
  toggleAddictionBodyArea,
  updateAddictionProfile,
  validateAddictionProfile,
} from "../arc/arcAddiction.ts";
import { ARC_ADDICTION_DISCLAIMER, PROGRESS_NOT_RESET_NOTE } from "../arc/arcAddictionCopy.ts";
import { BODY_SCAN_REGION_LABELS } from "../arc/bodyScanRegions.ts";
import { deleteAddictionProfile, getAddictionProfile, upsertAddictionProfile } from "../data/arcAddictionStorage.ts";
import { mutateAddictionProfile } from "../data/arcAddictionSession.ts";
import BodyMapMagnifier from "../live/components/BodyMapMagnifier.tsx";
import { ARC_ADDICTION_COLORS, arcAddictionStyles as styles } from "../live/components/arcAddictionStyles.ts";

function Stepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (value: number) => void; suffix: string }) {
  return (
    <View style={[styles.row, { justifyContent: "flex-start" }]}>
      <Pressable accessibilityLabel="הוספה" style={styles.chip} onPress={() => onChange(Math.min(max, value + 1))}>
        <Text style={styles.chipText}>＋</Text>
      </Pressable>
      <Text style={[styles.body, { minWidth: 70, textAlign: "center", marginBottom: 0 }]}>{`${value} ${suffix}`}</Text>
      <Pressable accessibilityLabel="הפחתה" style={styles.chip} onPress={() => onChange(Math.max(min, value - 1))}>
        <Text style={styles.chipText}>−</Text>
      </Pressable>
    </View>
  );
}

function ModeChips({ mode, onChange }: { mode: AddictionProgressionMode; onChange: (mode: AddictionProgressionMode) => void }) {
  const options: { value: AddictionProgressionMode; label: string }[] = [
    { value: "increase", label: "התקדמות הדרגתית" },
    { value: "hold", label: "להישאר באותו יעד" },
  ];
  return (
    <View style={styles.row}>
      {options.map((option) => (
        <Pressable key={option.value} style={[styles.chip, mode === option.value && styles.chipSelected]} onPress={() => onChange(option.value)}>
          <Text style={[styles.chipText, mode === option.value && styles.chipTextSelected]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ArcAddictionProfileEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new" || !id;
  const [profile, setProfile] = useState<AddictionProfile | null>(null);
  /** The profile as loaded – only fields the user actually changed are written (onto a freshly loaded copy). */
  const [original, setOriginal] = useState<AddictionProfile | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const nowIso = new Date().toISOString();
      if (isNew) {
        setProfile((current) => current ?? createAddictionProfile(generateAddictionProfileId(), { name: "", initialWaitMinutes: DEFAULT_INITIAL_WAIT_MINUTES }, nowIso));
        return;
      }
      getAddictionProfile(String(id))
        .then((loaded) => {
          setProfile(loaded);
          setOriginal(loaded);
        })
        .catch(() => setProfile(null));
    }, [id, isNew])
  );

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>{!isNew && <Text style={styles.body}>הפרופיל לא נמצא.</Text>}</View>
      </SafeAreaView>
    );
  }

  const patch = (changes: Partial<AddictionProfile>) => setProfile((current) => (current ? { ...current, ...changes } : current));

  async function save() {
    if (!profile || saving) return;
    const validation = validateAddictionProfile(profile);
    setErrors(validation.errors);
    if (!validation.valid) return;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      if (isNew || !original) {
        await upsertAddictionProfile(updateAddictionProfile(profile, {}, nowIso));
      } else {
        const changes: Partial<AddictionProfile> = {};
        for (const key of Object.keys(profile) as (keyof AddictionProfile)[]) {
          if (JSON.stringify(profile[key]) !== JSON.stringify(original[key])) (changes as Record<string, unknown>)[key] = profile[key];
        }
        await mutateAddictionProfile(profile.id, (fresh) => updateAddictionProfile(fresh, changes, nowIso));
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!profile) return;
    await deleteAddictionProfile(profile.id);
    setConfirmDelete(false);
    router.replace("/arc-addiction");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{isNew ? "פרופיל התנהגות חדש" : "עריכת פרופיל"}</Text>

        <Text style={styles.sectionTitle}>שם ההתנהגות</Text>
        <TextInput style={styles.input} value={profile.name} onChangeText={(name) => patch({ name })} placeholder="למשל: חיטוט באוזניים" />

        <Text style={styles.sectionTitle}>התחושה הגופנית הקשורה לדחף</Text>
        <TextInput style={styles.input} value={profile.urgeSensation} onChangeText={(urgeSensation) => patch({ urgeSensation })} placeholder="למשל: עקצוץ ולחץ בתוך האוזניים" />

        <Text style={styles.sectionTitle}>איפה בגוף מורגשת התחושה?</Text>
        <Text style={styles.muted}>{profile.urgeBodyAreas.length > 0 ? profile.urgeBodyAreas.map((area) => BODY_SCAN_REGION_LABELS[area.region]).join(", ") : "סמן אזור אחד או יותר (לא חובה)."}</Text>
        <BodyMapMagnifier
          selectedColor={ARC_ADDICTION_COLORS.urge}
          isSelected={(region, side) => profile.urgeBodyAreas.some((area) => area.region === region && area.side === side)}
          onToggle={(region, side) => patch({ urgeBodyAreas: toggleAddictionBodyArea(profile.urgeBodyAreas, region, side) })}
        />

        <Text style={styles.sectionTitle}>האם ההתנהגות עלולה לגרום נזק גופני?</Text>
        <View style={styles.row}>
          {[
            { value: false, label: "לא" },
            { value: true, label: "כן / לא בטוח" },
          ].map((option) => (
            <Pressable key={option.label} style={[styles.chip, profile.mayCauseBodilyHarm === option.value && styles.chipSelected]} onPress={() => patch({ mayCauseBodilyHarm: option.value })}>
              <Text style={[styles.chipText, profile.mayCauseBodilyHarm === option.value && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.muted}>בהתנהגות שעלולה לגרום נזק, משך ההתנהגות מתועד רק בדיעבד – בלי טיימר שפועל בזמן ההתנהגות.</Text>

        <Text style={styles.sectionTitle}>{isNew ? "זמן המתנה התחלתי" : "יעד זמן ההמתנה הנוכחי"}</Text>
        <Stepper value={profile.waitTargetMinutes} min={MIN_WAIT_MINUTES} max={MAX_WAIT_MINUTES} suffix="דק'" onChange={(waitTargetMinutes) => patch({ waitTargetMinutes })} />
        <Text style={styles.muted}>אפשר להגדיל, להשאיר או להקטין את היעד בכל שלב.</Text>

        <Text style={styles.sectionTitle}>קצב ההתקדמות בזמן ההמתנה</Text>
        <ModeChips mode={profile.waitProgression.mode} onChange={(mode) => patch({ waitProgression: { ...profile.waitProgression, mode } })} />
        {profile.waitProgression.mode === "increase" && (
          <View>
            <Text style={styles.muted}>בכל פעם שתעמוד ביעד, היעד הבא יגדל ב:</Text>
            <Stepper
              value={profile.waitProgression.stepMinutes}
              min={1}
              max={MAX_WAIT_STEP_MINUTES}
              suffix="דק'"
              onChange={(stepMinutes) => patch({ waitProgression: { ...profile.waitProgression, stepMinutes } })}
            />
          </View>
        )}

        <Text style={styles.sectionTitle}>צמצום משך ההתנהגות</Text>
        {profile.behaviorDurationTargetMinutes === null ? (
          <Text style={styles.muted}>היעד העדין ייקבע לפי המשך הראשון שתתעד.</Text>
        ) : (
          <View>
            <Text style={styles.muted}>יעד עדין נוכחי למשך ההתנהגות:</Text>
            <Stepper
              value={profile.behaviorDurationTargetMinutes}
              min={1}
              max={24 * 60}
              suffix="דק'"
              onChange={(behaviorDurationTargetMinutes) => patch({ behaviorDurationTargetMinutes })}
            />
          </View>
        )}
        <ModeChips mode={profile.durationProgression.mode} onChange={(mode) => patch({ durationProgression: { ...profile.durationProgression, mode } })} />
        {profile.durationProgression.mode === "increase" && (
          <View>
            <Text style={styles.muted}>כשמשך ההתנהגות עומד ביעד, היעד הבא יקטן ב:</Text>
            <Stepper
              value={profile.durationProgression.stepMinutes}
              min={1}
              max={MAX_DURATION_STEP_MINUTES}
              suffix="דק'"
              onChange={(stepMinutes) => patch({ durationProgression: { ...profile.durationProgression, stepMinutes } })}
            />
          </View>
        )}
        <Text style={styles.muted}>{PROGRESS_NOT_RESET_NOTE}</Text>

        {profile.supportiveSensations.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>תחושות תומכות שעזרו</Text>
            {profile.supportiveSensations.map((sensation, index) => (
              <View key={`${sensation.label}-${index}`} style={[styles.row, { justifyContent: "space-between" }]}>
                <Text style={styles.body}>{`${sensation.label}${sensation.region ? ` · ${BODY_SCAN_REGION_LABELS[sensation.region]}` : ""}`}</Text>
                <Pressable style={styles.linkButton} onPress={() => patch({ supportiveSensations: profile.supportiveSensations.filter((_, i) => i !== index) })}>
                  <Text style={[styles.linkButtonText, styles.dangerText]}>הסרה</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {errors.map((error) => (
          <Text key={error} style={[styles.body, styles.dangerText]}>
            {error}
          </Text>
        ))}

        <Pressable style={[styles.button, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>
          <Text style={styles.buttonText}>שמירה</Text>
        </Pressable>
        {!isNew && (
          <Pressable style={styles.linkButton} onPress={() => setConfirmDelete(true)}>
            <Text style={[styles.linkButtonText, styles.dangerText]}>מחיקת הפרופיל</Text>
          </Pressable>
        )}

        <Text style={[styles.muted, { marginTop: 16 }]}>{ARC_ADDICTION_DISCLAIMER}</Text>
      </ScrollView>

      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 20 }}>
            <Text style={styles.sectionTitle}>למחוק את הפרופיל?</Text>
            <Text style={styles.body}>היסטוריית התרגולים נשמרת, אבל הפרופיל לא יופיע יותר.</Text>
            <Pressable style={[styles.button, { backgroundColor: ARC_ADDICTION_COLORS.danger }]} onPress={() => void remove()}>
              <Text style={styles.buttonText}>מחיקה</Text>
            </Pressable>
            <Pressable style={styles.linkButton} onPress={() => setConfirmDelete(false)}>
              <Text style={styles.linkButtonText}>ביטול</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
