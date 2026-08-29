import type { DevelopmentLayer } from "../arc/types.ts";

export interface ProgramWeekDefinition {
  week: number;
  activeLayers: DevelopmentLayer[];
  layersToBuild: DevelopmentLayer[];
  /**
   * The gradual-reduction multiplier (0-1) applied to a trainee's own
   * configured negativeActionBaseDurationMinutes (arc/types.ts) to get
   * this week's permitted Negative Action duration -- see
   * program/engine.ts's resolveNegativeActionDuration, the one place
   * this scaling happens. A generic, per-program-path schedule (not
   * trainee-specific data): the actual minutes always come from the
   * trainee's own BUILD-configured base amount, never invented here.
   * Optional -- undefined means "no reduction configured for this
   * week" and resolveNegativeActionDuration falls back to the base
   * duration unscaled, so every program path/week that doesn't set
   * this behaves exactly as it did before this field existed.
   */
  negativeActionDurationScale?: number;
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
