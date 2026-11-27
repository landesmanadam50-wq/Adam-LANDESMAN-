import test from "node:test";
import assert from "node:assert/strict";
import { createAddictionProfile } from "./arcAddiction.ts";
import {
  ACCEPTANCE_ARC_STEPS,
  advanceArcState,
  backArcState,
  createAddictionArcState,
  EFFICACY_ARC_STEPS,
  getArcStepCopy,
  getCurrentArcStep,
  resolveArcCircleRegions,
  resolveCircleStage,
  setArcRating,
  setArcSupportive,
  setArcText,
  toggleArcMarkedArea,
  toggleArcReaction,
} from "./arcAddictionArc.ts";
import type { AddictionArcState } from "./arcAddictionArc.ts";

const NOW = "2026-11-27T10:00:00.000Z";
const profile = createAddictionProfile("p1", { name: "חיטוט באוזניים", urgeSensation: "עקצוץ", urgeBodyAreas: [{ region: "ears", side: null }] }, NOW);

function walk(state: AddictionArcState, hasSuccessMemory: boolean): string[] {
  const visited = [getCurrentArcStep(state)];
  let current: AddictionArcState | null = state;
  while ((current = advanceArcState(current, { hasSuccessMemory }))) visited.push(getCurrentArcStep(current));
  return visited;
}

test("efficacy ARC is a full ARC: presence, body, urge acceptance, dwelling, acceptance, supportive, regulation, encoding, rating", () => {
  const visited = walk(createAddictionArcState("efficacy", profile, NOW), true);
  assert.deepEqual(visited, [...EFFICACY_ARC_STEPS]);
});

test("efficacy ARC skips the success-memory step when there is no memory", () => {
  const visited = walk(createAddictionArcState("efficacy", profile, NOW), false);
  assert.ok(!visited.includes("success_memory"));
  assert.equal(visited.length, EFFICACY_ARC_STEPS.length - 1);
});

test("self-acceptance ARC is a FULL ARC (not just a message): body work, thought acceptance, dwelling, acceptance, regulation, encoding", () => {
  const visited = walk(createAddictionArcState("acceptance", profile, NOW), false);
  assert.deepEqual(visited, [...ACCEPTANCE_ARC_STEPS]);
  for (const step of ["presence", "body_mark", "thought_acceptance", "dwelling", "acceptance", "supportive_select", "regulation", "encoding"]) {
    assert.ok(visited.includes(step as never), step);
  }
});

test("experiential steps are rendered by the existing ArcBodyMantraCircle stages", () => {
  assert.equal(resolveCircleStage("presence"), "natural_breathing");
  assert.equal(resolveCircleStage("urge_acceptance"), "urge_acceptance");
  assert.equal(resolveCircleStage("thought_acceptance"), "thought_acceptance");
  assert.equal(resolveCircleStage("dwelling"), "dwelling");
  assert.equal(resolveCircleStage("acceptance"), "acceptance");
  assert.equal(resolveCircleStage("regulation"), "regulation");
  assert.equal(resolveCircleStage("encoding"), "encoding");
  assert.equal(resolveCircleStage("body_mark"), null);
});

test("efficacy ARC is pre-filled with the profile's urge areas; acceptance ARC starts empty", () => {
  assert.deepEqual(createAddictionArcState("efficacy", profile, NOW).markedAreas, [{ region: "ears", side: null }]);
  assert.deepEqual(createAddictionArcState("acceptance", profile, NOW).markedAreas, []);
});

test("back never goes before the first step", () => {
  const s = createAddictionArcState("efficacy", profile, NOW);
  assert.equal(backArcState(s, { hasSuccessMemory: false }), s);
  const second = advanceArcState(s, { hasSuccessMemory: false })!;
  assert.equal(backArcState(second, { hasSuccessMemory: false }).stepIndex, 0);
});

test("ratings outside 0..10 are rejected; null clears", () => {
  const s = createAddictionArcState("efficacy", profile, NOW);
  assert.equal(setArcRating(s, "efficacyRating", 10).efficacyRating, 10);
  assert.equal(setArcRating(s, "efficacyRating", 0).efficacyRating, 0);
  assert.equal(setArcRating(s, "efficacyRating", 11).efficacyRating, null);
  assert.equal(setArcRating(s, "efficacyRating", -1).efficacyRating, null);
  assert.equal(setArcRating(setArcRating(s, "efficacyRating", 5), "efficacyRating", null).efficacyRating, null);
});

test("toggles and text setters", () => {
  let s = createAddictionArcState("acceptance", profile, NOW);
  s = toggleArcMarkedArea(s, "scanChest", null);
  s = toggleArcReaction(toggleArcReaction(s, "בושה"), "אשמה");
  s = toggleArcReaction(s, "בושה");
  s = setArcText(s, "criticalThought", "x".repeat(900));
  assert.deepEqual(s.markedAreas, [{ region: "scanChest", side: null }]);
  assert.deepEqual(s.reactions, ["אשמה"]);
  assert.equal(s.criticalThought.length, 500);
});

test("copy names the user's own sensation, areas and critical thought", () => {
  let s = createAddictionArcState("efficacy", profile, NOW);
  s = { ...s, stepIndex: EFFICACY_ARC_STEPS.indexOf("body_mark") };
  assert.match(getArcStepCopy(s, profile).primary, /עקצוץ/);
  s = { ...s, stepIndex: EFFICACY_ARC_STEPS.indexOf("dwelling") };
  assert.match(getArcStepCopy(s, profile).primary, /באוזניים/);
  let a = setArcText(createAddictionArcState("acceptance", profile, NOW), "criticalThought", "אני חלש");
  a = { ...a, stepIndex: ACCEPTANCE_ARC_STEPS.indexOf("thought_acceptance") };
  assert.ok(getArcStepCopy(a, profile).supporting.some((line) => line.includes("אני חלש")));
});

test("acceptance encoding is unconditional self-acceptance; efficacy encoding is capacity to bear", () => {
  const a = { ...createAddictionArcState("acceptance", profile, NOW), stepIndex: ACCEPTANCE_ARC_STEPS.indexOf("encoding") };
  assert.equal(getArcStepCopy(a, profile).primary, "אני מקבל את עצמי גם עכשיו.");
  const e = { ...createAddictionArcState("efficacy", profile, NOW), stepIndex: EFFICACY_ARC_STEPS.indexOf("encoding") };
  assert.equal(getArcStepCopy(e, profile).primary, "אני מסוגל לשאת את התחושה הזו.");
});

test("acceptance copy explains why self-criticism feeds the next urge", () => {
  const a = { ...createAddictionArcState("acceptance", profile, NOW), stepIndex: ACCEPTANCE_ARC_STEPS.indexOf("understanding") };
  assert.match(getArcStepCopy(a, profile).primary, /ביקורת עצמית/);
  assert.match(getArcStepCopy(a, profile).primary, /הדחף הבא/);
});

test("every step of both ARCs has copy", () => {
  for (const kind of ["efficacy", "acceptance"] as const) {
    const steps = kind === "efficacy" ? EFFICACY_ARC_STEPS : ACCEPTANCE_ARC_STEPS;
    steps.forEach((_, index) => {
      const copy = getArcStepCopy({ ...createAddictionArcState(kind, profile, NOW), stepIndex: index }, profile);
      assert.ok(copy.title.length > 0 && copy.primary.length > 0, `${kind}#${index}`);
    });
  }
});

test("circle regions: marked areas red, supportive anchor blue (never both)", () => {
  let s = createAddictionArcState("efficacy", profile, NOW);
  s = setArcSupportive(s, { region: "ears", side: null, label: "רוגע", movementLabel: null, usageId: null });
  s = toggleArcMarkedArea(s, "scanJaw", null);
  const regions = resolveArcCircleRegions(s);
  assert.deepEqual(regions.contractionRegions, [{ region: "scanJaw", side: null }]);
  assert.deepEqual(regions.openingRegions, [{ region: "ears", side: null, role: "opening_and_supportive" }]);
});
