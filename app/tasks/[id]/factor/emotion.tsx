import { useLocalSearchParams } from "expo-router";
import EmotionIdentificationScreen from "../../../../live/EmotionIdentificationScreen.tsx";

export default function TaskFactorEmotion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EmotionIdentificationScreen taskId={id} />;
}
