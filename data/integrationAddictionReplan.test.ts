/**
 * Integration of ARC Addiction (feature/arc-addiction) with Replan Time /
 * Dynamic Time Planning (claude/task-productivity-integration): the two
 * features share the notifee dispatcher, Task LIVE, the floating overlay
 * and the flexible daily screen, and must never cancel, shadow or
 * overwrite each other.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ARC_ADDICTION_WAIT_END_KIND,
  ARC_ADDICTION_WAIT_END_NOTIFICATION_ID,
  ARC_ADDICTION_WAIT_ONGOING_KIND,
  ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID,
  isArcAddictionNotificationKind,
} from "../arc/arcAddictionWaitPlan.ts";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
}

const dataDir = fileURLToPath(new URL("./", import.meta.url));
const dataSources = readdirSync(dataDir)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => ({ file, source: readFileSync(`${dataDir}/${file}`, "utf8") }));

const replan = read("data/replanTimeNotification.ts");
const taskAlarm = read("data/taskAlarm.ts");
const addictionSession = read("data/arcAddictionSession.ts");
const addictionNotification = read("data/arcAddictionWaitNotification.ts");

test("every fixed notifee notification id in data/ is unique, and ARC Addiction's ids collide with none of them", () => {
  const ids: string[] = [];
  for (const { source } of dataSources) {
    for (const match of source.matchAll(/const [A-Z0-9_]*(?:NOTIFICATION|ARM)[A-Z0-9_]*_ID\s*=\s*"([^"]+)"/g)) ids.push(match[1]);
  }
  assert.ok(ids.includes("archi-replan-time-notification"));
  assert.ok(ids.includes("archi-replan-time-arm"));
  const all = [...ids, ARC_ADDICTION_WAIT_END_NOTIFICATION_ID, ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID];
  assert.equal(new Set(all).size, all.length, `duplicate notification id in ${all.join(", ")}`);
});

test("notification kinds don't overlap: replanTime / replanTimeArm are never treated as ARC Addiction and vice versa", () => {
  for (const kind of ["replanTime", "replanTimeArm", "taskNotStarted", "freeTimeWindow", "taskAlarm", "taskTimerEnd"]) {
    assert.equal(isArcAddictionNotificationKind(kind), false, kind);
  }
  assert.ok(![ARC_ADDICTION_WAIT_END_KIND, ARC_ADDICTION_WAIT_ONGOING_KIND].some((kind) => kind.startsWith("replan")));
});

test("neither feature cancels the other's notifications, and nothing in data/ cancels notifications globally", () => {
  for (const id of [ARC_ADDICTION_WAIT_END_NOTIFICATION_ID, ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID, "arcAddiction"]) {
    assert.ok(!replan.includes(id), `replan module references ${id}`);
  }
  for (const source of [addictionSession, addictionNotification]) {
    assert.ok(!source.includes("replan"), "ARC Addiction modules must not touch Replan Time");
  }
  for (const { file, source } of dataSources) {
    assert.ok(!/cancelAllNotifications\(|cancelDisplayedNotifications\(\)|cancelTriggerNotifications\(\)/.test(source), `${file} cancels notifications globally`);
  }
});

test("the shared dispatcher routes both features through their own branches", () => {
  const handler = taskAlarm.slice(taskAlarm.indexOf("export async function handleTaskAlarmEvent"));
  assert.match(handler, /if \(data\.kind === "replanTime"\) \{\n\s+await handleReplanTimeNotificationEvent\(event\);\n\s+return;/);
  assert.match(handler, /if \(isArcAddictionNotificationEvent\(event\)\) \{\n\s+await handleArcAddictionNotificationEvent\(event\);\n\s+return;/);
  // Replan's arm is handled in the foreground-service path; ARC Addiction never uses that path (its alarm is a plain trigger).
  const service = taskAlarm.slice(taskAlarm.indexOf("export function registerTaskAlarmForegroundService"), taskAlarm.indexOf("export async function handleTaskAlarmEvent"));
  assert.match(service, /notification\.data\?\.kind === "replanTimeArm"/);
  assert.ok(!service.includes("arcAddiction"));
  assert.ok(!addictionNotification.includes("asForegroundService"));
});

test("Task LIVE keeps both: Replan recompute calls and the ARC Addiction entry (which never pauses the task timer)", () => {
  const activeTask = read("live/ActiveTaskScreen.tsx");
  assert.ok((activeTask.match(/recomputeReplanTimeNotification\(\)/g) ?? []).length >= 3);
  assert.match(activeTask, /<ArcAddictionTaskLiveEntry taskId=\{task\.id\} \/>/);
});

test("flexible daily screen: the ARC Addiction card follows Replan's hideHomeOnlyCards like the other ARC route cards", () => {
  const screen = read("build/FlexibleDailyScreen.tsx");
  assert.ok(screen.includes("{isTodayMode && !hideHomeOnlyCards && (\n          <Pressable style={styles.arcAddictionCard}"));
  assert.match(screen, /void recomputeReplanTimeNotification\(\);/);
});

test("root layout registers both features' routes and keeps both app-open reconciliations", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /<Stack\.Screen name="replan-time"/);
  assert.match(layout, /<Stack\.Screen name="arc-addiction\/session"/);
  assert.match(layout, /syncArcAddictionOnOpen\(\);/);
  assert.match(layout, /notifee\.onBackgroundEvent\(handleTaskAlarmEvent\);/);
});

test("storage keys of the two features are disjoint", () => {
  const storage = read("data/storage.ts");
  const addictionStorage = read("data/arcAddictionStorage.ts");
  const keys = (source: string) => [...source.matchAll(/"(archi\.[A-Za-z0-9.]+)"/g)].map((m) => m[1]);
  const shared = keys(addictionStorage).filter((key) => keys(storage).includes(key));
  assert.deepEqual(shared, []);
});
