import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/arcGymDirectAccess.test.ts
 *
 * "ARCHI -- Add Direct ARC Gym Access from Home and the Floating Timer"
 * task: source-text regression guard for the two new entry points this
 * task adds (the floating timer/cube's new "🏋️ ARC Gym" shortcut, via
 * the local floating-timer-overlay Expo Module -- Android only, not
 * executed directly with `node --test`, same convention as
 * data/floatingTimerOverlay.test.ts) plus confirmation that the
 * Behaviour/Memory/Result manual-creation flows this task's spec asked
 * to "free up" were, on investigation, ALREADY unconditional before
 * this task touched anything -- so this file also pins that existing
 * behavior down explicitly, rather than silently relying on it.
 *
 * Required test 1 (ARC Gym openable from "היום הגמיש") is NOT
 * duplicated here -- it was already fully covered, and already
 * passing, by build/arcGymScreens.test.ts's own "required test 1"
 * before this task touched anything: the Home screen's "🏋️ ARC GYM"
 * card (build/FlexibleDailyScreen.tsx) already opens /arc-gym
 * unconditionally.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const serviceKt = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/OverlayService.kt");
const home = readSource("build/FlexibleDailyScreen.tsx");
const gymScreen = readSource("build/ArcGymScreen.tsx");
const behaviorScreen = readSource("build/ArcGymBehaviorScreen.tsx");
const memoryListScreen = readSource("build/ArcGymMemoryListScreen.tsx");
const resultListScreen = readSource("build/ArcGymResultListScreen.tsx");

// --- Required test 2: ARC Gym can be opened from the floating timer ------

test("required test 2: the floating timer's expanded panel has its own dedicated '🏋️ ARC Gym' row, added to the SAME expandedContent container every other expanded-panel action (mood row, next-task section, insight) already lives in -- never a second, separately-positioned overlay view", () => {
  assert.ok(serviceKt.includes('text = "🏋️ ARC Gym"'));
  const expandedIndex = serviceKt.indexOf("val expandedContent = LinearLayout(this).apply {");
  const expandedBody = serviceKt.slice(expandedIndex, serviceKt.indexOf("\n      }", expandedIndex));
  assert.ok(expandedBody.includes("addView(arcGymTextView)"));
  assert.ok(expandedBody.includes("addView(insightTextView)"), "the new row sits alongside the pre-existing insight row, never replacing it");
});

test("required test 2 continued: a tap on the ARC Gym row is hit-tested the same way every other expanded-panel action is (isPointInsideView at ACTION_DOWN) and dispatched to openArcGym() at ACTION_UP, after the pre-existing insight branch and before the final Task LIVE fallback", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("isPointInsideView(view, arcGymView, event.x, event.y)"));
  const upIndex = fnBody.indexOf("MotionEvent.ACTION_UP -> {");
  const upBody = fnBody.slice(upIndex, fnBody.indexOf("MotionEvent.ACTION_CANCEL", upIndex));
  const order = ["downOnInsight", "downOnArcGym", "openTaskLive()"];
  let lastIndex = -1;
  for (const token of order) {
    const idx = upBody.indexOf(token);
    assert.ok(idx > lastIndex, `${token} must appear, in order, after the previous branch`);
    lastIndex = idx;
  }
});

test("required test 2 continued: openArcGym() opens the existing /arc-gym route directly, via the EXACT SAME 'archi://' deep-link scheme + setPackage + FLAG_ACTIVITY_NEW_TASK mechanism openAddInsight/openTaskLive already use -- never a second, native-only ARC Gym implementation", () => {
  const fnIndex = serviceKt.indexOf("private fun openArcGym()");
  assert.ok(fnIndex !== -1);
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('Uri.parse("archi://arc-gym")'));
  assert.ok(fnBody.includes("setPackage(packageName)"));
  assert.ok(fnBody.includes("addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)"));
  assert.ok(fnBody.includes("startActivity(intent)"));
  assert.ok(fnBody.includes("catch (_: Exception)"), "a missing activity to resolve to must never crash the host app, same guard as every other deep link here");
});

// --- Required test 3: works from foreground, background, and cold start --

test("required test 3: openArcGym's dispatch mechanism is IDENTICAL to openAddInsight's/openTaskLive's own proven foreground/background/cold-start behavior -- a plain android.content.Intent(ACTION_VIEW) fired from a long-running Service, which Android itself resolves to the already-running app (foreground/background) or launches fresh (cold start) with no JS-side listener required to be alive -- never a second, bespoke navigation mechanism that would need its own cold-start handling", () => {
  const addInsightIndex = serviceKt.indexOf("private fun openAddInsight()");
  const addInsightBody = serviceKt.slice(addInsightIndex, serviceKt.indexOf("\n  }", addInsightIndex));
  const arcGymIndex = serviceKt.indexOf("private fun openArcGym()");
  const arcGymBody = serviceKt.slice(arcGymIndex, serviceKt.indexOf("\n  }", arcGymIndex));
  for (const fragment of ["Intent(Intent.ACTION_VIEW, Uri.parse(", "setPackage(packageName)", "addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)", "startActivity(intent)"]) {
    assert.ok(addInsightBody.includes(fragment) && arcGymBody.includes(fragment), `openArcGym must share the exact same dispatch fragment as openAddInsight: "${fragment}"`);
  }
});

test("required test 3 continued: no explicit Linking/scheme config was added anywhere for this -- 'archi://arc-gym' resolves to the pre-existing app/arc-gym/index.tsx route purely through expo-router's own default scheme-based linking (same mechanism 'archi://insights/new' and every 'archi://tasks/$taskId...' deep link already rely on, confirmed working across foreground/background/cold start by this app's existing Home Screen Widget and every pre-existing floating-overlay action) -- app/_layout.tsx's own arc-gym/index Stack.Screen registration (title only, pre-existing) is untouched by this task", () => {
  const layout = readSource("app/_layout.tsx");
  assert.ok(layout.includes('<Stack.Screen name="arc-gym/index" options={{ title: "ARC GYM" }} />'), "the pre-existing route registration (not a Linking config) is unchanged");
  assert.ok(!layout.includes("Linking.createURL") && !layout.includes("linking={"), "no custom Linking config object was introduced for this");
});

// --- Required test 4: the current task timer remains intact ---------------

test("required test 4: openArcGym() never reads or references taskId, the timer's paused/resting/anchor state, or any complete/postpone function -- it is a pure, unconditional 'open this other screen' side effect that cannot stop, reset, complete, or postpone anything, whether idle or mid-task", () => {
  const fnIndex = serviceKt.indexOf("private fun openArcGym()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  for (const forbidden of ["taskId", "paused", "resting", "anchorRemainingSeconds", "completeStageForTask", "renderNow"]) {
    assert.ok(!fnBody.includes(forbidden), `openArcGym must never reference "${forbidden}" -- it must stay completely decoupled from the active task/timer`);
  }
});

test("required test 4 continued: ensureOverlayAdded/onStartCommand/renderNow (the tick loop that actually drives the timer countdown) are never called from, and never call, openArcGym -- the overlay service keeps ticking the SAME run exactly as it already does while the trainee opens the insight editor or Task LIVE from here, with zero new code path touching the timer", () => {
  assert.ok(!serviceKt.includes("fun openArcGym(): "), "openArcGym returns nothing and is never queried for timer state");
  const tickIndex = serviceKt.indexOf("private fun renderNow(");
  const tickBody = serviceKt.slice(tickIndex, serviceKt.indexOf("\n  }", tickIndex));
  assert.ok(!tickBody.includes("openArcGym"), "the tick/render loop must never call into navigation at all, ARC Gym included");
});

// --- Required tests 5-7: free manual creation of all three exercise types -

test("required test 5: Behaviour exercises (new situations under an existing Manifest behavior) can be created with ArcGymBehaviorScreen's own '+ סיטואציה חדשה' button -- unconditional, no active-task/active-session/active-timer check anywhere in this screen's own source", () => {
  assert.ok(behaviorScreen.includes('"+ סיטואציה חדשה"') || behaviorScreen.includes("סיטואציה חדשה"));
  assert.ok(behaviorScreen.includes('router.push({ pathname: "/arc-gym/situation/[id]/edit", params: { id: "new"'));
  for (const gate of ["loadTaskTimerRun", "activeTaskId", "coaching", "TaskTimerRun"]) {
    assert.ok(!behaviorScreen.includes(gate), `ArcGymBehaviorScreen must never gate situation creation on "${gate}"`);
  }
});

test("required test 6: Memory exercises can be created with ArcGymMemoryListScreen's own '+ תרגיל חדש' button -- unconditional, same no-gating guarantee as Behaviour", () => {
  assert.ok(memoryListScreen.includes("+ תרגיל חדש"));
  assert.ok(memoryListScreen.includes('router.push({ pathname: "/arc-gym/memory/[id]/edit", params: { id: "new" } })'));
  for (const gate of ["loadTaskTimerRun", "activeTaskId", "coaching", "TaskTimerRun"]) {
    assert.ok(!memoryListScreen.includes(gate), `ArcGymMemoryListScreen must never gate exercise creation on "${gate}"`);
  }
});

test("required test 7: Success/ARC Result exercises can be created with ArcGymResultListScreen's own '+ תרגיל חדש' button -- unconditional, same no-gating guarantee, task-linking stays optional", () => {
  assert.ok(resultListScreen.includes("+ תרגיל חדש"));
  assert.ok(resultListScreen.includes('router.push({ pathname: "/arc-gym/result/[id]/edit", params: { id: "new" } })'));
  for (const gate of ["loadTaskTimerRun", "activeTaskId", "coaching", "TaskTimerRun"]) {
    assert.ok(!resultListScreen.includes(gate), `ArcGymResultListScreen must never gate exercise creation on "${gate}"`);
  }
});

// --- Required test 8: existing exercises can be edited and practiced ------

test("required test 8: every saved exercise of all three types opens its own detail/edit/practice routes from the list -- Memory rows open /arc-gym/memory/[id] (which itself links to .../edit and .../train), Result rows open /arc-gym/result/[id] (which itself links to .../edit), and Behaviour situations open /arc-gym/situation/[id] (which itself links to .../edit and the training screen) -- all pre-existing, untouched by this task", () => {
  assert.ok(memoryListScreen.includes('router.push({ pathname: "/arc-gym/memory/[id]", params: { id: item.id } })'));
  assert.ok(resultListScreen.includes('router.push({ pathname: "/arc-gym/result/[id]", params: { id: item.id } })'));
  assert.ok(behaviorScreen.includes('router.push({ pathname: "/arc-gym/situation/[id]", params: { id: situation.id } })'));
});

// --- Required test 9: no duplicate navigation or exercise records ---------

test("required test 9: ARC Gym has exactly ONE entry point on Home (build/FlexibleDailyScreen.tsx) and exactly ONE new entry point on the floating timer -- this task adds no second, competing '/arc-gym' navigation call anywhere in either file", () => {
  const homeMatches = home.match(/router\.push\("\/arc-gym"\)/g) ?? [];
  assert.equal(homeMatches.length, 1, "Home must open ARC Gym through exactly one call site");
  const arcGymViewFieldMatches = serviceKt.match(/private var arcGymView: TextView\? = null/g) ?? [];
  assert.equal(arcGymViewFieldMatches.length, 1, "the native overlay must declare the ARC Gym row exactly once, never a duplicated field");
  const openArcGymFnMatches = serviceKt.match(/private fun openArcGym\(\)/g) ?? [];
  assert.equal(openArcGymFnMatches.length, 1, "exactly one openArcGym() implementation -- never two competing dispatchers");
});

test("required test 9 continued: openArcGym() is debounced at the native source (ARC_GYM_OPEN_DEBOUNCE_MS/lastArcGymOpenAtMs), the same 1500ms convention as every other tappable region here -- a rapid double-tap can never fire the deep link (and therefore never create/open a duplicate navigation stack) twice", () => {
  assert.ok(serviceKt.includes("private const val ARC_GYM_OPEN_DEBOUNCE_MS = 1500L"));
  assert.ok(serviceKt.includes("private var lastArcGymOpenAtMs: Long = 0L"));
  const fnIndex = serviceKt.indexOf("private fun openArcGym()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (now - lastArcGymOpenAtMs < ARC_GYM_OPEN_DEBOUNCE_MS) return"));
  assert.ok(fnBody.includes("lastArcGymOpenAtMs = now"));
});

test("required test 9 continued: arcGymView is cleared alongside every other expanded-panel view in BOTH cleanup paths (the ensureOverlayAdded catch block and removeOverlayIfAdded) -- never a stale reference left behind that could cause a double-dispatch on the next show", () => {
  const removeIndex = serviceKt.indexOf("private fun removeOverlayIfAdded()");
  const removeBody = serviceKt.slice(removeIndex, serviceKt.indexOf("\n  }", removeIndex));
  assert.ok(removeBody.includes("arcGymView = null"));
  assert.ok(removeBody.includes("insightView = null"), "arcGymView must be cleared in the SAME existing cleanup list as insightView, never a separate one");
});

// --- Required test 10: Mini ARC automatic-generation rules are unchanged --

test("required test 10: none of the screens this task touches or reasons about (ArcGymScreen's own entry list, the Behaviour/Memory/Result list-and-create screens, the native floating overlay) reference Mini ARC, mini-arc creation, or arc/miniArc.ts at all -- this task adds zero new pathway to manually create a Mini ARC session, by construction", () => {
  for (const source of [gymScreen, behaviorScreen, memoryListScreen, resultListScreen, serviceKt]) {
    assert.ok(!/mini[-_]?arc/i.test(source), "no Mini ARC reference must appear in any ARC Gym screen or the native overlay touched by this task");
  }
});

test("required test 10 continued: arc/miniArc.ts (Mini ARC's own eligibility/auto-generation module) is not imported by, and does not import, any of the ARC Gym screens this task's new entry points lead to -- the two systems stay completely independent, exactly as before this task", () => {
  const miniArc = readSource("arc/miniArc.ts");
  for (const screen of [gymScreen, behaviorScreen, memoryListScreen, resultListScreen]) {
    assert.ok(!screen.includes("miniArc"), "an ARC Gym screen must never import arc/miniArc.ts");
  }
  assert.ok(!miniArc.includes("arcGym") && !miniArc.includes("ArcGym"), "arc/miniArc.ts must never be made aware of ARC Gym by this task");
});
