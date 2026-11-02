import { useLocalSearchParams } from "expo-router";
import ActiveTaskScreen from "../../live/ActiveTaskScreen.tsx";

export default function TaskDetail() {
  const { id, autoStart, openPostpone } = useLocalSearchParams<{ id: string; autoStart?: string; openPostpone?: string }>();
  return <ActiveTaskScreen taskId={id} autoStart={autoStart === "1"} openPostpone={openPostpone === "1"} />;
}
