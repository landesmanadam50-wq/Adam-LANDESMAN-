# ARC Engine — core (verified)

זה קוד TypeScript אמיתי, לא פסאודו-קוד — הידור עם `tsc` והרצת 10 בדיקות עברו בהצלחה.

## מה יש כאן

- `engine/types.ts` — כל הטיפוסים: `ArcProfile`, `LiveSession`, `LiveStage` (enum ל-15 השלבים), `STAGE_ORDER`
- `engine/thresholds.ts` — ספי ברירת המחדל (Presence 6, עוצמה 10-5-3), כפונקציה `getIntensityBand` שניתנת לבדיקה
- `engine/arcEngine.ts` — הלב: `shouldShowStage()` ו-`getNextStage()`, שממשים את כל טבלת הדילוגים מה-roadmap
- `engine/reinforcement.ts` — יצירת טקסט חיזוק ספציפי מהפרופיל
- `engine/arcEngine.test.ts` — 10 בדיקות (Node's built-in test runner, בלי jest) שמוודאות שכל תרחיש דילוג עובד

## איך להשתמש בזה בפרויקט React Native

1. להעתיק את תיקיית `engine/` כמו שהיא לתוך שורש פרויקט ה-Expo.
2. שום קובץ כאן לא תלוי ב-React/React Native — אפשר לייבא ישירות ממסכי `app/live/*.tsx`:

```ts
import { getNextStage } from "../../engine/arcEngine";
import { LiveStage } from "../../engine/types";

const next = getNextStage(LiveStage.PresenceCheck, liveSession, arcProfile);
```

3. להריץ את הבדיקות (Node 22+, בלי שום `npm install`):
```bash
node --experimental-transform-types --test engine/arcEngine.test.ts
```
דגל ה-`--experimental-transform-types` הכרחי כי `LiveStage` הוא `enum` אמיתי — מצב ברירת המחדל של Node ("strip-only") מוריד רק אנוטציות טיפוסים ולא יודע להמיר `enum` לקוד ריצה. כל ה-imports היחסיים כתובים עם סיומת `.ts` מפורשת (כמו שESM Resolution של Node דורש) והטיפוסים שאינם ערכי ריצה (`ArcProfile`, `LiveSession`, `IntensityThresholds`) מיובאים עם `import type` — כדי שה-stripping יידע להסיר אותם.

4. בדיקת טיפוסים (`tsc --noEmit -p tsconfig.json`) — עובר נקי (בלי `engine/arcEngine.test.ts`, שדורש `@types/node` שיהיה מותקן כרגיל בפרויקט Expo האמיתי).

(או דרך Jest, אם זה מה שהפרויקט המלא ישתמש בו — הלוגיקה עצמה לא תלויה בפריימוורק הבדיקות; אם בפרויקט המלא כבר יהיה build step של TypeScript/Metro, אפשר גם להחזיר את ה-imports לצורה בלי סיומת.)

## למה זה מוכן ל-TRAIN ולמדיטציות גם

כל הפונקציות הן טהורות: מקבלות `ArcProfile` + מצב, ומחזירות תשובה — בלי React, בלי state פנימי, בלי side effects. כשתגיע לבנות את TRAIN, הוא יכול לקרוא לאותן פונקציות בדיוק (`getNextStage`, `getIntensityBand` וכו') בלי לשכפל אף שורת לוגיקה.
