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

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { DevelopmentLayer, TriggerType } from "../arc/types.ts";
import type { ArcStageCopy, YesNoLabels } from "../arc/stageCopy.ts";
import type { ProactiveTarget, ReactiveExperience } from "../arc/arcEngine.ts";
import { hasSensationLocationResponse, hasValidAlternativeAction } from "./liveEventAdapter.ts";

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

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.button, styles.fullWidthButton]} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
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
  return (
    <View>
      <Title copy={copy} />
      <PrimaryButton label="המשך" onPress={onContinue} />
    </View>
  );
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
  return (
    <View>
      <Title copy={copy} />
      <PrimaryButton label="המשך" onPress={onContinue} />
    </View>
  );
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
  return (
    <View>
      <Title copy={copy} />
      <PrimaryButton label="המשך" onPress={onContinue} />
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
  return (
    <View>
      <Title copy={copy} />
      <PrimaryButton label="המשך" onPress={onContinue} />
    </View>
  );
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

export function ActionScreen({ copy, onCompleted }: { copy: ArcStageCopy; onCompleted: () => void }) {
  return (
    <View>
      <Title copy={copy} />
      <PrimaryButton label="עשיתי את זה" onPress={onCompleted} />
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
