import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyVisualizationSession,
  getNextVisualizationStage,
  getVisualizationStageCopy,
} from "./lifeManifestVisualization.ts";
import type { LifeManifestVisualizationSession, LifeManifestVisualizationStage } from "./lifeManifestVisualization.ts";
import { containsInductionPattern } from "./instructions.ts";
import { createEmptyMajorGoal, createEmptySubGoal } from "./lifeManifest.ts";
import type { MajorGoal, SubGoal } from "./lifeManifest.ts";

const NOW = "2024-01-01T00:00:00.000Z";

function majorGoal(overrides: Partial<MajorGoal> = {}): MajorGoal {
  return { ...createEmptyMajorGoal("mg1", "מטרה גדולה", NOW), ...overrides };
}

function subGoal(overrides: Partial<SubGoal> = {}): SubGoal {
  return { ...createEmptySubGoal("sg1", "תת מטרה", NOW), ...overrides };
}

test("createEmptyVisualizationSession starts with no gratitude choice/scope made", () => {
  const session = createEmptyVisualizationSession();
  assert.equal(session.gratitudeChoice, null);
  assert.equal(session.gratitudeScope, null);
});

// ---------------------------------------------------------------------------
// getNextVisualizationStage: linear order + the one gratitude branch
// ---------------------------------------------------------------------------

test("getNextVisualizationStage walks the full linear order up to the gratitude choice", () => {
  const session = createEmptyVisualizationSession();
  const order: LifeManifestVisualizationStage[] = [
    "observer_perspective",
    "body_language_config",
    "first_person_imagery",
    "achieved_state_mantra",
    "return_to_present",
    "gratitude_choice",
  ];
  for (let i = 0; i < order.length - 1; i++) {
    assert.equal(getNextVisualizationStage(order[i], session), order[i + 1]);
  }
});

test("getNextVisualizationStage keeps gratitude_choice in place until the trainee answers", () => {
  const session = createEmptyVisualizationSession();
  assert.equal(getNextVisualizationStage("gratitude_choice", session), "gratitude_choice");
});

test("getNextVisualizationStage skips both gratitude sub-stages and goes straight to future_process_imagery on 'no'", () => {
  const session: LifeManifestVisualizationSession = { gratitudeChoice: "no", gratitudeScope: null };
  assert.equal(getNextVisualizationStage("gratitude_choice", session), "future_process_imagery");
});

test("getNextVisualizationStage routes to gratitude_present_past only when scope is 'present'", () => {
  const session: LifeManifestVisualizationSession = { gratitudeChoice: "yes", gratitudeScope: "present" };
  assert.equal(getNextVisualizationStage("gratitude_choice", session), "gratitude_present_past");
  assert.equal(getNextVisualizationStage("gratitude_present_past", session), "future_process_imagery");
});

test("getNextVisualizationStage routes to gratitude_future only when scope is 'future'", () => {
  const session: LifeManifestVisualizationSession = { gratitudeChoice: "yes", gratitudeScope: "future" };
  assert.equal(getNextVisualizationStage("gratitude_choice", session), "gratitude_future");
  assert.equal(getNextVisualizationStage("gratitude_future", session), "future_process_imagery");
});

test("getNextVisualizationStage runs both gratitude sub-stages in order when scope is 'both'", () => {
  const session: LifeManifestVisualizationSession = { gratitudeChoice: "yes", gratitudeScope: "both" };
  assert.equal(getNextVisualizationStage("gratitude_choice", session), "gratitude_present_past");
  assert.equal(getNextVisualizationStage("gratitude_present_past", session), "gratitude_future");
  assert.equal(getNextVisualizationStage("gratitude_future", session), "future_process_imagery");
});

test("getNextVisualizationStage continues future_process_imagery -> select_next_action -> complete, and stays at complete", () => {
  const session = createEmptyVisualizationSession();
  assert.equal(getNextVisualizationStage("future_process_imagery", session), "select_next_action");
  assert.equal(getNextVisualizationStage("select_next_action", session), "complete");
  assert.equal(getNextVisualizationStage("complete", session), "complete");
});

// ---------------------------------------------------------------------------
// getVisualizationStageCopy: full Major-Goal run vs. shortened Sub-goal run
// ---------------------------------------------------------------------------

test("getVisualizationStageCopy uses the Major Goal's own title in the full run (subGoal null)", () => {
  const mg = majorGoal({ title: "לרוץ מרתון" });
  const copy = getVisualizationStageCopy("observer_perspective", mg, null);
  assert.match(copy.body, /המטרה הגדולה שלך/);
  assert.doesNotMatch(copy.body, /לרוץ מרתון/); // the sentence itself doesn't need to embed the raw title
});

test("getVisualizationStageCopy uses the Sub-goal's own title in the shortened run (subGoal set)", () => {
  const mg = majorGoal({ title: "לרוץ מרתון" });
  const sg = subGoal({ title: "לרוץ 10 קילומטר" });
  const copy = getVisualizationStageCopy("observer_perspective", mg, sg);
  assert.match(copy.body, /לרוץ 10 קילומטר/);
});

test("getVisualizationStageCopy's body_language_config lists the resolved cue's fields when set", () => {
  const mg = majorGoal({
    embodiedIdentityCue: { posture: "זקוף", facialExpression: "חיוך", movementQuality: null, breathingStyle: null, physicalAnchor: null, regulationAnchor: null },
  });
  const copy = getVisualizationStageCopy("body_language_config", mg, null);
  assert.ok(copy.segments && copy.segments.some((line) => line.includes("זקוף")));
  assert.ok(copy.segments && copy.segments.some((line) => line.includes("חיוך")));
});

test("getVisualizationStageCopy's body_language_config has no segments when no cue fields are set", () => {
  const mg = majorGoal();
  const copy = getVisualizationStageCopy("body_language_config", mg, null);
  assert.equal(copy.segments, null);
});

test("getVisualizationStageCopy's achieved_state_mantra offers to skip when no mantra line resolves", () => {
  const mg = majorGoal();
  const copy = getVisualizationStageCopy("achieved_state_mantra", mg, null);
  assert.match(copy.buttonLabel, /דלג/);
});

test("getVisualizationStageCopy's achieved_state_mantra shows the resolved mantra line when enabled", () => {
  const mg = majorGoal({ achievedStateMantra: { text: "אני רץ מרתון", tense: "present", enabled: true } });
  const copy = getVisualizationStageCopy("achieved_state_mantra", mg, null);
  assert.match(copy.body, /אני רץ מרתון/);
});

test("getVisualizationStageCopy's return_to_present always includes the explicit return line and the breathing/body/environment cue", () => {
  const mg = majorGoal();
  const copy = getVisualizationStageCopy("return_to_present", mg, null);
  assert.match(copy.body, /חזור בהדרגה להווה/);
  assert.ok(copy.segments && copy.segments.some((line) => /נשימה/.test(line)));
});

test("getVisualizationStageCopy's future_process_imagery includes the repeated-action and next-concrete-action prompts", () => {
  const mg = majorGoal();
  const copy = getVisualizationStageCopy("future_process_imagery", mg, null);
  assert.ok(copy.segments && copy.segments.some((line) => /מוטיבציה/.test(line)));
  assert.ok(copy.segments && copy.segments.some((line) => /הצעד הבא/.test(line)));
});

// ---------------------------------------------------------------------------
// Regression: the two new "דמיין" sentences must pass the induction-pattern denylist
// ---------------------------------------------------------------------------

test("the observer_perspective 'דמיין' sentence (full run) does not trip containsInductionPattern", () => {
  const copy = getVisualizationStageCopy("observer_perspective", majorGoal(), null);
  assert.equal(containsInductionPattern(copy.body), false);
});

test("the observer_perspective 'דמיין' sentence (shortened Sub-goal run) does not trip containsInductionPattern", () => {
  const copy = getVisualizationStageCopy("observer_perspective", majorGoal(), subGoal({ title: "תת מטרה" }));
  assert.equal(containsInductionPattern(copy.body), false);
});

test("the first_person_imagery 'דמיין' sentence does not trip containsInductionPattern", () => {
  const copy = getVisualizationStageCopy("first_person_imagery", majorGoal(), null);
  assert.equal(containsInductionPattern(copy.body), false);
});

// ---------------------------------------------------------------------------
// Bug-fix task: getVisualizationStageCopy must never throw on a MajorGoal
// missing embodiedIdentityCue/achievedStateMantra entirely (a legacy
// record predating this task, simulated here the same way
// arc/arcGoals.test.ts simulates a legacy ArcGoal for normalizeArcGoal).
// In production these are backfilled by data/storage.ts's
// loadLifeManifests before this function ever sees them -- this is the
// belt-and-suspenders check that the pure function itself is also safe.
// ---------------------------------------------------------------------------

test("getVisualizationStageCopy never throws when embodiedIdentityCue is completely missing on the Major Goal", () => {
  const legacyGoal = { ...majorGoal(), embodiedIdentityCue: undefined } as unknown as MajorGoal;
  assert.doesNotThrow(() => getVisualizationStageCopy("body_language_config", legacyGoal, null));
  assert.doesNotThrow(() => getVisualizationStageCopy("first_person_imagery", legacyGoal, null));
});

test("getVisualizationStageCopy never throws when achievedStateMantra is completely missing on the Major Goal", () => {
  const legacyGoal = { ...majorGoal(), achievedStateMantra: undefined } as unknown as MajorGoal;
  const copy = getVisualizationStageCopy("achieved_state_mantra", legacyGoal, null);
  assert.match(copy.buttonLabel, /דלג/, "falls back to the same 'nothing configured' skip state as an empty-but-present mantra");
});

test("getVisualizationStageCopy never throws for the shortened Sub-goal run when the Major Goal's shared cue/mantra are both missing", () => {
  const legacyGoal = { ...majorGoal(), embodiedIdentityCue: undefined, achievedStateMantra: undefined } as unknown as MajorGoal;
  const sg = subGoal({ title: "תת מטרה", useSharedEmbodiedCue: true, useSharedAchievedStateMantra: true });
  assert.doesNotThrow(() => getVisualizationStageCopy("observer_perspective", legacyGoal, sg));
  assert.doesNotThrow(() => getVisualizationStageCopy("body_language_config", legacyGoal, sg));
  assert.doesNotThrow(() => getVisualizationStageCopy("achieved_state_mantra", legacyGoal, sg));
});
