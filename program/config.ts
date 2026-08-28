import type { ProgramDefinition } from "./programTypes.ts";

export const TRAINING_CONFIG = {
  requiredTrainingDaysPerArcWeek: 5,
  arcWeekWindowDays: 7,
};

export const PROGRAM_DEFINITIONS: Record<string, ProgramDefinition> = {
  standard_3_week: {
    id: "standard_3_week",
    totalWeeks: 3,
    weeks: [
      { week: 1, activeLayers: ["state"], layersToBuild: ["state"] },
      { week: 2, activeLayers: ["state", "identity"], layersToBuild: ["identity"] },
      { week: 3, activeLayers: ["state", "identity", "habit"], layersToBuild: ["habit"] },
    ],
  },

  advanced_2_week: {
    id: "advanced_2_week",
    totalWeeks: 2,
    weeks: [
      { week: 1, activeLayers: ["state", "identity"], layersToBuild: ["state", "identity"] },
      { week: 2, activeLayers: ["state", "identity", "habit"], layersToBuild: ["habit"] },
    ],
  },

  identity_habit_2_week: {
    id: "identity_habit_2_week",
    totalWeeks: 2,
    weeks: [
      { week: 1, activeLayers: ["identity"], layersToBuild: ["identity"] },
      { week: 2, activeLayers: ["identity", "habit"], layersToBuild: ["habit"] },
    ],
  },

  habit_only_1_week: {
    id: "habit_only_1_week",
    totalWeeks: 1,
    weeks: [{ week: 1, activeLayers: ["habit"], layersToBuild: ["habit"] }],
  },

  state_only_1_week: {
    id: "state_only_1_week",
    totalWeeks: 1,
    weeks: [{ week: 1, activeLayers: ["state"], layersToBuild: ["state"] }],
  },

  state_habit_2_week: {
    id: "state_habit_2_week",
    totalWeeks: 2,
    weeks: [
      { week: 1, activeLayers: ["state"], layersToBuild: ["state"] },
      { week: 2, activeLayers: ["state", "habit"], layersToBuild: ["habit"] },
    ],
  },

  identity_only_1_week: {
    id: "identity_only_1_week",
    totalWeeks: 1,
    weeks: [{ week: 1, activeLayers: ["identity"], layersToBuild: ["identity"] }],
  },

  state_identity_2_week: {
    id: "state_identity_2_week",
    totalWeeks: 2,
    weeks: [
      { week: 1, activeLayers: ["state"], layersToBuild: ["state"] },
      { week: 2, activeLayers: ["state", "identity"], layersToBuild: ["identity"] },
    ],
  },
};
