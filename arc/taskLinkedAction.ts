/**
 * arc/taskLinkedAction.ts
 *
 * Action-Based Tasks task, section 9: ONE central, extensible
 * mechanism for "starting this task opens an internal ARCHI action
 * directly" -- not a bespoke Task field per module. Deliberately
 * additive and separate from the pre-existing per-kind mechanism
 * (Task.taskKind + its own dedicated id field: arcFocus/
 * arcLearningReview/arcCreativityReview/arcWriting, plus
 * calendarEntryKind "arc"/"arc_gym") -- that mechanism is untouched,
 * since every task that already uses it never sets `linkedAction`.
 * `linkedAction` is the ONE place a future module adds a new kind,
 * never a new Task field or a new live/ActiveTaskScreen.tsx branch.
 *
 * Pure types + a pure route-table function only, no AsyncStorage, no
 * React, no navigation call -- exactly the "arc/*.ts has no side
 * effects" split every other module here follows. Two kinds
 * (`arc_focus`, which must first create an ArcFocusSession, and
 * `arc_book`, whose chapter id needs a book-id lookup) need a caller-
 * side async step BEFORE a route exists -- resolveLinkedActionStaticRoute
 * deliberately does not handle them; live/ActiveTaskScreen.tsx's own
 * performStart() resolves those two first, exactly mirroring how its
 * existing taskKind==="arcFocus" branch already creates a session
 * before navigating.
 */

export type TaskLinkedActionKind =
  | "none"
  | "arc_behaviour"
  | "arc_learning"
  | "arc_creativity"
  | "arc_focus"
  | "arc_video"
  | "arc_writing"
  | "arc_book"
  | "arc_diary"
  | "arc_questions_write"
  | "arc_questions_explore"
  | "write_insight"
  | "organize_insights"
  | "write_positive_event";

export interface TaskLinkedAction {
  kind: TaskLinkedActionKind;
  /** The specific topic/exercise/situation/text/chapter id within that module, when it has one -- null for "none" and for every kind with no specific item to pick (arc_creativity, arc_diary, arc_questions_write/explore, write_insight, organize_insights, write_positive_event), and for arc_focus (resolved to a fresh session id at start time, never stored here). */
  itemId: string | null;
}

export const NO_LINKED_ACTION: TaskLinkedAction = { kind: "none", itemId: null };

export function createTaskLinkedAction(kind: TaskLinkedActionKind, itemId: string | null = null): TaskLinkedAction {
  return { kind, itemId };
}

/** Kinds this module's own pure resolver answers directly -- every kind EXCEPT arc_focus/arc_book, which performStart resolves itself first (see module doc above). */
export interface LinkedActionRoute {
  pathname: string;
  params: Record<string, string>;
}

/**
 * The one central route table. `taskId` is always threaded through as
 * `returnToTaskId` for the kinds that support returning to Task LIVE
 * (every quick-capture-style destination); the ARC-session destinations
 * (arc_behaviour/arc_learning/arc_creativity) instead carry the task's
 * own real id as their existing round-trip mechanism already expects
 * (live/NewArcLiveScreen.tsx's returnToTask()), unchanged from how
 * every pre-existing taskKind branch already does it.
 */
export function resolveLinkedActionStaticRoute(action: TaskLinkedAction, taskId: string): LinkedActionRoute | null {
  switch (action.kind) {
    case "none":
      return null;
    case "arc_behaviour":
      return { pathname: "/tasks/[id]/arc", params: action.itemId ? { id: taskId, arcGymSituationId: action.itemId } : { id: taskId } };
    case "arc_learning":
      return { pathname: "/tasks/[id]/arc-learning-review", params: action.itemId ? { id: taskId, topicId: action.itemId } : { id: taskId } };
    case "arc_creativity":
      return { pathname: "/tasks/[id]/arc-creativity-review", params: { id: taskId } };
    case "arc_video":
    case "arc_writing":
      return action.itemId ? { pathname: "/arc-gym/writing/[id]", params: { id: action.itemId } } : null;
    case "arc_diary":
      return { pathname: "/diary/new", params: { returnToTaskId: taskId } };
    case "arc_questions_write":
      return { pathname: "/questions/new", params: { returnToTaskId: taskId } };
    case "arc_questions_explore":
      return { pathname: "/questions", params: { returnToTaskId: taskId } };
    case "write_insight":
      return { pathname: "/insights/new", params: { returnToTaskId: taskId } };
    case "organize_insights":
      return { pathname: "/insights", params: {} };
    case "write_positive_event":
      return { pathname: "/positive-memories/new", params: { returnToTaskId: taskId } };
    case "arc_focus":
    case "arc_book":
      // Resolved by the caller first -- see module doc above.
      return null;
  }
}

/** Whether this module (not the pre-existing taskKind/calendarEntryKind branches) is the active internal-action mechanism for a task. */
export function hasLinkedAction(action: TaskLinkedAction | null): action is TaskLinkedAction {
  return action !== null && action.kind !== "none";
}

/** Whether a kind needs its own specific item (topic/exercise/situation/text/chapter) picked, for the linking UI's 2-level chip picker. */
export function linkedActionKindNeedsItem(kind: TaskLinkedActionKind): boolean {
  return kind === "arc_behaviour" || kind === "arc_learning" || kind === "arc_focus" || kind === "arc_video" || kind === "arc_writing" || kind === "arc_book";
}
