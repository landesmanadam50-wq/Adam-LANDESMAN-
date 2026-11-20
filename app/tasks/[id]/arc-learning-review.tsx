import { useLocalSearchParams } from "expo-router";
import ArcLearningRecallScreen from "../../../build/ArcLearningRecallScreen.tsx";

export default function TaskArcLearningReview() {
  const { id, topicId } = useLocalSearchParams<{ id: string; topicId?: string }>();
  return <ArcLearningRecallScreen taskId={id} topicId={topicId} />;
}
