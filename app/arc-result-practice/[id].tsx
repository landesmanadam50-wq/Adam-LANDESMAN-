import { useLocalSearchParams } from "expo-router";
import ArcResultPracticeScreen from "../../live/ArcResultPracticeScreen.tsx";

export default function ArcResultPractice() {
  const { id, taskId, autoStart, origin } = useLocalSearchParams<{ id: string; taskId?: string; autoStart?: string; origin?: string }>();
  return (
    <ArcResultPracticeScreen
      id={id}
      taskId={taskId ?? null}
      autoStart={autoStart === "1"}
      origin={origin === "arc-gym" ? "arc-gym" : null}
    />
  );
}
