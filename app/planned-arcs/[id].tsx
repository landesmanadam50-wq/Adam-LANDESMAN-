import { useLocalSearchParams } from "expo-router";
import PlannedArcEditorScreen from "../../build/PlannedArcEditorScreen.tsx";

export default function PlannedArcEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlannedArcEditorScreen id={id} />;
}
