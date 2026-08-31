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
      // negativeActionDurationScale: no real weekly Negative Action
      // reduction schedule existed anywhere in this codebase prior to
      // this field (confirmed by inspection -- there was no
      // "negativeActionDurationByWeek" or equivalent). These three
      // values are an illustrative, tunable default gradual-reduction
      // schedule (full allowance in week 1, progressively smaller as
      // the habit layer's work continues), not a real prescribed
      // clinical schedule -- adjust freely. See
      // program/engine.ts's resolveNegativeActionDuration.
      { week: 1, activeLayers: ["state"], layersToBuild: ["state"], negativeActionDurationScale: 1 },
      { week: 2, activeLayers: ["state", "identity"], layersToBuild: ["identity"], negativeActionDurationScale: 0.65 },
      { week: 3, activeLayers: ["state", "identity", "habit"], layersToBuild: ["habit"], negativeActionDurationScale: 0.35 },
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
