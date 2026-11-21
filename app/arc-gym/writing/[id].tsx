import { useLocalSearchParams } from "expo-router";
import ArcWritingTextScreen from "../../../build/ArcWritingTextScreen.tsx";

export default function ArcGymWritingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ArcWritingTextScreen id={id} />;
}
