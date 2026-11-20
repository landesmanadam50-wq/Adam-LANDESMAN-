/**
 * arc/arcFocusSettings.ts
 *
 * ARC Focus task: the pure settings shape, defaults, and validators for
 * a trainee's chosen session duration / tap rhythm / tap-cue visibility /
 * attention-check toggle. No I/O -- data/storage.ts's own
 * loadArcFocusSettings/saveArcFocusSettings persist this shape, keyed
 * per the spec ("settings persisted for reuse"), either per scheduled
 * task or as a standalone "last used" default.
 */

export interface ArcFocusSettings {
  durationMinutes: number;
  tapRhythmSeconds: number;
  /** A togglable visual cue for the rhythmic taps -- purely a rendering flag, read by the UI only. */
  showTapCue: boolean;
  /** Opt-in, rate-limited random attention checks (arc/arcFocusEngine.ts's own internal frequency bounds) -- off entirely when false, never scheduled at all. */
  attentionChecksEnabled: boolean;
}

/** Shown as quick-pick chips -- duration also accepts any custom positive-integer minute count, so this is a convenience list, never the full validity rule. */
export const ARC_FOCUS_DURATION_PRESET_MINUTES: number[] = [1, 3, 5, 10, 15, 20];

/** Tap rhythm has no custom option in the spec -- these four are the entire set of valid values. */
export const ARC_FOCUS_TAP_RHYTHM_PRESET_SECONDS: number[] = [1, 2, 3, 5];

export const DEFAULT_ARC_FOCUS_DURATION_MINUTES = 5;
export const DEFAULT_ARC_FOCUS_TAP_RHYTHM_SECONDS = 2;

export function createDefaultArcFocusSettings(): ArcFocusSettings {
  return {
    durationMinutes: DEFAULT_ARC_FOCUS_DURATION_MINUTES,
    tapRhythmSeconds: DEFAULT_ARC_FOCUS_TAP_RHYTHM_SECONDS,
    showTapCue: true,
    attentionChecksEnabled: true,
  };
}

export function isValidArcFocusDurationMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes > 0;
}

export function isValidArcFocusTapRhythmSeconds(seconds: number): boolean {
  return ARC_FOCUS_TAP_RHYTHM_PRESET_SECONDS.includes(seconds);
}

/** Deterministic shape/range validation only, same convention as arc/taskDraft.ts's own validateTaskDraft -- an empty list means the settings are ready to persist/start a session from. */
export function validateArcFocusSettings(settings: ArcFocusSettings): string[] {
  const errors: string[] = [];
  if (!isValidArcFocusDurationMinutes(settings.durationMinutes)) errors.push("משך הזמן הכולל חייב להיות מספר דקות חיובי.");
  if (!isValidArcFocusTapRhythmSeconds(settings.tapRhythmSeconds)) errors.push("קצב ההקשות חייב להיות אחת מהאפשרויות הקבועות (1, 2, 3 או 5 שניות).");
  return errors;
}

/** Falls back to the default for any field that fails validation -- never throws, same "never block on a stale/partial persisted value" convention this codebase's load functions already use. */
export function normalizeArcFocusSettings(settings: Partial<ArcFocusSettings> | null | undefined): ArcFocusSettings {
  const defaults = createDefaultArcFocusSettings();
  if (!settings) return defaults;
  return {
    durationMinutes: typeof settings.durationMinutes === "number" && isValidArcFocusDurationMinutes(settings.durationMinutes) ? settings.durationMinutes : defaults.durationMinutes,
    tapRhythmSeconds: typeof settings.tapRhythmSeconds === "number" && isValidArcFocusTapRhythmSeconds(settings.tapRhythmSeconds) ? settings.tapRhythmSeconds : defaults.tapRhythmSeconds,
    showTapCue: typeof settings.showTapCue === "boolean" ? settings.showTapCue : defaults.showTapCue,
    attentionChecksEnabled: typeof settings.attentionChecksEnabled === "boolean" ? settings.attentionChecksEnabled : defaults.attentionChecksEnabled,
  };
}
