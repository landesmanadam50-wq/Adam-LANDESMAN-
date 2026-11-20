import { useLocalSearchParams } from "expo-router";
import ArcLearningInsightWizardScreen from "../../../../build/ArcLearningInsightWizardScreen.tsx";

export default function ArcLearningInsightEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcLearningInsightWizardScreen id={id} />;
}
