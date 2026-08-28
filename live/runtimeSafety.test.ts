/**
 * live/runtimeSafety.test.ts
 *
 * A regression against the actual runtime call chain ARC Thought copy
 * travels through in the real app -- not just arc/instructions.ts in
 * isolation, and not just a hand-built ArcLiveState at the target
 * stage. This walks a session from the real entry point
 * (getFirstArcStage/advanceLiveSession, the same functions
 * live/LiveSessionScreen.tsx calls) down to each ARC Thought stage,
 * then calls arc/stageCopy.ts's getStageCopy with the EXACT signature
 * live/ArcLiveRenderer.tsx uses (stage, profile, session, activeLayers,
 * arcMaps) to get what a trainee would actually see on screen.
 *
 * Background: manual testing on a published build surfaced the exact
 * old unsafe instruction ("החזק בו-זמנית את המודעות ל-X וגם ל-Y").
 * Root cause traced to origin/main's live/stageCopy.ts (the pre-cutover
 * file) still containing that literal bug -- this branch (where the
 * fix actually lives, in arc/stageCopy.ts) was never merged into main
 * (PR #4, open). This file exists so that if the merged/deployed code
 * ever again routes an unsafe string onto this screen, it fails a test
 * that walks the same path a real session walks, not just a targeted
 * unit check of the instruction-generating function.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { getFirstArcStage } from "../arc/arcEngine.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { containsInductionPattern } from "../arc/instructions.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer, TriggerType } from "../arc/types.ts";
import type { ArcMap } from "../arc/buildTypes.ts";
import { advanceLiveSession, applyScaleAnswer, applyTriggerSelection } from "./liveEventAdapter.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    interferingState: "ביקורת עצמית",
    supportiveState: "חמלה",
    stateEncoding: null,
    internalAction: "סריקת גוף",
    desiredIdentity: null,
    identityInterferingEmotion: null,
    identityEncoding: null,
    identityAction: null,
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    ...overrides,
  };
}

/** Walks trigger_selection -> presence_check -> (low presence) -> arc_thought_awareness, exactly as a real session would, via the real adapter. */
function walkToArcThoughtAwareness(
  triggerType: TriggerType,
  p: ArcBuildProfile,
  activeLayers: DevelopmentLayer[]
): { stage: ArcStage; session: ArcLiveState } {
  let stage: ArcStage = getFirstArcStage();
  let session = applyTriggerSelection(createEmptyLiveState(), triggerType);
  ({ stage, session } = advanceLiveSession(stage, session, p, activeLayers)); // -> presence_check

  session = applyScaleAnswer(stage, session, 3); // low presence
  ({ stage, session } = advanceLiveSession(stage, session, p, activeLayers)); // -> arc_thought_awareness
  assert.equal(stage, "arc_thought_awareness", "sanity: low presence must actually enter ARC Thought");
  return { stage, session };
}

const ARC_THOUGHT_STAGES: ArcStage[] = ["arc_thought_awareness", "arc_thought_combined_attention", "arc_thought_expand_presence"];
const TRIGGER_TYPES: TriggerType[] = ["reactive_emotion", "reactive_urge", "proactive"];

for (const triggerType of TRIGGER_TYPES) {
  test(`runtime path (${triggerType}): every ARC Thought screen's real getStageCopy() output is safe, walked from trigger_selection`, () => {
    const p = profile();
    const activeLayers: DevelopmentLayer[] = triggerType === "reactive_urge" ? ["habit"] : ["state"];
    let { stage, session } = walkToArcThoughtAwareness(triggerType, p, activeLayers);

    for (const expectedStage of ARC_THOUGHT_STAGES) {
      assert.equal(stage, expectedStage);
      // The exact call ArcLiveRenderer.tsx makes -- same signature, same args shape.
      const copy = getStageCopy(stage, p, session, activeLayers, []);
      assert.equal(containsInductionPattern(copy.body), false, `${triggerType}/${stage} produced unsafe copy: "${copy.body}"`);
      assert.ok(!copy.body.includes(p.interferingState ?? "\0"), `${triggerType}/${stage} leaked interferingState into ARC Thought copy`);
      assert.ok(!copy.body.includes(p.supportiveState ?? "\0"), `${triggerType}/${stage} leaked supportiveState (Desired State) into ARC Thought copy`);
      ({ stage, session } = advanceLiveSession(stage, session, p, activeLayers));
    }
  });
}

test("the real awareness/combined-attention/expand-presence copy, reached via the real engine walk, matches the corrected Instruction Layer text exactly", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let { stage, session } = walkToArcThoughtAwareness("reactive_emotion", p, activeLayers);

  const expected: Record<string, string> = {
    arc_thought_awareness: "שים לב למה שכבר נמצא עכשיו בתודעה ובגוף שלך.",
    arc_thought_combined_attention: "שים לב למה שכבר נמצא עכשיו בתודעה. במקביל, שים לב לנקודה אחת מולך ולתחושה של הגוף כולו.",
    arc_thought_expand_presence: "הרחב בעדינות את שדה הראייה והעבר יותר תשומת לב לתחושות הגוף.",
  };

  for (const expectedStage of ARC_THOUGHT_STAGES) {
    const copy = getStageCopy(stage, p, session, activeLayers, []);
    assert.equal(copy.body, expected[expectedStage], `${expectedStage} body must be exactly the corrected instruction`);
    ({ stage, session } = advanceLiveSession(stage, session, p, activeLayers));
  }
});

test("an ArcMap's interferingState (BUILD-ARC data, not just the legacy flat field) also never leaks into ARC Thought copy", () => {
  const p = profile({ interferingState: null }); // legacy field empty -- only the ArcMap carries it
  const arcMaps: ArcMap[] = [
    { id: "map1", desiredStateId: "d1", interferingState: "תסכול עמוק", challengeContext: "כשמשהו לא מצליח", preventiveAction: null },
  ];
  const activeLayers: DevelopmentLayer[] = ["habit"];
  let { stage, session } = walkToArcThoughtAwareness("reactive_urge", p, activeLayers);

  for (const expectedStage of ARC_THOUGHT_STAGES) {
    const copy = getStageCopy(stage, p, session, activeLayers, arcMaps);
    assert.equal(containsInductionPattern(copy.body), false);
    assert.ok(!copy.body.includes("תסכול עמוק"), `${expectedStage} must not name the ArcMap's interferingState either`);
    ({ stage, session } = advanceLiveSession(stage, session, p, activeLayers, arcMaps));
  }
});

test("ARC Thought is presence-gated only -- no trigger type is exempt from the safety check (regression: an 'alternate route' must not skip it)", () => {
  const p = profile();
  for (const triggerType of TRIGGER_TYPES) {
    const activeLayers: DevelopmentLayer[] = triggerType === "reactive_urge" ? ["habit"] : ["state"];
    const { stage } = walkToArcThoughtAwareness(triggerType, p, activeLayers);
    assert.equal(stage, "arc_thought_awareness", `${triggerType} must not have an alternate route around ARC Thought`);
  }
});
