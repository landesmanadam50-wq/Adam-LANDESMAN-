import { useLocalSearchParams } from "expo-router";
import TaskEditorScreen from "../../../build/TaskEditorScreen.tsx";

export default function TaskEdit() {
  const { id, occurrenceDate, scheduledDate, title } = useLocalSearchParams<{ id: string; occurrenceDate?: string; scheduledDate?: string; title?: string }>();
  return <TaskEditorScreen id={id} occurrenceDate={occurrenceDate ?? null} initialScheduledDate={scheduledDate ?? null} initialTitle={title ?? null} />;
}
