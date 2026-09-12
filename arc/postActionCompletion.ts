/**
 * arc/postActionCompletion.ts
 *
 * Phase 8, the saved global post-action-completion requirement: "Every
 * real ARC protocol that includes an actually performed action must
 * end with at least: Actual action -> timed imagery of the action as
 * it was actually performed -> Gratitude." Full protocols preserve the
 * wider sequence: Action -> Success Focus -> imagery of the action as
 * performed -> optional written improvement -> imagery of the improved
 * action -> Gratitude. ARC Mini protocols get the compact version:
 * Action -> short timed imagery of the action as performed -> short
 * Gratitude.
 *
 * ONE shared module, never duplicated per protocol (the requirement's
 * own "avoid separate duplicated completion logic for every protocol"
 * / "reuse one shared post-action completion component/engine where
 * possible"). arc/beliefLive.ts (Phase 6) already built this exact
 * shape inline, predating this module -- it is left as-is (already
 * correct, already tested) rather than risk-refactored; every OTHER
 * protocol this phase retrofits (Urge, Thought, Presence -- Full and
 * Mini each) calls this ONE module instead of hand-rolling its own
 * copy, satisfying "avoid duplicated logic" without touching working
 * code.
 *
 * ARC State (the regular ArcBuild engine, identity/habit targets
 * included) and ARC Goal's own identity-based action already have
 * their OWN pre-existing, explicitly protected post-action sequence
 * (arc/arcEngine.ts's "act" -> "success_focus" -> "gratitude_and_learning"
 * -> "completed_action_imagery" -> "improved_action_imagery" ->
 * "complete", rendered by live/screens.tsx's own
 * SuccessFocusRetrospectiveScreen/GratitudeAndLearningScreen/
 * CompletedActionImageryScreen/ImprovedActionImageryScreen). It already
 * satisfies this requirement's substance (a real action, imagery of it
 * as performed, optional written improvement, improved imagery, and
 * Gratitude) -- its own internal ordering (Gratitude+improvement before
 * the two imagery stages, rather than after) predates this module and
 * is explicitly protected everywhere ("Preserve existing... Success
 * Focus, Gratitude and imagery"), so Phase 8 does NOT reorder or touch
 * it. This module is for the OTHER protocols that had no such tail at
 * all.
 *
 * Never applies to a Link/ARCHI Link/Mini Link rehearsal at any tier --
 * a rehearsal never performs the real action, so it never earns this
 * tail (see each retrofit's own module doc for how it stays out of
 * Link rehearsal entirely: it is only ever reachable from a LIVE
 * screen's real "act"/"action" stage, never from arc/miniArcLink.ts's
 * own rehearsal step builders).
 */

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export const POST_ACTION_IMPROVED_IMAGERY_FALLBACK = "דמיין את עצמך מבצע שוב את הפעולה, תוך שמירה על מה שעבד היטב.";
export const POST_ACTION_GRATITUDE_DEFAULT_QUESTION = "על מה אתה מודה לעצמך בעקבות הפעולה?";
export const MINI_POST_ACTION_GRATITUDE_DEFAULT_QUESTION = "על מה אתה מודה לעצמך בעקבות הפעולה?";

// ---------------------------------------------------------------------------
// Full protocol tail: action_imagery -> improvement_entry ->
// improved_action_imagery -> gratitude -> complete. A caller's own
// "action"/"act" stage precedes this tail and is never part of it --
// each retrofit's own getFirst*LiveStage-equivalent for its post-action
// tail starts at "action_imagery", reached only once the real action
// is actually done.
// ---------------------------------------------------------------------------

export type PostActionCompletionStage = "action_imagery" | "improvement_entry" | "improved_action_imagery" | "gratitude" | "complete";

export const POST_ACTION_COMPLETION_STAGE_ORDER: PostActionCompletionStage[] = ["action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"];

export function getFirstPostActionCompletionStage(): PostActionCompletionStage {
  return "action_imagery";
}

export interface PostActionCompletionState {
  improvementText: string | null;
  gratitudeText: string | null;
}

export function createEmptyPostActionCompletionState(): PostActionCompletionState {
  return { improvementText: null, gratitudeText: null };
}

export interface PostActionCompletionStageResult {
  stage: PostActionCompletionStage;
  state: PostActionCompletionState;
}

/** Pure, total, never throws, never gates progression -- every stage here is optional/free-text, matching every other independent protocol's own "never require" convention. */
export function getNextPostActionCompletionStage(current: PostActionCompletionStage, state: PostActionCompletionState): PostActionCompletionStageResult {
  switch (current) {
    case "action_imagery":
      return { stage: "improvement_entry", state };
    case "improvement_entry":
      return { stage: "improved_action_imagery", state };
    case "improved_action_imagery":
      return { stage: "gratitude", state };
    case "gratitude":
      return { stage: "complete", state };
    case "complete":
      return { stage: "complete", state };
  }
}

export interface PostActionCompletionCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  buttonLabel: string;
}

/** Pure copy generator -- generic wording, never protocol-specific (no "urge"/"thought"/"belief" mention), so the exact same function serves every retrofit. `gratitudePrompt` is the caller's own optional saved override; null uses the standard default question. */
export function getPostActionCompletionCopy(stage: PostActionCompletionStage, state: PostActionCompletionState, gratitudePrompt: string | null = null): PostActionCompletionCopy {
  switch (stage) {
    case "action_imagery":
      return {
        title: "דמיון הפעולה שנעשתה",
        body: "דמיין את עצמך מבצע את הפעולה כפי שבאמת קרתה עכשיו, כולל מה שעבד היטב.",
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "improvement_entry":
      return {
        title: "שיפור אפשרי (רשות)",
        body: "מה אפשר לשפר בפעם הבאה? (רשות -- אפשר גם לדלג)",
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "improved_action_imagery": {
      const improvement = safeText(state.improvementText);
      return {
        title: "דמיון הפעולה המשופרת",
        body: improvement.length > 0 ? `דמיין את עצמך מבצע את הפעולה תוך שילוב השיפור: ${improvement}` : POST_ACTION_IMPROVED_IMAGERY_FALLBACK,
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    }
    case "gratitude":
      return {
        title: "הוקרת תודה",
        body: safeText(gratitudePrompt) || POST_ACTION_GRATITUDE_DEFAULT_QUESTION,
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "complete":
      return { title: "סיום", body: "", secondaryBody: null, buttonLabel: "סיום" };
  }
}

// ---------------------------------------------------------------------------
// Mini protocol tail: action_imagery -> gratitude -> complete. Compact
// by design -- never Success Focus, never written improvement, never
// improved-action imagery (the saved requirement's own "Mini ARC must
// still remain lightweight").
// ---------------------------------------------------------------------------

export type MiniPostActionCompletionStage = "action_imagery" | "gratitude" | "complete";

export const MINI_POST_ACTION_COMPLETION_STAGE_ORDER: MiniPostActionCompletionStage[] = ["action_imagery", "gratitude", "complete"];

export function getFirstMiniPostActionCompletionStage(): MiniPostActionCompletionStage {
  return "action_imagery";
}

export function getNextMiniPostActionCompletionStage(current: MiniPostActionCompletionStage): MiniPostActionCompletionStage {
  switch (current) {
    case "action_imagery":
      return "gratitude";
    case "gratitude":
      return "complete";
    case "complete":
      return "complete";
  }
}

export function getMiniPostActionCompletionCopy(stage: MiniPostActionCompletionStage, gratitudePrompt: string | null = null): PostActionCompletionCopy {
  switch (stage) {
    case "action_imagery":
      return {
        title: "דמיון הפעולה שנעשתה",
        body: "דמיין בקצרה את עצמך מבצע את הפעולה כפי שבאמת קרתה עכשיו.",
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "gratitude":
      return {
        title: "הוקרת תודה",
        body: safeText(gratitudePrompt) || MINI_POST_ACTION_GRATITUDE_DEFAULT_QUESTION,
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "complete":
      return { title: "סיום", body: "", secondaryBody: null, buttonLabel: "סיום" };
  }
}
