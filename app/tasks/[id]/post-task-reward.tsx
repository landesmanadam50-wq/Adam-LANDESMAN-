import { useLocalSearchParams } from "expo-router";
import PostTaskRewardScreen from "../../../live/PostTaskRewardScreen.tsx";

export default function TaskPostTaskReward() {
  const { id, source, combinedSmiles, toTaskId } = useLocalSearchParams<{
    id: string;
    source?: "today" | "tasksList" | "flow" | "notification";
    combinedSmiles?: string;
    toTaskId?: string;
  }>();
  return (
    <PostTaskRewardScreen
      taskId={id}
      source={source}
      combinedSmiles={combinedSmiles !== undefined ? Number(combinedSmiles) : null}
      toTaskId={toTaskId ?? null}
    />
  );
}
