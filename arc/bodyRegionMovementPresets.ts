/**
 * arc/bodyRegionMovementPresets.ts
 *
 * Hebrew BUILD/LIVE rework spec: for each selected body region, suggest
 * candidate movements (alongside an always-available free-text custom
 * option, a BUILD-UI concern not modeled here). Keyed by BodyRegion --
 * unlike arc/bodyImagery.ts's KNOWN_BODY_IMAGERY (keyed by exact SAVED
 * instruction text, a reverse lookup enriching an already-chosen
 * instruction with imagery metadata), this is a forward lookup: region
 * -> candidate movement strings to offer as chips. A region with no
 * authored presets yet (e.g. "face"/"other") simply offers none here --
 * the BUILD UI's own free-text field stays available regardless, so an
 * empty preset list is never a dead end.
 */

import type { BodyRegion } from "./bodyRegionRoles.ts";

export const BODY_REGION_MOVEMENT_PRESETS: Record<BodyRegion, string[]> = {
  chest: ["פתיחה עדינה באמצעות שינוי תנוחה נוח"],
  abdomen: [],
  back: ["התיישרות נוחה של הגב"],
  shoulders: ["הורדה עדינה של הכתפיים", "שחרור עדין של הכתפיים"],
  neck: [],
  jaw: ["שחרור עדין של הלסת"],
  face: [],
  head: [],
  arms: [],
  hands: ["פתיחה הדרגתית של כפות הידיים"],
  legs_feet: ["הנחה יציבה של כפות הרגליים על הרצפה"],
  other: [],
};

export function resolveBodyRegionMovementPresets(region: BodyRegion): string[] {
  return BODY_REGION_MOVEMENT_PRESETS[region];
}
