import { useLocalSearchParams } from "expo-router";
import LowEnergyScreen from "../../../../live/LowEnergyScreen.tsx";

export default function TaskFactorEnergy() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LowEnergyScreen taskId={id} />;
}
