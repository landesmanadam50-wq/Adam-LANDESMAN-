import { useLocalSearchParams } from "expo-router";
import NewFactorCaptureScreen from "../../../../live/NewFactorCaptureScreen.tsx";
import type { SavedFactorKind } from "../../../../live/SavedFactorChooserScreen.tsx";

export default function TaskFactorNew() {
  const { id, factorKind } = useLocalSearchParams<{ id: string; factorKind: SavedFactorKind }>();
  return <NewFactorCaptureScreen taskId={id} factorKind={factorKind} />;
}
