import test from "node:test";
import assert from "node:assert/strict";
import { createAddictionEpisode, createAddictionProfile } from "./arcAddiction.ts";
import type { AddictionEpisode } from "./arcAddiction.ts";
import { buildAddictionHistoryRows, computeAddictionProfileStats, projectChartPoints } from "./arcAddictionStats.ts";

const profile = createAddictionProfile("p1", { name: "x", initialWaitMinutes: 2 }, "2026-11-01T00:00:00.000Z");

function episode(id: string, day: number, opts: Partial<AddictionEpisode> & { waitedMin?: number; early?: boolean; notAct?: number } = {}): AddictionEpisode {
  const start = `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`;
  const startMs = Date.parse(start);
  const waited = opts.waitedMin ?? 2;
  const base = createAddictionEpisode(id, profile, null, start);
  const rounds = Array.from({ length: Math.max(1, opts.notAct ?? 1) }, () => ({
    startedAt: start,
    targetMinutes: 2,
    endsAt: new Date(startMs + 2 * 60_000).toISOString(),
    endedEarlyAt: opts.early ? new Date(startMs + waited * 60_000).toISOString() : null,
    elapsedAt: opts.early ? null : new Date(startMs + 2 * 60_000).toISOString(),
    answeredAt: new Date(startMs + 2 * 60_000).toISOString(),
    choice: (opts.outcome === "acted" ? "act" : "not_act") as "act" | "not_act",
    intensityAfter: 3,
  }));
  return { ...base, waitRounds: rounds.slice(0, 1), outcome: "resisted", endedAt: new Date(startMs + 10 * 60_000).toISOString(), ...opts };
}

test("only closed episodes of the profile count", () => {
  const open = { ...episode("open", 2), outcome: null, endedAt: null };
  const other = { ...episode("other", 2), profileId: "p2" };
  const stats = computeAddictionProfileStats([open, other, episode("e", 3)], "p1", "2026-11-27T00:00:00.000Z");
  assert.equal(stats.totalPractices, 1);
});

test("wait time and behavior duration are separate series", () => {
  const acted = { ...episode("a", 3, { early: true, waitedMin: 1 }), outcome: "acted" as const, behavior: { durationMinutes: 12, loggedRetrospectively: true, stopwatchStartedAt: null, loggedAt: "" } };
  const resisted = episode("r", 4);
  const stats = computeAddictionProfileStats([acted, resisted], "p1", "2026-11-27T00:00:00.000Z");
  assert.deepEqual(stats.waitMinutes.map((p) => p.value), [1, 2]);
  assert.deepEqual(stats.behaviorMinutes.map((p) => p.value), [12]);
  assert.equal(stats.actedCount, 1);
  assert.equal(stats.resistedCount, 1);
  assert.equal(stats.waitTargetMetCount, 1);
});

test("'no' choices are counted across episodes", () => {
  const e1 = episode("1", 3);
  const e2 = { ...episode("2", 4), waitRounds: [...episode("2", 4).waitRounds, ...episode("2", 4).waitRounds] };
  assert.equal(computeAddictionProfileStats([e1, e2], "p1", "2026-11-27T00:00:00.000Z").notActChoices, 3);
});

test("weekly frequency groups by ISO week", () => {
  const acted = (id: string, day: number) => ({ ...episode(id, day), outcome: "acted" as const });
  const stats = computeAddictionProfileStats([acted("a", 2), acted("b", 3), acted("c", 10)], "p1", "2026-11-27T00:00:00.000Z");
  assert.deepEqual(stats.weekly.map((w) => w.acted), [2, 1]);
});

test("efficacy, intensity and self-acceptance series come from the ARC rounds and ratings", () => {
  const e = {
    ...episode("e", 5),
    initialIntensity: 8,
    arcRounds: [
      { kind: "efficacy" as const, startedAt: "", completedAt: "2026-11-05T10:01:00.000Z", skipped: false, ratingAfter: 7, ratingBefore: null },
      { kind: "acceptance" as const, startedAt: "", completedAt: "2026-11-05T10:20:00.000Z", skipped: false, ratingAfter: 6, ratingBefore: 2 },
    ],
  };
  const stats = computeAddictionProfileStats([e], "p1", "2026-11-27T00:00:00.000Z");
  assert.deepEqual(stats.initialIntensity.map((p) => p.value), [8]);
  assert.deepEqual(stats.intensityAfterWait.map((p) => p.value), [3]);
  assert.deepEqual(stats.efficacy.map((p) => p.value), [7]);
  assert.deepEqual(stats.acceptanceBefore.map((p) => p.value), [2]);
  assert.deepEqual(stats.acceptanceAfter.map((p) => p.value), [6]);
});

test("7/30-day averages only include recent episodes", () => {
  const stats = computeAddictionProfileStats([episode("old", 1, { early: true, waitedMin: 1 }), episode("new", 25)], "p1", "2026-11-27T00:00:00.000Z");
  assert.equal(stats.averages.waitMinutesLast7Days, 2);
  assert.equal(stats.averages.waitMinutesLast30Days, 1.5);
  assert.equal(stats.averages.behaviorMinutesLast7Days, null);
});

test("history rows are newest first", () => {
  const rows = buildAddictionHistoryRows([episode("a", 3), episode("b", 9)], "p1", "2026-11-27T00:00:00.000Z");
  assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
});

test("chart projection: 0..1 range, single point centered, fixed max for ratings", () => {
  assert.deepEqual(projectChartPoints([]), []);
  assert.deepEqual(projectChartPoints([{ at: "", value: 5 }], 10), [{ x: 0.5, y: 0.5 }]);
  assert.deepEqual(projectChartPoints([{ at: "", value: 0 }, { at: "", value: 4 }]), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(projectChartPoints([{ at: "", value: 20 }], 10), [{ x: 0.5, y: 1 }]);
});
