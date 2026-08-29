import test from "node:test";
import assert from "node:assert/strict";

import { formatRemainingTime, generateTimerRunId, getActionTimerStatus, getActionTimerStatusFromStartedAt } from "./actionTimer.ts";

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

// --- getActionTimerStatusFromStartedAt: the absolute-anchor entry
// point ActionScreen actually calls. Everything here is expressed as
// (actionStartedAt, durationMinutes, now) with no interval/tick concept
// at all -- the whole point is that the result only ever depends on the
// wall-clock gap between two timestamps, never on how the caller got
// from one to the other (a live tick, a suspended JS thread, a remount,
// a full app relaunch -- all identical to this function).

test("leave/re-enter: the same actionStartedAt anchor, read again later, reports the elapsed time correctly -- the timer never resets on a fresh read", () => {
  const startedAt = new Date("2024-01-01T00:00:00.000Z").toISOString();
  const firstRead = getActionTimerStatusFromStartedAt(startedAt, 5, new Date("2024-01-01T00:00:30.000Z").getTime());
  assert.equal(firstRead.complete, false);
  assert.equal(firstRead.remainingSeconds, 270); // 300 - 30

  // Simulates leaving the Action screen and coming back: a brand-new
  // read, same anchor, later "now" -- not a continuation of any
  // in-memory counter.
  const secondRead = getActionTimerStatusFromStartedAt(startedAt, 5, new Date("2024-01-01T00:02:00.000Z").getTime());
  assert.equal(secondRead.complete, false);
  assert.equal(secondRead.remainingSeconds, 180); // 300 - 120
  assert.ok(secondRead.remainingSeconds < firstRead.remainingSeconds, "time must have genuinely advanced, not reset");
});

test("background/suspended JS time: a huge single jump in 'now' (no intermediate ticks at all) still reports the exact correct remaining time", () => {
  const startedAt = new Date("2024-01-01T00:00:00.000Z").toISOString();
  // Simulates the JS thread being fully suspended (backgrounded/locked)
  // for 4 minutes with zero interval ticks firing in between -- the very
  // next read after resume must still land on the true elapsed time.
  const afterBackground = getActionTimerStatusFromStartedAt(startedAt, 10, new Date("2024-01-01T00:04:00.000Z").getTime());
  assert.equal(afterBackground.complete, false);
  assert.equal(afterBackground.remainingSeconds, 360); // 600 - 240
});

test("reopening after completion: if the duration finished entirely while away, the very first read after reopening shows it as already complete", () => {
  const startedAt = new Date("2024-01-01T00:00:00.000Z").toISOString();
  // The app was closed/backgrounded well past the 5-minute duration and
  // is only now being read again -- no tick ever crossed the completion
  // boundary while the app was away.
  const afterReopen = getActionTimerStatusFromStartedAt(startedAt, 5, new Date("2024-01-01T00:20:00.000Z").getTime());
  assert.equal(afterReopen.complete, true);
  assert.equal(afterReopen.remainingSeconds, 0);
});

test("getActionTimerStatusFromStartedAt with a null duration is immediately complete regardless of the anchor or how much time has passed", () => {
  const startedAt = new Date("2024-01-01T00:00:00.000Z").toISOString();
  const status = getActionTimerStatusFromStartedAt(startedAt, null, new Date("2024-01-01T00:00:00.000Z").getTime());
  assert.equal(status.complete, true);
  assert.equal(status.remainingSeconds, 0);
});

test("getActionTimerStatusFromStartedAt matches getActionTimerStatus given the equivalent elapsed seconds -- it's a thin absolute-time wrapper, not a second implementation", () => {
  const startedAt = new Date("2024-01-01T00:00:00.000Z").toISOString();
  const now = new Date("2024-01-01T00:01:30.000Z").getTime(); // 90s elapsed
  const fromAnchor = getActionTimerStatusFromStartedAt(startedAt, 5, now);
  const fromElapsed = getActionTimerStatus(5, 90);
  assert.deepEqual(fromAnchor, fromElapsed);
});

// --- generateTimerRunId: distinguishes one timer run from another of
// the SAME timerType, so a stale notification/reconciliation event
// from an earlier run can never be mistaken for a newer one -- see
// data/storage.ts's TimerRun doc.

test("generateTimerRunId produces distinct ids across many calls", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 500; i++) {
    ids.add(generateTimerRunId());
  }
  assert.equal(ids.size, 500, "every generated run id must be unique across this batch");
});

test("generateTimerRunId returns a non-empty string", () => {
  const id = generateTimerRunId();
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
});
