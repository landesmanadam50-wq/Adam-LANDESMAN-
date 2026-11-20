import { useLocalSearchParams } from "expo-router";
import ArcFocusCheckInScreen from "../../../../live/ArcFocusCheckInScreen.tsx";

export default function TaskArcFocusCheckIn() {
  const { id, arcFocusPracticeId } = useLocalSearchParams<{ id: string; arcFocusPracticeId: string }>();
  return <ArcFocusCheckInScreen id={id} arcFocusPracticeId={arcFocusPracticeId} />;
}
