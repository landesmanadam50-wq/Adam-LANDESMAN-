import test from "node:test";
import assert from "node:assert/strict";

import { recordPositiveMemorySelection, resolveLastSelectedMemoryId } from "./positiveMemorySelectionHistory.ts";

test("resolveLastSelectedMemoryId returns null when nothing was ever recorded for this context/key", () => {
  assert.equal(resolveLastSelectedMemoryId([], "encoding_feeling", "ביטחון"), null);
});

test("recordPositiveMemorySelection upserts by (selectionContext, contextKey) -- at most one entry per scope, never an ever-growing log", () => {
  let history = recordPositiveMemorySelection([], "m1", "encoding_feeling", "ביטחון", "2026-01-01T00:00:00.000Z");
  assert.equal(history.length, 1);
  history = recordPositiveMemorySelection(history, "m2", "encoding_feeling", "ביטחון", "2026-01-02T00:00:00.000Z");
  assert.equal(history.length, 1, "a second selection for the SAME feeling must replace, never append");
  assert.equal(resolveLastSelectedMemoryId(history, "encoding_feeling", "ביטחון"), "m2");
});

test("different contexts/keys never interfere with each other", () => {
  let history = recordPositiveMemorySelection([], "m1", "encoding_feeling", "ביטחון", "2026-01-01T00:00:00.000Z");
  history = recordPositiveMemorySelection(history, "m2", "encoding_feeling", "רוגע", "2026-01-01T00:00:00.000Z");
  history = recordPositiveMemorySelection(history, "m3", "arc_success", "task-1", "2026-01-01T00:00:00.000Z");
  assert.equal(history.length, 3);
  assert.equal(resolveLastSelectedMemoryId(history, "encoding_feeling", "ביטחון"), "m1");
  assert.equal(resolveLastSelectedMemoryId(history, "encoding_feeling", "רוגע"), "m2");
  assert.equal(resolveLastSelectedMemoryId(history, "arc_success", "task-1"), "m3");
});
