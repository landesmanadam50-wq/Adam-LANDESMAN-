/**
 * live/components/AnimationErrorBoundary.tsx
 *
 * Fix All Confirmed ARC Android Bugs task, requirement 5 ("provide a
 * safe static fallback if native animation fails"): a plain React
 * error boundary around the one place in the app that renders
 * Reanimated/SVG-driven animation (the Presence point + the
 * articulated body, inside live/components/ArcBodyMantraCircle.tsx).
 *
 * An error boundary only catches errors thrown during a normal React
 * render pass on the JS thread -- it can never catch a crash that
 * originates purely inside a Reanimated worklet running on the UI
 * thread (a separate JSI runtime), which is why the actual confirmed
 * root cause of the reported black screen (arc/bodyRegionMovements.ts's
 * resolveBodyRegionMovementTransform being called from inside a
 * worklet without its own explicit "worklet" directive) is fixed at
 * the source, in that file, not here. This boundary is the second,
 * independent layer: if ANYTHING in the animated render path still
 * throws on the JS thread for any other reason, the trainee gets a
 * still-correct, still-interactive static fallback instead of a blank
 * screen -- the circle's own tap-to-advance (owned by the PARENT,
 * entirely outside this boundary) keeps working regardless, so the
 * trainee is never stuck.
 */

import { Component } from "react";
import type { ReactNode } from "react";

interface AnimationErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface AnimationErrorBoundaryState {
  hasError: boolean;
}

export default class AnimationErrorBoundary extends Component<AnimationErrorBoundaryProps, AnimationErrorBoundaryState> {
  state: AnimationErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AnimationErrorBoundaryState {
    return { hasError: true };
  }

  // Deliberately swallows the error -- never rethrows, never crashes
  // the screen. There is no logging backend in this app to report to;
  // silently falling back is the correct, documented behavior here.
  componentDidCatch(): void {}

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
