import { useLocalSearchParams } from "expo-router";
import ArcQuestionComposerScreen from "../../build/ArcQuestionComposerScreen.tsx";

export default function ArcQuestionDetail() {
  const { id, returnToTaskId } = useLocalSearchParams<{ id: string; returnToTaskId?: string }>();
  return <ArcQuestionComposerScreen id={id} returnToTaskId={returnToTaskId ?? null} />;
}
