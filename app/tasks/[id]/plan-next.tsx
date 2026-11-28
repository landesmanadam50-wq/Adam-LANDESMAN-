import { useLocalSearchParams } from "expo-router";
import DynamicPlanningConfirmScreen from "../../../live/DynamicPlanningConfirmScreen.tsx";

export default function TaskPlanNext() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DynamicPlanningConfirmScreen precedingTaskId={id} />;
}
