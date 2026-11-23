import { useLocalSearchParams } from "expo-router";

import TaskDurationSelectionScreen from "../../../live/TaskDurationSelectionScreen.tsx";

export default function TaskDuration() {
  const { id, suggestedMinutes } = useLocalSearchParams<{ id: string; suggestedMinutes?: string }>();
  return <TaskDurationSelectionScreen taskId={id} suggestedMinutes={suggestedMinutes ? Number(suggestedMinutes) : null} />;
}
