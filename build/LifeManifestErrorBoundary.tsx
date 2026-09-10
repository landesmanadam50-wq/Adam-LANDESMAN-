import { Component } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

interface Props {
  children: ReactNode;
  /** Defaults to the spec's own recovery text -- "לא ניתן לטעון את המניפסט." */
  message?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Bug-fix task: a small, local error boundary for the Life Manifest
 * routes. Catches any render-time exception -- e.g. a legacy record
 * missing a field a later phase added -- and shows a Hebrew recovery
 * state with a working back button, instead of letting the error
 * propagate up past this boundary. React's default behavior for an
 * uncaught render error is to unmount the ENTIRE app, which is exactly
 * what produced the reported bug: a completely blank dark-gray screen
 * with no header, content, or back button (the Stack header itself is
 * part of that same unmounted tree). Scoped locally per screen (each
 * life-manifest/* route wraps its own content in this boundary) rather
 * than globally, and rendered INSIDE the Stack.Screen so the native
 * header + Android back button registered by app/_layout.tsx keep
 * working even when this boundary trips.
 *
 * This is a safety net, not the primary fix -- see arc/lifeManifest.ts's
 * normalizeLifeManifest/normalizeMajorGoal/normalizeSubGoal/
 * normalizeTarget (applied at load time in data/storage.ts) for the
 * actual root-cause fix that stops legacy records from ever reaching a
 * render path that would throw in the first place. Kept anyway so this
 * route can never again produce an entirely blank screen, no matter what
 * future bug reaches it.
 */
export default class LifeManifestErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.warn("[LifeManifestErrorBoundary] Caught a render error -- showing the recovery state instead of a blank screen.", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Text style={styles.title}>{this.props.message ?? "לא ניתן לטעון את המניפסט."}</Text>
            <Pressable
              style={styles.button}
              onPress={() => {
                this.setState({ hasError: false });
                router.replace("/life-manifest");
              }}
            >
              <Text style={styles.buttonText}>חזרה לרשימת המניפסטים</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 24, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 17, textAlign: "center", color: "#333", marginBottom: 20 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
