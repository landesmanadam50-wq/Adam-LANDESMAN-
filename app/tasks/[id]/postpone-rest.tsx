import { useLocalSearchParams } from "expo-router";
import PostponementRestScreen from "../../../live/PostponementRestScreen.tsx";

export default function TaskPostponeRest() {
  const { id, outcomeId } = useLocalSearchParams<{ id: string; outcomeId: string }>();
  return <PostponementRestScreen taskId={id} outcomeId={outcomeId} />;
}
