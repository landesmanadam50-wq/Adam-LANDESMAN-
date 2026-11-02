import { useLocalSearchParams } from "expo-router";
import ExternalInterruptionScreen from "../../../../live/ExternalInterruptionScreen.tsx";

export default function TaskFactorInterruption() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExternalInterruptionScreen taskId={id} />;
}
