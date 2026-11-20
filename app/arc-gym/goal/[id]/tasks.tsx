import { useLocalSearchParams } from "expo-router";
import ArcGymGoalTasksScreen from "../../../../build/ArcGymGoalTasksScreen.tsx";

export default function ArcGymGoalTasks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymGoalTasksScreen goalId={id} />;
}
