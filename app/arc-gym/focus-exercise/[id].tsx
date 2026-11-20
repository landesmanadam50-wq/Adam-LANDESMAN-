import { useLocalSearchParams } from "expo-router";
import ArcGymFocusExerciseDetailScreen from "../../../build/ArcGymFocusExerciseDetailScreen.tsx";

export default function ArcGymFocusExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcGymFocusExerciseDetailScreen id={id} />;
}
