import { useLocalSearchParams } from "expo-router";

import { LifeManifestSubGoalPanel } from "./LifeManifestSubGoalPanel.tsx";

/**
 * build/LifeManifestSubGoalScreen.tsx (route: /life-manifest/sub-goal/[subGoalId])
 *
 * Single-page Life Manifest BUILD task: this screen is now a thin
 * wrapper around build/LifeManifestSubGoalPanel.tsx (embedded=false),
 * which owns every field, action, and modal -- see that file's own doc.
 * Kept as its own preserved route because a Sub-goal is still reached
 * directly from places that never carry its owning Major Goal's full
 * questionnaire with them: a deadline notification tap, a journal
 * entry, or a dashboard button. build/LifeManifestEditorScreen.tsx's
 * own single-page accordion renders the exact same panel
 * (embedded=true) nested per Sub-goal, so "ניהול תת־המטרה" is no longer
 * the only way to reach this content -- both routes edit the same data
 * through the same component.
 */
export default function LifeManifestSubGoalScreen() {
  const { subGoalId } = useLocalSearchParams<{ subGoalId: string }>();
  return <LifeManifestSubGoalPanel subGoalId={subGoalId} />;
}
