import { useLocalSearchParams } from "expo-router";
import ArcGymGoalObjectivesScreen from "../../../../build/ArcGymGoalObjectivesScreen.tsx";

export default function ArcGymGoalObjectives() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymGoalObjectivesScreen goalId={id} />;
}
