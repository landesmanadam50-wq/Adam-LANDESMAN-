/**
 * arc/arcBuilds.ts
 *
 * Pure list-manipulation logic behind data/storage.ts's ArcBuild CRUD
 * (upsertArcBuild/deleteArcBuild) -- extracted here, separate from the
 * AsyncStorage I/O, specifically so the guarantees BUILD depends on
 * (creating/editing/deleting one ArcBuild never touches another; two
 * builds sharing the same Desired State text stay fully independent,
 * distinguished only by their own stable id, never by that text) are
 * directly unit-testable with node --test, the same way the rest of
 * arc/ already is -- data/storage.ts itself isn't (it depends on the
 * native AsyncStorage module), so this is where that coverage lives.
 */

import type { ArcBuild } from "./types.ts";

/**
 * Updates the one build matching `build.id` in place if found (leaving
 * every other build's own object completely untouched -- not just
 * unchanged in value, but never even copied/touched), otherwise appends
 * it as a new build at the end. Never reorders or re-indexes the rest
 * of the list, and never matches by anything other than id -- two
 * builds with the same name/Desired State text are never confused with
 * each other, since only `id` is ever compared.
 */
export function upsertArcBuildInList(builds: ArcBuild[], build: ArcBuild): ArcBuild[] {
  const index = builds.findIndex((existing) => existing.id === build.id);
  if (index === -1) return [...builds, build];
  return builds.map((existing, i) => (i === index ? build : existing));
}

/** Removes exactly the one build matching `id` -- every other build is returned as the exact same object it already was (never copied/rebuilt). A no-op (returns an equivalent list) if the id doesn't match any build. */
export function deleteArcBuildFromList(builds: ArcBuild[], id: string): ArcBuild[] {
  return builds.filter((build) => build.id !== id);
}
