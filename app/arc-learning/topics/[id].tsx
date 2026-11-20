import { useLocalSearchParams } from "expo-router";
import ArcLearningTopicDetailScreen from "../../../build/ArcLearningTopicDetailScreen.tsx";

export default function ArcLearningTopicDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcLearningTopicDetailScreen id={id} />;
}
