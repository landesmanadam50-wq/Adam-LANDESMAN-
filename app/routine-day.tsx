import { useLocalSearchParams } from "expo-router";
import FlexibleDailyScreen from "../build/FlexibleDailyScreen.tsx";

export default function RoutineDay() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <FlexibleDailyScreen date={date ?? null} />;
}
