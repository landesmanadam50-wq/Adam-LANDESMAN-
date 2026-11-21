import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TaskPurposeContext } from "../../arc/taskPurposeContext.ts";

/**
 * live/components/TaskPurposeCard.tsx
 *
 * Task LIVE Purpose Card task: a compact, collapsible card showing "why
 * this task matters" (goal/reason/value/identity) above the timer on
 * Task LIVE -- never a separate screen. Renders only the fields the
 * caller's resolved TaskPurposeContext actually has (arc/
 * taskPurposeContext.ts never invents a value); renders nothing at all
 * when every field is empty, so a task with no linked goal and no
 * task-level reason/value/identity shows no shell, exactly as the spec
 * requires.
 *
 * Expanded by default on every mount -- the collapse/expand toggle
 * below is local, in-memory UI state only, never persisted; nothing in
 * the spec asks the collapsed/expanded choice itself to survive a
 * remount, only the underlying goal/reason/value/identity data (which
 * lives entirely in AsyncStorage via Task/PurposeManifest/ArcGymGoal/
 * ArcGoal, completely untouched by this component).
 */
export default function TaskPurposeCard({ context }: { context: TaskPurposeContext }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!context.goal && !context.reason && !context.value && !context.identity) return null;

  return (
    <View style={styles.card}>
      <Pressable style={styles.headerRow} onPress={() => setCollapsed((previous) => !previous)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Text style={styles.toggleIcon}>{collapsed ? "▸" : "▾"}</Text>
        <Text style={styles.headerTitle}>למה זה חשוב לי</Text>
      </Pressable>
      {!collapsed && (
        <View style={styles.body}>
          {context.goal && <PurposeRow label="המטרה שלי" value={context.goal} />}
          {context.reason && <PurposeRow label="הסיבה שלי לפעולה" value={context.reason} />}
          {context.value && <PurposeRow label="הערך שלי" value={context.value} />}
          {context.identity && <PurposeRow label="הזהות שלי" value={context.identity} />}
        </View>
      )}
    </View>
  );
}

function PurposeRow({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.row}>
      <Text style={styles.rowLabel}>{`${label}: `}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#F5FAFD", borderRadius: 14, borderWidth: 1, borderColor: "#dbe8ef", padding: 12, marginBottom: 16 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  toggleIcon: { fontSize: 13, color: "#0a7ea4" },
  headerTitle: { fontSize: 13, fontWeight: "700", color: "#0a7ea4", textAlign: "right" },
  body: { marginTop: 8, gap: 6 },
  row: { textAlign: "right", writingDirection: "rtl" },
  rowLabel: { fontSize: 14, fontWeight: "600", color: "#444" },
  rowValue: { fontSize: 14, color: "#222" },
});
