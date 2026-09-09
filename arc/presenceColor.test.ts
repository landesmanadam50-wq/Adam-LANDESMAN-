import test from "node:test";
import assert from "node:assert/strict";

import { getEnergyColorLine, hasPresenceColor } from "./presenceColor.ts";

test("hasPresenceColor is true only for a real, non-blank string", () => {
  assert.equal(hasPresenceColor("סגול"), true);
  assert.equal(hasPresenceColor("  סגול  "), true);
  assert.equal(hasPresenceColor(""), false);
  assert.equal(hasPresenceColor("   "), false);
  assert.equal(hasPresenceColor(null), false);
  assert.equal(hasPresenceColor(undefined), false);
});

test("getEnergyColorLine returns null for a missing/blank color -- never a placeholder", () => {
  assert.equal(getEnergyColorLine(null), null);
  assert.equal(getEnergyColorLine(undefined), null);
  assert.equal(getEnergyColorLine(""), null);
  assert.equal(getEnergyColorLine("   "), null);
});

test("getEnergyColorLine echoes the exact saved color, trimmed, inside the fixed dynamic sentence", () => {
  const line = getEnergyColorLine("  סגול  ");
  assert.equal(line, "שים לב כיצד האנרגיה בצבע סגול מתפשטת בגופך ומחזירה אותך לנוכחות.");
  assert.ok(!line!.includes("  סגול  "), "the raw untrimmed color text must never leak through");
});

test("getEnergyColorLine never invents a color meaning -- the trainee's own text is echoed verbatim, never interpreted", () => {
  const line = getEnergyColorLine("כתום שקוף חצי-שקוף");
  assert.match(line!, /כתום שקוף חצי-שקוף/);
});

test("getEnergyColorLine never renders undefined/null/[object Object], for a variety of saved colors", () => {
  for (const color of ["סגול", "כחול בהיר", "  ירוק  "]) {
    const line = getEnergyColorLine(color);
    assert.ok(line, color);
    assert.ok(!line!.includes("undefined"), color);
    assert.ok(!line!.includes("null"), color);
    assert.ok(!line!.includes("[object Object]"), color);
    assert.ok(line!.trim().length > 0, color);
  }
});

test("getEnergyColorLine is a pure function of the color alone -- same color always produces the exact same line, regardless of caller/stage", () => {
  assert.equal(getEnergyColorLine("אדום"), getEnergyColorLine("אדום"));
});
