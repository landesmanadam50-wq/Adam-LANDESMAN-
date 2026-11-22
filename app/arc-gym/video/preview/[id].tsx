import { useLocalSearchParams } from "expo-router";
import ArcVideoPreviewScreen from "../../../../build/ArcVideoPreviewScreen.tsx";

export default function ArcGymVideoPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcVideoPreviewScreen id={id} />;
}
