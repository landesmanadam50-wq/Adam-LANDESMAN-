import test from "node:test";
import assert from "node:assert/strict";

import { getPresenceColorActivationLine, getPresenceColorReminder, hasPresenceColor, type PresenceColorSection } from "./presenceColor.ts";

test("hasPresenceColor is true only for a real, non-blank string", () => {
  assert.equal(hasPresenceColor("סגול"), true);
  assert.equal(hasPresenceColor("  סגול  "), true);
  assert.equal(hasPresenceColor(""), false);
  assert.equal(hasPresenceColor("   "), false);
  assert.equal(hasPresenceColor(null), false);
  assert.equal(hasPresenceColor(undefined), false);
});

test("getPresenceColorActivationLine returns null for a missing/blank color -- never a placeholder", () => {
  assert.equal(getPresenceColorActivationLine(null), null);
  assert.equal(getPresenceColorActivationLine(undefined), null);
  assert.equal(getPresenceColorActivationLine(""), null);
  assert.equal(getPresenceColorActivationLine("   "), null);
});

test("getPresenceColorActivationLine echoes the exact saved color, trimmed, inside the fixed sentence frame", () => {
  const line = getPresenceColorActivationLine("  סגול  ");
  assert.match(line!, /בצבע שבחרת: סגול\./);
  assert.match(line!, /אין צורך לראות אותו בבירור/);
  assert.ok(!line!.includes("  סגול  "), "the raw untrimmed color text must never leak through");
});

test("getPresenceColorActivationLine never invents a color meaning -- the trainee's text is echoed verbatim, never interpreted", () => {
  const line = getPresenceColorActivationLine("כתום שקוף חצי-שקוף");
  assert.match(line!, /כתום שקוף חצי-שקוף/);
});

const SECTIONS: PresenceColorSection[] = [
  "awareness",
  "acceptance",
  "regulation",
  "updatedSensation",
  "encoding",
  "identity",
  "actionImagery",
  "timedAction",
  "completion",
];

test("getPresenceColorReminder returns null for every section when there's no saved color", () => {
  for (const section of SECTIONS) {
    assert.equal(getPresenceColorReminder(null, section), null, section);
    assert.equal(getPresenceColorReminder(undefined, section), null, section);
    assert.equal(getPresenceColorReminder("   ", section), null, section);
  }
});

test("getPresenceColorReminder always echoes the exact saved color for every section, and never renders undefined/null/[object Object]", () => {
  for (const section of SECTIONS) {
    const line = getPresenceColorReminder("סגול", section);
    assert.ok(line, section);
    assert.match(line!, /סגול/, section);
    assert.ok(!line!.includes("undefined"), section);
    assert.ok(!line!.includes("null"), section);
    assert.ok(!line!.includes("[object Object]"), section);
    assert.ok(line!.trim().length > 0, section);
  }
});

test("getPresenceColorReminder trims the saved color before echoing it", () => {
  const line = getPresenceColorReminder("  כחול  ", "awareness");
  assert.match(line!, /כחול/);
  assert.ok(!line!.includes("  כחול  "));
});
