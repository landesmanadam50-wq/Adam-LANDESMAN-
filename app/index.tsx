import FlexibleDailyScreen from "../build/FlexibleDailyScreen.tsx";

/**
 * Open Today's Schedule Automatically task: ARCHI's unconditional
 * launch screen is now TODAY's own Flexible Daily Timetable (never a
 * first-time-setup gate, never the Weekly overview itself) -- passing
 * no `date` makes FlexibleDailyScreen default to todayLocalDateString(),
 * the device's own local-timezone "today", recomputed fresh on every
 * mount/focus (see its own reload(), run again on every focus via
 * useFocusEffect) so midnight rollovers, app restarts, and Android
 * reboots all resolve to the CURRENT date, never a stale cached one.
 * This reads/applies existing overrides -- it never writes a fresh one
 * just by opening.
 *
 * The Fixed Weekly Timetable itself moved to its own direct route,
 * /routine-week (still fully intact, reachable from here via
 * FlexibleDailyScreen's own "לשבוע הקבוע" button) -- no destructive
 * migration, no deleted screen, same "add new, never delete" precedent
 * already used for the old Automatic Routine Builder
 * (/routine-setup-legacy, /daily-schedule-legacy).
 */
export default function Home() {
  return <FlexibleDailyScreen />;
}
