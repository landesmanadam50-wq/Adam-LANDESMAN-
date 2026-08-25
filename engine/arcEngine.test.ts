import test from "node:test";
import assert from "node:assert/strict";
import type { ArcProfile } from "./types.ts";
import { LiveStage, createEmptyLiveSession } from "./types.ts";
import { getNextStage, getFirstStage } from "./arcEngine.ts";
import { DEFAULT_PRESENCE_THRESHOLD, DEFAULT_INTENSITY_THRESHOLDS } from "./thresholds.ts";
import { getBeneficialActionReinforcement } from "./reinforcement.ts";

function baseProfile(overrides: Partial<ArcProfile> = {}): ArcProfile {
  return {
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
    ...overrides,
  };
}

test("high presence skips all of ARC Thought entirely", () => {
  const profile = baseProfile();
  const session = createEmptyLiveSession();
  session.presenceLevel = 9; // well above threshold of 6

  const next = getNextStage(LiveStage.PresenceCheck, session, profile);
  assert.equal(next, LiveStage.BodyLocation, "should jump straight past ARC Thought");
});

test("low presence enters ARC Thought", () => {
  const profile = baseProfile();
  const session = createEmptyLiveSession();
  session.presenceLevel = 3; // below threshold of 6

  const next = getNextStage(LiveStage.PresenceCheck, session, profile);
  assert.equal(next, LiveStage.ArcThoughtAwareness);
});

test("no preventive action plan skips the preventive action check entirely", () => {
  const profile = baseProfile({ preventiveAction: undefined });
  const session = createEmptyLiveSession();

  const first = getFirstStage(session, profile);
  assert.equal(first, LiveStage.EmotionGate, "should start at EmotionGate, skipping stage 1");
});

test("habit ARC type skips body location", () => {
  const profile = baseProfile({ arcType: "habit" });
  const session = createEmptyLiveSession();
  session.presenceLevel = 9; // skip ARC Thought to isolate the check

  const next = getNextStage(LiveStage.PresenceCheck, session, profile);
  assert.equal(next, LiveStage.IntensityCheck, "should skip BodyLocation for habit ARC");
});

test("high intensity routes to Stay + Breath Awareness, not Regulation or Encoding", () => {
  const profile = baseProfile();
  const session = createEmptyLiveSession();
  session.intensityLevel = 10;

  const next = getNextStage(LiveStage.AcceptanceCheck, session, profile);
  assert.equal(next, LiveStage.StayBreathAwareness);
});

test("mid intensity routes to Regulation only", () => {
  const profile = baseProfile();
  const session = createEmptyLiveSession();
  session.intensityLevel = 5;

  const next = getNextStage(LiveStage.AcceptanceCheck, session, profile);
  assert.equal(next, LiveStage.Regulation);
});

test("low intensity routes straight to Encoding", () => {
  const profile = baseProfile();
  const session = createEmptyLiveSession();
  session.intensityLevel = 2;

  const next = getNextStage(LiveStage.AcceptanceCheck, session, profile);
  assert.equal(next, LiveStage.Encoding);
});

test("Success Focus only appears if the trainee opts in", () => {
  const profile = baseProfile({ interferingAction: undefined });
  const sessionDeclined = createEmptyLiveSession();
  sessionDeclined.wantsSuccessFocus = false;

  const nextDeclined = getNextStage(LiveStage.Reward, sessionDeclined, profile);
  assert.equal(nextDeclined, LiveStage.Finish, "declining Success Focus with no interfering plan should go straight to Finish");

  const sessionAccepted = createEmptyLiveSession();
  sessionAccepted.wantsSuccessFocus = true;

  const nextAccepted = getNextStage(LiveStage.Reward, sessionAccepted, profile);
  assert.equal(nextAccepted, LiveStage.SuccessFocus);
});

test("Interfering Action only appears with a plan AND the trainee opting to use the window (positive-first)", () => {
  const profileWithPlan = baseProfile({
    interferingAction: { description: "גלילה ברשת", allowedMinutes: 10, reductionStage: 1 },
  });

  const sessionNoWindow = createEmptyLiveSession();
  sessionNoWindow.wantsSuccessFocus = false;
  sessionNoWindow.wantsToUseInterferingActionWindow = false;
  assert.equal(
    getNextStage(LiveStage.Reward, sessionNoWindow, profileWithPlan),
    LiveStage.Finish,
    "declining the window should skip straight to Finish even though a plan exists"
  );

  const sessionWithWindow = createEmptyLiveSession();
  sessionWithWindow.wantsSuccessFocus = false;
  sessionWithWindow.wantsToUseInterferingActionWindow = true;
  assert.equal(
    getNextStage(LiveStage.Reward, sessionWithWindow, profileWithPlan),
    LiveStage.InterferingAction
  );
});

test("reinforcement text is specific to the profile's beneficial action", () => {
  const profile = baseProfile();
  const text = getBeneficialActionReinforcement(profile);
  assert.equal(text, "כל הכבוד — לגשת ולפתוח שיחה.");
});
