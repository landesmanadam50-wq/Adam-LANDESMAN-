import { useLocalSearchParams } from "expo-router";
import ArcBookChapterScreen from "../../../../../build/ArcBookChapterScreen.tsx";

export default function ArcGymBookChapter() {
  const { id, chapterId } = useLocalSearchParams<{ id: string; chapterId: string }>();
  return <ArcBookChapterScreen id={id} chapterId={chapterId} />;
}
