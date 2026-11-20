/**
 * data/emotionalCheckInWidget.ts
 *
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 1: the thin JS <-> native bridge for
 * modules/emotional-checkin-widget's own EmotionalCheckInWidgetModule.kt
 * -- Android only, requesting the OS "pin this widget to the home
 * screen" prompt for the ALREADY-BUILT emotional check-in widget
 * (EmotionalCheckInWidgetProvider.kt). Same "lazily resolved, cached,
 * never throws, no-op on a platform/build without the native module"
 * convention as data/floatingTimerOverlay.ts -- a missing/failed native
 * call must never crash the settings screen that offers this button.
 *
 * ARCHI -- Home-Screen Widget Sync task: `updateHomeScreenWidget`
 * below is the widget's own dynamic-content push, added to this same
 * bridge. It is called from INSIDE data/floatingTimerOverlay.ts's own
 * show/update/showIdle functions (never from a new, separate call
 * site added here or anywhere else) -- "the widget must use the same
 * navigation routes/state management as the cube, never a parallel
 * mechanism" is satisfied by piggy-backing on the cube's own existing
 * push points rather than teaching every screen a second function to
 * call.
 */

import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

import type { FloatingTimerOverlayPayload } from "../arc/floatingTimerOverlayPayload.ts";

interface EmotionalCheckInWidgetNativeModule {
  isPinWidgetSupported(): boolean;
  requestPinWidget(): boolean;
  update(payload: {
    taskId: string;
    actionTitle: string;
    remainingSeconds: number;
    paused: boolean;
    nextScheduledTaskTitle: string | null;
    nextScheduledTaskTime: string | null;
    nextScheduledTaskDurationMinutes: number | null;
    nextScheduledTaskIsOverdue: boolean;
  }): void;
}

let cachedModule: EmotionalCheckInWidgetNativeModule | null | undefined;

function getNativeModule(): EmotionalCheckInWidgetNativeModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS !== "android") {
    cachedModule = null;
    return cachedModule;
  }
  try {
    cachedModule = requireNativeModule("EmotionalCheckInWidget") as EmotionalCheckInWidgetNativeModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/**
 * "Never claim unsupported lock-screen/home-screen functionality" --
 * isRequestPinAppWidgetSupported is itself launcher-dependent (API 26+
 * AND the active launcher must implement the pin flow), so the settings
 * screen checks this before ever showing the "add to home screen"
 * button, rather than showing it unconditionally and failing silently.
 */
export async function isHomeScreenWidgetPinSupported(): Promise<boolean> {
  try {
    return getNativeModule()?.isPinWidgetSupported() ?? false;
  } catch {
    return false;
  }
}

/**
 * Prompts the OS to let the trainee pin the emotional check-in widget to
 * their home screen with one tap, instead of hunting for it manually via
 * the launcher's own long-press -> widgets picker. Returns whether the
 * system accepted the request (the trainee still confirms the actual
 * placement in the launcher's own UI, outside this app's control) --
 * never a guarantee the widget was actually placed.
 */
export async function requestHomeScreenWidgetPin(): Promise<boolean> {
  try {
    return getNativeModule()?.requestPinWidget() ?? false;
  } catch {
    return false;
  }
}

/**
 * ARCHI -- Home-Screen Widget Sync task: pushes the SAME
 * FloatingTimerOverlayPayload the floating cube was just given (built
 * once by the caller, via arc/floatingTimerOverlayPayload.ts) into the
 * home-screen widget's own persisted state -- never a second,
 * independently-resolved "what's current" computation. Best-effort and
 * non-throwing, same convention as every other export in this file and
 * in data/floatingTimerOverlay.ts: a trainee who never added the
 * widget to their home screen (or is on a build/platform without the
 * native module) must never have this fail loudly or block the
 * regular in-app timer/overlay.
 */
export async function updateHomeScreenWidget(payload: FloatingTimerOverlayPayload): Promise<void> {
  try {
    getNativeModule()?.update({
      taskId: payload.taskId,
      actionTitle: payload.actionTitle,
      remainingSeconds: payload.remainingSeconds,
      paused: payload.paused,
      nextScheduledTaskTitle: payload.nextScheduledTaskTitle,
      nextScheduledTaskTime: payload.nextScheduledTaskTime,
      nextScheduledTaskDurationMinutes: payload.nextScheduledTaskDurationMinutes,
      nextScheduledTaskIsOverdue: payload.nextScheduledTaskIsOverdue,
    });
  } catch {
    // Best-effort -- the floating cube/in-app timer are still completely correct regardless.
  }
}
