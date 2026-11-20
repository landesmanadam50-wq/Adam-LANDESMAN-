/**
 * live/components/PresenceAnimation.tsx
 *
 * Unified ARC Architecture and Interactive Animation Update, Phase 1
 * ("Continuous Animated Presence"): the one, single Presence animation
 * -- a small central point, a gentle rotation, and the chosen color
 * gradually expanding outward from it. Rendered in two modes, never
 * two separate implementations:
 *
 * - "full": the ordinary, one-time Presence exercise itself (shown
 *   during the existing focus_color/visual_field screens) -- larger,
 *   more visible expansion.
 * - "subtle": the SAME animation, just smaller and dimmer, meant to
 *   stay visible as a continuous attentional reference during later
 *   stages (Dwelling/Acceptance/Regulation/Encoding in Phase 2) without
 *   competing for attention with the interactive body map alongside
 *   it. "Do not restart the entire Presence exercise at every stage" --
 *   this component's own looping animation already never finishes or
 *   restarts on its own; a parent switching from "full" to "subtle" is
 *   simply re-styling the same continuous motif, never re-triggering a
 *   fresh intro sequence.
 *
 * Reduced-motion accessibility: when the OS "reduce motion" setting is
 * on, every looping animation here is skipped entirely and a single
 * static frame (small point, one steady expanded ring, no rotation) is
 * rendered instead -- the chosen color and the point itself stay
 * visible either way, only the MOTION is removed.
 */

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

export type PresenceAnimationMode = "full" | "subtle";

export interface PresenceAnimationProps {
  /** The trainee's own selected focus color (session.selectedFocusColor) -- a CSS/RN color string (a named Hebrew-chip color like "כחול" is resolved to a real color by the caller before this prop is set; this component never does that translation itself, so it stays usable for any color string). */
  color: string;
  mode?: PresenceAnimationMode;
  /** Overall diameter of the animation's own bounding box, in density-independent pixels. Defaults differ sensibly by mode (see DEFAULT_SIZE_BY_MODE) when omitted. */
  size?: number;
}

const DEFAULT_SIZE_BY_MODE: Record<PresenceAnimationMode, number> = { full: 220, subtle: 96 };
/** How many of the point's own diameters the outer ring expands to, before fading and restarting -- "gradual outward expansion", never a fixed, static ring. */
const EXPANSION_SCALE_BY_MODE: Record<PresenceAnimationMode, number> = { full: 2.6, subtle: 1.6 };
const ROTATION_DURATION_MS_BY_MODE: Record<PresenceAnimationMode, number> = { full: 18000, subtle: 30000 };
const EXPANSION_DURATION_MS_BY_MODE: Record<PresenceAnimationMode, number> = { full: 3200, subtle: 4600 };

export default function PresenceAnimation({ color, mode = "full", size }: PresenceAnimationProps) {
  const resolvedSize = size ?? DEFAULT_SIZE_BY_MODE[mode];
  const reduceMotionEnabled = useReducedMotion();

  const rotation = useSharedValue(0);
  const expansion = useSharedValue(0);

  useEffect(() => {
    if (reduceMotionEnabled) {
      // A single, static frame -- the point and the chosen color stay
      // visible, but nothing loops, rotates, or expands.
      rotation.value = 0;
      expansion.value = 0.55;
      return;
    }
    rotation.value = withRepeat(withTiming(360, { duration: ROTATION_DURATION_MS_BY_MODE[mode], easing: Easing.linear }), -1, false);
    expansion.value = withRepeat(withTiming(1, { duration: EXPANSION_DURATION_MS_BY_MODE[mode], easing: Easing.out(Easing.quad) }), -1, false);
    return () => {
      cancelAnimation(rotation);
      cancelAnimation(expansion);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mode` only ever changes by remount (the caller swaps components/keys between stages), never by a live prop change mid-animation.
  }, [reduceMotionEnabled]);

  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const ringStyle = useAnimatedStyle(() => {
    const maxScale = EXPANSION_SCALE_BY_MODE[mode];
    const scale = 1 + expansion.value * (maxScale - 1);
    const opacity = reduceMotionEnabled ? 0.35 : 0.5 * (1 - expansion.value);
    return { transform: [{ scale }], opacity };
  });

  const pointDiameter = resolvedSize * 0.16;

  return (
    <View style={[styles.container, { width: resolvedSize, height: resolvedSize }]} accessible accessibilityLabel="אנימציית נוכחות">
      <Animated.View
        style={[
          styles.ring,
          ringStyle,
          { width: resolvedSize * 0.7, height: resolvedSize * 0.7, borderRadius: (resolvedSize * 0.7) / 2, borderColor: color },
        ]}
      />
      <Animated.View style={[styles.centerWrapper, centerStyle]}>
        <View style={[styles.point, { width: pointDiameter, height: pointDiameter, borderRadius: pointDiameter / 2, backgroundColor: color }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 2 },
  centerWrapper: { position: "absolute", alignItems: "center", justifyContent: "center" },
  point: {},
});
