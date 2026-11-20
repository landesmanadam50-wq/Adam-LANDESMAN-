import { useLocalSearchParams } from "expo-router";
import ArcGymResultDetailScreen from "../../../build/ArcGymResultDetailScreen.tsx";

export default function ArcGymResultDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymResultDetailScreen id={id} />;
}
