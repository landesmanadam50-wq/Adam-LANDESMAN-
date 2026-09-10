import LifeManifestSubGoalScreen from "../../../build/LifeManifestSubGoalScreen.tsx";
import LifeManifestErrorBoundary from "../../../build/LifeManifestErrorBoundary.tsx";

export default function SubGoalManage() {
  return (
    <LifeManifestErrorBoundary>
      <LifeManifestSubGoalScreen />
    </LifeManifestErrorBoundary>
  );
}
