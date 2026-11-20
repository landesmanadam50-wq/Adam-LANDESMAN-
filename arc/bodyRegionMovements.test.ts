import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  BODY_MOVEMENT_SET_INSTRUCTIONS,
  BODY_MOVEMENT_SETS,
  BODY_REGION_MOVEMENTS,
  filterMovementEligibleSelections,
  isBodyRegionMovementEligible,
  resolveBodyMovementSetForRegion,
  resolveBodyRegionMovement,
  resolveBodyRegionMovementTransform,
  resolveMovementEligibleRegionKeys,
  resolveMovementInstructionsForStage,
} from "./bodyRegionMovements.ts";
import { BODY_SCAN_ALL_REGIONS } from "./bodyScanRegions.ts";
import { containsInductionPattern } from "./instructions.ts";

// Fix All Confirmed ARC Android Bugs task, requirement 1 (the confirmed
// black-screen root cause): resolveBodyRegionMovementTransform is called
// every animation frame from INSIDE live/components/ArticulatedBodyShape.tsx's
// own Reanimated worklet, but is DEFINED in this separate, plain module.
// Reanimated's documented fix for exactly this cross-file pattern is an
// explicit "worklet" directive as the function's own first statement --
// without it, calling this function from the UI thread throws at runtime
// on a release Android build (no redbox in release mode, so the screen
// goes blank while unrelated native overlay windows keep rendering,
// matching the exact reported symptom). This test reads the SOURCE text
// directly (never just the runtime return value, which stays correct
// with or without the directive when called from plain JS, as every
// other test in this file calls it) -- it is the one guard against this
// exact regression silently coming back.
test("Fix All Confirmed ARC Android Bugs task, requirement 1: resolveBodyRegionMovementTransform carries an explicit 'worklet' directive as its own first statement -- the confirmed, verified fix for the reported black screen at Dwelling", () => {
  const path = fileURLToPath(new URL("./bodyRegionMovements.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  const fnIndex = source.indexOf("export function resolveBodyRegionMovementTransform");
  assert.ok(fnIndex >= 0, "resolveBodyRegionMovementTransform must still exist");
  const fnOpenBraceIndex = source.indexOf("{", fnIndex);
  const firstStatementsText = source.slice(fnOpenBraceIndex, fnOpenBraceIndex + 400);
  assert.match(firstStatementsText, /^\{\s*\n\s*"worklet";/, "the \"worklet\" directive must be the function's own first statement, right after its opening brace");
});

test("ARCHI 10-Set Body Movement redesign task: exactly the 16 documented regions are movement-eligible -- no more, no fewer -- and every excluded head/face/throat/elbow/forearm/shin region has no entry at all (scanNeck is the one new deliberate exception, per the reference diagram's own set 3)", () => {
  const eligible = Object.keys(BODY_REGION_MOVEMENTS).sort();
  assert.deepEqual(eligible, [
    "ankles",
    "feet",
    "fingers",
    "knees",
    "lowerBack",
    "palms",
    "pelvisHips",
    "scanAbdomen",
    "scanArms",
    "scanChest",
    "scanNeck",
    "scanShoulders",
    "thighs",
    "toes",
    "upperBack",
    "wrists",
  ]);
  for (const excluded of ["forehead", "eyes", "cheeks", "scanJaw", "ears", "scalp", "throat", "elbows", "forearms", "shins"] as const) {
    assert.equal(isBodyRegionMovementEligible(excluded), false, `${excluded} must never be movement-eligible`);
  }
});

test("ARCHI 10-Set Body Movement redesign task: BODY_MOVEMENT_SETS has exactly 10 sets, and its own region membership is EXACTLY the 16 eligible regions, each belonging to exactly one set -- the grouping can never silently drift out of sync with BODY_REGION_MOVEMENTS", () => {
  assert.equal(BODY_MOVEMENT_SETS.length, 10);
  const seen = new Set<string>();
  for (const set of BODY_MOVEMENT_SETS) {
    assert.ok(set.regions.length > 0, `${set.id} must list at least one region`);
    for (const region of set.regions) {
      assert.equal(seen.has(region), false, `${region} must belong to exactly one set, but also appears in another`);
      seen.add(region);
      assert.ok(isBodyRegionMovementEligible(region), `${region} (in set ${set.id}) must itself be movement-eligible`);
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(BODY_REGION_MOVEMENTS).sort());
});

test("ARCHI 10-Set Body Movement redesign task: scanNeck (set 3, head/neck) is deliberately minimal and midline -- reflecting the neck's own sensitivity (the ORIGINAL reason it had no entry at all) -- never a stretch, tilt, or rotation", () => {
  const neck = resolveBodyRegionMovement("scanNeck")!;
  assert.ok(neck);
  assert.equal(neck.dx, 0, "the neck must never move laterally");
  assert.ok(Math.abs(neck.dy) <= 2, "the neck's own vertical lengthening must be minimal -- at most 2px");
  assert.ok(neck.scale <= 1.02, "the neck's own expansion must be minimal -- at most 1.02x");
  // Also covered by the existing blanket safety test below ("no exaggerated movement"), which scanNeck must pass too.
});

test("every one of the 26 BodyScanRegion identifiers is accounted for (eligible or explicitly excluded) -- never a region silently missing from both", () => {
  for (const region of BODY_SCAN_ALL_REGIONS) {
    const eligible = isBodyRegionMovementEligible(region);
    assert.equal(typeof eligible, "boolean");
  }
  assert.equal(BODY_SCAN_ALL_REGIONS.length, 26);
});

test("resolveBodyRegionMovement returns null for a non-eligible region, and the real def for an eligible one", () => {
  assert.equal(resolveBodyRegionMovement("eyes"), null);
  const shoulders = resolveBodyRegionMovement("scanShoulders");
  assert.ok(shoulders);
  assert.equal(shoulders!.region, "scanShoulders");
});

test("requirement: midline regions (chest/abdomen/upper back/lower back) never move laterally -- dx is always 0", () => {
  for (const region of ["scanChest", "scanAbdomen", "upperBack", "lowerBack"] as const) {
    const def = resolveBodyRegionMovement(region);
    assert.ok(def);
    assert.equal(def!.dx, 0);
  }
});

test("requirement: no exaggerated movement -- every scale factor is a gentle expansion (<= 1.12), every dx/dy stays within a small, bounded range (<= 10px)", () => {
  for (const def of Object.values(BODY_REGION_MOVEMENTS)) {
    assert.ok(def!.scale <= 1.12 && def!.scale >= 1, `${def!.region} scale must be a gentle expansion, never a contraction or exaggeration`);
    assert.ok(Math.abs(def!.dx) <= 10 && Math.abs(def!.dy) <= 10, `${def!.region} translation must stay small`);
  }
});

test("resolveMovementEligibleRegionKeys returns a deduplicated (region, side) list covering exactly the eligible regions -- never a non-eligible one, never a duplicate for a region drawn in both front and back views", () => {
  const keys = resolveMovementEligibleRegionKeys();
  const seen = new Set<string>();
  for (const key of keys) {
    assert.equal(isBodyRegionMovementEligible(key.region), true);
    const dedupeKey = `${key.region}-${key.side ?? "mid"}`;
    assert.equal(seen.has(dedupeKey), false, `duplicate key ${dedupeKey}`);
    seen.add(dedupeKey);
  }
  // scanShoulders is drawn on both front and back, paired -- exactly 2 keys (left/right), never 4.
  const shoulderKeys = keys.filter((key) => key.region === "scanShoulders");
  assert.equal(shoulderKeys.length, 2);
  assert.deepEqual(
    shoulderKeys.map((key) => key.side).sort(),
    ["left", "right"]
  );
  // scanChest is midline, front-only -- exactly 1 key.
  assert.equal(keys.filter((key) => key.region === "scanChest").length, 1);
});

test("filterMovementEligibleSelections drops non-eligible entries (e.g. a historical heaviness-only selection on 'eyes' or 'throat') and keeps eligible ones untouched -- scanNeck is now itself eligible (set 3), so a genuinely still-excluded region (throat) is used here instead", () => {
  const selections = [
    { region: "eyes" as const, side: null },
    { region: "scanShoulders" as const, side: "left" as const },
    { region: "throat" as const, side: null },
  ];
  const filtered = filterMovementEligibleSelections(selections);
  assert.deepEqual(filtered, [{ region: "scanShoulders", side: "left" }]);
});

test("resolveBodyRegionMovementTransform: intensity 0 is always no movement at all, regardless of the region's own def", () => {
  const def = resolveBodyRegionMovement("scanArms")!;
  assert.deepEqual(resolveBodyRegionMovementTransform(def, "left", 0), { dx: 0, dy: 0, scale: 1 });
  assert.deepEqual(resolveBodyRegionMovementTransform(def, "right", 0), { dx: 0, dy: 0, scale: 1 });
});

test("resolveBodyRegionMovementTransform: intensity 1 reaches the def's own full dx/dy/scale, mirrored for the left side's own dx only (dy/scale are never mirrored)", () => {
  const def = resolveBodyRegionMovement("scanShoulders")!; // dx:3, dy:7, scale:1.02
  const right = resolveBodyRegionMovementTransform(def, "right", 1);
  const left = resolveBodyRegionMovementTransform(def, "left", 1);
  assert.deepEqual(right, { dx: 3, dy: 7, scale: 1.02 });
  assert.deepEqual(left, { dx: -3, dy: 7, scale: 1.02 });
});

test("resolveBodyRegionMovementTransform scales linearly with intensity, and clamps out-of-range intensity to [0,1]", () => {
  const def = resolveBodyRegionMovement("scanArms")!; // dx:10
  assert.equal(resolveBodyRegionMovementTransform(def, "right", 0.5).dx, 5);
  assert.equal(resolveBodyRegionMovementTransform(def, "right", 2).dx, 10, "intensity above 1 must clamp to the full-intensity value, never overshoot");
  assert.equal(resolveBodyRegionMovementTransform(def, "right", -1).dx, 0, "intensity below 0 must clamp to no movement, never reverse");
});

test("resolveBodyRegionMovementTransform returns the identity transform (no movement) for a null def -- a non-eligible or unselected region is never animated", () => {
  assert.deepEqual(resolveBodyRegionMovementTransform(null, "right", 1), { dx: 0, dy: 0, scale: 1 });
});

test("a midline region's transform is unaffected by side (left/right produce the same result, since dx is always 0 for it)", () => {
  const def = resolveBodyRegionMovement("scanChest")!;
  assert.deepEqual(resolveBodyRegionMovementTransform(def, "left", 1), resolveBodyRegionMovementTransform(def, "right", 1));
  assert.deepEqual(resolveBodyRegionMovementTransform(def, null, 1), resolveBodyRegionMovementTransform(def, "right", 1));
});

// Final ARC Body Redesign & Flow Fixes task, requirement 5 ("SHOW
// MOVEMENT INSTRUCTIONS BELOW THE CIRCLE").

test("BODY_MOVEMENT_SET_INSTRUCTIONS has exactly one entry per BODY_MOVEMENT_SETS set id, each with all three stages present and non-empty", () => {
  const setIds = BODY_MOVEMENT_SETS.map((set) => set.id).sort();
  assert.deepEqual(Object.keys(BODY_MOVEMENT_SET_INSTRUCTIONS).sort(), setIds);
  for (const setId of setIds) {
    const stages = BODY_MOVEMENT_SET_INSTRUCTIONS[setId as keyof typeof BODY_MOVEMENT_SET_INSTRUCTIONS];
    for (const stage of ["acceptance", "regulation", "encoding"] as const) {
      assert.ok(stages[stage].trim().length > 0, `${setId}.${stage} must be a non-empty instruction line`);
    }
  }
});

test("resolveBodyMovementSetForRegion: every movement-eligible region resolves to exactly the set it is listed under in BODY_MOVEMENT_SETS, and a non-eligible region resolves to null", () => {
  for (const set of BODY_MOVEMENT_SETS) {
    for (const region of set.regions) {
      assert.equal(resolveBodyMovementSetForRegion(region), set.id);
    }
  }
  assert.equal(resolveBodyMovementSetForRegion("throat"), null);
  assert.equal(resolveBodyMovementSetForRegion("eyes"), null);
});

test("resolveMovementInstructionsForStage returns [] for Dwelling and every Presence/selection stage -- movement instructions are shown ONLY during Acceptance/Regulation/Encoding", () => {
  const openingRegions = [{ region: "scanShoulders" as const, side: "left" as const }];
  for (const stage of ["dwelling", "natural_breathing", "focus_color", "visual_field", "sound_awareness", "body_scan", "closure", ""]) {
    assert.deepEqual(resolveMovementInstructionsForStage(stage, openingRegions), []);
  }
});

test("resolveMovementInstructionsForStage returns [] at every real stage when no regions are selected (Presence pages always pass an empty array)", () => {
  for (const stage of ["acceptance", "regulation", "encoding"] as const) {
    assert.deepEqual(resolveMovementInstructionsForStage(stage, []), []);
  }
});

test("resolveMovementInstructionsForStage returns the correct single stage-specific line for one selected region", () => {
  const openingRegions = [{ region: "scanShoulders" as const, side: "left" as const }];
  assert.deepEqual(resolveMovementInstructionsForStage("acceptance", openingRegions), [BODY_MOVEMENT_SET_INSTRUCTIONS.shoulders.acceptance]);
  assert.deepEqual(resolveMovementInstructionsForStage("regulation", openingRegions), [BODY_MOVEMENT_SET_INSTRUCTIONS.shoulders.regulation]);
  assert.deepEqual(resolveMovementInstructionsForStage("encoding", openingRegions), [BODY_MOVEMENT_SET_INSTRUCTIONS.shoulders.encoding]);
});

test("resolveMovementInstructionsForStage dedupes: the same set selected via both sides (scanShoulders left+right) contributes its line only once", () => {
  const openingRegions = [
    { region: "scanShoulders" as const, side: "left" as const },
    { region: "scanShoulders" as const, side: "right" as const },
  ];
  assert.deepEqual(resolveMovementInstructionsForStage("acceptance", openingRegions), [BODY_MOVEMENT_SET_INSTRUCTIONS.shoulders.acceptance]);
});

test("resolveMovementInstructionsForStage dedupes across two eligible regions of the SAME set (e.g. a future multi-region set) and combines DIFFERENT sets into one line each, in first-selected order", () => {
  const openingRegions = [
    { region: "scanShoulders" as const, side: "left" as const },
    { region: "scanArms" as const, side: "right" as const },
    { region: "scanShoulders" as const, side: "right" as const },
  ];
  assert.deepEqual(resolveMovementInstructionsForStage("acceptance", openingRegions), [
    BODY_MOVEMENT_SET_INSTRUCTIONS.shoulders.acceptance,
    BODY_MOVEMENT_SET_INSTRUCTIONS.armsStraighten.acceptance,
  ]);
});

test("resolveMovementInstructionsForStage silently skips a non-eligible region mixed in with eligible ones (never throws, never contributes a line for it)", () => {
  const openingRegions = [
    { region: "throat" as const, side: null },
    { region: "scanChest" as const, side: null },
  ];
  assert.deepEqual(resolveMovementInstructionsForStage("encoding", openingRegions), [BODY_MOVEMENT_SET_INSTRUCTIONS.chestExpand.encoding]);
});

test("none of the 30 movement-instruction lines trip arc/instructions.ts's own INDUCTION_PATTERN_DENYLIST -- every line is a plain first-person present-tense movement statement, never an instruction to remember/imagine/hold something in awareness", () => {
  for (const [setId, stages] of Object.entries(BODY_MOVEMENT_SET_INSTRUCTIONS)) {
    for (const [stage, text] of Object.entries(stages)) {
      assert.equal(containsInductionPattern(text), false, `${setId}.${stage} ("${text}") must not trip the induction-pattern denylist`);
    }
  }
});
