import test from "node:test";
import assert from "node:assert/strict";

import { getAcceptanceMantraLine, getBridgeMantraLine, getRegulationMantraLine, getStayMantraLine } from "./mantras.ts";

test("all four mantra line-builders return null when their own field is unset/blank/whitespace-only -- never an invented or blank line", () => {
  const empty = {};
  assert.equal(getStayMantraLine(empty), null);
  assert.equal(getAcceptanceMantraLine(empty), null);
  assert.equal(getRegulationMantraLine(empty), null);
  assert.equal(getBridgeMantraLine(empty), null);

  const blank = { stayMantra: "   ", acceptanceMantra: null, regulationMantra: undefined, bridgeMantra: "" };
  assert.equal(getStayMantraLine(blank), null);
  assert.equal(getAcceptanceMantraLine(blank), null);
  assert.equal(getRegulationMantraLine(blank), null);
  assert.equal(getBridgeMantraLine(blank), null);
});

test("getStayMantraLine echoes the trimmed text inside its own fixed frame", () => {
  const line = getStayMantraLine({ stayMantra: "  אני יכול להישאר לרגע עם מה שכבר נמצא כאן.  " });
  assert.equal(line, 'אפשר להישאר עם זה לרגע: "אני יכול להישאר לרגע עם מה שכבר נמצא כאן.".');
});

test("getAcceptanceMantraLine echoes the trimmed text inside its own fixed frame, distinct wording from Stay", () => {
  const line = getAcceptanceMantraLine({ acceptanceMantra: "מותר למה שאני מרגיש להיות כאן כרגע." });
  assert.equal(line, 'מותר לזה להיות כאן כרגע: "מותר למה שאני מרגיש להיות כאן כרגע.".');
});

test("getRegulationMantraLine echoes the trimmed text inside its own fixed frame, distinct wording from Stay/Acceptance", () => {
  const line = getRegulationMantraLine({ regulationMantra: "אני מאפשר לגוף להתייצב בקצב שלו." });
  assert.equal(line, 'תן לגוף להתייצב בקצב שלו: "אני מאפשר לגוף להתייצב בקצב שלו.".');
});

test("getBridgeMantraLine echoes the trimmed text inside its own fixed frame, distinct wording from the other three", () => {
  const line = getBridgeMantraLine({ bridgeMantra: "אני צועד לקראת מי שאני רוצה להיות." });
  assert.equal(line, 'הגשר לקראת מה שרוצים לחזק: "אני צועד לקראת מי שאני רוצה להיות.".');
});

test("each of the four mantras is independently gated -- setting one never produces a line for another", () => {
  const profile = { stayMantra: "טקסט שהייה" };
  assert.notEqual(getStayMantraLine(profile), null);
  assert.equal(getAcceptanceMantraLine(profile), null);
  assert.equal(getRegulationMantraLine(profile), null);
  assert.equal(getBridgeMantraLine(profile), null);
});

test("all four coexist independently when all are configured -- four distinct, non-overlapping lines", () => {
  const profile = {
    stayMantra: "טקסט שהייה",
    acceptanceMantra: "טקסט קבלה",
    regulationMantra: "טקסט ויסות",
    bridgeMantra: "טקסט גשר",
  };
  const lines = [getStayMantraLine(profile), getAcceptanceMantraLine(profile), getRegulationMantraLine(profile), getBridgeMantraLine(profile)];
  assert.equal(new Set(lines).size, 4, "all four lines must be distinct");
  for (const line of lines) assert.ok(line && line.length > 0);
});
