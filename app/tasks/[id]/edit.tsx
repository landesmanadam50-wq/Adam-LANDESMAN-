import { useLocalSearchParams } from "expo-router";
import TaskEditorScreen from "../../../build/TaskEditorScreen.tsx";

export default function TaskEdit() {
  const { id, occurrenceDate, scheduledDate, title, arcGymGoalId } = useLocalSearchParams<{
    id: string;
    occurrenceDate?: string;
    scheduledDate?: string;
    title?: string;
    arcGymGoalId?: string;
  }>();
  return (
    <TaskEditorScreen id={id} occurrenceDate={occurrenceDate ?? null} initialScheduledDate={scheduledDate ?? null} initialTitle={title ?? null} initialArcGymGoalId={arcGymGoalId ?? null} />
  );
}
