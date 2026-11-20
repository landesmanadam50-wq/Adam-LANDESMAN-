import { useLocalSearchParams } from "expo-router";
import ManifestGoalsScreen from "../../../build/ManifestGoalsScreen.tsx";

export default function PurposeManifestGoals() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ManifestGoalsScreen manifestId={id} />;
}
