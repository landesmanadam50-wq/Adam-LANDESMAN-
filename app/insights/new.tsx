import { useLocalSearchParams } from "expo-router";
import InsightWriteScreen from "../../build/InsightWriteScreen.tsx";

export default function InsightNew() {
  const { returnToTaskId } = useLocalSearchParams<{ returnToTaskId?: string }>();
  return <InsightWriteScreen returnToTaskId={returnToTaskId ?? null} />;
}
