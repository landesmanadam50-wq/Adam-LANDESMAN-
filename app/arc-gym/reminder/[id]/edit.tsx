import { useLocalSearchParams } from "expo-router";
import ArcGymReminderEditorScreen from "../../../../build/ArcGymReminderEditorScreen.tsx";
import type { ArcGymReminderExerciseKind } from "../../../../arc/arcGym.ts";

export default function ArcGymReminderEdit() {
  const { id, exerciseKind, exerciseId } = useLocalSearchParams<{ id: string; exerciseKind?: string; exerciseId?: string }>();
  return (
    <ArcGymReminderEditorScreen
      id={id}
      exerciseKind={exerciseKind === "memory" ? "memory" : ("behaviour" as ArcGymReminderExerciseKind)}
      exerciseId={exerciseId ?? ""}
    />
  );
}
