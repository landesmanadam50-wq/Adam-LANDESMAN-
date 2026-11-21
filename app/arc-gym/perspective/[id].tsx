import { useLocalSearchParams } from "expo-router";
import ArcGymPerspectiveEventDetailScreen from "../../../build/ArcGymPerspectiveEventDetailScreen.tsx";

export default function ArcGymPerspectiveEventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymPerspectiveEventDetailScreen id={id} />;
}
