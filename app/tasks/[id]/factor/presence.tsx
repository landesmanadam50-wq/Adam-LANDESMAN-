import { useLocalSearchParams } from "expo-router";
import PresenceProtocolScreen from "../../../../live/PresenceProtocolScreen.tsx";

export default function TaskFactorPresence() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PresenceProtocolScreen taskId={id} />;
}
