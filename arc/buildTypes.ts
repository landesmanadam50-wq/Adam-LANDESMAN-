export interface BuildGoalProfile {
  goal: string;
  habit: string;
  identity: string;
  desiredStateId: string;
  desiredState: string;
}

export interface ArcMap {
  id: string;
  desiredStateId: string;
  interferingState: string | null;
  challengeContext: string | null;
  preventiveAction: string | null;
}

export function migrateLegacyStateFields(legacy: {
  supportiveState: string;
  interferingState: string | null;
  goal: string;
  habit: string;
  identity: string;
  desiredStateId: string;
  arcMapId: string;
}): { goalProfile: BuildGoalProfile; arcMap: ArcMap } {
  return {
    goalProfile: {
      goal: legacy.goal,
      habit: legacy.habit,
      identity: legacy.identity,
      desiredStateId: legacy.desiredStateId,
      desiredState: legacy.supportiveState,
    },
    arcMap: {
      id: legacy.arcMapId,
      desiredStateId: legacy.desiredStateId,
      interferingState: legacy.interferingState,
      challengeContext: null,
      preventiveAction: null,
    },
  };
}
