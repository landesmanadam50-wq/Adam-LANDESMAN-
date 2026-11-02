import { useLocalSearchParams } from "expo-router";
import NeutralRegulationScreen from "../../../../live/NeutralRegulationScreen.tsx";

export default function TaskFactorNeutral() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NeutralRegulationScreen taskId={id} />;
}
