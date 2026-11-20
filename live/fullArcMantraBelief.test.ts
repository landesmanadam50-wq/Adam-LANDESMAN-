import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/fullArcMantraBelief.test.ts
 *
 * ARC-system upgrade task, Part F step 7 items 4-5 (historical):
 * Full ARC's own encoding step gained the same optional, free-text
 * mantra/belief sub-step Mini ARC's own "mini_encoding" step already
 * has.
 *
 * Final ARC Flow & Body Animation task (requirement 5/6, historical):
 * Full ARC's encoding mantra became the ONE auto-COMPUTED mantra
 * (resolveEncodingMantra, arc/newArcLiveCopy.ts), shown inside the one
 * body+mantra circle, and persisted automatically (via the
 * pre-existing setMiniEncoding setter, never a new one) the moment the
 * trainee taps the circle to continue. Mini ARC's own
 * "mini_encoding" step kept its free-text mantra/belief sub-step at
 * that point -- the two tracks were deliberately "preserved as
 * distinct."
 *
 * Unified ARC & Productivity Update task (current, requirement 4,
 * "REMOVE ACTIVE BELIEF-BUILDING SCREENS"): Mini ARC's own free-text
 * mantra/belief inputs are now ALSO gone -- "remove the need for
 * users to write their own belief or action mantra" applies to "Full,
 * Shortened, AND Mini ARC" alike. mini_encoding now persists the SAME
 * auto-computed resolveEncodingMantra, preserving (never inventing)
 * any legacy miniBeliefText already on the session. The two tracks
 * stay structurally distinct (still two separate step ids/cases, Full
 * ARC still via ArcBodyMantraCircle, Mini ARC still a plain text
 * screen) -- only the free-text AUTHORING is gone from both.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");

test("Full ARC's 'encoding' case no longer branches on subIndex === 4 for free-typed mantra/belief inputs -- that sub-step is gone, replaced entirely by the auto-computed mantra", () => {
  const caseIndex = screen.indexOf('case "encoding":');
  assert.ok(caseIndex !== -1);
  const nextCaseIndex = screen.indexOf("case ", caseIndex + 20);
  const caseBody = screen.slice(caseIndex, nextCaseIndex);
  assert.ok(!caseBody.includes("if (session!.subIndex === 4)"), "the old free-text mantra/belief sub-step must be gone");
  assert.ok(!caseBody.includes('placeholder="מנטרה אישית'), "no free-text mantra input belongs on Full ARC's own encoding case any more");
});

test("Full ARC's 'encoding' case renders ArcBodyMantraCircle and persists the auto-computed mantra via the EXISTING setMiniEncoding setter on tap -- never a new, competing persistence path", () => {
  const caseIndex = screen.indexOf('case "encoding":');
  const nextCaseIndex = screen.indexOf("case ", caseIndex + 20);
  const caseBody = screen.slice(caseIndex, nextCaseIndex);
  assert.ok(caseBody.includes("<ArcBodyMantraCircle"));
  assert.ok(caseBody.includes('stage="encoding"'));
  assert.ok(caseBody.includes("setMiniEncoding(session!, resolveEncodingMantra(session!), session!.miniBeliefText ?? \"\", now)"));
});

test("Unified ARC & Productivity Update task, requirement 4: Mini ARC's own 'mini_encoding' case still exists as its own distinct step, but its free-text mantra/belief inputs are gone -- it now persists the SAME auto-computed resolveEncodingMantra Full ARC's own encoding step uses, preserving (never inventing) any legacy miniBeliefText already on the session", () => {
  const caseIndex = screen.indexOf('case "mini_encoding":');
  assert.ok(caseIndex !== -1, "mini_encoding must still exist as its own distinct case");
  const caseBody = screen.slice(caseIndex, caseIndex + 600);
  assert.ok(!caseBody.includes('placeholder="מנטרה אישית'), "the free-text mantra input is gone");
  assert.ok(!caseBody.includes('placeholder="אמונה לתרגול'), "the free-text belief input is gone");
  assert.ok(caseBody.includes('setMiniEncoding(session!, resolveEncodingMantra(session!), session!.miniBeliefText ?? "", now)'));
});
