import { useLocalSearchParams } from "expo-router";
import ArcFocusSettingsScreen from "../../build/ArcFocusSettingsScreen.tsx";

export default function ArcGymArcFocus() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  return <ArcFocusSettingsScreen taskId={taskId ?? null} />;
}
