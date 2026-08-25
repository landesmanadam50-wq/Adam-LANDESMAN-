# Archi — ARC Engine + Expo app (verified)

זה קוד TypeScript אמיתי, לא פסאודו-קוד. פרויקט Expo (React Native, Expo Router) עם `engine/` מחובר בפועל למסכי LIVE: 16 בדיקות עברו בהצלחה, `tsc --noEmit` עובר נקי, ו-Metro באמת מצליח לבנות (bundle) ולשרת את האפליקציה כולל כל 15 שלבי ה-LIVE.

## מה יש כאן

- `engine/` — מנוע ה-ARC הטהור (בלי React), כמתואר למטה
- `app/` — מסכי Expo Router: `app/index.tsx` (בית) ו-`app/live/index.tsx` (מסך ה-LIVE)
- `live/` — הלוגיקה וה-UI של מסך ה-LIVE (מחוץ ל-`app/` בכוונה — ראו הסבר למטה)

### `engine/`

- `engine/types.ts` — כל הטיפוסים: `ArcProfile`, `LiveSession`, `LiveStage` (enum ל-15 השלבים), `STAGE_ORDER`
- `engine/thresholds.ts` — ספי ברירת המחדל (Presence 6, עוצמה 10-5-3), כפונקציה `getIntensityBand` שניתנת לבדיקה
- `engine/arcEngine.ts` — הלב: `shouldShowStage()` ו-`getNextStage()`, שממשים את כל טבלת הדילוגים מה-roadmap
- `engine/reinforcement.ts` — יצירת טקסט חיזוק ספציפי מהפרופיל
- `engine/arcEngine.test.ts` — 10 בדיקות שמוודאות שכל תרחיש דילוג עובד

`engine/` עצמו לא תלוי ב-React/React Native בכלל.

### `live/` — מסכי ה-LIVE

- `live/stageCopy.ts` — מיפוי טהור (בלי React) מכל `LiveStage` לכותרת/טקסט ולסוג הקלט הנדרש (כן/לא, סולם 0-10, מיקום בגוף, וכו'). נבדק ב-`live/stageCopy.test.ts` (6 בדיקות) באותו סגנון כמו `engine/`.
- `live/demoProfile.ts` — פרופיל דמו קבוע. **אין עדיין מסכי BUILD/כיול** — עד שהם ייבנו, זה מה שמזין את ה-LIVE. יש להחליף בפרופיל האמיתי של המתאמן כשה-BUILD flow קיים.
- `live/LiveSessionScreen.tsx` — הרכיב הסטטפול: מחזיק `LiveSession` + `LiveStage` נוכחיים, קורא ל-`getFirstStage`/`getNextStage` מ-`engine/arcEngine.ts` בכל תשובה, ומרנדר את ה-UI המתאים לפי `stageCopy`. כולל את הזרימה המיוחדת של Reward → Success Focus / Interfering Action (positive-first: קודם שואלים על Success Focus, ורק אז — אם יש תוכנית — על חלון הפעולה המפריעה).

**חשוב:** `live/` נמצא בכוונה מחוץ ל-`app/`. Expo Router סורק כל קובץ תחת `app/` כנתיב אפשרי — אם `stageCopy.test.ts` היה שם, Metro היה מנסה לצרף אותו כמסך ולהיכשל על `import "node:test"` (מודול Node שלא קיים ב-runtime של React Native). `app/live/index.tsx` רק מייבא ומרנדר את `LiveSessionScreen` מ-`live/`.

## הרצה

**התקנה חד-פעמית:**
```bash
npm install
```

**הרצת שרת הפיתוח:**
```bash
npx expo start
```
זה מדפיס QR code בטרמינל:
- **טלפון**: להתקין את אפליקציית Expo Go ולסרוק את ה-QR (אותה רשת Wi-Fi).
- **סימולטור iOS** (מק בלבד): להקיש `i` בטרמינל.
- **אמולטור Android**: להקיש `a`.
- **דפדפן**: פעם אחת `npx expo install react-dom react-native-web`, ואז להקיש `w`.

באפליקציה: מסך הבית מציג כפתור "התחל סשן LIVE" שמוביל למסך ה-LIVE, שמריץ בפועל את כל שלבי `engine/arcEngine.ts` על פרופיל הדמו.

## בדיקות ואימות

בדיקות המנוע ומסכי ה-LIVE (Node 22+, בלי jest):
```bash
node --experimental-transform-types --test engine/arcEngine.test.ts live/stageCopy.test.ts
```
דגל ה-`--experimental-transform-types` הכרחי כי `LiveStage` הוא `enum` אמיתי — מצב ברירת המחדל של Node ("strip-only") מוריד רק אנוטציות טיפוסים ולא יודע להמיר `enum` לקוד ריצה. כל ה-imports היחסיים כתובים עם סיומת `.ts` מפורשת (כמו שESM Resolution של Node דורש) והטיפוסים שאינם ערכי ריצה מיובאים עם `import type` — כדי שה-stripping יידע להסיר אותם. אותם imports עובדים גם תחת Metro (הבנדלר של Expo/React Native) בלי שינוי.

בדיקת טיפוסים על כל הפרויקט:
```bash
npx tsc --noEmit
```
`tsconfig.json` מרחיב את `expo/tsconfig.base` ומוסיף `allowImportingTsExtensions` (בשביל סיומות ה-`.ts`) ו-`types: ["node"]` (בשביל `node:test`/`node:assert` בקבצי הבדיקות). את שדה ה-`include` מוסיף Expo Router אוטומטית (typed routes) — אין לגעת בו ידנית.

בדיקת bundling אמיתית עם Metro (לא סתם type-check):
```bash
npx expo export --platform android
```
זה בפועל מקמפל את כל האפליקציה — `app/`, `live/`, ו-`engine/` — לקובץ Hermes bytecode. אומת גם על ידי הרצת `npx expo start` בפועל ומשיכת ה-bundle החי דרך HTTP, כדי לוודא שהטקסטים בעברית של כל מסכי ה-LIVE (`בדיקת נוכחות`, `פעולה מונעת` וכו') באמת מגיעים ל-bundle המוגש.

## למה זה מוכן ל-TRAIN ולמדיטציות גם

כל הפונקציות ב-`engine/` הן טהורות: מקבלות `ArcProfile` + מצב, ומחזירות תשובה — בלי React, בלי state פנימי, בלי side effects. כשתגיע לבנות את TRAIN, הוא יכול לקרוא לאותן פונקציות בדיוק (`getNextStage`, `getIntensityBand` וכו') בלי לשכפל אף שורת לוגיקה. אותו עיקרון חל על `live/stageCopy.ts` — גם הוא טהור ונבדק בנפרד מה-UI.

## מה עוד חסר

- **BUILD / כיול פרופיל** — כרגע `live/demoProfile.ts` הוא פרופיל קבוע. אין עדיין מסכי כיול שיוצרים `ArcProfile` אמיתי למתאמן.
- **שמירת session** — ה-LIVE לא שומר היסטוריה של סשנים שהושלמו; זה placeholder ל-TRAIN בעתיד.
- **לולאת ARC Thought** — לפי `engine/arcEngine.ts`, ה-4 שלבי ARC Thought (Awareness/Combined Attention/Expansion/PresenceRecheck) הם קו ישר: אם הנוכחות התחילה נמוכה, כל ה-4 מוצגים ברצף, בלי לבדוק מחדש אחרי כל שלב אם אפשר לצאת מוקדם. זו התנהגות המנוע הקיימת (מכוסה בבדיקות), לא באג במסכים.
