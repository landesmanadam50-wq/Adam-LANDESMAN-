import test from "node:test";
import assert from "node:assert/strict";

import {
  BELIEF_LIVE_STAGE_ORDER,
  BELIEF_IMPROVED_IMAGERY_FALLBACK,
  createEmptyBeliefLiveState,
  getBeliefLiveStageCopy,
  getFirstBeliefLiveStage,
  getFirstEmbeddedBeliefLiveStage,
  getMiniBeliefActionImageryDwellSeconds,
  getMiniBeliefLiveStageCopy,
  getNextBeliefLiveStage,
  getNextMiniBeliefLiveStage,
  getFirstMiniBeliefLiveStage,
  MINI_BELIEF_LIVE_STAGE_ORDER,
  MINI_BELIEF_DEFAULT_ACTION_IMAGERY_SECONDS,
  resolveBeliefEncodingContent,
  resolveEffectiveBeliefArc,
  resolveMiniBeliefBridgeMantra,
  resolveMiniBeliefLimitingBelief,
  resolveMiniBeliefReplacementBelief,
} from "./beliefLive.ts";
import type { BeliefLiveStage, MiniBeliefLiveStage } from "./beliefLive.ts";
import { createEmptyArcBuildProfile, createEmptyBeliefArc } from "./types.ts";
import type { ArcBuildProfile, BeliefArc } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

function beliefArc(overrides: Partial<BeliefArc> = {}): BeliefArc {
  return { ...createEmptyBeliefArc("b1", "אמונה", "2026-01-01T00:00:00.000Z"), ...overrides };
}

function miniBuild(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "Mini Belief",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "סגול",
    regulationAnchor: "נשימה טבעית",
    encodingAction: "עוגן קידוד",
    beneficialAction: "פעולה קצרה",
    protocolKind: "belief",
    ...overrides,
  };
}

function walkFull(): { visited: BeliefLiveStage[] } {
  let stage = getFirstBeliefLiveStage();
  let state = createEmptyBeliefLiveState();
  const visited: BeliefLiveStage[] = [stage];
  for (let i = 0; i < 30 && stage !== "complete"; i++) {
    const hop = getNextBeliefLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  return { visited };
}

// --- Full ARC Belief: exact stage order (test #4) ---

test("Full ARC Belief walks the exact fixed stage order from the spec, then stays on complete", () => {
  const { visited } = walkFull();
  assert.deepEqual(visited, BELIEF_LIVE_STAGE_ORDER);
});

test("getFirstBeliefLiveStage always starts at recognition", () => {
  assert.equal(getFirstBeliefLiveStage(), "recognition");
});

test("getNextBeliefLiveStage('complete', ...) stays on complete rather than looping or throwing", () => {
  const hop = getNextBeliefLiveStage("complete", createEmptyBeliefLiveState());
  assert.equal(hop.stage, "complete");
});

// --- Ordering requirements (tests #5, #7, #8) ---

test("natural breathing/Stay comes before Acceptance", () => {
  const idx = (s: BeliefLiveStage) => BELIEF_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("stay") < idx("acceptance"));
});

test("Regulation comes before the Bridge Mantra", () => {
  const idx = (s: BeliefLiveStage) => BELIEF_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("regulate") < idx("bridge_mantra"));
});

test("the Bridge Mantra comes before the replacement belief", () => {
  const idx = (s: BeliefLiveStage) => BELIEF_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("bridge_mantra") < idx("replacement_belief"));
});

// --- Acceptance clarification (test #6) ---

test("Acceptance copy clarifies the belief is not necessarily true", () => {
  const copy = getBeliefLiveStageCopy("acceptance", beliefArc(), createEmptyBeliefLiveState());
  assert.ok(copy.hint && copy.hint.includes("אינה אומרת שהיא נכונה"));
});

// --- Bridge Mantra fallback (tests #9, #10) ---

test("missing Bridge Mantra: continues without inventing one", () => {
  const copy = getBeliefLiveStageCopy("bridge_mantra", beliefArc({ bridgeMantra: null }), createEmptyBeliefLiveState());
  assert.ok(!copy.body.includes("undefined"));
  assert.equal(copy.body, "אפשר להמשיך גם בלי מנטרת גשר שמורה.");
});

test("existing bridgeMantra (BeliefArc's own field) is used verbatim in the Bridge Mantra stage copy", () => {
  const copy = getBeliefLiveStageCopy("bridge_mantra", beliefArc({ bridgeMantra: "אני לא חייב לפעול לפי האמונה הזאת" }), createEmptyBeliefLiveState());
  assert.ok(copy.body.includes("אני לא חייב לפעול לפי האמונה הזאת"));
});

// --- Replacement belief compatibility/fallback (tests #11, #12) ---

test("existing replacementBelief is surfaced in the replacement_belief stage copy", () => {
  const copy = getBeliefLiveStageCopy("replacement_belief", beliefArc({ replacementBelief: "אני מתפתח כל יום" }), createEmptyBeliefLiveState());
  assert.equal(copy.secondaryBody, "אני מתפתח כל יום");
});

test("missing replacementBelief allows a LIVE-entered one via resolveBeliefEncodingContent, and falls back to anchor-only when nothing is entered", () => {
  const empty = beliefArc({ replacementBelief: null });
  const noEntry = resolveBeliefEncodingContent(empty, createEmptyBeliefLiveState());
  assert.equal(noEntry.source, "anchor_fallback");
  assert.equal(noEntry.text, "");

  const withLiveEntry = resolveBeliefEncodingContent(empty, { ...createEmptyBeliefLiveState(), liveReplacementBeliefText: "אמונה שכתבתי עכשיו" });
  assert.equal(withLiveEntry.source, "live_replacement_belief");
  assert.equal(withLiveEntry.text, "אמונה שכתבתי עכשיו");
});

test("resolveBeliefEncodingContent prefers the saved replacement belief over a LIVE-entered one", () => {
  const arc = beliefArc({ replacementBelief: "saved" });
  const content = resolveBeliefEncodingContent(arc, { ...createEmptyBeliefLiveState(), liveReplacementBeliefText: "live" });
  assert.equal(content.source, "saved_replacement_belief");
  assert.equal(content.text, "saved");
});

// --- Encoding with gentle nod (test #13) ---

test("belief Encoding includes the gentle nod cue, falling back to a generic nod line when unset", () => {
  const withNod = getBeliefLiveStageCopy("encoding", beliefArc({ replacementBelief: "x", gentleNodCue: "הנהון שלי" }), createEmptyBeliefLiveState());
  assert.ok(withNod.secondaryBody && withNod.secondaryBody.includes("הנהון שלי"));

  const withoutNod = getBeliefLiveStageCopy("encoding", beliefArc({ replacementBelief: "x", gentleNodCue: null }), createEmptyBeliefLiveState());
  assert.ok(withoutNod.secondaryBody && withoutNod.secondaryBody.includes("הנהן בעדינות"));
});

// --- Future insight / future action / future imagery (tests #14, #15, #16) ---

test("future insight stage asks the required question", () => {
  const copy = getBeliefLiveStageCopy("future_insight", beliefArc(), createEmptyBeliefLiveState());
  assert.equal(copy.body, "מה תרצה לזכור בפעם הבאה שהאמונה הישנה תופיע?");
});

test("future way of acting stage asks the required question", () => {
  const copy = getBeliefLiveStageCopy("future_action", beliefArc(), createEmptyBeliefLiveState());
  assert.equal(copy.body, "כיצד תרצה לפעול בפעם הבאה מתוך האמונה התומכת?");
});

test("future imagery never requires intensifying the old belief and never demands a perfect result -- it's one guided paragraph, not a rating", () => {
  const copy = getBeliefLiveStageCopy("future_imagery", beliefArc({ shortAction: "אני עוצר ונושם" }), createEmptyBeliefLiveState());
  assert.ok(copy.body.includes("אני עוצר ונושם"));
  assert.ok(copy.body.includes("תוצאה אפשרית וריאלית"));
});

// --- Real action + post-action imagery + Gratitude (tests #17, #18, #19, #20) ---

test("the belief-consistent action stage surfaces the configured shortAction", () => {
  const copy = getBeliefLiveStageCopy("action", beliefArc({ shortAction: "אני מדבר בפגישה" }), createEmptyBeliefLiveState());
  assert.equal(copy.body, "אני מדבר בפגישה");
});

test("post-action imagery follows the real action and describes it as actually performed", () => {
  const copy = getBeliefLiveStageCopy("action_imagery", beliefArc(), createEmptyBeliefLiveState());
  assert.ok(copy.body.includes("כפי שבאמת קרתה"));
});

test("Gratitude runs after the real action, using the configured prompt or the default question", () => {
  const withPrompt = getBeliefLiveStageCopy("gratitude", beliefArc({ gratitudePrompt: "על מה אתה גאה בעצמך?" }), createEmptyBeliefLiveState());
  assert.equal(withPrompt.body, "על מה אתה גאה בעצמך?");
  const withoutPrompt = getBeliefLiveStageCopy("gratitude", beliefArc({ gratitudePrompt: null }), createEmptyBeliefLiveState());
  assert.equal(withoutPrompt.body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("missing/empty written improvement falls back to the exact spec-required fallback line, never inventing an improvement", () => {
  const copy = getBeliefLiveStageCopy("improved_action_imagery", beliefArc(), { ...createEmptyBeliefLiveState(), improvementText: null });
  assert.equal(copy.body, BELIEF_IMPROVED_IMAGERY_FALLBACK);
  const blank = getBeliefLiveStageCopy("improved_action_imagery", beliefArc(), { ...createEmptyBeliefLiveState(), improvementText: "   " });
  assert.equal(blank.body, BELIEF_IMPROVED_IMAGERY_FALLBACK);
});

test("a written improvement is reflected in the improved-action imagery copy", () => {
  const copy = getBeliefLiveStageCopy("improved_action_imagery", beliefArc(), { ...createEmptyBeliefLiveState(), improvementText: "לדבר קצת יותר לאט" });
  assert.ok(copy.body.includes("לדבר קצת יותר לאט"));
});

// --- Embedded Encoding-only mode (test #32, spec section 23) ---

test("embedded mode with no Bridge Mantra shown yet starts at bridge_mantra", () => {
  assert.equal(getFirstEmbeddedBeliefLiveStage(false), "bridge_mantra");
});

test("embedded mode with the Bridge Mantra already shown by the parent skips straight to replacement_belief", () => {
  assert.equal(getFirstEmbeddedBeliefLiveStage(true), "replacement_belief");
});

test("standalone Full ARC Belief still starts at the full preparation (recognition), never the embedded entry point", () => {
  assert.equal(getFirstBeliefLiveStage(), "recognition");
  assert.notEqual(getFirstBeliefLiveStage(), getFirstEmbeddedBeliefLiveStage(false));
});

// --- resolveEffectiveBeliefArc (BUILD/LIVE fallback wiring) ---

test("resolveEffectiveBeliefArc applies the documented fallback chain without mutating the original BeliefArc", () => {
  const arc = beliefArc({ limitingBelief: null, replacementBelief: null, bridgeMantra: null });
  const mini = miniBuild({ replacementBelief: "mini replacement", bridgeMantraText: "mini bridge" });
  const profile: ArcBuildProfile = { ...createEmptyArcBuildProfile(), identityLimitingBelief: "identity belief" };
  const effective = resolveEffectiveBeliefArc(arc, mini, profile);
  assert.equal(effective?.limitingBelief, "identity belief");
  assert.equal(effective?.replacementBelief, "mini replacement");
  assert.equal(effective?.bridgeMantra, "mini bridge");
  assert.equal(arc.limitingBelief, null, "original BeliefArc must be untouched");
});

test("resolveEffectiveBeliefArc returns null for a null BeliefArc", () => {
  assert.equal(resolveEffectiveBeliefArc(null, null, null), null);
});

// --- ARC Mini Belief: exact short order (tests #21-28) ---

function walkMini(): { visited: MiniBeliefLiveStage[] } {
  let stage = getFirstMiniBeliefLiveStage();
  const visited: MiniBeliefLiveStage[] = [stage];
  for (let i = 0; i < 15 && stage !== "complete"; i++) {
    stage = getNextMiniBeliefLiveStage(stage).stage;
    visited.push(stage);
  }
  return { visited };
}

test("ARC Mini Belief walks the exact fixed short order from the spec, then stays on complete", () => {
  const { visited } = walkMini();
  assert.deepEqual(visited, MINI_BELIEF_LIVE_STAGE_ORDER);
});

test("ARC Mini Belief excludes Presence rating, a separate Stay stage, a separate Acceptance stage and long Awareness -- none of those stage ids exist anywhere in its order", () => {
  const forbidden = ["presence_check", "presence_rating", "stay", "acceptance", "awareness"];
  for (const stage of MINI_BELIEF_LIVE_STAGE_ORDER) {
    assert.ok(!forbidden.includes(stage), `Mini Belief must not include a "${stage}" stage`);
  }
});

test("ARC Mini Belief uses exactly one Regulation anchor stage and one Encoding stage", () => {
  assert.equal(MINI_BELIEF_LIVE_STAGE_ORDER.filter((s) => s === "regulate").length, 1);
  assert.equal(MINI_BELIEF_LIVE_STAGE_ORDER.filter((s) => s === "encoding").length, 1);
});

test("ARC Mini Belief includes short completed-action imagery and short Gratitude, both after the real action", () => {
  const idx = (s: MiniBeliefLiveStage) => MINI_BELIEF_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("action") < idx("action_imagery"));
  assert.ok(idx("action_imagery") < idx("gratitude"));
});

test("getNextMiniBeliefLiveStage('complete') stays on complete rather than looping or throwing", () => {
  assert.equal(getNextMiniBeliefLiveStage("complete").stage, "complete");
});

// --- Mini Belief content resolution (test #29-ish / spec section 19) ---

test("resolveMiniBeliefLimitingBelief prefers a session override, then the parent BeliefArc, then null -- never invents", () => {
  const parent = beliefArc({ limitingBelief: "אמונת ההורה" });
  assert.equal(resolveMiniBeliefLimitingBelief(parent, "אמונה של הסשן"), "אמונה של הסשן");
  assert.equal(resolveMiniBeliefLimitingBelief(parent, null), "אמונת ההורה");
  assert.equal(resolveMiniBeliefLimitingBelief(null, null), null);
});

test("resolveMiniBeliefBridgeMantra prefers the Mini's own bridgeMantraText, then the parent's bridgeMantra, then null", () => {
  const parent = beliefArc({ bridgeMantra: "מנטרת ההורה" });
  assert.equal(resolveMiniBeliefBridgeMantra(miniBuild({ bridgeMantraText: "מנטרת המיני" }), parent), "מנטרת המיני");
  assert.equal(resolveMiniBeliefBridgeMantra(miniBuild({ bridgeMantraText: null }), parent), "מנטרת ההורה");
  assert.equal(resolveMiniBeliefBridgeMantra(miniBuild({ bridgeMantraText: null }), null), null);
});

test("resolveMiniBeliefReplacementBelief prefers the Mini's own replacementBelief, then the parent's, then null", () => {
  const parent = beliefArc({ replacementBelief: "אמונת ההורה" });
  assert.equal(resolveMiniBeliefReplacementBelief(miniBuild({ replacementBelief: "אמונת המיני" }), parent), "אמונת המיני");
  assert.equal(resolveMiniBeliefReplacementBelief(miniBuild({ replacementBelief: null }), parent), "אמונת ההורה");
  assert.equal(resolveMiniBeliefReplacementBelief(miniBuild({ replacementBelief: null }), null), null);
});

test("Mini Belief stage copy never throws and never renders 'undefined'/'null' even for a Mini with every optional field blank and no parent", () => {
  const blank = miniBuild({ presenceColor: "", regulationAnchor: "", encodingAction: "", beneficialAction: "", replacementBelief: null, bridgeMantraText: null });
  for (const stage of MINI_BELIEF_LIVE_STAGE_ORDER) {
    const copy = getMiniBeliefLiveStageCopy(stage, blank, null, null);
    assert.ok(!copy.body.includes("undefined"));
    assert.ok(!copy.body.includes("null"));
  }
});

// --- Mini Belief dwell (test #26/#21) ---

test("getMiniBeliefActionImageryDwellSeconds uses the Mini's own configured value, falling back to the short fixed default", () => {
  assert.equal(getMiniBeliefActionImageryDwellSeconds(miniBuild({ miniActionImageryDwellSeconds: 9 })), 9);
  assert.equal(getMiniBeliefActionImageryDwellSeconds(miniBuild({ miniActionImageryDwellSeconds: null })), MINI_BELIEF_DEFAULT_ACTION_IMAGERY_SECONDS);
});

// --- Hebrew RTL sanity (test #33/#42): every stage produces real Hebrew text ---

test("every Full and Mini Belief stage copy is real, non-empty Hebrew text", () => {
  const hebrewPattern = /[֐-׿]/;
  for (const stage of BELIEF_LIVE_STAGE_ORDER) {
    const copy = getBeliefLiveStageCopy(stage, beliefArc({ replacementBelief: "x" }), createEmptyBeliefLiveState());
    assert.ok(hebrewPattern.test(copy.title), `stage "${stage}" title should contain Hebrew`);
  }
  for (const stage of MINI_BELIEF_LIVE_STAGE_ORDER) {
    const copy = getMiniBeliefLiveStageCopy(stage, miniBuild(), beliefArc(), null);
    assert.ok(hebrewPattern.test(copy.title), `mini stage "${stage}" title should contain Hebrew`);
  }
});
