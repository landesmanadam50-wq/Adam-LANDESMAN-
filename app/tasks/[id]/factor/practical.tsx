import { useLocalSearchParams } from "expo-router";
import PracticalTaskSupportScreen from "../../../../live/PracticalTaskSupportScreen.tsx";

export default function TaskFactorPractical() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PracticalTaskSupportScreen taskId={id} />;
}
