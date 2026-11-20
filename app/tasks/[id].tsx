import { useLocalSearchParams } from "expo-router";
import ActiveTaskScreen from "../../live/ActiveTaskScreen.tsx";

export default function TaskDetail() {
  const { id, autoStart, openPostpone, needArc, completeStage, nextTask, addInsight, addPositiveEvent } = useLocalSearchParams<{
    id: string;
    autoStart?: string;
    openPostpone?: string;
    needArc?: string;
    completeStage?: string;
    nextTask?: string;
    addInsight?: string;
    addPositiveEvent?: string;
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
      addPositiveEvent={addPositiveEvent === "1"}
    />
  );
}
