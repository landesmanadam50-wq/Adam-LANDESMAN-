import { useLocalSearchParams } from "expo-router";
import PurposeManifestEditorScreen from "../../build/PurposeManifestEditorScreen.tsx";

export default function PurposeManifestEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PurposeManifestEditorScreen id={id} />;
}
