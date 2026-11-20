import { useLocalSearchParams } from "expo-router";
import InsightDetailScreen from "../../build/InsightDetailScreen.tsx";

export default function InsightDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InsightDetailScreen id={id} />;
}
