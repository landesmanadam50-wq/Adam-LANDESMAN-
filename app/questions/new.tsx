import { useLocalSearchParams } from "expo-router";
import ArcQuestionComposerScreen from "../../build/ArcQuestionComposerScreen.tsx";

export default function ArcQuestionNew() {
  const { returnToTaskId } = useLocalSearchParams<{ returnToTaskId?: string }>();
  return <ArcQuestionComposerScreen id={null} returnToTaskId={returnToTaskId ?? null} />;
}
