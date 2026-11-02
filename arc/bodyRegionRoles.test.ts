import test from "node:test";
import assert from "node:assert/strict";
import {
  BODY_REGIONS,
  BODY_REGION_LABELS,
  bodyRegionHasRole,
  createBodyRegionConfig,
  resolveBodyRegionConfigsForRole,
  resolveBodyRegionDisplayLabel,
  resolveBodyRegionMovementLine,
} from "./bodyRegionRoles.ts";
import type { BodyRegionConfig } from "./bodyRegionRoles.ts";

test("BODY_REGIONS has exactly the 12 spec-named regions, each with a non-empty Hebrew label", () => {
  assert.equal(BODY_REGIONS.length, 12);
  assert.equal(new Set(BODY_REGIONS).size, 12, "no duplicate regions");
  for (const region of BODY_REGIONS) {
    const label = BODY_REGION_LABELS[region];
    assert.ok(typeof label === "string" && label.length > 0, `missing label for ${region}`);
  }
});

test("createBodyRegionConfig starts with no roles assigned and no movement text", () => {
  const config = createBodyRegionConfig("chest", 0);
  assert.equal(config.region, "chest");
  assert.deepEqual(config.roles, []);
  assert.equal(config.movementText, null);
  assert.equal(config.customLabel, null);
  assert.equal(config.order, 0);
});

test("a single region can carry both roles at once -- the product spec's own explicit allowance", () => {
  const config: BodyRegionConfig = { region: "chest", customLabel: null, roles: ["sensationAndOpening", "supportive"], movementText: "פתיחה עדינה", order: 0 };
  assert.equal(bodyRegionHasRole(config, "sensationAndOpening"), true);
  assert.equal(bodyRegionHasRole(config, "supportive"), true);
});

test("bodyRegionHasRole never infers a role from position/order -- only from the explicit roles array", () => {
  const config: BodyRegionConfig = { region: "hands", customLabel: null, roles: ["supportive"], movementText: null, order: 0 };
  assert.equal(bodyRegionHasRole(config, "supportive"), true);
  assert.equal(bodyRegionHasRole(config, "sensationAndOpening"), false);
});

test("resolveBodyRegionConfigsForRole returns only the matching regions, in the trainee's own BUILD selection order", () => {
  const configs: BodyRegionConfig[] = [
    { region: "hands", customLabel: null, roles: ["supportive"], movementText: null, order: 2 },
    { region: "chest", customLabel: null, roles: ["sensationAndOpening"], movementText: null, order: 0 },
    { region: "back", customLabel: null, roles: ["supportive"], movementText: null, order: 1 },
  ];
  const supportive = resolveBodyRegionConfigsForRole(configs, "supportive");
  assert.deepEqual(supportive.map((c) => c.region), ["back", "hands"]);

  const sensation = resolveBodyRegionConfigsForRole(configs, "sensationAndOpening");
  assert.deepEqual(sensation.map((c) => c.region), ["chest"]);
});

test("resolveBodyRegionConfigsForRole never mutates the input array", () => {
  const configs: BodyRegionConfig[] = [{ region: "chest", customLabel: null, roles: ["supportive"], movementText: null, order: 0 }];
  const originalLength = configs.length;
  resolveBodyRegionConfigsForRole(configs, "supportive");
  assert.equal(configs.length, originalLength);
});

test("resolveBodyRegionDisplayLabel uses the fixed Hebrew label for a named region", () => {
  const config = createBodyRegionConfig("shoulders", 0);
  assert.equal(resolveBodyRegionDisplayLabel(config), "כתפיים");
});

test("resolveBodyRegionDisplayLabel uses the trainee's own custom label for 'other', falling back to the fixed label when blank", () => {
  const withCustom: BodyRegionConfig = { region: "other", customLabel: "המותניים", roles: [], movementText: null, order: 0 };
  assert.equal(resolveBodyRegionDisplayLabel(withCustom), "המותניים");

  const withoutCustom: BodyRegionConfig = { region: "other", customLabel: "   ", roles: [], movementText: null, order: 0 };
  assert.equal(resolveBodyRegionDisplayLabel(withoutCustom), "אזור אחר");
});

test("resolveBodyRegionMovementLine returns null when no region carries the given role -- the gate every stageCopy caller relies on to stay unaffected for a legacy build", () => {
  assert.equal(resolveBodyRegionMovementLine([], "sensationAndOpening"), null);
  const configs: BodyRegionConfig[] = [{ region: "chest", customLabel: null, roles: ["supportive"], movementText: null, order: 0 }];
  assert.equal(resolveBodyRegionMovementLine(configs, "sensationAndOpening"), null);
});

test("resolveBodyRegionMovementLine joins every matching region's display label, in BUILD selection order, and collects only non-blank movement texts", () => {
  const configs: BodyRegionConfig[] = [
    { region: "hands", customLabel: null, roles: ["supportive"], movementText: "פתיחה הדרגתית", order: 1 },
    { region: "chest", customLabel: null, roles: ["supportive"], movementText: null, order: 0 },
    { region: "back", customLabel: null, roles: ["supportive"], movementText: "   ", order: 2 },
  ];
  const result = resolveBodyRegionMovementLine(configs, "supportive");
  assert.ok(result);
  assert.equal(result.regionLabels, "חזה, כפות ידיים, גב");
  assert.deepEqual(result.movementTexts, ["פתיחה הדרגתית"]);
});
