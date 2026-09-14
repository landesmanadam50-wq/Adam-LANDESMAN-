import test from "node:test";
import assert from "node:assert/strict";

import { resolveFullPresenceAvailability } from "./combinedPresenceLink.ts";
import type { PresenceArc } from "./types.ts";

function presenceArc(id: string, name: string): PresenceArc {
  return {
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: null,
    presenceDwellSeconds: null,
    beneficialAction: null,
    postActionImageryDwellSeconds: null,
    gratitudePrompt: null,
  };
}

test("resolveFullPresenceAvailability: presenceEnabled false resolves not_requested", () => {
  const result = resolveFullPresenceAvailability(false, null, []);
  assert.deepEqual(result, { kind: "not_requested" });
});

test("resolveFullPresenceAvailability: presenceEnabled false resolves not_requested regardless of a stale linked id", () => {
  const result = resolveFullPresenceAvailability(false, "presence-1", [presenceArc("presence-1", "פרוטוקול א")]);
  assert.deepEqual(result, { kind: "not_requested" });
});

test("resolveFullPresenceAvailability: presenceEnabled true and linkedPresenceArcId null resolves not_linked", () => {
  const result = resolveFullPresenceAvailability(true, null, [presenceArc("presence-1", "פרוטוקול א")]);
  assert.deepEqual(result, { kind: "not_linked" });
});

test("resolveFullPresenceAvailability: a linked id that does not resolve to any saved PresenceArc resolves linked_not_found", () => {
  const result = resolveFullPresenceAvailability(true, "missing-id", [presenceArc("presence-1", "פרוטוקול א")]);
  assert.deepEqual(result, { kind: "linked_not_found", linkedPresenceArcId: "missing-id" });
});

test("resolveFullPresenceAvailability: an exact id match resolves available with that PresenceArc", () => {
  const target = presenceArc("presence-2", "פרוטוקול ב");
  const result = resolveFullPresenceAvailability(true, "presence-2", [presenceArc("presence-1", "פרוטוקול א"), target]);
  assert.deepEqual(result, { kind: "available", presenceArc: target });
});

test("resolveFullPresenceAvailability never falls back to the first PresenceArc when the linked id isn't first in the list", () => {
  const first = presenceArc("presence-1", "פרוטוקול א");
  const target = presenceArc("presence-3", "פרוטוקול ג");
  const result = resolveFullPresenceAvailability(true, "presence-3", [first, presenceArc("presence-2", "פרוטוקול ב"), target]);
  assert.equal(result.kind, "available");
  assert.equal((result as { presenceArc: PresenceArc }).presenceArc.id, "presence-3", "resolves the exact linked record, never silently the first one in the list");
});

test("resolveFullPresenceAvailability never matches by name -- only the exact stable id counts", () => {
  const arcs = [presenceArc("presence-1", "פרוטוקול נוכחות")];
  const result = resolveFullPresenceAvailability(true, "some-other-id-with-the-same-name", arcs);
  assert.deepEqual(result, { kind: "linked_not_found", linkedPresenceArcId: "some-other-id-with-the-same-name" }, "a name collision must never resolve as available");
});

test("resolveFullPresenceAvailability never mutates the presenceArcs list it was given", () => {
  const arcs = [presenceArc("presence-1", "פרוטוקול א")];
  const arcsCopy = JSON.parse(JSON.stringify(arcs));
  resolveFullPresenceAvailability(true, "presence-1", arcs);
  assert.deepEqual(arcs, arcsCopy);
});
