/**
 * data/purposeManifest.ts
 *
 * Manifest Upgrade task: the thin storage I/O layer over
 * arc/purposeManifest.ts's pure model, plus the real decisions this
 * layer owns -- resolving which manifest/behavior a given moment
 * should show.
 *
 * Startup-popup task: there are now TWO distinct resolution entry
 * points, never one shared ambiguously between them:
 *  - resolveStartupManifestSelection: called once per real app launch
 *    by live/DailyStartupSequenceOverlay.tsx. ALWAYS re-rolls a fresh
 *    random eligible manifest and advances its rotation -- "randomly
 *    select one each time the startup sequence begins" is explicit,
 *    never "once per day" anymore.
 *  - resolveTodaysManifestSelection: called by the manual "reopen
 *    today's visualization" screen (live/ManifestTodayScreen.tsx),
 *    UNCHANGED -- it still shows whatever was most recently resolved
 *    today (normally this launch's own startup pick) rather than
 *    re-rolling again on every manual reopen, so repeatedly opening
 *    that screen in the same session shows something stable.
 * Both persist to the SAME single selection slot and the SAME
 * cross-launch rotation state -- there is only ever one "current"
 * selection and one rotation history, read two different ways.
 */

import {
  createDailyManifestSelection,
  isDailySelectionCurrent,
  recordBehaviorShownForManifest,
  resolveEligibleManifests,
  resolveNextBehaviorIndexForManifest,
  selectRandomManifestId,
  type DailyManifestSelection,
  type FutureBehavior,
  type PurposeManifest,
  type PurposeManifestRotationState,
} from "../arc/purposeManifest.ts";
import { loadDailyManifestSelection, loadPurposeManifestRotation, loadPurposeManifests, saveDailyManifestSelection, savePurposeManifestRotation } from "./storage.ts";
import { resolveManifestNextAction } from "./manifestGoals.ts";
import type { ManifestNextAction } from "../arc/manifestGoals.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export interface ResolvedDailyManifest {
  selection: DailyManifestSelection;
  manifest: PurposeManifest;
  behavior: FutureBehavior;
  /**
   * Manifest Goals & Automatic Task Scheduling task, Popup 2 Step 6:
   * this SAME selected manifest's own next actionable task (see
   * arc/manifestGoals.ts's resolveNextManifestAction) -- resolved
   * together with the rest of this selection so it can never drift to a
   * different manifest than the one actually being shown. null means
   * this manifest currently has no incomplete, non-archived linked task
   * at all (the card then offers to create one), never an invented
   * placeholder.
   */
  nextAction: ManifestNextAction | null;
}

/** Shared by both resolution entry points below: picks ONE eligible manifest uniformly at random, advances (and persists) ITS OWN rotation to the next behavior, and persists the resulting selection to the single shared slot. Never reused/cached by the caller -- each call is a fresh roll. */
async function pickFreshManifestSelection(eligible: PurposeManifest[], rotation: PurposeManifestRotationState, todayDateLocal: string, now: Date): Promise<ResolvedDailyManifest> {
  const manifestId = selectRandomManifestId(eligible.map((m) => m.id), Math.random())!;
  const manifest = eligible.find((candidate) => candidate.id === manifestId)!;
  const behaviorIndex = resolveNextBehaviorIndexForManifest(rotation, manifest.id);
  const nextRotation = recordBehaviorShownForManifest(rotation, manifest.id, behaviorIndex);
  const selection = createDailyManifestSelection(manifest.id, behaviorIndex, todayDateLocal);

  const [, , nextAction] = await Promise.all([savePurposeManifestRotation(nextRotation), saveDailyManifestSelection(selection), resolveManifestNextAction(manifest.id, now)]);

  return { selection, manifest, behavior: manifest.behaviors[behaviorIndex], nextAction };
}

/**
 * Startup-popup task: the ONE entry point live/DailyStartupSequenceOverlay.tsx
 * uses -- called once per real app launch, NEVER gated by "already
 * shown today". Returns null when there is no ELIGIBLE (complete)
 * manifest at all ("do not display an empty Manifest popup" -- the
 * overlay shows only the psychology fact in that case). Always a
 * fresh random pick; the per-manifest behavior rotation itself is
 * never reset by this (or by the app closing) -- only ever advanced.
 */
export async function resolveStartupManifestSelection(now: Date): Promise<ResolvedDailyManifest | null> {
  const todayDateLocal = todayLocalDateString(now);
  const [manifests, rotation] = await Promise.all([loadPurposeManifests(), loadPurposeManifestRotation()]);
  const eligible = resolveEligibleManifests(manifests);
  if (eligible.length === 0) return null;
  return pickFreshManifestSelection(eligible, rotation, todayDateLocal, now);
}

/**
 * The entry point live/ManifestTodayScreen.tsx (the manual "reopen
 * today's visualization" route) uses. Returns null when there is no
 * ELIGIBLE (complete) manifest at all.
 *
 * Reuses an already-current selection for today untouched (so
 * reopening this screen repeatedly in the same session shows something
 * stable -- normally whatever resolveStartupManifestSelection most
 * recently picked this launch) UNLESS that selection's own manifest is
 * no longer eligible (deleted, or edited into incompleteness since) --
 * a genuinely rare edge case, handled by simply recomputing a fresh
 * pick rather than ever showing stale/broken content.
 */
export async function resolveTodaysManifestSelection(now: Date): Promise<ResolvedDailyManifest | null> {
  const todayDateLocal = todayLocalDateString(now);
  const [manifests, existingSelection, rotation] = await Promise.all([loadPurposeManifests(), loadDailyManifestSelection(), loadPurposeManifestRotation()]);
  const eligible = resolveEligibleManifests(manifests);
  if (eligible.length === 0) return null;

  if (isDailySelectionCurrent(existingSelection, todayDateLocal)) {
    const manifest = eligible.find((candidate) => candidate.id === existingSelection!.manifestId);
    if (manifest) {
      const nextAction = await resolveManifestNextAction(manifest.id, now);
      return { selection: existingSelection!, manifest, behavior: manifest.behaviors[existingSelection!.behaviorIndex], nextAction };
    }
    // Falls through to a fresh pick -- the selected manifest is gone or no longer eligible.
  }

  return pickFreshManifestSelection(eligible, rotation, todayDateLocal, now);
}
