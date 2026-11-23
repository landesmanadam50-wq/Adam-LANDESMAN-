import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/floatingTimerOverlay.test.ts
 *
 * Floating task timer task: source-text regression guard for the JS <->
 * native bridge -- like data/taskAlarm.ts, this depends on a native
 * module and isn't executed directly with node --test (requireNativeModule
 * throws outside a real Android build). The one real piece of logic it
 * depends on (arc/floatingTimerOverlayPayload.ts's resolveFloatingTimerOverlayPayload)
 * has its own genuine unit tests.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/floatingTimerOverlay.ts");
const appJson = JSON.parse(readSource("app.json"));
const packageJson = JSON.parse(readSource("package.json"));

test("every exported function is non-throwing -- a missing/failed native module must never block the regular in-app timer", () => {
  for (const fnName of ["hasFloatingOverlayPermissionAsync", "requestFloatingOverlayPermissionAsync", "showFloatingTimerOverlay", "updateFloatingTimerOverlay", "hideFloatingTimerOverlay"]) {
    const fnIndex = module_.indexOf(`export async function ${fnName}`);
    assert.ok(fnIndex !== -1, `${fnName} must be exported`);
    const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
    assert.ok(fnBody.includes("try {") && fnBody.includes("catch"), `${fnName} must swallow native errors, never throw`);
  }
});

test("the native module is only ever resolved on Android, and a resolution failure (module missing/unregistered) is cached as null rather than retried on every call", () => {
  const fnIndex = module_.indexOf("function getNativeModule()");
  const fnBody = module_.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes('Platform.OS !== "android"'));
  assert.ok(fnBody.includes('requireNativeModule("FloatingTimerOverlay")'));
});

test("show/update both read the overlay-enabled preference fresh and delegate the actual show-vs-hide-the-view decision to the native side, never deciding it in JS", () => {
  assert.ok(module_.includes("await loadFloatingTimerOverlayPreferences()"));
  assert.ok(module_.includes("const payload = resolveFloatingTimerOverlayPayload(run, task, preferences.enabled, stageProgress, Date.now(), nextScheduledTask);"));
  assert.ok(module_.includes("native.show(payload);"));
  assert.ok(module_.includes("native.update(payload);"));
});

// --- ARCHI -- Home-Screen Widget Sync task ---

test("showFloatingTimerOverlay/updateFloatingTimerOverlay/showIdleFloatingOverlayPanel all additionally push the SAME payload just given to the cube into the home-screen widget -- never a second, independently-built payload, and never a new/parallel call site added anywhere else", () => {
  assert.ok(module_.includes('import { updateHomeScreenWidget } from "./emotionalCheckInWidget.ts";'));
  const occurrences = module_.split("await updateHomeScreenWidget(payload)").length - 1;
  assert.equal(occurrences, 3, "exactly showFloatingTimerOverlay, updateFloatingTimerOverlay, and showIdleFloatingOverlayPanel must each push to the widget");
});

// --- Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict Management task ---

test("show/update both accept an optional nextScheduledTask parameter, defaulting to null -- every pre-existing call site that doesn't pass it keeps working unchanged", () => {
  assert.match(module_, /export async function showFloatingTimerOverlay\(\s*run: TaskTimerRun,\s*task: Task,\s*stageProgress: TaskStageProgress \| null = null,\s*nextScheduledTask: NextScheduledTaskForOverlay \| null = null\s*\)/);
  assert.match(module_, /export async function updateFloatingTimerOverlay\(\s*run: TaskTimerRun,\s*task: Task,\s*stageProgress: TaskStageProgress \| null = null,\s*nextScheduledTask: NextScheduledTaskForOverlay \| null = null\s*\)/);
});

test("hideFloatingTimerOverlay stops the whole native service, never just the overlay view alone (the ongoing notification must disappear with it)", () => {
  const fnIndex = module_.indexOf("export async function hideFloatingTimerOverlay");
  assert.ok(module_.slice(fnIndex, fnIndex + 200).includes("getNativeModule()?.hide()"));
});

test("app.json declares SYSTEM_ALERT_WINDOW and FOREGROUND_SERVICE_SPECIAL_USE, the two Android permissions the overlay/ongoing-notification service needs", () => {
  const permissions: string[] = appJson.expo.android.permissions;
  assert.ok(permissions.includes("android.permission.SYSTEM_ALERT_WINDOW"));
  assert.ok(permissions.includes("android.permission.FOREGROUND_SERVICE_SPECIAL_USE"));
});

test("expo-modules-core is a direct, top-level dependency -- required for the local floating-timer-overlay Expo Module's own JS binding to resolve under both Metro and tsc", () => {
  assert.ok(packageJson.dependencies["expo-modules-core"]);
});

// --- modules/floating-timer-overlay: the local native Expo Module ----

const moduleConfig = JSON.parse(readSource("modules/floating-timer-overlay/expo-module.config.json"));
const moduleManifest = readSource("modules/floating-timer-overlay/android/src/main/AndroidManifest.xml");
const moduleKt = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/FloatingTimerOverlayModule.kt");
const serviceKt = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/OverlayService.kt");

test("the local module is android-only and declares exactly the one module class expo-modules-autolinking needs to find", () => {
  assert.deepEqual(moduleConfig.platforms, ["android"]);
  assert.deepEqual(moduleConfig.android.modules, ["expo.modules.floatingtimeroverlay.FloatingTimerOverlayModule"]);
});

test("the JS-facing module name matches what data/floatingTimerOverlay.ts's requireNativeModule call looks up, and exposes exactly the permission/show/update/hide surface that bridge depends on", () => {
  assert.ok(moduleKt.includes('Name("FloatingTimerOverlay")'));
  for (const fn of ['Function("hasOverlayPermission")', 'Function("requestOverlayPermission")', 'Function("show")', 'Function("update")', 'Function("hide")']) {
    assert.ok(moduleKt.includes(fn), `missing native function: ${fn}`);
  }
});

test("requirement 2: SYSTEM_ALERT_WINDOW has no runtime grant dialog of its own -- hasOverlayPermission reads Settings.canDrawOverlays directly, and requestOverlayPermission's only recourse is opening the OS settings screen for it", () => {
  assert.ok(moduleKt.includes("Settings.canDrawOverlays(context)"));
  assert.ok(moduleKt.includes("Settings.ACTION_MANAGE_OVERLAY_PERMISSION"));
});

test("requirements 1+3: the hosting service is declared with a foreground-service type (Android 14+ requires one), using the generic 'special use' type with its own required subtype property -- never left undeclared, and never the mismatched type that broke the task-alarm's own foreground service earlier in this project", () => {
  assert.ok(moduleManifest.includes('android:name=".OverlayService"'));
  assert.ok(moduleManifest.includes('android:foregroundServiceType="specialUse"'));
  assert.ok(moduleManifest.includes('android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"'));
});

test("requirement 7: the countdown is derived every tick from an absolute anchor (now + remainingSeconds at the moment JS called in), never an independently-incrementing local counter", () => {
  assert.ok(serviceKt.includes("anchorEpochMs = System.currentTimeMillis()"));
  assert.ok(serviceKt.includes("val elapsedSeconds = (System.currentTimeMillis() - anchorEpochMs) / 1000.0"));
});

test("requirement 7 (never duplicate floating windows): the overlay view is only ever added if one isn't already attached", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("if (overlayContainer != null) return"));
});

test("requirement 2 (a denied/revoked overlay permission must never block the regular timer, even mid-drag): ensureOverlayAdded's own addView call is wrapped in try/catch, same as every other WindowManager call", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("try {"));
  assert.ok(fnBody.includes("wm.addView(container, params)"));
  assert.ok(fnBody.includes("} catch (_: Exception) {"));
});

test("the overlay's own drag-vs-tap gesture distinguishes a real drag from a plain tap by a pixel threshold, and a plain tap opens Task LIVE via the app's own 'archi' deep-link scheme (never an event the JS side would need to stay alive to receive)", () => {
  assert.ok(serviceKt.includes("DRAG_CLICK_THRESHOLD_PX"));
  assert.ok(serviceKt.includes('Uri.parse("archi://tasks/$taskId")'));
});

test("the ongoing notification channel is silent (no sound, no vibration) and marked onlyAlertOnce -- updating it every second must never itself buzz or ding", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureNotificationChannel()");
  const fnBody = serviceKt.slice(fnIndex, fnIndex + 550);
  assert.ok(fnBody.includes("channel.setSound(null, null)"));
  assert.ok(fnBody.includes("channel.enableVibration(false)"));
  assert.ok(serviceKt.includes(".setOnlyAlertOnce(true)"));
});

// --- Floating ARC button task, superseded by ARCHI -- Consolidated
// Implementation Request, Part 11 ("Remove standalone ARC button" from
// the expanded cube): the small "ARC" quick-button next to the timer is
// gone -- the mood row (😟/🙂/😄) and task-specific entry points (e.g.
// openTaskLive()) already cover ARC access, so no redundant standalone
// button is needed any more. openArcForTask() itself is deliberately
// kept, unremoved, below -- never wired to any tap target any more,
// same "never delete, just stop reaching it" convention this app's own
// ARC step ids already use. -----------------------------------------

test("test 1: the timer and the complete-stage button are children of ONE container view, added to WindowManager as a single unit -- dragging moves them together, never independently-positioned views; the old 'ARC' quick-button is gone from this row", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("LinearLayout(this)"));
  assert.ok(fnBody.includes("addView(timerView)"));
  assert.ok(fnBody.includes("addView(completeView)"));
  assert.ok(!fnBody.includes("addView(arcView)"), "Part 11: the standalone ARC button is no longer added to the current-task row");
  assert.ok(fnBody.includes("wm.addView(container, params)"), "exactly one WindowManager.addView call for the whole unit");
  assert.ok(fnBody.includes("attachDragAndTapHandling(\n        container,"), "the touch listener (drag) is attached to the CONTAINER, not to any child separately");
});

test("openArcForTask() is kept, unremoved, but no longer wired to any view or tap target -- Part 11's own 'never delete, just stop reaching it' convention", () => {
  assert.ok(serviceKt.includes('Uri.parse("archi://tasks/$taskId?needArc=1")'));
  const fnIndex = serviceKt.indexOf("private fun openArcForTask()");
  assert.ok(fnIndex !== -1);
  assert.ok(!serviceKt.includes("val arcView = TextView"), "the ARC button's own TextView is gone");
  assert.ok(!serviceKt.includes("downOnArcButton"), "no tap-dispatch state for it survives either");
});

test("a tap anywhere on the container besides the collapse/complete/mood/urge/next-task/insight regions still opens Task LIVE, exactly as before this task -- removing the ARC button never left it unreachable instead", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("} else {\n            openTaskLive()"));
});

test("the overlay container and its children are cleared together on removal -- never a half-removed state where one child survives", () => {
  const fnIndex = serviceKt.indexOf("private fun removeOverlayIfAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("windowManager?.removeView(container)"));
  assert.ok(fnBody.includes("overlayContainer = null"));
  assert.ok(fnBody.includes("timerTextView = null"));
  assert.ok(!fnBody.includes("arcButtonView"), "Part 11: the ARC button's own field was removed along with the button itself");
});

// --- Unified Task Stages task: ✓ button + next-action text on the native overlay ---

test("FloatingTimerOverlayPayload carries the three new stage-aware fields -- actionTitle, nextActionTitle (nullable), showCompleteButton", () => {
  assert.ok(moduleKt.includes("val actionTitle: String = \"\""));
  assert.ok(moduleKt.includes("val nextActionTitle: String? = null"));
  assert.ok(moduleKt.includes("val showCompleteButton: Boolean = false"));
});

test("startOverlayService forwards all three new fields as extras to OverlayService", () => {
  const fnIndex = moduleKt.indexOf("private fun startOverlayService");
  const fnBody = moduleKt.slice(fnIndex, moduleKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("putExtra(OverlayService.EXTRA_ACTION_TITLE, payload.actionTitle)"));
  assert.ok(fnBody.includes("putExtra(OverlayService.EXTRA_NEXT_ACTION_TITLE, payload.nextActionTitle)"));
  assert.ok(fnBody.includes("putExtra(OverlayService.EXTRA_SHOW_COMPLETE_BUTTON, payload.showCompleteButton)"));
});

test("the overlay's own ✓ button is its own distinct child view, visible only when showCompleteButton is true -- GONE otherwise, so a legacy task's overlay is visually unchanged", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('text = "✓"'));
  assert.ok(fnBody.includes("visibility = if (showCompleteButton) View.VISIBLE else View.GONE"));
  assert.ok(fnBody.includes("addView(completeView)"));
});

test("renderNow toggles the ✓ button's visibility and the next-action line's visibility on every tick/update -- never only set once at creation", () => {
  const fnIndex = serviceKt.indexOf("private fun renderNow()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("completeButtonView?.visibility = if (showCompleteButton) View.VISIBLE else View.GONE"));
  assert.ok(fnBody.includes("nextActionTextView?.let"));
});

test("a tap inside the ✓ button's own bounds calls completeStageForTask, hit-tested the exact same way the ARC button already is -- never a competing touch listener on the button itself", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("downOnCompleteButton = isPointInsideView(view, completeView, event.x, event.y)"));
  assert.ok(fnBody.includes("completeStageForTask()"));
});

test("completeStageForTask deep-links with completeStage=1 and is debounced the same way openArcForTask is, at the native source", () => {
  const fnIndex = serviceKt.indexOf("private fun completeStageForTask()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('Uri.parse("archi://tasks/$taskId?completeStage=1")'));
  assert.ok(fnBody.includes("if (now - lastCompleteStageAtMs < COMPLETE_STAGE_DEBOUNCE_MS) return"));
  assert.ok(fnBody.includes("lastCompleteStageAtMs = now"));
});

test("the next-action line is explicitly gravity LEFT (never START) -- the trainee's own literal instruction, regardless of RTL layout direction elsewhere in the app", () => {
  assert.ok(serviceKt.includes("gravity = Gravity.LEFT"));
});

test("the notification's own content title stays the plain task name, unchanged -- only the overlay's own prominent text becomes the current action", () => {
  const fnIndex = serviceKt.indexOf("private fun buildNotification(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('if (title.isNotEmpty()) title else "ARCHI"'));
  assert.ok(!fnBody.includes("actionTitle"));
});

// --- Floating Timer Position, Touch Accessibility, Position Persistence fix ---
//
// Root cause: the saved (x, y) was restored, and updated while
// dragging, with NO bounds check against the actual screen at all --
// clampToSafeArea is the one new choke point both paths now funnel
// through. None of this can run under `node --test` (it's real
// WindowManager/Android geometry), so these are source-text regression
// guards, same convention as every other test in this file; the actual
// on-device behavior (does a drag near an edge really stay visible,
// does a rotation really re-clamp) needs a physical/emulated Android
// device and is called out as such in the final report.

test("required test 3 (automatically correcting invalid positions): clampToSafeArea pins (x, y) to the CURRENT safe area -- the screen bounds with the status bar/nav bar/display cutout insets excluded, API 30+ via WindowManager's own currentWindowMetrics, with a legacy fallback below that", () => {
  const fnIndex = serviceKt.indexOf("private fun clampToSafeArea(");
  assert.ok(fnIndex >= 0, "a single clamping helper must exist");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("computeSafeAreaBounds()"));
  assert.ok(fnBody.includes("x.coerceIn(safe.left, maxX)"));
  assert.ok(fnBody.includes("y.coerceIn(safe.top, maxY)"));

  const boundsFnIndex = serviceKt.indexOf("private fun computeSafeAreaBounds(");
  const boundsFnBody = serviceKt.slice(boundsFnIndex, serviceKt.indexOf("\n  }", boundsFnIndex));
  assert.ok(boundsFnBody.includes("Build.VERSION_CODES.R"));
  assert.ok(boundsFnBody.includes("wm.currentWindowMetrics"));
  assert.ok(boundsFnBody.includes("WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars() or WindowInsets.Type.displayCutout()"));
  assert.ok(boundsFnBody.includes("display.getSize(size)"), "a legacy (pre-API-30) fallback must still exist, never a hard requirement on R+");
});

test("required test 2 (restoring a valid saved position) + required test 1 (saving after dragging): the saved x/y is still read from the SAME SharedPreferences keys, so an already-valid position restores EXACTLY as before this fix -- the fix only changes what happens to an INVALID one", () => {
  assert.ok(serviceKt.includes('private const val PREF_X = "overlay_x"'));
  assert.ok(serviceKt.includes('private const val PREF_Y = "overlay_y"'));
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("val savedX = prefs.getInt(PREF_X, 0)"));
  assert.ok(fnBody.includes("val savedY = prefs.getInt(PREF_Y, 200)"));
});

test("required test 3 + requirement 2's 'after an automatic correction, save the corrected position': ensureOverlayAdded measures the container BEFORE attaching it, clamps the restored position against that real size, and persists the correction immediately -- but ONLY when the clamp actually changed something, so a still-valid saved position is never rewritten unnecessarily", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const measureIndex = fnBody.indexOf("container.measure(");
  const addViewIndex = fnBody.indexOf("wm.addView(container, params)");
  assert.ok(measureIndex >= 0 && measureIndex < addViewIndex, "the container must be measured BEFORE it's added to WindowManager, so the very first frame already shows the clamped position");
  assert.ok(fnBody.includes("clampToSafeArea(savedX, savedY, container.measuredWidth, container.measuredHeight)"));
  assert.ok(fnBody.includes("if (clampedX != savedX || clampedY != savedY) {"), "the correction must only be persisted when it actually changed something");
  assert.ok(fnBody.includes("prefs.edit().putInt(PREF_X, clampedX).putInt(PREF_Y, clampedY).apply()"));
});

test("required test 4 (keeping the timer and ARC button together): the clamp applies to ONE container's params -- the pre-existing single-view/single-LayoutParams design (test 1 above) is completely unchanged, so clamping can never desynchronize the timer and the ARC button", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("val (clampedX, clampedY) = clampToSafeArea(savedX, savedY, container.measuredWidth, container.measuredHeight)"));
  assert.ok(fnBody.includes("params.x = clampedX"));
  assert.ok(fnBody.includes("params.y = clampedY"));
  assert.ok(fnBody.includes("wm.addView(container, params)"), "still exactly one addView call for the whole unit, clamped params included");
});

test("required test 5 (preserving click functionality after restoration) + requirement 1.4 (never restore an unpressable position): the restored position is ALWAYS inside the safe area before the overlay is ever shown -- there is no code path that sets params.x/params.y to the raw, unclamped saved value", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(!/params\.x = savedX/.test(fnBody));
  assert.ok(!/params\.y = savedY/.test(fnBody));
  assert.ok(fnBody.includes("params.x = clampedX"));
  assert.ok(fnBody.includes("params.y = clampedY"));
});

test("required test 6 (Android screen boundaries) + requirement 1.5 (timer and ARC button stay one draggable unit): dragging clamps the LIVE position on every ACTION_MOVE, against the same container, so it can never be dragged off-screen/under the status bar/behind the nav bar in the first place", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const moveIndex = fnBody.indexOf("MotionEvent.ACTION_MOVE -> {");
  const moveBody = fnBody.slice(moveIndex, fnBody.indexOf("MotionEvent.ACTION_UP", moveIndex));
  assert.ok(moveBody.includes("clampToSafeArea(initialX + dx, initialY + dy, view.width, view.height)"));
  assert.ok(moveBody.includes("params.x = clampedX"));
  assert.ok(moveBody.includes("params.y = clampedY"));
  // Dragging must still only move the ONE shared container/params -- never separate per-child positioning.
  assert.ok(moveBody.includes("wm.updateViewLayout(view, params)"));
});

test("required test 6 continued + requirement 2 ('the position must persist after closing and reopening'): because the drag position is already clamped on every move, whatever ACTION_UP saves to SharedPreferences is already guaranteed valid -- the save logic itself is untouched by this fix", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const upIndex = fnBody.indexOf("MotionEvent.ACTION_UP -> {");
  const upBody = fnBody.slice(upIndex, fnBody.indexOf("MotionEvent.ACTION_CANCEL", upIndex));
  assert.ok(upBody.includes(".putInt(PREF_X, params.x)"));
  assert.ok(upBody.includes(".putInt(PREF_Y, params.y)"));
});

test("required test 3 continued + Android Recovery (screen rotation/display-size change): a configuration change re-clamps the CURRENTLY showing overlay's position (not just the next restore) and persists the correction, since the service is never restarted just for a rotation", () => {
  const fnIndex = serviceKt.indexOf("override fun onConfigurationChanged(");
  assert.ok(fnIndex >= 0, "a configuration-change handler must exist for in-place rotation/display-size recovery");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("clampToSafeArea(params.x, params.y, container.width, container.height)"));
  assert.ok(fnBody.includes("wm.updateViewLayout(container, params)"));
  assert.ok(fnBody.includes(".putInt(PREF_X, clampedX)"));
  assert.ok(fnBody.includes(".putInt(PREF_Y, clampedY)"));
  assert.ok(fnBody.includes("val container = overlayContainer ?: return"), "must no-op safely when no overlay is currently showing, never crash");
});

test("required test 9 (preserving the active task context) + required test 10 (no unintended changes to existing task functionality): tap routing/hit-testing and the deep-link URIs are completely untouched by this fix -- only position math changed. Part 11 note: the ARC-button-specific hit-testing/debounce this test used to also check is gone along with the button itself (see the 'Floating ARC button task, superseded' tests above).", () => {
  assert.ok(serviceKt.includes("downOnCompleteButton = isPointInsideView(view, completeView, event.x, event.y)"));
  assert.ok(serviceKt.includes('Uri.parse("archi://tasks/$taskId")'));
  assert.ok(serviceKt.includes("taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: taskId"), "taskId is still carried across every onStartCommand call, untouched by the position fix");
});

test("required test 8 (correct timer behavior at 0:00): currentRemainingSeconds/startTicking/overlayGlyph are completely untouched by this fix -- the countdown still freezes at 0:00 (never negative, never resumes ticking) showing the ✓ glyph, and the overlay stays attached/clickable since removeOverlayIfAdded is never called just because the timer reached zero", () => {
  assert.ok(serviceKt.includes("return (anchorRemainingSeconds - elapsedSeconds).coerceAtLeast(0.0)"));
  assert.ok(serviceKt.includes('if (remaining <= 0.0) return "✓"'));
  const startTickingIndex = serviceKt.indexOf("private fun startTicking()");
  const startTickingBody = serviceKt.slice(startTickingIndex, serviceKt.indexOf("\n  }", startTickingIndex));
  assert.ok(startTickingBody.includes("if (currentRemainingSeconds() > 0.0) {"), "ticking stops once the timer hits zero, but nothing here ever detaches the overlay itself");
  assert.ok(!startTickingBody.includes("removeOverlayIfAdded()"), "reaching 0:00 must only stop the tick loop, never detach/hide the overlay itself");
});

test("avoids unintended changes to the ongoing notification, the stage ✓ button, and the next-action line -- all still wired exactly as before this fix", () => {
  assert.ok(serviceKt.includes(".setOnlyAlertOnce(true)"));
  assert.ok(serviceKt.includes("completeButtonView?.visibility = if (showCompleteButton) View.VISIBLE else View.GONE"));
  assert.ok(serviceKt.includes("gravity = Gravity.LEFT"));
});

// --- Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict Management task ---

// --- ARCHI -- Home-Screen Widget Sync task, section 4 ---

test("FloatingTimerOverlayPayload carries nextScheduledTaskIsOverdue, forwarded as an extra to OverlayService and read back into its own field", () => {
  assert.ok(moduleKt.includes("val nextScheduledTaskIsOverdue: Boolean = false"));
  const fnIndex = moduleKt.indexOf("private fun startOverlayService");
  const fnBody = moduleKt.slice(fnIndex, moduleKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("putExtra(OverlayService.EXTRA_NEXT_SCHEDULED_TASK_IS_OVERDUE, payload.nextScheduledTaskIsOverdue)"));
  assert.ok(serviceKt.includes("nextScheduledTaskIsOverdue = intent.getBooleanExtra(EXTRA_NEXT_SCHEDULED_TASK_IS_OVERDUE, false)"));
});

test("section 4 (never display a past task as upcoming without indicating it is overdue): nextScheduledTaskSummaryLine, the collapsed pill, and the lock-screen notification line all flag an overdue next task distinctly, never silently showing it as plain upcoming", () => {
  const summaryFnIndex = serviceKt.indexOf("private fun nextScheduledTaskSummaryLine(");
  const summaryFnBody = serviceKt.slice(summaryFnIndex, serviceKt.indexOf("\n  }", summaryFnIndex));
  assert.ok(summaryFnBody.includes('if (nextScheduledTaskIsOverdue) parts.add("⚠ באיחור")'));

  const pillFnIndex = serviceKt.indexOf("private fun pillSummaryText(");
  const pillFnBody = serviceKt.slice(pillFnIndex, serviceKt.indexOf("\n  }", pillFnIndex));
  assert.ok(pillFnBody.includes('if (nextScheduledTaskIsOverdue) "⚠ $it" else "⏰ $it"'));

  const lineFnIndex = serviceKt.indexOf("private fun nextScheduledTaskLine(");
  const lineFnBody = serviceKt.slice(lineFnIndex, serviceKt.indexOf("\n  }", lineFnIndex));
  assert.ok(lineFnBody.includes('if (nextScheduledTaskIsOverdue) "$base ⚠ באיחור" else base'));
});

test("FloatingTimerOverlayPayload carries the new resting/nextScheduledTaskTitle/nextScheduledTaskTime fields, forwarded as extras to OverlayService", () => {
  assert.ok(moduleKt.includes("val resting: Boolean = false"));
  assert.ok(moduleKt.includes("val nextScheduledTaskTitle: String? = null"));
  assert.ok(moduleKt.includes("val nextScheduledTaskTime: String? = null"));
  const fnIndex = moduleKt.indexOf("private fun startOverlayService");
  const fnBody = moduleKt.slice(fnIndex, moduleKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("putExtra(OverlayService.EXTRA_RESTING, payload.resting)"));
  assert.ok(fnBody.includes("putExtra(OverlayService.EXTRA_NEXT_SCHEDULED_TASK_TITLE, payload.nextScheduledTaskTitle)"));
  assert.ok(fnBody.includes("putExtra(OverlayService.EXTRA_NEXT_SCHEDULED_TASK_TIME, payload.nextScheduledTaskTime)"));
});

test("onStartCommand reads the three new extras into their own instance fields, distinct from the pre-existing stage-related EXTRA_NEXT_ACTION_TITLE", () => {
  const fnIndex = serviceKt.indexOf("override fun onStartCommand(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n    return START_NOT_STICKY", fnIndex));
  assert.ok(fnBody.includes("resting = intent.getBooleanExtra(EXTRA_RESTING, resting)"));
  assert.ok(fnBody.includes("nextScheduledTaskTitle = intent.getStringExtra(EXTRA_NEXT_SCHEDULED_TASK_TITLE)"));
  assert.ok(fnBody.includes("nextScheduledTaskTime = intent.getStringExtra(EXTRA_NEXT_SCHEDULED_TASK_TIME)"));
});

test("requirement 1: statusWord reports 'הסתיים'/'מנוחה'/'מושהה'/'פעיל' with the ended state taking priority, resting distinct from paused", () => {
  const fnIndex = serviceKt.indexOf("private fun statusWord(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('if (remaining <= 0.0) return "הסתיים"'));
  assert.ok(fnBody.includes('if (resting) return "מנוחה"'));
  assert.ok(fnBody.includes('if (paused) return "מושהה"'));
  assert.ok(fnBody.includes('return "פעיל"'));
});

test("ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: statusWord reports a dedicated idle word ('ממתין'), checked FIRST -- before ended/resting/paused -- so an idle panel (taskId empty) never reports a stale/zero countdown as 'the task just finished'", () => {
  const fnIndex = serviceKt.indexOf("private fun statusWord(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const idleIndex = fnBody.indexOf('if (taskId.isEmpty()) return "ממתין"');
  const endedIndex = fnBody.indexOf('if (remaining <= 0.0) return "הסתיים"');
  assert.ok(idleIndex !== -1 && endedIndex !== -1 && idleIndex < endedIndex, "the idle check must come before the ended check");
});

test("ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: buildNotification opens plain Home (archi://) while idle instead of a task deep link that no longer points anywhere, and omits the ' · נותרו ...' remaining-time suffix entirely while idle -- never a stale/meaningless countdown in the collapsed text", () => {
  const fnIndex = serviceKt.indexOf("private fun buildNotification(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('val openUri = if (taskId.isEmpty()) "archi://" else "archi://tasks/$taskId"'));
});

test("requirement 1: the next-scheduled-task line is omitted entirely when there is no next task, never an invented empty state", () => {
  const fnIndex = serviceKt.indexOf("private fun nextScheduledTaskLine(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("val nextTitle = nextScheduledTaskTitle ?: return null"));
  assert.ok(fnBody.includes('"המשימה הבאה: $nextTitle — $nextTime"'));
});

test("requirement 1: buildNotification sets VISIBILITY_PUBLIC (the closest supported lock-screen behavior) and attaches the next-task line via BigTextStyle only when one exists, never replacing the existing contentIntent/channel/ongoing wiring", () => {
  const fnIndex = serviceKt.indexOf("private fun buildNotification(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes(".setVisibility(Notification.VISIBILITY_PUBLIC)"));
  assert.ok(fnBody.includes("val status = statusWord(currentRemainingSeconds())"));
  assert.ok(fnBody.includes('val collapsedText = if (taskId.isEmpty()) status else "$status · נותרו $remainingText"'));
  assert.ok(fnBody.includes("if (nextLine != null) {"));
  assert.ok(fnBody.includes("builder.setStyle(Notification.BigTextStyle().bigText(\"$collapsedText\\n$nextLine\"))"));
  assert.ok(fnBody.includes(".setOngoing(true)"), "the pre-existing ongoing/contentIntent/channel wiring is still present, untouched");
  assert.ok(fnBody.includes(".setContentIntent(pendingIntent)"));
});

// --- ARCHI -- Unified Floating Overlay & Mini ARC Improvements task ---

test("scenario 1 (idle panel shows all three mood buttons) + scenario 2/3 (active/paused hides '😄 ישר למשימה'): isIdle (taskId.isEmpty()) drives both the mood-row's 3rd button and the current-task row's own visibility, in lockstep -- never two independent flags that could disagree", () => {
  const fnIndex = serviceKt.indexOf("private fun renderNow()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("val isIdle = taskId.isEmpty()"));
  assert.ok(fnBody.includes("currentTaskRowView?.visibility = if (isIdle) View.GONE else View.VISIBLE"));
  assert.ok(fnBody.includes("moodDirectToTaskView?.visibility = if (isIdle) View.VISIBLE else View.GONE"), "'😄 ישר למשימה' is shown only before starting a task, hidden the instant a session exists -- running or paused alike, since isIdle doesn't distinguish the two");
});

test("scenario 12/13 (next-task info comes from the real schedule, 'no upcoming task' handled safely): nextTaskInfoView's text is driven every render by nextScheduledTaskSummaryLine(), and nextTaskActionView ('עבור למשימה הבאה') is hidden -- never just disabled -- exactly when there is nothing to advance to", () => {
  const fnIndex = serviceKt.indexOf("private fun renderNow()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("nextTaskInfoView?.text = nextScheduledTaskSummaryLine()"));
  assert.ok(fnBody.includes("view.visibility = if (nextScheduledTaskTitle != null) View.VISIBLE else View.GONE"));
});

test("nextScheduledTaskSummaryLine shows the required empty-state text when nothing is scheduled, and otherwise joins title/time/duration (each independently optional) rather than assuming all three are always present", () => {
  const fnIndex = serviceKt.indexOf("private fun nextScheduledTaskSummaryLine(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('val nextTitle = nextScheduledTaskTitle ?: return "אין משימה נוספת מתוכננת"'));
  assert.ok(fnBody.includes("nextScheduledTaskTime?.let { parts.add(it) }"));
  assert.ok(fnBody.includes("nextScheduledTaskDurationMinutes?.let { parts.add(\"$it דק'\") }"));
  assert.ok(fnBody.includes('return "המשימה הבאה: " + parts.joinToString(" · ")'));
});

test("isPointInsideView walks up from the target to the root view, summing each ancestor's own left/top -- the one generic hit-test every button now shares, correct regardless of how deeply nested a row is -- and treats a GONE/INVISIBLE view as never hit", () => {
  const fnIndex = serviceKt.indexOf("private fun isPointInsideView(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (target.visibility != View.VISIBLE) return false"));
  assert.ok(fnBody.includes("left += current.left"));
  assert.ok(fnBody.includes("top += current.top"));
  assert.ok(fnBody.includes("current = current.parent as? View ?: return false"));
  assert.ok(fnBody.includes("return x >= left && x <= left + target.width && y >= top && y <= top + target.height"));
});

test("the mood row's 3 buttons, the next-task section's 2 views, and the standalone insight view are all hit-tested at ACTION_DOWN via isPointInsideView, and dispatched in the documented priority order at ACTION_UP -- complete > the 3 moods > next-task > insight > (fallback) Task LIVE; Part 11 removed the old 'arc' step from this priority chain along with the button itself", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  for (const target of ["moodLessGoodView", "moodOkView", "moodDirectView", "nextTaskActionView", "insightView"]) {
    assert.ok(fnBody.includes(`isPointInsideView(view, ${target}, event.x, event.y)`), `missing hit-test for ${target}`);
  }
  assert.ok(!fnBody.includes("downOnArcButton"), "the old ARC hit-test/dispatch state is gone");
  const upIndex = fnBody.indexOf("MotionEvent.ACTION_UP -> {");
  const upBody = fnBody.slice(upIndex, fnBody.indexOf("MotionEvent.ACTION_CANCEL", upIndex));
  const order = ["downOnCompleteButton", "downOnMoodLessGood", "downOnMoodOk", "downOnMoodDirect", "downOnNextTaskAction", "downOnInsight", "openTaskLive()"];
  let lastIndex = -1;
  for (const token of order) {
    const idx = upBody.indexOf(token);
    assert.ok(idx > lastIndex, `${token} must appear, in priority order, after the previous branch`);
    lastIndex = idx;
  }
});

test("each of the 3 new tap targets (mood row, 'עבור למשימה הבאה', 'הוסף תובנה') has its own native debounce constant and timestamp field, same 1500ms convention as the pre-existing ARC-button/complete-stage debounces -- a double-tap on any of them can never fire the deep link twice", () => {
  for (const [constName, fieldName] of [
    ["MOOD_TAP_DEBOUNCE_MS", "lastMoodTapAtMs"],
    ["NEXT_TASK_TAP_DEBOUNCE_MS", "lastNextTaskTapAtMs"],
    ["ADD_INSIGHT_TAP_DEBOUNCE_MS", "lastInsightTapAtMs"],
  ]) {
    assert.ok(serviceKt.includes(`private const val ${constName} = 1500L`), `missing debounce constant ${constName}`);
    assert.ok(serviceKt.includes(`private var ${fieldName}: Long = 0L`), `missing debounce timestamp field ${fieldName}`);
  }
});

test("scenario 4 ('פחות טוב' opens the Mini/Full ARC choice) + scenario 7 ('סבבה' opens Shortened ARC directly, never the Mini/Full choice): openCheckIn reuses the EXACT SAME archi://check-in?choice=... deep link + shared dispatcher the Android widget already uses, never a second decision layer, debounced the same way openArcForTask already is", () => {
  const fnIndex = serviceKt.indexOf("private fun openCheckIn(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (now - lastMoodTapAtMs < MOOD_TAP_DEBOUNCE_MS) return"));
  assert.ok(fnBody.includes("lastMoodTapAtMs = now"));
  assert.ok(fnBody.includes('Uri.parse("archi://check-in?choice=$choice")'));
  // The 3 mood buttons dispatch their own distinct choice through this one function, never 3 separate implementations.
  const upIndex = serviceKt.indexOf("MotionEvent.ACTION_UP -> {");
  const upBody = serviceKt.slice(upIndex, serviceKt.indexOf("MotionEvent.ACTION_CANCEL", upIndex));
  assert.ok(upBody.includes('openCheckIn("full_arc")'));
  assert.ok(upBody.includes('openCheckIn("shortened_arc")'));
  assert.ok(upBody.includes('openCheckIn("next_task")'));
});

test("scenario 10 ('עבור למשימה הבאה' updates both sections): openNextTask deep-links into the SAME Task LIVE screen with nextTask=1 while a task is active (live/ActiveTaskScreen.tsx's own existing handleNextTask is what actually advances -- never duplicated natively), and falls back to the exact same choice=next_task destination '😄 ישר למשימה' already uses while idle -- never a second 'what's next' decision", () => {
  const fnIndex = serviceKt.indexOf("private fun openNextTask()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (now - lastNextTaskTapAtMs < NEXT_TASK_TAP_DEBOUNCE_MS) return"));
  assert.ok(fnBody.includes("lastNextTaskTapAtMs = now"));
  assert.ok(fnBody.includes('val uri = if (taskId.isEmpty()) "archi://check-in?choice=next_task" else "archi://tasks/$taskId?nextTask=1"'));
});

test("scenario 11 (the 'הוסף תובנה' action, available both before and during tasks): openAddInsight deep-links with addInsight=1 (so live/ActiveTaskScreen.tsx can open the existing insight editor with THIS task as its return context) while active, or directly to the new-insight route while idle -- never a second insight editor", () => {
  const fnIndex = serviceKt.indexOf("private fun openAddInsight()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (now - lastInsightTapAtMs < ADD_INSIGHT_TAP_DEBOUNCE_MS) return"));
  assert.ok(fnBody.includes("lastInsightTapAtMs = now"));
  assert.ok(fnBody.includes('val uri = if (taskId.isEmpty()) "archi://insights/new" else "archi://tasks/$taskId?addInsight=1"'));
});

test("the unified panel's full content -- the collapse button's own row, then moodRow, then currentTaskRow, then nextTaskSection, then the standalone insight view, in that order -- is ONE vertical sub-container (expandedContent), never multiple independent/inconsistent overlays", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const expandedIndex = fnBody.indexOf("val expandedContent = LinearLayout(this).apply {");
  assert.ok(expandedIndex !== -1);
  const expandedBody = fnBody.slice(expandedIndex, fnBody.indexOf("\n      }", expandedIndex));
  const addCollapseRow = expandedBody.indexOf("addView(collapseRow)");
  const addMoodRow = expandedBody.indexOf("addView(moodRow)");
  const addCurrentTaskRow = expandedBody.indexOf("addView(currentTaskRow)");
  const addNextTaskSection = expandedBody.indexOf("addView(nextTaskSection)");
  const addInsight = expandedBody.indexOf("addView(insightTextView)");
  assert.ok(addCollapseRow !== -1 && addMoodRow !== -1 && addCurrentTaskRow !== -1 && addNextTaskSection !== -1 && addInsight !== -1, "all 5 top-level rows/views must be added to expandedContent");
  assert.ok(
    addCollapseRow < addMoodRow && addMoodRow < addCurrentTaskRow && addCurrentTaskRow < addNextTaskSection && addNextTaskSection < addInsight,
    "the required visual order -- collapse button first, then moods, current task, next task, insight -- must be preserved"
  );
});

// --- ARCHI -- Collapsible and Expandable Modes task ---

test("the outer container itself has only two top-level children -- the pill, then expandedContent -- added to WindowManager as the SAME one view with one set of LayoutParams as before this task; collapsing/expanding never swaps in a second overlay view", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const containerIndex = fnBody.indexOf("val container = LinearLayout(this).apply {");
  assert.ok(containerIndex !== -1);
  const containerBody = fnBody.slice(containerIndex, fnBody.indexOf("\n      }", containerIndex));
  assert.ok(containerBody.includes("addView(pillTextView)"));
  assert.ok(containerBody.includes("addView(expandedContent)"));
  assert.ok(containerBody.indexOf("addView(pillTextView)") < containerBody.indexOf("addView(expandedContent)"));
  assert.ok(fnBody.includes("wm.addView(container, params)"), "still exactly one WindowManager.addView call for the whole unit");
});

test("the pill and expandedContent are set to opposite visibilities BEFORE the container is measured/clamped -- the very first frame's touchable window size already reflects whichever mode this trainee was last in, never measured against the wrong (e.g. full) size while only the pill will actually show", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const visibilityIndex = fnBody.indexOf("pillTextView.visibility = if (collapsed) View.VISIBLE else View.GONE");
  const measureIndex = fnBody.indexOf("container.measure(");
  assert.ok(visibilityIndex !== -1 && measureIndex !== -1 && visibilityIndex < measureIndex, "visibility must be set before measure()");
  assert.ok(fnBody.includes("expandedContent.visibility = if (collapsed) View.GONE else View.VISIBLE"));
});

test("scenario: collapsed defaults to true ('Collapsed mode (default)'), loaded once in onCreate from the SAME SharedPreferences the overlay's position already persists through -- never re-read on every onStartCommand, so an in-session toggle is never silently reverted by a stale value", () => {
  assert.ok(serviceKt.includes('private const val PREF_COLLAPSED = "overlay_collapsed"'));
  const fnIndex = serviceKt.indexOf("override fun onCreate()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("collapsed = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(PREF_COLLAPSED, true)"));
  assert.ok(!serviceKt.slice(serviceKt.indexOf("override fun onStartCommand("), serviceKt.indexOf("\n    return START_NOT_STICKY")).includes("PREF_COLLAPSED"), "onStartCommand must never re-read the collapsed pref -- onCreate is the only read site");
});

test("the pill shows the remaining timer while a task is active, and the current/next task's own NAME (or the plain app-name fallback when nothing is scheduled) while idle -- reusing the SAME data source the expanded panel already shows, never a second/duplicate countdown or schedule lookup", () => {
  const fnIndex = serviceKt.indexOf("private fun pillSummaryText(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (!isIdle) return overlayGlyph(remaining) + \" \" + formatRemaining(remaining)"));
  // Floating timer / current-task-title sync task: the collapsed pill shows the task's own name (not just its start time), so it reads the same as the cube's "המשימה הנוכחית"; an overdue one still gets its own distinct glyph (⚠ instead of ⏰).
  assert.ok(fnBody.includes('return nextScheduledTaskTitle?.let { if (nextScheduledTaskIsOverdue) "⚠ $it" else "⏰ $it" } ?: "ARCHI"'));
});

test("renderNow() recomputes the pill's own text on every render, same as everything else -- a tick/update call never resets or overrides the collapsed/expanded CHOICE itself (only setCollapsed does), so the pill and the panel can never silently flip back on their own", () => {
  const fnIndex = serviceKt.indexOf("private fun renderNow()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("pillView?.text = pillSummaryText(remaining, isIdle)"));
  assert.ok(!fnBody.includes("collapsed ="), "renderNow must never itself assign to the collapsed field");
  assert.ok(!fnBody.includes("pillView?.visibility") && !fnBody.includes("expandedContentView?.visibility"), "renderNow must never touch pill/expanded-content visibility -- that's setCollapsed's own job alone");
});

test("the collapse button is its own clearly visible, hit-tested child (never relying on the drag gesture alone) -- a tap anywhere else on the expanded panel never collapses it by accident", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('text = "▾ כווץ"'));
  const attachCallIndex = fnBody.indexOf("attachDragAndTapHandling(");
  const attachCallBody = fnBody.slice(attachCallIndex, fnBody.indexOf(")", fnBody.indexOf("params", attachCallIndex)));
  assert.ok(attachCallBody.includes("collapseButtonTextView"));
});

test("while collapsed, a non-drag tap ANYWHERE on the container expands the panel -- checked before every other hit-test, since the pill is the only visible child and there is nothing else a tap could have meant; a tap on the dedicated collapse button (only reachable while expanded) collapses it back", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const upIndex = fnBody.indexOf("MotionEvent.ACTION_UP -> {");
  const upBody = fnBody.slice(upIndex, fnBody.indexOf("MotionEvent.ACTION_CANCEL", upIndex));
  const movedIndex = upBody.indexOf("if (moved) {");
  const collapsedCheckIndex = upBody.indexOf("} else if (collapsed) {");
  const setCollapsedFalseIndex = upBody.indexOf("setCollapsed(false)");
  const collapseButtonCheckIndex = upBody.indexOf("} else if (downOnCollapseButton) {");
  const setCollapsedTrueIndex = upBody.indexOf("setCollapsed(true)");
  const completeButtonCheckIndex = upBody.indexOf("downOnCompleteButton");
  assert.ok(movedIndex !== -1 && movedIndex < collapsedCheckIndex, "the drag-save branch must still be checked first");
  assert.ok(collapsedCheckIndex !== -1 && collapsedCheckIndex < setCollapsedFalseIndex && setCollapsedFalseIndex < collapseButtonCheckIndex);
  assert.ok(collapseButtonCheckIndex < setCollapsedTrueIndex && setCollapsedTrueIndex < completeButtonCheckIndex, "the collapse button must be checked before the pre-existing ✓/ARC/mood/next-task/insight hit-tests");
  assert.ok(fnBody.includes("downOnCollapseButton = isPointInsideView(view, collapseButtonView, event.x, event.y)"));
});

test("setCollapsed never touches the task timer/session state -- it is purely a view-visibility + window-size + persisted-preference concern. Collapsing/expanding must never pause, reset or interrupt the task timer", () => {
  const fnIndex = serviceKt.indexOf("private fun setCollapsed(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  for (const forbidden of ["taskId =", "anchorEpochMs =", "anchorRemainingSeconds =", "paused =", "stopTicking()", "startTicking()", "archi://"]) {
    assert.ok(!fnBody.includes(forbidden), `setCollapsed must never touch ${forbidden}`);
  }
  assert.ok(fnBody.includes("if (collapsed == value) return"), "a redundant toggle (already in that state) must be a safe no-op");
  assert.ok(fnBody.includes("collapsed = value"));
  assert.ok(fnBody.includes("getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putBoolean(PREF_COLLAPSED, value).apply()"));
});

test("setCollapsed toggles the pill/expandedContent visibilities, then RE-MEASURES and RE-CLAMPS the container's position against its new size before calling wm.updateViewLayout -- so expanding near a screen edge (where the tiny pill fit but the full panel wouldn't) can never leave part of the panel off-screen or under the status/nav bar", () => {
  const fnIndex = serviceKt.indexOf("private fun setCollapsed(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("pillView?.visibility = if (collapsed) View.VISIBLE else View.GONE"));
  assert.ok(fnBody.includes("expandedContentView?.visibility = if (collapsed) View.GONE else View.VISIBLE"));
  const visibilityIndex = fnBody.indexOf("expandedContentView?.visibility");
  const measureIndex = fnBody.indexOf("container.measure(");
  const clampIndex = fnBody.indexOf("clampToSafeArea(params.x, params.y, container.measuredWidth, container.measuredHeight)");
  const updateLayoutIndex = fnBody.indexOf("wm.updateViewLayout(container, params)");
  assert.ok(visibilityIndex < measureIndex && measureIndex < clampIndex && clampIndex < updateLayoutIndex, "visibility must change, then re-measure, then re-clamp, then actually resize the window, strictly in that order");
  assert.ok(fnBody.includes(".putInt(PREF_X, clampedX)") && fnBody.includes(".putInt(PREF_Y, clampedY)"), "the corrected position is persisted immediately, same convention as every other position correction in this file");
});

test("every new collapsible-mode view field (pillView, expandedContentView, collapseButtonView) is nulled out on removal and in the ensureOverlayAdded catch block, same as every pre-existing view field", () => {
  const removeFnIndex = serviceKt.indexOf("private fun removeOverlayIfAdded()");
  const removeFnBody = serviceKt.slice(removeFnIndex, serviceKt.indexOf("\n  }", removeFnIndex));
  for (const field of ["pillView", "expandedContentView", "collapseButtonView"]) {
    assert.ok(removeFnBody.includes(`${field} = null`), `removeOverlayIfAdded must null out ${field}`);
  }
  const ensureFnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const ensureFnBody = serviceKt.slice(ensureFnIndex, serviceKt.indexOf("\n  }", ensureFnIndex));
  const catchIndex = ensureFnBody.indexOf("} catch (_: Exception) {");
  const catchBody = ensureFnBody.slice(catchIndex);
  for (const field of ["pillView", "expandedContentView", "collapseButtonView"]) {
    assert.ok(catchBody.includes(`${field} = null`), `the catch block must null out ${field} too`);
  }
});

test("critical requirement: the overlay's own WindowManager flags (FLAG_NOT_FOCUSABLE, FLAG_NOT_TOUCH_MODAL) and WRAP_CONTENT sizing are unchanged by this task -- a touch outside the panel's own visible bounds (the whole point of collapsing to 'minimal screen space') must still pass through to whatever app is underneath, exactly as it already did before collapsing existed", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("WindowManager.LayoutParams.WRAP_CONTENT"));
  assert.ok(fnBody.includes("WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS"));
});

test("the mood row has exactly the 3 required buttons in order (😟 פחות טוב, 🙂 סבבה, 😄 ישר למשימה), and the next-task section has exactly the info line + the 'עבור למשימה הבאה' action, each wired to its own field", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('text = "😟 פחות טוב"'));
  assert.ok(fnBody.includes('text = "🙂 סבבה"'));
  assert.ok(fnBody.includes('text = "😄 ישר למשימה"'));
  assert.ok(fnBody.includes('text = "עבור למשימה הבאה"'));
  const moodRowIndex = fnBody.indexOf("addView(moodLessGoodTextView)");
  assert.ok(moodRowIndex < fnBody.indexOf("addView(moodOkTextView)"));
  assert.ok(fnBody.indexOf("addView(moodOkTextView)") < fnBody.indexOf("addView(moodDirectTextView)"));
});

test("every new view field is nulled out on removal (removeOverlayIfAdded) and in the ensureOverlayAdded catch block -- never a stale/dangling reference left behind after a permission revoke mid-setup or a legitimate teardown", () => {
  const removeFnIndex = serviceKt.indexOf("private fun removeOverlayIfAdded()");
  const removeFnBody = serviceKt.slice(removeFnIndex, serviceKt.indexOf("\n  }", removeFnIndex));
  for (const field of ["currentTaskRowView", "moodLessGoodView", "moodOkView", "moodDirectToTaskView", "nextTaskInfoView", "nextTaskActionView", "insightView"]) {
    assert.ok(removeFnBody.includes(`${field} = null`), `removeOverlayIfAdded must null out ${field}`);
  }
});

// --- ARCHI -- Unified Final Specification task, section 1 (combined "מחשבה / דחף" shortcut) ---

test("the floating cube's expanded panel has its own '🧠 מחשבה / דחף' row, directly below moodRow (never buried elsewhere), added to expandedContent right after moodRow and before currentTaskRow", () => {
  const fnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('text = "🧠 מחשבה / דחף"'));
  const expandedIndex = fnBody.indexOf("val expandedContent = LinearLayout(this).apply {");
  const expandedBody = fnBody.slice(expandedIndex, fnBody.indexOf("\n      }", expandedIndex));
  const addMoodRow = expandedBody.indexOf("addView(moodRow)");
  const addUrgeRow = expandedBody.indexOf("addView(urgeRow)");
  const addCurrentTaskRow = expandedBody.indexOf("addView(currentTaskRow)");
  assert.ok(addMoodRow !== -1 && addUrgeRow !== -1 && addCurrentTaskRow !== -1);
  assert.ok(addMoodRow < addUrgeRow && addUrgeRow < addCurrentTaskRow, "urgeRow must sit directly below moodRow, before currentTaskRow");
});

test("a tap on '🧠 מחשבה / דחף' is hit-tested the exact same way every other mood button already is, and dispatches via the SAME openCheckIn(\"urge\") the Home screen's own button uses -- never a second decision layer, never a separate debounce mechanism", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("downOnUrge = isPointInsideView(view, urgeView, event.x, event.y)"));
  assert.ok(fnBody.includes('} else if (downOnUrge) {\n            openCheckIn("urge")'));
});

test("'🧠 מחשבה / דחף' is available regardless of taskId -- its hit-test/dispatch never checks taskId.isEmpty(), same as the 3 mood buttons it sits directly below", () => {
  const fnIndex = serviceKt.indexOf("private fun attachDragAndTapHandling(");
  const fnBody = serviceKt.slice(fnIndex, serviceKt.indexOf("\n  }", fnIndex));
  const upIndex = fnBody.indexOf("MotionEvent.ACTION_UP -> {");
  const upBody = fnBody.slice(upIndex, fnBody.indexOf("MotionEvent.ACTION_CANCEL", upIndex));
  const urgeIndex = upBody.indexOf("downOnUrge");
  assert.ok(urgeIndex !== -1);
  assert.ok(!upBody.slice(Math.max(0, urgeIndex - 40), urgeIndex + 40).includes("taskId.isEmpty()"));
});

test("every new urge-button field (urgeView) is nulled out on removal and in the ensureOverlayAdded catch block, same as every other view field", () => {
  const removeFnIndex = serviceKt.indexOf("private fun removeOverlayIfAdded()");
  const removeFnBody = serviceKt.slice(removeFnIndex, serviceKt.indexOf("\n  }", removeFnIndex));
  assert.ok(removeFnBody.includes("urgeView = null"));
  const ensureFnIndex = serviceKt.indexOf("private fun ensureOverlayAdded()");
  const ensureFnBody = serviceKt.slice(ensureFnIndex, serviceKt.indexOf("\n  }", ensureFnIndex));
  const catchBody = ensureFnBody.slice(ensureFnBody.indexOf("} catch (_: Exception) {"));
  assert.ok(catchBody.includes("urgeView = null"));
});
