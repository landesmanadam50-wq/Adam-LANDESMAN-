import { useLocalSearchParams } from "expo-router";
import InsightArcLearningTopicLinkScreen from "../../../build/InsightArcLearningTopicLinkScreen.tsx";

export default function InsightArcLearningTopicLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InsightArcLearningTopicLinkScreen id={id} />;
}
