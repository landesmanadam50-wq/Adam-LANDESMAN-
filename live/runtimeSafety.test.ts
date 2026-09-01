/**
 * live/runtimeSafety.test.ts
 *
 * A regression against the actual runtime call chain ARC Thought copy
 * travels through in the real app -- not just arc/instructions.ts in
 * isolation, and not just a hand-built ArcLiveState at the target
 * stage. This walks a session from the real entry point
 * (getFirstArcStage/getNextArcStage -- the same functions
 * live/LiveSessionScreen.tsx calls) down to each ARC Thought stage,
 * then calls arc/stageCopy.ts's getStageCopy with the exact signature
 * LiveSessionScreen.tsx uses, to get what a trainee would actually see.
 *
 * Background: manual testing on a published build previously surfaced
 * the old unsafe instruction ("החזק בו-זמנית את המודעות ל-X וגם ל-Y")
 * on the (now-retired) engine/-based runtime. This file exists so
 * that if that (or an equivalent) unsafe string is ever reintroduced
 * into the arc/-based runtime, it fails a test that walks the same
 * path a real session walks, not just a targeted check of the
 * instruction function in isolation.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { getFirstArcStage, getNextArcStage } from "../arc/arcEngine.ts";
import { containsInductionPattern } from "../arc/instructions.ts";
import { getStageCopy } from "../arc/stageCopy.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    goal: "להגיב לעצמי בצורה בונה יותר",
    interferingState: "ביקורת עצמית",
    supportiveState: "חמלה",
    challengeContext: "אחרי טעות",
    statePreventiveAction: null,
    stateEncodingRegulationCue: null,
    stateEncoding: null,
    internalAction: "סריקת גוף",
    stateDwellTimes: null,
    desiredIdentity: "אדם רגוע ובוטח",
    identityChallengeContext: null,
    identityInterferingEmotion: null,
    identityPreventiveAction: null,
    identityEncodingRegulationCue: null,
    identityEncoding: null,
    identityAction: null,
    identityDwellTimes: null,
    habit: "לבדוק את הטלפון בכל הפסקה",
    beneficialAction: "לגשת ולפתוח שיחה",
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    negativeActionBaseDurationMinutes: null,
    negativeActionReductionEnabled: true,
    ...overrides,
  };
}

/** Walks a real session from getFirstArcStage, through low presence, into arc_thought_awareness -- exactly as LiveSessionScreen.tsx does via getFirstArcStage/getNextArcStage. */
function walkToArcThoughtAwareness(p: ArcBuildProfile, activeLayers: DevelopmentLayer[]): { stage: ArcStage; state: ArcLiveState } {
  let state: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };
  let stage = getFirstArcStage();

  let iterations = 0;
  while (stage !== "arc_thought_awareness" && iterations < 20) {
    if (stage === "presence_check") {
      state = { ...state, presenceRating: 3 }; // low -- must enter ARC Thought
    }
    const next = getNextArcStage(stage, state, p, activeLayers);
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
    iterations++;
  }
  assert.equal(stage, "arc_thought_awareness", "sanity: low presence must actually enter ARC Thought");
  return { stage, state };
}

const ARC_THOUGHT_STAGES: ArcStage[] = ["arc_thought_awareness", "arc_thought_combined_attention", "arc_thought_expand_presence"];
const LAYER_CONFIGS: DevelopmentLayer[][] = [["state"], ["identity"], ["habit"], ["state", "identity", "habit"]];

for (const activeLayers of LAYER_CONFIGS) {
  test(`runtime path (activeLayers=${activeLayers.join("+")}): every ARC Thought screen's real getStageCopy() output is safe, walked from getFirstArcStage`, () => {
    const p = profile();
    let { stage, state } = walkToArcThoughtAwareness(p, activeLayers);

    for (const expectedStage of ARC_THOUGHT_STAGES) {
      assert.equal(stage, expectedStage);
      // The exact call LiveSessionScreen.tsx makes: getStageCopy(stage, profile, session, activeLayers).
      const copy = getStageCopy(stage, p, state, activeLayers);
      assert.equal(containsInductionPattern(copy.body), false, `${activeLayers}/${stage} produced unsafe copy: "${copy.body}"`);
      assert.ok(!copy.body.includes(p.interferingState ?? " "), `${activeLayers}/${stage} leaked interferingState into ARC Thought copy`);
      assert.ok(!copy.body.includes(p.supportiveState ?? " "), `${activeLayers}/${stage} leaked supportiveState (Desired State) into ARC Thought copy`);
      const next = getNextArcStage(stage, state, p, activeLayers);
      stage = next.stage;
      state = { ...state, loopIterationCount: next.loopIterationCount };
    }
  });
}

test("the real awareness/combined-attention/expand-presence copy, reached via the real engine walk, matches the corrected instruction text exactly", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state", "identity", "habit"];
  let { stage, state } = walkToArcThoughtAwareness(p, activeLayers);

  const expected: Partial<Record<ArcStage, string>> = {
    arc_thought_awareness: "שים לב למה שכבר נמצא עכשיו בתודעה ובגוף שלך.",
    arc_thought_combined_attention:
      "שים לב למה שכבר נמצא עכשיו בתודעה. במקביל, שים לב לנקודה אחת מולך, לצלילים מסביב ולתחושה של הגוף כולו.",
    arc_thought_expand_presence: "הרחב בעדינות את שדה הראייה, אפשר לצלילים להישאר ברקע והעבר יותר תשומת לב לתחושות הגוף.",
  };

  for (const expectedStage of ARC_THOUGHT_STAGES) {
    const copy = getStageCopy(stage, p, state, activeLayers);
    assert.equal(copy.body, expected[expectedStage], `${expectedStage} body must be exactly the corrected instruction`);
    const next = getNextArcStage(stage, state, p, activeLayers);
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
  }
});

test("no persisted ArcLiveState exists to restore a legacy instruction: createEmptyLiveState is always the starting point", () => {
  // LiveSessionScreen.tsx never loads a stored ArcLiveState -- it always
  // calls createEmptyLiveState() fresh (see its useEffect/restart). This
  // test pins that createEmptyLiveState() itself carries no induction
  // pattern in any string field, and that its field set is exactly what
  // is expected -- so there is no vector for a legacy instruction string
  // to survive in session state.
  const state = createEmptyLiveState();
  for (const value of Object.values(state)) {
    if (typeof value === "string") {
      assert.equal(containsInductionPattern(value), false);
    }
  }
  assert.deepEqual(Object.keys(state).sort(), [
    "acceptanceNeeded",
    "acceptanceWillingnessLoopCount",
    "actionImageryCompleted",
    "actionReached",
    "activeTools",
    "arcThoughtCompleted",
    "beneficialActionDurationMinutes",
    "currentArcStage",
    "desiredStateRating",
    "loopIterationCount",
    "negativeActionStarted",
    "plannedActionConfirmed",
    "presenceRating",
    "realActionCompleted",
    "regulationNeeded",
    "regulationReady",
    "selectedAction",
    "selectedActionDuration",
    "selectedIdentity",
    "selectedState",
    "selectedTarget",
    "sensationIntensity",
    "sensationLocation",
    "successFocusExtraMinutes",
    "triggerContext",
    "triggerKnown",
    "triggerType",
    "wantsFutureSuccessFocus",
    "wantsPreventiveAction",
  ]);
});

test("ambient sound appears as a passive anchor in the real Combined Attention/Expand Presence copy, for every activeLayers config and never trips the audit", () => {
  for (const activeLayers of LAYER_CONFIGS) {
    const p = profile();
    let { stage, state } = walkToArcThoughtAwareness(p, activeLayers);
    let next = getNextArcStage(stage, state, p, activeLayers); // -> arc_thought_combined_attention
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };

    const combinedAttentionCopy = getStageCopy(stage, p, state, activeLayers);
    assert.match(combinedAttentionCopy.body, /לצלילים מסביב/, `${activeLayers}: Combined Attention must mention ambient sound as an anchor`);
    assert.equal(containsInductionPattern(combinedAttentionCopy.body), false);

    next = getNextArcStage(stage, state, p, activeLayers); // -> arc_thought_expand_presence
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
    const expansionCopy = getStageCopy(stage, p, state, activeLayers);
    assert.match(expansionCopy.body, /אפשר לצלילים להישאר ברקע/, `${activeLayers}: Expand Presence must let sound stay backgrounded`);
    assert.equal(containsInductionPattern(expansionCopy.body), false);
  }
});

test("a full reactive_emotion session, walked end to end through the real engine, never trips the induction-pattern audit at any stage, and never leaks the Desired State before Encoding", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const activeLayers: DevelopmentLayer[] = ["state", "identity", "habit"];
  let state: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };
  let stage = getFirstArcStage();

  const visited: { stage: ArcStage; body: string }[] = [];
  let iterations = 0;
  while (stage !== "complete" && iterations < 30) {
    if (stage === "presence_check" || stage === "arc_thought_presence_recheck") {
      state = { ...state, presenceRating: 3 }; // stays low -- forces the full ARC Thought path
    }
    if (stage === "sensation_check") {
      // Mid intensity (regulationMinIntensity <= 5 < transitionMinIntensity, per
      // arc/config.ts) routes to "regulate" -- the path this spec adds continuity to.
      state = { ...state, sensationLocation: "חזה", sensationIntensity: 5 };
    }
    if (stage === "accept") {
      state = { ...state, acceptanceNeeded: false };
    }
    if (stage === "act") {
      // Simulates confirming the planned action (the "כן" branch of the
      // Action-choice screen) -- getNextArcStage's act->success_focus
      // transition is unconditional either way, so this only affects
      // which sub-copy getStageCopy renders for this one visit.
      state = { ...state, plannedActionConfirmed: true };
    }

    const copy = getStageCopy(stage, p, state, activeLayers);
    visited.push({ stage, body: copy.body });
    assert.equal(containsInductionPattern(copy.body), false, `${stage} produced unsafe copy: "${copy.body}"`);

    const next = getNextArcStage(stage, state, p, activeLayers);
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
    iterations++;
  }

  assert.ok(visited.some((v) => v.stage === "regulate"), "sanity: the walk must actually reach regulate");
  assert.ok(visited.some((v) => v.stage === "encode"), "sanity: the walk must actually reach encode");

  const beforeEncode = visited.filter((v) => v.stage !== "encode" && v.stage !== "act");
  for (const { stage: s, body } of beforeEncode) {
    assert.ok(!body.includes(p.supportiveState ?? " "), `${s} must not name the Desired State before Encoding: "${body}"`);
  }

  const arcThoughtAndRegulation = visited.filter((v) =>
    ["arc_thought_awareness", "arc_thought_combined_attention", "arc_thought_expand_presence", "regulate", "stay", "accept"].includes(v.stage)
  );
  for (const { stage: s, body } of arcThoughtAndRegulation) {
    assert.ok(!body.includes(p.interferingState ?? " "), `${s} must not name the Interfering State: "${body}"`);
  }

  const encodeCopy = visited.find((v) => v.stage === "encode");
  assert.ok(encodeCopy?.body.includes("כתפיים משוחררות"), "Encoding is where the Desired State's encoding cue is intentionally introduced");

  const actCopy = visited.find((v) => v.stage === "act");
  assert.ok(actCopy?.body.includes("כתפיים משוחררות"), "the act stage's Action Preparation reminder and Action Imagery still carry the same Body-Language Cue, via the real engine walk");
  assert.match(actCopy!.body, /דמיין את עצמך מבצע עכשיו את .*, תוך שמירה על כתפיים משוחררות\./, "Action Imagery names both the resolved action and the same cue");
});

test("a reactive_emotion session targeting the IDENTITY layer (Discipline), walked end to end through the real engine, resolves Discipline's own Body-Language cue and mantra -- never Focus's (state's)", () => {
  // Two independently mapped targets on the same profile -- Focus
  // (state) and Discipline (identity) -- exactly the BUILD-ARC
  // multi-target scenario. This session explicitly targets identity
  // (selectedTarget), the real per-target ARC Map bug's regression.
  const p = profile({
    supportiveState: "מיקוד", // Focus
    desiredIdentity: "משמעת עצמית", // Discipline
    stateEncoding: { target: "מיקוד", bodySensationCue: null, breathCue: null, bodyLanguageCue: "עיניים פקוחות וממוקדות", mantra: "אני ממוקד" },
    identityEncoding: { target: "משמעת עצמית", bodySensationCue: null, breathCue: null, bodyLanguageCue: "שמור את הראש ישר ויציב", mantra: "אני ממושמע בפעולותיי" },
  });
  const activeLayers: DevelopmentLayer[] = ["state", "identity", "habit"];
  let state: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion", selectedTarget: "identity" };
  let stage = getFirstArcStage();

  let iterations = 0;
  while (stage !== "encode" && iterations < 30) {
    if (stage === "presence_check" || stage === "arc_thought_presence_recheck") {
      state = { ...state, presenceRating: 3 };
    }
    if (stage === "sensation_check") {
      state = { ...state, sensationLocation: "חזה", sensationIntensity: 5 }; // routes through regulate
    }
    const next = getNextArcStage(stage, state, p, activeLayers);
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
    iterations++;
  }
  assert.equal(stage, "encode", "sanity: the walk must actually reach encode");

  // The exact call LiveSessionScreen.tsx makes.
  const copy = getStageCopy(stage, p, state, activeLayers);
  assert.match(copy.body, /שמור את הראש ישר ויציב/, "must resolve Discipline's own body-language cue via the real engine/selectedTarget path");
  assert.match(copy.body, /אני ממושמע בפעולותיי/, "must resolve Discipline's own mantra");
  assert.ok(!copy.body.includes("עיניים פקוחות וממוקדות"), "must not leak Focus's (state's) body-language cue");
  assert.ok(!copy.body.includes("אני ממוקד"), "must not leak Focus's (state's) mantra");

  const cueIndex = copy.body.indexOf("שמור את הראש ישר ויציב");
  const mantraIndex = copy.body.indexOf("אני ממושמע בפעולותיי");
  assert.ok(cueIndex >= 0 && mantraIndex >= 0 && cueIndex < mantraIndex, "Discipline's body-language cue must precede its mantra (final corrected sub-order)");
  assert.equal(containsInductionPattern(copy.body), false);

  // Continue the same real walk one more step, into "act" -- Action
  // Imagery there must carry the SAME Discipline cue forward, never
  // Focus's, via the real engine/selectedTarget path (not just a
  // hand-built ArcLiveState).
  const next = getNextArcStage(stage, state, p, activeLayers);
  stage = next.stage;
  state = { ...state, loopIterationCount: next.loopIterationCount };
  assert.equal(stage, "act", "sanity: the walk must continue from encode into act");
  state = { ...state, plannedActionConfirmed: true }; // simulates confirming the planned action ("כן")

  const actCopy = getStageCopy(stage, p, state, activeLayers);
  assert.match(actCopy.body, /תוך שמירה על שמור את הראש ישר ויציב/, "Action Imagery must carry Discipline's own cue, via the real engine walk");
  assert.ok(!actCopy.body.includes("עיניים פקוחות וממוקדות"), "must not leak Focus's cue into Discipline's Action Imagery");
  assert.equal(containsInductionPattern(actCopy.body), false);
});

test("a full proactive session, walked end to end through the real engine, consumes the mapped Desired State/Challenge Context and never requires or references an Interfering State", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const activeLayers: DevelopmentLayer[] = ["state", "identity", "habit"];
  let state: ArcLiveState = { ...createEmptyLiveState(), triggerType: "proactive", selectedTarget: "state" };
  let stage = getFirstArcStage();

  const visited: { stage: ArcStage; body: string }[] = [];
  let iterations = 0;
  while (stage !== "complete" && iterations < 30) {
    if (stage === "presence_check" || stage === "arc_thought_presence_recheck") {
      state = { ...state, presenceRating: 3 }; // forces the ARC Thought path here too
    }
    if (stage === "desired_state_check") {
      state = { ...state, desiredStateRating: 8 }; // >= regulationThreshold (5, per arc/config.ts) -> routes straight to encode
    }

    const copy = getStageCopy(stage, p, state, activeLayers);
    visited.push({ stage, body: copy.body });
    assert.equal(containsInductionPattern(copy.body), false, `${stage} produced unsafe copy: "${copy.body}"`);
    // Proactive never requires or shows Interfering State recognition --
    // that's a reactive_emotion-only mechanism (see getRecognitionPreamble).
    assert.ok(!copy.body.includes(p.interferingState ?? " "), `${stage} must not reference the Interfering State in a proactive session: "${copy.body}"`);

    const next = getNextArcStage(stage, state, p, activeLayers);
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
    iterations++;
  }

  assert.ok(visited.some((v) => v.stage === "desired_state_check"), "sanity: the walk must actually reach desired_state_check");
  assert.ok(visited.some((v) => v.stage === "encode"), "sanity: the walk must actually reach encode");
  assert.ok(!visited.some((v) => v.stage === "sensation_check"), "proactive never routes through the reactive sensation_check stage");

  const desiredStateCopy = visited.find((v) => v.stage === "desired_state_check");
  assert.match(desiredStateCopy!.body, /המטרה: חמלה/, "must name the mapped Desired State -- consuming the mapped data, not a generic question");
  assert.match(desiredStateCopy!.body, /אחרי טעות/, "must reference the mapped Challenge Context for a state-targeted proactive session");

  const encodeCopy = visited.find((v) => v.stage === "encode");
  assert.ok(encodeCopy?.body.includes("כתפיים משוחררות"), "Encoding still intentionally introduces the Desired State's encoding cue in proactive sessions");
});

test("ARC Thought is presence-gated only -- reached the same way regardless of trigger type (no alternate route around the safety check)", () => {
  const activeLayers: DevelopmentLayer[] = ["state", "identity", "habit"];
  for (const triggerType of ["reactive_emotion", "reactive_urge", "proactive"] as const) {
    const p = profile();
    let state: ArcLiveState = { ...createEmptyLiveState(), triggerType };
    let stage = getFirstArcStage();
    let iterations = 0;
    while (stage !== "arc_thought_awareness" && iterations < 20) {
      if (stage === "presence_check") {
        state = { ...state, presenceRating: 3 };
      }
      const next = getNextArcStage(stage, state, p, activeLayers);
      stage = next.stage;
      state = { ...state, loopIterationCount: next.loopIterationCount };
      iterations++;
    }
    assert.equal(stage, "arc_thought_awareness", `triggerType ${triggerType} must not have an alternate route around ARC Thought`);
  }
});

test("a reactive_urge session, walked to 'act' through the real engine, that chooses a session-specific alternative action never leaks the original planned action, and uses the alternative's own duration -- routing stays the same fixed act -> success_focus line", () => {
  const p = profile({
    habit: "גלילה ברשת",
    beneficialAction: "לצאת להליכה של 20 דקות", // the planned/BUILD action
    preventiveAction: null,
    actionDuration: 20,
  });
  const activeLayers: DevelopmentLayer[] = ["habit"];
  let state: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_urge" };
  let stage = getFirstArcStage();

  let iterations = 0;
  while (stage !== "act" && iterations < 30) {
    if (stage === "presence_check") {
      state = { ...state, presenceRating: 8 }; // high presence -- skip ARC Thought
    }
    if (stage === "sensation_check") {
      state = { ...state, sensationIntensity: 2 }; // low intensity -> straight to encode
    }
    const next = getNextArcStage(stage, state, p, activeLayers);
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
    iterations++;
  }
  assert.equal(stage, "act", "sanity: the walk must actually reach act");

  // Before any choice: shows the planned action, not Action Imagery/Preparation.
  const choiceCopy = getStageCopy(stage, p, state, activeLayers);
  assert.match(choiceCopy.body, /הפעולה שתכננת: לצאת להליכה של 20 דקות\./);
  assert.ok(!choiceCopy.body.includes("דמיין"), "no Action Imagery before the choice is resolved");

  // Simulates the "לא" branch: a valid session-specific alternative,
  // with its own duration, entered on the same Action-choice screen.
  state = { ...state, selectedAction: "5 דקות תרגילים בבית", selectedActionDuration: 5 };

  // Routing is unaffected: the engine's act -> success_focus transition
  // is unconditional either way (see arc/arcEngine.test.ts).
  const nextAfterChoice = getNextArcStage(stage, state, p, activeLayers);
  assert.equal(nextAfterChoice.stage, "success_focus");

  const imageryCopy = getStageCopy(stage, p, state, activeLayers);
  assert.match(imageryCopy.body, /דמיין את עצמך מבצע עכשיו את 5 דקות תרגילים בבית\./, "Action Imagery uses the alternative currentAction");
  assert.ok(!imageryCopy.body.includes("לצאת להליכה של 20 דקות"), "the original planned action is never imagined once an alternative is chosen");
  assert.ok(!imageryCopy.body.includes("משך הפעולה"), "the Action Timer's duration is not named yet during Imagery -- it hasn't started");
  assert.equal(containsInductionPattern(imageryCopy.body), false);

  // Imagery -> directly to the actual timed Action (no standalone
  // Preparation phase in between), same currentAction throughout.
  state = { ...state, actionImageryCompleted: true };
  const resolvedCopy = getStageCopy(stage, p, state, activeLayers);
  assert.ok(!resolvedCopy.body.includes("דמיין"), "the actual Action screen no longer shows the Imagery sentence");
  assert.match(resolvedCopy.body, /עכשיו הזמן: 5 דקות תרגילים בבית\./, "the actual Action names the resolved alternative currentAction");
  assert.match(resolvedCopy.body, /משך הפעולה: 5 דקות\./, "the Action Timer uses the alternative's own duration, not the BUILD one");
  assert.equal(containsInductionPattern(resolvedCopy.body), false);

  // The planned/BUILD action itself was never touched.
  assert.equal(p.beneficialAction, "לצאת להליכה של 20 דקות");
});

// Negative Action reduction task: the main routine is always ARC ->
// Success Focus -> completion, walked here through the real engine
// exactly as live/LiveSessionScreen.tsx does -- the optional Negative
// Action Timer is never automatically inserted, regardless of
// activeLayers or whether a negative action is configured/enabled.

test("a reactive_urge session with the habit layer active and Negative Action reduction enabled, walked end to end through the real engine, follows Beneficial Action -> Success Focus -> complete directly -- Negative Action is never automatically inserted", () => {
  const p = profile({
    habit: "גלילה ברשת", // the predefined negative/interfering action
    negativeActionReductionEnabled: true,
    beneficialAction: "לצאת להליכה של 20 דקות",
    preventiveAction: null,
  });
  const activeLayers: DevelopmentLayer[] = ["habit"];
  let state: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_urge" };
  let stage = getFirstArcStage();

  const visitedStages: ArcStage[] = [];
  let iterations = 0;
  while (stage !== "complete" && iterations < 30) {
    visitedStages.push(stage);
    if (stage === "presence_check") state = { ...state, presenceRating: 8 };
    if (stage === "sensation_check") state = { ...state, sensationIntensity: 2 };
    if (stage === "act") {
      // Resolve currentAction (the "כן" branch) and walk through
      // Imagery without stopping -- this test is about stage ORDER,
      // not the act sub-phases (already covered above).
      state = { ...state, plannedActionConfirmed: true, actionImageryCompleted: true };
    }
    if (stage === "success_focus") {
      // Skip the retrospective/future-scheduling sub-flow this test
      // isn't about -- proceed straight through with no future Success
      // Focus scheduled.
      state = { ...state, successFocusExtraMinutes: 0, wantsFutureSuccessFocus: false };
    }
    const next = getNextArcStage(stage, state, p, activeLayers);
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
    iterations++;
  }
  visitedStages.push(stage); // "complete"

  const actIndex = visitedStages.indexOf("act");
  const successFocusIndex = visitedStages.indexOf("success_focus");
  const completeIndex = visitedStages.indexOf("complete");

  assert.ok(actIndex >= 0 && successFocusIndex >= 0 && completeIndex >= 0, "sanity: every stage in the sequence must actually be reached");
  assert.ok(actIndex < successFocusIndex, "Beneficial Action (act) must come before Success Focus");
  assert.ok(successFocusIndex < completeIndex, "Success Focus must come before complete");
  assert.equal(successFocusIndex + 1, completeIndex, "Success Focus must continue DIRECTLY into complete -- no stage (Negative Action included) is ever inserted between them");
  assert.ok(!visitedStages.includes("negative_action"), "must never produce Negative Action automatically after ARC or Success Focus, even with the habit layer active and a negative action configured and enabled");
});

test("success_focus continues straight to complete regardless of activeLayers, habit configuration, or whether Negative Action reduction is enabled -- it is never required to complete the main routine", () => {
  const state: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };
  const cases: Array<{ activeLayers: DevelopmentLayer[]; overrides: Partial<ArcBuildProfile> }> = [
    { activeLayers: ["state"], overrides: { habit: "גלילה ברשת", negativeActionReductionEnabled: true } },
    { activeLayers: ["habit"], overrides: { habit: null, negativeActionReductionEnabled: false } },
    { activeLayers: ["habit"], overrides: { habit: "גלילה ברשת", negativeActionReductionEnabled: false } },
    { activeLayers: ["habit"], overrides: { habit: "גלילה ברשת", negativeActionReductionEnabled: true } },
  ];
  for (const { activeLayers, overrides } of cases) {
    const p = profile(overrides);
    const next = getNextArcStage("success_focus", state, p, activeLayers);
    assert.equal(next.stage, "complete", `activeLayers=${activeLayers.join("+")}, overrides=${JSON.stringify(overrides)}`);
  }
});
