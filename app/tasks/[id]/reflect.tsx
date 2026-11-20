import { useLocalSearchParams } from "expo-router";
import SessionReflectionScreen from "../../../live/SessionReflectionScreen.tsx";

export default function TaskReflect() {
  const { id, continuousRoutineSummary, combinedSmiles } = useLocalSearchParams<{ id: string; continuousRoutineSummary?: string; combinedSmiles?: string }>();
  return (
    <SessionReflectionScreen
      taskId={id}
      continuousRoutineSummary={continuousRoutineSummary === "1"}
      combinedSmiles={combinedSmiles !== undefined ? Number(combinedSmiles) : null}
    />
  );
}
