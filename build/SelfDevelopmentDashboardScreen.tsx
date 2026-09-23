import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

/**
 * build/SelfDevelopmentDashboardScreen.tsx (route: /self-development)
 *
 * Personal Development consolidation task, step 5: the Personal
 * Development main screen, trimmed to exactly the three approved
 * sections -- My Routine, BUILD, LIVE -- per the approved consolidation
 * plan's final decision 1 ("the normal user-facing dashboard must
 * contain exactly these three sections... do not add a fourth visible
 * Legacy Tools link"). Every entry point this screen used to host
 * (ArcBuild/MiniArcBuild management, the four standalone single-factor
 * ARC systems, the four-week tracker, the StateProfile/InterferenceItem
 * libraries as their own top-level destinations, routines, link
 * practice, weekly stats, the Negative Action timer, the ARC reminder
 * scheduler) is REMOVED from this screen's own UI -- never deleted.
 * Every one of those routes stays registered in app/_layout.tsx and
 * fully functional if reached directly (a saved deep link, a scheduled
 * reminder notification, a developer typing the URL) -- "hide the entry
 * point, not the destination," this screen's own long-standing removal
 * convention (see the git history of this exact file for the identical
 * treatment applied to Home's own entry points in an earlier phase).
 *
 * - My Routine (build/PersonalDevelopmentRouteListScreen.tsx, route
 *   /personal-development-routes): browse/manage every saved program;
 *   Edit opens the same BUILD, Practice opens the same LIVE.
 * - BUILD: creates a brand-new program directly (the same screen "Edit"
 *   uses, build/PersonalDevelopmentRouteEditorScreen.tsx, with id="new").
 *   Editing an EXISTING program is one tap away via My Routine's own
 *   "ערוך" action on each card -- never a second, competing creation
 *   flow.
 * - LIVE (build/PersonalDevelopmentLiveSelectScreen.tsx, route
 *   /personal-development-routes/live-select): the PD-only practice
 *   entry -- never build/LiveModeSelectScreen.tsx's own mixed ArcBuild/
 *   ARC Goal chooser, which would leak legacy content back into this
 *   screen's own normal interface.
 */
export default function SelfDevelopmentDashboardScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>התפתחות אישית</Text>
        <Text style={styles.subtitle}>עבודה על רגש, דחף, מחשבה, מצב פנימי או הרגל מפריע -- ללא צורך במניפסט חיים או במטרה.</Text>

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/personal-development-routes")}>
          <Text style={styles.buttonText}>השגרה שלי</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.buildButton, styles.fullWidthButton]}
          onPress={() => router.push({ pathname: "/personal-development-routes/[id]", params: { id: "new" } })}
        >
          <Text style={styles.buttonText}>+ בניית תוכנית חדשה</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.liveButton, styles.fullWidthButton]} onPress={() => router.push("/personal-development-routes/live-select")}>
          <Text style={styles.buttonText}>LIVE התפתחות אישית</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.replace("/")}>
          <Text style={styles.backButtonText}>חזרה לבחירת מצב</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 24 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  buildButton: { backgroundColor: "#1a6b4a" },
  liveButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  backButton: { marginTop: 28, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});
