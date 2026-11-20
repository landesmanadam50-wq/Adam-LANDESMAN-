import { useLocalSearchParams } from "expo-router";
import ArcGymVisualizationOnlyScreen from "../../../live/ArcGymVisualizationOnlyScreen.tsx";

export default function ArcGymVisualizeOnly() {
  const { id, recordAlreadyFinished } = useLocalSearchParams<{ id: string; recordAlreadyFinished?: string }>();
  return <ArcGymVisualizationOnlyScreen id={id} recordAlreadyFinished={recordAlreadyFinished === "1"} />;
}
