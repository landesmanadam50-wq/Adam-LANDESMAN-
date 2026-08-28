import type { DevelopmentLayer } from "../arc/types.ts";

export interface ProgramWeekDefinition {
  week: number;
  activeLayers: DevelopmentLayer[];
  layersToBuild: DevelopmentLayer[];
}

export interface ProgramDefinition {
  id: string;
  totalWeeks: number;
  weeks: ProgramWeekDefinition[];
}

export type KnownProgramPath =
  | "standard_3_week"
  | "advanced_2_week"
  | "identity_habit_2_week"
  | "habit_only_1_week";

export interface ArcProgramSelection {
  needsState: boolean;
  needsIdentity: boolean;
  needsHabit: boolean;
  needsIdentityImmediately: boolean;
  programPath: string;
}
