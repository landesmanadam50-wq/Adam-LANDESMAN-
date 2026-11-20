import { useLocalSearchParams } from "expo-router";
import ArcFocusLiveScreen from "../../../live/ArcFocusLiveScreen.tsx";

export default function TaskArcFocus() {
  const { id, arcFocusPracticeId } = useLocalSearchParams<{ id: string; arcFocusPracticeId: string }>();
  return <ArcFocusLiveScreen taskId={id} arcFocusPracticeId={arcFocusPracticeId} />;
}
