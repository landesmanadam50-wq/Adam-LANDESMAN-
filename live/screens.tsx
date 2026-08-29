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

import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { DevelopmentLayer, TriggerType } from "../arc/types.ts";
import type { ArcStageCopy, YesNoLabels } from "../arc/stageCopy.ts";
import type { ProactiveTarget, ReactiveExperience } from "../arc/arcEngine.ts";
import { hasSensationLocationResponse, hasValidAlternativeAction } from "./liveEventAdapter.ts";
import { getInstructionTimingStatus } from "../arc/instructionTiming.ts";
import { formatRemainingTime, generateTimerRunId, getActionTimerStatusFromStartedAt } from "../arc/actionTimer.ts";
import type { ActionTimerStatus } from "../arc/actionTimer.ts";
import { cancelScheduledNotification, scheduleTimerCompletionNotification } from "../data/notifications.ts";
import { playTimerCompletionSound } from "../data/timerSound.ts";
import { saveTimerRun } from "../data/storage.ts";
import type { TimerRun, TimerType } from "../data/storage.ts";

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
 * anchors its own start time. This is what every real timed activity's
 * screen uses (paired with a persisted actionStartedAt anchor -- see
 * arc/actionTimer.ts's getActionTimerStatusFromStartedAt and
 * data/storage.ts's TimerRun): the countdown must stay accurate across
 * backgrounding, locking, navigating away and back, or a full app
 * close/reopen, none of which a mount-relative clock alone can survive.
 *
 * React Native's own interval already resumes correctly after the JS
 * thread was suspended (the very next tick recomputes fully from
 * Date.now(), never from how many ticks were missed) -- the AppState
 * listener here is a responsiveness refinement on top of that, not a
 * correctness requirement: it forces an immediate refresh the instant
 * the app becomes active again, instead of waiting up to one interval
 * period (250ms) for the next natural tick.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setNow(Date.now());
      }
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  return now;
}

/**
 * Shared engine behind all three real timed activities (see
 * data/storage.ts's TimerRun doc): captures an absolute
 * actionStartedAt anchor once (lazily, on first render -- or reused
 * from resumedRun when this screen is being restored rather than
 * started fresh), persists that run immediately, schedules its one
 * background completion notification, and -- exactly once, the first
 * time the countdown reaches zero -- plays the shared completion sound,
 * cancels the now-redundant scheduled notification, and marks the run
 * completedAt. copy/durationMinutes are captured at mount and never
 * re-read: they're stable for the run's whole lifetime by construction
 * (the same currentAction/duration throughout "performing"; the same
 * predefined negative action/duration throughout negative_action; the
 * same Success Focus duration throughout success_focus).
 *
 * The completedRef guard is this hook's own idempotency guard for the
 * sound/notification-cancel side effect specifically -- separate from,
 * and in addition to, TimerRun.completedAt (the durable, cross-mount/
 * cross-launch guard other reconciliation paths would check).
 */
function useTimerRun(
  timerType: TimerType,
  copy: ArcStageCopy,
  durationMinutes: number | null,
  resumedRun?: TimerRun | null
): { status: ActionTimerStatus; actionStartedAt: string } {
  const [runId] = useState(() => resumedRun?.runId ?? generateTimerRunId());
  const [actionStartedAt] = useState(() => resumedRun?.actionStartedAt ?? new Date().toISOString());
  const notificationIdRef = useRef<string | null>(resumedRun?.notificationId ?? null);
  const completedRef = useRef(resumedRun?.completedAt !== null && resumedRun?.completedAt !== undefined);

  useEffect(() => {
    if (resumedRun) return; // Already persisted (and possibly already notified) by the original run -- never create a second run/notification for a resume.
    const baseRun: TimerRun = {
      timerType,
      runId,
      actionStartedAt,
      durationMinutes,
      copyTitle: copy.title,
      copyBody: copy.body,
      notificationId: null,
      completedAt: null,
    };
    saveTimerRun(baseRun); // Persisted immediately, before the notification round-trip below resolves.
    if (durationMinutes !== null) {
      const endTime = new Date(new Date(actionStartedAt).getTime() + durationMinutes * 60_000);
      scheduleTimerCompletionNotification({ timerType, runId, endTime, title: copy.title }).then((notificationId) => {
        notificationIdRef.current = notificationId;
        saveTimerRun({ ...baseRun, notificationId });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = useNow();
  const status = getActionTimerStatusFromStartedAt(actionStartedAt, durationMinutes, now);

  useEffect(() => {
    if (!status.complete || completedRef.current) return;
    completedRef.current = true;
    playTimerCompletionSound();
    cancelScheduledNotification(notificationIdRef.current);
    saveTimerRun({
      timerType,
      runId,
      actionStartedAt,
      durationMinutes,
      copyTitle: copy.title,
      copyBody: copy.body,
      notificationId: notificationIdRef.current,
      completedAt: new Date().toISOString(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.complete]);

  return { status, actionStartedAt };
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
 * This is the Beneficial Action Timer (see data/storage.ts's TimerRun
 * doc) -- timerType "beneficialAction". Timed via the shared
 * useTimerRun hook: anchored to an absolute actionStartedAt timestamp,
 * not to this component's mount time, so remaining/complete is always
 * recomputed as "now minus actionStartedAt" -- correct whether "now"
 * arrives from a live tick, after the JS thread was suspended while
 * the app was backgrounded or the phone was locked, or after
 * live/LiveSessionScreen.tsx resumes this same screen following a
 * navigate-away, an app relaunch, or any other remount. resumedRun
 * lets that resume path hand back the ORIGINAL run (anchor, runId,
 * notification id, completion state) instead of starting a new one.
 */
export function ActionScreen({
  copy,
  durationMinutes,
  resumedRun,
  onCompleted,
}: {
  copy: ArcStageCopy;
  durationMinutes: number | null;
  resumedRun?: TimerRun | null;
  onCompleted: () => void;
}) {
  const { status } = useTimerRun("beneficialAction", copy, durationMinutes, resumedRun);
  return (
    <View>
      <Title copy={copy} />
      {durationMinutes !== null && <Text style={styles.body}>{formatRemainingTime(status.remainingSeconds)}</Text>}
      <PrimaryButton label="עשיתי את זה" onPress={onCompleted} disabled={!status.complete} />
    </View>
  );
}

/**
 * Success Focus / Success Coding -- the same existing stage/data model,
 * now extended with a timer (timerType "successCoding") rather than a
 * new duplicate concept. Unlike the Negative Action Timer, this one
 * starts automatically the moment the stage is entered (no explicit
 * "begin" button), mirroring the Beneficial Action Timer's own
 * auto-start once its preceding sub-phase completes. successFocusDuration
 * === null (the default for every existing profile -- there is no
 * BUILD UI for it yet, same as actionDuration before it) means the
 * timer resolves as immediately complete, so this screen's existing
 * psychological content -- the minutes-focused chip picker and
 * reinforcement text -- is reached exactly as before this feature
 * existed, with nothing new gating it.
 */
export function SuccessFocusScreen({
  copy,
  durationMinutes,
  resumedRun,
  minutesOptions,
  selectedMinutes,
  onSelectMinutes,
  reinforcementText,
  onContinue,
}: {
  copy: ArcStageCopy;
  durationMinutes: number | null;
  resumedRun?: TimerRun | null;
  minutesOptions: number[];
  selectedMinutes: number | null;
  onSelectMinutes: (minutes: number) => void;
  reinforcementText: string;
  onContinue: () => void;
}) {
  const { status } = useTimerRun("successCoding", copy, durationMinutes, resumedRun);

  if (!status.complete) {
    return (
      <View>
        <Title copy={copy} />
        <Text style={styles.body}>{formatRemainingTime(status.remainingSeconds)}</Text>
      </View>
    );
  }

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
 * The trainee's predefined negative/interfering action (copy.body
 * already names it, from profile.habit -- never re-asked here), timed
 * to a shrinking allowance the current program week permits (see
 * program/engine.ts's resolveNegativeActionDuration). Unlike the
 * Beneficial Action and Success Focus timers, this one requires an
 * explicit "begin" tap before it starts -- state.negativeActionStarted
 * (arc/types.ts) is what the caller uses to decide which of these two
 * views to render (see live/ArcLiveRenderer.tsx's "negative_action"
 * case); this component itself only ever renders the "started, timing"
 * view, so its own useTimerRun call only ever happens once negativeAction
 * Started is already true. timerType "negativeAction" -- its own
 * independent persisted run, isolated from the other two timer types.
 */
export function NegativeActionScreen({
  copy,
  durationMinutes,
  resumedRun,
  onCompleted,
}: {
  copy: ArcStageCopy;
  durationMinutes: number | null;
  resumedRun?: TimerRun | null;
  onCompleted: () => void;
}) {
  const { status } = useTimerRun("negativeAction", copy, durationMinutes, resumedRun);
  return (
    <View>
      <Title copy={copy} />
      {durationMinutes !== null && <Text style={styles.body}>{formatRemainingTime(status.remainingSeconds)}</Text>}
      <PrimaryButton label="המשך" onPress={onCompleted} disabled={!status.complete} />
    </View>
  );
}

/**
 * The negative_action stage's pre-start screen: shows the predefined
 * negative action + its currently-permitted duration (already resolved
 * by the caller -- see NegativeActionScreen's doc on why the duration
 * itself isn't computed inside arc/stageCopy.ts) and a single explicit
 * button to begin the timer -- required by spec, unlike the other two
 * timers' auto-start.
 */
export function NegativeActionStartScreen({
  copy,
  durationMinutes,
  onStart,
}: {
  copy: ArcStageCopy;
  durationMinutes: number | null;
  onStart: () => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      {durationMinutes !== null && <Text style={styles.body}>{`הזמן המותר: ${durationMinutes} דקות.`}</Text>}
      <PrimaryButton label="התחל" onPress={onStart} />
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
