/**
 * app/live/demoProfile.ts
 *
 * There's no BUILD/calibration flow yet, so LIVE has nothing real to read
 * an ArcProfile from. This is a stand-in so the LIVE screens are actually
 * navigable end to end — swap it for the trainee's real calibrated
 * profile once BUILD exists.
 */

import type { ArcProfile } from "../engine/types.ts";
import { DEFAULT_PRESENCE_THRESHOLD, DEFAULT_INTENSITY_THRESHOLDS } from "../engine/thresholds.ts";

export const demoProfile: ArcProfile = {
  goal: "ליצור יותר קשרים חברתיים",
  interferingHabit: "הימנעות",
  desiredIdentity: "אומץ",
  interferingState: "פחד",
  supportiveState: "חמלה",
  arcType: "identity",
  actions: {
    internalAction: "סריקת גוף",
    identityAction: "לומר שלום",
    beneficialAction: "לגשת ולפתוח שיחה",
  },
  regulationTool: "נשימה 4-7-8",
  mantra: "אני בטוח כאן",
  presenceThreshold: DEFAULT_PRESENCE_THRESHOLD,
  intensityThresholds: DEFAULT_INTENSITY_THRESHOLDS,
  preventiveAction: {
    description: "לצאת להליכה קצרה",
  },
  interferingAction: {
    description: "גלילה ברשת",
    allowedMinutes: 10,
    reductionStage: 1,
  },
};
