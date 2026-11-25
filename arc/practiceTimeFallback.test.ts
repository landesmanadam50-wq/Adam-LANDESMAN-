import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveTimeConstrainedOptions } from "./practiceTimeFallback.ts";

test("resolveTimeConstrainedOptions returns nothing for full-depth practice", () => {
  assert.deepEqual(resolveTimeConstrainedOptions("full"), []);
});

test("resolveTimeConstrainedOptions returns nothing when depth hasn't been decided yet", () => {
  assert.deepEqual(resolveTimeConstrainedOptions(null), []);
});

test("resolveTimeConstrainedOptions offers accept/act-anyway/save-for-later for short-depth practice", () => {
  assert.deepEqual(resolveTimeConstrainedOptions("short"), ["accept", "act_anyway", "save_for_later"]);
});
