import { useLocalSearchParams } from "expo-router";
import ArcGymBehaviorScreen from "../../../build/ArcGymBehaviorScreen.tsx";

export default function ArcGymBehavior() {
  const { behaviorId, manifestId } = useLocalSearchParams<{ behaviorId: string; manifestId: string }>();
  return <ArcGymBehaviorScreen behaviorId={behaviorId} manifestId={manifestId} />;
}
