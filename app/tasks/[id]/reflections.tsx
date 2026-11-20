import { useLocalSearchParams } from "expo-router";
import TaskReflectionHistoryScreen from "../../../live/TaskReflectionHistoryScreen.tsx";

export default function TaskReflections() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskReflectionHistoryScreen taskId={id} />;
}
