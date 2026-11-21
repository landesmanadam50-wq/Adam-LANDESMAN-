import { useLocalSearchParams } from "expo-router";
import ArcPerspectiveFlowScreen from "../../build/ArcPerspectiveFlowScreen.tsx";
import type { ArcPerspectiveMode } from "../../arc/arcPerspective.ts";

export default function ArcPerspective() {
  const { id, mode, eventId } = useLocalSearchParams<{ id: string; mode?: string; eventId?: string }>();
  return <ArcPerspectiveFlowScreen id={id} mode={(mode === "planned" ? "planned" : "real_time") as ArcPerspectiveMode} eventId={eventId ?? null} />;
}
