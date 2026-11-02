/**
 * arc/thoughtVsBeliefGate.ts
 *
 * Productivity roadmap, Stage T: "never classify free text
 * automatically." When capturing a new, unsaved factor as a thought or
 * a belief, this one deterministic question decides which it actually
 * is -- the trainee's own explicit choice, never inferred from what
 * they typed.
 */

export type ThoughtVsBeliefAnswer = "thisSituationOnly" | "broaderBelief" | "unknown";

export const THOUGHT_VS_BELIEF_ANSWER_OPTIONS: ThoughtVsBeliefAnswer[] = ["thisSituationOnly", "broaderBelief", "unknown"];

export const THOUGHT_VS_BELIEF_ANSWER_LABELS: Record<ThoughtVsBeliefAnswer, string> = {
  thisSituationOnly: "זה מתאר רק את המצב הזה",
  broaderBelief: "זה משהו רחב יותר שאני מאמין עליו",
  unknown: "אני לא יודע",
};

/** "unknown" resolves to "thought" -- the spec's own "use the shorter neutral thought route" for that case, never left unresolved. */
export function resolveFactorKindFromThoughtVsBeliefGate(answer: ThoughtVsBeliefAnswer): "thought" | "belief" {
  return answer === "broaderBelief" ? "belief" : "thought";
}
