import { useLocalSearchParams } from "expo-router";
import ArcGymMemoryEditorScreen from "../../../../build/ArcGymMemoryEditorScreen.tsx";

export default function ArcGymMemoryEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymMemoryEditorScreen id={id} />;
}
