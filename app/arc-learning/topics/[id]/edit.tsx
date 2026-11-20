import { useLocalSearchParams } from "expo-router";
import ArcLearningTopicEditorScreen from "../../../../build/ArcLearningTopicEditorScreen.tsx";

export default function ArcLearningTopicEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcLearningTopicEditorScreen id={id} />;
}
