import test from "node:test";
import assert from "node:assert/strict";
import { getSuccessFocusReinforcement } from "./reinforcement.ts";

test("reinforcement text includes the extra minutes", () => {
  assert.equal(getSuccessFocusReinforcement(10), "מעולה — לא רק התחלת, המשכת עוד 10 דקות.");
});

test("reinforcement text includes zero minutes too", () => {
  assert.ok(getSuccessFocusReinforcement(0).includes("0"));
});
