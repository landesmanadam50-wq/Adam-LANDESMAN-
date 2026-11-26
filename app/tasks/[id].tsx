import { useLocalSearchParams } from "expo-router";
import ActiveTaskScreen from "../../live/ActiveTaskScreen.tsx";

export default function TaskDetail() {
  const { id, autoStart, openPostpone, needArc, completeStage, nextTask, addInsight, addQuestion, addPositiveEvent, splitMinutes } = useLocalSearchParams<{
    id: string;
    autoStart?: string;
    openPostpone?: string;
    needArc?: string;
    completeStage?: string;
    nextTask?: string;
    addInsight?: string;
    addQuestion?: string;
    addPositiveEvent?: string;
    // Smart To-Do List task, section 6: set ONLY when ARC LIVE's
    // returnToTask (or the Time Planning popup) navigates here after
    // the trainee explicitly accepted a To-Do split suggestion -- the
    // chosen split's own minute count, never the task's full remaining
    // duration. Absent for every ordinary task/scheduled-task open.
    splitMinutes?: string;
  }>();
  return (
    <ActiveTaskScreen
      taskId={id}
      autoStart={autoStart === "1"}
      openPostpone={openPostpone === "1"}
      needArc={needArc === "1"}
      completeStage={completeStage === "1"}
      nextTask={nextTask === "1"}
      addInsight={addInsight === "1"}
      addQuestion={addQuestion === "1"}
      addPositiveEvent={addPositiveEvent === "1"}
      splitMinutes={splitMinutes ? Number(splitMinutes) : null}
    />
  );
}
