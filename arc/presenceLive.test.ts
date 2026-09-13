import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyPresenceActionLiveState,
  createPresenceArcInitialSession,
  getFirstMiniPresenceLiveStage,
  getFirstPresenceActionLiveStage,
  getMiniPresenceActionImageryDwellSeconds,
  getMiniPresenceLiveStageCopy,
  getNextMiniPresenceLiveStage,
  getNextPresenceActionLiveStage,
  getPresenceActionLiveDwellSeconds,
  getPresenceActionLiveStageCopy,
  isPresenceComplete,
  MINI_PRESENCE_LIVE_STAGE_ORDER,
  PRESENCE_ACTION_LIVE_STAGE_ORDER,
  PRESENCE_EXIT_STAGE,
  PRESENCE_STAGE_SET,
  presenceArcToProfile,
} from "./presenceLive.ts";
import type { MiniPresenceLiveStage, PresenceActionLiveStage } from "./presenceLive.ts";
import { createEmptyPresenceArc } from "./types.ts";
import type { ArcLiveState, ArcStage, PresenceArc } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";
import { getNextArcStage } from "./arcEngine.ts";
import { resolvePresenceDwellSeconds } from "./dwellTimes.ts";

function presenceArc(overrides: Partial<PresenceArc> = {}): PresenceArc {
  return { ...createEmptyPresenceArc("p1", "נוכחות", "2026-01-01T00:00:00.000Z"), ...overrides };
}

function miniBuild(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "Mini Presence",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "סגול",
    regulationAnchor: "הרגש את כפות הרגליים על הקרקע",
    encodingAction: "יישר בעדינות את הגב",
    beneficialAction: "לחזור למשימה",
    protocolKind: "presence",
    ...overrides,
  };
}

// --- presenceArcToProfile: reuse adapter ---

test("presenceArcToProfile carries presenceColor onto the profile unchanged", () => {
  const { profile } = presenceArcToProfile(presenceArc({ presenceColor: "כחול" }));
  assert.equal(profile.presenceColor, "כחול");
});

test("presenceArcToProfile leaves stateDwellTimes null when no dwell override is configured", () => {
  const { profile } = presenceArcToProfile(presenceArc({ presenceDwellSeconds: null }));
  assert.equal(profile.stateDwellTimes, null);
});

test("presenceArcToProfile's dwell override actually resolves through resolvePresenceDwellSeconds with activeLayers=['state']", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc({ presenceDwellSeconds: 15 }));
  assert.deepEqual(activeLayers, ["state"]);
  assert.equal(resolvePresenceDwellSeconds(profile, activeLayers), 15);
});

test("presenceArcToProfile with no dwell override falls back to DEFAULT_DWELL_TIMES.presenceDwellSeconds (8) via resolvePresenceDwellSeconds", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc({ presenceDwellSeconds: null }));
  assert.equal(resolvePresenceDwellSeconds(profile, activeLayers), 8);
});

test("presenceArcToProfile with a null presenceColor never invents an Energy Color", () => {
  const { profile } = presenceArcToProfile(presenceArc({ presenceColor: null }));
  assert.equal(profile.presenceColor, null);
});

// --- Full ARC Presence: reused engine end-to-end, both routing tiers ---

test("a proactive session started via createPresenceArcInitialSession lands directly on presence_check", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());
  const state = createPresenceArcInitialSession();
  const hop = getNextArcStage("trigger_selection", state, profile, activeLayers);
  assert.equal(hop.stage, "presence_check");
});

test("rating 8 (>=6, the actual configured threshold) routes to the short presence_grounding stage, never the full loop", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());
  const state: ArcLiveState = { ...createPresenceArcInitialSession(), presenceRating: 8 };
  const hop = getNextArcStage("presence_check", state, profile, activeLayers);
  assert.equal(hop.stage, "presence_grounding");
});

test("presence_grounding continues straight to the proactive exit stage (desired_state_check)", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());
  const state: ArcLiveState = { ...createPresenceArcInitialSession(), presenceRating: 8 };
  const hop = getNextArcStage("presence_grounding", state, profile, activeLayers);
  assert.equal(hop.stage, PRESENCE_EXIT_STAGE);
  assert.equal(isPresenceComplete(hop.stage), true);
});

test("rating 3 (<6) routes into the full Presence loop starting at arc_thought_awareness, never presence_grounding", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());
  const state: ArcLiveState = { ...createPresenceArcInitialSession(), presenceRating: 3 };
  const hop = getNextArcStage("presence_check", state, profile, activeLayers);
  assert.equal(hop.stage, "arc_thought_awareness");
});

test("the full Presence loop walks awareness -> combined_attention -> expand_presence -> recheck in order", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());
  const state: ArcLiveState = { ...createPresenceArcInitialSession(), presenceRating: 2 };
  let hop = getNextArcStage("arc_thought_awareness", state, profile, activeLayers);
  assert.equal(hop.stage, "arc_thought_combined_attention");
  hop = getNextArcStage("arc_thought_combined_attention", state, profile, activeLayers);
  assert.equal(hop.stage, "arc_thought_expand_presence");
  hop = getNextArcStage("arc_thought_expand_presence", state, profile, activeLayers);
  assert.equal(hop.stage, "arc_thought_presence_recheck");
});

test("the recheck stage exits to the proactive exit stage once the re-rating clears the threshold", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());
  const state: ArcLiveState = { ...createPresenceArcInitialSession(), presenceRating: 8, loopIterationCount: 0 };
  const hop = getNextArcStage("arc_thought_presence_recheck", state, profile, activeLayers);
  assert.equal(hop.stage, PRESENCE_EXIT_STAGE);
  assert.equal(isPresenceComplete(hop.stage), true);
});

test("the recheck stage loops back to expand_presence, bumping loopIterationCount, while the re-rating stays below threshold", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());
  const state: ArcLiveState = { ...createPresenceArcInitialSession(), presenceRating: 4, loopIterationCount: 0 };
  const hop = getNextArcStage("arc_thought_presence_recheck", state, profile, activeLayers);
  assert.equal(hop.stage, "arc_thought_expand_presence");
  assert.equal(hop.loopIterationCount, 1);
});

test("the full Presence loop is capped by the shared safety cap and force-continues to the exit stage rather than looping forever", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());
  const state: ArcLiveState = { ...createPresenceArcInitialSession(), presenceRating: 1, loopIterationCount: 999 };
  const hop = getNextArcStage("arc_thought_presence_recheck", state, profile, activeLayers);
  assert.equal(hop.stage, PRESENCE_EXIT_STAGE);
});

test("every ArcStage the reused Presence engine can produce for a proactive run, walked end to end for both rating tiers, stays within PRESENCE_STAGE_SET until the exit stage", () => {
  const { profile, activeLayers } = presenceArcToProfile(presenceArc());

  function walk(firstRating: number, laterRatings: number[]): ArcStage[] {
    let state: ArcLiveState = { ...createPresenceArcInitialSession(), presenceRating: firstRating };
    let stage: ArcStage = "trigger_selection";
    const visited: ArcStage[] = [];
    let ratingIndex = 0;
    for (let i = 0; i < 20 && !isPresenceComplete(stage); i++) {
      const hop = getNextArcStage(stage, state, profile, activeLayers);
      stage = hop.stage;
      state = { ...state, loopIterationCount: hop.loopIterationCount };
      if (stage === "arc_thought_presence_recheck" && laterRatings[ratingIndex] !== undefined) {
        state = { ...state, presenceRating: laterRatings[ratingIndex] };
        ratingIndex += 1;
      }
      visited.push(stage);
    }
    return visited;
  }

  const shortRun = walk(9, []);
  for (const stage of shortRun) {
    assert.equal(isPresenceComplete(stage) || PRESENCE_STAGE_SET.includes(stage), true, `unexpected stage: ${stage}`);
  }
  assert.equal(isPresenceComplete(shortRun[shortRun.length - 1]), true);

  const longRun = walk(2, [9]);
  for (const stage of longRun) {
    assert.equal(isPresenceComplete(stage) || PRESENCE_STAGE_SET.includes(stage), true, `unexpected stage: ${stage}`);
  }
  assert.equal(isPresenceComplete(longRun[longRun.length - 1]), true);
});

// --- ARC Mini Presence: linear, no representation/rating branching ---

test("getFirstMiniPresenceLiveStage always starts at notice_present", () => {
  assert.equal(getFirstMiniPresenceLiveStage(), "notice_present");
});

test("the Mini Presence stage order walks the exact fixed sequence from the spec (Phase 8: plus the compact post-action tail), then stays on complete", () => {
  let stage: MiniPresenceLiveStage = getFirstMiniPresenceLiveStage();
  const visited: MiniPresenceLiveStage[] = [stage];
  for (let i = 0; i < 10 && stage !== "complete"; i++) {
    stage = getNextMiniPresenceLiveStage(stage);
    visited.push(stage);
  }
  assert.deepEqual(visited, ["notice_present", "natural_breathing", "attention_anchor", "energy_color_or_cue", "return_to_action", "action_imagery", "gratitude", "complete"]);
  assert.deepEqual(MINI_PRESENCE_LIVE_STAGE_ORDER, visited);
});

test("getNextMiniPresenceLiveStage('complete') stays on complete rather than looping or throwing", () => {
  assert.equal(getNextMiniPresenceLiveStage("complete"), "complete");
});

test("Mini Presence stage copy always returns non-empty title/body for every stage in the order", () => {
  const build = miniBuild();
  for (const stage of MINI_PRESENCE_LIVE_STAGE_ORDER) {
    const copy = getMiniPresenceLiveStageCopy(stage, build);
    assert.equal(typeof copy.title, "string");
    assert.equal(typeof copy.body, "string");
    assert.ok(copy.body.length > 0);
  }
});

test("attention_anchor stage copy reads the Mini's regulationAnchor field verbatim", () => {
  const copy = getMiniPresenceLiveStageCopy("attention_anchor", miniBuild({ regulationAnchor: "עוגן ייחודי" }));
  assert.equal(copy.body, "עוגן ייחודי");
});

test("energy_color_or_cue stage copy prefers the Energy Color line when presenceColor is set", () => {
  const copy = getMiniPresenceLiveStageCopy("energy_color_or_cue", miniBuild({ presenceColor: "כתום" }));
  assert.ok(copy.body.includes("כתום"));
});

test("energy_color_or_cue falls back to the short Presence cue (encodingAction) when presenceColor is blank", () => {
  const copy = getMiniPresenceLiveStageCopy("energy_color_or_cue", miniBuild({ presenceColor: "", encodingAction: "רמז קצר" }));
  assert.equal(copy.body, "רמז קצר");
});

test("return_to_action stage copy reads the Mini's beneficialAction field verbatim", () => {
  const copy = getMiniPresenceLiveStageCopy("return_to_action", miniBuild({ beneficialAction: "לחזור לכתיבה" }));
  assert.equal(copy.body, "לחזור לכתיבה");
});

test("Mini Presence stage copy never throws and never renders 'undefined'/'null' even for a Mini with every optional field blank", () => {
  const blank = miniBuild({ presenceColor: "", regulationAnchor: "", encodingAction: "", beneficialAction: "" });
  for (const stage of MINI_PRESENCE_LIVE_STAGE_ORDER) {
    const copy = getMiniPresenceLiveStageCopy(stage, blank);
    assert.ok(!copy.body.includes("undefined"));
    assert.ok(!copy.body.includes("null"));
  }
});

// ---------------------------------------------------------------------------
// Phase 8: universal post-action completion retrofit -- Full ARC Presence
// gains a genuine NEW "action" stage + shared post-action tail, run by
// arc/presenceLive.ts's own small local sub-engine, once the reused
// Presence session reaches PRESENCE_EXIT_STAGE.
// ---------------------------------------------------------------------------

test("Full ARC Presence's NEW local action tail runs action -> action_imagery -> improvement_entry -> improved_action_imagery -> gratitude -> complete", () => {
  assert.deepEqual(PRESENCE_ACTION_LIVE_STAGE_ORDER, ["action", "action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"]);
});

test("getFirstPresenceActionLiveStage always starts at 'action'", () => {
  assert.equal(getFirstPresenceActionLiveStage(), "action");
});

test("Full ARC Presence's action tail is never gated -- every stage advances even with no free-text answer supplied", () => {
  let stage: PresenceActionLiveStage = getFirstPresenceActionLiveStage();
  let state = createEmptyPresenceActionLiveState();
  const visited: PresenceActionLiveStage[] = [stage];
  for (let i = 0; i < 10 && stage !== "complete"; i++) {
    const hop = getNextPresenceActionLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  assert.deepEqual(visited, PRESENCE_ACTION_LIVE_STAGE_ORDER);
});

test("getNextPresenceActionLiveStage('complete') stays on complete rather than looping or throwing", () => {
  const hop = getNextPresenceActionLiveStage("complete", createEmptyPresenceActionLiveState());
  assert.equal(hop.stage, "complete");
});

test("Full ARC Presence's 'action' stage shows the NEW PresenceArc.beneficialAction field, and renders safely with no configured action", () => {
  const withAction = getPresenceActionLiveStageCopy("action", presenceArc({ beneficialAction: "לצאת להליכה קצרה" }), createEmptyPresenceActionLiveState());
  assert.match(withAction.body, /לצאת להליכה קצרה/);

  const withoutAction = getPresenceActionLiveStageCopy("action", presenceArc({ beneficialAction: null }), createEmptyPresenceActionLiveState());
  assert.ok(withoutAction.body.length > 0);
  assert.ok(!withoutAction.body.includes("undefined"));
  assert.ok(!withoutAction.body.includes("null"));
});

test("Full ARC Presence's gratitude stage uses the PresenceArc's own gratitudePrompt when configured, otherwise the shared default question", () => {
  const withPrompt = getPresenceActionLiveStageCopy("gratitude", presenceArc({ gratitudePrompt: "על מה אתה מודה?" }), createEmptyPresenceActionLiveState());
  assert.equal(withPrompt.body, "על מה אתה מודה?");

  const withoutPrompt = getPresenceActionLiveStageCopy("gratitude", presenceArc({ gratitudePrompt: null }), createEmptyPresenceActionLiveState());
  assert.equal(withoutPrompt.body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("Full ARC Presence's improved_action_imagery reflects the trainee's own improvement text when supplied, and falls back to the shared generic line otherwise", () => {
  const withImprovement = getPresenceActionLiveStageCopy("improved_action_imagery", presenceArc(), {
    postAction: { improvementText: "לנשום עמוק יותר לפני הפעולה", gratitudeText: null },
  });
  assert.match(withImprovement.body, /לנשום עמוק יותר לפני הפעולה/);

  const withoutImprovement = getPresenceActionLiveStageCopy("improved_action_imagery", presenceArc(), createEmptyPresenceActionLiveState());
  assert.equal(withoutImprovement.body, "דמיין את עצמך מבצע שוב את הפעולה, תוך שמירה על מה שעבד היטב.");
});

test("Full ARC Presence's action_imagery/improved_action_imagery dwell honors PresenceArc.postActionImageryDwellSeconds when configured, otherwise falls back to the shared default dwell times", () => {
  const configured = presenceArc({ postActionImageryDwellSeconds: 21 });
  assert.equal(getPresenceActionLiveDwellSeconds("action_imagery", configured), 21);
  assert.equal(getPresenceActionLiveDwellSeconds("improved_action_imagery", configured), 21);

  const unconfigured = presenceArc({ postActionImageryDwellSeconds: null });
  assert.ok((getPresenceActionLiveDwellSeconds("action_imagery", unconfigured) ?? 0) > 0);
  assert.ok((getPresenceActionLiveDwellSeconds("improved_action_imagery", unconfigured) ?? 0) > 0);
  assert.ok((getPresenceActionLiveDwellSeconds("action_imagery", null) ?? 0) > 0);
});

test("Full ARC Presence legacy record (createEmptyPresenceArc, none of Phase 8's fields ever set) renders the entire action tail safely, no crash and no 'undefined'/'null'", () => {
  const legacy = createEmptyPresenceArc("legacy-1", "ישן", "2020-01-01T00:00:00.000Z");
  for (const stage of PRESENCE_ACTION_LIVE_STAGE_ORDER) {
    assert.doesNotThrow(() => getPresenceActionLiveStageCopy(stage, legacy, createEmptyPresenceActionLiveState()));
    const copy = getPresenceActionLiveStageCopy(stage, legacy, createEmptyPresenceActionLiveState());
    const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""}`;
    assert.ok(!text.includes("undefined"));
    assert.ok(!text.includes("null"));
  }
});

test("Mini ARC Presence's compact post-action tail runs action_imagery -> gratitude -> complete right after the existing 'return_to_action' stage, with no improvement/success-focus stage", () => {
  const idx = (s: MiniPresenceLiveStage) => MINI_PRESENCE_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("return_to_action") < idx("action_imagery"));
  assert.deepEqual(MINI_PRESENCE_LIVE_STAGE_ORDER.slice(idx("action_imagery")), ["action_imagery", "gratitude", "complete"]);
  for (const forbidden of ["improvement_entry", "improved_action_imagery", "success_focus"]) {
    assert.ok(!MINI_PRESENCE_LIVE_STAGE_ORDER.includes(forbidden as MiniPresenceLiveStage));
  }
});

test("Mini ARC Presence's gratitude stage uses the MiniArcBuild's own miniGratitudePrompt when configured, otherwise the shared default question", () => {
  const withPrompt = getMiniPresenceLiveStageCopy("gratitude", miniBuild({ miniGratitudePrompt: "תודה על מה?" }));
  assert.equal(withPrompt.body, "תודה על מה?");

  const withoutPrompt = getMiniPresenceLiveStageCopy("gratitude", miniBuild({ miniGratitudePrompt: undefined }));
  assert.equal(withoutPrompt.body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("Mini ARC Presence's action_imagery/gratitude copy never throws and never renders 'undefined'/'null' for a build missing every Phase 8 field", () => {
  const legacyBuild = miniBuild({ miniGratitudePrompt: undefined, miniActionImageryDwellSeconds: undefined });
  for (const stage of ["action_imagery", "gratitude"] as MiniPresenceLiveStage[]) {
    assert.doesNotThrow(() => getMiniPresenceLiveStageCopy(stage, legacyBuild));
    const copy = getMiniPresenceLiveStageCopy(stage, legacyBuild);
    const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""}`;
    assert.ok(!text.includes("undefined"));
    assert.ok(!text.includes("null"));
  }
});

test("Mini ARC Presence's action imagery dwell honors MiniArcBuild.miniActionImageryDwellSeconds when configured, otherwise a safe short default", () => {
  const configured = miniBuild({ miniActionImageryDwellSeconds: 6 });
  assert.equal(getMiniPresenceActionImageryDwellSeconds(configured), 6);
  const unconfigured = miniBuild({ miniActionImageryDwellSeconds: undefined });
  assert.ok(getMiniPresenceActionImageryDwellSeconds(unconfigured) > 0);
});
