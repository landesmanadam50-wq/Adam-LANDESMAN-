import { useLocalSearchParams } from "expo-router";
import ArcGymTrainingScreen from "../../../live/ArcGymTrainingScreen.tsx";

export default function ArcGymTrain() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymTrainingScreen id={id} />;
}
