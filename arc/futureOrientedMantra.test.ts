import test from "node:test";
import assert from "node:assert/strict";

import { getFutureOrientedMantraLine } from "./futureOrientedMantra.ts";

test("getFutureOrientedMantraLine echoes the state layer's own saved text verbatim, inside the fixed frame", () => {
  const line = getFutureOrientedMantraLine({ stateFutureOrientedMantra: "אני אתחיל היום בצעד קטן." }, "state");
  assert.equal(line, 'הכיוון שאליו אתה מתקדם עכשיו: "אני אתחיל היום בצעד קטן.".');
});

test("getFutureOrientedMantraLine echoes the identity layer's own saved text, never the state layer's", () => {
  const line = getFutureOrientedMantraLine(
    { stateFutureOrientedMantra: "מנטרת מצב", identityFutureOrientedMantra: "מנטרת זהות" },
    "identity"
  );
  assert.match(line!, /מנטרת זהות/);
  assert.ok(!line!.includes("מנטרת מצב"));
});

test("getFutureOrientedMantraLine returns null for the habit layer -- no future-oriented-mantra field of its own", () => {
  assert.equal(getFutureOrientedMantraLine({ stateFutureOrientedMantra: "x", identityFutureOrientedMantra: "y" }, "habit"), null);
});

test("getFutureOrientedMantraLine returns null (never invents/crashes) for a missing, blank, or malformed field", () => {
  assert.equal(getFutureOrientedMantraLine({}, "state"), null);
  assert.equal(getFutureOrientedMantraLine({ stateFutureOrientedMantra: null }, "state"), null);
  assert.equal(getFutureOrientedMantraLine({ stateFutureOrientedMantra: "   " }, "state"), null);
  assert.equal(getFutureOrientedMantraLine({ stateFutureOrientedMantra: undefined }, "state"), null);
});

test("getFutureOrientedMantraLine trims surrounding whitespace before echoing", () => {
  const line = getFutureOrientedMantraLine({ identityFutureOrientedMantra: "  אני יכול להתקדם עכשיו לעבר רוגע.  " }, "identity");
  assert.equal(line, 'הכיוון שאליו אתה מתקדם עכשיו: "אני יכול להתקדם עכשיו לעבר רוגע.".');
});
