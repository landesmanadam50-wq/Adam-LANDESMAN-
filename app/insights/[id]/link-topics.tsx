import { useLocalSearchParams } from "expo-router";
import InsightArcLearningTopicLinkScreen from "../../../build/InsightArcLearningTopicLinkScreen.tsx";

export default function InsightArcLearningTopicLink() {
  const { id, nextIds } = useLocalSearchParams<{ id: string; nextIds?: string }>();
  return <InsightArcLearningTopicLinkScreen id={id} nextIds={nextIds ? nextIds.split(",").filter(Boolean) : []} />;
}
