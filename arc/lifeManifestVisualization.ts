/**
 * arc/lifeManifestVisualization.ts
 *
 * Life Manifest visualization task: the guided Major-Goal visualization
 * (and its shortened Sub-goal variant) -- Observer Perspective ->
 * Successful Body Language -> Associated First-Person Imagery ->
 * optional Achieved-State Mantra -> explicit Return to the Present ->
 * optional Gratitude -> Future Process Imagery -> Select the Next
 * Action. Deliberately NOT built on arc/arcEngine.ts's ArcStage/
 * ArcLiveState or any of the full engine's routing/dwell/timer
 * machinery -- mirrors arc/miniArc.ts's own pattern exactly: a small,
 * self-contained, mostly-linear sequence with its own stage type, its
 * own next-stage function, and its own pure copy function.
 *
 * ONE stage order serves both the full Major Goal run (subGoal: null)
 * and the shortened Sub-goal run (subGoal set) -- only the COPY differs
 * (shorter Sub-goal-scoped wording, and the shared-vs-own cue/mantra
 * resolvers from arc/lifeManifest.ts), never the shape of the sequence
 * itself. Gratitude is the one branch in an otherwise linear order --
 * session-local choice/scope, mirroring Mini ARC's own local free-text
 * state (never persisted onto MajorGoal/SubGoal).
 *
 * Never instructs the trainee to intensify, recreate, or remain in an
 * interfering state; never claims the visualization/mantra/gratitude
 * guarantees achieving the goal -- both requirements enforced by the
 * fixed copy below never referencing an interfering concept, and by
 * every "imagine already achieved" sentence being checked against
 * arc/instructions.ts's containsInductionPattern denylist (see that
 * file's own two new sanctioned continuations).
 */

import { getAchievedStateMantraLine } from "./achievedStateMantra.ts";
import { resolveAchievedStateMantraForSubGoal, resolveEmbodiedIdentityCueForSubGoal } from "./lifeManifest.ts";
import type { EmbodiedIdentityCue, MajorGoal, SubGoal } from "./lifeManifest.ts";

export type LifeManifestVisualizationStage =
  | "observer_perspective"
  | "body_language_config"
  | "first_person_imagery"
  | "achieved_state_mantra"
  | "return_to_present"
  | "gratitude_choice"
  | "gratitude_present_past"
  | "gratitude_future"
  | "future_process_imagery"
  | "select_next_action"
  | "complete";

/** Session-local only -- never persisted onto MajorGoal/SubGoal, mirrors Mini ARC's own local free-text state (live/MiniArcLiveScreen.tsx). */
export interface LifeManifestVisualizationSession {
  gratitudeChoice: "yes" | "no" | null;
  gratitudeScope: "present" | "future" | "both" | null;
}

export function createEmptyVisualizationSession(): LifeManifestVisualizationSession {
  return { gratitudeChoice: null, gratitudeScope: null };
}

/**
 * Mostly linear, with ONE branch (gratitude) -- spec sections 6/19:
 * the explicit Return to the Present line always precedes the Gratitude
 * offer (never the reverse), and skipping Gratitude goes straight to
 * Future Process Imagery. "gratitude_choice" itself stays put
 * (unanswered guard) until session.gratitudeChoice is set -- callers
 * apply the trainee's choice to the session BEFORE calling this, same
 * "apply then advance" pattern used throughout this app's own live
 * adapters.
 */
export function getNextVisualizationStage(
  stage: LifeManifestVisualizationStage,
  session: LifeManifestVisualizationSession
): LifeManifestVisualizationStage {
  switch (stage) {
    case "observer_perspective":
      return "body_language_config";
    case "body_language_config":
      return "first_person_imagery";
    case "first_person_imagery":
      return "achieved_state_mantra";
    case "achieved_state_mantra":
      return "return_to_present";
    case "return_to_present":
      return "gratitude_choice";
    case "gratitude_choice": {
      if (session.gratitudeChoice === null) return "gratitude_choice";
      if (session.gratitudeChoice === "no") return "future_process_imagery";
      return session.gratitudeScope === "future" ? "gratitude_future" : "gratitude_present_past";
    }
    case "gratitude_present_past":
      return session.gratitudeScope === "both" ? "gratitude_future" : "future_process_imagery";
    case "gratitude_future":
      return "future_process_imagery";
    case "future_process_imagery":
      return "select_next_action";
    case "select_next_action":
    case "complete":
      return "complete";
  }
}

export interface LifeManifestVisualizationStageCopy {
  title: string;
  body: string;
  /** Extra lines shown after `body` -- sensory prompts, the resolved body-language fields, etc. null when the stage has only the one body line. */
  segments: string[] | null;
  buttonLabel: string;
}

function nonEmpty(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function embodiedCueLines(cue: EmbodiedIdentityCue): string[] {
  const lines: string[] = [];
  if (nonEmpty(cue.posture)) lines.push(`תנוחה: ${cue.posture}`);
  if (nonEmpty(cue.facialExpression)) lines.push(`הבעת פנים: ${cue.facialExpression}`);
  if (nonEmpty(cue.movementQuality)) lines.push(`איכות התנועה: ${cue.movementQuality}`);
  if (nonEmpty(cue.breathingStyle)) lines.push(`סגנון נשימה: ${cue.breathingStyle}`);
  if (nonEmpty(cue.physicalAnchor)) lines.push(`עוגן פיזי: ${cue.physicalAnchor}`);
  if (nonEmpty(cue.regulationAnchor)) lines.push(`עוגן ויסות: ${cue.regulationAnchor}`);
  return lines;
}

/**
 * Pure stage -> copy mapping. `subGoal` null runs the full Major Goal
 * visualization; set, it runs the shortened Sub-goal variant (shorter
 * titles, the Sub-goal's own name in context) while resolving the same
 * shared-vs-own cue/mantra via arc/lifeManifest.ts's own resolvers.
 */
export function getVisualizationStageCopy(
  stage: LifeManifestVisualizationStage,
  majorGoal: MajorGoal,
  subGoal: SubGoal | null
): LifeManifestVisualizationStageCopy {
  const targetName = subGoal ? subGoal.title || "תת־המטרה" : majorGoal.title || "המטרה הגדולה";
  const cue = subGoal ? resolveEmbodiedIdentityCueForSubGoal(majorGoal, subGoal) : majorGoal.embodiedIdentityCue;
  const mantra = subGoal ? resolveAchievedStateMantraForSubGoal(majorGoal, subGoal) : majorGoal.achievedStateMantra;

  switch (stage) {
    case "observer_perspective":
      return {
        title: "פרספקטיבת צופה",
        body: subGoal
          ? `דמיין שתת־המטרה '${targetName}' כבר הושגה. ראה את עצמך מלפנים: איך אתה נראה? איך אתה עומד? מהי הבעת הפנים שלך? מה משדרת שפת הגוף שלך?`
          : "דמיין שהמטרה הגדולה שלך כבר הושגה. ראה את עצמך מלפנים: איך אתה נראה? איך אתה עומד? מהי הבעת הפנים שלך? מה משדרת שפת הגוף שלך?",
        segments: null,
        buttonLabel: "המשך",
      };

    case "body_language_config": {
      const lines = embodiedCueLines(cue);
      return {
        title: "שפת גוף מנצחת",
        body: lines.length > 0 ? "שפת הגוף שהגדרת לזהות הזאת:" : "לא הוגדרה שפת גוף עדיין -- אפשר להגדיר אותה מראש במסך המטרה, ואפשר גם להמשיך בלעדיה.",
        segments: lines.length > 0 ? lines : null,
        buttonLabel: "המשך",
      };
    }

    case "first_person_imagery": {
      const lines = embodiedCueLines(cue);
      return {
        title: "דימוי בגוף ראשון",
        body: "עכשיו היכנס לתוך הדמות ודמיין שאתה חווה את הרגע דרך העיניים שלך.",
        segments: [
          "מה אתה רואה?",
          "מה אתה שומע?",
          "מה אתה מרגיש בגוף?",
          "מה אתה אומר לעצמך?",
          "מי נמצא איתך?",
          "מה השתנה בחיים שלך?",
          ...(lines.length > 0 ? [`אפשר לאמץ פיזית את שפת הגוף שהגדרת: ${lines.join(", ")}.`] : []),
        ],
        buttonLabel: "המשך",
      };
    }

    case "achieved_state_mantra": {
      const line = getAchievedStateMantraLine(mantra);
      return {
        title: "משפט מצב מושג (רשות)",
        body: line ?? "לא הוגדר משפט מצב מושג -- אפשר לדלג על השלב הזה.",
        segments: null,
        buttonLabel: line ? "המשך" : "דלג והמשך",
      };
    }

    case "return_to_present":
      return {
        title: "חזרה להווה",
        body: "חזור בהדרגה להווה ולרגע שבו אתה נמצא עכשיו.",
        segments: ["שים לב שוב לנשימה, לגוף ולסביבה שלך."],
        buttonLabel: "המשך",
      };

    case "gratitude_choice":
      return {
        title: "הוקרת תודה (רשות)",
        body: "האם תרצה לעצור לרגע להוקרת תודה?",
        segments: null,
        buttonLabel: "בחר",
      };

    case "gratitude_present_past":
      return {
        title: "הוקרת תודה -- הווה ועבר",
        body: "הוקרת תודה על מה שכבר קיים ועל מה שכבר השגת בדרך.",
        segments: [
          "על מה שכבר קיים בחייך אתה מוקיר תודה?",
          "מה כבר השגת בדרך למטרה?",
          "אילו יכולות, קשרים, הזדמנויות או משאבים כבר עומדים לרשותך?",
          "איזו התקדמות שעשית ראויה להכרה?",
          "למי או למה תרצה להודות על חלקם בדרך?",
        ],
        buttonLabel: "המשך",
      };

    case "gratitude_future":
      return {
        title: "הוקרת תודה -- העתיד המדומיין",
        body: "כשאתה חושב על העתיד שדמיינת, על מה היית רוצה להביע הוקרת תודה?",
        segments: [
          "על מה היית רוצה להודות לעצמך?",
          "אילו אנשים, הזדמנויות או תהליכים עשויים לעזור לך בדרך?",
          "מה בחיים שדמיינת מעורר בך הוקרת תודה?",
          "על איזה חלק בדרך היית שמח שלא ויתרת?",
        ],
        buttonLabel: "המשך",
      };

    case "future_process_imagery":
      return {
        title: "דמיון דרך העשייה",
        body: "איך אתה רואה את עצמך מתמיד ומבצע את הפעולות שיובילו אותך למטרה?",
        segments: [
          "אילו פעולות אתה מבצע בעקביות?",
          "איך אתה מתחיל גם כשאין לך מוטיבציה מלאה?",
          "איך נראית שפת הגוף שלך בזמן העשייה?",
          "באיזו זהות אתה משתמש בזמן הפעולה?",
          "איזה מצב פנימי תומך בך?",
          "מה עוזר לך לחזור למסלול לאחר קושי או החמצה?",
          "מהי הגרסה המינימלית שאתה עדיין מסוגל לבצע?",
          "איזו פעולה ממשית תהיה הצעד הבא שלך?",
        ],
        buttonLabel: "המשך",
      };

    case "select_next_action":
      return {
        title: "בחירת הפעולה הבאה",
        body: "בחר יעד מתת־המטרה הפעילה, ופעולה או ARC Link מחוברים אליו -- או המשך ישירות ל-ARC Goal המחובר.",
        segments: null,
        buttonLabel: "סיום הדמיון",
      };

    case "complete":
      return { title: "סיום", body: "הדמיון הושלם.", segments: null, buttonLabel: "סיום" };
  }
}
