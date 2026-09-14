import test from "node:test";
import assert from "node:assert/strict";

import {
  formatFutureArcLinkSequence,
  getFirstFutureArcLinkStage,
  getNextFutureArcLinkStage,
  resolveFutureArcLinkContent,
  resolveFutureArcLinkTriggerTextFromLegacy,
} from "./futureArcLink.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import type { ArcBuildProfile } from "./types.ts";
import type { ArcLink, RoutineTrigger } from "./routineLinks.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return { ...createEmptyArcBuildProfile(), ...overrides };
}

test("resolveFutureArcLinkContent returns null when there is no resolvable action -- never invents one", () => {
  assert.equal(resolveFutureArcLinkContent(profile(), "state"), null);
  assert.equal(resolveFutureArcLinkContent(profile(), "identity"), null);
  assert.equal(resolveFutureArcLinkContent(profile(), "habit"), null);
});

test("state target: 7-cue sequence, real action always present, trigger override used when given", () => {
  const p = profile({
    beneficialAction: "לצאת להליכה",
    stateEncoding: { target: "רוגע", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים רפויות", mantra: null },
    regulationTool: "נשימה עמוקה",
  });
  const content = resolveFutureArcLinkContent(p, "state", "מגיע הביתה אחרי יום עבודה");
  assert.ok(content);
  assert.equal(content!.actionLabel, "לצאת להליכה");
  assert.equal(content!.triggerCueText, "מגיע הביתה אחרי יום עבודה");
  assert.equal(content!.cues.length, 7);
  assert.equal(content!.cues[0].id, "trigger");
  assert.equal(content!.cues[content!.cues.length - 2].id, "action");
  assert.ok(content!.cues[content!.cues.length - 2].text.includes("לצאת להליכה"), "the real action must appear in the sequence");
  assert.equal(content!.cues[content!.cues.length - 1].id, "result");
});

test("state target falls back to a generic trigger and generic regulation/encoding labels when unconfigured", () => {
  const p = profile({ beneficialAction: "לצאת להליכה" });
  const content = resolveFutureArcLinkContent(p, "state");
  assert.ok(content);
  assert.ok(content!.triggerCueText.length > 0);
  const regulationCue = content!.cues.find((c) => c.id === "regulation")!;
  const encodingCue = content!.cues.find((c) => c.id === "encoding")!;
  assert.equal(regulationCue.text, "נושם ומווסת");
  assert.equal(encodingCue.text, "מקודד את המצב הרצוי");
});

test("identity target: 6-cue sequence including identity and body-language cues, real action always present", () => {
  const p = profile({
    desiredIdentity: "אדם ממושמע",
    identityAction: "ללמוד 20 דקות",
    identityEncoding: { target: "אדם ממושמע", bodySensationCue: null, breathCue: null, bodyLanguageCue: "עמידה זקופה", mantra: null },
  });
  const content = resolveFutureArcLinkContent(p, "identity");
  assert.ok(content);
  assert.equal(content!.cues.length, 6);
  assert.ok(content!.cues.some((c) => c.id === "identity" && c.text.includes("אדם ממושמע")));
  assert.ok(content!.cues.some((c) => c.id === "body_language" && c.text.includes("עמידה זקופה")));
  assert.ok(content!.cues.some((c) => c.id === "action" && c.text.includes("ללמוד 20 דקות")));
});

test("habit target: shorter 4-cue sequence, real action always present", () => {
  const p = profile({ beneficialAction: "לשתות מים" });
  const content = resolveFutureArcLinkContent(p, "habit");
  assert.ok(content);
  assert.equal(content!.cues.length, 4);
  assert.ok(content!.cues.some((c) => c.id === "action" && c.text.includes("לשתות מים")));
});

test("formatFutureArcLinkSequence joins cues with the spec's own arrow", () => {
  const p = profile({ beneficialAction: "לשתות מים" });
  const content = resolveFutureArcLinkContent(p, "habit")!;
  const formatted = formatFutureArcLinkSequence(content);
  assert.ok(formatted.includes(" → "));
  assert.equal(formatted.split(" → ").length, 4);
});

test("standalone practice stage order is fixed and linear, always starting at gratitude_past and ending at transition", () => {
  assert.equal(getFirstFutureArcLinkStage(), "gratitude_past");
  let stage = getFirstFutureArcLinkStage();
  const seen = [stage];
  for (let i = 0; i < 20; i++) {
    const next = getNextFutureArcLinkStage(stage);
    if (next === null) break;
    seen.push(next);
    stage = next;
  }
  assert.deepEqual(seen, [
    "gratitude_past",
    "memory_cue",
    "replay",
    "improvement_reminder",
    "improved_imagery",
    "trigger_activation",
    "cue_sequence",
    "begin_action_imagery",
    "result_imagery",
    "future_gratitude",
    "transition",
  ]);
  assert.equal(getNextFutureArcLinkStage("transition"), null);
});

function link(overrides: Partial<ArcLink> = {}): ArcLink {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "link-1",
    protocolId: "build-1",
    protocolType: "arc",
    weeklyActionId: "wa-1",
    triggerId: "trigger-1",
    mode: "without_archi",
    practiceDays: [],
    practiceTime: null,
    weeklyTarget: null,
    completedPracticeDates: [],
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function trigger(overrides: Partial<RoutineTrigger> = {}): RoutineTrigger {
  return { id: "trigger-1", type: "time", text: "", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

test("resolveFutureArcLinkTriggerTextFromLegacy recovers usable text from an old saved record's trigger, never invents one", () => {
  assert.equal(resolveFutureArcLinkTriggerTextFromLegacy(null, null), null);
  assert.equal(resolveFutureArcLinkTriggerTextFromLegacy(link(), trigger({ text: "" })), null);
  assert.equal(resolveFutureArcLinkTriggerTextFromLegacy(link({ kind: "bridging" }), trigger({ text: "מגיע הביתה" })), "מגיע הביתה");
});
