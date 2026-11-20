/**
 * arc/manifestTaskSteps.ts
 *
 * Productivity & Personal Development upgrade task, requirement 6: the
 * typed, deterministic, linear step sequence for a "manifest"-kind
 * task's own guided run -- Step B (visualize the future self, from the
 * side) -> Step C (an ARC-adapted sequence: awareness, presence,
 * acceptance, regulation, encoding) -> Step D (one small identity
 * action). No branching at all (unlike arc/newArcLiveSteps.ts's goal-
 * type/unpleasant-area branches) -- every Manifest task kind takes the
 * exact same path every time, since Step A's own setup
 * (longTermGoal/desiredResult/desiredIdentity/bodyLanguageDescription)
 * is fixed once in build/TaskEditorScreen.tsx, never re-chosen per run.
 */

export const MANIFEST_STEP_ORDER = ["visualize", "awareness", "presence", "acceptance", "regulation", "encoding", "identity_action", "complete"] as const;
export type ManifestStepId = (typeof MANIFEST_STEP_ORDER)[number];

export const VISUALIZE_LINE_COUNT = 5;
export const ENCODING_LINE_COUNT = 4;

export function manifestStepSubCount(step: ManifestStepId): number {
  if (step === "visualize") return VISUALIZE_LINE_COUNT;
  if (step === "encoding") return ENCODING_LINE_COUNT;
  return 1;
}

export interface ManifestRunState {
  taskId: string;
  currentStep: ManifestStepId;
  subIndex: number;
}

export function createManifestRunState(taskId: string): ManifestRunState {
  return { taskId, currentStep: "visualize", subIndex: 0 };
}

export function advanceManifestRun(state: ManifestRunState): ManifestRunState {
  const count = manifestStepSubCount(state.currentStep);
  if (state.subIndex + 1 < count) {
    return { ...state, subIndex: state.subIndex + 1 };
  }
  const currentIndex = MANIFEST_STEP_ORDER.indexOf(state.currentStep);
  const nextStep = MANIFEST_STEP_ORDER[Math.min(currentIndex + 1, MANIFEST_STEP_ORDER.length - 1)];
  return { ...state, currentStep: nextStep, subIndex: 0 };
}

export function goBackManifestRun(state: ManifestRunState): ManifestRunState | null {
  if (state.subIndex > 0) {
    return { ...state, subIndex: state.subIndex - 1 };
  }
  const currentIndex = MANIFEST_STEP_ORDER.indexOf(state.currentStep);
  if (currentIndex === 0) return null;
  const previousStep = MANIFEST_STEP_ORDER[currentIndex - 1];
  return { ...state, currentStep: previousStep, subIndex: manifestStepSubCount(previousStep) - 1 };
}

export function resolveManifestProgress(state: ManifestRunState): { position: number; total: number } {
  let total = 0;
  let position = 0;
  for (const step of MANIFEST_STEP_ORDER) {
    if (step === "complete") continue;
    const count = manifestStepSubCount(step);
    for (let sub = 0; sub < count; sub++) {
      total += 1;
      if (step === state.currentStep && sub === state.subIndex) position = total;
    }
  }
  // "complete" isn't counted as a step of its own above (it has no
  // content screen) -- reaching it means every real step is done, so
  // position must read as fully finished, never drop back to 0.
  if (state.currentStep === "complete") position = total;
  return { position, total };
}
