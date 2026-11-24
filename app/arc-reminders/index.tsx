import { useLocalSearchParams } from "expo-router";
import ArcRemindersScreen from "../../build/ArcRemindersScreen.tsx";
import type { ArcMantraSourceRef, ArcMantraSubtype, ArcRecallSourceKind } from "../../arc/arcReminders.ts";

/**
 * Optional prefill params carried in from a per-source "remind me of
 * this" entry point on an existing screen -- see
 * build/ArcRemindersScreen.tsx's own `prefill` prop doc. `mantraSourceRef`
 * is a JSON-encoded ArcMantraSourceRef (its shape varies by subtype),
 * never raw text content.
 */
export default function ArcRemindersIndex() {
  const params = useLocalSearchParams<{
    mantraSubtype?: ArcMantraSubtype;
    mantraSourceRef?: string;
    recallSourceKind?: ArcRecallSourceKind;
    recallSourceId?: string;
  }>();

  if (params.mantraSubtype && params.mantraSourceRef) {
    const sourceRef = JSON.parse(params.mantraSourceRef) as ArcMantraSourceRef;
    return <ArcRemindersScreen prefill={{ kind: "mantra", subtype: params.mantraSubtype, sourceRef }} />;
  }
  if (params.recallSourceKind && params.recallSourceId) {
    return <ArcRemindersScreen prefill={{ kind: "recall", sourceKind: params.recallSourceKind, sourceId: params.recallSourceId }} />;
  }
  return <ArcRemindersScreen />;
}
