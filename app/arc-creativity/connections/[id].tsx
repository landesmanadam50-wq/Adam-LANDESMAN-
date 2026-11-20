import { useLocalSearchParams } from "expo-router";
import ArcCreativityConnectionDetailScreen from "../../../build/ArcCreativityConnectionDetailScreen.tsx";

export default function ArcCreativityConnectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcCreativityConnectionDetailScreen id={id} />;
}
