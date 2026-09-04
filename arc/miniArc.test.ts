import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMiniArcFromDraft,
  createEmptyMiniArcDraft,
  deleteMiniArcFromList,
  draftFromMiniArc,
  duplicateMiniArc,
  generateMiniArcId,
  getMiniArcPersistentColorLine,
  getMiniArcStageCopy,
  getNextMiniArcStage,
  isMiniArcDraftComplete,
  MINI_ARC_STAGE_ORDER,
  safeText,
  upsertMiniArcInList,
} from "./miniArc.ts";
import type { MiniArcBuild, MiniArcDraft, MiniArcStage } from "./miniArc.ts";
import { containsInductionPattern } from "./instructions.ts";

function build(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "עצירה מול דחף",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "סגול",
    regulationAnchor: "הרגש את כפות הרגליים על הקרקע.",
    encodingAction: "ליישר בעדינות את הגב",
    beneficialAction: "להרחיק את היד מהאוזן ולהניח אותה על הרגל.",
    ...overrides,
  };
}

function completeDraft(overrides: Partial<MiniArcDraft> = {}): MiniArcDraft {
  return {
    name: "עצירה מול דחף",
    presenceColor: "סגול",
    regulationAnchor: "הרגש את כפות הרגליים על הקרקע.",
    encodingAction: "ליישר בעדינות את הגב",
    beneficialAction: "להרחיק את היד מהאוזן ולהניח אותה על הרגל.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// safeText
// ---------------------------------------------------------------------------

test("safeText never returns undefined/null-ish text for a malformed value", () => {
  assert.equal(safeText("  סגול  "), "סגול");
  assert.equal(safeText(undefined), "");
  assert.equal(safeText(null), "");
  assert.equal(safeText(42), "");
  assert.equal(safeText({}), "");
});

// ---------------------------------------------------------------------------
// Id generation + list CRUD (mirrors arc/arcBuilds.test.ts's own coverage)
// ---------------------------------------------------------------------------

test("generateMiniArcId produces unique, distinctly-prefixed ids -- never colliding with a full ArcBuild id", () => {
  const a = generateMiniArcId();
  const b = generateMiniArcId();
  assert.notEqual(a, b);
  assert.match(a, /^miniarc-/);
  assert.ok(!a.startsWith("arcbuild-"));
});

test("upsertMiniArcInList updates only the matching build by id, appends when not found, and never touches other builds' own objects", () => {
  const a = build({ id: "a", name: "א" });
  const b = build({ id: "b", name: "ב" });
  let list = upsertMiniArcInList([], a);
  list = upsertMiniArcInList(list, b);
  assert.equal(list.length, 2);

  const updatedA = { ...a, presenceColor: "כחול" };
  const afterUpdate = upsertMiniArcInList(list, updatedA);
  assert.equal(afterUpdate.length, 2);
  assert.equal(afterUpdate.find((x) => x.id === "a")?.presenceColor, "כחול");
  assert.equal(afterUpdate.find((x) => x.id === "b"), b, "the OTHER build's object is untouched (same reference)");
});

test("deleteMiniArcFromList removes exactly the matching build, leaving every other one untouched", () => {
  const a = build({ id: "a" });
  const b = build({ id: "b" });
  const list = [a, b];
  const after = deleteMiniArcFromList(list, "a");
  assert.equal(after.length, 1);
  assert.equal(after[0], b);
});

test("duplicateMiniArc generates a new unique id, adjusts the name, and never mutates the original", () => {
  const original = build({ id: "orig", name: "עצירה מול דחף" });
  const copy = duplicateMiniArc(original, "2026-02-02T00:00:00.000Z");
  assert.notEqual(copy.id, original.id);
  assert.match(copy.name, /עצירה מול דחף \(עותק\)/);
  assert.equal(copy.presenceColor, original.presenceColor);
  assert.equal(copy.regulationAnchor, original.regulationAnchor);
  assert.equal(copy.encodingAction, original.encodingAction);
  assert.equal(copy.beneficialAction, original.beneficialAction);
  assert.equal(original.name, "עצירה מול דחף", "the original is never mutated");
});

// ---------------------------------------------------------------------------
// BUILD MINI ARC -- validation. More than one independent Mini ARC.
// ---------------------------------------------------------------------------

test("isMiniArcDraftComplete requires all five fields -- name, presenceColor, regulationAnchor, encodingAction, beneficialAction", () => {
  assert.equal(isMiniArcDraftComplete(createEmptyMiniArcDraft()), false);
  assert.equal(isMiniArcDraftComplete(completeDraft()), true);
  for (const field of ["name", "presenceColor", "regulationAnchor", "encodingAction", "beneficialAction"] as const) {
    assert.equal(isMiniArcDraftComplete(completeDraft({ [field]: "" })), false, `missing ${field} must block completion`);
    assert.equal(isMiniArcDraftComplete(completeDraft({ [field]: "   " })), false, `whitespace-only ${field} must block completion`);
  }
});

test("buildMiniArcFromDraft throws for an incomplete draft -- never silently saves a partial Mini ARC", () => {
  assert.throws(() => buildMiniArcFromDraft(createEmptyMiniArcDraft(), "id", "now", "now"));
});

test("buildMiniArcFromDraft trims and persists every field, and two independently-created Mini ARC Builds keep their own distinct data", () => {
  const first = buildMiniArcFromDraft(completeDraft({ name: "  עצירה מול דחף  " }), "id-1", "t1", "t1");
  const second = buildMiniArcFromDraft(
    completeDraft({ name: "רגיעה לפני שינה", presenceColor: "כחול", regulationAnchor: "שים לב לנשימה הטבעית שלך, בלי לשנות אותה." }),
    "id-2",
    "t2",
    "t2"
  );
  assert.equal(first.name, "עצירה מול דחף", "trimmed");
  assert.notEqual(first.id, second.id);
  assert.equal(first.presenceColor, "סגול");
  assert.equal(second.presenceColor, "כחול");
  assert.notEqual(first.presenceColor, second.presenceColor, "each Mini ARC preserves its own color independently");
  assert.notEqual(first.regulationAnchor, second.regulationAnchor);
});

test("draftFromMiniArc round-trips a saved build, and safely defaults a malformed/legacy record's missing fields to empty text rather than crashing", () => {
  const saved = build();
  const draft = draftFromMiniArc(saved);
  assert.equal(draft.name, saved.name);
  assert.equal(draft.presenceColor, saved.presenceColor);

  const malformed = { ...saved } as MiniArcBuild;
  delete (malformed as { presenceColor?: unknown }).presenceColor;
  const migratedDraft = draftFromMiniArc(malformed);
  assert.equal(migratedDraft.presenceColor, "", "missing field defaults to empty, never crashes, never 'undefined'");
});

// ---------------------------------------------------------------------------
// LIVE MINI ARC -- fixed, linear stage sequence, no branching, no rating.
// ---------------------------------------------------------------------------

test("MINI_ARC_STAGE_ORDER is the exact fixed sequence from the spec: pause -> name_state -> regulation -> encoding -> imagery -> action -> complete", () => {
  assert.deepEqual(MINI_ARC_STAGE_ORDER, ["pause", "name_state", "regulation", "encoding", "imagery", "action", "complete"]);
});

test("getNextMiniArcStage always walks forward exactly one fixed step, never skips, never branches, and 'complete' is terminal", () => {
  assert.equal(getNextMiniArcStage("pause"), "name_state");
  assert.equal(getNextMiniArcStage("name_state"), "regulation");
  assert.equal(getNextMiniArcStage("regulation"), "encoding");
  assert.equal(getNextMiniArcStage("encoding"), "imagery");
  assert.equal(getNextMiniArcStage("imagery"), "action");
  assert.equal(getNextMiniArcStage("action"), "complete");
  assert.equal(getNextMiniArcStage("complete"), "complete", "terminal -- never advances past completion");
});

test("LIVE begins with the short pause -- the first stage in the fixed order is 'pause', never a Presence rating or full Presence stage", () => {
  assert.equal(MINI_ARC_STAGE_ORDER[0], "pause");
});

test("no Presence rating stage, no full Presence-stage names, and no full-ARC-only concepts anywhere in the Mini ARC stage set", () => {
  const forbidden = ["presence_check", "arc_thought_awareness", "arc_thought_combined_attention", "arc_thought_expand_presence", "arc_thought_presence_recheck", "sensation_check", "stay", "accept", "success_focus"];
  for (const stage of MINI_ARC_STAGE_ORDER) {
    assert.ok(!forbidden.includes(stage), `${stage} must never be a full-ARC stage name`);
  }
});

test("the persistent Presence Color line uses the CURRENT build's own saved color, dynamically, never hard-coded, and is safe when a color is (defensively) absent", () => {
  const purple = build({ presenceColor: "סגול" });
  const green = build({ presenceColor: "ירוק" });
  assert.equal(getMiniArcPersistentColorLine(purple), "צבע הנוכחות שלך: סגול");
  assert.equal(getMiniArcPersistentColorLine(green), "צבע הנוכחות שלך: ירוק");
  assert.notEqual(getMiniArcPersistentColorLine(purple), getMiniArcPersistentColorLine(green));

  const malformed = { ...purple, presenceColor: undefined } as unknown as MiniArcBuild;
  const line = getMiniArcPersistentColorLine(malformed);
  assert.ok(!line.includes("undefined"));
  assert.ok(!line.includes("null"));
});

test("the persistent color line stays available (non-empty, well-formed) for every stage from the initial pause through completion", () => {
  const b = build({ presenceColor: "סגול" });
  for (const stage of MINI_ARC_STAGE_ORDER) {
    const line = getMiniArcPersistentColorLine(b);
    assert.match(line, /סגול/, stage);
  }
});

test("step 1 (pause) is a brief intentional pause only -- no rating, no regulation instructions, no full Presence stages, no timer-related copy", () => {
  const copy = getMiniArcStageCopy("pause", build());
  assert.equal(copy.title, "עצירה");
  assert.equal(copy.body, "עצור לרגע את התגובה האוטומטית.");
  assert.equal(copy.buttonLabel, "אני כאן");
  assert.equal(copy.secondaryBody, null);
  for (const forbidden of ["בסולם", "1 עד 10", "דקות", "שניות"]) {
    assert.ok(!copy.body.includes(forbidden), `pause must never contain: "${forbidden}"`);
  }
});

test("step 2 (name the current state) is entered only during LIVE -- never predetermined during BUILD -- and never asks for a rating", () => {
  const copy = getMiniArcStageCopy("name_state", build());
  assert.equal(copy.title, "מה נמצא עכשיו?");
  assert.match(copy.body, /תחושה|דחף|מצב/);
  assert.ok(!copy.body.includes("בסולם"), "must never ask for a rating");
  assert.match(copy.hint ?? "", /דחף/);
});

test("step 3 shows ONLY the one saved regulation anchor plus the dynamic color reminder -- no full Presence stages, no additional regulation cues", () => {
  const p = build({ regulationAnchor: "הרגש את כפות הרגליים על הקרקע.", presenceColor: "סגול" });
  const copy = getMiniArcStageCopy("regulation", p);
  assert.equal(copy.body, "הרגש את כפות הרגליים על הקרקע.");
  assert.equal(copy.secondaryBody, "הצבע שבחרת, סגול, ממשיך ללוות אותך.");
});

test("step 4 shows ONLY the one saved short encoding action plus the dynamic color line -- no full Encoding sequence, no mantra, no timer", () => {
  const p = build({ encodingAction: "ליישר בעדינות את הגב", presenceColor: "סגול" });
  const copy = getMiniArcStageCopy("encoding", p);
  assert.equal(copy.body, "ליישר בעדינות את הגב");
  assert.equal(copy.secondaryBody, "הישאר בתנוחה הזאת לרגע, כשהצבע שבחרת, סגול, ממשיך למלא את הנוכחות שלך.");
});

test("step 5 (brief side-view imagery) appears only after encoding and before action in the fixed order", () => {
  assert.equal(getNextMiniArcStage("encoding"), "imagery");
  assert.equal(getNextMiniArcStage("imagery"), "action");
});

test("step 5's copy connects the saved Presence Color, encoding action (via the shared posture), and beneficial action, and never asks to imagine/evoke/strengthen the unwanted state or urge", () => {
  const p = build({ presenceColor: "סגול", beneficialAction: "להרחיק את היד מהאוזן ולהניח אותה על הרגל." });
  const copy = getMiniArcStageCopy("imagery", p);
  assert.equal(copy.title, "ראה את עצמך מהצד");
  assert.match(copy.body, /ראה את עצמך מהצד/);
  assert.match(copy.body, /סגול/);
  assert.equal(copy.secondaryBody, "ראה את עצמך מתחיל: להרחיק את היד מהאוזן ולהניח אותה על הרגל.");
  assert.equal(copy.buttonLabel, "המשך לפעולה");
  assert.equal(containsInductionPattern(copy.body), false, "must never trip the induction-pattern safety denylist");
  assert.equal(containsInductionPattern(copy.secondaryBody ?? ""), false);
  for (const forbidden of ["הדחף", "התחושה הלא רצויה", "המצב שממנו", "תחזק"]) {
    assert.ok(!copy.body.includes(forbidden), `imagery must never reference the unwanted state/urge: "${forbidden}"`);
  }
});

test("step 5 is a single brief image only -- no detailed visualization, repetition, sensory questions, mantra, reflection, or timer wording", () => {
  const copy = getMiniArcStageCopy("imagery", build());
  for (const forbidden of ["חזור על", "שוב ושוב", "מה אתה שומע", "מה אתה מרגיש", "חזור לעצמך", "דקות", "שניות"]) {
    assert.ok(!copy.body.includes(forbidden), `imagery must not contain: "${forbidden}"`);
    assert.ok(!(copy.secondaryBody ?? "").includes(forbidden), `imagery secondaryBody must not contain: "${forbidden}"`);
  }
});

test("step 6 shows the correct saved beneficial action and the dynamic presence-color/body-language line, then proceeds directly to completion -- no full ARC stages launched", () => {
  const p = build({ beneficialAction: "להרחיק את היד מהאוזן ולהניח אותה על הרגל." });
  const copy = getMiniArcStageCopy("action", p);
  assert.equal(copy.body, "עכשיו: להרחיק את היד מהאוזן ולהניח אותה על הרגל.");
  assert.equal(copy.secondaryBody, "קח איתך את צבע הנוכחות ואת שפת הגוף אל הפעולה.");
  assert.equal(copy.buttonLabel, "אני מתחיל לפעול");
  assert.equal(getNextMiniArcStage("action"), "complete", "proceeds directly to completion, nothing in between");
});

test("completion shows only the fixed sentence and 'סיום' -- never Success Focus, Gratitude, a rating, or reflection questions", () => {
  const copy = getMiniArcStageCopy("complete", build());
  assert.equal(copy.body, "יצרת מרווח ובחרת פעולה.");
  assert.equal(copy.buttonLabel, "סיום");
  assert.equal(copy.secondaryBody, null);
  for (const forbidden of ["הצלחה", "תודה", "בסולם", "רגש כלפי עצמך", "מה למדת"]) {
    assert.ok(!copy.body.includes(forbidden), `completion must not reference: "${forbidden}"`);
  }
});

test("every stage's copy correctly inserts the color belonging to the SELECTED build -- no cross-build bleed between two different Mini ARC Builds", () => {
  const purple = build({ id: "p", presenceColor: "סגול", regulationAnchor: "עוגן א", encodingAction: "קידוד א", beneficialAction: "פעולה א" });
  const green = build({ id: "g", presenceColor: "ירוק", regulationAnchor: "עוגן ב", encodingAction: "קידוד ב", beneficialAction: "פעולה ב" });
  const stagesWithColor: MiniArcStage[] = ["regulation", "encoding", "imagery"];
  for (const stage of stagesWithColor) {
    const purpleCopy = getMiniArcStageCopy(stage, purple);
    const greenCopy = getMiniArcStageCopy(stage, green);
    const purpleText = `${purpleCopy.body} ${purpleCopy.secondaryBody ?? ""}`;
    const greenText = `${greenCopy.body} ${greenCopy.secondaryBody ?? ""}`;
    assert.match(purpleText, /סגול/, stage);
    assert.ok(!purpleText.includes("ירוק"), `${stage}: purple build must never show green's color`);
    assert.match(greenText, /ירוק/, stage);
    assert.ok(!greenText.includes("סגול"), `${stage}: green build must never show purple's color`);
  }
});

test("no stage's copy ever renders 'undefined'/'null'/'NaN'/'[object Object]' for a well-formed build", () => {
  const b = build();
  for (const stage of MINI_ARC_STAGE_ORDER) {
    const copy = getMiniArcStageCopy(stage, b);
    const text = `${copy.title} ${copy.body} ${copy.secondaryBody ?? ""} ${copy.hint ?? ""} ${copy.buttonLabel}`;
    for (const forbidden of ["undefined", "null", "NaN", "[object Object]"]) {
      assert.ok(!text.includes(forbidden), `${stage} must never render "${forbidden}": "${text}"`);
    }
  }
});

test("a defensively malformed/legacy Mini ARC record (fields genuinely missing after JSON.parse) never crashes getMiniArcStageCopy and never renders undefined/null placeholders", () => {
  const malformed = {
    id: "m1",
    name: "x",
    createdAt: "t",
    updatedAt: "t",
  } as unknown as MiniArcBuild;
  for (const stage of MINI_ARC_STAGE_ORDER) {
    assert.doesNotThrow(() => getMiniArcStageCopy(stage, malformed), stage);
    const copy = getMiniArcStageCopy(stage, malformed);
    const text = `${copy.body} ${copy.secondaryBody ?? ""}`;
    assert.ok(!text.includes("undefined"), `${stage}: "${text}"`);
    assert.ok(!text.includes("null"), `${stage}: "${text}"`);
  }
});
