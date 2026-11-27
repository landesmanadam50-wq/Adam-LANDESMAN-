/**
 * live/components/ArcAddictionArcRunner.tsx
 *
 * Renders one ARC Addiction exercise (ARC למסוגלות or ARC לקבלה עצמית)
 * step by step, from arc/arcAddictionArc.ts's pure step sequence, using
 * the app's EXISTING ARC building blocks:
 *   - ArcBodyMantraCircle for presence / urge & thought acceptance /
 *     dwelling / acceptance / regulation / encoding (tap the circle to
 *     continue, exactly like Full ARC),
 *   - BodyMapMagnifier (BodySilhouetteMap) for marking where the
 *     sensation is felt and placing the supportive anchor,
 *   - the shared supportive-sensation bank for "what helped before"
 *     (context key per profile), with the effect rating fed back.
 *
 * The exercise can always be skipped, and every rating / text is
 * optional – the ARC must never turn into a rigid requirement.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import type { AddictionProfile } from "../../arc/arcAddiction.ts";
import { HELPFUL_SUPPORTIVE_RATING_THRESHOLD, mergeHelpfulSupportiveSensation, resolveAddictionSensationContextKey } from "../../arc/arcAddiction.ts";
import type { AddictionArcState, AddictionSupportiveChoice } from "../../arc/arcAddictionArc.ts";
import {
  ACCEPTANCE_REACTION_OPTIONS,
  advanceArcState,
  backArcState,
  getArcStepCopy,
  getArcSteps,
  getCurrentArcStep,
  resolveArcCircleRegions,
  resolveCircleStage,
  setArcRating,
  setArcSupportive,
  setArcText,
  toggleArcMarkedArea,
  toggleArcReaction,
} from "../../arc/arcAddictionArc.ts";
import { BODY_SCAN_REGION_LABELS } from "../../arc/bodyScanRegions.ts";
import { SUPPORTIVE_SENSATION_OPTIONS } from "../../arc/newArcLiveTypes.ts";
import type { PositiveMemory } from "../../arc/positiveMemory.ts";
import { recordBodySensationDiscovery, recordBodySensationRating, resolveSuggestedBodySensations } from "../../arc/supportiveBodySensation.ts";
import { upsertAddictionProfile } from "../../data/arcAddictionStorage.ts";
import { appendSupportiveBodySensationUsageEntry, loadSupportiveBodySensationUsages, updateSupportiveBodySensationUsageEntry } from "../../data/storage.ts";
import ArcBodyMantraCircle from "./ArcBodyMantraCircle.tsx";
import ArcAddictionRatingRow from "./ArcAddictionRatingRow.tsx";
import BodyMapMagnifier from "./BodyMapMagnifier.tsx";
import { ARC_ADDICTION_COLORS, arcAddictionStyles as styles } from "./arcAddictionStyles.ts";

export interface ArcAddictionArcRunnerProps {
  arc: AddictionArcState;
  profile: AddictionProfile;
  /** A previous success moment of this profile (efficacy ARC only) – the "success_memory" step is skipped when null. */
  successMemory: PositiveMemory | null;
  onAnotherSuccessMemory?: () => void;
  presenceColor: string;
  circleColor: string;
  /** Persist every step change (so leaving the app resumes on the same step). */
  onChange: (arc: AddictionArcState) => void;
  onComplete: (arc: AddictionArcState) => void;
  onSkip: () => void;
}

interface SupportiveOption {
  key: string;
  label: string;
  region: AddictionSupportiveChoice["region"];
  side: AddictionSupportiveChoice["side"];
  movementLabel: string | null;
  fromPast: boolean;
}

function regionSuffix(option: { region: AddictionSupportiveChoice["region"] }): string {
  return option.region ? ` · ${BODY_SCAN_REGION_LABELS[option.region]}` : "";
}

export default function ArcAddictionArcRunner({
  arc,
  profile,
  successMemory,
  onAnotherSuccessMemory,
  presenceColor,
  circleColor,
  onChange,
  onComplete,
  onSkip,
}: ArcAddictionArcRunnerProps) {
  const [pastOptions, setPastOptions] = useState<SupportiveOption[]>([]);
  const [customSupportive, setCustomSupportive] = useState("");
  const completingRef = useRef(false);
  const contextKey = resolveAddictionSensationContextKey(profile.id, arc.kind);
  const step = getCurrentArcStep(arc);
  const copy = getArcStepCopy(arc, profile);
  const context = { hasSuccessMemory: arc.kind === "efficacy" && successMemory !== null };
  const steps = getArcSteps(arc.kind);

  // "What helped before": ranked suggestions from the shared bank for THIS profile + the profile's own pinned sensations.
  useEffect(() => {
    let cancelled = false;
    loadSupportiveBodySensationUsages()
      .then((usages) => {
        if (cancelled) return;
        const ranked = resolveSuggestedBodySensations([contextKey], usages, 4)
          .filter((entry) => entry.sensationLabel)
          .map((entry) => ({
            key: `past:${entry.sensationLabel}:${entry.region ?? ""}:${entry.side ?? ""}`,
            label: entry.sensationLabel as string,
            region: entry.region,
            side: entry.side,
            movementLabel: entry.movementLabel,
            fromPast: true,
          }));
        const pinned = profile.supportiveSensations.map((entry) => ({
          key: `pinned:${entry.label}:${entry.region ?? ""}:${entry.side ?? ""}`,
          label: entry.label,
          region: entry.region,
          side: entry.side,
          movementLabel: entry.movementLabel,
          fromPast: true,
        }));
        const seen = new Set<string>();
        setPastOptions(
          [...pinned, ...ranked].filter((option) => {
            const id = `${option.label}:${option.region ?? ""}:${option.side ?? ""}`;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          })
        );
      })
      .catch(() => setPastOptions([]));
    return () => {
      cancelled = true;
    };
  }, [contextKey, profile.supportiveSensations]);

  const circle = useMemo(() => resolveArcCircleRegions(arc), [arc]);

  async function recordSupportiveDiscoveryIfNeeded(state: AddictionArcState): Promise<AddictionArcState> {
    if (!state.supportive || state.supportive.usageId) return state;
    const usage = recordBodySensationDiscovery(contextKey, state.supportive.region, state.supportive.side, state.supportive.label, state.supportive.movementLabel, "full", new Date().toISOString());
    try {
      await appendSupportiveBodySensationUsageEntry(usage);
      return setArcSupportive(state, { ...state.supportive, usageId: usage.id });
    } catch {
      return state;
    }
  }

  async function finish(state: AddictionArcState) {
    if (completingRef.current) return;
    completingRef.current = true;
    const nowIso = new Date().toISOString();
    if (state.supportive?.usageId && state.supportiveEffectRating !== null) {
      try {
        const usages = await loadSupportiveBodySensationUsages();
        const usage = usages.find((entry) => entry.id === state.supportive?.usageId);
        if (usage) await updateSupportiveBodySensationUsageEntry(recordBodySensationRating(usage, state.supportiveEffectRating, state.supportiveEffectRating >= HELPFUL_SUPPORTIVE_RATING_THRESHOLD, nowIso));
      } catch (error) {
        console.warn("[ArcAddictionArcRunner] could not store the supportive rating", error);
      }
    }
    if (state.supportive) {
      const merged = mergeHelpfulSupportiveSensation(
        profile,
        { region: state.supportive.region, side: state.supportive.side, label: state.supportive.label, movementLabel: state.supportive.movementLabel },
        state.supportiveEffectRating,
        nowIso
      );
      if (merged !== profile) await upsertAddictionProfile(merged).catch(() => undefined);
    }
    onComplete(state);
  }

  async function next() {
    let state = arc;
    if (step === "supportive_select") state = await recordSupportiveDiscoveryIfNeeded(state);
    const advanced = advanceArcState(state, context);
    if (!advanced) {
      await finish(state);
      return;
    }
    onChange(advanced);
  }

  function back() {
    onChange(backArcState(arc, context));
  }

  function chooseSupportive(option: SupportiveOption | null) {
    if (!option) {
      onChange(setArcSupportive(arc, null));
      return;
    }
    onChange(setArcSupportive(arc, { label: option.label, region: option.region, side: option.side, movementLabel: option.movementLabel, usageId: null }));
  }

  const circleStage = resolveCircleStage(step);
  const progressLabel = `${arc.kind === "efficacy" ? "ARC למסוגלות" : "ARC לקבלה עצמית"} · שלב ${Math.min(arc.stepIndex + 1, steps.length)} מתוך ${steps.length}`;

  function renderBody() {
    if (circleStage) {
      return (
        <View style={{ alignItems: "center" }}>
          <ArcBodyMantraCircle
            stage={circleStage}
            mantra={copy.primary}
            belowCircleLines={copy.supporting}
            presenceColor={presenceColor}
            circleOutlineColor={circleColor}
            contractionRegions={circle.contractionRegions}
            closureRegions={[]}
            openingRegions={circle.openingRegions}
            onAdvance={() => void next()}
          />
          <Text style={styles.muted}>הקש על העיגול כדי להמשיך</Text>
        </View>
      );
    }
    switch (step) {
      case "body_mark":
        return (
          <View>
            <Text style={styles.body}>{copy.primary}</Text>
            {copy.supporting.map((line) => (
              <Text key={line} style={styles.muted}>
                {line}
              </Text>
            ))}
            <BodyMapMagnifier
              selectedColor={ARC_ADDICTION_COLORS.urge}
              isSelected={(region, side) => arc.markedAreas.some((area) => area.region === region && area.side === side)}
              onToggle={(region, side) => onChange(toggleArcMarkedArea(arc, region, side))}
            />
          </View>
        );
      case "supportive_select":
        return (
          <View>
            <Text style={styles.body}>{copy.primary}</Text>
            {copy.supporting.map((line) => (
              <Text key={line} style={styles.muted}>
                {line}
              </Text>
            ))}
            {pastOptions.length > 0 && <Text style={styles.sectionTitle}>מה עזר לך בעבר</Text>}
            <View style={styles.row}>
              {pastOptions.map((option) => {
                const selected = arc.supportive?.label === option.label && arc.supportive?.region === option.region && arc.supportive?.side === option.side;
                return (
                  <Pressable key={option.key} style={[styles.chip, selected && styles.chipSelected]} onPress={() => chooseSupportive(selected ? null : option)}>
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{`${option.label}${regionSuffix(option)}`}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.sectionTitle}>תחושות תומכות</Text>
            <View style={styles.row}>
              {SUPPORTIVE_SENSATION_OPTIONS.map((label) => {
                const selected = arc.supportive?.label === label;
                return (
                  <Pressable
                    key={label}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() =>
                      chooseSupportive(selected ? null : { key: label, label, region: arc.supportive?.region ?? null, side: arc.supportive?.side ?? null, movementLabel: null, fromPast: false })
                    }
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={styles.input}
              placeholder="תחושה אחרת (למשל: חום בכפות הידיים)"
              value={customSupportive}
              onChangeText={setCustomSupportive}
              onSubmitEditing={() => {
                const label = customSupportive.trim();
                if (label) chooseSupportive({ key: label, label, region: arc.supportive?.region ?? null, side: arc.supportive?.side ?? null, movementLabel: null, fromPast: false });
              }}
              onBlur={() => {
                const label = customSupportive.trim();
                if (label && arc.supportive?.label !== label) chooseSupportive({ key: label, label, region: arc.supportive?.region ?? null, side: arc.supportive?.side ?? null, movementLabel: null, fromPast: false });
              }}
            />
            {arc.supportive && (
              <View>
                <Text style={styles.muted}>{`איפה בגוף מורגשת ${arc.supportive.label}? (לא חובה)`}</Text>
                <BodyMapMagnifier
                  selectedColor={ARC_ADDICTION_COLORS.supportive}
                  isSelected={(region, side) => arc.supportive?.region === region && arc.supportive?.side === side}
                  onToggle={(region, side) => {
                    const current = arc.supportive!;
                    const same = current.region === region && current.side === side;
                    onChange(setArcSupportive(arc, { ...current, region: same ? null : region, side: same ? null : side, usageId: null }));
                  }}
                />
              </View>
            )}
          </View>
        );
      case "success_memory":
        return (
          <View>
            <Text style={styles.body}>{copy.primary}</Text>
            {successMemory && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{successMemory.title}</Text>
                {!!successMemory.successDescription && <Text style={styles.cardRow}>{successMemory.successDescription}</Text>}
                {!!successMemory.whatWasSpecial && <Text style={styles.cardRow}>{successMemory.whatWasSpecial}</Text>}
              </View>
            )}
            <Text style={styles.muted}>היזכר לרגע איך זה הרגיש בגוף לבחור.</Text>
            {onAnotherSuccessMemory && (
              <Pressable style={styles.linkButton} onPress={onAnotherSuccessMemory}>
                <Text style={styles.linkButtonText}>רגע הצלחה אחר</Text>
              </Pressable>
            )}
          </View>
        );
      case "efficacy_rating":
        return (
          <View>
            <Text style={styles.body}>{copy.primary}</Text>
            <Text style={styles.muted}>{copy.supporting[0]}</Text>
            <ArcAddictionRatingRow label="מסוגלות" value={arc.efficacyRating} onChange={(value) => onChange(setArcRating(arc, "efficacyRating", value))} />
            {arc.supportive && (
              <View>
                <Text style={styles.body}>{`כמה עזרה התחושה "${arc.supportive.label}"?`}</Text>
                <ArcAddictionRatingRow label="עזרת התחושה התומכת" value={arc.supportiveEffectRating} onChange={(value) => onChange(setArcRating(arc, "supportiveEffectRating", value))} />
              </View>
            )}
          </View>
        );
      case "acceptance_rating_before":
      case "acceptance_rating_after": {
        const field = step === "acceptance_rating_before" ? "acceptanceBefore" : "acceptanceAfter";
        return (
          <View>
            <Text style={styles.body}>{copy.primary}</Text>
            {copy.supporting.map((line) => (
              <Text key={line} style={styles.muted}>
                {line}
              </Text>
            ))}
            <ArcAddictionRatingRow label="קבלה עצמית" value={arc[field]} onChange={(value) => onChange(setArcRating(arc, field, value))} />
            {step === "acceptance_rating_after" && arc.supportive && (
              <View>
                <Text style={styles.body}>{`כמה עזרה התחושה "${arc.supportive.label}"?`}</Text>
                <ArcAddictionRatingRow label="עזרת התחושה התומכת" value={arc.supportiveEffectRating} onChange={(value) => onChange(setArcRating(arc, "supportiveEffectRating", value))} />
              </View>
            )}
          </View>
        );
      }
      case "name_reaction":
        return (
          <View>
            <Text style={styles.body}>{copy.primary}</Text>
            <View style={styles.row}>
              {ACCEPTANCE_REACTION_OPTIONS.map((reaction) => {
                const selected = arc.reactions.includes(reaction);
                return (
                  <Pressable key={reaction} style={[styles.chip, selected && styles.chipSelected]} onPress={() => onChange(toggleArcReaction(arc, reaction))}>
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{reaction}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.muted}>{copy.supporting[0]}</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              multiline
              placeholder='למשל: "שוב לא הצלחתי לעצור"'
              value={arc.criticalThought}
              onChangeText={(text) => onChange(setArcText(arc, "criticalThought", text))}
            />
          </View>
        );
      case "understanding":
        return (
          <View>
            <Text style={styles.primaryLine}>{copy.primary}</Text>
            {copy.supporting.map((line) => (
              <Text key={line} style={styles.body}>
                {line}
              </Text>
            ))}
          </View>
        );
      case "gentle_intention":
        return (
          <View>
            <Text style={styles.body}>{copy.primary}</Text>
            <Text style={styles.muted}>{copy.supporting[0]}</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              multiline
              placeholder="לא חובה"
              value={arc.gentleIntention}
              onChangeText={(text) => onChange(setArcText(arc, "gentleIntention", text))}
            />
          </View>
        );
      default:
        return <Text style={styles.body}>{copy.primary}</Text>;
    }
  }

  return (
    <View>
      <Text style={styles.muted}>{progressLabel}</Text>
      <Text style={styles.title}>{copy.title}</Text>
      {renderBody()}
      <View style={styles.footerRow}>
        {!circleStage ? (
          <Pressable style={[styles.button, { flex: 1, marginStart: 10 }]} onPress={() => void next()}>
            <Text style={styles.buttonText}>{copy.continueLabel}</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {arc.stepIndex > 0 && (
          <Pressable style={styles.linkButton} onPress={back}>
            <Text style={styles.linkButtonText}>חזרה</Text>
          </Pressable>
        )}
      </View>
      <Pressable style={styles.linkButton} onPress={onSkip}>
        <Text style={styles.linkButtonText}>דלג על התרגיל</Text>
      </Pressable>
    </View>
  );
}
