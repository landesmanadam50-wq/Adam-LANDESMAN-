/**
 * arc/arcAppearanceSettings.ts
 *
 * ARCHI -- Unified 7-Part Update task, Part 7.2 ("ARC APPEARANCE
 * SETTINGS"): the one persistent, global pair of ARC visual settings
 * -- "צבע נקודת המיקוד" (the Presence point/ring color) and "צבע
 * העיגול" (the circle's own outline color) -- each independently
 * configurable, each applying across Full/Shortened/Mini/Task LIVE
 * ARC/ARC GYM alike (every one of them renders through the SAME
 * live/components/ArcBodyMantraCircle.tsx and
 * live/components/PresenceAnimation.tsx, so one setting read in one
 * place reaches every route automatically -- never a second,
 * per-route copy of this data).
 *
 * Pure data/validation only -- no React, no storage I/O (that's
 * data/storage.ts's own loadArcAppearanceSettings/
 * saveArcAppearanceSettings, mirroring every other settings blob's
 * existing load/save convention).
 *
 * "Preserve current defaults until changed": both fields default to
 * `null`, meaning "use the app's own existing built-in default" --
 * resolvePointColorHex/resolveCircleColorHex below (never this module
 * itself, which has no color-math of its own) fall back to
 * arc/focusColorPalette.ts's own DEFAULT_PRESENCE_COLOR exactly as
 * every session already did before this setting existed.
 */

export interface ArcAppearanceSettings {
  /** A FOCUS_COLOR_HEX preset name (e.g. "כחול") or a validated custom hex string, or null for "use the app's own default." */
  pointColor: string | null;
  /** Independent from pointColor -- the circle's own outline color, same preset-or-custom-hex shape, or null for "use the default (currently: the same as the point color)." */
  circleColor: string | null;
}

export const DEFAULT_ARC_APPEARANCE_SETTINGS: ArcAppearanceSettings = { pointColor: null, circleColor: null };

/** The preset color words every picker offers -- the exact same named hues arc/focusColorPalette.ts's own FOCUS_COLOR_HEX table already maps, so a preset chosen here is GUARANTEED to resolve to a real, already-tested color. */
export const ARC_APPEARANCE_COLOR_PRESETS = ["כחול", "סגול", "ירוק", "כתום", "אדום", "צהוב", "שחור", "לבן"] as const;

/** A bare "#RGB"/"#RRGGBB" hex string -- the one shape a trainee's own free-typed custom color must match to be accepted, never silently coerced into something else. */
const CUSTOM_HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** "Optional validated custom colors": true only for a real preset word or a well-formed hex string -- a malformed free-typed value is simply rejected by the settings screen (never saved), never silently guessed at. */
export function isValidArcAppearanceColor(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (ARC_APPEARANCE_COLOR_PRESETS as readonly string[]).includes(trimmed) || CUSTOM_HEX_PATTERN.test(trimmed);
}
