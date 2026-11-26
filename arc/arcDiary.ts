/**
 * arc/arcDiary.ts
 *
 * ARC Diary task: a personal journal for free-form writing -- no
 * guiding questions, saved by date/time, editable later, with an
 * optional "extract insight(s)" step at the end of each entry.
 *
 * Pure types + pure functions only, no AsyncStorage, no React -- CRUD
 * lives in data/storage.ts, matching every other arc/*.ts module.
 * Structurally modeled on arc/arcWriting.ts's ArcWritingText (id-keyed,
 * update-in-place, never cascading on delete), with one addition this
 * module needs that ArcWritingText doesn't: `dateLocal`, so entries can
 * be listed by day -- "לשמור רשומות לפי תאריך ושעה."
 *
 * Insights produced from an entry go into the ONE central collection
 * (arc/arcInsightBelief.ts's ArcInsight, via data/storage.ts's
 * appendArcInsight) -- never a second, diary-local insight store;
 * `insightIds` here is just the back-reference, same convention as
 * ArcWritingText.insightIds.
 */

export interface ArcDiaryEntry {
  id: string;
  /** today's local date string (YYYY-MM-DD) at the moment this entry was created -- never changes afterward, even if edited on a later day. */
  dateLocal: string;
  createdAt: string;
  updatedAt: string;
  /** Free-form, no guiding questions, no length limit -- always the trainee's own words. */
  body: string;
  insightIds: string[];
}

export function generateArcDiaryEntryId(): string {
  return `arc-diary-entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcDiaryEntry(id: string, dateLocal: string, now: string): ArcDiaryEntry {
  return { id, dateLocal, createdAt: now, updatedAt: now, body: "", insightIds: [] };
}

export function updateArcDiaryEntryBody(entry: ArcDiaryEntry, body: string, now: string): ArcDiaryEntry {
  if (body === entry.body) return entry;
  return { ...entry, body, updatedAt: now };
}

export function linkInsightToArcDiaryEntry(entry: ArcDiaryEntry, insightId: string, now: string): ArcDiaryEntry {
  if (entry.insightIds.includes(insightId)) return entry;
  return { ...entry, insightIds: [...entry.insightIds, insightId], updatedAt: now };
}

/** Newest first -- the natural reading order for a personal journal ("לצפות ברשומות קודמות"). */
export function resolveArcDiaryEntriesByDateDesc(entries: ArcDiaryEntry[]): ArcDiaryEntry[] {
  return [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function upsertArcDiaryEntryInList(entries: ArcDiaryEntry[], entry: ArcDiaryEntry): ArcDiaryEntry[] {
  const index = entries.findIndex((existing) => existing.id === entry.id);
  if (index === -1) return [...entries, entry];
  const next = [...entries];
  next[index] = entry;
  return next;
}

export function deleteArcDiaryEntryFromList(entries: ArcDiaryEntry[], id: string): ArcDiaryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}
