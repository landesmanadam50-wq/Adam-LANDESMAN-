import { useLocalSearchParams } from "expo-router";
import TaskAdaptationScreen from "../../../live/TaskAdaptationScreen.tsx";

export default function TaskAdapt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskAdaptationScreen taskId={id} />;
}
