import { useLocalSearchParams } from "expo-router";
import ReactiveFactorChooserScreen from "../../../../live/ReactiveFactorChooserScreen.tsx";

export default function TaskFactorChooser() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReactiveFactorChooserScreen taskId={id} />;
}
