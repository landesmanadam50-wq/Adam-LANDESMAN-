import { useLocalSearchParams } from "expo-router";
import TaskEditorScreen from "../../../build/TaskEditorScreen.tsx";

export default function TaskEdit() {
  const { id, occurrenceDate, scheduledDate } = useLocalSearchParams<{ id: string; occurrenceDate?: string; scheduledDate?: string }>();
  return <TaskEditorScreen id={id} occurrenceDate={occurrenceDate ?? null} initialScheduledDate={scheduledDate ?? null} />;
}
