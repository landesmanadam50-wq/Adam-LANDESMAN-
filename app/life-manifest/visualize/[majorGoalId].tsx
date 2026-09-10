import LifeManifestVisualizationScreen from "../../../live/LifeManifestVisualizationScreen.tsx";
import LifeManifestErrorBoundary from "../../../build/LifeManifestErrorBoundary.tsx";

export default function Visualize() {
  return (
    <LifeManifestErrorBoundary>
      <LifeManifestVisualizationScreen />
    </LifeManifestErrorBoundary>
  );
}
