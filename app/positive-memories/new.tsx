import { useLocalSearchParams } from "expo-router";
import PositiveMemoryEntryScreen from "../../build/PositiveMemoryEntryScreen.tsx";

export default function PositiveMemoryNew() {
  const { returnToTaskId } = useLocalSearchParams<{ returnToTaskId?: string }>();
  return <PositiveMemoryEntryScreen returnToTaskId={returnToTaskId ?? null} />;
}
