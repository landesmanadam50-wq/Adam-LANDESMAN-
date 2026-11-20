/**
 * arc/focusColorPalette.ts
 *
 * Unified ARC Architecture and Interactive Animation Update, Phase 1:
 * the one, single place that turns the trainee's own chosen Presence
 * color -- a plain Hebrew word (one of arc/newArcLiveTypes.ts's own
 * FOCUS_COLOR_OPTIONS) or free-typed text, stored verbatim in
 * session.selectedFocusColor -- into an actual renderable color for
 * live/components/PresenceAnimation.tsx. Pure data/lookup, no React.
 *
 * "Preserve the chosen color": every FOCUS_COLOR_OPTIONS preset maps
 * to its own real, named hue -- never a shared/approximate color
 * across two different presets. Free-typed text that doesn't match
 * any preset falls back to ARCHI's own existing accent color, which is
 * itself a legitimate, pre-existing brand color, never an invented
 * association with the trainee's own words.
 */

export const FOCUS_COLOR_HEX: Record<string, string> = {
  אדום: "#D32F2F",
  כתום: "#F57C00",
  צהוב: "#FBC02D",
  ירוק: "#388E3C",
  כחול: "#1976D2",
  סגול: "#7B1FA2",
  // "לבן" (white) is deliberately mapped to a light gray, never pure
  // white -- a white point/ring on this app's own white background
  // would be fully invisible, which is never "preserving the chosen
  // color," it's silently losing it. This is the one approximation in
  // this table, kept to exactly this single entry.
  לבן: "#D0D0D0",
  שחור: "#212121",
};

/** ARCHI's own existing brand accent color (live/NewArcLiveScreen.tsx's own styles.primaryButton) -- the safe fallback for null, blank, or an unrecognized free-typed color word, never a guess at what the trainee's own words might mean. */
export const DEFAULT_PRESENCE_COLOR = "#0a7ea4";

/** A bare "#RGB"/"#RRGGBB" hex string -- same shape arc/arcAppearanceSettings.ts's own isValidArcAppearanceColor validates custom colors against, so the two never disagree on what counts as "a real hex color." */
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * ARCHI -- Unified 7-Part Update task, Part 7.2 ("ARC APPEARANCE
 * SETTINGS"): a validated custom hex color (e.g. "#1976D2," typed
 * directly into the point/circle color picker) now passes through
 * verbatim, UPPERCASED for a consistent return shape -- every existing
 * caller (a plain preset word, or null/blank) keeps resolving exactly
 * as before this task.
 */
export function resolveFocusColorHex(selectedFocusColor: string | null): string {
  if (!selectedFocusColor) return DEFAULT_PRESENCE_COLOR;
  const trimmed = selectedFocusColor.trim();
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed.toUpperCase();
  return FOCUS_COLOR_HEX[trimmed] ?? DEFAULT_PRESENCE_COLOR;
}
