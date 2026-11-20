import { useLocalSearchParams } from "expo-router";
import PostponementEmotionalScreen from "../../../live/PostponementEmotionalScreen.tsx";

export default function TaskPostponeEmotional() {
  const { id, outcomeId } = useLocalSearchParams<{ id: string; outcomeId: string }>();
  return <PostponementEmotionalScreen taskId={id} outcomeId={outcomeId} />;
}
