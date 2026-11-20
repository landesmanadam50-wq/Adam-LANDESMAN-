import { useLocalSearchParams } from "expo-router";
import ArcCreativityRecallScreen from "../../../build/ArcCreativityRecallScreen.tsx";

export default function TaskArcCreativityReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcCreativityRecallScreen taskId={id} />;
}
