import { useLocalSearchParams } from "expo-router";
import ArcGymGoalEditorScreen from "../../../../build/ArcGymGoalEditorScreen.tsx";

export default function ArcGymGoalEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymGoalEditorScreen id={id} />;
}
