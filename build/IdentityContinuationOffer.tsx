import { Pressable, StyleSheet, Text, View } from "react-native";

import { IDENTITY_EXTENSION_OFFER_QUESTION } from "../arc/identityExtension.ts";

/**
 * build/IdentityContinuationOffer.tsx
 *
 * ARCHI entry-flow correction, spec section 3: the shared BUILD-time
 * "continue to identity?" prompt shown once, right after a Personal
 * Development trainee finishes BUILDING (first-time saving) one of the
 * five protocols (State/Urge/Thought/Presence/Belief) -- reuses the SAME
 * IDENTITY_EXTENSION_OFFER_QUESTION text and, on "כן", the SAME
 * /identity-extension/offer picker/creation flow the existing
 * LIVE-completion offer already routes to (see arc/identityExtension.ts's
 * own module doc and live/IdentityExtensionOfferScreen.tsx) -- never a
 * second identity engine. "לא" runs the caller's own normal post-save
 * navigation; either way the main protocol is already saved by the time
 * this renders, so declining never loses or blocks that save.
 */
export function IdentityContinuationOffer({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <View style={styles.content}>
      <Text style={styles.title}>התוכנית נשמרה</Text>
      <Text style={styles.question}>{IDENTITY_EXTENSION_OFFER_QUESTION}</Text>
      <Pressable style={[styles.button, styles.fullWidthButton]} onPress={onYes}>
        <Text style={styles.buttonText}>כן</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={onNo}>
        <Text style={styles.secondaryButtonText}>לא</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 8, color: "#1a6b4a" },
  question: { fontSize: 17, textAlign: "right", marginBottom: 16, lineHeight: 24 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { backgroundColor: "#eee" },
  secondaryButtonText: { color: "#333", fontWeight: "600", fontSize: 16 },
});
