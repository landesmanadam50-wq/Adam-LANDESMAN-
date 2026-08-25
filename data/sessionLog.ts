/**
 * data/sessionLog.ts
 *
 * What a completed (or abandoned) LIVE session leaves behind for the
 * stats dashboard. `success` and `fall` are independent signals from
 * the same session, not mutually exclusive: a trainee can complete the
 * beneficial action AND still use the interfering-action window later
 * in the same session.
 */

export interface SessionLogEntry {
  id: string;
  startedAt: string; // ISO 8601
  finishedAt: string; // ISO 8601
  /** Reached BeneficialAction in the LIVE flow. */
  success: boolean;
  /** Used the InterferingAction window in the LIVE flow. */
  fall: boolean;
}
