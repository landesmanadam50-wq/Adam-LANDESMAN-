/**
 * data/sessionLog.ts
 *
 * What a completed (or abandoned) LIVE session leaves behind for the
 * stats dashboard. `success` and `fall` are independent signals from
 * the same session, not mutually exclusive: a trainee can complete the
 * beneficial action AND still use the interfering-action window later
 * in the same session.
 *
 * Evidence-encoding task: this SAME record now optionally carries a
 * concrete memory detail alongside its Gratitude, and a lightweight
 * context snapshot -- both purely additive (optional, defaulting to
 * absent) so every existing stored entry stays valid with no migration
 * step. arc/evidence.ts is the only reader of these two new fields; it
 * derives a personal evidence index directly from this ONE existing
 * history store rather than a second, parallel one -- see that file's
 * module doc.
 */

import type { DevelopmentLayer } from "../arc/types.ts";

/**
 * A lightweight snapshot of what THIS session actually targeted and did
 * -- captured once, at completion, purely so a LATER session's Encoding
 * can judge whether this record is relevant to what it's targeting NOW
 * (arc/evidence.ts's selectEncodingEvidence). Every field mirrors data
 * that already exists on ArcBuildProfile/ArcLiveState at the moment of
 * capture; nothing here is invented or inferred beyond what those
 * already hold.
 */
export interface SessionEvidenceContext {
  /** Which layer (state/identity/habit) this session's encode/act targeted -- see arc/arcEngine.ts's resolveEncodingTarget. */
  targetLayer: DevelopmentLayer | null;
  /** The resolved layer's own "identity-ish" label: supportiveState (state), desiredIdentity (identity), or beneficialAction (habit). */
  identityLabel: string | null;
  goal: string | null;
  habit: string | null;
  /** The actual action performed this session (the planned/mapped action, or a session-specific alternative) -- see ArcLiveState.selectedAction / arc/arcEngine.ts's EncodingResolution.actionLabel. */
  currentAction: string | null;
  interferingState: string | null;
  challengeContext: string | null;
  /**
   * Reactive-flow-strengthening task (#7, #8): the session-specific
   * trigger the trainee typed on the "trigger_context" stage --
   * ArcLiveState.triggerContext, carried forward for future review
   * (recurring-trigger patterns, later relevance/context) -- never the
   * BUILD-configured Challenge Context (challengeContext above), and
   * never analyzed or acted on by this task. null for a proactive
   * session (that stage is never reached) or when the trainee left it
   * blank.
   */
  triggerContext: string | null;
  /**
   * Unknown-trigger refinement: the structured signal mirroring
   * ArcLiveState.triggerKnown at session completion -- true when a
   * specific trigger was named, false when the trainee's answer was
   * recognized as "I don't know" (or equivalent) or left blank, null
   * when trigger_context was never reached (a proactive session) or
   * this entry predates this field. triggerContext above still
   * preserves the trainee's own raw text either way -- this is only
   * the derived, structured reading of it, never a replacement.
   */
  triggerKnown: boolean | null;
}

export interface SessionLogEntry {
  id: string;
  startedAt: string; // ISO 8601
  finishedAt: string; // ISO 8601
  /** Reached BeneficialAction in the LIVE flow. */
  success: boolean;
  /** Used the InterferingAction window in the LIVE flow. */
  fall: boolean;
  /** Optional written Gratitude entry from Reinforcement's completion screen -- null/omitted when the trainee left it blank. */
  gratitude?: string | null;
  /**
   * Evidence-encoding task: ONE concrete, user-supplied memory detail
   * from the SAME protocol experience as `gratitude` above -- collected
   * right after it, on the SAME completion screen (live/screens.tsx's
   * CompleteScreen), and always saved together in the one
   * updateLastSessionLogEntryGratitude() call (see data/storage.ts).
   * Never fabricated or inferred: absent/null whenever the trainee left
   * it blank, and always absent on any entry logged before this field
   * existed -- both cases arc/evidence.ts treats identically (no detail
   * to surface, never invented).
   */
  gratitudeMemoryDetail?: string | null;
  /**
   * Evidence-encoding task: this session's own resolved context,
   * captured once at completion -- see SessionEvidenceContext above.
   * Optional/absent on any entry logged before this field existed;
   * arc/evidence.ts's buildEvidenceIndex treats a missing context
   * exactly like the field's own individual nulls (no relevance
   * metadata to match on for that record, never invented).
   */
  context?: SessionEvidenceContext | null;
}
