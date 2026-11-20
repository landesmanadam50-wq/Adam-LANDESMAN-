/**
 * arc/arcLearningTopic.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task:
 * learning topics -- the "לאיזה נושא למידה התובנה קשורה?" grouping every
 * ArcLearningInsight optionally belongs to (section 2, step 2). Pure data
 * model + logic only, no AsyncStorage/navigation/React -- same split as
 * every other arc/*.ts module.
 *
 * Section 10 (ARC Goal integration): a topic may optionally link to one
 * or several ArcGymGoal records -- the exact same `linkedGoalIds: string[]`
 * many-to-many convention already used by ArcGymSituation/
 * ArcGymMemoryExercise/ArcResultExercise/ArcFocusExercise (see
 * arc/arcGymGoal.ts), never a second join-table entity. Removing a
 * topic-goal association only ever edits this array -- it can never
 * delete the topic, its insights, or any recall history.
 */

export interface ArcLearningTopic {
  id: string;
  title: string;
  /** Section 10: ArcGymGoal.id values. A topic can link to multiple goals, and a goal can link to multiple topics -- plain many-to-many, computed in reverse via resolveArcLearningTopicsForGoal, never cached on the goal itself. */
  linkedGoalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function generateArcLearningTopicId(): string {
  return `arc-learning-topic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcLearningTopic(id: string, title: string, now: string): ArcLearningTopic {
  return {
    id,
    title: title.trim(),
    linkedGoalIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateArcLearningTopic(topic: ArcLearningTopic, patch: Partial<Pick<ArcLearningTopic, "title">>, now: string): ArcLearningTopic {
  return {
    ...topic,
    title: patch.title !== undefined ? patch.title.trim() : topic.title,
    updatedAt: now,
  };
}

export function upsertArcLearningTopicInList(topics: ArcLearningTopic[], topic: ArcLearningTopic): ArcLearningTopic[] {
  const index = topics.findIndex((existing) => existing.id === topic.id);
  if (index === -1) return [...topics, topic];
  const next = [...topics];
  next[index] = topic;
  return next;
}

/** Never cascades -- deleting a topic leaves every insight that pointed at it with a now-dangling topicId, exactly as deleting an ArcGymGoal leaves exercises' linkedGoalIds dangling elsewhere in this codebase; callers that care should null out topicId on affected insights first. */
export function deleteArcLearningTopicFromList(topics: ArcLearningTopic[], id: string): ArcLearningTopic[] {
  return topics.filter((topic) => topic.id !== id);
}

/** Idempotent -- same shape as every other link<Type>To<Owner> in this codebase. */
export function linkGoalToArcLearningTopic(topic: ArcLearningTopic, goalId: string, now: string): ArcLearningTopic {
  if (topic.linkedGoalIds.includes(goalId)) return topic;
  return { ...topic, linkedGoalIds: [...topic.linkedGoalIds, goalId], updatedAt: now };
}

export function unlinkGoalFromArcLearningTopic(topic: ArcLearningTopic, goalId: string, now: string): ArcLearningTopic {
  if (!topic.linkedGoalIds.includes(goalId)) return topic;
  return { ...topic, linkedGoalIds: topic.linkedGoalIds.filter((id) => id !== goalId), updatedAt: now };
}

/** Section 10: "users can see associated learning topics from ARC Goal" -- the reverse view, computed fresh every call, never cached/duplicated on the goal. */
export function resolveArcLearningTopicsForGoal(topics: ArcLearningTopic[], goalId: string): ArcLearningTopic[] {
  return topics.filter((topic) => topic.linkedGoalIds.includes(goalId));
}

/** Backfills linkedGoalIds for a topic saved before that field existed -- called once per record by data/storage.ts's own loadArcLearningTopics. */
export function normalizeArcLearningTopic(topic: ArcLearningTopic): ArcLearningTopic {
  return {
    ...topic,
    linkedGoalIds: Array.isArray(topic.linkedGoalIds) ? topic.linkedGoalIds : [],
  };
}
