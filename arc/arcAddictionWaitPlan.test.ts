import test from "node:test";
import assert from "node:assert/strict";
import { createAddictionProfile } from "./arcAddiction.ts";
import { createAddictionSession, reduceAddictionSession } from "./arcAddictionFlow.ts";
import type { AddictionSession, AddictionSessionEvent } from "./arcAddictionFlow.ts";
import {
  ACTION_ARC_ADDICTION_END_WAIT,
  ACTION_ARC_ADDICTION_NO,
  ACTION_ARC_ADDICTION_YES,
  ARC_ADDICTION_WAIT_END_KIND,
  ARC_ADDICTION_WAIT_END_NOTIFICATION_ID,
  ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID,
  isArcAddictionNotificationKind,
  resolveAddictionNotificationAction,
  isPendingOpenFresh,
  PENDING_OPEN_MAX_AGE_MS,
  resolveAddictionNotificationPlan,
} from "./arcAddictionWaitPlan.ts";

const T0 = Date.parse("2026-11-27T10:00:00.000Z");
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const profile = createAddictionProfile("p1", { name: "חיטוט באוזניים", initialWaitMinutes: 3 }, at(0));

function run(session: AddictionSession, events: [AddictionSessionEvent, number][]): AddictionSession {
  return events.reduce((s, [event, seconds]) => reduceAddictionSession(s, event, { now: at(seconds), profile }), session);
}

const waiting = run(createAddictionSession("e1", profile, null, at(0)), [[{ type: "SKIP_TO_WAIT", initialIntensity: null }, 0]]);

test("no session / no active wait => empty plan (everything gets cancelled)", () => {
  assert.deepEqual(resolveAddictionNotificationPlan(null, T0), { waitEnd: null, ongoing: null, dismissDisplayedWaitEnd: true });
  const intro = createAddictionSession("e1", profile, null, at(0));
  assert.deepEqual(resolveAddictionNotificationPlan(intro, T0), { waitEnd: null, ongoing: null, dismissDisplayedWaitEnd: true });
});

test("an active wait plans exactly one end-of-wait alarm at endsAt, with the exact question and כן / לא", () => {
  const plan = resolveAddictionNotificationPlan(waiting, T0 + 5_000);
  assert.ok(plan.waitEnd);
  assert.equal(plan.waitEnd.id, ARC_ADDICTION_WAIT_END_NOTIFICATION_ID);
  assert.equal(plan.waitEnd.fireAtMs, T0 + 3 * 60_000);
  assert.equal(plan.waitEnd.body, "האם אתה בוחר לפעול לפי הדחף כרגע?");
  assert.match(plan.waitEnd.title, /חיטוט באוזניים/);
  assert.deepEqual(plan.waitEnd.actions, [
    { title: "כן", pressActionId: ACTION_ARC_ADDICTION_YES },
    { title: "לא", pressActionId: ACTION_ARC_ADDICTION_NO },
  ]);
  assert.deepEqual(plan.waitEnd.data, { kind: ARC_ADDICTION_WAIT_END_KIND, episodeId: "e1" });
});

test("the ids are fixed: a second wait round re-arms the SAME id (no duplicates)", () => {
  const first = resolveAddictionNotificationPlan(waiting, T0);
  const again = run(waiting, [
    [{ type: "WAIT_ELAPSED" }, 200],
    [{ type: "ANSWER", choice: "not_act" }, 201],
    [{ type: "RATE_INTENSITY", intensity: 2 }, 202],
    [{ type: "CHOOSE", choice: "extra_wait" }, 203],
  ]);
  const second = resolveAddictionNotificationPlan(again, T0 + 203_000);
  assert.equal(first.waitEnd!.id, second.waitEnd!.id);
  assert.equal(first.ongoing!.id, second.ongoing!.id);
  assert.equal(second.waitEnd!.fireAtMs, T0 + 203_000 + 180_000);
});

test("ongoing countdown notification counts down to endsAt and offers ending the timer", () => {
  const plan = resolveAddictionNotificationPlan(waiting, T0);
  assert.equal(plan.ongoing!.id, ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID);
  assert.equal(plan.ongoing!.endsAtMs, T0 + 180_000);
  assert.deepEqual(plan.ongoing!.actions.map((a) => a.pressActionId), [ACTION_ARC_ADDICTION_END_WAIT]);
});

test("once endsAt is past, no new alarm is armed (the decision is handled in-app / by the delivered alarm)", () => {
  const plan = resolveAddictionNotificationPlan(waiting, T0 + 10 * 60_000);
  assert.equal(plan.waitEnd, null);
});

test("action ids map to session events; unknown => just open the screen", () => {
  assert.deepEqual(resolveAddictionNotificationAction(ACTION_ARC_ADDICTION_YES), { type: "ANSWER", choice: "act" });
  assert.deepEqual(resolveAddictionNotificationAction(ACTION_ARC_ADDICTION_NO), { type: "ANSWER", choice: "not_act" });
  assert.deepEqual(resolveAddictionNotificationAction(ACTION_ARC_ADDICTION_END_WAIT), { type: "END_WAIT_EARLY" });
  assert.equal(resolveAddictionNotificationAction("default"), null);
  assert.equal(resolveAddictionNotificationAction(undefined), null);
});

test("notification kinds are recognized", () => {
  assert.equal(isArcAddictionNotificationKind(ARC_ADDICTION_WAIT_END_KIND), true);
  assert.equal(isArcAddictionNotificationKind("arcAddictionWaitOngoing"), true);
  assert.equal(isArcAddictionNotificationKind("taskTimerEnd"), false);
});

test("pressing 'לא' from the notification while the app slept answers the right round exactly once", () => {
  const answered = run(waiting, [[{ type: "ANSWER", choice: "not_act", episodeId: "e1" }, 400]]);
  assert.equal(answered.stage, "intensity");
  const pressedTwice = run(answered, [[{ type: "ANSWER", choice: "not_act", episodeId: "e1" }, 401]]);
  assert.equal(pressedTwice, answered);
});

test("review fix: on the decision step the displayed כן / לא notification is KEPT (it is how the user answers)", () => {
  const decision = run(waiting, [[{ type: "WAIT_ELAPSED" }, 200]]);
  assert.equal(decision.stage, "decision");
  assert.deepEqual(resolveAddictionNotificationPlan(decision, T0 + 200_000), { waitEnd: null, ongoing: null, dismissDisplayedWaitEnd: false });
});

test("once answered (or a new wait starts) the displayed notification is dismissed", () => {
  const answered = run(waiting, [[{ type: "WAIT_ELAPSED" }, 200], [{ type: "ANSWER", choice: "not_act" }, 201]]);
  assert.equal(resolveAddictionNotificationPlan(answered, T0 + 201_000).dismissDisplayedWaitEnd, true);
  assert.equal(resolveAddictionNotificationPlan(waiting, T0).dismissDisplayedWaitEnd, true);
});

test("pending-open requests expire after two minutes and ignore garbage", () => {
  assert.equal(isPendingOpenFresh(String(T0), T0 + 1000), true);
  assert.equal(isPendingOpenFresh(String(T0), T0 + PENDING_OPEN_MAX_AGE_MS + 1), false);
  assert.equal(isPendingOpenFresh("1", T0), false);
  assert.equal(isPendingOpenFresh(null, T0), false);
  assert.equal(isPendingOpenFresh("abc", T0), false);
  assert.equal(isPendingOpenFresh(String(T0 + 5000), T0), false);
});
