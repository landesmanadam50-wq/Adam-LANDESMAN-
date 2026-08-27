import type { KnownProgramPath, ArcProgramSelection } from "./programTypes.ts";

export interface NeedsAssessmentInput {
  needsState: boolean;
  needsIdentityImmediately?: boolean;
  needsIdentity?: boolean;
}

/**
 * Resolves the needs assessment to one of the FOUR presets currently
 * shown in the BUILD UI. This is not a general resolver over every
 * possible layer combination -- PROGRAM_DEFINITIONS already has more
 * (state_only_1_week, state_habit_2_week, identity_only_1_week,
 * state_identity_2_week), and the program/ engine (engine.ts,
 * progress.ts) works with any ProgramDefinition, activeLayers, and
 * layersToBuild without caring which preset produced them. This
 * function only encodes which of the four *current* presets a
 * needsState/needsIdentity/needsIdentityImmediately combination maps
 * to for the UI that exists today.
 */
export function resolveCurrentPreset(input: NeedsAssessmentInput): KnownProgramPath {
  if (input.needsState) {
    return input.needsIdentityImmediately ? "advanced_2_week" : "standard_3_week";
  }
  return input.needsIdentity ? "identity_habit_2_week" : "habit_only_1_week";
}

/** General constructor: does not force needsHabit, unlike buildProgramSelection(). */
export function createProgramSelection(
  input: { needsState: boolean; needsIdentity: boolean; needsHabit: boolean; needsIdentityImmediately: boolean },
  programPath: string
): ArcProgramSelection {
  return { ...input, programPath };
}

/**
 * Builds the ArcProgramSelection for the four current presets, where
 * habit is always part of the program (buildProgramSelection hardcodes
 * needsHabit: true because every one of today's four presets ends in a
 * habit week). This is intentionally narrower than
 * createProgramSelection(), which is what a future State Only /
 * Identity Only / State + Identity UI would use instead -- needsHabit
 * must stay independent at the architecture level even though today's
 * UI never sets it to false.
 */
export function buildProgramSelection(input: NeedsAssessmentInput): ArcProgramSelection {
  const programPath = resolveCurrentPreset(input);
  return createProgramSelection(
    {
      needsState: input.needsState,
      needsIdentity: input.needsState ? true : !!input.needsIdentity,
      needsHabit: true,
      needsIdentityImmediately: !!input.needsIdentityImmediately,
    },
    programPath
  );
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
