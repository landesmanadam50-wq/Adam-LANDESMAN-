import { useLocalSearchParams } from "expo-router";
import SavedFactorChooserScreen from "../../../../live/SavedFactorChooserScreen.tsx";
import type { SavedFactorKind } from "../../../../live/SavedFactorChooserScreen.tsx";

export default function TaskFactorSaved() {
  const { id, factorKind } = useLocalSearchParams<{ id: string; factorKind: SavedFactorKind }>();
  return <SavedFactorChooserScreen taskId={id} factorKind={factorKind} />;
}
