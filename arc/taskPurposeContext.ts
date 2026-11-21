/**
 * arc/taskPurposeContext.ts
 *
 * Task LIVE Purpose Card task: resolves "why this task matters right
 * now" -- a goal, a reason, a value, and an identity -- for display on
 * Task LIVE (live/ActiveTaskScreen.tsx) and nowhere else. Reuses every
 * field that already existed before this task, never a duplicate goal/
 * reason/value/identity store:
 *   - Task.reason/Task.value/Task.identity (the last two pre-existing;
 *     reason is the one genuinely new field this task adds, mirroring
 *     them exactly) -- the task's OWN, task-level override, checked
 *     first for each of the three.
 *   - Whichever goal this task is linked to supplies the GOAL-LEVEL
 *     default for any of the three the task itself didn't set, plus the
 *     goal text itself (never overridden at task level -- a task is
 *     linked to exactly one goal, or none):
 *       - task.arcGymGoalId -> ArcGymGoal.title (goal) + its own
 *         dedicated PurposeManifest's personalReason/personalValue/
 *         personalIdentity (arc/arcGymGoal.ts/arc/purposeManifest.ts).
 *       - task.purposeManifestId -> that PurposeManifest's own
 *         longTermGoal/personalReason/personalValue/personalIdentity
 *         directly (arc/manifestGoals.ts's ManifestGoal itself carries
 *         no reason/value/identity of its own -- its owning manifest
 *         does).
 *       - task.linkedArcGoalId -> that ArcGoal's own name/personalReason/
 *         value (arc/types.ts). ArcGoal has no simple free-text identity
 *         field of its own (identityProtocolId references a whole
 *         Identity Build protocol, not a single display line) -- its
 *         identity is left null here rather than inventing one.
 *   - A task linked to none of the three (or whose goal no longer
 *     exists) falls back to task-level fields only; a task with neither
 *     a goal nor any task-level field set resolves to every field null
 *     -- see isTaskPurposeContextEmpty, the caller's own signal to hide
 *     the whole card rather than render an empty shell.
 *
 * Pure, no React/AsyncStorage/navigation -- same split as every other
 * arc/*.ts module. The caller loads the three collections once (data/
 * storage.ts's loadPurposeManifests/loadArcGymGoals/loadArcGoals) and
 * passes them in; this never reads storage itself.
 */

import type { Task } from "./tasks.ts";
import type { PurposeManifest } from "./purposeManifest.ts";
import type { ArcGymGoal } from "./arcGymGoal.ts";
import type { ArcGoal } from "./types.ts";

export interface TaskPurposeContext {
  goal: string | null;
  reason: string | null;
  value: string | null;
  identity: string | null;
}

function nonEmpty(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

/** The goal-level defaults only, before any task-level override is applied -- see resolveTaskPurposeContext below for the actual priority rule. Checks arcGymGoalId, then purposeManifestId, then linkedArcGoalId, in that order; a task is expected to carry at most one of the three at a time, but if more than one is somehow set, the first match wins deterministically. */
function resolveGoalLevelPurpose(task: Task, manifests: PurposeManifest[], arcGymGoals: ArcGymGoal[], arcGoals: ArcGoal[]): TaskPurposeContext {
  if (task.arcGymGoalId) {
    const goal = arcGymGoals.find((candidate) => candidate.id === task.arcGymGoalId);
    if (goal) {
      const manifest = manifests.find((candidate) => candidate.id === goal.manifestId) ?? null;
      return {
        goal: nonEmpty(goal.title),
        reason: manifest ? nonEmpty(manifest.personalReason) : null,
        value: manifest ? nonEmpty(manifest.personalValue) : null,
        identity: manifest ? nonEmpty(manifest.personalIdentity) : null,
      };
    }
  }
  if (task.purposeManifestId) {
    const manifest = manifests.find((candidate) => candidate.id === task.purposeManifestId);
    if (manifest) {
      return {
        goal: nonEmpty(manifest.longTermGoal),
        reason: nonEmpty(manifest.personalReason),
        value: nonEmpty(manifest.personalValue),
        identity: nonEmpty(manifest.personalIdentity),
      };
    }
  }
  if (task.linkedArcGoalId) {
    const goal = arcGoals.find((candidate) => candidate.id === task.linkedArcGoalId);
    if (goal) {
      return {
        goal: nonEmpty(goal.name),
        reason: nonEmpty(goal.personalReason),
        value: nonEmpty(goal.value),
        identity: null,
      };
    }
  }
  return { goal: null, reason: null, value: null, identity: null };
}

/**
 * The spec's own priority rule: "when task-level info exists, prefer it
 * over the goal's general info." Applied independently per field --
 * reason/value/identity each fall back to the goal level only when the
 * task itself left that one field blank; the goal text is never
 * overridden at task level (there's nothing to override it with).
 * Never invents a value -- every field that's genuinely unset on both
 * levels stays null.
 */
export function resolveTaskPurposeContext(task: Task, manifests: PurposeManifest[], arcGymGoals: ArcGymGoal[], arcGoals: ArcGoal[]): TaskPurposeContext {
  const goalLevel = resolveGoalLevelPurpose(task, manifests, arcGymGoals, arcGoals);
  return {
    goal: goalLevel.goal,
    reason: nonEmpty(task.reason) ?? goalLevel.reason,
    value: nonEmpty(task.value) ?? goalLevel.value,
    identity: nonEmpty(task.identity) ?? goalLevel.identity,
  };
}

/** True when there is genuinely nothing to show for any of the four fields -- the caller (live/components/TaskPurposeCard.tsx) hides the whole card in this case rather than rendering an empty shell. */
export function isTaskPurposeContextEmpty(context: TaskPurposeContext): boolean {
  return !context.goal && !context.reason && !context.value && !context.identity;
}
