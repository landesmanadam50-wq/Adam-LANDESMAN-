/**
 * arc/manifestMeditationDataSources.ts
 *
 * Productivity roadmap, Stage AA: "connect [Manifest Meditation] to
 * values, identities, habits, personal statements, and today's
 * action." Rather than inventing a new values/identities library (one
 * already exists -- arc/identityProfile.ts's IdentityProfile, which
 * already carries both a `name` (identity) and a `value` field), these
 * are plain, deterministic extraction functions over the trainee's
 * own ALREADY-SAVED records. They only ever SUGGEST lines to add to
 * the setup screen's own text fields -- never silently overwrite or
 * auto-fill anything the trainee already typed (live/ManifestMeditationScreen.tsx
 * only ever appends what these functions return, on an explicit tap).
 */

import type { IdentityProfile } from "./identityProfile.ts";
import type { Task } from "./tasks.ts";

/** Deduplicated, non-blank values, in original order. */
function dedupedNonBlank(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Only "enabled" IdentityProfiles -- matches this codebase's own library convention of never surfacing a disabled/archived record as if it were still active. */
function enabledOnly(profiles: IdentityProfile[]): IdentityProfile[] {
  return profiles.filter((profile) => profile.status === "enabled");
}

export function suggestValuesFromIdentityProfiles(profiles: IdentityProfile[]): string[] {
  return dedupedNonBlank(enabledOnly(profiles).map((profile) => profile.value));
}

export function suggestIdentitiesFromIdentityProfiles(profiles: IdentityProfile[]): string[] {
  return dedupedNonBlank(enabledOnly(profiles).map((profile) => profile.name));
}

/** Both identityMantra and futureMantra are short, personal, first-person-style sentences the trainee already wrote -- exactly what "personal sentences" means here. */
export function suggestPersonalSentencesFromIdentityProfiles(profiles: IdentityProfile[]): string[] {
  return dedupedNonBlank(enabledOnly(profiles).flatMap((profile) => [profile.identityMantra, profile.futureMantra]));
}

/** A RECURRING task is, by construction, a habit (it recurs on chosen weekdays) -- its own title, never its one-off siblings. */
export function suggestHabitsFromRecurringTasks(tasks: Task[]): string[] {
  return dedupedNonBlank(tasks.filter((task) => task.recurrence.kind === "recurring" && task.status !== "archived").map((task) => task.title));
}
