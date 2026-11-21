import { useLocalSearchParams } from "expo-router";
import ArcTriggerEditorScreen from "../../../build/ArcTriggerEditorScreen.tsx";

export default function ArcSavingTriggerEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcTriggerEditorScreen id={id} />;
}
