import { useLocalSearchParams } from "expo-router";
import TaskEditorScreen from "../../../build/TaskEditorScreen.tsx";

export default function TaskEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskEditorScreen id={id} />;
}
