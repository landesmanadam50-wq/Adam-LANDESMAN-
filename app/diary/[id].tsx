import { useLocalSearchParams } from "expo-router";
import ArcDiaryEntryScreen from "../../build/ArcDiaryEntryScreen.tsx";

export default function ArcDiaryDetail() {
  const { id, returnToTaskId } = useLocalSearchParams<{ id: string; returnToTaskId?: string }>();
  return <ArcDiaryEntryScreen id={id} returnToTaskId={returnToTaskId ?? null} />;
}
