/**
 * live/runtimeSafety.test.ts
 *
 * A regression against the actual runtime call chain ARC Thought copy
 * travels through in the real app -- not just engine/instructions.ts
 * in isolation, and not just a hand-built LiveSession at the target
 * stage. This walks a session from the real entry point
 * (getFirstStage/getNextStage -- the same functions
 * live/LiveSessionScreen.tsx calls) down to each ARC Thought stage,
 * then calls live/stageCopy.ts's getStageCopy with the exact signature
 * LiveSessionScreen.tsx uses, to get what a trainee would actually see.
 *
 * Background: manual testing on a published build surfaced the exact
 * old unsafe instruction ("החזק בו-זמנית את המודעות ל-X וגם ל-Y") in
 * live/stageCopy.ts's ArcThoughtCombinedAttention case. This file
 * exists so that if that (or an equivalent) unsafe string is ever
 * reintroduced, it fails a test that walks the same path a real
 * session walks, not just a targeted check of the instruction
 * function in isolation.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { ArcProfile, ArcType, LiveSession } from "../engine/types.ts";
import { LiveStage, createEmptyLiveSession } from "../engine/types.ts";
import { getFirstStage, getNextStage } from "../engine/arcEngine.ts";
import { DEFAULT_INTENSITY_THRESHOLDS, DEFAULT_PRESENCE_THRESHOLD } from "../engine/thresholds.ts";
import { containsInductionPattern } from "../engine/instructions.ts";
import { getStageCopy } from "./stageCopy.ts";

function profile(overrides: Partial<ArcProfile> = {}): ArcProfile {
  return {
    goal: "לפתח רוגע ובטחון",
    interferingState: "ביקורת עצמית",
    supportiveState: "חמלה",
    arcType: "identity",
    actions: {
      internalAction: "סריקת גוף",
      beneficialAction: "לגשת ולפתוח שיחה",
    },
    regulationTool: "נשימה 4-7-8",
    presenceThreshold: DEFAULT_PRESENCE_THRESHOLD,
    intensityThresholds: DEFAULT_INTENSITY_THRESHOLDS,
    ...overrides,
  };
}

/** Walks a real session from getFirstStage, through low presence, into ArcThoughtAwareness -- exactly as LiveSessionScreen.tsx does via getFirstStage/getNextStage. */
function walkToArcThoughtAwareness(p: ArcProfile): { stage: LiveStage; session: LiveSession } {
  let session: LiveSession = createEmptyLiveSession();
  let stage = getFirstStage(session, p);

  // Walk forward, answering PresenceCheck with a low value the moment we reach it.
  let iterations = 0;
  while (stage !== LiveStage.ArcThoughtAwareness && iterations < 20) {
    if (stage === LiveStage.PresenceCheck) {
      session = { ...session, presenceLevel: 3 }; // low -- must enter ARC Thought
    }
    const next = getNextStage(stage, session, p);
    stage = next;
    iterations++;
  }
  assert.equal(stage, LiveStage.ArcThoughtAwareness, "sanity: low presence must actually enter ARC Thought");
  return { stage, session };
}

const ARC_THOUGHT_STAGES: LiveStage[] = [LiveStage.ArcThoughtAwareness, LiveStage.ArcThoughtCombinedAttention, LiveStage.ArcThoughtExpansion];
const ARC_TYPES: ArcType[] = ["state", "identity", "habit"];

for (const arcType of ARC_TYPES) {
  test(`runtime path (arcType=${arcType}): every ARC Thought screen's real getStageCopy() output is safe, walked from getFirstStage`, () => {
    const p = profile({ arcType });
    let { stage, session } = walkToArcThoughtAwareness(p);

    for (const expectedStage of ARC_THOUGHT_STAGES) {
      assert.equal(stage, expectedStage);
      // The exact call LiveSessionScreen.tsx makes: const copy = getStageCopy(stage, profile);
      const copy = getStageCopy(stage, p);
      assert.equal(containsInductionPattern(copy.body), false, `${arcType}/${stage} produced unsafe copy: "${copy.body}"`);
      assert.ok(!copy.body.includes(p.interferingState), `${arcType}/${stage} leaked interferingState into ARC Thought copy`);
      assert.ok(!copy.body.includes(p.supportiveState), `${arcType}/${stage} leaked supportiveState (Desired State) into ARC Thought copy`);
      stage = getNextStage(stage, session, p);
    }
  });
}

test("the real awareness/combined-attention/expand-presence copy, reached via the real engine walk, matches the corrected instruction text exactly", () => {
  const p = profile();
  let { stage, session } = walkToArcThoughtAwareness(p);

  const expected: Partial<Record<LiveStage, string>> = {
    [LiveStage.ArcThoughtAwareness]: "שים לב למה שכבר נמצא עכשיו בתודעה ובגוף שלך.",
    [LiveStage.ArcThoughtCombinedAttention]:
      "שים לב למה שכבר נמצא עכשיו בתודעה. במקביל, שים לב לנקודה אחת מולך, לצלילים מסביב ולתחושה של הגוף כולו.",
    [LiveStage.ArcThoughtExpansion]: "הרחב בעדינות את שדה הראייה, אפשר לצלילים להישאר ברקע והעבר יותר תשומת לב לתחושות הגוף.",
  };

  for (const expectedStage of ARC_THOUGHT_STAGES) {
    const copy = getStageCopy(stage, p);
    assert.equal(copy.body, expected[expectedStage], `${expectedStage} body must be exactly the corrected instruction`);
    stage = getNextStage(stage, session, p);
  }
});

test("no persisted LiveSession exists to restore a legacy instruction: createEmptyLiveSession is always the starting point", () => {
  // LiveSessionScreen.tsx never loads a stored LiveSession -- it always
  // calls createEmptyLiveSession() fresh (see its useEffect/restart).
  // This test pins that createEmptyLiveSession() itself carries no
  // stage or copy -- only rating/answer fields -- so there is no
  // vector for a legacy instruction string to survive in session state.
  const session = createEmptyLiveSession();
  const values = Object.values(session);
  for (const value of values) {
    if (typeof value === "string") {
      assert.equal(containsInductionPattern(value), false);
    }
  }
  assert.deepEqual(Object.keys(session).sort(), [
    "bodyLocation",
    "hasRelevantEmotionOrUrge",
    "intensityLevel",
    "needsAcceptance",
    "presenceLevel",
    "wantsPreventiveActionNow",
    "wantsSuccessFocus",
    "wantsToUseInterferingActionWindow",
  ]);
});

test("ambient sound appears as a passive anchor in the real Combined Attention/Expand Presence copy, for every arcType and never trips the audit", () => {
  for (const arcType of ARC_TYPES) {
    const p = profile({ arcType });
    let { stage, session } = walkToArcThoughtAwareness(p);
    stage = getNextStage(stage, session, p); // -> ArcThoughtCombinedAttention

    const combinedAttentionCopy = getStageCopy(stage, p);
    assert.match(combinedAttentionCopy.body, /לצלילים מסביב/, `${arcType}: Combined Attention must mention ambient sound as an anchor`);
    assert.equal(containsInductionPattern(combinedAttentionCopy.body), false);

    stage = getNextStage(stage, session, p); // -> ArcThoughtExpansion
    const expansionCopy = getStageCopy(stage, p);
    assert.match(expansionCopy.body, /אפשר לצלילים להישאר ברקע/, `${arcType}: Expand Presence must let sound stay backgrounded`);
    assert.equal(containsInductionPattern(expansionCopy.body), false);
  }
});

test("ARC Thought is presence-gated only -- every arcType reaches it the same way (no alternate route around the safety check)", () => {
  for (const arcType of ARC_TYPES) {
    const p = profile({ arcType });
    const { stage } = walkToArcThoughtAwareness(p);
    assert.equal(stage, LiveStage.ArcThoughtAwareness, `arcType ${arcType} must not have an alternate route around ARC Thought`);
  }
});
