/**
 * data/floatingTimerOverlay.ts
 *
 * Floating task timer task, requirements 1-3+7: the thin JS <-> native
 * bridge for modules/floating-timer-overlay (a local Expo Module --
 * Android only, a system-wide WindowManager overlay + its own ongoing
 * foreground-service notification; see that module's OverlayService.kt
 * for the actual implementation). Like data/taskAlarm.ts and
 * data/timerSound.ts, this depends on a native module and isn't
 * unit-tested with node --test; every export here is non-throwing and a
 * no-op on a platform/build without the native module present (e.g.
 * iOS, or a JS-only test run), so a missing/failed overlay call must
 * never block the regular in-app timer -- requirement 2's own explicit
 * "אין לחסום את פעולת הטיימר הרגיל כאשר ההרשאה חסרה", generalized to
 * "the native module itself might not exist" too.
 *
 * Deliberately reads the "is the overlay enabled" preference INSIDE
 * show/update, never at each call site -- the exact same "preferences
 * read fresh at the one place that matters" convention
 * data/taskAlarm.ts's registerTaskAlarmForegroundService already uses
 * for sound/vibration. The underlying native service keeps running (so
 * the ongoing notification -- requirement 3, never optional, never a
 * replacement for or replaced by the floating overlay -- stays visible)
 * even when the trainee has turned the floating overlay itself off;
 * only the WindowManager view is skipped in that case.
 */

import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

import type { Task } from "../arc/tasks.ts";
import { resolveFloatingTimerOverlayPayload, resolveIdleFloatingOverlayPayload } from "../arc/floatingTimerOverlayPayload.ts";
import type { FloatingTimerOverlayPayload, NextScheduledTaskForOverlay } from "../arc/floatingTimerOverlayPayload.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import type { TaskStageProgress } from "../arc/taskStageProgress.ts";
import { loadFloatingTimerOverlayPreferences } from "./storage.ts";
import { updateHomeScreenWidget } from "./emotionalCheckInWidget.ts";

interface FloatingTimerOverlayNativeModule {
  hasOverlayPermission(): boolean;
  requestOverlayPermission(): void;
  show(payload: FloatingTimerOverlayPayload): void;
  update(payload: FloatingTimerOverlayPayload): void;
  hide(): void;
}

let cachedModule: FloatingTimerOverlayNativeModule | null | undefined;

/** Lazily resolved and cached -- requireNativeModule throws on any platform/build where the native module isn't registered (iOS, web, or a plain JS test run), so every other export here must go through this instead of importing it eagerly at module load time. */
function getNativeModule(): FloatingTimerOverlayNativeModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS !== "android") {
    cachedModule = null;
    return cachedModule;
  }
  try {
    cachedModule = requireNativeModule("FloatingTimerOverlay") as FloatingTimerOverlayNativeModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export async function hasFloatingOverlayPermissionAsync(): Promise<boolean> {
  try {
    return getNativeModule()?.hasOverlayPermission() ?? false;
  } catch {
    return false;
  }
}

/** Requirement 2: there is no runtime "grant" dialog for this specific Android permission -- this opens the one OS settings screen that lets the trainee turn it on, same action whether this is the first request or a retry after it was denied. */
export async function requestFloatingOverlayPermissionAsync(): Promise<void> {
  try {
    getNativeModule()?.requestOverlayPermission();
  } catch {
    // Best-effort -- nothing else this side can do if even opening Settings fails.
  }
}

/**
 * Called once, the moment a task timer (or rest timer) starts --
 * requirement 6: this is also what makes the overlay "appear
 * immediately" once a task-alarm's own "Start Task" action auto-starts
 * the timer, with zero extra steps.
 *
 * `stageProgress` (Unified Task Stages task) is optional and defaults
 * to null -- every call site that doesn't pass it (a rest timer, or
 * any screen that hasn't been taught about stages) behaves exactly as
 * before this task: the overlay's own prominent text falls back to the
 * plain task title, and no ✓ button is shown.
 */
export async function showFloatingTimerOverlay(
  run: TaskTimerRun,
  task: Task,
  stageProgress: TaskStageProgress | null = null,
  nextScheduledTask: NextScheduledTaskForOverlay | null = null
): Promise<void> {
  const native = getNativeModule();
  if (!native) return;
  try {
    const preferences = await loadFloatingTimerOverlayPreferences();
    const payload = resolveFloatingTimerOverlayPayload(run, task, preferences.enabled, stageProgress, Date.now(), nextScheduledTask);
    native.show(payload);
    // ARCHI -- Home-Screen Widget Sync task: the SAME payload just
    // built for the cube also keeps the home-screen widget current --
    // never a second, independent resolution of what's active.
    await updateHomeScreenWidget(payload);
  } catch {
    // Best-effort -- the in-app timer (ActiveTaskScreen) is still completely correct regardless.
  }
}

/**
 * Called on every subsequent state change (pause/resume/finish-early/rest-start/rest-finish/stage advance) -- never a second, independent re-derivation of remaining time: always arc/taskTimer.ts's own getTaskTimerStatus (via arc/floatingTimerOverlayPayload.ts's shared pure computation), the exact same single source of truth every in-app screen already reads.
 *
 * Lock-Screen Timer task, requirement 1: `nextScheduledTask` is
 * OPTIONAL and defaults to null -- every pre-existing call site that
 * doesn't pass it keeps showing the notification with no "next task"
 * line, exactly as before this task.
 */
export async function updateFloatingTimerOverlay(
  run: TaskTimerRun,
  task: Task,
  stageProgress: TaskStageProgress | null = null,
  nextScheduledTask: NextScheduledTaskForOverlay | null = null
): Promise<void> {
  const native = getNativeModule();
  if (!native) return;
  try {
    const preferences = await loadFloatingTimerOverlayPreferences();
    const payload = resolveFloatingTimerOverlayPayload(run, task, preferences.enabled, stageProgress, Date.now(), nextScheduledTask);
    native.update(payload);
    await updateHomeScreenWidget(payload);
  } catch {
    // Best-effort.
  }
}

/** Requirement 1's last bullet: "כאשר אין משימה פעילה, החלונית תיעלם" -- stops the whole native service (overlay view AND its ongoing notification both go away together), never just the view alone. Superseded, at every call site that has a trainee-facing "what's next" moment, by showIdleFloatingOverlayPanel below (ARCHI -- Unified Floating Overlay & Mini ARC Improvements task) -- kept here unchanged for any caller that genuinely means "stop everything" (e.g. the overlay-enabled preference itself being turned off). */
export async function hideFloatingTimerOverlay(): Promise<void> {
  try {
    getNativeModule()?.hide();
  } catch {
    // Best-effort.
  }
}

/**
 * ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
 * sections 1-4+8: shows the unified panel's IDLE state -- no current
 * task/timer, the 3-mood row (including "😄 ישר למשימה"), and the next
 * scheduled task (or "אין משימה נוספת מתוכננת"). Called from Home
 * (build/FlexibleDailyScreen.tsx) on every focus so the panel is kept
 * current while idle, and from live/ActiveTaskScreen.tsx in place of
 * hideFloatingTimerOverlay() wherever a task session just ENDED
 * (completed/skipped) -- "the interface must update automatically
 * without requiring the user to restart the app," satisfied by simply
 * re-showing the SAME service with a fresh idle payload rather than
 * stopping it and leaving nothing visible.
 */
export async function showIdleFloatingOverlayPanel(nextScheduledTask: NextScheduledTaskForOverlay | null = null): Promise<void> {
  const native = getNativeModule();
  if (!native) return;
  try {
    const preferences = await loadFloatingTimerOverlayPreferences();
    const payload = resolveIdleFloatingOverlayPayload(preferences.enabled, nextScheduledTask);
    native.show(payload);
    await updateHomeScreenWidget(payload);
  } catch {
    // Best-effort -- the in-app Home screen is still completely correct regardless.
  }
}
