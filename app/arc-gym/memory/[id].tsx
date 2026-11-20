import { useLocalSearchParams } from "expo-router";
import ArcGymMemoryDetailScreen from "../../../build/ArcGymMemoryDetailScreen.tsx";

export default function ArcGymMemoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymMemoryDetailScreen id={id} />;
}
