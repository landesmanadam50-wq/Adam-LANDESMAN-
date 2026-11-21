import { useLocalSearchParams } from "expo-router";
import ArcBookDetailScreen from "../../../build/ArcBookDetailScreen.tsx";

export default function ArcGymBookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcBookDetailScreen id={id} />;
}
