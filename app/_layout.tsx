import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import notifee from "@notifee/react-native";

import { routeTappedReminder } from "../data/reminders.ts";
import { handleTaskAlarmEvent, registerTaskAlarmForegroundService } from "../data/taskAlarm.ts";
import { syncEmotionalCheckInNotification } from "../data/emotionalCheckInNotification.ts";
import { syncMorningAlarm } from "../data/morningAlarm.ts";
import { topUpRemindersIfNeeded } from "../data/arcReminderScheduler.ts";
import DailyStartupSequenceOverlay from "../live/DailyStartupSequenceOverlay.tsx";

/**
 * Task-alarm task: both of these MUST run at module scope, as early as
 * possible -- never inside a component or a useEffect -- per notifee's
 * own requirement for registerForegroundService/onBackgroundEvent to
 * reliably catch an event that arrives while the app isn't already
 * running (the whole point of a real alarm). app/_layout.tsx is the
 * earliest guaranteed-to-run file in this Expo Router project (no
 * custom index.js entry exists), so it's registered here, once.
 */
registerTaskAlarmForegroundService();
notifee.onBackgroundEvent(handleTaskAlarmEvent);

/**
 * Reminder/timer-update task (#4, #5): routes a tapped reminder
 * notification toward its relevant entry point. Only still handles the
 * FOUR current-task kinds directly (taskTimerEnded/restTimerEnded/
 * postponedTaskReturn/taskScheduledStart) -- these never migrated off
 * expo-notifications (data/notifications.ts's own
 * CURRENT_TASK_REMINDER_KINDS doc explains why), so this remains their
 * one and only tap-routing path. Every OTHER reminder kind now delivers
 * through notifee instead (ARCHI -- Complete the Non-Interrupting
 * Notification System task), so its tap arrives via
 * data/taskAlarm.ts's own handleTaskAlarmEvent, not this
 * expo-notifications listener -- both paths delegate to the SAME
 * data/reminders.ts routeTappedReminder, never two competing switches.
 */
function handleReminderResponse(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  const data = response.notification.request.content.data;
  if (data?.isReminder !== true) return; // Not one of ours (or a timer-completion notification, which never navigates anywhere).
  const kind = data.kind as string;
  // Hebrew BUILD/LIVE rework spec: own independent notification per
  // task, never PendingReminder's one-per-kind model. Deep-links
  // straight to the task's own screen, which renders the 3-choice
  // end-of-timer prompt itself once it reloads the (already-ended)
  // TaskTimerRun -- this is the spec's own sanctioned fallback for "if
  // not all three choices can be shown in the notification, tapping it
  // opens the choice screen".
  if (kind === "taskTimerEnded" || kind === "restTimerEnded" || kind === "postponedTaskReturn" || kind === "taskScheduledStart") {
    const taskId = typeof data.taskId === "string" ? data.taskId : null;
    if (taskId) router.push({ pathname: "/tasks/[id]", params: { id: taskId } });
    return;
  }
  routeTappedReminder(data as Record<string, unknown>);
}

export default function RootLayout() {
  useEffect(() => {
    // Cold start: the app was opened BY tapping a reminder notification.
    Notifications.getLastNotificationResponseAsync().then(handleReminderResponse);
    // Already running (foreground/background, not killed): the trainee taps a reminder notification now.
    const subscription = Notifications.addNotificationResponseReceivedListener(handleReminderResponse);
    // Task-alarm task: the app is already open (foreground) when an alarm action/press happens -- onBackgroundEvent above covers the killed/backgrounded case, this covers the rest. Same handleTaskAlarmEvent either way.
    const unsubscribeTaskAlarm = notifee.onForegroundEvent(handleTaskAlarmEvent);
    // Nine Functional Improvements task, Improvement 8: re-syncs the
    // quiet lock-screen check-in notification on every cold start --
    // shows/refreshes it if the trainee has it enabled, removes any
    // leftover one if they've since disabled it (e.g. between app
    // updates). Fire-and-forget, same as every other startup
    // reconciliation call in this effect.
    syncEmotionalCheckInNotification();
    // Nine Functional Improvements task, Improvement 9: re-syncs the
    // morning alarm on every cold start -- this is what makes a time/
    // weekday-recurrence change, a device reboot, or a timezone change
    // (all real Date arithmetic, recomputed fresh here) actually take
    // effect without the trainee having to reopen the settings screen.
    syncMorningAlarm();
    // ARC Reminders task: rolling-window top-up on every cold start --
    // mitigates notifee's own documented "very-late-reboot can replay
    // one stale alarm" limitation by re-topping-up the next ~72h of
    // mantra/recall triggers the instant the app is opened again, same
    // fire-and-forget pattern as the two syncs above.
    topUpRemindersIfNeeded();
    return () => {
      subscription.remove();
      unsubscribeTaskAlarm();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerTitleAlign: "center" }}>
        <Stack.Screen name="index" options={{ title: "היום הגמיש" }} />
        {/* Unified Emotional Check-In and Task Postponement System,
            section 2: the Android Home Screen Widget's own deep-link
            target (archi://check-in?choice=...) -- a momentary stub
            that immediately resolves through the shared routing module
            and replaces itself, never a screen the trainee sees for
            long or can navigate back to. */}
        <Stack.Screen name="check-in" options={{ title: "איך אתה מרגיש כרגע?" }} />
        {/* ARC GYM task: a personalized behavioral training environment
            built on top of the existing Manifest/ARC LIVE/emotional
            check-in architecture -- see arc/arcGym.ts's own module doc. */}
        <Stack.Screen name="arc-gym/index" options={{ title: "ARC GYM" }} />
        <Stack.Screen name="arc-gym/behavior/[behaviorId]" options={{ title: "התנהגות" }} />
        <Stack.Screen name="arc-gym/situation/[id]" options={{ title: "סיטואציה" }} />
        <Stack.Screen name="arc-gym/situation/[id]/edit" options={{ title: "עריכת סיטואציה" }} />
        <Stack.Screen name="arc-gym/train/[id]" options={{ title: "אימון ARC GYM" }} />
        <Stack.Screen name="arc-gym/visualize-only/[id]" options={{ title: "דימיון הפעולה" }} />
        {/* ARCHI -- Unified Development Specification task, Part 1 ("ARC
            MEMORY EXERCISE TYPE"): a second, independent ARC GYM
            exercise type -- see arc/arcGym.ts's own ArcGymMemoryExercise
            doc for why it is never confused with the pre-existing
            ArcGymMemory (historical sensations) above. */}
        <Stack.Screen name="arc-gym/memory/index" options={{ title: "תרגילי זיכרון" }} />
        <Stack.Screen name="arc-gym/memory/[id]" options={{ title: "תרגיל זיכרון" }} />
        <Stack.Screen name="arc-gym/memory/[id]/edit" options={{ title: "עריכת תרגיל זיכרון" }} />
        <Stack.Screen name="arc-gym/memory/[id]/train" options={{ title: "אימון זיכרון" }} />
        <Stack.Screen name="arc-gym/reminder/[id]/edit" options={{ title: "תזכורת אימון" }} />
        {/* ARCHI -- ARC Result: Automatic, Optional Suggestion Without
            Extra Shortcuts task: a third, independent ARC GYM exercise
            type (arc/arcResult.ts) -- creation/editing/task-linking stay
            inside ARC GYM (section 7); the automatic suggestion and its
            quick-practice screen below are reached from outside ARC GYM
            entirely (post-ARC completion, the 😄 shortcut), never from
            a Home/floating-cube button of their own (section 2). */}
        <Stack.Screen name="arc-gym/result/index" options={{ title: "תרגילי הצלחה" }} />
        <Stack.Screen name="arc-gym/result/[id]" options={{ title: "תרגיל הצלחה" }} />
        <Stack.Screen name="arc-gym/result/[id]/edit" options={{ title: "עריכת תרגיל הצלחה" }} />
        {/* ARC Focus task: a fourth, independent ARC GYM exercise type --
            settings screen (also reused for re-opening an existing
            scheduled task's own settings, via ?taskId=) -- see
            arc/arcFocusSession.ts's own module doc. */}
        <Stack.Screen name="arc-gym/arc-focus" options={{ title: "ARC Focus" }} />
        <Stack.Screen name="arc-gym/decision" options={{ title: "ARC Decision" }} />
        <Stack.Screen name="arc-gym/goal/index" options={{ title: "מטרות ARC" }} />
        <Stack.Screen name="arc-gym/goal/[id]" options={{ title: "מטרת ARC" }} />
        <Stack.Screen name="arc-gym/goal/[id]/edit" options={{ title: "עריכת מטרת ARC" }} />
        <Stack.Screen name="arc-gym/goal/[id]/objectives" options={{ title: "יעדים" }} />
        <Stack.Screen name="arc-gym/goal/[id]/tasks" options={{ title: "משימות מעשיות" }} />
        <Stack.Screen name="arc-gym/goal/[id]/exercises" options={{ title: "תרגילים מקושרים" }} />
        <Stack.Screen name="arc-gym/focus-exercise/index" options={{ title: "תרגילי Focus שמורים" }} />
        <Stack.Screen name="arc-gym/focus-exercise/[id]" options={{ title: "תרגיל Focus" }} />
        <Stack.Screen name="arc-gym/focus-exercise/[id]/edit" options={{ title: "עריכת תרגיל Focus" }} />
        <Stack.Screen name="arc-gym/perspective/index" options={{ title: "ARC Perspective" }} />
        <Stack.Screen name="arc-gym/perspective/[id]" options={{ title: "אירוע" }} />
        <Stack.Screen name="arc-gym/writing/index" options={{ title: "ARC Writing" }} />
        <Stack.Screen name="arc-gym/writing/[id]" options={{ title: "כתיבה" }} />
        <Stack.Screen name="arc-gym/book/[id]" options={{ title: "הספר שלי" }} />
        <Stack.Screen name="arc-gym/book/[id]/chapter/[chapterId]" options={{ title: "פרק" }} />
        <Stack.Screen name="arc-gym/video/record/[scriptId]" options={{ title: "צילום סרטון", headerShown: false }} />
        <Stack.Screen name="arc-gym/video/preview/[id]" options={{ title: "תצוגה מקדימה" }} />
        <Stack.Screen name="arc-gym/video/index" options={{ title: "ספריית הסרטונים שלי" }} />
        <Stack.Screen name="arc-gym/video/[id]" options={{ title: "סרטון" }} />
        <Stack.Screen name="arc-perspective/[id]" options={{ title: "ARC Perspective" }} />
        {/* ARC Saving, Trigger Management & Quick-Action Buttons task:
            own independent entry card (never nested under arc-gym/*),
            same convention as arc-learning/arc-creativity above. */}
        <Stack.Screen name="arc-reminders/index" options={{ title: "ARC Reminders" }} />
        <Stack.Screen name="arc-reminders/settings" options={{ title: "הגדרות ARC Reminders" }} />
        <Stack.Screen name="arc-recall/chat/[reminderId]" options={{ title: "שיח זכירה" }} />
        <Stack.Screen name="arc-saving/index" options={{ title: "ARC Saving" }} />
        <Stack.Screen name="arc-saving/trigger/[id]" options={{ title: "טריגר" }} />
        <Stack.Screen name="arc-saving/active-triggers" options={{ title: "עריכת טריגרים" }} />
        <Stack.Screen name="arc-saving/activate" options={{ title: "ARC Save" }} />
        <Stack.Screen name="arc-saving/review" options={{ title: "ARC Saving" }} />
        {/* ARC Learning + ARC Creativity + Integrated Spaced Repetition
            task: ARC Learning is a fully independent system from ARC
            Gym/ARC Goal, reached only from its own home card (never
            nested under arc-gym/*) -- see arc/arcLearningInsight.ts's
            own module doc. */}
        <Stack.Screen name="arc-learning/index" options={{ title: "ARC Learning" }} />
        <Stack.Screen name="arc-learning/topics/index" options={{ title: "נושאי למידה" }} />
        <Stack.Screen name="arc-learning/topics/[id]" options={{ title: "נושא למידה" }} />
        <Stack.Screen name="arc-learning/topics/[id]/edit" options={{ title: "עריכת נושא" }} />
        <Stack.Screen name="arc-learning/library" options={{ title: "כל התובנות" }} />
        <Stack.Screen name="arc-learning/continue" options={{ title: "המשך למידה" }} />
        <Stack.Screen name="arc-learning/insight/[id]" options={{ title: "תובנה" }} />
        <Stack.Screen name="arc-learning/insight/[id]/edit" options={{ title: "תובנה" }} />
        <Stack.Screen name="arc-learning/recall" options={{ title: "שליפה וחזרה" }} />
        <Stack.Screen name="arc-learning/schedule-review" options={{ title: "תזמון סקירה" }} />
        <Stack.Screen name="arc-learning/overview" options={{ title: "סקירות ממתינות" }} />
        {/* ARC Learning + ARC Creativity + Integrated Spaced Repetition
            task: ARC Creativity is a fully independent system, reached
            only from its own home card -- see arc/arcCreativityConnection.ts's
            own module doc. */}
        <Stack.Screen name="arc-creativity/index" options={{ title: "ARC Creativity" }} />
        <Stack.Screen name="arc-creativity/suggested" options={{ title: "קשרים מוצעים" }} />
        <Stack.Screen name="arc-creativity/cross-topic" options={{ title: "יצירתיות בין נושאים" }} />
        <Stack.Screen name="arc-creativity/within-topic" options={{ title: "יצירתיות בתוך נושא" }} />
        <Stack.Screen name="arc-creativity/recall" options={{ title: "שליפת קשרים" }} />
        <Stack.Screen name="arc-creativity/connections/index" options={{ title: "קשרים שמורים" }} />
        <Stack.Screen name="arc-creativity/connections/[id]" options={{ title: "קשר שמור" }} />
        <Stack.Screen name="arc-creativity/overview" options={{ title: "סקירות ממתינות" }} />
        <Stack.Screen name="arc-result-suggestion" options={{ title: "תרגול הצלחה" }} />
        <Stack.Screen name="arc-result-practice/[id]" options={{ title: "תרגול הצלחה" }} />
        <Stack.Screen name="self-development/index" options={{ title: "התפתחות אישית" }} />
        <Stack.Screen name="self-development/build" options={{ title: "בניית תוכנית חדשה" }} />
        <Stack.Screen name="reach-your-goal/index" options={{ title: "השגת מטרה" }} />
        <Stack.Screen name="today" options={{ title: "תכנון משימות" }} />
        <Stack.Screen name="routine-week" options={{ title: "שבוע קבוע" }} />
        <Stack.Screen name="routine-day" options={{ title: "היום הגמיש" }} />
        {/* ARCHI -- Replan Time task: reached from the "תכנון זמן מחדש" notification (data/replanTimeNotification.ts) when a task's full allocated window elapsed with nothing started. */}
        <Stack.Screen name="replan-time" options={{ title: "תכנון זמן מחדש" }} />
        <Stack.Screen name="todo-bank" options={{ title: "מאגר To-Do" }} />
        <Stack.Screen name="daily-schedule-legacy" options={{ title: "לוח יומי (ישן)" }} />
        <Stack.Screen name="routine-setup-legacy" options={{ title: "בניית שגרה (ישן)" }} />
        <Stack.Screen name="build/index" options={{ title: "ARC Builds" }} />
        <Stack.Screen name="build/[id]" options={{ title: "עריכת ARC Build" }} />
        <Stack.Screen name="arc-state-composition/[id]" options={{ title: "הרכבת ARC State" }} />
        <Stack.Screen name="live/index" options={{ title: "ARCHI LIVE" }} />
        <Stack.Screen name="stats/index" options={{ title: "התקדמות שבועית" }} />
        <Stack.Screen name="focus-success" options={{ title: "התמקדות בהצלחה" }} />
        <Stack.Screen name="routines/index" options={{ title: "השגרה שלי" }} />
        <Stack.Screen name="link-practice/index" options={{ title: "תרגול קישורים" }} />
        <Stack.Screen name="negative-action" options={{ title: "פעולה שלילית מוגבלת" }} />
        <Stack.Screen name="mini-arc/index" options={{ title: "בניית Mini ARC" }} />
        <Stack.Screen name="mini-arc/[id]" options={{ title: "עריכת Mini ARC" }} />
        <Stack.Screen name="mini-arc/live/[id]" options={{ title: "Mini ARC LIVE" }} />
        <Stack.Screen name="mini-arc/mode/[id]" options={{ title: "מה תרצה לתרגל?" }} />
        <Stack.Screen name="live/select" options={{ title: "מה תרצה לתרגל?" }} />
        {/* Hebrew BUILD/LIVE rework spec: an additive, optional pre-practice
            reflection gate -- not yet linked from any existing dashboard
            button, reachable only at this own route for now. */}
        <Stack.Screen name="live/gate" options={{ title: "לפני שמתחילים" }} />
        {/* ARC completion/Link simplification task: arc-link/[id] and
            mini-arc-link/[id] are kept registered ONLY so an old saved
            record (opened via a legacy ArcLink/practice-record deep
            link) still resolves -- see arc/futureArcLink.ts's own
            module doc. future-arc-link/[id] is the only Link route any
            new-creation UI ever navigates to now. */}
        <Stack.Screen name="arc-link/[id]" options={{ title: "ARC Link" }} />
        <Stack.Screen name="mini-arc-link/[id]" options={{ title: "Mini ARC Link" }} />
        <Stack.Screen name="future-arc-link/[id]" options={{ title: "קישור ARC עתידי מקוצר" }} />
        <Stack.Screen name="urge-arcs/index" options={{ title: "בניית Urge ARC" }} />
        <Stack.Screen name="urge-arcs/[id]" options={{ title: "עריכת Urge ARC" }} />
        <Stack.Screen name="urge-arcs/live/[id]" options={{ title: "Urge ARC LIVE" }} />
        <Stack.Screen name="thought-arcs/index" options={{ title: "בניית ARC Thought" }} />
        <Stack.Screen name="thought-arcs/[id]" options={{ title: "עריכת ARC Thought" }} />
        <Stack.Screen name="thought-arcs/live/[id]" options={{ title: "ARC Thought LIVE" }} />
        <Stack.Screen name="presence-arcs/index" options={{ title: "בניית ARC Presence" }} />
        <Stack.Screen name="presence-arcs/[id]" options={{ title: "עריכת ARC Presence" }} />
        <Stack.Screen name="presence-arcs/live/[id]" options={{ title: "ARC Presence LIVE" }} />
        <Stack.Screen name="belief-arcs/index" options={{ title: "בניית ARC Belief" }} />
        <Stack.Screen name="belief-arcs/[id]" options={{ title: "עריכת ARC Belief" }} />
        <Stack.Screen name="belief-arcs/live/[id]" options={{ title: "ARC Belief LIVE" }} />
        <Stack.Screen name="state-profiles/index" options={{ title: "המצבים הרצויים שלי" }} />
        <Stack.Screen name="state-profiles/[id]" options={{ title: "עריכת מצב רצוי" }} />
        <Stack.Screen name="interference-items/index" options={{ title: "פריטי הפרעה" }} />
        <Stack.Screen name="interference-items/[id]" options={{ title: "עריכת פריט הפרעה" }} />
        <Stack.Screen name="combined-selection/[stateProfileId]" options={{ title: "הגדרת גורמים מפריעים" }} />
        <Stack.Screen name="personal-development-routes/index" options={{ title: "השגרה שלי" }} />
        <Stack.Screen name="personal-development-routes/[id]" options={{ title: "עריכת תוכנית" }} />
        <Stack.Screen name="personal-development-routes/live-select" options={{ title: "מה תרצה לתרגל?" }} />
        <Stack.Screen name="personal-development-routes/[id]/live" options={{ title: "תרגול משולב LIVE" }} />
        <Stack.Screen name="personal-development-routes/[id]/route-link" options={{ title: "קישור ARC למסלול" }} />
        <Stack.Screen name="personal-development-routes/[id]/action-only" options={{ title: "סימון פעולה מיטיבה כבוצעה" }} />
        <Stack.Screen name="identity-extension/offer" options={{ title: "המשך לבניית הזהות" }} />
        <Stack.Screen name="identity-extension/live" options={{ title: "בניית הזהות והפעולה" }} />
        <Stack.Screen name="personal-development-program/index" options={{ title: "תוכניות התפתחות אישית" }} />
        <Stack.Screen name="personal-development-program/live/[id]" options={{ title: "תוכנית התפתחות אישית" }} />
        <Stack.Screen name="goals/index" options={{ title: "מטרות ARC Goal" }} />
        <Stack.Screen name="goals/[id]" options={{ title: "עריכת מטרה" }} />
        <Stack.Screen name="goals/live/[goalId]" options={{ title: "תוכנית ארבעת השבועות" }} />
        <Stack.Screen name="goals/mini-identity/[goalId]" options={{ title: "זהות קצרה לפעולה" }} />
        <Stack.Screen name="goals/execution/[goalId]" options={{ title: "ביצוע המטרה" }} />
        <Stack.Screen name="goals/target/[targetId]" options={{ title: "יעד" }} />
        <Stack.Screen name="calendar/index" options={{ title: "לוח שנה" }} />
        <Stack.Screen name="arc-goal/select" options={{ title: "מה תרצה לתרגל?" }} />
        <Stack.Screen name="arc-goal/live/[goalId]" options={{ title: "ARC Goal LIVE" }} />
        <Stack.Screen name="life-manifest/index" options={{ title: "מניפסט החיים שלי" }} />
        <Stack.Screen name="life-manifest/[id]" options={{ title: "עריכת מניפסט חיים" }} />
        <Stack.Screen name="life-manifest/sub-goal/[subGoalId]" options={{ title: "ניהול תת־מטרה" }} />
        <Stack.Screen name="life-manifest/visualize/[majorGoalId]" options={{ title: "דמיון מודרך" }} />
        {/* Hebrew BUILD/LIVE rework spec, page 3: a separate, standalone
            text-only guided practice -- not yet linked from any existing
            dashboard button, reachable only at this own route for now. */}
        <Stack.Screen name="manifest-meditation" options={{ title: "מדיטציית מניפסט" }} />
        <Stack.Screen name="purpose-manifests/index" options={{ title: "המניפסטים שלי" }} />
        <Stack.Screen name="purpose-manifests/[id]" options={{ title: "מניפסט" }} />
        {/* Manifest Goals & Automatic Task Scheduling task: Manifest -> Goals -> Tasks. */}
        <Stack.Screen name="purpose-manifests/[id]/goals" options={{ title: "יעדים ומשימות" }} />
        <Stack.Screen name="manifest-today" options={{ title: "חזון היום" }} />
        {/* Daily Visualization, Body Awareness & Morning Preparation task. */}
        <Stack.Screen name="daily-visualization" options={{ title: "הוויזואליזציה היומית שלי" }} />
        {/* Hebrew BUILD/LIVE rework spec, page 4: Goals/Tasks/Timer -- not
            yet linked from Home or any existing dashboard, reachable only
            at these own routes for now. */}
        <Stack.Screen name="routine-plan/setup" options={{ title: "בניית התכנית היומית" }} />
        <Stack.Screen name="routine-plan/task" options={{ title: "משימת שגרה" }} />
        <Stack.Screen name="tasks/index" options={{ title: "המשימות שלי" }} />
        <Stack.Screen name="tasks/insights" options={{ title: "תובנות" }} />
        {/* Task-start alarm vibration task, requirement 7. */}
        <Stack.Screen name="tasks/alarm-settings" options={{ title: "הגדרות שעון מעורר" }} />
        {/* Critical-bug task ("Native Alarm Still Not Working"), Step 2. */}
        <Stack.Screen name="tasks/alarm-diagnostics" options={{ title: "בדיקת שעון מעורר" }} />
        {/* Floating task timer task, requirement 1's own closing line. */}
        <Stack.Screen name="tasks/floating-timer-settings" options={{ title: "טיימר צף" }} />
        {/* ARCHI -- Unified 7-Part Update task, Part 7.1: the one
            general Settings hub. */}
        <Stack.Screen name="settings" options={{ title: "הגדרות" }} />
        {/* ARCHI -- Unified Development Specification task, Parts 3-6/8:
            the one insight-writing screen (Home/Settings share it),
            the collection, and the per-insight detail/task-link flow. */}
        <Stack.Screen name="insights/new" options={{ title: "הוסף תובנה" }} />
        <Stack.Screen name="insights/index" options={{ title: "אוסף תובנות" }} />
        <Stack.Screen name="insights/[id]" options={{ title: "תובנה" }} />
        <Stack.Screen name="insights/[id]/link-topics" options={{ title: "קישור ל-ARC Learning" }} />
        {/* ARC Questions task: open/answered questions, write/research, same returnToTaskId convention as /insights/new. */}
        <Stack.Screen name="questions/index" options={{ title: "ARC Questions" }} />
        <Stack.Screen name="questions/new" options={{ title: "שאלה חדשה" }} />
        <Stack.Screen name="questions/[id]" options={{ title: "ARC Questions" }} />
        {/* ARC Diary task: list by date, free-write, same returnToTaskId convention as /insights/new and /questions/new. */}
        <Stack.Screen name="diary/index" options={{ title: "ARC Diary" }} />
        <Stack.Screen name="diary/new" options={{ title: "ARC Diary" }} />
        <Stack.Screen name="diary/[id]" options={{ title: "ARC Diary" }} />
        <Stack.Screen name="positive-memories/index" options={{ title: "אירועים חיוביים" }} />
        <Stack.Screen name="positive-memories/new" options={{ title: "הוסף אירוע חיובי" }} />
        <Stack.Screen name="positive-memories/[id]" options={{ title: "אירוע חיובי" }} />
        <Stack.Screen name="positive-memories/draft/[draftId]" options={{ title: "תיעוד אירוע" }} />
        {/* Nine Functional Improvements task, Improvement 8. */}
        <Stack.Screen name="tasks/emotional-checkin-settings" options={{ title: "בדיקת מצב רגשי במסך הנעילה" }} />
        {/* Nine Functional Improvements task, Improvement 9. */}
        <Stack.Screen name="tasks/morning-alarm-settings" options={{ title: "שעון מעורר להכנה יומית" }} />
        <Stack.Screen name="coaching/index" options={{ title: "סדנת אימון" }} />
        <Stack.Screen name="coaching/prepare" options={{ title: "הכנה למפגש" }} />
        {/* ARC-system upgrade task, Part B: a global entry point, available
            at any moment -- not nested under any one task's own route. */}
        <Stack.Screen name="arc-spontaneous" options={{ title: "ARC ספונטני" }} />
        {/* ARC-system upgrade task, Part D: the trainee's own library of
            named, editable planned Full/Mini ARCs. */}
        <Stack.Screen name="planned-arcs/index" options={{ title: "ספריית ARC מתוכננים" }} />
        <Stack.Screen name="planned-arcs/[id]" options={{ title: "עריכת ARC מתוכנן" }} />
        {/* ARC alarm task: the full-screen alarm UI for a planned ARC/Mini
            ARC exercise's own "שעון מעורר לתרגול", opened by notifee's own
            fullScreenAction (even over a locked screen) or by tapping the
            alarm notification -- exact mirror of tasks/[id]/alarm below. */}
        <Stack.Screen name="planned-arcs/[id]/alarm" options={{ title: "שעון מעורר", headerShown: false }} />
        <Stack.Screen name="tasks/[id]" options={{ title: "משימה" }} />
        <Stack.Screen name="tasks/[id]/edit" options={{ title: "עריכת משימה" }} />
        <Stack.Screen name="tasks/[id]/duration" options={{ title: "בחירת משך עבודה" }} />
        {/* Task-alarm task: the full-screen ringing UI, opened by notifee's
            own fullScreenAction (even over a locked screen) or by tapping
            the alarm notification. */}
        <Stack.Screen name="tasks/[id]/alarm" options={{ title: "שעון מעורר", headerShown: false }} />
        {/* Simplified-architecture task, Phase 2: the new, self-contained
            ARC LIVE flow -- every choice is made live, at runtime, with no
            separate ARC BUILD behind it. */}
        <Stack.Screen name="tasks/[id]/arc" options={{ title: "ARC LIVE" }} />
        {/* ARC-system upgrade task, Part 2: a task's own OPTIONAL ARC
            window chooser -- never a required gate before the task. */}
        <Stack.Screen name="tasks/[id]/arc-window" options={{ title: "ARC אופציונלי" }} />
        {/* Productivity & Personal Development upgrade task, requirement
            6: a "manifest"-kind task's own guided run -- visualize,
            ARC-adapted sequence, identity action. */}
        <Stack.Screen name="tasks/[id]/manifest" options={{ title: "Manifest" }} />
        {/* ARC Focus task: the mood check-in (reuses the shared
            emotional check-in copy), then the main exercise screen
            itself -- both taskKind-agnostic, reached for a real
            scheduled task OR a standalone quick-start alike. */}
        <Stack.Screen name="tasks/[id]/arc-focus/check-in" options={{ title: "בדיקה רגשית" }} />
        <Stack.Screen name="tasks/[id]/arc-focus" options={{ title: "ARC Focus" }} />
        {/* ARC Learning + ARC Creativity + Integrated Spaced Repetition
            task, section 9: review tasks reached via performStart's own
            "arcLearningReview"/"arcCreativityReview" early branches --
            the SAME shared recall screens ARC Learning/ARC Creativity
            home use directly, just given this real taskId so finishing
            returns to /tasks/[id] instead of the home screen. */}
        <Stack.Screen name="tasks/[id]/arc-learning-review" options={{ title: "שליפה וחזרה" }} />
        <Stack.Screen name="tasks/[id]/arc-creativity-review" options={{ title: "שליפת קשרים" }} />
        <Stack.Screen name="tasks/[id]/prepare" options={{ title: "הכנה לפני המשימה" }} />
        <Stack.Screen name="tasks/[id]/postpone" options={{ title: "דחיית המשימה" }} />
        <Stack.Screen name="tasks/[id]/postpone-obstacle" options={{ title: "מה מונע ממך?" }} />
        {/* Unified Emotional Check-In and Task Postponement System,
            section 3, Option B: the two-smiley Full/Shortened ARC
            choice -- replaces this flow's own previous jump straight
            into live/ArcWindowScreen.tsx's generic chooser. */}
        <Stack.Screen name="tasks/[id]/postpone-emotional" options={{ title: "מצב רגשי" }} />
        <Stack.Screen name="tasks/[id]/postpone-rest" options={{ title: "מנוחה" }} />
        <Stack.Screen name="tasks/[id]/postpone-smaller" options={{ title: "הקטנת המשימה" }} />
        <Stack.Screen name="tasks/[id]/postpone-return" options={{ title: "מוכנים להתחיל?" }} />
        {/* ARCHI -- Adaptive Task Execution & Emotional Persistence task:
            "אני צריך פעולה תומכת" -- reached from the task-not-started
            notification (data/taskNotStartedNotification.ts) and from
            Task LIVE's own continuation loop. */}
        <Stack.Screen name="tasks/[id]/supportive-action" options={{ title: "פעולה תומכת" }} />
        {/* Same task, section 6: shrinking the current/original task into a
            smaller, linked version -- reached from the supportive-action
            flow above and from the continuation loop's own "No" menu. */}
        <Stack.Screen name="tasks/[id]/adapt" options={{ title: "הקטנת המשימה" }} />
        {/* ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
            section 2/3: confirming (or picking a different) later-today
            free window to move an overdue, not-started task into --
            reached by tapping the task-not-started notification's own
            body when it offered a move suggestion. */}
        <Stack.Screen name="tasks/[id]/move-confirm" options={{ title: "העברת המשימה" }} />
        <Stack.Screen name="tasks/[id]/reflect" options={{ title: "רפלקציה קצרה" }} />
        {/* Task Reflection Memory task: review/edit/delete this task's own saved "מה למדתי" history. */}
        <Stack.Screen name="tasks/[id]/reflections" options={{ title: "מה שלמדתי" }} />
        {/* Psychology/Smiling/Positive-Reinforcement task: the shared
            post-completion smiling exercise + positive imagery + smile-
            reward summary, reached after every completed task. */}
        <Stack.Screen name="tasks/[id]/post-task-reward" options={{ title: "כל הכבוד!" }} />
        <Stack.Screen name="tasks/[id]/factor/index" options={{ title: "מה מפריע?" }} />
        <Stack.Screen name="tasks/[id]/factor/emotion" options={{ title: "זיהוי רגש" }} />
        <Stack.Screen name="tasks/[id]/factor/neutral" options={{ title: "תמיכה נייטרלית" }} />
        <Stack.Screen name="tasks/[id]/factor/saved" options={{ title: "פרוטוקולים שמורים" }} />
        <Stack.Screen name="tasks/[id]/factor/new" options={{ title: "גורם חדש" }} />
        <Stack.Screen name="tasks/[id]/factor/presence" options={{ title: "נוכחות וריכוז" }} />
        <Stack.Screen name="tasks/[id]/factor/energy" options={{ title: "אנרגיה נמוכה" }} />
        <Stack.Screen name="tasks/[id]/factor/practical" options={{ title: "בירור המשימה" }} />
        <Stack.Screen name="tasks/[id]/factor/interruption" options={{ title: "הפרעה חיצונית" }} />
      </Stack>
      <StatusBar style="auto" />
      {/* Psychology/Smiling/Positive-Reinforcement task, feature 1: a
          sibling of the Stack, not a screen inside it -- this root
          component only ever mounts once per real app launch, so its
          own mount is exactly "every time the user opens ARCHI", with
          no separate "already shown" flag needed (unlike the
          notification-explanation modal elsewhere, which is a one-time,
          forever flag). Overlays whichever screen the app happens to
          open on, including a deep-linked one. */}
      <DailyStartupSequenceOverlay />
    </SafeAreaProvider>
  );
}
