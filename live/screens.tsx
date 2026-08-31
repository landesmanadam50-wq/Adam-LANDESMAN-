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
import type { ReactNode } from "react";
import { Animated, AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { DevelopmentLayer, TriggerType } from "../arc/types.ts";
import type { ArcStageCopy, YesNoLabels } from "../arc/stageCopy.ts";
import type { ProactiveTarget, ReactiveExperience } from "../arc/arcEngine.ts";
import { hasSensationLocationResponse, hasValidAlternativeAction } from "./liveEventAdapter.ts";
import { getInstructionTimingStatus } from "../arc/instructionTiming.ts";
import type { InstructionSegment } from "../arc/instructionTiming.ts";
import { getAcceptanceReadinessRecheckQuestion, getAcceptanceUnwillingnessAcknowledgment, getPreventiveActionReinforcement } from "../arc/stageCopy.ts";
import { hasTrailingDwellSegment } from "../arc/dwellTimes.ts";
import { formatRemainingTime, generateTimerRunId, getActionTimerStatusFromStartedAt } from "../arc/actionTimer.ts";
import type { ActionTimerStatus } from "../arc/actionTimer.ts";
import { cancelScheduledNotification, scheduleTimerCompletionNotification } from "../data/notifications.ts";
import { playContinueAvailableCue, playTimerCompletionSound } from "../data/timerSound.ts";
import { saveTimerRun } from "../data/storage.ts";
import type { TimerRun, TimerType } from "../data/storage.ts";
import type { DeferralOption } from "../data/reminders.ts";

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

/**
 * One already-revealed instruction line. Animates in exactly once, the
 * moment it mounts (a soft fade + a very small upward move -- #2's
 * "gently ADDED underneath") and then holds still: nothing here ever
 * re-triggers the animation or changes this line's own size/style once
 * it's shown, since nothing about this component's props/state changes
 * again after mount.
 */
function RevealedLine({ text }: { text: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.Text style={[styles.body, { opacity, transform: [{ translateY }] }]}>{text}</Animated.Text>;
}

/**
 * Renders every already-revealed instruction segment as its OWN
 * separate, visually stable line -- the instruction is gradually
 * CONSTRUCTED on the page (#2), rather than the old behavior of joining
 * every visible segment's text into one paragraph that visibly
 * reflowed/grew each time a new segment appeared. A segment's React key
 * is its own stable position within `segments` -- getInstructionTimingStatus's
 * visibleSegments is always a cumulative, growing PREFIX of the same
 * underlying array (a segment, once revealed, is never removed or
 * reordered -- see that function's own doc) -- so a line already on
 * screen always keeps the exact same key/element identity as more
 * segments are appended after it: React never remounts, resizes, or
 * re-animates it; only the newly appended segment mounts fresh and
 * plays RevealedLine's entrance animation. Empty-text segments (the
 * inline-rating reveal-delay placeholder appended in arc/stageCopy.ts)
 * render nothing, exactly like the old join-based text did.
 */
function RevealedInstructionLines({ segments }: { segments: InstructionSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (segment.text.length > 0 ? <RevealedLine key={index} text={segment.text} /> : null))}
    </>
  );
}

/**
 * Visual-refinement task: the reveal of the three REQUIRED inline
 * ratings only (Presence, Desired State Level, and the feeling/urge/
 * interfering-state intensity recheck -- see
 * arc/stageCopy.ts's getInlineRequiredRatingQuestion, which is the only
 * source of `question`; never used for any other rating in the app).
 * Once the caller's own, unmodified reveal gate (status.complete / the
 * existing 15s delay) first allows this to mount, it renders ONE
 * concise question line -- via RevealedLine, the EXACT same component
 * that reveals protocol instruction lines, so this uses the identical
 * calm fade + small-upward-move entrance, with no separate heading --
 * and then the rating control passed as `children` (unchanged
 * ScaleButtons, same component/values/onSelect wiring) fades in the
 * same way directly beneath it, once the question's own entrance has
 * finished. Nothing about WHEN the rating appears changes, only HOW --
 * and everything already on screen above this (the protocol
 * instruction lines, via RevealedInstructionLines) is untouched.
 */
function RevealedRatingPrompt({ question, children }: { question: string; children: ReactNode }) {
  const controlsOpacity = useRef(new Animated.Value(0)).current;
  const controlsTranslateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(350), // let the question line's own RevealedLine entrance finish first
      Animated.parallel([
        Animated.timing(controlsOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(controlsTranslateY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View>
      <RevealedLine text={question} />
      <Animated.View style={{ opacity: controlsOpacity, transform: [{ translateY: controlsTranslateY }] }}>{children}</Animated.View>
    </View>
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
 * "Continue available" cue (#8/#9, and the dwell-time task's #O): fires
 * exactly once, the instant `complete` first turns true -- never
 * before, never again on a later re-render of this same mount, and
 * never on returning to an ALREADY-mounted screen (the app
 * backgrounding/foregrounding doesn't remount whatever calls this
 * hook). A fresh mount (a new instructional/dwell bout, or a genuinely
 * new stage) naturally resets cuePlayedRef along with whatever elapsed-
 * time clock drives `complete` -- the same lifecycle useElapsedSeconds
 * itself already relies on -- so a real new bout correctly gets its own
 * cue. `complete` staying false forever (no segments, an immediate,
 * never-gated Continue) never fires it: there is no "becomes available"
 * moment for those. Distinct from, and never confused with,
 * playTimerCompletionSound (the Action/Success-Focus/Negative-Action
 * completion bell) -- a different, quieter sound file entirely
 * (data/timerSound.ts) -- and this cue never itself advances the
 * protocol: the trainee still chooses when to continue/respond. Shared
 * by every screen gated on a dwell/instruction-timing completion
 * (TimedInstructionBody, RegulationScreen, and Accept's own dwell-gated
 * sub-views below) so this exactly-once guarantee lives in one place.
 */
function useContinueAvailableCue(complete: boolean): void {
  const cuePlayedRef = useRef(false);
  useEffect(() => {
    if (!complete || cuePlayedRef.current) return;
    cuePlayedRef.current = true;
    playContinueAvailableCue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete]);
}

/**
 * Unified dwell-completion task (Part 31-36): the cue must fire only
 * for a stage's own REAL, configured/resolved experiential dwell --
 * never merely because an instruction-only stage's own reveal timing
 * finished and Continue became available (that's an instruction-reveal
 * event, not a dwell event -- e.g. arc_thought_awareness/
 * arc_thought_combined_attention/preventive_action, which have no
 * dwell of their own at all). Callers pass BOTH copy.segments (to
 * detect, via arc/dwellTimes.ts's hasTrailingDwellSegment, whether this
 * stage's segments genuinely end in a dwell period) and the timing
 * status's own `complete` flag; the cue only ever fires when both are
 * true. A caller with no segments at all (copy.segments === null, an
 * immediate/untimed screen) trivially never fires this either.
 */
function useDwellCompletionCue(segments: InstructionSegment[] | null, complete: boolean): void {
  useContinueAvailableCue((segments !== null && hasTrailingDwellSegment(segments)) && complete);
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
  const status = copy.segments ? getInstructionTimingStatus(copy.segments, elapsedSeconds) : null;
  useDwellCompletionCue(copy.segments, status?.complete ?? false);

  if (!copy.segments || !status) {
    return (
      <View>
        <Title copy={copy} />
        <PrimaryButton label={continueLabel} onPress={onContinue} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.title}>{copy.title}</Text>
      <RevealedInstructionLines segments={status.visibleSegments} />
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
 * Reactive-flow-strengthening task (#1): the session-specific "what
 * triggered this right now" recognition -- a short, entirely OPTIONAL
 * free-text answer (Continue is always enabled, never blocked on this
 * field, matching "brief recognition, not analysis"). Written only to
 * ArcLiveState.triggerContext (live/liveEventAdapter.ts's
 * applyTriggerContext) -- never to ArcBuildProfile.challengeContext/
 * identityChallengeContext, which stay the reusable, BUILD-configured
 * context, completely untouched by this screen.
 */
export function TriggerContextScreen({
  copy,
  value,
  onChangeText,
  onContinue,
}: {
  copy: ArcStageCopy;
  value: string;
  onChangeText: (text: string) => void;
  onContinue: () => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder="אפשר להשאיר ריק"
        multiline
        textAlign="right"
      />
      <PrimaryButton label="המשך" onPress={onContinue} />
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

/**
 * Timing-update task: arc_thought_expand_presence's own timed
 * instruction, merged with the Presence Rating that used to live on
 * arc_thought_presence_recheck's own separate page (see
 * arc/stageCopy.ts's "arc_thought_expand_presence" case, whose
 * segments now carry a trailing INLINE_RATING_REVEAL_DELAY_SECONDS
 * placeholder). question is the fixed, concise inline-only prompt from
 * getInlineRequiredRatingQuestion("presence") -- see
 * live/ArcLiveRenderer.tsx's "arc_thought_expand_presence" case; the
 * recheck stage's OWN title+body copy is untouched and still used by
 * its other, standalone entry point (presence_check). The rating is
 * not rendered at all until status.complete (instruction time + the
 * additional 15s have both elapsed), matching "the rating must not be
 * visible during the additional experiential period". Selecting a
 * value still writes presenceRating through the exact same
 * applyScaleAnswer path as before -- see
 * live/LiveSessionScreen.tsx's onPresenceExperienceRating.
 * Coordinated timer/dwell task (Part 19): the trailing segment is now a
 * genuine per-trainee configurable Presence dwell (arc/dwellTimes.ts),
 * so the subtle dwell-completion cue fires here too -- exactly once,
 * the instant that dwell completes -- via the same useDwellCompletionCue
 * every other dwell-gated screen in this file already uses (this
 * screen never fired it before this task).
 */
export function PresenceExperienceScreen({
  copy,
  question,
  onSelectRating,
}: {
  copy: ArcStageCopy;
  question: string;
  onSelectRating: (value: number) => void;
}) {
  const elapsedSeconds = useElapsedSeconds();
  const status = getInstructionTimingStatus(copy.segments ?? [], elapsedSeconds);
  useDwellCompletionCue(copy.segments, status.complete);
  return (
    <View>
      <Text style={styles.title}>{copy.title}</Text>
      <RevealedInstructionLines segments={status.visibleSegments} />
      {status.complete && (
        <RevealedRatingPrompt question={question}>
          <ScaleButtons onSelect={onSelectRating} />
        </RevealedRatingPrompt>
      )}
    </View>
  );
}

export function InstructionScreen({ copy, onContinue }: { copy: ArcStageCopy; onContinue: () => void }) {
  return <TimedInstructionBody copy={copy} onContinue={onContinue} />;
}

/**
 * Reactive-flow-strengthening task (#4, #5, #6): still the exact
 * existing BUILD-configured Preventive Action (copy.body, via
 * arc/arcEngine.ts's resolveTargetPreventiveAction, unchanged) -- never
 * a new open-ended "what could help" question. This stage is only ever
 * reached, in the reactive flow, once the trainee has already been
 * through trigger_context and observer_pause (see
 * arc/arcEngine.ts's sequencing), so the reinforcement line below is
 * never shown "immediately when the Reactive flow first opens" by
 * construction -- placing it here, rather than gating it on any extra
 * timer/flag, is what satisfies #6. It renders once via RevealedLine's
 * own mount-only entrance animation (no replay on re-render, no
 * separate celebration screen, never auto-advances -- the trainee still
 * presses Continue/Yes/No whenever they choose to).
 */
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
      <RevealedLine text={getPreventiveActionReinforcement()} />
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

/**
 * Dwell-time task: the "existing normal Acceptance" path (#I, #L) --
 * reached once the trainee is willing, whether immediately (the
 * stage's very first "כן") or after one or more unwillingness rounds
 * (a later "כן" on the readiness-recheck question below). Mounting this
 * exactly when that happens is what starts its own dwell clock
 * (useElapsedSeconds always starts from mount), reusing the same
 * primitive the rest of this file's dwell/instruction-timing screens
 * do. The delay is this target's own configured Acceptance dwell
 * (acceptanceDwellSeconds -- see arc/dwellTimes.ts's
 * resolveDwellSecondsFor, resolved once in live/ArcLiveRenderer.tsx's
 * "accept" case), never a separate hard-coded duration. question is
 * null when arc/arcEngine.ts's own accept transition is loop-capped
 * (goes straight to "regulate", skipping the recheck rating entirely --
 * an unrelated, unchanged loop; see live/ArcLiveRenderer.tsx's "accept"
 * case for that peek) -- the screen then falls back to a plain
 * Continue once the dwell elapses, same as before this task. The
 * subtle Continue-available cue fires once the dwell completes, same
 * as every other dwell-gated screen in this file.
 */
function AcceptRatingReveal({
  acceptanceDwellSeconds,
  question,
  onSelectRating,
  onContinueWithoutRating,
}: {
  acceptanceDwellSeconds: number;
  question: string | null;
  onSelectRating: (value: number) => void;
  onContinueWithoutRating: () => void;
}) {
  const elapsedSeconds = useElapsedSeconds();
  const segments: InstructionSegment[] = [{ text: "", durationSeconds: acceptanceDwellSeconds }];
  const status = getInstructionTimingStatus(segments, elapsedSeconds);
  useDwellCompletionCue(segments, status.complete);
  if (!status.complete) {
    return null;
  }
  if (question) {
    return (
      <RevealedRatingPrompt question={question}>
        <ScaleButtons onSelect={onSelectRating} />
      </RevealedRatingPrompt>
    );
  }
  return <PrimaryButton label="המשך" onPress={onContinueWithoutRating} />;
}

/**
 * One round of the Accept stage's "not ready yet" sub-flow (#H-#M):
 * shows the unwillingness-acknowledgment line immediately (it's a
 * simple statement of the current moment, not a timed practice
 * sequence of its own -- see arc/stageCopy.ts's
 * getAcceptanceUnwillingnessAcknowledgment), then waits this target's
 * SAME configured Acceptance dwell used by the normal "כן" path above
 * (never a separate hard-coded duration -- #K) before firing the
 * subtle Continue-available cue and revealing this round's outcome:
 * the readiness question again (capped === false) or nothing at all
 * (capped === true -- the caller, AcceptScreen below, auto-advances
 * into the normal Acceptance path instead of asking a further time,
 * mirroring the "force forward once capped" behavior every other loop
 * in arc/arcEngine.ts already has). A fresh `key` per round at the call
 * site is what gives each round its own independent dwell clock and
 * its own independent cue firing, the same remount-based reset already
 * used throughout this file (see e.g. arc_thought_expand_presence's
 * `key={stage}-${loopIterationCount}`).
 */
function AcceptanceUnwillingnessRound({
  acceptanceDwellSeconds,
  capped,
  labels,
  onDwellCapped,
  onAnswer,
}: {
  acceptanceDwellSeconds: number;
  capped: boolean;
  labels: YesNoLabels;
  onDwellCapped: () => void;
  onAnswer: (yes: boolean) => void;
}) {
  const elapsedSeconds = useElapsedSeconds();
  const segments: InstructionSegment[] = [
    { text: getAcceptanceUnwillingnessAcknowledgment(), durationSeconds: 0 },
    { text: "", durationSeconds: acceptanceDwellSeconds },
  ];
  const status = getInstructionTimingStatus(segments, elapsedSeconds);
  useDwellCompletionCue(segments, status.complete);

  const cappedHandledRef = useRef(false);
  useEffect(() => {
    if (!status.complete || !capped || cappedHandledRef.current) return;
    cappedHandledRef.current = true;
    onDwellCapped();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.complete, capped]);

  return (
    <View>
      <RevealedInstructionLines segments={status.visibleSegments} />
      {status.complete && !capped && (
        <RevealedRatingPrompt question={getAcceptanceReadinessRecheckQuestion()}>
          <YesNoButtons labels={labels} onAnswer={onAnswer} />
        </RevealedRatingPrompt>
      )}
    </View>
  );
}

/**
 * The Accept stage (#H-#M): "כן" (the stage's very first question, or
 * any later readiness-recheck question) resolves straight into the
 * existing normal Acceptance dwell-then-rating path (AcceptRatingReveal
 * above), completely unchanged in meaning/framing. "לא" no longer
 * leaves the trainee stuck -- it enters the unwillingness sub-flow
 * instead: an acknowledgment of the current unwillingness itself
 * (never treated as failure, never asking the trainee to evoke/
 * strengthen the interfering sensation), this target's own configured
 * Acceptance dwell, then the readiness question again -- looping, with
 * a safe, defined exit once willingnessCapped (resolved in
 * live/ArcLiveRenderer.tsx from arc/arcEngine.ts's
 * isAcceptanceWillingnessLoopCapped): the sub-flow then auto-proceeds
 * into the normal Acceptance path exactly as if "כן" had been chosen,
 * rather than asking a further time -- never an unbounded loop.
 *
 * Every already-revealed unwillingness round's acknowledgment line
 * stays visible (progressive append, matching this app's existing
 * style throughout) as willingnessLoopCount grows across re-renders
 * of this SAME mount (key={stage} at the call site, unchanged --
 * "accept" is never itself the target of a loop-back the way
 * Presence/Regulation are, so no per-round remount of the whole screen
 * is needed, only of the currently-active round via
 * AcceptanceUnwillingnessRound's own key).
 */
export function AcceptScreen({
  copy,
  labels,
  question,
  acceptanceDwellSeconds,
  willingnessLoopCount,
  willingnessCapped,
  onWillingnessAnswer,
  onSelectRating,
  onContinueWithoutRating,
}: {
  copy: ArcStageCopy;
  labels: YesNoLabels;
  question: string | null;
  acceptanceDwellSeconds: number;
  willingnessLoopCount: number;
  willingnessCapped: boolean;
  onWillingnessAnswer: (yes: boolean) => void;
  onSelectRating: (value: number) => void;
  onContinueWithoutRating: () => void;
}) {
  const [resolved, setResolved] = useState(false);

  function handleAnswer(yes: boolean) {
    onWillingnessAnswer(yes);
    if (yes) setResolved(true);
  }

  const acknowledgedRounds = resolved ? willingnessLoopCount : Math.max(0, willingnessLoopCount - 1);

  return (
    <View>
      <Title copy={copy} />
      {willingnessLoopCount === 0 && !resolved && <YesNoButtons labels={labels} onAnswer={handleAnswer} />}
      {willingnessLoopCount > 0 && (
        <>
          {Array.from({ length: acknowledgedRounds }, (_, index) => index + 1).map((round) => (
            <RevealedLine key={round} text={getAcceptanceUnwillingnessAcknowledgment()} />
          ))}
          {!resolved && (
            <AcceptanceUnwillingnessRound
              key={willingnessLoopCount}
              acceptanceDwellSeconds={acceptanceDwellSeconds}
              capped={willingnessCapped}
              labels={labels}
              onDwellCapped={() => setResolved(true)}
              onAnswer={handleAnswer}
            />
          )}
        </>
      )}
      {resolved && (
        <AcceptRatingReveal
          acceptanceDwellSeconds={acceptanceDwellSeconds}
          question={question}
          onSelectRating={onSelectRating}
          onContinueWithoutRating={onContinueWithoutRating}
        />
      )}
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

/**
 * Timing-update task: Regulation's own timed instruction, merged with
 * whichever rating used to follow it on its own separate page --
 * Desired State Level (proactive) or the intensity recheck (reactive)
 * -- see arc/stageCopy.ts's "regulate" case (segments now carry a
 * trailing INLINE_RATING_REVEAL_DELAY_SECONDS placeholder) and
 * live/ArcLiveRenderer.tsx's "regulate" case, which peeks the engine's
 * own regulate transition to decide whether a rating is even expected
 * next (it isn't when the loop-safety cap has been reached -- see
 * arc/arcEngine.ts's loopCapped -- in which case question is null and
 * this renders the same plain Continue regulate always had). question
 * is the fixed, concise inline-only prompt from
 * getInlineRequiredRatingQuestion("desiredState"/"intensity") --
 * desired_state_check/sensation_check's OWN title+body copy is
 * untouched and still used by their other, standalone entry points.
 * Nothing (no rating, no Continue button) is shown until
 * status.complete, matching "the rating must not be visible during the
 * additional experiential period". Selecting a rating still writes
 * desiredStateRating/sensationIntensity through the exact same
 * apply*Answer paths as before -- see
 * live/LiveSessionScreen.tsx's onRegulationExperienceRating.
 */
export function RegulationScreen({
  copy,
  question,
  onContinue,
  onSelectRating,
}: {
  copy: ArcStageCopy;
  question: string | null;
  onContinue: () => void;
  onSelectRating: (value: number) => void;
}) {
  const elapsedSeconds = useElapsedSeconds();
  const status = getInstructionTimingStatus(copy.segments ?? [], elapsedSeconds);
  useDwellCompletionCue(copy.segments, status.complete);
  return (
    <View>
      <Text style={styles.title}>{copy.title}</Text>
      <RevealedInstructionLines segments={status.visibleSegments} />
      {status.complete &&
        (question ? (
          <RevealedRatingPrompt question={question}>
            <ScaleButtons onSelect={onSelectRating} />
          </RevealedRatingPrompt>
        ) : (
          <PrimaryButton label="המשך" onPress={onContinue} />
        ))}
    </View>
  );
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

const BENEFICIAL_ACTION_DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * LIVE-flow-update task: replaces the old standalone Action Preparation
 * screen as the step right before the real timed Action begins --
 * shown only on the PLANNED-action path (the alternative-action path
 * already resolved its own duration back on ActionChoiceScreen). Unlike
 * Preparation, this isn't a timed instruction screen at all: it's a
 * one-tap duration choice, reusing the same chip-picker interaction
 * already used throughout this app (BUILD's duration chips, Success
 * Focus's minutes chips, ActionChoiceScreen's own alternative-duration
 * chips). Coordinated timer/dwell task (Part 1): 1 to 10 minutes, no
 * 5-minute floor -- widened from the original 5-10 minute range.
 * Selecting a chip both records the choice and immediately proceeds --
 * the real Action Timer starts the moment ActionScreen next mounts
 * with that resolved duration (see live/ArcLiveRenderer.tsx's "act"
 * case), exactly mirroring how Beneficial Action already auto-starts
 * with no separate "begin" tap.
 */
export function BeneficialActionDurationChoiceScreen({
  copy,
  onSelectDuration,
}: {
  copy: ArcStageCopy;
  onSelectDuration: (minutes: number) => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <Text style={styles.body}>כמה זמן תרצה להקדיש לפעולה, בין 1 ל-10 דקות?</Text>
      <View style={styles.chipRow}>
        {BENEFICIAL_ACTION_DURATION_OPTIONS.map((minutes) => (
          <Pressable key={minutes} style={styles.chip} onPress={() => onSelectDuration(minutes)}>
            <Text style={styles.buttonText}>{minutes} דק'</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
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

const SUCCESS_FOCUS_EXTRA_MINUTES_OPTIONS = [0, 5, 10, 15, 20, 30];

/**
 * Coordinated timer/dwell task (Part 2-3): the first thing success_focus
 * shows now -- the RETROSPECTIVE question ("כמה זמן המשכת בפעולה
 * המיטיבה מעבר לזמן שתכננת?", copy already carries the exact spec
 * title/body -- see arc/stageCopy.ts's "success_focus" case). No "עכשיו"/
 * "מאוחר יותר" here at all: the trainee was never required to touch
 * ARCHI the instant the Beneficial Action Timer ended (they could keep
 * performing it), so this simply asks how much longer they estimate
 * they continued once they DO return. 0 is a fully valid, explicit
 * answer -- reuses the same compact chip-picker pattern already used
 * throughout this app rather than a free-text numeric field, and never
 * infers/invents a value on the trainee's behalf.
 */
export function SuccessFocusRetrospectiveScreen({ copy, onSubmit }: { copy: ArcStageCopy; onSubmit: (minutes: number) => void }) {
  return (
    <View>
      <Title copy={copy} />
      <View style={styles.chipRow}>
        {SUCCESS_FOCUS_EXTRA_MINUTES_OPTIONS.map((minutes) => (
          <Pressable key={minutes} style={styles.chip} onPress={() => onSubmit(minutes)}>
            <Text style={styles.buttonText}>{minutes} דק'</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Coordinated timer/dwell task (Part 4): shown once the retrospective
 * answer is recorded -- "האם תרצה לבצע מיקוד הצלחה נוסף בהמשך?", plain
 * Yes/No. Never "עכשיו או מאוחר יותר?" and never "עם ARC או בלי?" here
 * -- both belonged to the old design this task replaces. "לא" lets the
 * session continue through the existing downstream flow with no
 * scheduling; "כן" opens FutureSuccessFocusScheduleScreen below.
 */
export function FutureSuccessFocusAskScreen({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  return (
    <View>
      <Text style={styles.title}>האם תרצה לבצע מיקוד הצלחה נוסף בהמשך?</Text>
      <YesNoButtons labels={{ yes: "כן", no: "לא" }} onAnswer={onAnswer} />
    </View>
  );
}

const FUTURE_SUCCESS_FOCUS_DURATION_OPTIONS = [5, 10, 15, 20, 30];

/**
 * Coordinated timer/dwell task (Part 4-7): a clear, exact scheduling
 * choice without any native date/time-picker dependency (none exists in
 * this project, and none is added for this feature -- matching
 * arc/reminders.ts's own established approach). Reuses the existing
 * relative-offset shortcuts (DEFERRAL_OPTIONS, already resolving to one
 * concrete absolute Date via resolveReminderFireDate) as the start-time
 * choice -- explicitly permitted by spec ("existing shortcuts may
 * remain if useful, but they must resolve to one concrete
 * plannedStartAt"), which they already do -- plus a duration chip row,
 * the same compact pattern used throughout this app. Both must be
 * chosen before "קבע" is enabled, mirroring every other "can't continue
 * until every required piece is answered" screen in this file.
 * onConfirm resolves plannedStartAt/durationMinutes into one concrete
 * scheduled run -- see live/LiveSessionScreen.tsx's
 * onScheduleFutureSuccessFocus.
 */
export function FutureSuccessFocusScheduleScreen({
  options,
  onConfirm,
}: {
  options: DeferralOption[];
  onConfirm: (option: DeferralOption, durationMinutes: number) => void;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? null;

  return (
    <View>
      <Text style={styles.title}>מתי תרצה להתחיל, ולכמה זמן?</Text>
      <Text style={styles.body}>מתי להתחיל?</Text>
      <View style={styles.chipRow}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            style={[styles.chip, selectedOptionId === option.id && styles.chipSelected]}
            onPress={() => setSelectedOptionId(option.id)}
          >
            <Text style={styles.buttonText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.body}>לכמה זמן?</Text>
      <View style={styles.chipRow}>
        {FUTURE_SUCCESS_FOCUS_DURATION_OPTIONS.map((minutes) => (
          <Pressable
            key={minutes}
            style={[styles.chip, selectedDuration === minutes && styles.chipSelected]}
            onPress={() => setSelectedDuration(minutes)}
          >
            <Text style={styles.buttonText}>{minutes} דק'</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton
        label="קבע"
        onPress={() => {
          if (selectedOption !== null && selectedDuration !== null) onConfirm(selectedOption, selectedDuration);
        }}
        disabled={selectedOption === null || selectedDuration === null}
      />
    </View>
  );
}

/**
 * Success Focus / Success Coding -- the standalone, immediate-timer
 * flow (timerType "successCoding"). Coordinated timer/dwell task: the
 * ARC protocol's own success_focus stage no longer uses this component
 * at all (see SuccessFocusRetrospectiveScreen/FutureSuccessFocusAskScreen/
 * FutureSuccessFocusScheduleScreen above for its new retrospective +
 * future-scheduling sub-flow); this screen is kept, unchanged, as the
 * standalone "Focus Success right now" entry point (app/focus-success.tsx,
 * reached directly from Home or by resuming a scheduled future Success
 * Focus once its start time arrives) -- starts automatically the moment
 * it mounts (no explicit "begin" button), mirroring the Beneficial
 * Action Timer's own auto-start once its preceding sub-phase completes.
 * durationMinutes === null means the timer resolves as immediately
 * complete, so this screen's existing psychological content -- the
 * minutes-focused chip picker and reinforcement text -- is reached with
 * nothing gating it, exactly as before this feature existed.
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
 * data/storage.ts's updateLastSessionLogEntryGratitude). Both fields
 * are entirely optional: onRestart always fires, whatever either field
 * currently holds (including empty), and LiveSessionScreen.tsx decides
 * whether either is worth persisting.
 *
 * Evidence-encoding task (#4/#5): the Gratitude prompt is now
 * protocol-linked -- specifically about something from THIS ARC
 * experience, not a random/general Gratitude -- and, once the trainee
 * has written something, a second question asks for ONE concrete
 * memory detail from that SAME experience. The memory-detail field only
 * appears once Gratitude has non-empty text (a simple, honest
 * "after you enter X, Y appears" sequencing -- see #5), never before;
 * both are saved together onto the SAME session log entry (see
 * data/storage.ts's updateLastSessionLogEntryGratitude), never
 * inferred or fabricated when left blank.
 */
export function CompleteScreen({
  copy,
  gratitudeText,
  onChangeGratitudeText,
  gratitudeMemoryDetailText,
  onChangeGratitudeMemoryDetailText,
  onRestart,
}: {
  copy: ArcStageCopy;
  gratitudeText: string;
  onChangeGratitudeText: (text: string) => void;
  gratitudeMemoryDetailText: string;
  onChangeGratitudeMemoryDetailText: (text: string) => void;
  onRestart: () => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <Text style={styles.body}>על מה אתה מוקיר תודה מתוך מה שקרה עכשיו בתרגול?</Text>
      <TextInput
        style={styles.textInput}
        value={gratitudeText}
        onChangeText={onChangeGratitudeText}
        placeholder="אפשר להשאיר ריק"
        multiline
        textAlign="right"
      />
      {gratitudeText.trim().length > 0 && (
        <View>
          <Text style={styles.body}>מה פרט אחד שאתה זוכר מהרגע הזה?</Text>
          <TextInput
            style={styles.textInput}
            value={gratitudeMemoryDetailText}
            onChangeText={onChangeGratitudeMemoryDetailText}
            placeholder="אפשר להשאיר ריק"
            multiline
            textAlign="right"
          />
        </View>
      )}
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
