import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  loadArcBuilds,
  loadBeliefArcs,
  loadMiniArcBuilds,
  loadPersonalDevelopmentPrograms,
  loadPresenceArcs,
  loadThoughtArcs,
  loadUrgeArcs,
  upsertPersonalDevelopmentProgram,
} from "../data/storage.ts";
import { createPersonalDevelopmentProgram, findProgramsForProtocol, resolveCompatibleMiniArc } from "../arc/personalDevelopmentProgram.ts";
import type { PersonalDevelopmentFourWeekProgram, PersonalDevelopmentProtocolKind } from "../arc/types.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

interface ProtocolOption {
  kind: PersonalDevelopmentProtocolKind;
  label: string;
  id: string;
  name: string;
}

const PROTOCOL_KIND_LABELS: Record<PersonalDevelopmentProtocolKind, string> = {
  state: "ARC State",
  urge: "ARC Urge",
  thought: "ARC Thought",
  presence: "ARC Presence",
  belief: "ARC Belief",
};

/**
 * build/PersonalDevelopmentProgramListScreen.tsx (route: /personal-development-program/index)
 *
 * Phase 9: list existing Personal Development four-week programs and
 * create a new one -- picks the protocol kind, then WHICH already-saved
 * record of that kind to track (never a duplicate of that record's own
 * content -- see arc/personalDevelopmentProgram.ts's own module doc),
 * then creates the program starting today and opens its LIVE dashboard.
 */
export default function PersonalDevelopmentProgramListScreen() {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [programs, setPrograms] = useState<PersonalDevelopmentFourWeekProgram[]>([]);
  const [options, setOptions] = useState<ProtocolOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [selectedKind, setSelectedKind] = useState<PersonalDevelopmentProtocolKind | null>(null);

  const reload = useCallback(async () => {
    const [loadedPrograms, arcBuilds, urgeArcs, thoughtArcs, presenceArcs, beliefArcs] = await Promise.all([
      loadPersonalDevelopmentPrograms(),
      loadArcBuilds(),
      loadUrgeArcs(),
      loadThoughtArcs(),
      loadPresenceArcs(),
      loadBeliefArcs(),
    ]);
    setPrograms(loadedPrograms);
    setOptions([
      ...arcBuilds.map((b) => ({ kind: "state" as const, label: PROTOCOL_KIND_LABELS.state, id: b.id, name: b.name })),
      ...urgeArcs.map((b) => ({ kind: "urge" as const, label: PROTOCOL_KIND_LABELS.urge, id: b.id, name: b.name })),
      ...thoughtArcs.map((b) => ({ kind: "thought" as const, label: PROTOCOL_KIND_LABELS.thought, id: b.id, name: b.name })),
      ...presenceArcs.map((b) => ({ kind: "presence" as const, label: PROTOCOL_KIND_LABELS.presence, id: b.id, name: b.name })),
      ...beliefArcs.map((b) => ({ kind: "belief" as const, label: PROTOCOL_KIND_LABELS.belief, id: b.id, name: b.name })),
    ]);
    setStatus("ready");
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleCreate(option: ProtocolOption) {
    // Never creates a duplicate program for the same already-tracked
    // record -- if one exists, open it instead (spec section 2: "Do not
    // create duplicate protocol or Link records merely to display them
    // in the weekly program").
    const existing = findProgramsForProtocol(programs, option.kind, option.id)[0];
    if (existing) {
      setCreating(false);
      router.push({ pathname: "/personal-development-program/live/[id]", params: { id: existing.id } });
      return;
    }
    const miniArcs = await loadMiniArcBuilds();
    const compatibleMini = resolveCompatibleMiniArc(option.kind, option.id, miniArcs);
    const now = new Date().toISOString();
    const program = createPersonalDevelopmentProgram(option.kind, option.id, option.name, todayLocalDateString(), compatibleMini?.id ?? null, now);
    await upsertPersonalDevelopmentProgram(program);
    setCreating(false);
    setSelectedKind(null);
    router.push({ pathname: "/personal-development-program/live/[id]", params: { id: program.id } });
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const optionsForSelectedKind = selectedKind ? options.filter((o) => o.kind === selectedKind) : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תוכניות ארבעת השבועות -- התפתחות אישית</Text>

        {programs.length === 0 && !creating && <Text style={styles.hint}>עדיין אין תוכניות. אפשר ליצור תוכנית חדשה למטה.</Text>}

        {programs.map((program) => (
          <Pressable
            key={program.id}
            style={styles.card}
            onPress={() => router.push({ pathname: "/personal-development-program/live/[id]", params: { id: program.id } })}
          >
            <Text style={styles.cardTitle}>{program.name}</Text>
            <Text style={styles.cardRow}>{`${PROTOCOL_KIND_LABELS[program.protocolKind]} -- שבוע ${program.currentWeek}`}</Text>
          </Pressable>
        ))}

        {!creating ? (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => setCreating(true)}>
            <Text style={styles.buttonText}>+ תוכנית חדשה</Text>
          </Pressable>
        ) : (
          <View style={styles.card}>
            {!selectedKind ? (
              <>
                <Text style={styles.cardTitle}>איזה סוג פרוטוקול?</Text>
                {(Object.keys(PROTOCOL_KIND_LABELS) as PersonalDevelopmentProtocolKind[]).map((kind) => (
                  <Pressable key={kind} style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => setSelectedKind(kind)}>
                    <Text style={styles.secondaryButtonText}>{PROTOCOL_KIND_LABELS[kind]}</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>{`איזה ${PROTOCOL_KIND_LABELS[selectedKind]} שמור לעקוב אחריו?`}</Text>
                {optionsForSelectedKind.length === 0 && <Text style={styles.hint}>עדיין אין פרוטוקול שמור מהסוג הזה.</Text>}
                {optionsForSelectedKind.map((option) => (
                  <Pressable key={option.id} style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => handleCreate(option)}>
                    <Text style={styles.secondaryButtonText}>{option.name}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.cancelButton} onPress={() => setSelectedKind(null)}>
                  <Text style={styles.cancelButtonText}>חזרה</Text>
                </Pressable>
              </>
            )}
            <Pressable style={styles.cancelButton} onPress={() => { setCreating(false); setSelectedKind(null); }}>
              <Text style={styles.cancelButtonText}>ביטול</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 12 },
  card: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  cardRow: { fontSize: 14, textAlign: "right", color: "#555" },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  cancelButton: { marginTop: 10, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});
