import { useLocalSearchParams } from "expo-router";
import ArcWritingTextScreen from "../../../build/ArcWritingTextScreen.tsx";

export default function ArcGymWritingDetail() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  return <ArcWritingTextScreen id={id} initialKind={kind === "video_script" ? "video_script" : null} />;
}
