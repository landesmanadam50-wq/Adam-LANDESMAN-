/**
 * live/components/FreeBreathingIntro.tsx
 *
 * ARCHI -- Free Breathing Intro & Persistent Very Pale Blue Background
 * task: the one shared opening screen for Full ARC and Mini ARC alike
 * -- "Natural breathing, minimal friction." Reuses existing
 * infrastructure end to end, never a second, duplicated animation
 * engine:
 * - The gender-neutral human figure IS BodyOutlineBackdrop, the exact
 *   same continuous silhouette already drawn behind every interactive
 *   region in live/components/BodySilhouetteMap.tsx and inside
 *   live/components/ArcBodyMantraCircle.tsx -- never a second,
 *   separately-authored figure.
 * - The "very light-blue air gently flowing toward and around the
 *   body" is PresenceAnimation in its own existing "full" mode, tinted
 *   with the app's own existing light-blue accent
 *   (OPENING_ACCEPTANCE_COLOR, arc/arcBodyMantraCircleLogic.ts) --
 *   never the exact #F2FAFF background hex, which is deliberately too
 *   close to white to read as a visible "air" motif on its own.
 *
 * This component owns ONLY the figure + mantra + the two actions
 * (Continue/Skip) -- "do not add multiple explanatory screens." It
 * does NOT own the persistent pale-blue background itself: that is
 * live/NewArcLiveScreen.tsx's own job (session.freeBreathingIntroShown,
 * via arc/freeBreathingIntro.ts's resolveArcBackgroundColor), since the
 * background must persist across every LATER stage this component is
 * never mounted for.
 *
 * "Do not prescribe a breathing rhythm... do not require deep
 * breathing or breath-holding... do not force synchronization": the
 * figure's own gentle scale pulse and the air rings are both
 * DECORATIVE and independent of any user input or timer -- nothing
 * here ever asks the trainee to match their own breath to it.
 */

import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg from "react-native-svg";

import { OPENING_ACCEPTANCE_COLOR } from "../../arc/arcBodyMantraCircleLogic.ts";
import { BODY_SILHOUETTE_VIEWBOX_HEIGHT, BODY_SILHOUETTE_VIEWBOX_WIDTH } from "../../arc/bodySilhouetteLayout.ts";
import AnimationErrorBoundary from "./AnimationErrorBoundary.tsx";
import BodyOutlineBackdrop from "./BodyOutlineBackdrop.tsx";
import PresenceAnimation from "./PresenceAnimation.tsx";

export interface FreeBreathingIntroProps {
  mantra: string;
  onContinue: () => void;
  onSkip: () => void;
}

const FIGURE_WIDTH = 150;
const FIGURE_HEIGHT = (FIGURE_WIDTH / BODY_SILHOUETTE_VIEWBOX_WIDTH) * BODY_SILHOUETTE_VIEWBOX_HEIGHT;
/** A gentle inhale/exhale scale range -- subtle enough to never read as "aggressive pulsing." */
const BREATHING_MIN_SCALE = 1;
const BREATHING_MAX_SCALE = 1.045;
const BREATHING_CYCLE_MS = 4400;

export default function FreeBreathingIntro({ mantra, onContinue, onSkip }: FreeBreathingIntroProps) {
  const reduceMotionEnabled = useReducedMotion();
  const breath = useSharedValue(0);

  useEffect(() => {
    if (reduceMotionEnabled) {
      // A single, static frame -- the figure stays visible, but never
      // loops or pulses. "Respect reduced-motion accessibility preferences."
      breath.value = 0.5;
      return;
    }
    breath.value = withRepeat(withTiming(1, { duration: BREATHING_CYCLE_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- breath is a SharedValue, stable across renders by design.
  }, [reduceMotionEnabled]);

  const figureStyle = useAnimatedStyle(() => ({
    transform: [{ scale: BREATHING_MIN_SCALE + breath.value * (BREATHING_MAX_SCALE - BREATHING_MIN_SCALE) }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.visual}>
        <AnimationErrorBoundary fallback={<StaticFigure />}>
          <View style={styles.ringLayer} pointerEvents="none">
            <PresenceAnimation color={OPENING_ACCEPTANCE_COLOR} mode="full" size={FIGURE_WIDTH * 2.1} />
          </View>
          <Animated.View style={[styles.figureWrapper, { width: FIGURE_WIDTH, height: FIGURE_HEIGHT }, figureStyle]}>
            <Svg width="100%" height="100%" viewBox={`0 0 ${BODY_SILHOUETTE_VIEWBOX_WIDTH} ${BODY_SILHOUETTE_VIEWBOX_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
              <BodyOutlineBackdrop instanceKey="free-breathing-intro" />
            </Svg>
          </Animated.View>
        </AnimationErrorBoundary>
      </View>
      <Text style={styles.mantraText}>{mantra}</Text>
      {/* Both actions commit the EXACT same state transition
          (completeFreeBreathingIntro, arc/newArcLiveSteps.ts) -- there
          is nothing here to decline, so Continue and Skip are simply
          two lightweight ways to reach the same next step. */}
      <Pressable style={styles.primaryButton} onPress={onContinue} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>המשך</Text>
      </Pressable>
      <Pressable onPress={onSkip} accessibilityRole="button">
        <Text style={styles.skipText}>דלג</Text>
      </Pressable>
    </View>
  );
}

/** AnimationErrorBoundary fallback: the same figure at rest, no ring, no pulse -- still a correct, complete screen, and Continue/Skip (entirely outside this boundary) keep working regardless. "The breathing animation must never block navigation or trap the user." */
function StaticFigure() {
  return (
    <View style={[styles.figureWrapper, { width: FIGURE_WIDTH, height: FIGURE_HEIGHT }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${BODY_SILHOUETTE_VIEWBOX_WIDTH} ${BODY_SILHOUETTE_VIEWBOX_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        <BodyOutlineBackdrop instanceKey="free-breathing-intro-static" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", width: "100%", paddingVertical: 12, gap: 18 },
  visual: { alignItems: "center", justifyContent: "center", width: FIGURE_WIDTH * 2.1, height: FIGURE_WIDTH * 2.1 },
  ringLayer: { position: "absolute", alignItems: "center", justifyContent: "center" },
  figureWrapper: { alignItems: "center", justifyContent: "center" },
  mantraText: { textAlign: "center", fontSize: 18, lineHeight: 26, color: "#1a1a1a", paddingHorizontal: 24 },
  primaryButton: { backgroundColor: "#0a7ea4", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  skipText: { color: "#666", fontSize: 14, textDecorationLine: "underline" },
});
