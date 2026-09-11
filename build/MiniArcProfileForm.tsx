import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  MINI_ARC_COLOR_PRESETS,
  MINI_ARC_ENCODING_ACTION_PRESETS,
  MINI_ARC_REGULATION_ANCHOR_PRESETS,
} from "../arc/miniArc.ts";
import type { MiniArcDraft } from "../arc/miniArc.ts";
import { ARC_LINK_TRIGGER_TYPE_LABELS } from "../arc/bodyImagery.ts";
import type { ArcLinkTriggerType } from "../arc/bodyImagery.ts";
import CollapsibleSection from "./CollapsibleSection.tsx";

/**
 * build/MiniArcProfileForm.tsx
 *
 * Single-page BUILD task (spec section 3): Mini ARC's own five-question
 * field set was already a single flat page (build/MiniArcEditorScreen.tsx's
 * own doc: "deliberately not a multi-step wizard... a step-machine sized
 * for the full ARC protocol would be both overkill"), so nothing about
 * its underlying logic changes here -- this only groups its fields into
 * named CollapsibleSection blocks (required fields expanded by default,
 * the advanced body-part/movement-text and trigger fields collapsed),
 * and extracts them into their own reusable component so
 * build/SelfDevelopmentBuildScreen.tsx (the new unified single-page
 * BUILD, offering Full ARC/Mini ARC/both from one page) can embed the
 * exact same fields build/MiniArcEditorScreen.tsx already uses -- one
 * implementation, never a second, divergent copy.
 */
export function MiniArcProfileForm({ draft, setDraft }: { draft: MiniArcDraft; setDraft: (updater: MiniArcDraft | ((current: MiniArcDraft) => MiniArcDraft)) => void }) {
  return (
    <View>
      <CollapsibleSection title="יסודות" defaultExpanded>
        <View style={styles.sectionBody}>
          <Text style={styles.question}>איך תרצה לקרוא ל־Mini ARC הזה?</Text>
          <TextInput
            style={styles.textInput}
            value={draft.name}
            onChangeText={(value) => setDraft({ ...draft, name: value })}
            textAlign="right"
            placeholder="לדוגמה: עצירה מול דחף"
          />

          <Text style={styles.question}>באיזה צבע מתמלאת הנוכחות שלך?</Text>
          <View style={styles.chipRow}>
            {MINI_ARC_COLOR_PRESETS.map((color) => (
              <Pressable
                key={color}
                style={[styles.chip, draft.presenceColor === color && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, presenceColor: color })}
              >
                <Text style={styles.chipText}>{color}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.textInput}
            value={draft.presenceColor}
            onChangeText={(value) => setDraft({ ...draft, presenceColor: value })}
            textAlign="right"
            placeholder="לדוגמה: סגול"
          />

          <Text style={styles.question}>באיזה עוגן ויסות אחד תרצה להשתמש?</Text>
          <View style={styles.chipRow}>
            {MINI_ARC_REGULATION_ANCHOR_PRESETS.map((preset) => (
              <Pressable
                key={preset.label}
                style={[styles.chip, draft.regulationAnchor === preset.instruction && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, regulationAnchor: preset.instruction })}
              >
                <Text style={styles.chipText}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.textInput}
            value={draft.regulationAnchor}
            onChangeText={(value) => setDraft({ ...draft, regulationAnchor: value })}
            textAlign="right"
            placeholder="לדוגמה: הרגש את כפות הרגליים על הקרקע."
            multiline
          />

          <Text style={styles.question}>איזו פעולת קידוד גופנית קטנה תחבר אותך למצב הרצוי?</Text>
          <View style={styles.chipRow}>
            {MINI_ARC_ENCODING_ACTION_PRESETS.map((preset) => (
              <Pressable
                key={preset}
                style={[styles.chip, draft.encodingAction === preset && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, encodingAction: preset })}
              >
                <Text style={styles.chipText}>{preset}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.textInput}
            value={draft.encodingAction}
            onChangeText={(value) => setDraft({ ...draft, encodingAction: value })}
            textAlign="right"
            placeholder="לדוגמה: ליישר בעדינות את הגב"
          />

          <Text style={styles.question}>מהי הפעולה המיטיבה שאליה ה־Mini ARC יוביל?</Text>
          <TextInput
            style={styles.textInput}
            value={draft.beneficialAction}
            onChangeText={(value) => setDraft({ ...draft, beneficialAction: value })}
            textAlign="right"
            placeholder="לדוגמה: להרחיק את היד מהאוזן ולהניח אותה על הרגל."
            multiline
          />
        </View>
      </CollapsibleSection>

      <CollapsibleSection title="פרטים גופניים מתקדמים">
        <View style={styles.sectionBody}>
          <Text style={styles.question}>באילו חלקי גוף מתרחש עוגן הוויסות שהגדרת? (רשות, לדמיון ב-Mini ARC Link, מופרדים בפסיק)</Text>
          <TextInput
            style={styles.textInput}
            value={draft.regulationBodyParts}
            onChangeText={(value) => setDraft({ ...draft, regulationBodyParts: value })}
            textAlign="right"
            placeholder="לדוגמה: הבטן, האף"
          />
          <Text style={styles.question}>איך הגוף מבצע אותו? (רשות)</Text>
          <TextInput
            style={styles.textInput}
            value={draft.regulationMovementText}
            onChangeText={(value) => setDraft({ ...draft, regulationMovementText: value })}
            textAlign="right"
            multiline
          />

          <Text style={styles.question}>באילו חלקי גוף מתרחשת פעולת הקידוד שהגדרת? (רשות, לדמיון ב-Mini ARC Link, מופרדים בפסיק)</Text>
          <TextInput
            style={styles.textInput}
            value={draft.encodingBodyParts}
            onChangeText={(value) => setDraft({ ...draft, encodingBodyParts: value })}
            textAlign="right"
            placeholder="לדוגמה: הגב, עמוד השדרה"
          />
          <Text style={styles.question}>איך הגוף מבצע אותה? (רשות)</Text>
          <TextInput
            style={styles.textInput}
            value={draft.encodingMovementText}
            onChangeText={(value) => setDraft({ ...draft, encodingMovementText: value })}
            textAlign="right"
            multiline
          />
        </View>
      </CollapsibleSection>

      <CollapsibleSection title="טריגר ל-ARC Link">
        <View style={styles.sectionBody}>
          <Text style={styles.question}>מתי או אחרי מה תרצה לזכור להתחיל את התרגיל? (רשות)</Text>
          <View style={styles.chipRow}>
            {(Object.keys(ARC_LINK_TRIGGER_TYPE_LABELS) as ArcLinkTriggerType[]).map((type) => (
              <Pressable
                key={type}
                style={[styles.chip, draft.linkTriggerType === type && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, linkTriggerType: type })}
              >
                <Text style={styles.chipText}>{ARC_LINK_TRIGGER_TYPE_LABELS[type]}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.textInput}
            value={draft.linkTriggerText}
            onChangeText={(value) => setDraft({ ...draft, linkTriggerText: value })}
            textAlign="right"
            placeholder="לדוגמה: בשעה 10:00 / אחרי שאני קם מהמיטה"
          />
        </View>
      </CollapsibleSection>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBody: { padding: 14, gap: 4 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 14, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
});
