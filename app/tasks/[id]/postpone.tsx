import { useLocalSearchParams } from "expo-router";
import PostponementScreen from "../../../live/PostponementScreen.tsx";

export default function TaskPostpone() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostponementScreen taskId={id} />;
}
