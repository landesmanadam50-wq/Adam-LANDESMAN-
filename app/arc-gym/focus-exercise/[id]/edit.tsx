import { useLocalSearchParams } from "expo-router";
import ArcGymFocusExerciseEditorScreen from "../../../../build/ArcGymFocusExerciseEditorScreen.tsx";

export default function ArcGymFocusExerciseEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymFocusExerciseEditorScreen id={id} />;
}
