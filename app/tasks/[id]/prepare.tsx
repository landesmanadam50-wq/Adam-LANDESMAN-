import { useLocalSearchParams } from "expo-router";
import PreparationScreen from "../../../live/PreparationScreen.tsx";

export default function TaskPrepare() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PreparationScreen taskId={id} />;
}
