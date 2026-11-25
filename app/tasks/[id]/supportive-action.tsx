import { useLocalSearchParams } from "expo-router";
import SupportiveActionFlowScreen from "../../../live/SupportiveActionFlowScreen.tsx";

export default function TaskSupportiveAction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SupportiveActionFlowScreen taskId={id} />;
}
