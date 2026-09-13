import test from "node:test";
import assert from "node:assert/strict";

import {
  getFirstMiniIdentityStage,
  getMiniIdentityStageCopy,
  getNextMiniIdentityStage,
  resolveMiniIdentityContent,
  resolveMiniIdentityGoalContext,
  resolveMiniIdentitySteps,
} from "./miniIdentity.ts";
import { createEmptyArcBuildProfile, createEmptyArcGoal } from "./types.ts";
import type { ArcBuild, ArcBuildProfile, ArcGoal } from "./types.ts";
import { createEmptyArcGoalSubGoal } from "./subGoalExecution.ts";

function build(profileOverrides: Partial<ArcBuildProfile> = {}): ArcBuild {
  return {
    id: "identity-build-1",
    name: "הזהות שלי",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    needsState: false,
    needsIdentity: true,
    needsHabit: false,
    needsIdentityImmediately: false,
    profile: { ...createEmptyArcBuildProfile(), ...profileOverrides },
  };
}

function fullyConfiguredProfile(): Partial<ArcBuildProfile> {
  return {
    desiredIdentity: "אדם ממושמע ורגוע",
    identityAction: "לצאת לריצה",
    identityEncoding: {
      target: "אדם ממושמע ורגוע",
      bodySensationCue: "חום בחזה",
      breathCue: "נשימה עמוקה",
      bodyLanguageCue: "עמידה זקופה",
      mantra: "אני אדם ממושמע ורגוע",
    },
    identityFutureOrientedMantra: "אני אהיה אדם שממשיך גם כשקשה",
  };
}

function goalWithIdentity(overrides: Partial<ArcGoal> = {}): ArcGoal {
  const goal = createEmptyArcGoal("goal-1", "המטרה שלי", "2026-01-01T00:00:00.000Z");
  goal.identityProtocolId = "identity-build-1";
  goal.goalAction = "לצאת לריצה של 10 דקות";
  return { ...goal, ...overrides };
}

// ---------------------------------------------------------------------------
// Content resolution
// ---------------------------------------------------------------------------

test("resolveMiniIdentityContent resolves every field live from the linked identity build", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()));
  assert.ok(content);
  assert.equal(content!.identityLabel, "אדם ממושמע ורגוע");
  assert.equal(content!.identityMantra, "אני אדם ממושמע ורגוע");
  assert.equal(content!.encodingCue, "חום בחזה");
  assert.equal(content!.bodyLanguageCue, "עמידה זקופה");
  assert.equal(content!.futureMantra, "אני אהיה אדם שממשיך גם כשקשה");
  assert.equal(content!.actionLabel, "לצאת לריצה של 10 דקות");
});

test("required test 13/14: Mini Identity loads the correct goal identity and resolves the correct active sub-goal context", () => {
  const goal = goalWithIdentity();
  const subGoal = createEmptyArcGoalSubGoal(goal.id, 0, "2026-01-01T00:00:00.000Z");
  subGoal.status = "active";
  goal.subGoals = [subGoal];
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()));
  assert.ok(content);
  const context = resolveMiniIdentityGoalContext(goal);
  assert.equal(context.arcGoalId, goal.id);
  assert.equal(context.activeSubGoalId, subGoal.id);
});

test("required test 15: Mini Identity uses one Encoding cue (bodySensationCue, falling back to breathCue when absent)", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build({ ...fullyConfiguredProfile(), identityEncoding: { ...fullyConfiguredProfile().identityEncoding!, bodySensationCue: null } }));
  assert.equal(content!.encodingCue, "נשימה עמוקה");
});

test("required test 16: Mini Identity uses the body-language cue", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()));
  assert.equal(content!.bodyLanguageCue, "עמידה זקופה");
});

test("required test 17: Mini Identity preserves the Future Mantra when configured, and never invents one when absent", () => {
  const goal = goalWithIdentity();
  const withFuture = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()));
  assert.equal(withFuture!.futureMantra, "אני אהיה אדם שממשיך גם כשקשה");

  const withoutFuture = resolveMiniIdentityContent(goal, build({ ...fullyConfiguredProfile(), identityFutureOrientedMantra: null }));
  assert.equal(withoutFuture!.futureMantra, null);
});

test("a configured miniIdentityConfig override wins over the full identity's own fields, independently per field", () => {
  const goal = goalWithIdentity({
    miniIdentityConfig: {
      identityMantraOverride: "מנטרה קצרה משלי",
      encodingCueOverride: null,
      bodyLanguageCueOverride: "כתפיים אחורה",
      futureMantraOverride: null,
      actionImageryDurationSeconds: 8,
    },
  });
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()));
  assert.equal(content!.identityMantra, "מנטרה קצרה משלי");
  assert.equal(content!.bodyLanguageCue, "כתפיים אחורה");
  // Unset overrides still fall back live to the full identity's own fields.
  assert.equal(content!.encodingCue, "חום בחזה");
  assert.equal(content!.actionImageryDurationSeconds, 8);
});

test("required test 30: missing Mini Identity fields (blank cues/mantras) fall back to the full identity, and a genuinely blank field is never invented", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(
    goal,
    build({ desiredIdentity: "זהות", identityAction: null, identityEncoding: null, identityFutureOrientedMantra: null })
  );
  assert.ok(content, "an action still resolves from goal.goalAction even with no identityEncoding at all");
  assert.equal(content!.identityMantra, "");
  assert.equal(content!.encodingCue, "");
  assert.equal(content!.bodyLanguageCue, "");
  assert.equal(content!.futureMantra, null);
});

test("required test 31: missing critical identity/action data returns null -- the safe setup-route signal, never invented content", () => {
  const goalWithNoIdentityBuild = goalWithIdentity();
  assert.equal(resolveMiniIdentityContent(goalWithNoIdentityBuild, null), null);

  const goalWithNoAction = goalWithIdentity({ goalAction: "" });
  const content = resolveMiniIdentityContent(goalWithNoAction, build({ desiredIdentity: "זהות", identityAction: null }));
  assert.equal(content, null);
});

test("required test 32 (backward compatibility): an existing ArcGoal with no miniIdentityConfig at all still resolves safe content live from its full identity", () => {
  const goal = goalWithIdentity();
  delete (goal as { miniIdentityConfig?: unknown }).miniIdentityConfig;
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()));
  assert.ok(content);
  assert.equal(content!.identityMantra, "אני אדם ממושמע ורגוע");
});

// ---------------------------------------------------------------------------
// Stage sequencing
// ---------------------------------------------------------------------------

test("resolveMiniIdentitySteps includes every non-blank step in the required order, always starting at identity_recall and ending at begin_imagery", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()))!;
  const steps = resolveMiniIdentitySteps(content);
  assert.deepEqual(steps, ["identity_recall", "mantra", "encoding_cue", "body_language", "future_mantra", "begin_imagery"]);
});

test("resolveMiniIdentitySteps omits a step whose own content is blank -- e.g. no configured Future Mantra skips that step entirely", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build({ ...fullyConfiguredProfile(), identityFutureOrientedMantra: null }))!;
  const steps = resolveMiniIdentitySteps(content);
  assert.ok(!steps.includes("future_mantra"));
  assert.deepEqual(steps, ["identity_recall", "mantra", "encoding_cue", "body_language", "begin_imagery"]);
});

test("Mini Identity structure never includes emotional-state recognition, Presence, Stay, Acceptance, or full Regulation stages -- the MiniIdentityStage union itself has no such members", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()))!;
  const steps = resolveMiniIdentitySteps(content);
  const forbidden = ["presence", "stay", "acceptance", "regulate", "sensation_check", "recognition"];
  for (const step of steps) {
    assert.ok(!forbidden.includes(step));
  }
});

test("getFirstMiniIdentityStage/getNextMiniIdentityStage walk the resolved sequence linearly, returning null after the last step", () => {
  const steps: ReturnType<typeof resolveMiniIdentitySteps> = ["identity_recall", "mantra", "begin_imagery"];
  assert.equal(getFirstMiniIdentityStage(), "identity_recall");
  assert.equal(getNextMiniIdentityStage("identity_recall", steps), "mantra");
  assert.equal(getNextMiniIdentityStage("mantra", steps), "begin_imagery");
  assert.equal(getNextMiniIdentityStage("begin_imagery", steps), null);
});

test("getMiniIdentityStageCopy never renders undefined/null -- every stage produces a safe string body", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()))!;
  for (const stage of resolveMiniIdentitySteps(content)) {
    const copy = getMiniIdentityStageCopy(stage, content);
    assert.equal(typeof copy.title, "string");
    assert.equal(typeof copy.body, "string");
    assert.ok(copy.title.length > 0);
  }
});

test("begin_imagery's own copy names the real goal action, never a placeholder", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()))!;
  const copy = getMiniIdentityStageCopy("begin_imagery", content);
  assert.ok(copy.body.includes(content.actionLabel));
});

// ---------------------------------------------------------------------------
// Hebrew RTL content (required test 41): every user-facing string here is
// Hebrew.
// ---------------------------------------------------------------------------

test("required test 41: Mini Identity's own titles are Hebrew", () => {
  const goal = goalWithIdentity();
  const content = resolveMiniIdentityContent(goal, build(fullyConfiguredProfile()))!;
  for (const stage of resolveMiniIdentitySteps(content)) {
    const copy = getMiniIdentityStageCopy(stage, content);
    assert.ok(/[֐-׿]/.test(copy.title), `title for ${stage} should contain Hebrew characters`);
  }
});
