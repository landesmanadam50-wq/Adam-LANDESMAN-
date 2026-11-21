import { useLocalSearchParams } from "expo-router";
import ArcSavingActivateScreen from "../../build/ArcSavingActivateScreen.tsx";

export default function ArcSavingActivate() {
  const { triggerId } = useLocalSearchParams<{ triggerId?: string }>();
  return <ArcSavingActivateScreen triggerId={triggerId ?? null} />;
}
