import { useLocalSearchParams } from "expo-router";
import ArcResultSuggestionScreen from "../live/ArcResultSuggestionScreen.tsx";

export default function ArcResultSuggestion() {
  const { taskId, autoStart } = useLocalSearchParams<{ taskId: string; autoStart?: string }>();
  return <ArcResultSuggestionScreen taskId={taskId} autoStart={autoStart === "1"} />;
}
