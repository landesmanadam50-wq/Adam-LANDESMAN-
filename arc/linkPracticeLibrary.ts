/**
 * arc/linkPracticeLibrary.ts
 *
 * General Link Practice area task (spec section 8): pure list-building
 * logic for "תרגול קישורים" -- a library view over every SAVED ArcLink
 * (both "ARC Link" and "ARC Mini Link" categories, distinguished by
 * protocolType), never a second, parallel storage of Link data.
 * Callers load ArcLink[]/ArcBuild[]/MiniArcBuild[]/RoutineTrigger[]/
 * WeeklyAction[] the normal way (data/storage.ts) and pass them in here
 * -- this module only resolves DISPLAY fields from what's already
 * saved, exactly like arc/fourWeekProgram.ts's own "load then apply a
 * pure function" shape. Never mutates, never copies a Link record --
 * "Do not copy or duplicate saved Link records merely to display them
 * in this library."
 */

import type { ArcLinkMode, ArcLinkPracticeMode, ArcLink, RoutineTrigger, WeeklyAction } from "./routineLinks.ts";
import { describeTrigger, resolveArcLinkPracticeModeDefault, resolveArcLinkTargetType } from "./routineLinks.ts";
import type { ArcLinkTargetType } from "./routineLinks.ts";
import type { ArcBuild } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";
import { resolveMiniArcProtocolKind } from "./miniArc.ts";

export type LinkLibraryCategory = "arc_link" | "mini_arc_link";

export interface LinkLibraryEntry {
  link: ArcLink;
  category: LinkLibraryCategory;
  /** The referenced ArcBuild's/MiniArcBuild's own name -- "" (never "undefined") when the reference is broken/not found, so a stale Link never crashes this list. */
  protocolName: string;
  trigger: string;
  mode: ArcLinkMode;
  targetType: ArcLinkTargetType | "legacy_generic";
  practiceMode: ArcLinkPracticeMode;
  /** The ArcGoal id this Link's own weekly action is connected to, when any -- resolved from WeeklyAction.linkedProtocolType === "arc_goal" (see arc/routineLinks.ts's own doc on why this is the existing, single generic reference, never a duplicated field). null for a Personal Development Link with no goal connection. */
  linkedArcGoalId: string | null;
  /** ARC Mini for every protocol task: the linked MiniArcBuild's own protocol kind ("state"/"urge"/"thought"/"presence"/"belief"/"generic") -- meaningful only for category "mini_arc_link"; null for an "arc_link" entry (which references a full ArcBuild, not a MiniArcBuild). */
  miniArcProtocolKind: "state" | "urge" | "thought" | "presence" | "belief" | "generic" | null;
}

/**
 * Builds one display entry per saved ArcLink -- never filters/drops a
 * Link merely because its reference is stale (a broken protocolId
 * still gets an entry, with protocolName ""), matching "Do not
 * invalidate or hide the Link" for legacy/edge-case records.
 */
export function buildLinkLibraryEntries(
  links: ArcLink[],
  arcBuildsById: Record<string, ArcBuild>,
  miniArcBuildsById: Record<string, MiniArcBuild>,
  triggersById: Record<string, RoutineTrigger>,
  weeklyActionsById: Record<string, WeeklyAction>
): LinkLibraryEntry[] {
  return links.map((link) => {
    const category: LinkLibraryCategory = link.protocolType === "mini_arc" ? "mini_arc_link" : "arc_link";
    const protocolName =
      category === "mini_arc_link" ? (miniArcBuildsById[link.protocolId]?.name ?? "") : (arcBuildsById[link.protocolId]?.name ?? "");
    const trigger = describeTrigger(triggersById[link.triggerId]);
    const weeklyAction = weeklyActionsById[link.weeklyActionId];
    const linkedArcGoalId = weeklyAction?.linkedProtocolType === "arc_goal" ? (weeklyAction.linkedProtocolId ?? null) : null;
    const miniArcProtocolKind = category === "mini_arc_link" && miniArcBuildsById[link.protocolId] ? resolveMiniArcProtocolKind(miniArcBuildsById[link.protocolId]) : null;
    return {
      link,
      category,
      protocolName,
      trigger: trigger === "לא הוגדר טריגר" ? "" : trigger,
      mode: link.mode,
      targetType: resolveArcLinkTargetType(link),
      practiceMode: resolveArcLinkPracticeModeDefault(link),
      linkedArcGoalId,
      miniArcProtocolKind,
    };
  });
}

/** Splits a full library into its two general Link Practice sections -- "ARC Link" and "ARC Mini Link" (spec section 8). Never a third category: category is always exactly one of these two, by construction (buildLinkLibraryEntries above). */
export function filterLinkLibraryEntries(entries: LinkLibraryEntry[], category: LinkLibraryCategory): LinkLibraryEntry[] {
  return entries.filter((entry) => entry.category === category);
}

/**
 * Personal Development vs. Goal Achievement task (spec section 12):
 * whether an entry belongs to a Goal Achievement Link (clearly labeled
 * with its goal, per spec section 8) or a Personal Development one
 * (linkedArcGoalId null).
 */
export function isGoalAchievementEntry(entry: LinkLibraryEntry): boolean {
  return entry.linkedArcGoalId !== null;
}
