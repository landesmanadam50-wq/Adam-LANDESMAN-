/**
 * arc/arcAddictionMemory.ts
 *
 * ARC Addiction ↔ Positive Memory: success moments saved from a profile
 * ("בחרתי שלא לפעול לפי הדחף") go into the SAME Positive Memory store as
 * every other success (eventType "success"), tagged with the optional
 * `source: { kind: "arc_addiction", refId: profileId }`. The efficacy
 * ARC then offers one of them on its "success_memory" step.
 *
 * Selection: only memories that really came from ARC Addiction are
 * eligible (an unrelated success is never presented as evidence about
 * this urge); this profile's own moments first, other ARC Addiction
 * moments as fallback; rotation avoids repeating the last pick, using
 * the shared selection history with the "arc_addiction" context.
 */

import type { PositiveMemory } from "./positiveMemory.ts";
import { createPositiveMemory, generatePositiveMemoryId, resolvePositiveMemorySource, setPositiveMemorySource, updatePositiveMemory } from "./positiveMemory.ts";
import type { PositiveMemorySelectionHistoryEntry } from "./positiveMemorySelectionHistory.ts";
import { resolveLastSelectedMemoryId } from "./positiveMemorySelectionHistory.ts";
import { buildSuccessMemoryTitle } from "./arcAddictionCopy.ts";

export function scoreAddictionSuccessMemory(memory: PositiveMemory, profileId: string): number {
  if (memory.eventType !== "success") return 0;
  const source = resolvePositiveMemorySource(memory);
  if (!source) return 0;
  return source.refId === profileId ? 1000 : 100;
}

export function selectAddictionSuccessMemory(
  memories: readonly PositiveMemory[],
  profileId: string,
  history: readonly PositiveMemorySelectionHistoryEntry[],
  excludeIds: readonly string[] = [],
  random: () => number = Math.random
): PositiveMemory | null {
  const candidates = memories.filter((memory) => !excludeIds.includes(memory.id) && scoreAddictionSuccessMemory(memory, profileId) > 0);
  if (candidates.length === 0) return null;
  const best = Math.max(...candidates.map((memory) => scoreAddictionSuccessMemory(memory, profileId)));
  const top = candidates.filter((memory) => scoreAddictionSuccessMemory(memory, profileId) === best);
  if (top.length === 1) return top[0];
  const lastId = resolveLastSelectedMemoryId([...history], "arc_addiction", profileId);
  const varied = top.filter((memory) => memory.id !== lastId);
  const pool = varied.length > 0 ? varied : top;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}

/** Builds the Positive Memory record for a success moment of this profile. */
export function buildAddictionSuccessMemory(profileId: string, profileName: string, description: string, now: string, id: string = generatePositiveMemoryId()): PositiveMemory {
  const base = createPositiveMemory(id, "success", buildSuccessMemoryTitle(profileName), now);
  const withText = updatePositiveMemory(base, { successDescription: description.trim() || "בחרתי שלא לפעול לפי הדחף.", whatWasSpecial: "" }, now);
  return setPositiveMemorySource(withText, { kind: "arc_addiction", refId: profileId }, now);
}
