import { useLocalSearchParams } from "expo-router";
import ArcWindowScreen from "../../../live/ArcWindowScreen.tsx";

export default function TaskArcWindow() {
  const { id, autoStartAfter } = useLocalSearchParams<{ id: string; autoStartAfter?: string }>();
  return <ArcWindowScreen taskId={id} autoStartAfter={autoStartAfter === "1"} />;
}
