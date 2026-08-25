/**
 * engine/thresholds.ts
 *
 * Default tunable parameters (spec calls these out explicitly as
 * "not hardcoded rules" — §Presence 6, §10-5-3). Kept in one place so
 * a future coach dashboard can override per-trainee without touching
 * arcEngine.ts.
 */

import type { IntensityThresholds } from "./types.ts";

export const DEFAULT_PRESENCE_THRESHOLD = 6;

export const DEFAULT_INTENSITY_THRESHOLDS: IntensityThresholds = {
  stayMin: 8, // 8-10 -> Stay + Breath Awareness
  regulateMin: 4, // 4-7 -> Regulation
  encodeMax: 3, // 1-3 -> Encoding + Action
};

export type IntensityBand = "stay" | "regulate" | "encode";

/** Pure function: given an intensity level and thresholds, which band are we in? */
export function getIntensityBand(
  intensityLevel: number,
  thresholds: IntensityThresholds = DEFAULT_INTENSITY_THRESHOLDS
): IntensityBand {
  if (intensityLevel >= thresholds.stayMin) return "stay";
  if (intensityLevel >= thresholds.regulateMin) return "regulate";
  return "encode";
}
