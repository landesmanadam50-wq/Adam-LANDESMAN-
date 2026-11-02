/**
 * arc/bodyRegionRoles.ts
 *
 * Hebrew BUILD/LIVE rework spec, BUILD section ג ("אזורי גוף") -- the
 * trainee may select MULTIPLE body regions and assign each an
 * independent role: the region where the disturbing sensation is felt
 * (and where the initial opening movement happens), a region for the
 * supportive movement/sensation, or BOTH roles on the very same region
 * ("אותו אזור יכול למלא את שני התפקידים אם המשתמש בוחר בכך").
 *
 * Genuinely new: every existing body-region concept in this codebase
 * (arc/bodyImagery.ts's BodyImagery, ArcBuildProfile.regulationBodyImagery/
 * EncodingProfile.bodyImagery) is exactly ONE region-set per ONE cue,
 * never several independently-selected regions each carrying their own
 * role. Selecting several regions never requires performing several
 * movements at once -- role assignment and movement choice are per
 * region here; LIVE sequencing (a later stage) decides ordering. This
 * module only models the BUILD-time configuration and preserves
 * selection order (`order`) so that later stage has a stable,
 * predictable sequence to follow.
 */

export type BodyRegion = "chest" | "abdomen" | "back" | "shoulders" | "neck" | "jaw" | "face" | "head" | "arms" | "hands" | "legs_feet" | "other";

export const BODY_REGIONS: BodyRegion[] = ["chest", "abdomen", "back", "shoulders", "neck", "jaw", "face", "head", "arms", "hands", "legs_feet", "other"];

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  chest: "חזה",
  abdomen: "בטן",
  back: "גב",
  shoulders: "כתפיים",
  neck: "צוואר",
  jaw: "לסת",
  face: "פנים",
  head: "ראש",
  arms: "זרועות",
  hands: "כפות ידיים",
  legs_feet: "רגליים וכפות רגליים",
  other: "אזור אחר",
};

/**
 * "sensationAndOpening": the region where the disturbing sensation is
 * felt and where the initial opening movement is performed.
 * "supportive": the region for the supportive movement/sensation.
 * `roles` is a non-empty array, never a single enum, precisely so a
 * single region can carry both at once.
 */
export type BodyRegionRole = "sensationAndOpening" | "supportive";

export interface BodyRegionConfig {
  region: BodyRegion;
  /** Only meaningful when region === "other" -- the trainee's own label for it. */
  customLabel: string | null;
  roles: BodyRegionRole[];
  /** The chosen/typed movement for this region -- one text per region (combining a selected preset and/or free-text custom wording), never required to differ per role. */
  movementText: string | null;
  /** Preserves BUILD selection order, so a later LIVE stage never depends on object/array iteration order alone. */
  order: number;
}

export function createBodyRegionConfig(region: BodyRegion, order: number): BodyRegionConfig {
  return { region, customLabel: null, roles: [], movementText: null, order };
}

/** A region "fills" a role only when that role is actually present in its roles array -- never inferred from position or order. */
export function bodyRegionHasRole(config: BodyRegionConfig, role: BodyRegionRole): boolean {
  return config.roles.includes(role);
}

/** Every region assigned the given role, in the trainee's own BUILD selection order -- never re-sorted by region/alphabetical/anything else. */
export function resolveBodyRegionConfigsForRole(configs: BodyRegionConfig[], role: BodyRegionRole): BodyRegionConfig[] {
  return [...configs].filter((config) => bodyRegionHasRole(config, role)).sort((a, b) => a.order - b.order);
}

/** Display label -- the trainee's own customLabel when region is "other" and one was written, otherwise the fixed Hebrew label. Never blank. */
export function resolveBodyRegionDisplayLabel(config: BodyRegionConfig): string {
  if (config.region === "other" && config.customLabel && config.customLabel.trim().length > 0) {
    return config.customLabel.trim();
  }
  return BODY_REGION_LABELS[config.region];
}

/**
 * Hebrew BUILD/LIVE rework spec: the small, presentation-adjacent
 * summary arc/stageCopy.ts's stay/accept/regulate cases append their
 * own movement-aware line from -- null when no region carries the
 * given role (every legacy build, and any build that never configured
 * this section), so those stages' existing copy is completely
 * unaffected. regionLabels joins every matching region's own display
 * label (BUILD selection order); movementTexts carries only the
 * non-blank movement texts, in the same order, for the caller's own
 * wording to use or not.
 */
export function resolveBodyRegionMovementLine(
  configs: BodyRegionConfig[],
  role: BodyRegionRole
): { regionLabels: string; movementTexts: string[] } | null {
  const matches = resolveBodyRegionConfigsForRole(configs, role);
  if (matches.length === 0) return null;
  return {
    regionLabels: matches.map(resolveBodyRegionDisplayLabel).join(", "),
    movementTexts: matches.map((config) => config.movementText).filter((text): text is string => !!text && text.trim().length > 0),
  };
}
