import { useLocalSearchParams } from "expo-router";
import ArcGymResultEditorScreen from "../../../../build/ArcGymResultEditorScreen.tsx";

export default function ArcGymResultEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymResultEditorScreen id={id} />;
}
