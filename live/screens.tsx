/**
 * live/screens.tsx
 *
 * Named, presentational-only components -- one family per ArcStage
 * group, matching the mapping ArcLiveRenderer.tsx switches on. None of
 * these decide what happens next: each one renders the copy and input
 * it's given and reports the raw answer upward via a callback prop. The
 * only "logic" here is shaping a button tap into a value (e.g. reading
 * which scale button was pressed) -- never a threshold, route, or loop
 * rule. Those all live in arc/arcEngine.ts and arc/engine.ts.
 */

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { DevelopmentLayer, TriggerType } from "../arc/types.ts";
import type { ArcStageCopy, YesNoLabels } from "../arc/stageCopy.ts";
import type { ProactiveTarget, ReactiveExperience } from "../arc/arcEngine.ts";
import { hasSensationLocationResponse, hasValidAlternativeAction } from "./liveEventAdapter.ts";
import { getInstructionTimingStatus } from "../arc/instructionTiming.ts";
import { formatRemainingTime, getActionTimerStatusFromStartedAt } from "../arc/actionTimer.ts";
import { saveActiveActionTimer } from "../data/storage.ts";

/**
 * Live elapsed-seconds clock, started fresh on mount (never on a prop
 * change) -- pairing this with `key={...}` at the call site (see
 * live/ArcLiveRenderer.tsx) is what makes "reset on entering a new
 * timed screen" (#9, #12) hold: a remount is the reset, so there's no
 * stale dwell time to carry over from whatever was shown before. Shared
 * by both the instruction-timing screens (via TimedInstructionBody) and
 * ActionScreen's separate Action Timer -- each call site gets its own
 * independent clock instance, never a shared one.
 */
function useElapsedSeconds(): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds((Date.now() - startedAt) / 1000);
    }, 250);
    return () => clearInterval(interval);
  }, []);
  return elapsedSeconds;
}

/**
 * A live Date.now() reading, ticked periodically -- unlike
 * useElapsedSeconds above, this reports an absolute timestamp rather
 * than time-since-mount, so it stays correct however the caller
 * anchors its own start time. This is what ActionScreen's Action Timer
 * uses (paired with a persisted actionStartedAt anchor -- see
 * arc/actionTimer.ts's getActionTimerStatusFromStartedAt and
 * data/storage.ts's ActiveActionTimer): the real timed Action must
 * stay accurate across backgrounding, locking, navigating away and
 * back, or a full app close/reopen, none of which a mount-relative
 * clock alone can survive.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);
  return now;
}

const SCALE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function Title({ copy }: { copy: ArcStageCopy }) {
  return (
    <>
      <Text style={styles.title}>{copy.title}</Text>
      {copy.body.length > 0 && <Text style={styles.body}>{copy.body}</Text>}
    </>
  );
}

function ScaleButtons({ onSelect }: { onSelect: (value: number) => void }) {
  return (
    <View style={styles.scaleRow}>
      {SCALE_VALUES.map((value) => (
        <Pressable key={value} style={styles.scaleButton} onPress={() => onSelect(value)}>
          <Text style={styles.buttonText}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={[styles.button, styles.fullWidthButton, disabled && styles.buttonDisabled]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Shared renderer for every progressive timed-instruction screen
 * (the ARC Thought sub-stages, Stay/Presence, Regulation, Encoding,
 * plus the "act" stage's Imagery and Preparation sub-phases): when
 * copy.segments is null, behaves
 * exactly like the old immediate-Continue InstructionScreen (unchanged
 * backward-compatible fallback for every screen the timed-reveal system
 * doesn't apply to); when segments are present, reveals them
 * cumulatively via getInstructionTimingStatus and disables Continue
 * until the full sequence's minimum practice time has elapsed (#4) --
 * a visible countdown is intentionally not shown here, matching this
 * app's existing plain-text-forward style (only the real Action Timer,
 * in ActionScreen below, shows a live remaining-time readout).
 */
function TimedInstructionBody({
  copy,
  onContinue,
  continueLabel = "המשך",
}: {
  copy: ArcStageCopy;
  onContinue: () => void;
  continueLabel?: string;
}) {
  const elapsedSeconds = useElapsedSeconds();

  if (!copy.segments) {
    return (
      <View>
        <Title copy={copy} />
        <PrimaryButton label={continueLabel} onPress={onContinue} />
      </View>
    );
  }

  const status = getInstructionTimingStatus(copy.segments, elapsedSeconds);
  const visibleText = status.visibleSegments.map((segment) => segment.text).join(" ");
  return (
    <View>
      <Text style={styles.title}>{copy.title}</Text>
      {visibleText.length > 0 && <Text style={styles.body}>{visibleText}</Text>}
      <PrimaryButton label={continueLabel} onPress={onContinue} disabled={!status.complete} />
    </View>
  );
}

function YesNoButtons({ labels, onAnswer }: { labels: YesNoLabels; onAnswer: (yes: boolean) => void }) {
  return (
    <View style={styles.buttonRow}>
      <Pressable style={styles.button} onPress={() => onAnswer(true)}>
        <Text style={styles.buttonText}>{labels.yes}</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => onAnswer(false)}>
        <Text style={styles.buttonText}>{labels.no}</Text>
      </Pressable>
    </View>
  );
}

export function TriggerSelectScreen({
  copy,
  availableTriggers,
  labels,
  onSelect,
}: {
  copy: ArcStageCopy;
  availableTriggers: TriggerType[];
  labels: Record<TriggerType, string>;
  onSelect: (trigger: TriggerType) => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <View style={styles.chipRow}>
        {availableTriggers.map((value) => (
          <Pressable key={value} style={styles.chip} onPress={() => onSelect(value)}>
            <Text style={styles.buttonText}>{labels[value]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Explicit recognition chooser for which already-present mapped
 * experience (#4, #5, #6) the trainee recognizes -- e.g. "פיזור" vs
 * "תשוקה" -- generated from BUILD-ARC's own mappings via
 * getAvailableReactiveExperiences, never a hardcoded permanent list.
 * Mirrors ProactiveTargetScreen's shape exactly: recognition-only, no
 * copy here ever asks the trainee to generate/imagine/strengthen/recall
 * a state in order to feel it.
 */
export function ReactiveStateSelectScreen({
  copy,
  experiences,
  onSelect,
}: {
  copy: ArcStageCopy;
  experiences: ReactiveExperience[];
  onSelect: (target: DevelopmentLayer) => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <View style={styles.chipRow}>
        {experiences.map((experience) => (
          <Pressable key={experience.layer} style={styles.chip} onPress={() => onSelect(experience.layer)}>
            <Text style={styles.buttonText}>{experience.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function PresenceRatingScreen({ copy, onSelect }: { copy: ArcStageCopy; onSelect: (value: number) => void }) {
  return (
    <View>
      <Title copy={copy} />
      <ScaleButtons onSelect={onSelect} />
    </View>
  );
}

export function InstructionScreen({ copy, onContinue }: { copy: ArcStageCopy; onContinue: () => void }) {
  return <TimedInstructionBody copy={copy} onContinue={onContinue} />;
}

export function PreventiveActionCheckScreen({
  copy,
  labels,
  onAnswer,
}: {
  copy: ArcStageCopy;
  labels: YesNoLabels;
  onAnswer: (yes: boolean) => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <YesNoButtons labels={labels} onAnswer={onAnswer} />
    </View>
  );
}

const SENSATION_LOCATION_VALIDATION_MESSAGE = "בחר איפה התחושה מורגשת בגוף, כתוב מיקום אחר, או בחר 'לא ברור לי איפה'.";

/**
 * Body Sensation Check: when showLocationPicker is true (first entry,
 * non-habit route -- see live/ArcLiveRenderer.tsx), a body-location
 * response is required before intensity can be submitted, but the
 * trainee is never forced to invent one -- a preset chip, free text, or
 * the explicit "לא ברור לי איפה" all count. Intensity stays a fully
 * separate 1-10 scale, never merged into the location answer. On a
 * re-check or the habit route, no location UI is shown at all (existing
 * behavior, unchanged) so nothing is required there either.
 */
export function SensationRatingScreen({
  copy,
  showLocationPicker,
  locations,
  selectedLocation,
  customLocation,
  locationUnclear,
  onSelectLocation,
  onChangeCustomLocation,
  onSelectLocationUnclear,
  onSelectIntensity,
}: {
  copy: ArcStageCopy;
  showLocationPicker: boolean;
  locations: string[];
  selectedLocation: string;
  customLocation: string;
  locationUnclear: boolean;
  onSelectLocation: (location: string) => void;
  onChangeCustomLocation: (text: string) => void;
  onSelectLocationUnclear: () => void;
  onSelectIntensity: (value: number) => void;
}) {
  const [showValidation, setShowValidation] = useState(false);

  function handleIntensity(value: number) {
    if (showLocationPicker && !hasSensationLocationResponse(selectedLocation, customLocation, locationUnclear)) {
      setShowValidation(true);
      return;
    }
    onSelectIntensity(value);
  }

  return (
    <View>
      <Title copy={copy} />
      {showLocationPicker && (
        <View>
          <View style={styles.chipRow}>
            {locations.map((location) => (
              <Pressable
                key={location}
                style={[styles.chip, selectedLocation === location && styles.chipSelected]}
                onPress={() => {
                  setShowValidation(false);
                  onSelectLocation(location);
                }}
              >
                <Text style={styles.buttonText}>{location}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.chip, locationUnclear && styles.chipSelected]}
              onPress={() => {
                setShowValidation(false);
                onSelectLocationUnclear();
              }}
            >
              <Text style={styles.buttonText}>לא ברור לי איפה</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.textInput}
            value={customLocation}
            onChangeText={(text) => {
              setShowValidation(false);
              onChangeCustomLocation(text);
            }}
            placeholder="מיקום אחר בגוף"
            textAlign="right"
          />
          {showValidation && <Text style={styles.validationText}>{SENSATION_LOCATION_VALIDATION_MESSAGE}</Text>}
        </View>
      )}
      <ScaleButtons onSelect={handleIntensity} />
    </View>
  );
}

export function StayScreen({ copy, onContinue }: { copy: ArcStageCopy; onContinue: () => void }) {
  return <TimedInstructionBody copy={copy} onContinue={onContinue} />;
}

export function AcceptScreen({
  copy,
  labels,
  onAnswer,
}: {
  copy: ArcStageCopy;
  labels: YesNoLabels;
  onAnswer: (yes: boolean) => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <YesNoButtons labels={labels} onAnswer={onAnswer} />
    </View>
  );
}

export function TransitionCheckScreen({
  copy,
  labels,
  onAnswer,
}: {
  copy: ArcStageCopy;
  labels: YesNoLabels;
  onAnswer: (yes: boolean) => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <YesNoButtons labels={labels} onAnswer={onAnswer} />
    </View>
  );
}

export function RegulationScreen({ copy, onContinue }: { copy: ArcStageCopy; onContinue: () => void }) {
  return <TimedInstructionBody copy={copy} onContinue={onContinue} />;
}

export function ProactiveTargetScreen({
  targets,
  onSelect,
}: {
  targets: ProactiveTarget[];
  onSelect: (target: DevelopmentLayer) => void;
}) {
  return (
    <View>
      <Text style={styles.title}>מה תרצה לתרגל עכשיו?</Text>
      <View style={styles.chipRow}>
        {targets.map((target) => (
          <Pressable key={target.layer} style={styles.chip} onPress={() => onSelect(target.layer)}>
            <Text style={styles.buttonText}>{target.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function DesiredStateRatingScreen({ copy, onSelect }: { copy: ArcStageCopy; onSelect: (value: number) => void }) {
  return (
    <View>
      <Title copy={copy} />
      <ScaleButtons onSelect={onSelect} />
    </View>
  );
}

export function EncodingScreen({ copy, onContinue }: { copy: ArcStageCopy; onContinue: () => void }) {
  return <TimedInstructionBody copy={copy} onContinue={onContinue} />;
}

const ALTERNATIVE_ACTION_VALIDATION_MESSAGE = "יש להזין פעולה חלופית ולבחור משך זמן לפני שממשיכים.";

/**
 * The Action-choice screen: shows the planned/mapped action (via copy,
 * resolved WITHOUT any selectedAction override) then "can I perform it
 * now?". "לא" reveals a free-text alternative-action field plus a
 * duration picker on the SAME screen, gated identically to
 * SensationRatingScreen's location requirement -- the trainee cannot
 * continue without both a non-empty alternative action and a chosen
 * duration, and nothing here ever silently falls back to the planned
 * action. Neither branch starts any timer itself; it only resolves
 * currentAction (see arc/arcEngine.ts's needsCurrentActionResolution),
 * after which "act" re-renders as the normal ActionScreen below.
 */
export function ActionChoiceScreen({
  copy,
  alternativeText,
  alternativeDuration,
  durationOptions,
  onConfirmPlanned,
  onChangeAlternativeText,
  onSelectAlternativeDuration,
  onSubmitAlternative,
}: {
  copy: ArcStageCopy;
  alternativeText: string;
  alternativeDuration: number | null;
  durationOptions: number[];
  onConfirmPlanned: () => void;
  onChangeAlternativeText: (text: string) => void;
  onSelectAlternativeDuration: (minutes: number) => void;
  onSubmitAlternative: () => void;
}) {
  const [showAlternativeForm, setShowAlternativeForm] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  function handleSubmit() {
    if (!hasValidAlternativeAction(alternativeText, alternativeDuration)) {
      setShowValidation(true);
      return;
    }
    onSubmitAlternative();
  }

  return (
    <View>
      <Title copy={copy} />
      {!showAlternativeForm ? (
        <View>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={onConfirmPlanned}>
            <Text style={styles.buttonText}>אני יכול לבצע אותה עכשיו</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setShowAlternativeForm(true)}>
            <Text style={styles.buttonText}>אני לא יכול לבצע אותה עכשיו</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text style={styles.body}>מה אתה כן יכול לעשות עכשיו?</Text>
          <TextInput
            style={styles.textInput}
            value={alternativeText}
            onChangeText={(text) => {
              setShowValidation(false);
              onChangeAlternativeText(text);
            }}
            textAlign="right"
            autoFocus
          />
          <View style={styles.chipRow}>
            {durationOptions.map((minutes) => (
              <Pressable
                key={minutes}
                style={[styles.chip, alternativeDuration === minutes && styles.chipSelected]}
                onPress={() => {
                  setShowValidation(false);
                  onSelectAlternativeDuration(minutes);
                }}
              >
                <Text style={styles.buttonText}>{minutes} דק'</Text>
              </Pressable>
            ))}
          </View>
          {showValidation && <Text style={styles.validationText}>{ALTERNATIVE_ACTION_VALIDATION_MESSAGE}</Text>}
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={handleSubmit}>
            <Text style={styles.buttonText}>המשך</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * Action Imagery: currentAction, imagined while maintaining the same
 * Body-Language Cue carried over from Encoding -- copy.segments already
 * contains that single, configured-duration segment (see
 * arc/stageCopy.ts's "act" case). This is instruction-practice time
 * only; the real Action Timer hasn't started (see ActionScreen below).
 */
export function ActionImageryScreen({ copy, onContinue }: { copy: ArcStageCopy; onContinue: () => void }) {
  return <TimedInstructionBody copy={copy} onContinue={onContinue} />;
}

/**
 * Action Preparation: a short reminder to carry the SAME Body-Language
 * Cue into the real behavior -- skips cleanly (empty segments, no
 * forced wait) when the current target has no cue configured, per
 * arc/stageCopy.ts's "act" case. Continue reads "עכשיו בצע את הפעולה"
 * here rather than the generic "המשך", since it's also the trigger
 * into the actual timed Action -- the Action Timer only starts once
 * this fires (see ActionScreen below; never during this screen itself).
 */
export function ActionPreparationScreen({ copy, onContinue }: { copy: ArcStageCopy; onContinue: () => void }) {
  return <TimedInstructionBody copy={copy} onContinue={onContinue} continueLabel="עכשיו בצע את הפעולה" />;
}

/**
 * The actual timed Action -- reached only once Imagery and Preparation
 * are both done (see arc/arcEngine.ts's resolveActPhase). durationMinutes
 * is the resolved actionDuration for whichever action is currently
 * active (the planned action's configured duration, or the alternative
 * action's own session-specific one -- see arc/arcEngine.ts's
 * resolveActionDuration), read independently of copy since ArcStageCopy
 * only carries display text. null means no duration was ever configured
 * -- the Action Timer resolves as immediately complete (see
 * arc/actionTimer.ts), so "עשיתי את זה" stays enabled with no forced
 * wait, identical to this screen's behavior before this feature existed.
 *
 * The Action Timer is anchored to an absolute actionStartedAt timestamp,
 * not to this component's mount time: captured once (lazily, on first
 * render) and persisted immediately via data/storage.ts's
 * saveActiveActionTimer, so remaining/complete is always recomputed as
 * "now minus actionStartedAt" -- correct whether "now" arrives from a
 * live tick, after the JS thread was suspended while the app was
 * backgrounded or the phone was locked, or after live/LiveSessionScreen.tsx
 * resumes this same screen following a navigate-away, an app relaunch,
 * or any other remount. resumedStartedAt lets that resume path hand back
 * the ORIGINAL anchor instead of starting a new one.
 */
export function ActionScreen({
  copy,
  durationMinutes,
  resumedStartedAt,
  onCompleted,
}: {
  copy: ArcStageCopy;
  durationMinutes: number | null;
  resumedStartedAt?: string;
  onCompleted: () => void;
}) {
  const [actionStartedAt] = useState(() => resumedStartedAt ?? new Date().toISOString());
  useEffect(() => {
    // Written once, right when the actual Action begins (or re-affirmed,
    // harmlessly, on a resume) -- copy/durationMinutes are stable for the
    // rest of "performing" (see resolveActPhase's doc), so there is
    // nothing later to react to here.
    saveActiveActionTimer({ actionStartedAt, durationMinutes, copyTitle: copy.title, copyBody: copy.body });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = useNow();
  const status = getActionTimerStatusFromStartedAt(actionStartedAt, durationMinutes, now);
  return (
    <View>
      <Title copy={copy} />
      {durationMinutes !== null && <Text style={styles.body}>{formatRemainingTime(status.remainingSeconds)}</Text>}
      <PrimaryButton label="עשיתי את זה" onPress={onCompleted} disabled={!status.complete} />
    </View>
  );
}

export function SuccessFocusScreen({
  copy,
  minutesOptions,
  selectedMinutes,
  onSelectMinutes,
  reinforcementText,
  onContinue,
}: {
  copy: ArcStageCopy;
  minutesOptions: number[];
  selectedMinutes: number | null;
  onSelectMinutes: (minutes: number) => void;
  reinforcementText: string;
  onContinue: () => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      {selectedMinutes === null ? (
        <View style={styles.chipRow}>
          {minutesOptions.map((minutes) => (
            <Pressable key={minutes} style={styles.chip} onPress={() => onSelectMinutes(minutes)}>
              <Text style={styles.buttonText}>{minutes} דק'</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View>
          <Text style={styles.body}>{reinforcementText}</Text>
          <PrimaryButton label="המשך" onPress={onContinue} />
        </View>
      )}
    </View>
  );
}

/**
 * Reinforcement's completion screen, extended with an optional written
 * Gratitude entry -- reuses this same existing completion/storage flow
 * rather than a standalone gratitude architecture (see
 * data/storage.ts's updateLastSessionLogEntryGratitude). The text field
 * is entirely optional: onRestart always fires, whatever gratitudeText
 * currently holds (including empty), and LiveSessionScreen.tsx decides
 * whether that's worth persisting.
 */
export function CompleteScreen({
  copy,
  gratitudeText,
  onChangeGratitudeText,
  onRestart,
}: {
  copy: ArcStageCopy;
  gratitudeText: string;
  onChangeGratitudeText: (text: string) => void;
  onRestart: () => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <Text style={styles.body}>על מה אתה מוקיר תודה עכשיו?</Text>
      <TextInput
        style={styles.textInput}
        value={gratitudeText}
        onChangeText={onChangeGratitudeText}
        placeholder="אפשר להשאיר ריק"
        multiline
        textAlign="right"
      />
      <PrimaryButton label="סשן חדש" onPress={onRestart} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 12,
  },
  body: {
    fontSize: 17,
    textAlign: "right",
    marginBottom: 24,
    lineHeight: 24,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  scaleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  scaleButton: {
    backgroundColor: "#E6F4FE",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 44,
    alignItems: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
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
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  fullWidthButton: {
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    minHeight: 60,
    marginBottom: 16,
    fontSize: 16,
    textAlignVertical: "top",
  },
  validationText: {
    fontSize: 14,
    textAlign: "right",
    color: "#c0392b",
    marginBottom: 16,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
