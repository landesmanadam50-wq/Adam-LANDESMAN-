/**
 * arc/teleprompterSettings.ts
 *
 * ARC Video task: the pure settings shape, defaults, and validators for
 * the teleprompter overlay shown during recording (build/ArcVideoRecordScreen.tsx) --
 * text size, auto-scroll speed, and vertical position (kept near the
 * camera lens so the trainee's eyes stay close to it for natural eye
 * contact). No I/O -- data/storage.ts's own loadTeleprompterSettings/
 * saveTeleprompterSettings persist this shape as a single standalone
 * "last used" default, same convention as arc/arcFocusSettings.ts.
 */

export interface TeleprompterSettings {
  fontSize: number;
  scrollSpeedSecondsPerLine: number;
  /** Vertical offset of the text block from the top of the screen, as a 0-1 fraction of screen height -- kept low (near the lens) by default, never covering the full screen. */
  textPositionOffset: number;
}

/** Shown as quick-pick chips -- font size also accepts any custom positive-integer value, so this is a convenience list, never the full validity rule. */
export const TELEPROMPTER_FONT_SIZE_PRESETS: number[] = [16, 20, 24, 28, 32, 40];

/** Scroll speed has no custom option in the spec's quick-pick UI -- these presets are typical choices, not the entire valid range. */
export const TELEPROMPTER_SCROLL_SPEED_PRESETS_SECONDS_PER_LINE: number[] = [1, 2, 3, 5, 8];

/** Position offset is a 0-1 fraction of screen height -- these presets cover "near the top" (closest to a front camera's lens) through "centered." */
export const TELEPROMPTER_TEXT_POSITION_OFFSET_PRESETS: number[] = [0.05, 0.1, 0.2, 0.35];

export const DEFAULT_TELEPROMPTER_FONT_SIZE = 24;
export const DEFAULT_TELEPROMPTER_SCROLL_SPEED_SECONDS_PER_LINE = 3;
export const DEFAULT_TELEPROMPTER_TEXT_POSITION_OFFSET = 0.1;

export function createDefaultTeleprompterSettings(): TeleprompterSettings {
  return {
    fontSize: DEFAULT_TELEPROMPTER_FONT_SIZE,
    scrollSpeedSecondsPerLine: DEFAULT_TELEPROMPTER_SCROLL_SPEED_SECONDS_PER_LINE,
    textPositionOffset: DEFAULT_TELEPROMPTER_TEXT_POSITION_OFFSET,
  };
}

export function isValidTeleprompterFontSize(fontSize: number): boolean {
  return Number.isInteger(fontSize) && fontSize >= 12 && fontSize <= 72;
}

export function isValidTeleprompterScrollSpeed(secondsPerLine: number): boolean {
  return typeof secondsPerLine === "number" && Number.isFinite(secondsPerLine) && secondsPerLine > 0 && secondsPerLine <= 30;
}

export function isValidTeleprompterTextPositionOffset(offset: number): boolean {
  return typeof offset === "number" && Number.isFinite(offset) && offset >= 0 && offset <= 0.6;
}

/** Deterministic shape/range validation only, same convention as arc/arcFocusSettings.ts's own validateArcFocusSettings -- an empty list means the settings are ready to persist/start a recording from. */
export function validateTeleprompterSettings(settings: TeleprompterSettings): string[] {
  const errors: string[] = [];
  if (!isValidTeleprompterFontSize(settings.fontSize)) errors.push("גודל הטקסט חייב להיות מספר שלם בין 12 ל-72.");
  if (!isValidTeleprompterScrollSpeed(settings.scrollSpeedSecondsPerLine)) errors.push("קצב הגלילה חייב להיות מספר חיובי של שניות לשורה (עד 30).");
  if (!isValidTeleprompterTextPositionOffset(settings.textPositionOffset)) errors.push("מיקום הטקסט חייב להיות בין 0 ל-0.6 מגובה המסך.");
  return errors;
}

/** Falls back to the default for any field that fails validation -- never throws, same "never block on a stale/partial persisted value" convention this codebase's load functions already use. */
export function normalizeTeleprompterSettings(settings: Partial<TeleprompterSettings> | null | undefined): TeleprompterSettings {
  const defaults = createDefaultTeleprompterSettings();
  if (!settings) return defaults;
  return {
    fontSize: typeof settings.fontSize === "number" && isValidTeleprompterFontSize(settings.fontSize) ? settings.fontSize : defaults.fontSize,
    scrollSpeedSecondsPerLine:
      typeof settings.scrollSpeedSecondsPerLine === "number" && isValidTeleprompterScrollSpeed(settings.scrollSpeedSecondsPerLine)
        ? settings.scrollSpeedSecondsPerLine
        : defaults.scrollSpeedSecondsPerLine,
    textPositionOffset:
      typeof settings.textPositionOffset === "number" && isValidTeleprompterTextPositionOffset(settings.textPositionOffset)
        ? settings.textPositionOffset
        : defaults.textPositionOffset,
  };
}
