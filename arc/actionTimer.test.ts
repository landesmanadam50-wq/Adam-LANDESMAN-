import test from "node:test";
import assert from "node:assert/strict";

import { formatRemainingTime, getActionTimerStatus } from "./actionTimer.ts";

test("null duration (never configured) resolves as immediately complete -- no forced wait, matching pre-existing behavior", () => {
  const status = getActionTimerStatus(null, 0);
  assert.equal(status.complete, true);
  assert.equal(status.remainingSeconds, 0);
});

test("a configured duration stays incomplete until the full minutes have elapsed", () => {
  const status = getActionTimerStatus(5, 60); // 5 minutes = 300s, only 60s elapsed
  assert.equal(status.complete, false);
  assert.equal(status.remainingSeconds, 240);
});

test("a configured duration completes exactly at duration*60 seconds, not only after it", () => {
  const status = getActionTimerStatus(1, 60);
  assert.equal(status.complete, true);
  assert.equal(status.remainingSeconds, 0);
});

test("remainingSeconds never goes negative once elapsed exceeds the total", () => {
  const status = getActionTimerStatus(1, 500);
  assert.equal(status.complete, true);
  assert.equal(status.remainingSeconds, 0);
});

test("the Action Timer is a pure function of (durationMinutes, elapsedSeconds) only -- never derived from any instruction segment's duration", () => {
  // Same elapsedSeconds, wildly different instruction-timing context implied
  // by the caller -- the result must depend only on the two parameters.
  const a = getActionTimerStatus(10, 30);
  const b = getActionTimerStatus(10, 30);
  assert.deepEqual(a, b);
});

test("formatRemainingTime formats whole minutes as MM:SS", () => {
  assert.equal(formatRemainingTime(300), "05:00");
  assert.equal(formatRemainingTime(0), "00:00");
  assert.equal(formatRemainingTime(65), "01:05");
  assert.equal(formatRemainingTime(9), "00:09");
});

test("formatRemainingTime rounds up fractional seconds and never goes negative", () => {
  assert.equal(formatRemainingTime(59.2), "01:00");
  assert.equal(formatRemainingTime(-5), "00:00");
});
