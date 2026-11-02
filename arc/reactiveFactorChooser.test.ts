import test from "node:test";
import assert from "node:assert/strict";

import {
  INTERFERING_FACTOR_CATEGORIES,
  INTERFERING_FACTOR_CATEGORY_LABELS,
  resolveReactiveFactorDestination,
} from "./reactiveFactorChooser.ts";

test("there are exactly 9 categories, each with a Hebrew label, matching the product spec's own list", () => {
  assert.equal(INTERFERING_FACTOR_CATEGORIES.length, 9);
  for (const category of INTERFERING_FACTOR_CATEGORIES) {
    assert.ok(INTERFERING_FACTOR_CATEGORY_LABELS[category].length > 0);
  }
});

test("urge/thought/belief all route to the shared saved-factor chooser, tagged with their own factorKind", () => {
  assert.deepEqual(resolveReactiveFactorDestination("urge"), { kind: "savedFactorChooser", factorKind: "urge" });
  assert.deepEqual(resolveReactiveFactorDestination("thought"), { kind: "savedFactorChooser", factorKind: "thought" });
  assert.deepEqual(resolveReactiveFactorDestination("belief"), { kind: "savedFactorChooser", factorKind: "belief" });
});

test("emotion routes to predefined emotion identification, never straight to a saved chooser or a guessed emotion", () => {
  assert.deepEqual(resolveReactiveFactorDestination("emotion"), { kind: "emotionIdentification" });
});

test("presence/energy/taskTooLarge/externalInterruption each route to their own distinct practical-support destination", () => {
  assert.deepEqual(resolveReactiveFactorDestination("presence"), { kind: "presenceProtocol" });
  assert.deepEqual(resolveReactiveFactorDestination("energy"), { kind: "lowEnergy" });
  assert.deepEqual(resolveReactiveFactorDestination("taskTooLarge"), { kind: "practicalTaskSupport" });
  assert.deepEqual(resolveReactiveFactorDestination("externalInterruption"), { kind: "externalInterruption" });
});

test("'I do not know' routes to the neutral regulation protocol -- never blocking the trainee for lack of an identified factor", () => {
  assert.deepEqual(resolveReactiveFactorDestination("unknown"), { kind: "neutralRegulation" });
});

test("every category has a distinct destination kind from every other category (no accidental collapsing)", () => {
  const kinds = INTERFERING_FACTOR_CATEGORIES.map((category) => JSON.stringify(resolveReactiveFactorDestination(category)));
  assert.equal(new Set(kinds).size, kinds.length);
});
