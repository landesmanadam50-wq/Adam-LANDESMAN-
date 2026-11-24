import { useLocalSearchParams } from "expo-router";
import ArcRecallChatScreen from "../../../build/ArcRecallChatScreen.tsx";

export default function ArcRecallChat() {
  const { reminderId } = useLocalSearchParams<{ reminderId: string }>();
  return <ArcRecallChatScreen reminderId={reminderId} />;
}
