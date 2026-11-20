import { useLocalSearchParams } from "expo-router";
import ArcGymGoalDetailScreen from "../../../build/ArcGymGoalDetailScreen.tsx";

export default function ArcGymGoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymGoalDetailScreen id={id} />;
}
