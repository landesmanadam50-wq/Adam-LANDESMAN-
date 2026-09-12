/**
 * live/LinkTimerDisplay.tsx
 *
 * Link timers task (spec section 9): the visible rehearsal-timer
 * readout for ARC Link / ARCHI ARC Link / Mini ARC Link -- a small,
 * self-contained, NON-persisted component (its own mount-relative
 * clock, reset fresh every time it mounts, exactly like
 * live/screens.tsx's own useElapsedSeconds). Deliberately separate from
 * every real timed activity's own UI (ActionScreen/SuccessFocusScreen/
 * NegativeActionScreen in live/screens.tsx) -- never reads or writes
 * data/storage.ts's TimerRun, never shares state with them.
 *
 * "guided" style shows only a quiet, low-pressure count-up (or nothing,
 * when the caller simply never renders this component) -- no countdown,
 * no target. "speed" style counts down to the configured target and,
 * once reached, shows a neutral continuation message -- it NEVER
 * disables/hides whatever Continue button the caller renders alongside
 * it, and reaching zero is never portrayed as success or failure.
 */

import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { formatLinkTimerSeconds, getLinkTimerStatus } from "../arc/linkTimer.ts";
import type { LinkTimerStyle } from "../arc/routineLinks.ts";

/** Own independent elapsed-seconds clock -- mirrors live/screens.tsx's useElapsedSeconds in shape only, never imported from it (see this file's own doc on why Link timing stays fully separate). */
function useLinkElapsedSeconds(): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds((Date.now() - startedAt) / 1000);
    }, 250);
    return () => clearInterval(interval);
  }, []);
  return elapsedSeconds;
}

export function LinkTimerDisplay({
  style,
  targetDurationSeconds,
}: {
  style: LinkTimerStyle;
  /** null (or "guided" style, which ignores this entirely) means no target duration -- a plain count-up only. */
  targetDurationSeconds: number | null;
}) {
  const elapsedSeconds = useLinkElapsedSeconds();
  const status = getLinkTimerStatus(style, targetDurationSeconds, elapsedSeconds);

  if (status.remainingSeconds === null) {
    return <Text style={styles.timerText}>{`זמן שחלף: ${formatLinkTimerSeconds(status.elapsedSeconds)}`}</Text>;
  }
  if (status.reachedTarget) {
    return <Text style={styles.timerText}>הזמן שהגדרת הסתיים — אפשר להמשיך בקצב שלך, אין צורך למהר.</Text>;
  }
  return <Text style={styles.timerText}>{`נותרו ${formatLinkTimerSeconds(status.remainingSeconds)}`}</Text>;
}

const styles = StyleSheet.create({
  timerText: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
});
