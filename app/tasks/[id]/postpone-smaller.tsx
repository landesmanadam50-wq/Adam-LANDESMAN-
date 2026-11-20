import { useLocalSearchParams } from "expo-router";
import PostponementSmallerTaskScreen from "../../../live/PostponementSmallerTaskScreen.tsx";

export default function TaskPostponeSmaller() {
  const { id, outcomeId } = useLocalSearchParams<{ id: string; outcomeId: string }>();
  return <PostponementSmallerTaskScreen taskId={id} outcomeId={outcomeId} />;
}
