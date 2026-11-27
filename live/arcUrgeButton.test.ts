import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcUrgeButton.test.ts
 *
 * ARC Urge task: source-text regression guard for the new, always-
 * visible red "ARC Urge" button that sits beside the floating timer's
 * pill in modules/floating-timer-overlay's native OverlayService.kt --
 * not callable from a plain `node --test` run (Android service/view
 * code), same convention as every other native-overlay test in this
 * codebase (see data/floatingTimerOverlay.test.ts,
 * live/arcAddictionOverlayAndTaskLive.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const KT_DIR = "modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay";
const service = readSource(`${KT_DIR}/OverlayService.kt`);
const arcAddictionHome = readSource("build/ArcAddictionHomeScreen.tsx");
const arcAddictionTaskLiveEntry = readSource("live/components/ArcAddictionTaskLiveEntry.tsx");

// --- the button itself: red, labeled "ARC Urge", beside the pill ----------

test("a new TextView labeled 'ARC Urge' is created with a solid (opaque) red background, distinct from every other row's own blue/green/translucent styling", () => {
  const fnIndex = service.indexOf("private fun ensureOverlayAdded()");
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  const btnIndex = fnBody.indexOf('val urgeArcButtonTextView = TextView(this).apply {');
  assert.ok(btnIndex !== -1);
  const btnBody = fnBody.slice(btnIndex, btnIndex + 250);
  assert.ok(btnBody.includes('text = "ARC Urge"'));
  assert.ok(btnBody.includes("Color.parseColor(URGE_ARC_BACKGROUND)"));
  assert.match(service, /private const val URGE_ARC_BACKGROUND = "#FFD32F2F"/, "must be a solid (FF alpha), red hex -- never translucent like the mood/next-task rows");
});

test("the button sits beside the pill (never below it) in its own pillRow, added to the outer container in pillTextView's own former place -- 'the button will appear next to the floating timer'", () => {
  assert.match(
    service,
    /val pillRow = LinearLayout\(this\)\.apply \{\s*orientation = LinearLayout\.HORIZONTAL\s*gravity = Gravity\.CENTER_VERTICAL\s*addView\(pillTextView\)\s*addView\(urgeArcButtonTextView\)\s*\}/
  );
  const fnIndex = service.indexOf("private fun ensureOverlayAdded()");
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  const containerIndex = fnBody.indexOf("val container = LinearLayout(this).apply {");
  const containerBody = fnBody.slice(containerIndex, fnBody.indexOf("\n      }", containerIndex));
  assert.ok(containerBody.includes("addView(pillRow)"));
  assert.ok(!containerBody.includes("addView(pillTextView)"), "pillTextView is no longer a direct child of the outer container -- it is nested inside pillRow now");
});

// --- always visible, in both collapsed and expanded modes -----------------

test("the button's own visibility is never toggled by setCollapsed()/the pill's own collapsed-vs-expanded switch -- it stays visible in BOTH modes, unlike pillTextView itself", () => {
  const fnIndex = service.indexOf("private fun setCollapsed(");
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes("urgeArcButtonView"), "setCollapsed must never touch the ARC Urge button's visibility");
  assert.ok(fnBody.includes("pillView?.visibility"));
  assert.ok(fnBody.includes("expandedContentView?.visibility"));
});

test("the ensureOverlayAdded() visibility-before-measure block never hides urgeArcButtonTextView -- only pillTextView/expandedContent get an explicit collapsed-vs-expanded visibility assignment there", () => {
  const fnIndex = service.indexOf("private fun ensureOverlayAdded()");
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  const visIndex = fnBody.indexOf("pillTextView.visibility = if (collapsed) View.VISIBLE else View.GONE");
  assert.ok(visIndex !== -1);
  const visBody = fnBody.slice(visIndex, visIndex + 250);
  assert.ok(!visBody.includes("urgeArcButtonTextView.visibility"), "the button has no explicit visibility assignment here -- it stays at its TextView default (VISIBLE) in both modes");
});

// --- hit-testing + dispatch -------------------------------------------------

test("the button is hit-tested at ACTION_DOWN via the SAME isPointInsideView every other tappable region uses, and its own dispatch is checked BEFORE the collapsed->expand toggle rule -- same precedent as the ARC Addiction second line (downOnSecondary), since the button (like the second line) is visible while collapsed too", () => {
  const fnIndex = service.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("urgeArcButtonView: View,"), "new parameter on the shared touch-handling function");
  assert.ok(fnBody.includes("var downOnUrgeArc = false"));
  assert.ok(fnBody.includes("downOnUrgeArc = isPointInsideView(view, urgeArcButtonView, event.x, event.y)"));
  const upIndex = fnBody.indexOf("MotionEvent.ACTION_UP -> {");
  const upBody = fnBody.slice(upIndex, fnBody.indexOf("MotionEvent.ACTION_CANCEL", upIndex));
  const secondaryIdx = upBody.indexOf("downOnSecondary");
  const urgeIdx = upBody.indexOf("downOnUrgeArc");
  const collapsedIdx = upBody.indexOf("} else if (collapsed) {");
  assert.ok(secondaryIdx !== -1 && urgeIdx !== -1 && collapsedIdx !== -1);
  assert.ok(secondaryIdx < urgeIdx && urgeIdx < collapsedIdx, "downOnUrgeArc must be checked after downOnSecondary but strictly before the collapsed->expand rule");
  assert.ok(upBody.includes("openArcAddictionUrge()"));
});

test("the call site passes urgeArcButtonTextView through to attachDragAndTapHandling in the exact same argument position as the function's own new parameter", () => {
  const callIndex = service.indexOf("attachDragAndTapHandling(\n        container,");
  assert.ok(callIndex !== -1);
  const callBody = service.slice(callIndex, callIndex + 500);
  assert.ok(callBody.includes("urgeArcButtonTextView,\n        params"), "urgeArcButtonTextView must be the argument immediately before params, matching the function's own parameter order");
});

// --- the deep link: reuses the EXISTING ARC Addiction route, never a parallel mechanism ---

test("openArcAddictionUrge() deep-links to the app's existing archi://arc-addiction route -- idle (no task) omits returnToTaskId, active threads it through exactly like live/components/ArcAddictionTaskLiveEntry.tsx's own no-session branch already does", () => {
  const fnIndex = service.indexOf("private fun openArcAddictionUrge()");
  assert.ok(fnIndex !== -1);
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('val uri = if (taskId.isEmpty()) "archi://arc-addiction" else "archi://arc-addiction?returnToTaskId=$taskId"'));
  assert.ok(fnBody.includes("startActivity(intent)"));
  assert.ok(fnBody.includes('addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)'), "must work even app-closed, same cold-start-safe pattern as every other deep link here");
});

test("openArcAddictionUrge() is debounced at the native source (URGE_ARC_OPEN_DEBOUNCE_MS/lastUrgeArcTapAtMs), the same 1500ms convention as every other tappable region here", () => {
  assert.ok(service.includes("private const val URGE_ARC_OPEN_DEBOUNCE_MS = 1500L"));
  assert.ok(service.includes("private var lastUrgeArcTapAtMs: Long = 0L"));
  const fnIndex = service.indexOf("private fun openArcAddictionUrge()");
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (now - lastUrgeArcTapAtMs < URGE_ARC_OPEN_DEBOUNCE_MS) return"));
  assert.ok(fnBody.includes("lastUrgeArcTapAtMs = now"));
});

test("opening ARC Addiction from this button is exactly ONE implementation -- never a second, parallel entry mechanism duplicated in the native layer", () => {
  const matches = service.match(/private fun openArcAddictionUrge\(\)/g) ?? [];
  assert.equal(matches.length, 1);
});

// --- never touches the task timer or the independent ARC Addiction waiting timer ---

test("openArcAddictionUrge() never reads or writes any task-timer field (taskId is only READ to build the URI, never assigned) or any ARC Addiction second-line field -- the task timer and the independent coping-wait timer are never paused, reset or otherwise touched by opening this", () => {
  const fnIndex = service.indexOf("private fun openArcAddictionUrge()");
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  for (const forbidden of [
    "anchorRemainingSeconds =",
    "anchorEpochMs =",
    "paused =",
    "stopTicking()",
    "startTicking()",
    "secondaryLabel =",
    "secondaryEndsAtMs =",
    "stopSecondaryTicking()",
  ]) {
    assert.ok(!fnBody.includes(forbidden), `openArcAddictionUrge must never touch ${forbidden}`);
  }
});

// --- returning to the task afterwards reuses the EXISTING returnToTaskId mechanism ---

test("returnToTaskId is the EXISTING param build/ArcAddictionHomeScreen.tsx already reads to carry the originating task through, and live/components/ArcAddictionTaskLiveEntry.tsx already uses the identical destination for its own no-session branch -- no new navigation mechanism was added for this feature", () => {
  assert.match(arcAddictionHome, /useLocalSearchParams<\{\s*returnToTaskId\?:\s*string\s*\}>\(\)/);
  assert.ok(arcAddictionTaskLiveEntry.includes('router.push({ pathname: "/arc-addiction", params: { returnToTaskId: taskId } })'));
});

test("the existing ArcAddictionHomeScreen never auto-starts a session merely by being opened -- a session is only ever created from an explicit 'מרגיש דחף עכשיו' tap there, so repeatedly tapping the native ARC Urge button (even rapidly, past the debounce window) can never itself create a duplicate session", () => {
  assert.ok(arcAddictionHome.includes('onPress={() => void start(profile.id)}'));
  assert.ok(!arcAddictionHome.includes("useEffect") || !arcAddictionHome.includes("void start("), "start() must never be invoked from a mount-time effect -- only from the explicit button press above");
});

test("an already-active session is shown to CONTINUE ('המשך'), never silently reset or duplicated, when the home screen is reopened from the button", () => {
  assert.match(arcAddictionHome, /\{active && \(/);
  assert.ok(arcAddictionHome.includes('onPress={() => router.push(ARC_ADDICTION_SESSION_ROUTE)}'));
});

// --- never overflows the screen or hides existing buttons -----------------

test("the new button is measured and clamped as part of the SAME single container every other button already is -- no second WindowManager view, no separate clamping logic added for it", () => {
  const fnIndex = service.indexOf("private fun ensureOverlayAdded()");
  const fnBody = service.slice(fnIndex, service.indexOf("\n  }", fnIndex));
  const btnIndex = fnBody.indexOf("val urgeArcButtonTextView");
  const measureIndex = fnBody.indexOf("container.measure(");
  const addViewIndex = fnBody.indexOf("wm.addView(container, params)");
  assert.ok(btnIndex !== -1 && measureIndex !== -1 && addViewIndex !== -1);
  assert.ok(btnIndex < measureIndex && measureIndex < addViewIndex, "the button must be created before the ONE container.measure()/wm.addView() call that already clamps the whole overlay to the safe area");
});

// --- the two cleanup paths (never a stale reference / dangling hit-test) ---

test("urgeArcButtonView is nulled out in BOTH the ensureOverlayAdded catch block and removeOverlayIfAdded, same as every other view field", () => {
  const catchIndex = service.indexOf("Requirement 2: a denied/unavailable overlay permission");
  const catchBody = service.slice(catchIndex, catchIndex + 1200);
  assert.ok(catchBody.includes("urgeArcButtonView = null"));
  const removeFnIndex = service.indexOf("private fun removeOverlayIfAdded()");
  const removeFnBody = service.slice(removeFnIndex, service.indexOf("\n  }", removeFnIndex));
  assert.ok(removeFnBody.includes("urgeArcButtonView = null"));
});

// --- no regression to pre-existing floating-timer functionality -----------

test("the pre-existing per-session wiring (one touch listener, one set of LayoutParams, the pill/secondary/expandedContent trio) is otherwise untouched -- dragging the container still moves the button together with everything else, since it is simply one more view inside the same single draggable container", () => {
  assert.match(service, /view\.setOnTouchListener \{ _, event ->/);
  const onTouchMatches = service.match(/\.setOnTouchListener \{/g) ?? [];
  assert.equal(onTouchMatches.length, 1, "still exactly one touch listener for the whole overlay -- dragging anywhere (including the new button's own area) moves the entire container");
});
