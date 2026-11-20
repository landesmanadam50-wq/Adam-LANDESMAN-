import { useLocalSearchParams } from "expo-router";
import PositiveMemoryDetailScreen from "../../build/PositiveMemoryDetailScreen.tsx";

export default function PositiveMemoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PositiveMemoryDetailScreen id={id} />;
}
