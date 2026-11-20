import { useLocalSearchParams } from "expo-router";
import ManifestTaskLiveScreen from "../../../live/ManifestTaskLiveScreen.tsx";

export default function TaskManifest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ManifestTaskLiveScreen taskId={id} />;
}
