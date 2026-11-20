import { useLocalSearchParams } from "expo-router";
import ArcLearningInsightDetailScreen from "../../../build/ArcLearningInsightDetailScreen.tsx";

export default function ArcLearningInsightDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcLearningInsightDetailScreen id={id} />;
}
