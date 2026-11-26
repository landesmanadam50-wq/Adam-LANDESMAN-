import { useLocalSearchParams } from "expo-router";
import ArcQuestionsHomeScreen from "../../build/ArcQuestionsHomeScreen.tsx";

export default function ArcQuestionsHome() {
  const { returnToTaskId } = useLocalSearchParams<{ returnToTaskId?: string }>();
  return <ArcQuestionsHomeScreen returnToTaskId={returnToTaskId ?? null} />;
}
