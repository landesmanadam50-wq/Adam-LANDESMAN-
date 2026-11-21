import { useLocalSearchParams } from "expo-router";
import NewArcLiveScreen from "../../../live/NewArcLiveScreen.tsx";
import type { ArcInvocationMode } from "../../../arc/newArcLiveTypes.ts";

/**
 * ARC-system upgrade task, Part B/G/H: this route's own `mini`/
 * `spontaneous` params resolve to exactly one of the three invocation
 * modes -- never both at once (a spontaneous session is always Full
 * ARC's own shorter sequence per spec Part B.2, never Mini ARC; Mini
 * ARC is always planned). `mini` wins if somehow both were passed,
 * since it is the more specific request.
 *
 * Unified Emotional Check-In and Task Postponement System: `shortened`
 * is a fourth, independent param -- the Home screen/Android widget's
 * own "🙂 סבבה" choice and the Postponement screen's matching smiley
 * both set it (data/emotionalCheckInRouting.ts), never `spontaneous`.
 * `mini` still wins over it if somehow both were passed, for the same
 * reason it wins over `spontaneous`.
 */
function resolveStartMode(mini?: string, spontaneous?: string, shortened?: string): ArcInvocationMode {
  if (mini === "1") return "plannedMini";
  if (shortened === "1") return "shortened";
  if (spontaneous === "1") return "spontaneous";
  return "plannedFull";
}

export default function TaskArc() {
  const { id, mini, spontaneous, shortened, skipEmotionSelection, plannedArcId, autoStartAfter, arcGymSituationId, arcFocusPracticeId, arcGymMemoryExerciseId, arcPerspectiveId, morningFlowCheckIn } = useLocalSearchParams<{
    id: string;
    mini?: string;
    spontaneous?: string;
    shortened?: string;
    // ARCHI -- Unified Final Specification task, section 1 (combined
    // "מחשבה / דחף" shortcut -- supersedes the earlier, narrower
    // presetUrge param of the same position/role): a fifth,
    // independent param -- orthogonal to mini/spontaneous/shortened,
    // never combined with `mini` (the button is Full-ARC-only, per
    // spec). See NewArcLiveScreen's own skipEmotionSelection prop doc
    // for what it actually does.
    skipEmotionSelection?: string;
    plannedArcId?: string;
    autoStartAfter?: string;
    arcGymSituationId?: string;
    arcFocusPracticeId?: string;
    arcGymMemoryExerciseId?: string;
    arcPerspectiveId?: string;
    morningFlowCheckIn?: string;
  }>();
  return (
    <NewArcLiveScreen
      taskId={id}
      startMode={resolveStartMode(mini, spontaneous, shortened)}
      skipEmotionSelection={skipEmotionSelection === "1"}
      plannedArcId={plannedArcId ?? null}
      autoStartAfter={autoStartAfter === "1"}
      arcGymSituationId={arcGymSituationId ?? null}
      arcFocusPracticeId={arcFocusPracticeId ?? null}
      arcGymMemoryExerciseId={arcGymMemoryExerciseId ?? null}
      arcPerspectiveId={arcPerspectiveId ?? null}
      morningFlowCheckIn={morningFlowCheckIn === "1"}
    />
  );
}
