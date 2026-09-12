import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyMiniThoughtLiveState,
  createEmptyThoughtLiveState,
  getFirstMiniThoughtLiveStage,
  getFirstThoughtLiveStage,
  getMiniThoughtActionImageryDwellSeconds,
  getMiniThoughtLiveStageCopy,
  getNextMiniThoughtLiveStage,
  getNextThoughtLiveStage,
  getThoughtLiveDwellSeconds,
  getThoughtLiveStageCopy,
  getThoughtModalityOptions,
  getThoughtOpeningDecisionOptions,
  getThoughtTimeOrientationOptions,
  getThoughtUsefulInsightDecisionOptions,
  getTimeOrientedSupportivePromptQuestion,
  MINI_THOUGHT_LIVE_STAGE_ORDER,
  resolveMiniThoughtContent,
  resolveThoughtEncodingContent,
  THOUGHT_ACCEPTANCE_CLARIFICATION,
  THOUGHT_DISTURBING_ROUTE_STAGE_ORDER_WITH_INSIGHT,
  THOUGHT_SUPPORTIVE_ROUTE_STAGE_ORDER,
} from "./thoughtLive.ts";
import type { MiniThoughtLiveStage, ThoughtLiveStage, ThoughtLiveState } from "./thoughtLive.ts";
import { createEmptyThoughtArc } from "./types.ts";
import type { ThoughtArc, ThoughtModality, ThoughtTimeOrientation } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

function thoughtArc(overrides: Partial<ThoughtArc> = {}): ThoughtArc {
  return { ...createEmptyThoughtArc("t1", "מחשבה", "2026-01-01T00:00:00.000Z"), ...overrides };
}

function miniBuild(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "Mini Thought",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "סגול",
    regulationAnchor: "נשימה טבעית",
    encodingAction: "עוגן קידוד",
    beneficialAction: "פעולה קצרה",
    protocolKind: "thought",
    ...overrides,
  };
}

function walkDisturbingRoute(answer: { insightDecision: "yes" | "not_now" }): { visited: ThoughtLiveStage[]; state: ThoughtLiveState } {
  let stage = getFirstThoughtLiveStage();
  let state = createEmptyThoughtLiveState();
  const visited: ThoughtLiveStage[] = [stage];
  for (let i = 0; i < 30 && stage !== "complete"; i++) {
    if (stage === "opening_decision" && state.route === null) state = { ...state, route: "disturbing" };
    if (stage === "modality" && state.modality === null) state = { ...state, modality: "visual" };
    if (stage === "useful_insight_decision" && state.usefulInsightDecision === null) {
      state = { ...state, usefulInsightDecision: answer.insightDecision };
    }
    const hop = getNextThoughtLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  return { visited, state };
}

// --- Required test 1-2: independent entry + disturbing-thought route ---
test("the disturbing-thought route (useful-insight 'yes') walks the exact fixed order from spec section 5", () => {
  const { visited } = walkDisturbingRoute({ insightDecision: "yes" });
  assert.deepEqual(visited, THOUGHT_DISTURBING_ROUTE_STAGE_ORDER_WITH_INSIGHT);
});

test("the disturbing-thought route with 'not now' routes through supportive_fallback instead of useful_insight_entry, still reaching encoding", () => {
  const { visited } = walkDisturbingRoute({ insightDecision: "not_now" });
  assert.ok(visited.includes("supportive_fallback"));
  assert.ok(!visited.includes("useful_insight_entry"));
  const encodingIdx = visited.indexOf("encoding");
  const fallbackIdx = visited.indexOf("supportive_fallback");
  assert.ok(fallbackIdx < encodingIdx);
});

// --- Required test 3: supportive-thought route ---
test("the supportive-thought route walks the exact fixed order from spec section 19", () => {
  let stage = getFirstThoughtLiveStage();
  let state = createEmptyThoughtLiveState();
  const visited: ThoughtLiveStage[] = [stage];
  for (let i = 0; i < 20 && stage !== "complete"; i++) {
    if (stage === "opening_decision" && state.route === null) state = { ...state, route: "supportive" };
    if (stage === "modality" && state.modality === null) state = { ...state, modality: "auditory" };
    const hop = getNextThoughtLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  assert.deepEqual(visited, THOUGHT_SUPPORTIVE_ROUTE_STAGE_ORDER);
});

test("Required test 28: the supportive-thought route excludes disturbing-only stages (recognition, emotion, time_orientation, breathing_stay, acceptance, flexible_attention, useful_insight_decision)", () => {
  const disturbingOnly = [
    "recognition",
    "emotion",
    "time_orientation",
    "breathing_stay",
    "acceptance",
    "flexible_attention_1",
    "flexible_attention_2",
    "useful_insight_decision",
    "useful_insight_entry",
    "supportive_fallback",
  ];
  for (const stage of disturbingOnly) {
    assert.ok(!THOUGHT_SUPPORTIVE_ROUTE_STAGE_ORDER.includes(stage as ThoughtLiveStage), `supportive route must never include "${stage}"`);
  }
});

// --- Required tests 4-7: modality routes ---
test("Required tests 4-7: getThoughtModalityOptions offers exactly the 4 spec options", () => {
  assert.deepEqual(
    getThoughtModalityOptions().map((o) => o.value),
    ["visual", "auditory", "both", "unsure"]
  );
});

test("modality gates progression -- the 'modality' stage stays put until answered", () => {
  const hop = getNextThoughtLiveStage("modality", { ...createEmptyThoughtLiveState(), route: "disturbing" });
  assert.equal(hop.stage, "modality");
});

test("visual modality Encoding never uses the auditory voice-instruction wording", () => {
  const arc = thoughtArc({ supportiveThought: "אני מסוגל להתמודד.", visualSupportiveImage: "תמונה שקטה", auditorySupportiveVoiceInstruction: "קול רגוע" });
  const copy = getThoughtLiveStageCopy("encoding", arc, { ...createEmptyThoughtLiveState(), modality: "visual" });
  assert.match(copy.secondaryBody ?? "", /תמונה שקטה/);
  assert.ok(!(copy.secondaryBody ?? "").includes("קול רגוע"));
});

test("auditory modality Encoding uses the auditory voice-instruction wording, never the visual image", () => {
  const arc = thoughtArc({ supportiveThought: "אני מסוגל להתמודד.", visualSupportiveImage: "תמונה שקטה", auditorySupportiveVoiceInstruction: "קול רגוע ובהיר" });
  const copy = getThoughtLiveStageCopy("encoding", arc, { ...createEmptyThoughtLiveState(), modality: "auditory" });
  assert.match(copy.secondaryBody ?? "", /קול רגוע ובהיר/);
  assert.ok(!(copy.secondaryBody ?? "").includes("תמונה שקטה"));
});

test("'both' modality Encoding combines image and voice without duplicate screens (one stage, one copy object)", () => {
  const arc = thoughtArc({ supportiveThought: "אני מסוגל.", visualSupportiveImage: "תמונה", auditorySupportiveVoiceInstruction: "קול" });
  const copy = getThoughtLiveStageCopy("encoding", arc, { ...createEmptyThoughtLiveState(), modality: "both" });
  assert.match(copy.secondaryBody ?? "", /תמונה/);
  assert.match(copy.secondaryBody ?? "", /קול/);
});

test("'unsure' modality never forces a classification -- uses the standard configured Encoding anchor", () => {
  const arc = thoughtArc({ supportiveThought: "אני מסוגל.", encodingAnchor: "עוגן קבוע" });
  const copy = getThoughtLiveStageCopy("encoding", arc, { ...createEmptyThoughtLiveState(), modality: "unsure" });
  assert.match(copy.secondaryBody ?? "", /עוגן קבוע/);
});

// --- Required tests 8-11: time-oriented prompts ---
test("Required test 8: past-oriented supportive prompt matches spec exactly", () => {
  assert.equal(getTimeOrientedSupportivePromptQuestion("past"), "איזו פרשנות אחרת, מאוזנת ותומכת יכולה להתאים למה שקרה?");
});
test("Required test 9: present-oriented supportive prompt matches spec exactly", () => {
  assert.equal(getTimeOrientedSupportivePromptQuestion("present"), "איזו מחשבה יכולה לעזור לך לפגוש את המצב הנוכחי בצורה מיטיבה יותר?");
});
test("Required test 10: future-oriented supportive prompt matches spec exactly", () => {
  assert.equal(getTimeOrientedSupportivePromptQuestion("future"), "איזו מחשבה יכולה לעזור לך לגשת למה שעומד לקרות?");
});
test("Required test 11: general prompt fallback (null/unsure) matches spec exactly", () => {
  assert.equal(getTimeOrientedSupportivePromptQuestion(null), "איזו מחשבה מאוזנת ותומכת יכולה לעזור לך לבחור כיצד לפעול?");
});

test("getThoughtTimeOrientationOptions offers exactly past/present/future, no 'unsure' option (unsure is the unanswered/skip path per spec section 7)", () => {
  assert.deepEqual(
    getThoughtTimeOrientationOptions().map((o) => o.value),
    ["past", "present", "future"]
  );
});

test("Required test: the user can continue past time_orientation without answering -- 'allow continuing with a general balanced prompt'", () => {
  const hop = getNextThoughtLiveStage("time_orientation", { ...createEmptyThoughtLiveState(), timeOrientation: null });
  assert.equal(hop.stage, "breathing_stay", "must never gate/block on an unanswered time orientation");
});

// --- Required test 12: natural breathing remains uncontrolled ---
test("Required test 12: breathing_stay's copy uses the exact required uncontrolled-breathing wording, never 'deepen/slow/control'", () => {
  const copy = getThoughtLiveStageCopy("breathing_stay", thoughtArc(), createEmptyThoughtLiveState());
  assert.equal(copy.body, "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.");
  for (const forbidden of [/העמק/, /האט/, /שלוט בנשימה/]) {
    assert.ok(!forbidden.test(copy.body));
  }
});

// --- Required test 13: Stay precedes Acceptance ---
test("Required test 13: breathing_stay always precedes acceptance in the disturbing route", () => {
  const idx = (s: ThoughtLiveStage) => THOUGHT_DISTURBING_ROUTE_STAGE_ORDER_WITH_INSIGHT.indexOf(s);
  assert.ok(idx("breathing_stay") < idx("acceptance"));
});

// --- Required test 14: Acceptance clarifies the thought isn't necessarily true ---
test("Required test 14: acceptance's copy includes the exact clarification that presence does not mean truth or agreement", () => {
  const copy = getThoughtLiveStageCopy("acceptance", thoughtArc(), createEmptyThoughtLiveState());
  assert.equal(copy.body, "הנח יד על הלב ואמור בעדינות: אני מקבל שיש בי כרגע את המחשבה הזאת.");
  assert.equal(copy.hint, THOUGHT_ACCEPTANCE_CLARIFICATION);
  assert.match(copy.hint ?? "", /אינה אומרת שהיא נכונה/);
});

// --- Required tests 15-16: flexible attention stages ---
test("Required test 15: flexible_attention_1 offers breathing, object color, and wider visual field without instructing suppression", () => {
  const copy = getThoughtLiveStageCopy("flexible_attention_1", thoughtArc(), createEmptyThoughtLiveState());
  assert.match(copy.body, /נשימה הטבעית/);
  assert.match(copy.body, /צבע של אובייקט/);
  assert.match(copy.body, /שדה הראייה הרחב/);
  for (const forbidden of [/דכא/, /הסר את המחשבה/, /תחליף בכוח/]) {
    assert.ok(!forbidden.test(copy.body));
  }
});

test("Required test 16: flexible_attention_2 directs attention toward the current anchors, never asks to keep focusing on the disturbing thought", () => {
  const copy = getThoughtLiveStageCopy("flexible_attention_2", thoughtArc(), createEmptyThoughtLiveState());
  assert.match(copy.body, /נשימה טבעית/);
  assert.ok(!/המשך להתמקד במחשבה/.test(copy.body));
});

test("flexible attention stages include the external-sound anchor only when configured AND modality is auditory/both", () => {
  const arcWithSound = thoughtArc({ externalSoundAnchorEnabled: true });
  const auditoryState = { ...createEmptyThoughtLiveState(), modality: "auditory" as ThoughtModality };
  const visualState = { ...createEmptyThoughtLiveState(), modality: "visual" as ThoughtModality };
  assert.match(getThoughtLiveStageCopy("flexible_attention_1", arcWithSound, auditoryState).body, /צליל חיצוני/);
  assert.ok(!/צליל חיצוני/.test(getThoughtLiveStageCopy("flexible_attention_1", arcWithSound, visualState).body));
  const arcWithoutSound = thoughtArc({ externalSoundAnchorEnabled: false });
  assert.ok(!/צליל חיצוני/.test(getThoughtLiveStageCopy("flexible_attention_1", arcWithoutSound, auditoryState).body));
});

// --- Required tests 17-19: useful-insight decision ---
test("Required test 17: getThoughtUsefulInsightDecisionOptions offers exactly 'כן'/'לא כרגע', never asking whether the whole original thought is true", () => {
  const options = getThoughtUsefulInsightDecisionOptions();
  assert.deepEqual(options.map((o) => o.value), ["yes", "not_now"]);
  assert.deepEqual(options.map((o) => o.label), ["כן", "לא כרגע"]);
});

test("Required test 18: 'yes' routes to useful_insight_entry", () => {
  const hop = getNextThoughtLiveStage("useful_insight_decision", { ...createEmptyThoughtLiveState(), usefulInsightDecision: "yes" });
  assert.equal(hop.stage, "useful_insight_entry");
});

test("Required test 19: 'not now' loads the supportive BUILD thought (routes to supportive_fallback, which displays thoughtArc.supportiveThought)", () => {
  const hop = getNextThoughtLiveStage("useful_insight_decision", { ...createEmptyThoughtLiveState(), usefulInsightDecision: "not_now" });
  assert.equal(hop.stage, "supportive_fallback");
  const arc = thoughtArc({ supportiveThought: "מחשבה תומכת שמורה" });
  const copy = getThoughtLiveStageCopy("supportive_fallback", arc, createEmptyThoughtLiveState());
  assert.equal(copy.body, "אפשר להיעזר עכשיו במחשבה התומכת שהכנת מראש:");
  assert.equal(copy.secondaryBody, "מחשבה תומכת שמורה");
});

// --- Required test 20: missing supportive thought allows safe fallback ---
test("Required test 20: supportive_fallback with NO saved supportive thought never crashes, offers writing now or continuing anchor-only, never invents a thought", () => {
  const legacy = createEmptyThoughtArc("legacy", "ישן", "2020-01-01T00:00:00.000Z");
  const copy = getThoughtLiveStageCopy("supportive_fallback", legacy, createEmptyThoughtLiveState());
  assert.equal(copy.secondaryBody, null);
  assert.ok(!copy.body.includes("undefined"));
  assert.match(copy.body, /לכתוב אחת עכשיו|להמשיך עם עוגן/);
});

// --- Required test 21: no forced useful interpretation ---
test("Required test 21: useful_insight_entry never requires an answer to proceed -- writing a useful insight stays optional", () => {
  const hop = getNextThoughtLiveStage("useful_insight_entry", createEmptyThoughtLiveState());
  assert.equal(hop.stage, "encoding", "must never gate on unwritten insight text");
});

// --- Required tests 22-23: Encoding priority order ---
test("Required test 22: resolveThoughtEncodingContent uses the LIVE useful insight FIRST, even when a BUILD supportive thought also exists", () => {
  const arc = thoughtArc({ supportiveThought: "מחשבה תומכת מה-BUILD" });
  const state = { ...createEmptyThoughtLiveState(), usefulInsightText: "התובנה שמצאתי עכשיו" };
  const content = resolveThoughtEncodingContent(arc, state);
  assert.equal(content.source, "useful_insight");
  assert.equal(content.text, "התובנה שמצאתי עכשיו");
});

test("Required test 23: resolveThoughtEncodingContent falls to the BUILD supportive thought SECOND, when no useful insight exists", () => {
  const arc = thoughtArc({ supportiveThought: "מחשבה תומכת מה-BUILD" });
  const content = resolveThoughtEncodingContent(arc, createEmptyThoughtLiveState());
  assert.equal(content.source, "build_supportive_thought");
  assert.equal(content.text, "מחשבה תומכת מה-BUILD");
});

test("resolveThoughtEncodingContent falls to a LIVE-entered balanced supportive thought THIRD", () => {
  const arc = thoughtArc({ supportiveThought: null });
  const state = { ...createEmptyThoughtLiveState(), liveSupportiveThought: "מחשבה שכתבתי עכשיו" };
  const content = resolveThoughtEncodingContent(arc, state);
  assert.equal(content.source, "live_supportive_thought");
});

test("resolveThoughtEncodingContent falls to a safe anchor-only fallback FOURTH -- never invents content", () => {
  const content = resolveThoughtEncodingContent(null, createEmptyThoughtLiveState());
  assert.equal(content.source, "anchor_fallback");
  assert.equal(content.text, "");
});

// --- Required tests 24-25: modality-specific Encoding ---
test("Required test 24: visual Encoding never claims the original image must disappear", () => {
  const arc = thoughtArc({ supportiveThought: "אני מסוגל", visualSupportiveImage: "תמונה מותאמת" });
  const copy = getThoughtLiveStageCopy("encoding", arc, { ...createEmptyThoughtLiveState(), modality: "visual" });
  assert.ok(!/התמונה .*(תיעלם|חייבת להיעלם)/.test(`${copy.body} ${copy.secondaryBody}`));
});

test("Required test 25: auditory Encoding never requires the original internal voice to disappear", () => {
  const arc = thoughtArc({ supportiveThought: "אני מסוגל" });
  const copy = getThoughtLiveStageCopy("encoding", arc, { ...createEmptyThoughtLiveState(), modality: "auditory" });
  assert.ok(!/הקול המקורי חייב להיעלם/.test(copy.secondaryBody ?? ""));
});

test("Encoding never repeats the full Regulation route -- no regulation-specific wording appears in its copy", () => {
  const arc = thoughtArc({ supportiveThought: "אני מסוגל" });
  const copy = getThoughtLiveStageCopy("encoding", arc, { ...createEmptyThoughtLiveState(), modality: "unsure" });
  assert.ok(!/עוגן ויסות מלא|תהליך ויסות/.test(`${copy.body} ${copy.secondaryBody}`));
});

// --- Required test 26: future insight and action ---
test("Required test 26: future_insight_action shows both the future-insight and action prompts", () => {
  const copy = getThoughtLiveStageCopy("future_insight_action", thoughtArc(), createEmptyThoughtLiveState());
  assert.equal(copy.body, "בפעם הבאה אני אזכור ש...");
  assert.equal(copy.secondaryBody, "כאשר זה יקרה, אפעל כך...");
});

// --- Required test 27: future imagery ---
test("Required test 27: future_imagery never requires imagining a perfect/guaranteed result", () => {
  const copy = getThoughtLiveStageCopy("future_imagery", thoughtArc({ shortAction: "לנשום ולהתחיל" }), createEmptyThoughtLiveState());
  assert.match(copy.body, /דמיין מצב דומה בעתיד/);
  assert.ok(!/הצלחה מובטחת|תוצאה מושלמת/.test(copy.body));
});

// --- Required tests 29-32: ARC Mini Thought exact order + exclusions ---
test("Required test 29: ARC Mini Thought walks the exact fixed short order", () => {
  let stage = getFirstMiniThoughtLiveStage();
  let state = createEmptyMiniThoughtLiveState();
  const visited: MiniThoughtLiveStage[] = [stage];
  for (let i = 0; i < 20 && stage !== "complete"; i++) {
    if (stage === "modality" && state.modality === null) state = { ...state, modality: "visual" };
    const hop = getNextMiniThoughtLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  assert.deepEqual(visited, MINI_THOUGHT_LIVE_STAGE_ORDER);
});

test("Required tests 30-32: ARC Mini Thought's stage set excludes Stay, Acceptance, and Presence rating entirely", () => {
  const forbidden = ["breathing_stay", "acceptance", "presence_check", "presence_rating", "flexible_attention_1", "flexible_attention_2"];
  for (const stage of MINI_THOUGHT_LIVE_STAGE_ORDER) {
    assert.ok(!forbidden.includes(stage as string), `Mini Thought must never include "${stage}"`);
  }
});

// --- Required tests 33-35: ARC Mini Thought content selection ---
test("Required test 33: ARC Mini Thought uses the saved useful insight FIRST, reading it from the parent ThoughtArc", () => {
  const parent = thoughtArc({ usefulInsight: "תובנה שנשמרה", supportiveThought: "מחשבה תומכת" });
  const build = miniBuild({ supportiveThought: "מחשבה תומכת של ה-Mini" });
  const content = resolveMiniThoughtContent(build, parent);
  assert.equal(content.source, "useful_insight");
  assert.equal(content.text, "תובנה שנשמרה");
});

test("Required test 34: ARC Mini Thought falls back to the supportive thought saved in BUILD when no useful insight exists", () => {
  const parent = thoughtArc({ usefulInsight: null, supportiveThought: "מחשבה תומכת של ההורה" });
  const build = miniBuild({ supportiveThought: null });
  const content = resolveMiniThoughtContent(build, parent);
  assert.equal(content.source, "supportive_thought");
  assert.equal(content.text, "מחשבה תומכת של ההורה");
});

test("Required test 35: ARC Mini Thought uses a safe anchor-only fallback when neither a useful insight nor a supportive thought exists -- never invents content", () => {
  const build = miniBuild({ supportiveThought: null });
  const content = resolveMiniThoughtContent(build, null);
  assert.equal(content.source, "anchor_fallback");
  assert.equal(content.text, "");
});

test("ARC Mini Thought never requires writing a new useful insight live -- resolveMiniThoughtContent is a pure function of BUILD/parent-saved fields only", () => {
  assert.equal(resolveMiniThoughtContent.length, 2);
});

test("ARC Mini Thought's 'both' modality uses the primary Mini action, with an OPTIONAL quick-switch to the secondary -- never required", () => {
  const build = miniBuild({ encodingAction: "פעולה ראשית", secondaryEncodingAction: "פעולה משנית" });
  const bothCopy = getMiniThoughtLiveStageCopy("encoding", build, null, { modality: "both" });
  assert.equal(bothCopy.body, "פעולה ראשית");
  assert.equal(bothCopy.secondaryBody, "פעולה משנית");
  const visualCopy = getMiniThoughtLiveStageCopy("encoding", build, null, { modality: "visual" });
  assert.equal(visualCopy.secondaryBody, null, "single-modality routes never show the secondary action");
});

// --- Opening decision options ---
test("getThoughtOpeningDecisionOptions offers exactly the two spec options, in order", () => {
  const options = getThoughtOpeningDecisionOptions();
  assert.deepEqual(options.map((o) => o.value), ["disturbing", "supportive"]);
  assert.equal(options[0].label, "להתגבר על מחשבה מפריעה");
  assert.equal(options[1].label, "לחזק מחשבה תומכת");
});

test("opening_decision gates progression until answered", () => {
  const hop = getNextThoughtLiveStage("opening_decision", createEmptyThoughtLiveState());
  assert.equal(hop.stage, "opening_decision");
});

// --- Required test 43: legacy program compatibility ---
test("Required test 43: a legacy ThoughtArc (createEmptyThoughtArc, every field null) renders every stage of both routes safely, no crash, no 'undefined'/'null'", () => {
  const legacy = createEmptyThoughtArc("legacy-1", "ישן", "2020-01-01T00:00:00.000Z");
  for (const modality of ["visual", "auditory", "both", "unsure"] as ThoughtModality[]) {
    for (const stage of THOUGHT_DISTURBING_ROUTE_STAGE_ORDER_WITH_INSIGHT) {
      const state = { ...createEmptyThoughtLiveState(), modality, route: "disturbing" as const };
      assert.doesNotThrow(() => getThoughtLiveStageCopy(stage, legacy, state));
      const copy = getThoughtLiveStageCopy(stage, legacy, state);
      const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""} ${copy.hint ?? ""}`;
      assert.ok(!text.includes("undefined"), `${stage}/${modality}: "${text}"`);
      assert.ok(!text.includes("null"), `${stage}/${modality}: "${text}"`);
    }
  }
});

test("a null ThoughtArc (never saved / reference lost) is handled safely by every copy generator, never crashing", () => {
  for (const stage of THOUGHT_DISTURBING_ROUTE_STAGE_ORDER_WITH_INSIGHT) {
    assert.doesNotThrow(() => getThoughtLiveStageCopy(stage, null, { ...createEmptyThoughtLiveState(), modality: "unsure" }));
  }
});

test("a Mini Thought build with no parentArcBuildId (standalone/legacy) still resolves content and stage copy safely", () => {
  const standalone = miniBuild({ parentArcBuildId: undefined, supportiveThought: null });
  for (const stage of MINI_THOUGHT_LIVE_STAGE_ORDER) {
    assert.doesNotThrow(() => getMiniThoughtLiveStageCopy(stage, standalone, null, { modality: null }));
  }
});

test("no stage transition or copy in this module references a negative-action timer", () => {
  const source = getThoughtLiveStageCopy.toString() + getNextThoughtLiveStage.toString() + getMiniThoughtLiveStageCopy.toString();
  assert.ok(!/negative[_-]?[Aa]ction/.test(source));
});

// ---------------------------------------------------------------------------
// Phase 8: universal post-action completion retrofit
// ---------------------------------------------------------------------------

test("Full ARC Thought gains a genuine 'action' stage right after 'future_imagery', followed by the shared post-action tail, for BOTH routes", () => {
  for (const order of [THOUGHT_DISTURBING_ROUTE_STAGE_ORDER_WITH_INSIGHT, THOUGHT_SUPPORTIVE_ROUTE_STAGE_ORDER]) {
    const idx = (s: ThoughtLiveStage) => order.indexOf(s);
    assert.ok(idx("future_imagery") < idx("action"));
    assert.deepEqual(order.slice(idx("action")), ["action", "action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"]);
  }
});

test("Full ARC Thought's 'action' stage shows the configured shortAction, and always advances to action_imagery next", () => {
  const arc = thoughtArc({ shortAction: "לצאת להליכה קצרה" });
  const copy = getThoughtLiveStageCopy("action", arc, createEmptyThoughtLiveState());
  assert.match(copy.body, /לצאת להליכה קצרה/);
  const hop = getNextThoughtLiveStage("action", createEmptyThoughtLiveState());
  assert.equal(hop.stage, "action_imagery");
});

test("Full ARC Thought's 'action' stage renders safely with no configured shortAction, never 'undefined'/'null'", () => {
  const arc = thoughtArc({ shortAction: null });
  const copy = getThoughtLiveStageCopy("action", arc, createEmptyThoughtLiveState());
  assert.ok(copy.body.length > 0);
  assert.ok(!copy.body.includes("undefined"));
  assert.ok(!copy.body.includes("null"));
});

test("Full ARC Thought's post-action tail is never gated -- every stage advances even with no free-text answer supplied", () => {
  let stage: ThoughtLiveStage = "action_imagery";
  let state = createEmptyThoughtLiveState();
  const visited: ThoughtLiveStage[] = [stage];
  for (let i = 0; i < 10 && stage !== "complete"; i++) {
    const hop = getNextThoughtLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  assert.deepEqual(visited, ["action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"]);
});

test("Full ARC Thought's gratitude stage uses the ThoughtArc's own gratitudePrompt when configured, otherwise the shared default question", () => {
  const withPrompt = thoughtArc({ gratitudePrompt: "על מה אתה מודה לעצמך?" });
  assert.equal(getThoughtLiveStageCopy("gratitude", withPrompt, createEmptyThoughtLiveState()).body, "על מה אתה מודה לעצמך?");

  const withoutPrompt = thoughtArc({ gratitudePrompt: null });
  assert.equal(getThoughtLiveStageCopy("gratitude", withoutPrompt, createEmptyThoughtLiveState()).body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("Full ARC Thought's action_imagery/improved_action_imagery dwell honors ThoughtArc.postActionImageryDwellSeconds when configured, otherwise falls back to the shared default dwell times", () => {
  const configured = thoughtArc({ postActionImageryDwellSeconds: 33 });
  assert.equal(getThoughtLiveDwellSeconds("action_imagery", configured), 33);
  assert.equal(getThoughtLiveDwellSeconds("improved_action_imagery", configured), 33);

  const unconfigured = thoughtArc({ postActionImageryDwellSeconds: null });
  assert.ok((getThoughtLiveDwellSeconds("action_imagery", unconfigured) ?? 0) > 0);
  assert.ok((getThoughtLiveDwellSeconds("improved_action_imagery", unconfigured) ?? 0) > 0);
  assert.ok((getThoughtLiveDwellSeconds("action_imagery", null) ?? 0) > 0);
});

test("Mini ARC Thought's compact post-action tail runs action_imagery -> gratitude -> complete, right after the existing 'action' stage, with no improvement/success-focus stage", () => {
  const idx = (s: MiniThoughtLiveStage) => MINI_THOUGHT_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("action") < idx("action_imagery"));
  assert.deepEqual(MINI_THOUGHT_LIVE_STAGE_ORDER.slice(idx("action_imagery")), ["action_imagery", "gratitude", "complete"]);
  for (const forbidden of ["improvement_entry", "improved_action_imagery", "success_focus"]) {
    assert.ok(!MINI_THOUGHT_LIVE_STAGE_ORDER.includes(forbidden as MiniThoughtLiveStage));
  }
});

test("Mini ARC Thought's gratitude stage uses the MiniArcBuild's own miniGratitudePrompt when configured, otherwise the shared default question", () => {
  const withPrompt = miniBuild({ miniGratitudePrompt: "תודה קצרה על מה?" });
  assert.equal(getMiniThoughtLiveStageCopy("gratitude", withPrompt, null, { modality: null }).body, "תודה קצרה על מה?");

  const withoutPrompt = miniBuild({ miniGratitudePrompt: undefined });
  assert.equal(getMiniThoughtLiveStageCopy("gratitude", withoutPrompt, null, { modality: null }).body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("Mini ARC Thought's action_imagery/gratitude copy never throws and never renders 'undefined'/'null' for a build missing every Phase 8 field", () => {
  const legacyBuild = miniBuild({ miniGratitudePrompt: undefined, miniActionImageryDwellSeconds: undefined });
  for (const stage of ["action_imagery", "gratitude"] as MiniThoughtLiveStage[]) {
    assert.doesNotThrow(() => getMiniThoughtLiveStageCopy(stage, legacyBuild, null, { modality: null }));
    const copy = getMiniThoughtLiveStageCopy(stage, legacyBuild, null, { modality: null });
    const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""}`;
    assert.ok(!text.includes("undefined"));
    assert.ok(!text.includes("null"));
  }
});

test("Mini ARC Thought's action imagery dwell honors MiniArcBuild.miniActionImageryDwellSeconds when configured, otherwise a safe short default", () => {
  const configured = miniBuild({ miniActionImageryDwellSeconds: 9 });
  assert.equal(getMiniThoughtActionImageryDwellSeconds(configured), 9);
  const unconfigured = miniBuild({ miniActionImageryDwellSeconds: undefined });
  assert.ok(getMiniThoughtActionImageryDwellSeconds(unconfigured) > 0);
});

test("Full ARC Thought legacy record (none of Phase 8's fields ever set) renders the 'action' stage and the entire post-action tail safely, no crash and no 'undefined'/'null'", () => {
  const legacy = createEmptyThoughtArc("legacy-2", "ישן", "2020-01-01T00:00:00.000Z");
  for (const stage of ["action", "action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"] as ThoughtLiveStage[]) {
    assert.doesNotThrow(() => getThoughtLiveStageCopy(stage, legacy, createEmptyThoughtLiveState()));
    const copy = getThoughtLiveStageCopy(stage, legacy, createEmptyThoughtLiveState());
    const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""} ${copy.hint ?? ""}`;
    assert.ok(!text.includes("undefined"));
    assert.ok(!text.includes("null"));
  }
});
