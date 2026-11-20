import { useLocalSearchParams } from "expo-router";
import PostponementReturnScreen from "../../../live/PostponementReturnScreen.tsx";

export default function TaskPostponeReturn() {
  const { id, smallerTaskId } = useLocalSearchParams<{ id: string; smallerTaskId?: string }>();
  return <PostponementReturnScreen taskId={id} smallerTaskId={smallerTaskId ?? null} />;
}
