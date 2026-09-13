import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyMiniUrgeLiveState,
  createEmptyUrgeLiveState,
  getFirstMiniUrgeLiveStage,
  getFirstUrgeLiveStage,
  getMiniUrgeActionImageryDwellSeconds,
  getMiniUrgeLiveStageCopy,
  getNextMiniUrgeLiveStage,
  getNextUrgeLiveStage,
  getUrgeLiveDwellSeconds,
  getUrgeLiveStageCopy,
  MAX_URGE_RECHECK_LOOPS,
  MINI_URGE_LIVE_STAGE_ORDER,
  resolveMiniUrgeEncoding,
  URGE_LIVE_STAGE_ORDER,
} from "./urgeLive.ts";
import type { MiniUrgeLiveStage, UrgeLiveStage, UrgeLiveState } from "./urgeLive.ts";
import { createEmptyUrgeArc } from "./types.ts";
import type { UrgeArc, UrgeRepresentation } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

function urgeArc(overrides: Partial<UrgeArc> = {}): UrgeArc {
  return { ...createEmptyUrgeArc("u1", "דחף", "2026-01-01T00:00:00.000Z"), interferingAction: "פעולה מפריעה", regulationAnchor: "עוגן", beneficialAlternativeAction: "פעולה מיטיבה", ...overrides };
}

function miniBuild(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "Mini Urge",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "סגול",
    regulationAnchor: "עוגן קצר",
    encodingAction: "פעולת קידוד",
    beneficialAction: "פעולה מיטיבה קצרה",
    protocolKind: "urge",
    ...overrides,
  };
}

// --- Required test 1: Full ARC Urge exact stage order ---
test("Full ARC Urge walks the exact fixed order: recognition -> representation -> preventive_action -> stay -> accept -> regulate -> encode -> act -> recheck -> complete", () => {
  let stage = getFirstUrgeLiveStage();
  let state = createEmptyUrgeLiveState();
  const visited: UrgeLiveStage[] = [stage];
  for (let i = 0; i < 20 && stage !== "complete"; i++) {
    if (stage === "representation" && state.representation === null) state = { ...state, representation: "visual" };
    if (stage === "recheck" && state.recheckChoice === null) state = { ...state, recheckChoice: "finish" };
    const hop = getNextUrgeLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  assert.deepEqual(visited, URGE_LIVE_STAGE_ORDER);
});

// --- Required test 2: preventive stopping action before Stay ---
test("preventive_action always precedes stay -- never the reverse", () => {
  const idx = (s: UrgeLiveStage) => URGE_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("preventive_action") < idx("stay"));
});

// --- Required test 3: Stay before Acceptance ---
test("stay always precedes accept", () => {
  const idx = (s: UrgeLiveStage) => URGE_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("stay") < idx("accept"));
});

// --- Required test 4: Acceptance before Regulation ---
test("accept always precedes regulate", () => {
  const idx = (s: UrgeLiveStage) => URGE_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("accept") < idx("regulate"));
});

// --- Required test 5: Bridge Mantra at the end of Regulation ---
test("the Bridge Mantra line appears in the 'regulate' stage's own copy, never 'encode' or any other stage", () => {
  const arc = urgeArc({ bridgeMantra: "אני משתחרר לאט לאט" });
  const state = createEmptyUrgeLiveState();
  const regulateCopy = getUrgeLiveStageCopy("regulate", arc, state);
  assert.match(regulateCopy.secondaryBody ?? "", /אני משתחרר לאט לאט/);
  for (const stage of URGE_LIVE_STAGE_ORDER) {
    if (stage === "regulate") continue;
    const copy = getUrgeLiveStageCopy(stage, arc, { ...state, representation: "visual" });
    const text = `${copy.body} ${copy.secondaryBody ?? ""}`;
    assert.ok(!text.includes("אני משתחרר לאט לאט"), `Bridge Mantra leaked into "${stage}"`);
  }
});

// --- Required tests 6-9: representation routes ---
test("visual representation route never claims the original image must disappear, and surfaces the configured visual action + alternative image", () => {
  const arc = urgeArc({ visualEncodingAction: "להקטין ולהרחיק את התמונה", alternativeDesiredImage: "תמונה של הצלחה" });
  const copy = getUrgeLiveStageCopy("encode", arc, { ...createEmptyUrgeLiveState(), representation: "visual" });
  assert.match(copy.body, /להקטין ולהרחיק את התמונה/);
  assert.match(copy.secondaryBody ?? "", /תמונה של הצלחה/);
  assert.ok(!/התמונה .*(תיעלם|חייבת להיעלם|צריכה להיעלם)/.test(`${copy.body} ${copy.secondaryBody}`));
});

test("bodily representation route uses the exact required phrasing and never instructs erasing/suppressing the existing sensation", () => {
  const arc = urgeArc({ desiredBodilySensation: "קלילות בחזה", bodilyEncodingAction: "שים לב למיקום ולעוצמה" });
  const copy = getUrgeLiveStageCopy("encode", arc, { ...createEmptyUrgeLiveState(), representation: "bodily" });
  assert.match(copy.body, /אפשר לתחושה הרצויה להתפשט בהדרגה לצד התחושה שכבר קיימת ולשנות את חוויית הגוף\./);
  assert.match(copy.body, /קלילות בחזה/);
  for (const forbidden of [/למחוק/, /לדכא/, /לבטל בכוח/, /להעלים בכוח/]) {
    assert.ok(!forbidden.test(copy.body));
  }
});

test("'both' representation route shows the primary configured action first, and includes the secondary action's content too", () => {
  const arc = urgeArc({ visualEncodingAction: "פעולה ויזואלית", bodilyEncodingAction: "פעולה גופנית" });
  const copy = getUrgeLiveStageCopy("encode", arc, { ...createEmptyUrgeLiveState(), representation: "both" });
  assert.match(copy.body, /פעולה ויזואלית/);
  assert.match(copy.secondaryBody ?? "", /פעולה גופנית/);
});

test("'unsure' representation route never forces a classification, and uses the configured standard fallback action", () => {
  const arc = urgeArc({ standardFallbackEncodingAction: "עוגן קבוע" });
  const copy = getUrgeLiveStageCopy("encode", arc, { ...createEmptyUrgeLiveState(), representation: "unsure" });
  assert.match(copy.body, /עוגן קבוע/);
});

test("'unsure' with no configured fallback at all still renders safely, never 'undefined'/'null'", () => {
  const arc = urgeArc();
  const copy = getUrgeLiveStageCopy("encode", arc, { ...createEmptyUrgeLiveState(), representation: "unsure" });
  assert.ok(!copy.body.includes("undefined"));
  assert.ok(!copy.body.includes("null"));
  assert.ok(copy.body.length > 0);
});

// --- Required test 10: desired image appears only during Encoding ---
test("visualEncodingAction/alternativeDesiredImage content appears ONLY in the 'encode' stage's copy, never recognition/representation/preventive_action", () => {
  const arc = urgeArc({ visualEncodingAction: "פעולה ויזואלית ייחודית", alternativeDesiredImage: "תמונה חלופית ייחודית" });
  for (const stage of ["recognition", "representation", "preventive_action"] as UrgeLiveStage[]) {
    const copy = getUrgeLiveStageCopy(stage, arc, { ...createEmptyUrgeLiveState(), representation: "visual" });
    const text = `${copy.body} ${copy.secondaryBody ?? ""}`;
    assert.ok(!text.includes("פעולה ויזואלית ייחודית"));
    assert.ok(!text.includes("תמונה חלופית ייחודית"));
  }
});

// --- Required test 11: desired bodily sensation appears only during Encoding ---
test("desiredBodilySensation content appears ONLY in the 'encode' stage's copy", () => {
  const arc = urgeArc({ desiredBodilySensation: "תחושה רצויה ייחודית" });
  for (const stage of URGE_LIVE_STAGE_ORDER) {
    if (stage === "encode") continue;
    const copy = getUrgeLiveStageCopy(stage, arc, { ...createEmptyUrgeLiveState(), representation: "bodily" });
    const text = `${copy.body} ${copy.secondaryBody ?? ""}`;
    assert.ok(!text.includes("תחושה רצויה ייחודית"), `leaked into "${stage}"`);
  }
});

// --- Required test 12: no instruction to intensify the urge ---
test("no stage's copy ever instructs creating, recreating, intensifying, or holding the urge", () => {
  const arc = urgeArc({
    visualEncodingAction: "א",
    bodilyEncodingAction: "ב",
    desiredBodilySensation: "ג",
    alternativeDesiredImage: "ד",
    standardFallbackEncodingAction: "ה",
  });
  const forbidden = [/תיצור את הדחף/, /תחזק את הדחף/, /תעצים את הדחף/, /תחזיק את הדחף/, /תשמור על הדחף פעיל/];
  for (const representation of ["visual", "bodily", "both", "unsure"] as UrgeRepresentation[]) {
    for (const stage of URGE_LIVE_STAGE_ORDER) {
      const copy = getUrgeLiveStageCopy(stage, arc, { ...createEmptyUrgeLiveState(), representation });
      const text = `${copy.body} ${copy.secondaryBody ?? ""}`;
      for (const pattern of forbidden) {
        assert.ok(!pattern.test(text), `"${stage}"/${representation}: "${text}"`);
      }
    }
  }
});

// --- Required test 13: beneficial action timer remains separate (structural -- this module has no timer at all) ---
test("arc/urgeLive.ts defines no timer mechanism of its own -- act's copy carries no timer/duration field, kept fully separate from Link/Presence/Regulation-dwell timers", () => {
  const copy = getUrgeLiveStageCopy("act", urgeArc(), createEmptyUrgeLiveState());
  assert.ok(!("timer" in copy));
  assert.ok(!("durationSeconds" in copy));
});

// --- Required test 14: negative-action timer never auto-starts ---
test("no stage transition or copy in this module references a negative-action timer", () => {
  const source = getUrgeLiveStageCopy.toString() + getNextUrgeLiveStage.toString();
  assert.ok(!/negative[_-]?[Aa]ction/.test(source));
});

// --- Required test 15: neutral urge re-rating ---
test("recheck's own copy is neutral ('מה עוצמת הדחף עכשיו?'), never framed as pass/fail", () => {
  const copy = getUrgeLiveStageCopy("recheck", urgeArc(), createEmptyUrgeLiveState());
  assert.equal(copy.body, "מה עוצמת הדחף עכשיו?");
  assert.ok(!/נכשל|כישלון|הצלחה מלאה/.test(copy.body));
});

// --- Required test 16: unchanged re-rating is not failure ---
test("recheck reaching the safety cap continues forward into the post-action completion tail rather than looping forever or failing", () => {
  let state: UrgeLiveState = { ...createEmptyUrgeLiveState(), recheckLoopCount: MAX_URGE_RECHECK_LOOPS };
  const hop = getNextUrgeLiveStage("recheck", { ...state, recheckChoice: "repeat_regulation" });
  assert.equal(hop.stage, "action_imagery");
});

test("recheck's 'repeat_regulation' choice loops back to 'regulate' (under the cap), and 'repeat_action'/'alternative_action' loop back to 'act'", () => {
  const state = createEmptyUrgeLiveState();
  const repeatRegulation = getNextUrgeLiveStage("recheck", { ...state, recheckChoice: "repeat_regulation" });
  assert.equal(repeatRegulation.stage, "regulate");
  const repeatAction = getNextUrgeLiveStage("recheck", { ...state, recheckChoice: "repeat_action" });
  assert.equal(repeatAction.stage, "act");
  const alternativeAction = getNextUrgeLiveStage("recheck", { ...state, recheckChoice: "alternative_action" });
  assert.equal(alternativeAction.stage, "act");
  const finish = getNextUrgeLiveStage("recheck", { ...state, recheckChoice: "finish" });
  assert.equal(finish.stage, "action_imagery");
});

// --- Required test 17: ARC Mini Urge exact short stage order ---
test("ARC Mini Urge walks the exact fixed short order: recognition -> representation -> preventive_action -> regulate -> encode -> act -> action_imagery -> gratitude -> complete", () => {
  let stage = getFirstMiniUrgeLiveStage();
  let state = createEmptyMiniUrgeLiveState();
  const visited: MiniUrgeLiveStage[] = [stage];
  for (let i = 0; i < 20 && stage !== "complete"; i++) {
    if (stage === "representation" && state.representation === null) state = { ...state, representation: "visual" };
    const hop = getNextMiniUrgeLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  assert.deepEqual(visited, MINI_URGE_LIVE_STAGE_ORDER);
});

// --- Required tests 18-20: ARC Mini Urge excludes Stay/Acceptance/Presence rating ---
test("ARC Mini Urge's stage set excludes Stay, Acceptance, and Presence rating entirely", () => {
  const forbidden = ["stay", "accept", "presence_check", "presence_rating"];
  for (const stage of MINI_URGE_LIVE_STAGE_ORDER) {
    assert.ok(!forbidden.includes(stage as string), `Mini Urge must never include "${stage}"`);
  }
});

// --- Required test 21: ARC Mini Urge uses one Regulation anchor ---
test("ARC Mini Urge's 'regulate' stage shows exactly the build's one preselected regulation anchor, no full Regulation flow", () => {
  const build = miniBuild({ regulationAnchor: "עוגן יחיד" });
  const copy = getMiniUrgeLiveStageCopy("regulate", build, createEmptyMiniUrgeLiveState());
  assert.equal(copy.body, "עוגן יחיד");
});

// --- Required test 22: ARC Mini Urge uses one primary Encoding action ---
test("ARC Mini Urge's Encoding uses exactly one primary preconfigured action for visual/bodily/unsure, and offers only an OPTIONAL secondary for 'both'", () => {
  const build = miniBuild({ encodingAction: "פעולה ראשית", secondaryEncodingAction: "פעולה משנית" });
  for (const representation of ["visual", "bodily", "unsure"] as UrgeRepresentation[]) {
    const resolved = resolveMiniUrgeEncoding(build, representation);
    assert.equal(resolved.body, "פעולה ראשית");
    assert.equal(resolved.secondaryAction, null, `${representation} must never require the secondary action`);
  }
  const both = resolveMiniUrgeEncoding(build, "both");
  assert.equal(both.body, "פעולה ראשית");
  assert.equal(both.secondaryAction, "פעולה משנית");
});

test("ARC Mini Urge never requires configuring the encoding choice live -- resolveMiniUrgeEncoding is a pure function of BUILD-configured fields only", () => {
  assert.equal(resolveMiniUrgeEncoding.length, 2, "takes only (build, representation) -- no live-input parameter");
});

// --- Required test 23: ARC Mini Urge Link remains separate from real Mini Urge ---
test("this module (the REAL-TIME Mini Urge engine) is structurally independent of arc/miniArcLink.ts (the Mini Link REHEARSAL engine) -- different stage id vocabularies, confirming they never collapse into one flow", () => {
  const realTimeIds = new Set(MINI_URGE_LIVE_STAGE_ORDER as string[]);
  // arc/miniArcLink.ts's own step ids (see that file) include "reinforce"/"archi_start_confirmation"/"bridge_mantra" --
  // none of which this real-time engine's stage set ever uses.
  for (const rehearsalOnlyId of ["reinforce", "archi_start_confirmation", "name_state", "bridge_mantra"]) {
    assert.ok(!realTimeIds.has(rehearsalOnlyId));
  }
});

// --- Required test 26: legacy Full ARC Urge without new fields ---
test("a legacy UrgeArc (createEmptyUrgeArc, none of this phase's fields ever set) renders every stage safely with no crash and no 'undefined'/'null'", () => {
  const legacy = createEmptyUrgeArc("legacy-1", "ישן", "2020-01-01T00:00:00.000Z");
  for (const representation of ["visual", "bodily", "both", "unsure"] as UrgeRepresentation[]) {
    for (const stage of URGE_LIVE_STAGE_ORDER) {
      assert.doesNotThrow(() => getUrgeLiveStageCopy(stage, legacy, { ...createEmptyUrgeLiveState(), representation }));
      const copy = getUrgeLiveStageCopy(stage, legacy, { ...createEmptyUrgeLiveState(), representation });
      const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""} ${copy.hint ?? ""}`;
      assert.ok(!text.includes("undefined"), `${stage}/${representation}: "${text}"`);
      assert.ok(!text.includes("null"), `${stage}/${representation}: "${text}"`);
    }
  }
});

// --- Required test 27: legacy Mini ARC without a parent (independence check) ---
test("a Mini ARC Urge build with no parentArcBuildId (standalone/legacy) still resolves Encoding/stage copy safely for every representation", () => {
  const standalone = miniBuild({ parentArcBuildId: undefined });
  for (const representation of ["visual", "bodily", "both", "unsure"] as UrgeRepresentation[]) {
    for (const stage of MINI_URGE_LIVE_STAGE_ORDER) {
      assert.doesNotThrow(() => getMiniUrgeLiveStageCopy(stage, standalone, { representation }));
    }
  }
});

// --- Backward-compat: missing individual fields never invent content ---
test("missing visualEncodingAction/bodilyEncodingAction never invent placeholder user content -- safe generic wording only", () => {
  const arc = urgeArc();
  const visual = getUrgeLiveStageCopy("encode", arc, { ...createEmptyUrgeLiveState(), representation: "visual" });
  const bodily = getUrgeLiveStageCopy("encode", arc, { ...createEmptyUrgeLiveState(), representation: "bodily" });
  assert.ok(visual.body.length > 0 && !visual.body.includes("undefined"));
  assert.ok(bodily.body.length > 0 && !bodily.body.includes("undefined"));
});

test("missing preventiveStoppingAction/stopCue allows continuing safely rather than crashing or blocking", () => {
  const arc = urgeArc({ stopCue: null });
  const copy = getUrgeLiveStageCopy("preventive_action", arc, createEmptyUrgeLiveState());
  assert.equal(copy.body, "אפשר להמשיך גם ללא פעולת עצירה מוגדרת.");
});

test("recognition is never gated on any answer -- always advances on the very next hop", () => {
  const hop = getNextUrgeLiveStage("recognition", createEmptyUrgeLiveState());
  assert.equal(hop.stage, "representation");
});

// ---------------------------------------------------------------------------
// Phase 8: universal post-action completion retrofit
// ---------------------------------------------------------------------------

test("Full ARC Urge's post-action tail runs action_imagery -> improvement_entry -> improved_action_imagery -> gratitude -> complete, right after 'recheck' finishes", () => {
  const idx = (s: UrgeLiveStage) => URGE_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("recheck") < idx("action_imagery"));
  assert.deepEqual(URGE_LIVE_STAGE_ORDER.slice(idx("action_imagery")), [
    "action_imagery",
    "improvement_entry",
    "improved_action_imagery",
    "gratitude",
    "complete",
  ]);
});

test("Full ARC Urge's post-action tail is never gated -- every stage advances even with no free-text answer supplied", () => {
  let stage: UrgeLiveStage = "action_imagery";
  let state = createEmptyUrgeLiveState();
  const visited: UrgeLiveStage[] = [stage];
  for (let i = 0; i < 10 && stage !== "complete"; i++) {
    const hop = getNextUrgeLiveStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  assert.deepEqual(visited, ["action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"]);
});

test("Full ARC Urge's gratitude stage uses the UrgeArc's own gratitudePrompt when configured, otherwise the shared default question", () => {
  const withPrompt = urgeArc({ gratitudePrompt: "על מה אתה אסיר תודה כרגע?" });
  const copyWithPrompt = getUrgeLiveStageCopy("gratitude", withPrompt, createEmptyUrgeLiveState());
  assert.equal(copyWithPrompt.body, "על מה אתה אסיר תודה כרגע?");

  const withoutPrompt = urgeArc({ gratitudePrompt: null });
  const copyWithoutPrompt = getUrgeLiveStageCopy("gratitude", withoutPrompt, createEmptyUrgeLiveState());
  assert.equal(copyWithoutPrompt.body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("Full ARC Urge's action_imagery/improved_action_imagery dwell honors UrgeArc.postActionImageryDwellSeconds when configured, otherwise falls back to the shared default dwell times", () => {
  const configured = urgeArc({ postActionImageryDwellSeconds: 42 });
  assert.equal(getUrgeLiveDwellSeconds("action_imagery", configured), 42);
  assert.equal(getUrgeLiveDwellSeconds("improved_action_imagery", configured), 42);

  const unconfigured = urgeArc({ postActionImageryDwellSeconds: null });
  assert.ok((getUrgeLiveDwellSeconds("action_imagery", unconfigured) ?? 0) > 0);
  assert.ok((getUrgeLiveDwellSeconds("improved_action_imagery", unconfigured) ?? 0) > 0);

  assert.ok((getUrgeLiveDwellSeconds("action_imagery", null) ?? 0) > 0);
});

test("Full ARC Urge's improved_action_imagery reflects the trainee's own improvement text when supplied, and falls back to the shared generic line otherwise", () => {
  const withImprovement = getUrgeLiveStageCopy("improved_action_imagery", urgeArc(), {
    ...createEmptyUrgeLiveState(),
    postAction: { improvementText: "לדבר בקול רגוע יותר", gratitudeText: null },
  });
  assert.match(withImprovement.body, /לדבר בקול רגוע יותר/);

  const withoutImprovement = getUrgeLiveStageCopy("improved_action_imagery", urgeArc(), createEmptyUrgeLiveState());
  assert.equal(withoutImprovement.body, "דמיין את עצמך מבצע שוב את הפעולה, תוך שמירה על מה שעבד היטב.");
});

test("Mini ARC Urge's compact post-action tail runs action_imagery -> gratitude -> complete, right after 'act', with no improvement/success-focus stage", () => {
  const idx = (s: MiniUrgeLiveStage) => MINI_URGE_LIVE_STAGE_ORDER.indexOf(s);
  assert.ok(idx("act") < idx("action_imagery"));
  assert.deepEqual(MINI_URGE_LIVE_STAGE_ORDER.slice(idx("action_imagery")), ["action_imagery", "gratitude", "complete"]);
  for (const forbidden of ["improvement_entry", "improved_action_imagery", "success_focus"]) {
    assert.ok(!MINI_URGE_LIVE_STAGE_ORDER.includes(forbidden as MiniUrgeLiveStage));
  }
});

test("Mini ARC Urge's gratitude stage uses the MiniArcBuild's own miniGratitudePrompt when configured, otherwise the shared default question", () => {
  const withPrompt = miniBuild({ miniGratitudePrompt: "על מה תודה קצרה עכשיו?" });
  const copyWithPrompt = getMiniUrgeLiveStageCopy("gratitude", withPrompt, createEmptyMiniUrgeLiveState());
  assert.equal(copyWithPrompt.body, "על מה תודה קצרה עכשיו?");

  const withoutPrompt = miniBuild({ miniGratitudePrompt: undefined });
  const copyWithoutPrompt = getMiniUrgeLiveStageCopy("gratitude", withoutPrompt, createEmptyMiniUrgeLiveState());
  assert.equal(copyWithoutPrompt.body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("Mini ARC Urge's action_imagery/gratitude copy never throws and never renders 'undefined'/'null' for a build missing every Phase 8 field", () => {
  const legacyBuild = miniBuild({ miniGratitudePrompt: undefined, miniActionImageryDwellSeconds: undefined });
  for (const stage of ["action_imagery", "gratitude"] as MiniUrgeLiveStage[]) {
    assert.doesNotThrow(() => getMiniUrgeLiveStageCopy(stage, legacyBuild, createEmptyMiniUrgeLiveState()));
    const copy = getMiniUrgeLiveStageCopy(stage, legacyBuild, createEmptyMiniUrgeLiveState());
    const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""}`;
    assert.ok(!text.includes("undefined"));
    assert.ok(!text.includes("null"));
  }
});

test("Mini ARC Urge's action imagery dwell honors MiniArcBuild.miniActionImageryDwellSeconds when configured, otherwise a safe short default", () => {
  const configured = miniBuild({ miniActionImageryDwellSeconds: 7 });
  assert.equal(getMiniUrgeActionImageryDwellSeconds(configured), 7);
  const unconfigured = miniBuild({ miniActionImageryDwellSeconds: undefined });
  assert.ok(getMiniUrgeActionImageryDwellSeconds(unconfigured) > 0);
});

test("Full ARC Urge legacy record (none of Phase 8's fields ever set) renders the entire post-action tail safely, no crash and no 'undefined'/'null'", () => {
  const legacy = createEmptyUrgeArc("legacy-2", "ישן", "2020-01-01T00:00:00.000Z");
  for (const stage of ["action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"] as UrgeLiveStage[]) {
    assert.doesNotThrow(() => getUrgeLiveStageCopy(stage, legacy, createEmptyUrgeLiveState()));
    const copy = getUrgeLiveStageCopy(stage, legacy, createEmptyUrgeLiveState());
    const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""} ${copy.hint ?? ""}`;
    assert.ok(!text.includes("undefined"));
    assert.ok(!text.includes("null"));
  }
});
