import LifeManifestEditorScreen from "../../build/LifeManifestEditorScreen.tsx";
import LifeManifestErrorBoundary from "../../build/LifeManifestErrorBoundary.tsx";

export default function LifeManifestEditor() {
  return (
    <LifeManifestErrorBoundary>
      <LifeManifestEditorScreen />
    </LifeManifestErrorBoundary>
  );
}
