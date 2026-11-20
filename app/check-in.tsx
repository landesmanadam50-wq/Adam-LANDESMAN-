import { useLocalSearchParams } from "expo-router";
import EmotionalCheckInRouteScreen from "../live/EmotionalCheckInRouteScreen.tsx";
import type { EmotionalCheckInChoice } from "../data/emotionalCheckInRouting.ts";

const VALID_CHOICES: EmotionalCheckInChoice[] = ["full_arc", "shortened_arc", "next_task", "urge"];

function resolveChoice(raw?: string): EmotionalCheckInChoice | null {
  return VALID_CHOICES.includes(raw as EmotionalCheckInChoice) ? (raw as EmotionalCheckInChoice) : null;
}

export default function CheckIn() {
  const { choice } = useLocalSearchParams<{ choice?: string }>();
  return <EmotionalCheckInRouteScreen choice={resolveChoice(choice)} />;
}
