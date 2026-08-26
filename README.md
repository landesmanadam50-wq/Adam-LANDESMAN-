# Archi — pilot-ready ARC Engine app (verified)

זה קוד TypeScript אמיתי, לא פסאודו-קוד. פרויקט Expo (React Native, Expo Router) שבו `engine/` מחובר בפועל לכל הזרימה: כיול פרופיל (BUILD) → סשן LIVE → שמירה מקומית → סטטיסטיקה שבועית. 44 בדיקות עברו בהצלחה, `tsc --noEmit` עובר נקי, ו-Metro באמת בונה ומשרת את כל האפליקציה.

## מבנה הפרויקט

- `engine/` — מנוע ה-ARC הטהור (בלי React): `types.ts`, `thresholds.ts`, `arcEngine.ts`, `reinforcement.ts`
- `build/` — אשף כיול הפרופיל (BUILD): `profileWizard.ts` (לוגיקה טהורה, בסגנון `arcEngine.ts`) + `ProfileBuilderScreen.tsx`
- `live/` — מסך סשן ה-LIVE: `stageCopy.ts` (מיפוי טהור) + `LiveSessionScreen.tsx`
- `stats/` — לוח ההתקדמות השבועית: `StatsScreen.tsx`
- `data/` — שכבת נתונים: `sessionLog.ts` (טיפוסים), `weeklyStats.ts` (אגרגציה טהורה), `storage.ts` (עטיפת AsyncStorage)
- `app/` — נתיבי Expo Router בלבד (`index.tsx`, `build/index.tsx`, `live/index.tsx`, `stats/index.tsx`, `_layout.tsx`)

**חשוב:** כל הלוגיקה (`engine/`, `build/profileWizard.ts`, `live/stageCopy.ts`, `data/weeklyStats.ts`) יושבת בכוונה מחוץ ל-`app/` ונבדקת בנפרד מה-UI. Expo Router סורק כל קובץ תחת `app/` כנתיב אפשרי — קובץ `*.test.ts` שם היה נכשל על `import "node:test"` (לא זמין ב-runtime של React Native). כל קובץ תחת `app/` הוא רק "עטיפה" דקה שמייבאת וממרנדרת את הרכיב האמיתי.

## הזרימה המלאה (end-to-end)

1. **הפעלה ראשונה** — מסך הבית בודק אם יש פרופיל שמור (`data/storage.ts`). אם אין — מוביל ל-`/build`.
2. **BUILD (כיול)** — אשף שלב-אחר-שלב (`build/ProfileBuilderScreen.tsx`) שבונה `ArcProfile` אמיתי: מטרה, סוג ARC (מצב/זהות/הרגל), מצב מפריע/תומך, פעולה פנימית ומיטיבה, כלי ויסות, מנטרה (רשות), פעולה מונעת (רשות), הרגל מפריע לצמצום (רשות). בסיום — `saveProfile()` שומר ל-`AsyncStorage` ומוביל חזרה הביתה.
3. **LIVE** — `live/LiveSessionScreen.tsx` טוען את הפרופיל האמיתי מהאחסון (לא פרופיל דמו) ומריץ את כל 15 שלבי `engine/arcEngine.ts` בפועל, כולל תת-הזרימה positive-first של Reward → Success Focus / Interfering Action.
4. **מעקב הצלחה/נפילה** — כל סשן שמגיע ל-Finish נשמר ב-`data/storage.ts` כ-`SessionLogEntry`: `success` = הגיע ל-BeneficialAction בסשן זה, `fall` = השתמש בחלון ה-Interfering Action בסשן זה. אלו שני אותות עצמאיים (לא הדדית בלעדיים) מאותו סשן.
5. **התקדמות שבועית** — `stats/StatsScreen.tsx` קורא את כל היסטוריית הסשנים ומציג אותם מקובצים לפי שבוע ISO (`data/weeklyStats.ts`), החדש ביותר קודם: כמות סשנים, הצלחות, נפילות.

**אין עדיין** מבנה תוכנית רב-שבועית (יעדים/תכנים שמשתנים משבוע לשבוע) — זה שלב עתידי. השבועי הנוכחי הוא לוח סטטיסטיקה בלבד.

## הרצה

**התקנה חד-פעמית:**
```bash
npm install
```

**שרת פיתוח:**
```bash
npx expo start
```
- **טלפון**: Expo Go, לסרוק את ה-QR (אותה רשת Wi-Fi).
- **סימולטור iOS** (מק בלבד): `i`. **אמולטור Android**: `a`. **דפדפן**: פעם אחת `npx expo install react-dom react-native-web`, ואז `w`.

בפעם הראשונה תועבר ישר למסך כיול הפרופיל; אחרי שמירה — למסך הבית עם "התחל סשן LIVE" ו"התקדמות שבועית".

## בדיקות ואימות

```bash
npm test        # כל הבדיקות הטהורות: engine/, live/, data/, build/ (44 בדיקות, Node's built-in test runner)
npm run typecheck   # tsc --noEmit על כל הפרויקט
```

בדיקת bundling אמיתית עם Metro (לא סתם type-check):
```bash
npx expo export --platform android
```

כל שכבות הלוגיקה (`engine/`, `build/profileWizard.ts`, `live/stageCopy.ts`, `data/weeklyStats.ts`) הן טהורות ונבדקות ישירות. `data/storage.ts` הוא עטיפת `AsyncStorage` דקה בלבד — לא נבדק ב-`node --test` (תלוי במודול native), ומאומת בפועל על ידי הרצת האפליקציה.

**אימות אמיתי שבוצע (לא רק type-check):** הורצה `npx expo start` בפועל, נמשך ה-bundle החי דרך HTTP, ואומת שהקוד המהודר של `Home`, `StatsScreen` ו-`ProfileBuilderScreen` מכיל את הניתוב הנכון (`Link` עם ה-`href` הנכון לכל מסך) ואת טקסטי ה-UI הנכונים (חלקם מוצגים כ-escape יוניקוד `ה...` על ידי Babel במקום בייטים גולמיים — קידוד תקין לחלוטין, לא באג).

## פריסה לבדיקה (EAS Update)

הוגדר `expo-updates` ו-`eas.json`, אבל **אני (Claude) לא יכול לפרסם עדכון בעצמי** — זה דורש התחברות לחשבון Expo שלך. הפעולות החד-פעמיות:

```bash
npm install -g eas-cli   # או להשתמש ב-npx eas-cli לכל פקודה
eas login                 # התחברות חד-פעמית לחשבון Expo שלך
eas update:configure      # קובע runtimeVersion, updates.url, ו-extra.eas.projectId ב-app.json באופן אוטומטי
```

לאחר מכן, כדי לפרסם גרסה לבדיקה:
```bash
npm run deploy:preview -- --message "תיאור קצר של מה שהשתנה"
```
(או ישירות: `eas update --branch preview --message "..."`)

הפקודה מדפיסה קישור/QR. בודקי הפיילוט פותחים אותו **דרך אפליקציית Expo Go** (אין צורך ב-build מותאם אישית — הפרויקט לא משתמש במודולי native מותאמים) וטוענים את הגרסה שפורסמה, בלי להריץ שרת פיתוח בכלל.

לעדכן גרסה חדשה בהמשך: לחזור על `npm run deploy:preview -- --message "..."` — בודקים שכבר פתחו את הקישור יקבלו את העדכון בפעם הבאה שהם פותחים את האפליקציה.

## מה עוד חסר

- **תוכנית רב-שבועית** — כרגע יש רק לוח סטטיסטיקה; אין עדיין תכנים/יעדים שמשתנים לפי שבוע בתוכנית.
- **מעקב זמן אמיתי על Interfering Action** — "נפילה" מוגדרת כרגע כ"השתמש בחלון בכלל", לא כ"חרג בפועל מהדקות המותרות" (אין עדיין טיימר בפועל).
- **לולאת ARC Thought** — לפי `engine/arcEngine.ts`, ה-4 שלבי ARC Thought הם קו ישר: אם הנוכחות התחילה נמוכה, כל ה-4 מוצגים ברצף בלי בדיקה חוזרת מוקדמת. זו התנהגות המנוע הקיימת (מכוסה בבדיקות), לא באג.
- **ריבוי מתאמנים על מכשיר אחד** — אין מסך התחברות/משתמשים; הפרופיל וההיסטוריה הם per-device (`AsyncStorage`), לא per-account.
