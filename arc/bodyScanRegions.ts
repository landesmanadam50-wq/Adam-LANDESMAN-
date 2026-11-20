/**
 * arc/bodyScanRegions.ts
 *
 * Body Scan Upgrade task: the full 26-region hierarchical list the two
 * new interactive body-scan screens (contraction, then heaviness/
 * closedness) use -- deliberately a SEPARATE, much finer-grained list
 * from arc/bodyRegionRoles.ts's own BodyRegion (12 broad regions used
 * for the unpleasant/supportive-anchor single-select steps elsewhere
 * in this same ARC LIVE flow). The two lists serve genuinely different
 * granularities and are never merged or cross-read -- this module adds
 * a new, independent region vocabulary rather than rebuilding the
 * existing one, exactly per this task's own "do not rebuild" and
 * "reuse... whenever possible" instructions (there is nothing in the
 * existing BodyRegion list this finer scan could reuse without losing
 * the per-region granularity the spec explicitly asks for).
 *
 * Left/right differentiation ("Allow optional left/right
 * differentiation for applicable regions") is modeled as simply as
 * possible: a PAIRED region (one that exists on both sides of the
 * body) always exposes two independent rows (ימין/שמאל) in the UI;
 * every other (midline) region exposes exactly one, side-less row.
 * There is no runtime "split/unsplit" toggle to manage -- which
 * regions are paired is fixed, static data, decided once here.
 */

export type BodyScanRegion =
  // ראש ופנים
  | "forehead"
  | "eyes"
  | "cheeks"
  | "scanJaw"
  | "ears"
  | "scalp"
  // צוואר ופלג גוף עליון
  | "scanNeck"
  | "throat"
  | "scanShoulders"
  | "scanChest"
  | "upperBack"
  | "lowerBack"
  | "scanAbdomen"
  | "pelvisHips"
  // ידיים
  | "scanArms"
  | "elbows"
  | "forearms"
  | "wrists"
  | "palms"
  | "fingers"
  // רגליים
  | "thighs"
  | "knees"
  | "shins"
  | "ankles"
  | "feet"
  | "toes";

export type BodyScanRegionGroupId = "head_face" | "neck_upper_body" | "arms" | "legs";

export interface BodyScanRegionGroupDef {
  id: BodyScanRegionGroupId;
  label: string;
  regions: BodyScanRegion[];
}

export const BODY_SCAN_REGION_GROUP_DEFS: BodyScanRegionGroupDef[] = [
  { id: "head_face", label: "ראש ופנים", regions: ["forehead", "eyes", "cheeks", "scanJaw", "ears", "scalp"] },
  {
    id: "neck_upper_body",
    label: "צוואר ופלג גוף עליון",
    regions: ["scanNeck", "throat", "scanShoulders", "scanChest", "upperBack", "lowerBack", "scanAbdomen", "pelvisHips"],
  },
  { id: "arms", label: "ידיים", regions: ["scanArms", "elbows", "forearms", "wrists", "palms", "fingers"] },
  { id: "legs", label: "רגליים", regions: ["thighs", "knees", "shins", "ankles", "feet", "toes"] },
];

export const BODY_SCAN_REGION_LABELS: Record<BodyScanRegion, string> = {
  forehead: "מצח",
  eyes: "עיניים",
  cheeks: "לחיים",
  scanJaw: "לסת",
  ears: "אוזניים",
  scalp: "קרקפת",
  scanNeck: "צוואר",
  throat: "גרון",
  scanShoulders: "כתפיים",
  scanChest: "חזה",
  upperBack: "גב עליון",
  lowerBack: "גב תחתון",
  scanAbdomen: "בטן",
  pelvisHips: "אגן ומותניים",
  scanArms: "זרועות",
  elbows: "מרפקים",
  forearms: "אמות",
  wrists: "מפרקי כף היד",
  palms: "כפות ידיים",
  fingers: "אצבעות הידיים",
  thighs: "ירכיים",
  knees: "ברכיים",
  shins: "שוקיים",
  ankles: "קרסוליים",
  feet: "כפות רגליים",
  toes: "אצבעות הרגליים",
};

/** Every region flattened, in the same group/declaration order as BODY_SCAN_REGION_GROUP_DEFS -- never a second, independently-maintained ordering. */
export const BODY_SCAN_ALL_REGIONS: BodyScanRegion[] = BODY_SCAN_REGION_GROUP_DEFS.flatMap((group) => group.regions);

/** Regions that exist on both sides of the body -- these get two independent rows (ימין/שמאל) in the two new scan screens; every other (midline) region gets exactly one, side-less row. Eyes/cheeks/ears are paired even though "jaw"/"forehead"/"scalp" (also head/face) are treated as midline, matching how a trainee ordinarily experiences them. */
export const BODY_SCAN_PAIRED_REGIONS = new Set<BodyScanRegion>([
  "eyes",
  "cheeks",
  "ears",
  "scanShoulders",
  "scanArms",
  "elbows",
  "forearms",
  "wrists",
  "palms",
  "fingers",
  "thighs",
  "knees",
  "shins",
  "ankles",
  "feet",
  "toes",
]);

export function isBodyScanRegionPaired(region: BodyScanRegion): boolean {
  return BODY_SCAN_PAIRED_REGIONS.has(region);
}

export const BODY_SCAN_CONTRACTION_INFO = {
  title: "מהו כיווץ?",
  text: "כיווץ הוא תחושה של לחץ, הידוק, התכווצות או מתח באזור מסוים בגוף. לדוגמה, בטן מכווצת, לסת מהודקת או חזה מתוח.",
};

export const BODY_SCAN_HEAVINESS_INFO = {
  title: "מהי כבדות?",
  text: "כבדות היא תחושה שהאזור כבד, איטי או דורש יותר מאמץ לתנועה. למשל, ידיים שמרגישות כבדות או רגליים שקשה להניע בקלילות.",
};

export const BODY_SCAN_CLOSEDNESS_INFO = {
  title: "מהי סגירות?",
  text: "סגירות היא תחושה סובייקטיבית של חוסר מרחב, נוקשות או חוסר חופש באזור מסוים בגוף. למשל, כתפיים שמרגישות סגורות או ידיים שמרגישות מוגבלות בתנועה.",
};

export const BODY_SCAN_OPENNESS_INFO = {
  title: "מהי פתיחות?",
  text: "פתיחות היא תחושה של יותר מרחב, חופש תנועה, קלילות או נינוחות באזור מסוים בגוף. למשל, כפות ידיים שנפתחות ומתרככות, כתפיים שמשתחררות או רגליים שמרגישות חופשיות יותר.",
};
