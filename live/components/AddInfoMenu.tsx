import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

/**
 * live/components/AddInfoMenu.tsx
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 6: a single "+ להוסיף מידע" button that opens a menu
 * centralizing ARCHI's existing "add" options -- the SAME four
 * destinations/gating build/FlexibleDailyScreen.tsx's own
 * quickActionsRow already has (never deleted, only reorganized behind
 * one button). Mounted identically on both the home screen and the
 * app's entry sequence, below the two cubes.
 */
export default function AddInfoMenu({ showHomeInsightButton }: { showHomeInsightButton: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable style={styles.openButton} onPress={() => setOpen(true)}>
        <Text style={styles.openButtonText}>+ להוסיף מידע</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setOpen(false);
                router.push({ pathname: "/tasks/[id]/edit", params: { id: "new" } });
              }}
            >
              <Text style={styles.menuRowText}>+ משימה</Text>
            </Pressable>
            {showHomeInsightButton && (
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setOpen(false);
                  router.push("/insights/new");
                }}
              >
                <Text style={styles.menuRowText}>+ תובנה</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setOpen(false);
                router.push("/positive-memories/new");
              }}
            >
              <Text style={styles.menuRowText}>+ אירוע חיובי</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setOpen(false);
                router.push("/arc-saving/activate");
              }}
            >
              <Text style={styles.menuRowText}>+ ARC Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  openButton: { backgroundColor: "#2E7D32", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 14 },
  openButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" },
  menu: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 12, gap: 6 },
  menuRow: { paddingVertical: 14, alignItems: "center", backgroundColor: "#F5FAFD", borderRadius: 10 },
  menuRowText: { fontSize: 15, fontWeight: "700", color: "#222" },
});
