export const ARC_CONFIG = {
  presence: {
    threshold: 6,
  },
  proactive: {
    regulationThreshold: 5,
  },
  reactive: {
    stayMinIntensity: 8,
    transitionMinIntensity: 6,
    regulationMinIntensity: 4,
    // Values from 1 up to and including this are the "Encoding Zone" --
    // low enough that no further staying/regulation is needed before
    // moving to encode. getReactiveStage() in engine.ts treats anything
    // below regulationMinIntensity as this zone; validateArcConfig()
    // below enforces that the two thresholds actually agree.
    encodingMaxIntensity: 3,
  },
  safety: {
    // Caps the ARC Thought recheck loop and the reactive/proactive
    // intensity-recheck loops in arcEngine.ts so a trainee who keeps
    // reporting a high rating can never get stuck -- after this many
    // loop-backs the engine forces the session forward instead.
    maxLoopIterations: 3,
  },
};

// NOTE: program-path / training-window config lives in program/config.ts
// as PROGRAM_DEFINITIONS + TRAINING_CONFIG (Layer Composer architecture).
// This file only holds LIVE-side ARC_CONFIG thresholds.

/**
 * The reactive intensity bands must be strictly ordered and adjacent
 * with no gap or overlap: encodingMaxIntensity < regulationMinIntensity
 * < transitionMinIntensity < stayMinIntensity. Returns a list of
 * issues (empty = valid) rather than throwing, so it can be asserted
 * in tests without try/catch boilerplate.
 */
export function validateArcConfig(config: typeof ARC_CONFIG = ARC_CONFIG): string[] {
  const issues: string[] = [];
  const { encodingMaxIntensity, regulationMinIntensity, transitionMinIntensity, stayMinIntensity } = config.reactive;

  if (!(encodingMaxIntensity < regulationMinIntensity)) {
    issues.push(`encodingMaxIntensity (${encodingMaxIntensity}) must be < regulationMinIntensity (${regulationMinIntensity})`);
  }
  if (!(regulationMinIntensity < transitionMinIntensity)) {
    issues.push(`regulationMinIntensity (${regulationMinIntensity}) must be < transitionMinIntensity (${transitionMinIntensity})`);
  }
  if (!(transitionMinIntensity < stayMinIntensity)) {
    issues.push(`transitionMinIntensity (${transitionMinIntensity}) must be < stayMinIntensity (${stayMinIntensity})`);
  }

  return issues;
}
