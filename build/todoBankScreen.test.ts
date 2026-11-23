import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/todoBankScreen.test.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 1: source-text regression guard for
 * build/TodoBankScreen.tsx (the reusable To-Do bank management screen,
 * route /todo-bank), its entry point from build/WeeklyRoutineScreen.tsx,
 * and its route registration. The pure CRUD logic itself is covered in
 * arc/todoBank.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/TodoBankScreen.tsx");
const route = readSource("app/todo-bank.tsx");
const layout = readSource("app/_layout.tsx");
const weeklyRoutine = readSource("build/WeeklyRoutineScreen.tsx");

test("required: the bank screen never defines urgency, importance, or a timer-duration field -- those are set only per placement on the day-occurrence Task", () => {
  assert.ok(!screen.includes("todoUrgency"));
  assert.ok(!screen.includes("todoImportance"));
  assert.ok(!screen.includes("expectedDurationMinutes"));
});

test("removing a bank item from this screen archives it (never a hard delete) -- an already-placed day-occurrence Task is untouched", () => {
  const fnIndex = screen.indexOf("async function handleRemove(");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("archiveTodoBankItem(item"));
  assert.ok(!fnBody.includes("deleteTodoBankItemEntry"), "archiving, not the hard-delete entry point");
});

test("the route wrapper is a plain 2-line param-forward, same convention as every other route wrapper in this app", () => {
  assert.ok(route.includes("<TodoBankScreen />"));
});

test("the route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="todo-bank"/);
});

test("required: build/WeeklyRoutineScreen.tsx (the Fixed Weekly Routine) offers a '🗂️ מאגר To-Do' entry point into the bank screen", () => {
  assert.ok(weeklyRoutine.includes('onPress={() => router.push("/todo-bank")}'));
  assert.ok(weeklyRoutine.includes("🗂️ מאגר To-Do"));
});
