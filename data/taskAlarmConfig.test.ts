import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/taskAlarmConfig.test.ts
 *
 * Task-alarm task: the Android permissions a real, full-screen,
 * foreground-service-backed alarm actually needs -- declared once in
 * app.json (notifee ships no Expo config plugin of its own). Critical-
 * bug fix correction: unzipping notifee's own core-*.aar and reading
 * ITS bundled AndroidManifest.xml directly shows it already declares
 * VIBRATE/WAKE_LOCK/FOREGROUND_SERVICE/SCHEDULE_EXACT_ALARM itself
 * (merged in automatically by Gradle regardless of app.json) --
 * app.json still declares them explicitly here for clarity, but
 * USE_FULL_SCREEN_INTENT is the one permission notifee does NOT
 * provide and genuinely depends on this declaration.
 * FOREGROUND_SERVICE_MEDIA_PLAYBACK was removed: notifee's own bundled
 * Service is manifest-declared as foregroundServiceType="shortService"
 * (not mediaPlayback), so that permission was never actually needed --
 * see data/taskAlarm.test.ts's own test on TASK_ALARM_FOREGROUND_SERVICE_TYPES
 * for the matching runtime-side fix.
 */
function readAppJson(): any {
  const path = fileURLToPath(new URL("../app.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

const appJson = readAppJson();

test("the Android permissions a real alarm needs (foreground service, full-screen intent, exact alarms, vibration, wake lock) are all declared, and the wrong/unneeded media-playback one is gone", () => {
  const permissions: string[] = appJson.expo.android.permissions;
  for (const required of [
    "android.permission.VIBRATE",
    "android.permission.WAKE_LOCK",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.USE_FULL_SCREEN_INTENT",
    "android.permission.SCHEDULE_EXACT_ALARM",
  ]) {
    assert.ok(permissions.includes(required), `missing required permission: ${required}`);
  }
  assert.ok(!permissions.includes("android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"));
});

test("@notifee/react-native is an installed dependency", () => {
  const packageJson = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
  assert.ok(packageJson.dependencies["@notifee/react-native"]);
});
