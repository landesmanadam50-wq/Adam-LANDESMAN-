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
    encodingMaxIntensity: 3,
  },
};

// NOTE: program-path / training-window config lives in program/config.ts
// as PROGRAM_DEFINITIONS + TRAINING_CONFIG (Layer Composer architecture).
// This file only holds LIVE-side ARC_CONFIG thresholds.
