/**
 * arc/purposeManifest.ts
 *
 * Manifest Upgrade task: a brand-new, independent entity connecting a
 * trainee's long-term purpose to daily action -- Long-Term Goal ->
 * Personal Reason -> Core Value -> three Future Behaviors (each with
 * its own reason) -> (optionally) today's small action.
 *
 * Deliberately named "PurposeManifest", never just "Manifest", to stay
 * unmistakably distinct from TWO pre-existing, unrelated entities this
 * module never touches, extends, or migrates:
 *  - arc/tasks.ts's ManifestProfile -- a single Task's own 4-field
 *    setup for its guided visualize->ARC->identity-action run
 *    (live/ManifestTaskLiveScreen.tsx). One profile belongs to one
 *    Task; a PurposeManifest belongs to nothing and is never a Task.
 *  - arc/lifeManifest.ts's LifeManifest -- the much larger Major
 *    Goal/Sub-goal/Target hierarchy ("מניפסט החיים שלי").
 * Both keep their own storage keys, screens, and routes, completely
 * unmodified by this feature.
 *
 * No AsyncStorage, no navigation, no React -- same split as every
 * other arc/*.ts module. The "pick the next behavior" rotation reuses
 * arc/contentRotation.ts's existing resolveNextRotationIndex verbatim
 * (never a second rotation implementation); only the RANDOM
 * cross-manifest daily pick is new (see selectRandomManifestId below),
 * since contentRotation.ts is deliberately sequential, not random.
 */

import { resolveNextRotationIndex } from "./contentRotation.ts";

export interface FutureBehavior {
  id: string;
  /** "תאר התנהגות של האדם שאתה רוצה להיות בעתיד." Free text. */
  description: string;
  /** "למה חשוב לך להתנהג כך?" Free text, saved together with its own behavior -- never a single shared reason for all three. */
  reason: string;
}

export interface PurposeManifest {
  id: string;
  /** "מה המטרה שלך לטווח הארוך?" */
  longTermGoal: string;
  /** "למה חשוב לך להשיג את המטרה הזאת?" */
  personalReason: string;
  /** "איזה ערך חשוב בחיים שלך המטרה הזאת מבטאת?" */
  personalValue: string;
  /**
   * Task LIVE Purpose Card task: "איזה אדם אתה רוצה להיות באמצעות המטרה
   * הזאת?" -- a single, free-text identity statement for this manifest,
   * optional like futureMantra/focusPointColor/futureBodyMovement below
   * (never required by isPurposeManifestComplete, same "skip this step
   * gracefully" treatment). Deliberately NOT the per-behavior "person you
   * want to be" description already on each FutureBehavior above -- this
   * is the manifest's own single overall identity line, shown as the
   * goal-level default identity on Task LIVE's purpose card (see
   * arc/taskPurposeContext.ts) for any task linked to this manifest that
   * hasn't set its own task-level Task.identity override.
   */
  personalIdentity: string;
  /** Always exactly three -- never fewer, never more; the spec's own fixed structure. */
  behaviors: [FutureBehavior, FutureBehavior, FutureBehavior];
  /**
   * Final Manifest & Startup Popup Updates task: a future-oriented mantra,
   * ALWAYS starting with FUTURE_MANTRA_PREFIX ("אני אצליח") -- composed via
   * composeFutureMantra/extractMantraSuffix below, never written directly.
   * "" means not set yet (a legacy manifest, or simply skipped) -- the
   * visualization popup skips its own mantra step in that case, never
   * showing empty/broken content.
   */
  futureMantra: string;
  /**
   * The id of one of FOCUS_POINT_COLORS below (never a raw hex/free
   * text), independently chosen per manifest. "" means not set yet --
   * same "skip this step gracefully" treatment as futureMantra.
   */
  focusPointColor: string;
  /** "איזו תנועת גוף מייצגת עבורך את האדם שכבר השיג את המטרה?" Free text. "" means not set yet -- same graceful skip. */
  futureBodyMovement: string;
  /**
   * ARC Gym + ARC Goal Integration task: non-null when this Manifest is
   * the one, dedicated PurposeManifest owned by a specific ArcGymGoal
   * (arc/arcGymGoal.ts) -- created together with that goal, never
   * shared with another goal. A goal-owned manifest is excluded from
   * the existing random daily-popup pool (resolveEligibleManifests
   * below): it's intentionally viewed from inside its own Goal screen,
   * never surfaced as a random daily popup. null for every
   * pre-existing/ordinary manifest, which keeps participating in that
   * pool exactly as before.
   */
  ownerArcGymGoalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function generatePurposeManifestId(): string {
  return `purpose-manifest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateFutureBehaviorId(): string {
  return `future-behavior-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyFutureBehavior(id: string): FutureBehavior {
  return { id, description: "", reason: "" };
}

export function createEmptyPurposeManifest(id: string, now: string): PurposeManifest {
  return {
    id,
    longTermGoal: "",
    personalReason: "",
    personalValue: "",
    personalIdentity: "",
    behaviors: [
      createEmptyFutureBehavior(generateFutureBehaviorId()),
      createEmptyFutureBehavior(generateFutureBehaviorId()),
      createEmptyFutureBehavior(generateFutureBehaviorId()),
    ],
    futureMantra: "",
    focusPointColor: "",
    futureBodyMovement: "",
    ownerArcGymGoalId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Final Manifest & Startup Popup Updates task: backward compatibility for
 * a manifest saved by an earlier app version, BEFORE futureMantra/
 * focusPointColor/futureBodyMovement existed. Runtime-checks each new
 * field independently (never trusts the TS type alone, since a record
 * loaded from AsyncStorage/JSON.parse can genuinely be missing them) and
 * fills in "" for anything absent -- never a destructive migration, never
 * a crash, every other field (including the original four questions and
 * all three behaviors) passed through completely untouched.
 */
export function normalizePurposeManifest(raw: PurposeManifest): PurposeManifest {
  return {
    ...raw,
    personalIdentity: typeof raw.personalIdentity === "string" ? raw.personalIdentity : "",
    futureMantra: typeof raw.futureMantra === "string" ? raw.futureMantra : "",
    focusPointColor: typeof raw.focusPointColor === "string" ? raw.focusPointColor : "",
    futureBodyMovement: typeof raw.futureBodyMovement === "string" ? raw.futureBodyMovement : "",
    ownerArcGymGoalId: typeof raw.ownerArcGymGoalId === "string" ? raw.ownerArcGymGoalId : null,
  };
}

// --- Future mantra: always "אני אצליח <user-defined continuation>" ---

export const FUTURE_MANTRA_PREFIX = "אני אצליח";

/** Composes the full mantra from the user's own free-text continuation. "" in -> "" out (not set at all -- the popup's mantra step is skipped), never a bare prefix with nothing after it. */
export function composeFutureMantra(suffix: string): string {
  const trimmedSuffix = suffix.trim();
  return trimmedSuffix ? `${FUTURE_MANTRA_PREFIX} ${trimmedSuffix}` : "";
}

/** The inverse of composeFutureMantra, for re-populating the editor's own continuation field from a saved mantra. Strips the fixed prefix when present; falls back to the full text for any legacy value that somehow didn't carry it. */
export function extractMantraSuffix(mantra: string): string {
  const trimmed = mantra.trim();
  if (!trimmed) return "";
  return trimmed.startsWith(FUTURE_MANTRA_PREFIX) ? trimmed.slice(FUTURE_MANTRA_PREFIX.length).trim() : trimmed;
}

// --- Focus-point color: a fixed palette, never free-text/raw hex ---

export interface FocusPointColorOption {
  id: string;
  hex: string;
  labelHebrew: string;
}

export const FOCUS_POINT_COLORS: FocusPointColorOption[] = [
  { id: "red", hex: "#e53935", labelHebrew: "אדום" },
  { id: "orange", hex: "#fb8c00", labelHebrew: "כתום" },
  { id: "yellow", hex: "#fdd835", labelHebrew: "צהוב" },
  { id: "green", hex: "#43a047", labelHebrew: "ירוק" },
  { id: "turquoise", hex: "#00acc1", labelHebrew: "תכלת" },
  { id: "blue", hex: "#1e88e5", labelHebrew: "כחול" },
  { id: "purple", hex: "#8e24aa", labelHebrew: "סגול" },
  { id: "pink", hex: "#d81b60", labelHebrew: "ורוד" },
];

/** null for "" (not set) or any id that no longer matches the palette -- the caller (the visualization popup's focus-point step) treats either case as "skip this step", never a broken/blank colored dot. */
export function resolveFocusPointColor(colorId: string): FocusPointColorOption | null {
  return FOCUS_POINT_COLORS.find((option) => option.id === colorId) ?? null;
}

/**
 * "If a saved Manifest is incomplete, avoid displaying empty or broken
 * content": a complete manifest has every one of its own four
 * questions AND all three behaviors (description + reason each)
 * actually filled in. Incomplete manifests are never deleted and
 * remain fully editable -- they are simply excluded from the daily
 * random-selection pool (resolveEligibleManifests below) until
 * completed.
 *
 * Final Manifest & Startup Popup Updates task: deliberately NEVER
 * requires futureMantra/focusPointColor/futureBodyMovement -- those are
 * optional additions to an already-eligible manifest. Requiring them
 * here would silently drop every manifest saved before this task from
 * the random-selection pool (a destructive-feeling regression this task
 * never asked for); the visualization popup instead skips each of its
 * own mantra/focus/movement steps individually when its field is blank.
 */
export function isPurposeManifestComplete(manifest: PurposeManifest): boolean {
  if (!manifest.longTermGoal.trim() || !manifest.personalReason.trim() || !manifest.personalValue.trim()) return false;
  return manifest.behaviors.every((behavior) => behavior.description.trim() !== "" && behavior.reason.trim() !== "");
}

/**
 * ARC Gym + ARC Goal Integration task: a goal-owned manifest
 * (ownerArcGymGoalId set) is excluded here, regardless of completeness
 * -- it is intentionally viewed only from inside its own ArcGymGoal
 * screen, never surfaced as a random daily popup. Every pre-existing,
 * ordinary manifest keeps rotating exactly as before.
 */
export function resolveEligibleManifests(manifests: PurposeManifest[]): PurposeManifest[] {
  return manifests.filter((manifest) => manifest.ownerArcGymGoalId === null && isPurposeManifestComplete(manifest));
}

export function upsertPurposeManifestInList(manifests: PurposeManifest[], manifest: PurposeManifest): PurposeManifest[] {
  const index = manifests.findIndex((existing) => existing.id === manifest.id);
  if (index === -1) return [...manifests, manifest];
  const next = [...manifests];
  next[index] = manifest;
  return next;
}

// --- Random daily selection among eligible manifests ---

/**
 * Picks one id uniformly at random from `ids`, using a caller-supplied
 * `randomValue` in [0, 1) (ordinarily Math.random(), but injected so
 * this stays deterministically testable) -- every eligible manifest
 * has an equal 1/n chance, however many there are. null for an empty
 * list (the "no eligible manifest" case the caller handles separately
 * -- never invented).
 */
export function selectRandomManifestId(ids: string[], randomValue: number): string | null {
  if (ids.length === 0) return null;
  const clamped = Math.min(Math.max(randomValue, 0), 0.9999999999);
  const index = Math.floor(clamped * ids.length);
  return ids[index];
}

// --- Per-manifest behavior rotation (persists across days, independent of which manifest is picked which day) ---

export interface PurposeManifestRotationState {
  lastBehaviorIndexByManifestId: Record<string, number>;
}

export function emptyPurposeManifestRotationState(): PurposeManifestRotationState {
  return { lastBehaviorIndexByManifestId: {} };
}

/** The behavior index to show NEXT for this specific manifest -- 0/1/2 for behaviors 1/2/3, wrapping back to 0 after 2. Every OTHER manifest's own rotation is untouched by reading or advancing this one's. */
export function resolveNextBehaviorIndexForManifest(rotation: PurposeManifestRotationState, manifestId: string): number {
  const lastIndex = rotation.lastBehaviorIndexByManifestId[manifestId] ?? null;
  return resolveNextRotationIndex(lastIndex, 3);
}

export function recordBehaviorShownForManifest(rotation: PurposeManifestRotationState, manifestId: string, behaviorIndex: number): PurposeManifestRotationState {
  return { lastBehaviorIndexByManifestId: { ...rotation.lastBehaviorIndexByManifestId, [manifestId]: behaviorIndex } };
}

// --- Today's resolved selection (manifest id + behavior index + optional linked daily-action task) ---

export interface DailyManifestSelection {
  /** Local YYYY-MM-DD this selection was made for -- program/dateUtils.ts's todayLocalDateString convention. */
  dateLocal: string;
  manifestId: string;
  behaviorIndex: number;
  /** Set once the trainee adds today's small action to the schedule from the visualization popup -- null until then, and null again every new day (never carried over). */
  dailyActionTaskId: string | null;
}

/** True only when a selection already exists AND was made for today -- a selection from an earlier day is stale and must be recomputed, never silently reused. */
export function isDailySelectionCurrent(selection: DailyManifestSelection | null, todayDateLocal: string): boolean {
  return selection !== null && selection.dateLocal === todayDateLocal;
}

export function createDailyManifestSelection(manifestId: string, behaviorIndex: number, dateLocal: string): DailyManifestSelection {
  return { dateLocal, manifestId, behaviorIndex, dailyActionTaskId: null };
}

export function recordDailyActionTask(selection: DailyManifestSelection, taskId: string): DailyManifestSelection {
  return { ...selection, dailyActionTaskId: taskId };
}

// --- Once-per-day popup-sequence gate (Psychology Fact + Manifest Visualization) ---

export interface DailyStartupSequenceState {
  lastShownDateLocal: string | null;
}

export function emptyDailyStartupSequenceState(): DailyStartupSequenceState {
  return { lastShownDateLocal: null };
}

export function hasShownStartupSequenceToday(state: DailyStartupSequenceState, todayDateLocal: string): boolean {
  return state.lastShownDateLocal === todayDateLocal;
}

export function markStartupSequenceShown(todayDateLocal: string): DailyStartupSequenceState {
  return { lastShownDateLocal: todayDateLocal };
}
