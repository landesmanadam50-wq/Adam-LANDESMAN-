import { useLocalSearchParams } from "expo-router";
import PositiveMemoryWizardScreen from "../../../build/PositiveMemoryWizardScreen.tsx";

export default function PositiveMemoryDraft() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  return <PositiveMemoryWizardScreen draftId={draftId} />;
}
