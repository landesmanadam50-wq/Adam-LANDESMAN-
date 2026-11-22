import { useLocalSearchParams } from "expo-router";
import ArcVideoRecordScreen from "../../../../build/ArcVideoRecordScreen.tsx";

export default function ArcGymVideoRecord() {
  const { scriptId } = useLocalSearchParams<{ scriptId: string }>();
  return <ArcVideoRecordScreen scriptId={scriptId} />;
}
