import { useLocalSearchParams } from "expo-router";
import ArcDiaryEntryScreen from "../../build/ArcDiaryEntryScreen.tsx";

export default function ArcDiaryNew() {
  const { returnToTaskId } = useLocalSearchParams<{ returnToTaskId?: string }>();
  return <ArcDiaryEntryScreen id={null} returnToTaskId={returnToTaskId ?? null} />;
}
