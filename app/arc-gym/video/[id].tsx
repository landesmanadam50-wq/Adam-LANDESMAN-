import { useLocalSearchParams } from "expo-router";
import ArcVideoDetailScreen from "../../../build/ArcVideoDetailScreen.tsx";

export default function ArcGymVideoDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcVideoDetailScreen id={id} />;
}
