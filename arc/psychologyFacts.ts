/**
 * arc/psychologyFacts.ts
 *
 * Psychology/Smiling/Positive-Reinforcement task, feature 1: one brief,
 * scientifically-sourced psychology fact shown on every app launch,
 * related to the principles ARC itself draws on (awareness, acceptance,
 * regulation, present-moment attention, neuroplasticity, habit
 * formation, positive reinforcement, identity change).
 *
 * Every fact's `reference` names a real, independently checkable
 * publication -- never invented. Every fact's `arcConnection` only ever
 * says "this is related to such-and-such part of ARC" -- it NEVER
 * claims the fact itself proves, or was used to validate, the
 * effectiveness of the full ARC method. That distinction is
 * deliberate and must be preserved if this list is ever edited: the
 * cited research is real and about the general psychological
 * principle, not about ARC.
 */

import { resolveNextRotationIndex } from "./contentRotation.ts";

export type PsychologyFactCategory =
  | "awareness_attention"
  | "emotional_acceptance"
  | "emotional_regulation"
  | "present_moment"
  | "neuroplasticity_learning"
  | "habit_formation"
  | "positive_reinforcement"
  | "identity_change";

export interface PsychologyFact {
  id: string;
  category: PsychologyFactCategory;
  /** Brief, understandable, in Hebrew. */
  text: string;
  /** A real, checkable reference (author, year, publication) -- never invented. */
  reference: string;
  /** How this relates to one of ARC's own stages -- a connection, never a claim that this research itself studied or proved ARC's effectiveness. */
  arcConnection: string;
}

export const PSYCHOLOGY_FACTS: PsychologyFact[] = [
  {
    id: "awareness_1",
    category: "awareness_attention",
    text: "לתת שם מדויק לרגש (למשל \"אני מרגיש תסכול\") מפחית את התגובתיות של האמיגדלה, האזור במוח שמייצר תחושת מצוקה.",
    reference: "Lieberman et al. (2007), \"Putting Feelings Into Words\", Psychological Science",
    arcConnection: "זה בדיוק מה שקורה בשלב המודעות של ARC, שבו מזהים ומנסחים את הרגש במילים לפני כל שלב אחר.",
  },
  {
    id: "awareness_2",
    category: "awareness_attention",
    text: "תשומת הלב ניתנת לאימון: מחקרים הראו שינוי בצפיפות החומר האפור באזורי מוח הקשורים לקשב אצל אנשים שתרגלו תשומת לב רגילה (mindfulness) במשך זמן.",
    reference: "Hölzel et al. (2011), Psychiatry Research: Neuroimaging",
    arcConnection: "זה קשור לשלב הנוכחות ב-ARC, שמתרגל להפנות ולהחזיק קשב בכוונה, שוב ושוב.",
  },
  {
    id: "awareness_3",
    category: "awareness_attention",
    text: "אימון קשיבות (mindfulness) קצר שיפר יכולת ריכוז וזיכרון עבודה, בין היתר על ידי הפחתת נדידת המחשבה בזמן ביצוע משימה.",
    reference: "Mrazek et al. (2013), \"Mindfulness Training Improves Working Memory Capacity and GRE Performance While Reducing Mind Wandering\", Psychological Science",
    arcConnection: "זה קשור לשלב המודעות ב-ARC, שמתרגל להחזיר את הקשב למשימה בכל פעם שהוא נודד.",
  },
  {
    id: "awareness_4",
    category: "awareness_attention",
    text: "מעבר תכוף בין משימות (ריבוי משימות) גובה \"עלות מעבר\" קוגניטיבית -- פגיעה במהירות ובדיוק הביצוע, בהשוואה למיקוד במשימה אחת.",
    reference: "Rubinstein, Meyer & Evans (2001), \"Executive Control of Cognitive Processes in Task Switching\", Journal of Experimental Psychology: Human Perception and Performance",
    arcConnection: "זה קרוב לעקרון שמאחורי ARC של התמקדות מלאה בדבר אחד בזמן נתון, ולא בכמה דברים במקביל.",
  },
  {
    id: "emotional_acceptance_1",
    category: "emotional_acceptance",
    text: "הימנעות מתנסותית -- הניסיון המתמשך לא להרגיש או לא לחשוב על דברים לא נעימים -- מתואמת עם תוצאות פסיכולוגיות גרועות יותר בטווח הארוך.",
    reference: "Hayes et al. (1996), Journal of Consulting and Clinical Psychology",
    arcConnection: "זה הבסיס לשלב הקבלה ב-ARC: לאפשר לתחושה או למחשבה להתקיים בלי להילחם בה, במקום להימנע ממנה.",
  },
  {
    id: "emotional_acceptance_2",
    category: "emotional_acceptance",
    text: "ניסיון מודע לדכא תגובה רגשית דווקא מגביר פעילות של מערכת העצבים הסימפתטית (העוררות הפיזיולוגית), בניגוד לאפקט המרגיע שמחפשים.",
    reference: "Gross & Levenson (1997), Journal of Personality and Social Psychology",
    arcConnection: "זו הסיבה שב-ARC לא מבקשים להעלים תחושה לא נעימה, אלא ללמוד להכיל אותה.",
  },
  {
    id: "emotional_acceptance_3",
    category: "emotional_acceptance",
    text: "גמישות פסיכולוגית -- היכולת להיות נוכח עם תחושות לא נעימות מבלי להילחם בהן, ועדיין לפעול לפי ערכים -- נמצאה מתואמת עם רווחה נפשית טובה יותר.",
    reference: "Hayes, Luoma, Bond, Masuda & Lillis (2006), \"Acceptance and Commitment Therapy: Model, Processes and Outcomes\", Behaviour Research and Therapy",
    arcConnection: "זה מתאר את הרעיון שבבסיס שלב הקבלה ב-ARC: לא להילחם בתחושה, אלא לפעול לצידה.",
  },
  {
    id: "emotional_acceptance_4",
    category: "emotional_acceptance",
    text: "במהלך חשיפה לפחד, ניסוח התחושה במילים (\"אני מרגיש חרדה\") במקום הדחקתה או הסחת דעת ממנה, נמצא קשור להפחתה גדולה יותר בתגובת הפחד בהמשך.",
    reference: "Kircanski, Lieberman & Craske (2012), \"Feelings Into Words\", Psychological Science",
    arcConnection: "זה קשור לשלב הקבלה וניסוח התחושה ב-ARC, לפני שעוברים לשלבים הבאים.",
  },
  {
    id: "emotional_regulation_1",
    category: "emotional_regulation",
    text: "פרשנות מחדש (reappraisal) -- לבחור לראות מצב מזווית אחרת -- מפחיתה רגש שלילי ומתואמת עם רווחה נפשית טובה יותר, לעומת הדחקה.",
    reference: "Gross & John (2003), Journal of Personality and Social Psychology",
    arcConnection: "זה קשור לשלב הפרשנות ב-ARC, שמבחין בין המציאות לבין הפרשנות שאנחנו נותנים לה.",
  },
  {
    id: "emotional_regulation_2",
    category: "emotional_regulation",
    text: "ויסות רגשי מוצלח כולל הפעלה של אזורים בקליפת המוח הקדם-מצחית שמרסנים את פעילות האמיגדלה.",
    reference: "Ochsner & Gross (2005), Trends in Cognitive Sciences",
    arcConnection: "זה קרוב למה שקורה בשלב הוויסות ב-ARC, שמגיע אחרי הקבלה ומכוון את הקשב לכיוון תומך.",
  },
  {
    id: "emotional_regulation_3",
    category: "emotional_regulation",
    text: "ניתוח מאוחד (מטא-אנליזה) של עשרות מחקרי הדמיה מוחית מצא שפרשנות מחדש של מצב מפעילה אזורים בקליפת המוח הקדם-מצחית שמפחיתים פעילות של האמיגדלה.",
    reference: "Buhle et al. (2014), \"Cognitive Reappraisal of Emotion: A Meta-Analysis of Human Neuroimaging Studies\", Cerebral Cortex",
    arcConnection: "זה מחזק את הבסיס המדעי לשלב הפרשנות ב-ARC כאסטרטגיית ויסות רגשי.",
  },
  {
    id: "emotional_regulation_4",
    category: "emotional_regulation",
    text: "כתיבה מודעת וחופשית על חוויה רגשית, במשך מספר ימים קצר, נמצאה קשורה לשיפור במצב הרוח ובבריאות הפיזית בהשוואה לכתיבה על נושא נייטרלי.",
    reference: "Pennebaker (1997), \"Writing About Emotional Experiences as a Therapeutic Process\", Psychological Science",
    arcConnection: "זה קרוב לרעיון של ניסוח מודע של מחשבה או אמונה הקיים בחלקים מסוימים של ARC.",
  },
  {
    id: "present_moment_1",
    category: "present_moment",
    text: "מחקר גדול שעקב אחרי אלפי אנשים מצא שנדידת המחשבה (מחשבה על משהו שאינו ההווה) מתואמת עם רמת אושר נמוכה יותר, ברוב סוגי הפעילויות.",
    reference: "Killingsworth & Gilbert (2010), \"A Wandering Mind Is an Unhappy Mind\", Science",
    arcConnection: "זה קשור לשלב הנוכחות ב-ARC, שמחזיר את הקשב לכאן ועכשיו -- לנשימה, לחוש, לסביבה.",
  },
  {
    id: "present_moment_2",
    category: "present_moment",
    text: "אימון קשב ממוקד הווה שיפר יכולת שמירה על ריכוז ממושך, גם בתקופות עומס.",
    reference: "Jha et al. (2007), Cognitive, Affective, & Behavioral Neuroscience",
    arcConnection: "זה קרוב לתרגול הרחבת שדה הראייה והאזנה לסביבה שקיים בשלב הנוכחות של ARC.",
  },
  {
    id: "present_moment_3",
    category: "present_moment",
    text: "אפילו תרגול קשיבות קצר, של כמה ימים בלבד, שיפר ביצועי קשב והפחית עייפות ודאגה בהשוואה לקבוצת בקרה.",
    reference: "Zeidan et al. (2010), \"Mindfulness Meditation Improves Cognition\", Consciousness and Cognition",
    arcConnection: "זה קשור לרעיון שגם תרגול נוכחות קצר, לא רק ממושך, יכול לתרום לתחושת ריכוז והווה.",
  },
  {
    id: "present_moment_4",
    category: "present_moment",
    text: "תוכנית מבוססת-קשיבות להפחתת הישנות דיכאון נמצאה מפחיתה באופן משמעותי את שיעור ההישנות אצל אנשים עם היסטוריה של דיכאון חזרתי.",
    reference: "Teasdale et al. (2000), \"Prevention of Relapse/Recurrence in Major Depression by Mindfulness-Based Cognitive Therapy\", Journal of Consulting and Clinical Psychology",
    arcConnection: "זה קשור לשימוש בנוכחות ובקשיבות כחלק מהתמודדות מתמשכת עם דפוסים רגשיים חזרתיים, כמו ב-ARC.",
  },
  {
    id: "neuroplasticity_1",
    category: "neuroplasticity_learning",
    text: "המוח ממשיך להשתנה פיזית במהלך כל החיים כתוצאה מתרגול חדש וחזרתי -- תופעה שנקראת נוירופלסטיות.",
    reference: "Draganski et al. (2004), Nature",
    arcConnection: "זה הבסיס המדעי לכך שתרגול חזרתי, כמו תרגול ARC שוב ושוב, יכול בהדרגה להקל על תגובות אוטומטיות מסוימות.",
  },
  {
    id: "neuroplasticity_2",
    category: "neuroplasticity_learning",
    text: "העיקרון המוכר \"תאי עצב שמופעלים יחד, מתחברים יחד\" מתאר איך חזרה על דפוס מחשבה או תגובה מחזקת את החיבורים העצביים שמייצרים אותו.",
    reference: "Hebb (1949), The Organization of Behavior",
    arcConnection: "זה מסביר מדוע חזרה עקבית על שלבי ARC, ולא פעם אחת בלבד, היא חלק מהגיון השיטה.",
  },
  {
    id: "neuroplasticity_3",
    category: "neuroplasticity_learning",
    text: "חזרה מרווחת בזמן (ולא ריכוז כל התרגול בבת אחת) נמצאה יעילה יותר באופן עקבי לשימור למידה וזיכרון לאורך זמן.",
    reference: "Cepeda et al. (2006), \"Distributed Practice in Verbal Recall Tasks\", Psychological Bulletin",
    arcConnection: "זה מסביר מדוע תרגול ARC חזור ונשנה, מפוזר על פני זמן, תומך בלמידה יותר מתרגול מרוכז חד-פעמי.",
  },
  {
    id: "neuroplasticity_4",
    category: "neuroplasticity_learning",
    text: "מחקר על נהגי מוניות מצא שינוי מבני במוח (בהיפוקמפוס) שמתואם עם שנות ניסיון בניווט מרחבי מורכב -- עוד הוכחה לכך שתרגול חזרתי משנה את מבנה המוח בפועל.",
    reference: "Maguire et al. (2000), \"Navigation-Related Structural Change in the Hippocampi of Taxi Drivers\", PNAS",
    arcConnection: "זה קשור לאותו רעיון של נוירופלסטיות שעומד בבסיס ההיגיון לתרגול חזרתי של ARC.",
  },
  {
    id: "habit_formation_1",
    category: "habit_formation",
    text: "הפיכת פעולה להרגל אוטומטי דורשת חזרה עקבית על אותו הקשר-התנהגות, ולוקחת זמן שמשתנה מאוד בין אדם לאדם -- ולא תמיד 21 יום כפי שמקובל לחשוב.",
    reference: "Lally et al. (2010), European Journal of Social Psychology",
    arcConnection: "זה קשור לשלב הפעולה ב-ARC ולחשיבות של חזרה עקבית על אותה פעולה קטנה, שוב ושוב.",
  },
  {
    id: "habit_formation_2",
    category: "habit_formation",
    text: "תכנון מפורש של \"אם קורה X, אז אני עושה Y\" (כוונת יישום) מעלה משמעותית את הסיכוי לעמוד בכוונה בהשוואה למטרה כללית בלבד.",
    reference: "Gollwitzer (1999), American Psychologist",
    arcConnection: "זה קרוב לבחירת הפעולה הראשונה המוגדרת בכל משימה ב-ARCHI.",
  },
  {
    id: "habit_formation_3",
    category: "habit_formation",
    text: "הרגלים מתחזקים כשההקשר הסביבתי (מקום, זמן, רצף פעולות) נשאר עקבי -- לא רק כשחוזרים על הפעולה עצמה.",
    reference: "Wood & Neal (2007), \"A New Look at Habits and the Habit-Goal Interface\", Psychological Review",
    arcConnection: "זה קשור לחשיבות של תזמון וקשר קבוע למשימות ב-ARCHI, ולא רק לביצוע הפעולה בפני עצמה.",
  },
  {
    id: "habit_formation_4",
    category: "habit_formation",
    text: "תגמול קטן וסמוך בזמן משפיע על התנהגות חזרתית בצורה חזקה יותר מתגמול גדול אך מרוחק -- תופעה המכונה היוון-דחייה (delay discounting).",
    reference: "Ainslie (1975), \"Specious Reward: A Behavioral Theory of Impulsiveness and Impulse Control\", Psychological Bulletin",
    arcConnection: "זה ההיגיון שמאחורי חיזוק מיידי וקטן, כמו תרגיל חיוך, מיד בסיום משימה ולא תגמול מרוחק.",
  },
  {
    id: "positive_reinforcement_1",
    category: "positive_reinforcement",
    text: "התנהגות שבאה בעקבותיה תגמול חיובי נוטה להישנות בתדירות גבוהה יותר -- עיקרון הבסיס של חיזוק חיובי.",
    reference: "Skinner (1953), Science and Human Behavior",
    arcConnection: "זה ההיגיון שמאחורי החיזוקים החיוביים הקטנים (כמו תרגיל חיוך) שמוצעים לאחר השלמת משימה באפליקציה.",
  },
  {
    id: "positive_reinforcement_2",
    category: "positive_reinforcement",
    text: "חיזוק חיובי עקבי נמצא יעיל יותר לשינוי התנהגות ארוך-טווח מענישה, שעלולה לדכא התנהגות באופן זמני בלבד מבלי לבנות דפוס חדש.",
    reference: "Azrin & Holz (1966), in Operant Behavior: Areas of Research and Application",
    arcConnection: "זו הסיבה שהאפליקציה בוחרת לחגוג השלמת משימה, ולא להתמקד בכישלון לדחות אותה.",
  },
  {
    id: "positive_reinforcement_3",
    category: "positive_reinforcement",
    text: "לוחות זמנים משתנים של חיזוק (תגמול לא צפוי, לא בכל פעם) מייצרים התנהגות עמידה יותר בפני הפסקה, בהשוואה לחיזוק קבוע בכל פעם.",
    reference: "Ferster & Skinner (1957), Schedules of Reinforcement",
    arcConnection: "זה רלוונטי לעיצוב מערכת החיזוקים באפליקציה כך שתשמור על עניין ועמידות לאורך זמן.",
  },
  {
    id: "positive_reinforcement_4",
    category: "positive_reinforcement",
    text: "רגשות חיוביים מרחיבים את טווח החשיבה והפעולה הזמין לאדם, ותורמים בהדרגה לבניית משאבים נפשיים וחברתיים יציבים יותר.",
    reference: "Fredrickson (2001), \"The Role of Positive Emotions in Positive Psychology\", American Psychologist",
    arcConnection: "זה קשור לרציונל של שילוב חיוך ודימיון חיובי לאחר משימה, כחלק מתהליך מתמשך ולא כפרס חד-פעמי.",
  },
  {
    id: "identity_change_1",
    category: "identity_change",
    text: "אנשים גוזרים מסקנות על עצמם, חלקית, מתוך ההתנהגות שלהם בעצמה -- לא רק מתוך מה שהם חושבים שהם מרגישים.",
    reference: "Bem (1972), Self-Perception Theory, Advances in Experimental Social Psychology",
    arcConnection: "זה קשור לרעיון שפעולה חזרתית בכיוון רצוי, כמו ב-ARC, יכולה בהדרגה לעצב איך אדם תופס את זהותו.",
  },
  {
    id: "identity_change_2",
    category: "identity_change",
    text: "ניסוח מטרות במונחי זהות (\"אני מישהו שמתמיד\") מתואם עם שימור התנהגות טוב יותר בהשוואה לניסוח מטרות לפי תוצאה בלבד.",
    reference: "Oyserman (2007), Journal of Consumer Psychology",
    arcConnection: "זה קשור לשלב הזהות והאמונה ב-ARC, שבו מנסחים תובנה ואמונה מחזקת מתוך הפעולה שבוצעה.",
  },
  {
    id: "identity_change_3",
    category: "identity_change",
    text: "חיזוק עצמי (self-affirmation) -- הזכרת ערכים או הצלחות אישיות -- נמצא מפחית הגנתיות ומגדיל פתיחות לשינוי התנהגותי.",
    reference: "Cohen & Sherman (2014), \"The Psychology of Change: Self-Affirmation and Social Psychological Intervention\", Annual Review of Psychology",
    arcConnection: "זה קשור לרעיון של תובנה ואמונה מחזקת שנוצרת לאחר שלב הפעולה ב-ARC.",
  },
  {
    id: "identity_change_4",
    category: "identity_change",
    text: "תחושת מסוגלות עצמית (self-efficacy) -- אמונה ביכולת שלך להצליח במשימה -- נבנית בהדרגה מהצלחות קטנות וחזרתיות, ומנבאת התמדה עתידית.",
    reference: "Bandura (1977), \"Self-Efficacy: Toward a Unifying Theory of Behavioral Change\", Psychological Review",
    arcConnection: "זה קשור לכך שכל משימה שמושלמת ב-ARCHI, גם קטנה, יכולה בהדרגה לתרום לתחושת מסוגלות.",
  },
];

/** Index to show next, given the index shown last time (null before the very first launch) -- see arc/contentRotation.ts for the shared rotation rule. */
export function resolveNextPsychologyFactIndex(lastIndex: number | null): number {
  return resolveNextRotationIndex(lastIndex, PSYCHOLOGY_FACTS.length);
}
