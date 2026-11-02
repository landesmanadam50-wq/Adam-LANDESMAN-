import { useLocalSearchParams } from "expo-router";
import SessionReflectionScreen from "../../../live/SessionReflectionScreen.tsx";

export default function TaskReflect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionReflectionScreen taskId={id} />;
}
