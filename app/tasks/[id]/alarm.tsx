import { useLocalSearchParams } from "expo-router";
import TaskAlarmScreen from "../../../live/TaskAlarmScreen.tsx";

export default function TaskAlarm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskAlarmScreen taskId={id} />;
}
