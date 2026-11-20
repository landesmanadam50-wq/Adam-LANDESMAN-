import { useLocalSearchParams } from "expo-router";
import ArcGymSituationEditorScreen from "../../../../build/ArcGymSituationEditorScreen.tsx";

export default function ArcGymSituationEdit() {
  const { id, behaviorId, manifestId } = useLocalSearchParams<{ id: string; behaviorId?: string; manifestId?: string }>();
  return <ArcGymSituationEditorScreen id={id} behaviorId={behaviorId ?? null} manifestId={manifestId ?? null} />;
}
