import { useLocalSearchParams } from "expo-router";
import ArcGymMemoryVisualizationScreen from "../../../../live/ArcGymMemoryVisualizationScreen.tsx";

export default function ArcGymMemoryTrain() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymMemoryVisualizationScreen id={id} />;
}
