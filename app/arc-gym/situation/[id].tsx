import { useLocalSearchParams } from "expo-router";
import ArcGymSituationScreen from "../../../build/ArcGymSituationScreen.tsx";

export default function ArcGymSituation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymSituationScreen id={id} />;
}
