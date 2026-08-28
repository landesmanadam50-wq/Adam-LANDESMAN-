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

import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DevelopmentLayer, TriggerType } from "../arc/types.ts";
import type { ArcStageCopy, YesNoLabels } from "../arc/stageCopy.ts";
import type { ProactiveTarget } from "../arc/arcEngine.ts";
import type { ArcMap } from "../arc/buildTypes.ts";
import { getArcMapDisplayLabel } from "../arc/buildTypes.ts";

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

export function ArcMapSelectionScreen({
  copy,
  arcMaps,
  onSelect,
}: {
  copy: ArcStageCopy;
  arcMaps: ArcMap[];
  onSelect: (arcMapId: string) => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      <View style={styles.chipRow}>
        {arcMaps.map((arcMap) => (
          <Pressable key={arcMap.id} style={styles.chip} onPress={() => onSelect(arcMap.id)}>
            <Text style={styles.buttonText}>{getArcMapDisplayLabel(arcMap)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ChallengeRecognitionScreen({
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

export function SensationRatingScreen({
  copy,
  showLocationPicker,
  locations,
  selectedLocation,
  onSelectLocation,
  onSelectIntensity,
}: {
  copy: ArcStageCopy;
  showLocationPicker: boolean;
  locations: string[];
  selectedLocation: string;
  onSelectLocation: (location: string) => void;
  onSelectIntensity: (value: number) => void;
}) {
  return (
    <View>
      <Title copy={copy} />
      {showLocationPicker && (
        <View style={styles.chipRow}>
          {locations.map((location) => (
            <Pressable
              key={location}
              style={[styles.chip, selectedLocation === location && styles.chipSelected]}
              onPress={() => onSelectLocation(location)}
            >
              <Text style={styles.buttonText}>{location}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <ScaleButtons onSelect={onSelectIntensity} />
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

export function CompleteScreen({ copy, onRestart }: { copy: ArcStageCopy; onRestart: () => void }) {
  return (
    <View>
      <Title copy={copy} />
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
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
