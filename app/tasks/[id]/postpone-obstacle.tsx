import { useLocalSearchParams } from "expo-router";
import PostponementObstacleScreen from "../../../live/PostponementObstacleScreen.tsx";

export default function TaskPostponeObstacle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PostponementObstacleScreen taskId={id} />;
}
