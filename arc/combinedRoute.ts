/**
 * arc/combinedRoute.ts
 *
 * Adaptive ARC architecture task, Phase 12: pure combined-route
 * composition logic over the NEW InterferenceItem library -- a
 * separate, brand-new route model, never a replacement or modification
 * of the legacy "ARC State composition" system (arc/arcStateComposer.ts,
 * live/ComposedEncodingScreen.tsx), which stays completely untouched
 * and keeps driving legacy UrgeArc/ThoughtArc/BeliefArc records exactly
 * as before. The two systems coexist without sharing or rewriting
 * records.
 *
 * SHARED STAGES: Stay, Acceptance, Regulation, Success Focus, and
 * Gratitude belong to the surrounding ARC session pipeline, not to this
 * module at all -- CombinedRouteStepKind below has NO member for any of
 * them, by construction, so a combined route plan can never emit one,
 * let alone emit one more than once. This is enforced by the type
 * itself, not merely documented in a comment: see this file's own test
 * suite for a proof that no produced plan ever contains one of these
 * names. A future LIVE phase (Phase 13+) is responsible for running
 * each of those shared stages exactly once, around whichever combined
 * route this module produces -- this module only ever plans the
 * per-item Recognition-through-alternative-meaning slice plus the
 * reassessment/Presence/boundary steps that are genuinely new to the
 * combined route itself.
 *
 * Nothing here reads or writes storage, and nothing here is called by
 * any screen yet -- pure logic only, exactly like every prior phase's
 * own arc/ modules before their own BUILD/LIVE wiring phase.
 */

import type { InterferenceCategory, InterferenceItem } from "./interferenceItem.ts";
import { isLibraryItemEnabled } from "./libraryItemStatus.ts";
import { dedupeItemIdsPreservingOrder } from "./combinedInterferenceSelection.ts";
import { isPreventiveStoppingRelevantForInterferenceItem } from "./arcStateComposer.ts";

// ---------------------------------------------------------------------------
// Resolving a session's selected item ids against the real, current
// InterferenceItem records -- disabled/archived/missing handling.
// ---------------------------------------------------------------------------

export type InterferenceSelectionExclusionReason = "not_found" | "disabled" | "archived";

export interface InterferenceSelectionExclusion {
  id: string;
  reason: InterferenceSelectionExclusionReason;
}

export interface ResolvedInterferenceSelection {
  /** Enabled items only, in the caller's own selection order (deduplicated) -- the set a combined route may actually be built from. */
  active: InterferenceItem[];
  /**
   * Every id from the caller's own selection that could NOT be resolved
   * to an active item, with why -- returned explicitly so a future
   * BUILD/LIVE UI can explain it to the trainee. The STORED selection
   * (a CombinedInterferenceSelection's own configuredItemIds) is never
   * touched by this function -- it is read-only over whatever list the
   * caller passes in, and returns a description, never a rewrite.
   */
  excluded: InterferenceSelectionExclusion[];
}

/**
 * Resolves `selectedItemIds` (a session's own chosen subset -- see this
 * module's own header doc distinguishing configured/selected/practiced)
 * against `allKnownItems` (e.g. the full result of loadInterferenceItems()).
 * Deduplicates first (dedupeItemIdsPreservingOrder), then classifies each
 * remaining id as active (enabled) or excluded (not found / disabled /
 * archived). Never mutates either input array or any item object.
 */
export function resolveInterferenceSelectionForSession(selectedItemIds: string[], allKnownItems: InterferenceItem[]): ResolvedInterferenceSelection {
  const deduped = dedupeItemIdsPreservingOrder(selectedItemIds);
  const active: InterferenceItem[] = [];
  const excluded: InterferenceSelectionExclusion[] = [];
  for (const id of deduped) {
    const item = allKnownItems.find((candidate) => candidate.id === id);
    if (!item) {
      excluded.push({ id, reason: "not_found" });
      continue;
    }
    if (isLibraryItemEnabled(item)) {
      active.push(item);
      continue;
    }
    excluded.push({ id, reason: item.status === "archived" ? "archived" : "disabled" });
  }
  return { active, excluded };
}

// ---------------------------------------------------------------------------
// Canonical category rank -- derived from "Current thought -> underlying
// belief -> emotion or urge support". Applied uniformly regardless of
// which subset is selected; never a special case per combination.
// ---------------------------------------------------------------------------

export const INTERFERENCE_CATEGORY_ORDER: InterferenceCategory[] = ["thought", "belief", "emotion", "urge"];

// ---------------------------------------------------------------------------
// Route steps -- a typed sequence, not indivisible category blocks. Each
// step names exactly one functional moment; item-specific steps carry
// the item's own id, session-level steps (reassessment/Presence/the
// closing boundary) carry null.
// ---------------------------------------------------------------------------

export type CombinedRouteStepKind =
  | "thought_recognition"
  | "belief_recognition"
  | "emotion_support"
  | "urge_preventive_stopping"
  | "urge_support"
  | "belief_alternative"
  | "thought_alternative"
  | "thought_future_insight"
  | "cognitive_reassessment"
  | "presence_embedded"
  | "presence_full"
  | "beneficial_action_boundary";

export interface CombinedRouteStep {
  kind: CombinedRouteStepKind;
  /** The InterferenceItem this step operates on -- null for session-level steps (cognitive_reassessment, presence_embedded, presence_full, beneficial_action_boundary), which belong to the whole combined session rather than any one item. */
  itemId: string | null;
}

/** Every ArcStage/legacy-composer name this module must never emit -- see this file's own "shared stages" header doc. Exported for tests; never referenced by CombinedRouteStepKind's own values, which is what actually enforces this. */
export const SHARED_SESSION_STAGE_NAMES = ["stay", "acceptance", "regulate", "regulation", "success_focus", "gratitude"] as const;

// ---------------------------------------------------------------------------
// Presence routing
// ---------------------------------------------------------------------------

export type PresenceRouteDecision = "not_applicable" | "skip" | "embedded" | "full_optional" | "full_required";

export interface PresenceRouteInput {
  /** True when Thought and/or Belief was among the resolved, active items this session -- the trigger for the cognitive stuck/not-stuck reassessment. */
  cognitiveWorkSelected: boolean;
  /** True when Emotion and/or Urge was selected WITHOUT Thought or Belief -- decision: run support, then go straight to full Presence, with no reassessment. */
  emotionOrUrgeOnlySelected: boolean;
  presenceEnabled: boolean;
  /** null when the reassessment question hasn't been answered yet (or doesn't apply) -- treated as "not stuck" for routing purposes, never guessed as "still stuck". */
  reassessmentAnswer: "not_stuck" | "still_stuck" | null;
}

/**
 * The single source of truth for whether/how Presence appears in a
 * combined session. Rules (confirmed product decisions):
 *   - No cognitive work, no Emotion/Urge-only Presence trigger -> not_applicable.
 *   - Cognitive work practiced, Presence not configured, not stuck -> skip.
 *   - Cognitive work practiced, Presence not configured, still stuck -> embedded.
 *   - Cognitive work practiced, Presence configured, not stuck -> full_optional.
 *   - Cognitive work practiced, Presence configured, still stuck -> full_required.
 *   - Emotion/Urge only (no cognitive work), Presence configured -> full_required, no reassessment.
 * Embedded and full are always mutually exclusive outcomes of this same
 * function -- never both, by construction (a single return value).
 */
export function resolvePresenceRoute(input: PresenceRouteInput): PresenceRouteDecision {
  if (input.cognitiveWorkSelected) {
    const stillStuck = input.reassessmentAnswer === "still_stuck";
    if (!input.presenceEnabled) {
      return stillStuck ? "embedded" : "skip";
    }
    return stillStuck ? "full_required" : "full_optional";
  }
  if (input.emotionOrUrgeOnlySelected && input.presenceEnabled) {
    return "full_required";
  }
  return "not_applicable";
}

export type FinalPresenceMode = "skipped" | "embedded" | "full";

/**
 * Maps a PresenceRouteDecision (plus, only for full_optional, the
 * trainee's own eventual accept/decline) to the ONE fact that will
 * later be recorded -- "full_optional was offered but declined" must
 * resolve to "skipped", never "full", since nothing was actually
 * practiced (see this module's own CombinedRouteSessionFacts doc: only
 * what was actually completed ever counts).
 */
export function resolveFinalPresenceMode(decision: PresenceRouteDecision, fullPresenceAccepted: boolean | null): FinalPresenceMode {
  switch (decision) {
    case "not_applicable":
    case "skip":
      return "skipped";
    case "embedded":
      return "embedded";
    case "full_required":
      return "full";
    case "full_optional":
      return fullPresenceAccepted === true ? "full" : "skipped";
  }
}

// ---------------------------------------------------------------------------
// The combined route plan itself
// ---------------------------------------------------------------------------

export interface CombinedRoutePlanInput {
  /** Already-resolved, enabled items for this session (resolveInterferenceSelectionForSession's own `active` output) -- never raw ids, so this function never has to re-decide disabled/archived/missing handling itself. */
  selectedItems: InterferenceItem[];
  presenceEnabled: boolean;
  reassessmentAnswer: "not_stuck" | "still_stuck" | null;
  /** Only consulted when the resolved PresenceRouteDecision is "full_optional"; ignored otherwise. */
  fullPresenceAccepted: boolean | null;
}

export type CombinedRoutePlanResult =
  /** No active (resolved, enabled) items at all -- never fabricated into a route. A Presence-only request reaches this same result; the caller is responsible for then delegating to the existing standalone ARC Presence protocol, per decision: "Presence-only keeps its independent full protocol." */
  | { kind: "no_active_items" }
  | { kind: "plan"; steps: CombinedRouteStep[]; presenceDecision: PresenceRouteDecision; finalPresenceMode: FinalPresenceMode };

/**
 * Builds the ordered step sequence for one combined session, per the
 * canonical functional order (confirmed product decision, not merely
 * category blocks):
 *   1. Recognize each selected Thought, in configured order.
 *   2. Recognize each selected Belief, in configured order.
 *   3. Emotion support, per selected Emotion item.
 *   4. Urge support, per selected Urge item -- preventive stopping first
 *      when relevant (isPreventiveStoppingRelevantForInterferenceItem,
 *      Phase 4, reused unmodified).
 *   5. Belief work / alternative-supportive Belief, per selected Belief.
 *   6. Replacement Thought / alternative interpretation, per selected Thought.
 *   7. Thought's own future-insight step -- ONLY when Thought is selected
 *      WITHOUT Belief, matching the two literal worked examples this
 *      phase was approved against ("Thought only" includes it; "Thought
 *      + Belief" does not). Flagged here as a literal-fidelity choice.
 *   8. cognitive_reassessment -- once, only when Thought and/or Belief
 *      was selected (never per item, never for an Emotion/Urge-only route).
 *   9. Presence (embedded or full), resolved via resolvePresenceRoute/
 *      resolveFinalPresenceMode above -- 0 or 1 step, never both.
 *   10. beneficial_action_boundary -- always the final step, marking
 *       where this plan ends and the surrounding shared pipeline's own
 *       beneficial action (and, later, ARC Goal's identity continuation)
 *       takes over. Never itself a real screen -- a boundary marker only.
 *
 * Never emits Stay/Acceptance/Regulation/Success Focus/Gratitude -- see
 * this module's own header doc. Never mutates `input.selectedItems`.
 */
export function buildCombinedRoutePlan(input: CombinedRoutePlanInput): CombinedRoutePlanResult {
  if (input.selectedItems.length === 0) {
    return { kind: "no_active_items" };
  }

  const byCategory = (category: InterferenceCategory) => input.selectedItems.filter((item) => item.category === category);
  const thoughts = byCategory("thought");
  const beliefs = byCategory("belief");
  const emotions = byCategory("emotion");
  const urges = byCategory("urge");

  const hasThought = thoughts.length > 0;
  const hasBelief = beliefs.length > 0;
  const cognitiveWorkSelected = hasThought || hasBelief;
  const emotionOrUrgeOnlySelected = !cognitiveWorkSelected && (emotions.length > 0 || urges.length > 0);

  const steps: CombinedRouteStep[] = [];

  for (const item of thoughts) steps.push({ kind: "thought_recognition", itemId: item.id });
  for (const item of beliefs) steps.push({ kind: "belief_recognition", itemId: item.id });
  for (const item of emotions) steps.push({ kind: "emotion_support", itemId: item.id });
  for (const item of urges) {
    if (isPreventiveStoppingRelevantForInterferenceItem(item)) {
      steps.push({ kind: "urge_preventive_stopping", itemId: item.id });
    }
    steps.push({ kind: "urge_support", itemId: item.id });
  }
  for (const item of beliefs) steps.push({ kind: "belief_alternative", itemId: item.id });
  for (const item of thoughts) steps.push({ kind: "thought_alternative", itemId: item.id });
  if (hasThought && !hasBelief) {
    for (const item of thoughts) steps.push({ kind: "thought_future_insight", itemId: item.id });
  }
  if (cognitiveWorkSelected) {
    steps.push({ kind: "cognitive_reassessment", itemId: null });
  }

  const presenceDecision = resolvePresenceRoute({
    cognitiveWorkSelected,
    emotionOrUrgeOnlySelected,
    presenceEnabled: input.presenceEnabled,
    reassessmentAnswer: input.reassessmentAnswer,
  });
  const finalPresenceMode = resolveFinalPresenceMode(presenceDecision, input.fullPresenceAccepted);

  if (finalPresenceMode === "embedded") steps.push({ kind: "presence_embedded", itemId: null });
  if (finalPresenceMode === "full") steps.push({ kind: "presence_full", itemId: null });

  steps.push({ kind: "beneficial_action_boundary", itemId: null });

  return { kind: "plan", steps, presenceDecision, finalPresenceMode };
}

// ---------------------------------------------------------------------------
// Session facts -- pure in-memory shape only (never persisted this
// phase). Distinguishes configured/selected/practiced explicitly, per
// product decision: "Do not use one field as all three concepts."
// ---------------------------------------------------------------------------

export interface CombinedRouteSessionFacts {
  /** Snapshot of the State's reusable configured set at session start (CombinedInterferenceSelection.configuredItemIds at that moment) -- never rewritten mid-session. */
  configuredItemIds: string[];
  /** The subset the trainee actually chose to work with THIS session, from the configured set. */
  selectedItemIds: string[];
  /** The subset of selectedItemIds whose relevant LIVE section actually completed -- only these ever count toward progression (a later phase's own concern; Phase 12 only prepares the fact). */
  practicedItemIds: string[];
  /** Deduplicated -- at most one entry per category, however many items of that category were practiced (see deriveCompletedInterferenceTypes below). */
  completedTypes: InterferenceCategory[];
  presenceMode: FinalPresenceMode;
  reassessmentAnswer: "not_stuck" | "still_stuck" | null;
}

export function createEmptyCombinedRouteSessionFacts(configuredItemIds: string[]): CombinedRouteSessionFacts {
  return {
    configuredItemIds: dedupeItemIdsPreservingOrder(configuredItemIds),
    selectedItemIds: [],
    practicedItemIds: [],
    completedTypes: [],
    presenceMode: "skipped",
    reassessmentAnswer: null,
  };
}

/** Deduplicates practiced items down to their categories, first-occurrence-wins -- "two Thought items may both be selected, but the future session still records the Thought type at most once." */
export function deriveCompletedInterferenceTypes(practicedItems: InterferenceItem[]): InterferenceCategory[] {
  const seen = new Set<InterferenceCategory>();
  const result: InterferenceCategory[] = [];
  for (const item of practicedItems) {
    if (seen.has(item.category)) continue;
    seen.add(item.category);
    result.push(item.category);
  }
  return result;
}
