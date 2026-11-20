import { useLocalSearchParams } from "expo-router";
import ArcGymGoalExercisesScreen from "../../../../build/ArcGymGoalExercisesScreen.tsx";

export default function ArcGymGoalExercises() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymGoalExercisesScreen goalId={id} />;
}
