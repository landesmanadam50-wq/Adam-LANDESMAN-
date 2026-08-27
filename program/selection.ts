import type { KnownProgramPath, ArcProgramSelection } from "./programTypes.ts";

export interface NeedsAssessmentInput {
  needsState: boolean;
  needsIdentityImmediately?: boolean;
  needsIdentity?: boolean;
}

export function resolveProgramPath(input: NeedsAssessmentInput): KnownProgramPath {
  if (input.needsState) {
    return input.needsIdentityImmediately ? "advanced_2_week" : "standard_3_week";
  }
  return input.needsIdentity ? "identity_habit_2_week" : "habit_only_1_week";
}

export function buildProgramSelection(input: NeedsAssessmentInput): ArcProgramSelection {
  const programPath = resolveProgramPath(input);
  return {
    needsState: input.needsState,
    needsIdentity: input.needsState ? true : !!input.needsIdentity,
    needsHabit: true,
    needsIdentityImmediately: !!input.needsIdentityImmediately,
    programPath,
  };
}

export function deriveNeedsFromLegacyProgramPath(
  programPath: KnownProgramPath
): Omit<ArcProgramSelection, "programPath"> {
  switch (programPath) {
    case "standard_3_week":
      return { needsState: true, needsIdentity: true, needsHabit: true, needsIdentityImmediately: false };
    case "advanced_2_week":
      return { needsState: true, needsIdentity: true, needsHabit: true, needsIdentityImmediately: true };
    case "identity_habit_2_week":
      return { needsState: false, needsIdentity: true, needsHabit: true, needsIdentityImmediately: false };
    case "habit_only_1_week":
      return { needsState: false, needsIdentity: false, needsHabit: true, needsIdentityImmediately: false };
  }
}
