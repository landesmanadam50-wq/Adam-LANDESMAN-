import { useLocalSearchParams } from "expo-router";
import TaskMoveConfirmationScreen from "../../../live/TaskMoveConfirmationScreen.tsx";

export default function TaskMoveConfirm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskMoveConfirmationScreen taskId={id} />;
}
