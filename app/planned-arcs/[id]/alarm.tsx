import { useLocalSearchParams } from "expo-router";
import ArcAlarmScreen from "../../../live/ArcAlarmScreen.tsx";

export default function PlannedArcAlarm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcAlarmScreen plannedArcId={id} />;
}
