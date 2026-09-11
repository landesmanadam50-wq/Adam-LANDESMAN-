import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * build/CollapsibleSection.tsx
 *
 * Single-page BUILD task (spec section 3): the one shared expand/collapse
 * primitive every single-page BUILD screen uses instead of step-by-step
 * "המשך"/"הבא" navigation. A tap on the header only toggles a local
 * open/closed flag -- it never unmounts its children, so whatever the
 * trainee already typed into a field inside a closed section is exactly
 * the value React still holds when the section reopens (every field's
 * real value lives in the parent screen's own draft/entity state, same
 * as every existing BUILD screen already does; this component only
 * controls visibility, never data).
 *
 * `defaultExpanded` lets a screen open required/core sections by default
 * and keep optional/advanced ones collapsed, per this task's own
 * requirement -- each caller decides per section, this component just
 * honors whatever it's told.
 */
export default function CollapsibleSection({
  title,
  subtitle,
  defaultExpanded = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={() => setExpanded((current) => !current)}>
        <Text style={styles.chevron}>{expanded ? "▾" : "◂"}</Text>
        <View style={styles.headerTextColumn}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </Pressable>
      <View style={!expanded && styles.hidden}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "#E6F4FE",
    borderRadius: 10,
    marginTop: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f7fbfd",
  },
  headerTextColumn: { flex: 1 },
  title: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#0a7ea4" },
  subtitle: { fontSize: 12, textAlign: "right", color: "#666", marginTop: 2 },
  chevron: { fontSize: 14, color: "#0a7ea4", marginStart: 10 },
  hidden: { display: "none" },
});
