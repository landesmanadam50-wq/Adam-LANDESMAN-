import { useLocalSearchParams } from "expo-router";

import TasksListScreen from "../../build/TasksListScreen.tsx";

export default function Tasks() {
  const { noMoreTasks } = useLocalSearchParams<{ noMoreTasks?: string }>();
  return <TasksListScreen noMoreTasksToday={noMoreTasks === "1"} />;
}
