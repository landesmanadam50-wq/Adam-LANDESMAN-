import test from "node:test";
import assert from "node:assert/strict";

import { DEFERRAL_OPTIONS, resolveReminderFireDate, resolveReminderRoute } from "./reminders.ts";

// --- DEFERRAL_OPTIONS: plain relative offsets, no date/time-picker
// dependency, no timezone-of-day math involved at all.

test("DEFERRAL_OPTIONS has distinct ids and strictly increasing offsets", () => {
  const ids = DEFERRAL_OPTIONS.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length, "every option id is unique");
  for (let i = 1; i < DEFERRAL_OPTIONS.length; i++) {
    assert.ok(
      DEFERRAL_OPTIONS[i].offsetMinutes > DEFERRAL_OPTIONS[i - 1].offsetMinutes,
      "options are presented in strictly increasing time-from-now order"
    );
  }
});

test("resolveReminderFireDate adds exactly the option's offset in minutes to `now`, nothing else", () => {
  const now = new Date("2026-03-10T09:00:00.000Z");
  const oneHour = DEFERRAL_OPTIONS.find((o) => o.id === "1h")!;
  const fireAt = resolveReminderFireDate(oneHour, now);
  assert.equal(fireAt.toISOString(), "2026-03-10T10:00:00.000Z");
});

test("resolveReminderFireDate: the tomorrow/2-day options add exactly 24h/48h -- no timezone or calendar-day adjustment, just a flat offset", () => {
  const now = new Date("2026-03-10T09:00:00.000Z");
  const tomorrow = DEFERRAL_OPTIONS.find((o) => o.id === "tomorrow")!;
  const twoDays = DEFERRAL_OPTIONS.find((o) => o.id === "2days")!;
  assert.equal(resolveReminderFireDate(tomorrow, now).toISOString(), "2026-03-11T09:00:00.000Z");
  assert.equal(resolveReminderFireDate(twoDays, now).toISOString(), "2026-03-12T09:00:00.000Z");
});

test("resolveReminderFireDate defaults `now` to the real current time when omitted", () => {
  const before = Date.now();
  const oneHour = DEFERRAL_OPTIONS.find((o) => o.id === "1h")!;
  const fireAt = resolveReminderFireDate(oneHour);
  const after = Date.now();
  assert.ok(fireAt.getTime() >= before + 60 * 60_000, "at least 1h after the call started");
  assert.ok(fireAt.getTime() <= after + 60 * 60_000, "no more than 1h after the call finished");
});

// --- resolveReminderRoute: which entry point a tapped reminder leads
// to (#4 "opening the reminder resumes/opens the appropriate flow", #5
// "opening it should lead toward the relevant ARC entry point").

test("a future ARC reminder always routes to /live", () => {
  assert.equal(resolveReminderRoute("arc", true), "/live");
});

test("a deferred Focus Success reminder WITH ARC routes to /live -- the relevant ARC entry point", () => {
  assert.equal(resolveReminderRoute("focusSuccess", true), "/live");
});

test("a deferred Focus Success reminder WITHOUT ARC routes to the standalone Focus Success screen, not /live", () => {
  assert.equal(resolveReminderRoute("focusSuccess", false), "/focus-success");
});
