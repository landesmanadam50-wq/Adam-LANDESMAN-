# Archi — ARC Engine + Expo app (verified)

זה קוד TypeScript אמיתי, לא פסאודו-קוד. פרויקט Expo (React Native) עם `engine/` מחובר בפועל: הרצת 10 בדיקות עברה בהצלחה, `tsc --noEmit` עובר נקי, ו-Metro באמת מצליח לבנות (bundle) את האפליקציה כולל ה-imports מ-`engine/`.

## מה יש כאן

- `engine/types.ts` — כל הטיפוסים: `ArcProfile`, `LiveSession`, `LiveStage` (enum ל-15 השלבים), `STAGE_ORDER`
- `engine/thresholds.ts` — ספי ברירת המחדל (Presence 6, עוצמה 10-5-3), כפונקציה `getIntensityBand` שניתנת לבדיקה
- `engine/arcEngine.ts` — הלב: `shouldShowStage()` ו-`getNextStage()`, שממשים את כל טבלת הדילוגים מה-roadmap
- `engine/reinforcement.ts` — יצירת טקסט חיזוק ספציפי מהפרופיל
- `engine/arcEngine.test.ts` — 10 בדיקות (Node's built-in test runner, בלי jest) שמוודאות שכל תרחיש דילוג עובד
- `App.tsx` — מסך placeholder של Expo שמייבא בפועל מ-`engine/` (`getFirstStage`) ומציג את השלב הראשון, כהוכחה שהחיווט עובד

`engine/` עצמו לא תלוי ב-React/React Native בכלל — אפשר לייבא אותו מכל מסך:

```ts
import { getNextStage } from "./engine/arcEngine.ts";
import { LiveStage } from "./engine/types.ts";

const next = getNextStage(LiveStage.PresenceCheck, liveSession, arcProfile);
```

(שימו לב לסיומת `.ts` המפורשת ב-imports היחסיים — ראו הסבר למטה.)

## הרצה

```bash
npm install
npx expo start          # שרת פיתוח (Expo Go / סימולטור)
npm run web              # דורש: npx expo install react-dom react-native-web
```

## בדיקות ואימות

בדיקות המנוע (Node 22+, בלי jest):
```bash
node --experimental-transform-types --test engine/arcEngine.test.ts
```
דגל ה-`--experimental-transform-types` הכרחי כי `LiveStage` הוא `enum` אמיתי — מצב ברירת המחדל של Node ("strip-only") מוריד רק אנוטציות טיפוסים ולא יודע להמיר `enum` לקוד ריצה. כל ה-imports היחסיים כתובים עם סיומת `.ts` מפורשת (כמו שESM Resolution של Node דורש) והטיפוסים שאינם ערכי ריצה (`ArcProfile`, `LiveSession`, `IntensityThresholds`) מיובאים עם `import type` — כדי שה-stripping יידע להסיר אותם. אותם imports עובדים גם תחת Metro (הבנדלר של Expo/React Native) בלי שינוי.

בדיקת טיפוסים על כל הפרויקט (כולל `App.tsx` וקובץ הבדיקות):
```bash
npx tsc --noEmit
```
`tsconfig.json` מרחיב את `expo/tsconfig.base` ומוסיף `allowImportingTsExtensions` (בשביל סיומות ה-`.ts`) ו-`types: ["node"]` (בשביל `node:test`/`node:assert` בקובץ הבדיקות).

בדיקת bundling אמיתית עם Metro (לא סתם type-check):
```bash
npx expo export --platform android
```
זה בפועל קימפל את כל האפליקציה כולל `engine/` לקובץ Hermes bytecode — ה-imports נפתרים נכון וה-build עובר.

## למה זה מוכן ל-TRAIN ולמדיטציות גם

כל הפונקציות ב-`engine/` הן טהורות: מקבלות `ArcProfile` + מצב, ומחזירות תשובה — בלי React, בלי state פנימי, בלי side effects. כשתגיע לבנות את TRAIN, הוא יכול לקרוא לאותן פונקציות בדיוק (`getNextStage`, `getIntensityBand` וכו') בלי לשכפל אף שורת לוגיקה.
