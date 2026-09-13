import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/selfDevelopmentEntryRoute.test.ts
 *
 * ARCHI entry-flow correction, regression guard: this codebase has no
 * React Native component test renderer (every other test here exercises
 * pure arc//program//data logic only -- see package.json's own test
 * script), so a real "render the screen and tap the button" test isn't
 * available. Instead this asserts directly on the wiring a trainee would
 * actually experience end to end -- Self Development dashboard's own
 * "+ בניית תוכנית חדשה" button -> /self-development/build -> its screen
 * component -> the new five-protocol picker, and (must NOT regress) that
 * the legacy combined "program name + ARC מלא/Mini ARC toggle" screen is
 * gone from that file -- by reading the real source files, never a
 * duplicated/mocked copy of them.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

test("Self Development dashboard's own '+ בניית תוכנית חדשה' button routes to /self-development/build", () => {
  const dashboard = readSource("build/SelfDevelopmentDashboardScreen.tsx");
  const buttonIndex = dashboard.indexOf("בניית תוכנית חדשה");
  assert.ok(buttonIndex !== -1, "the dashboard must still show the '+ בניית תוכנית חדשה' button");
  // The onPress that pushes the route sits just before the button's own
  // label in this Pressable/Text pair -- assert the route push is the
  // nearest onPress above the label, not merely present anywhere in the file.
  const before = dashboard.slice(0, buttonIndex);
  const lastOnPress = before.lastIndexOf("onPress={() => router.push(");
  assert.ok(lastOnPress !== -1, "the button's own Pressable must carry a router.push onPress");
  const onPressToLabel = dashboard.slice(lastOnPress, buttonIndex);
  assert.ok(onPressToLabel.includes('"/self-development/build"'), "the '+ בניית תוכנית חדשה' button must route to /self-development/build");
});

test("the /self-development/build route renders build/SelfDevelopmentBuildScreen.tsx", () => {
  const routeFile = readSource("app/self-development/build.tsx");
  assert.match(routeFile, /from ["'].*SelfDevelopmentBuildScreen\.tsx["']/);
});

test("build/SelfDevelopmentBuildScreen.tsx is the new Protocol Picker -- title and all five protocol options present", () => {
  const screen = readSource("build/SelfDevelopmentBuildScreen.tsx");
  assert.ok(screen.includes("איזה פרוטוקול תרצה לבנות?"), "must show the Protocol Picker's own title");
  for (const label of ["מצב רגשי", "דחף", "מחשבה", "נוכחות", "אמונה"]) {
    assert.ok(screen.includes(label), `Protocol Picker must offer "${label}"`);
  }
});

test("build/SelfDevelopmentBuildScreen.tsx never regresses back to the legacy combined name+ARC-מלא/Mini-ARC screen", () => {
  const screen = readSource("build/SelfDevelopmentBuildScreen.tsx");
  // wantsFullArc/wantsMiniArc were the legacy screen's own two
  // independent toggle state variables -- their reappearance here is
  // the exact regression this test exists to catch.
  assert.ok(!screen.includes("wantsFullArc"), "must not reintroduce the legacy ARC-מלא toggle");
  assert.ok(!screen.includes("wantsMiniArc"), "must not reintroduce the legacy Mini-ARC toggle");
});
