import { useLocalSearchParams } from "expo-router";
import DailyVisualizationScreen from "../live/DailyVisualizationScreen.tsx";

export default function DailyVisualization() {
  const { returnToTaskId } = useLocalSearchParams<{ returnToTaskId?: string }>();
  return <DailyVisualizationScreen returnToTaskId={returnToTaskId} />;
}
