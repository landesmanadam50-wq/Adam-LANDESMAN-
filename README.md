# Archi — pilot-ready ARC Engine app (verified)

זה קוד TypeScript אמיתי, לא פסאודו-קוד. פרויקט Expo (React Native, Expo Router) שבו `arc/` ו-`program/` מחוברים בפועל לכל הזרימה: הערכת צרכים → הקצאת תוכנית → כיול פרופיל (BUILD) → סשן LIVE → שמירה מקומית → סטטיסטיקה שבועית (גם משך פיילוט קבוע וגם התקדמות בתוכנית האישית). 74 בדיקות עברו בהצלחה, `tsc --noEmit` עובר נקי, ו-Metro באמת בונה ומשרת את כל האפליקציה.

## מבנה הפרויקט

- `arc/` — מנוע ה-ARC הטהור (בלי React): `types.ts`, `config.ts`, `engine.ts` (החלטות בידוד: `shouldRunArcThought`, `getRouteAfterPresence`, `getReactiveStage`, `getProactiveStage`), `arcEngine.ts` (המרצף המלא — ראו "החלטות עיצוב" למטה), `stageCopy.ts`, `reinforcement.ts`
- `program/` — ארכיטקטורת "Layer Composer": `programTypes.ts`, `config.ts` (הגדרות תוכניות: `standard_3_week`, `advanced_2_week`, `identity_habit_2_week`, `habit_only_1_week` ועוד), `selection.ts` (הערכת צרכים → programPath), `engine.ts` (שאילתות על תוכנית), `progress.ts` (מעקב ימי אימון, השלמת שבוע, פתיחת שכבה הבאה)
- `build/` — אשף כיול הפרופיל (BUILD): `profileWizard.ts` (לוגיקה טהורה) + `ProfileBuilderScreen.tsx`
- `live/` — מסך סשן ה-LIVE: `LiveSessionScreen.tsx`
- `stats/` — לוח ההתקדמות: `StatsScreen.tsx`
- `data/` — שכבת נתונים: `sessionLog.ts`, `weeklyStats.ts`, `pilotConfig.ts`/`pilotProgress.ts` (משך פיילוט קבוע, נפרד מ-`program/`), `storage.ts` (עטיפת AsyncStorage)
- `app/` — נתיבי Expo Router בלבד (`index.tsx`, `build/index.tsx`, `live/index.tsx`, `stats/index.tsx`, `_layout.tsx`)

**חשוב:** כל הלוגיקה (`arc/`, `program/`, `build/profileWizard.ts`, `data/weeklyStats.ts`) יושבת בכוונה מחוץ ל-`app/` ונבדקת בנפרד מה-UI. Expo Router סורק כל קובץ תחת `app/` כנתיב אפשרי — קובץ `*.test.ts` שם היה נכשל על `import "node:test"`. כל קובץ תחת `app/` הוא רק "עטיפה" דקה שמייבאת וממרנדרת את הרכיב האמיתי.

**`engine/` (הגרסה הקודמת, מבוססת `LiveStage`) הוסרה לגמרי** — `arc/` הוא כעת המנוע היחיד. הפונקציה היחידה שעדיין הייתה שימושית (`getSuccessFocusReinforcement`) עברה ל-`arc/reinforcement.ts`.

## החלטות עיצוב שהוסקו (לא ניתנו במפורש — כדאי לבדוק שהן נכונות)

הקוד שסופק ל-`arc/` ו-`program/` כלל טיפוסים, קונפיגורציה, ופונקציות-החלטה מבודדות — אבל לא "מרצף שלבים" מלא כמו שהיה ב-`engine/arcEngine.ts` הישן (`getFirstStage`/`getNextStage`). כדי לחבר את זה למסך אמיתי, נאלצתי להסיק כמה דברים שלא היו נתונים במפורש. כולם מתועדים בקוד עם הסבר, אבל הנה הרשימה המרוכזת:

1. **`arc/arcEngine.ts` (`getFirstArcStage`/`getNextArcStage`)** — בניתי מרצף מלא מעל `shouldRunArcThought`/`getRouteAfterPresence`/`getReactiveStage`/`getProactiveStage`: `trigger_selection → presence_check → (ARC Thought) → מנותב לפי הטריגר → sensation_check (reactive) או desired_state_check (proactive) → ... → complete`. הנקודה המשמעותית ביותר: `reactive_transition_check` הוא **לולאה אמיתית** — אם `regulationReady` הוא false, חוזרים ל-`stay` (לא ממשיכים ל-`regulate` בכפייה).
2. **`sensation_check`** — עבור `reactive_urge` (הרגל) נשאלת רק עוצמה (לא מיקום בגוף), בהתאם לתקדים מה-`engine/` הישן (BodyLocation דולג עבור הרגל).
3. **מיפוי TriggerType → DevelopmentLayer** (ב-`arc/stageCopy.ts`, `getActiveLayerContent`) — הטיפוסים הנתונים לא קבעו איזו שכבה (מצב/זהות/הרגל) מזינה את שלבי `encode`/`act` עבור טריגר נתון. ההחלטה: `reactive_emotion` → מצב, `reactive_urge` → הרגל, `proactive` → זהות אם קיימת, אחרת מצב.
4. **"נפילה" (`fall`) אין לה עוד מקור** — לרשימת ה-`ArcStage` החדשה אין שלב מקביל ל"חלון הפעולה המפריעה" הישן. `success` נשאר אמין (מוגדר `true` תמיד בהגעה ל-`complete`, כי כל נתיב עובר דרך `act`), אבל `fall` הוא כרגע **תמיד `false`** — מתועד בקוד (`live/LiveSessionScreen.tsx`) כפער שדורש החלטת מוצר, לא הומצא בשקט.

## הזרימה המלאה (end-to-end)

1. **הפעלה ראשונה** — מסך הבית בודק אם יש פרופיל שמור. אם אין — מוביל ל-`/build`.
2. **BUILD (כיול)** — אשף שלב-אחר-שלב: קודם הערכת צרכים (`needsState?` → אם כן, `needsIdentityImmediately?`; אם לא, `needsIdentity?`), שקובעת דרך `program/selection.ts`'s `resolveProgramPath` את ה-`programPath` (בין `standard_3_week`, `advanced_2_week`, `identity_habit_2_week`, `habit_only_1_week`). **רק אחר כך** נשאלות שאלות ספציפיות לשכבות שבאמת נדרשות (מצב/זהות תמיד יחד — תוכניות מצב תמיד בונות גם זהות; הרגל תמיד נשאל, כי `needsHabit` תמיד `true`). בסיום — `saveProfile()` שומר `ArcBuildProfile` ל-`AsyncStorage`, ו-`createInitialProgress(programPath)` יוצר `ArcProgramProgress` (רק אם אין עדיין אחד, או אם ה-programPath השתנה בעריכה חוזרת — כדי לא לאפס התקדמות על עריכה של שדה לא קשור).
3. **LIVE** — `live/LiveSessionScreen.tsx` טוען את `ArcBuildProfile` האמיתי ומריץ את `arc/arcEngine.ts` בפועל: בחירת טריגר (רגש קשה / דחף / יזום) → בדיקת נוכחות (עם ARC Thought אם נמוכה) → מנותב ל-reactive (בדיקת תחושה → stay/accept/transition-check עם לולאה אפשרית, או ישר ל-regulate/encode) או proactive (בדיקת מצב רצוי → regulate/encode) → encode → act → success_focus → complete.
4. **מעקב הצלחה** — כל סשן שמגיע ל-`complete` נשמר כ-`SessionLogEntry` עם `success: true` (ראו "פער נפילה" למעלה לגבי `fall`).
5. **סטטיסטיקה** — `stats/StatsScreen.tsx` מציג **שני** סוגי התקדמות, בכוונה נפרדים: משך הפיילוט הקבוע (`data/pilotConfig.ts`) ואת התקדמות התוכנית האישית (`program/`, יכולה להיות 1-3 שבועות בהתאם למה שהמתאמן צריך) — מתאמן יכול להשלים תוכנית שלמה בתוך חלון פיילוט אחד.

### משך הפיילוט מול משך התוכנית — שני מושגים נפרדים בכוונה

**משך הפיילוט** הוא **8 שבועות** קבועים — מוגדר במקום אחד: `data/pilotConfig.ts` (`PILOT_DURATION_WEEKS`). שעון הפיילוט מתחיל בפעם הראשונה ש-BUILD נשמר (`getOrCreatePilotStartedAt()`) ולא מתאפס בעריכה.

**משך התוכנית** (`program/`) הוא אישי למתאמן — 1 עד 3 שבועות, נקבע מהערכת הצרכים ב-BUILD. `program/progress.ts` עוקב אחרי ימי אימון בפועל (`recordTrainingDay`, נדרשים 5 ימים בחלון של 7 ימים כדי להשלים "שבוע ARC"), משלים שבועות (`completeProgramWeek`), ופותח שכבות חדשות (`unlockBuildExtension`).

שני המושגים חלים **במקביל, באופן בלתי-תלוי**: מתאמן יכול לרוץ תוכנית של 3 שבועות בתוך חלון פיילוט של 8 שבועות.

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

בפעם הראשונה תועבר ישר להערכת הצרכים ב-BUILD; אחרי שמירה — למסך הבית עם "התחל סשן LIVE" ו"התקדמות שבועית".

## בדיקות ואימות

```bash
npm test        # כל הבדיקות הטהורות: arc/, program/, data/, build/ (74 בדיקות, Node's built-in test runner)
npm run typecheck   # tsc --noEmit על כל הפרויקט
```

בדיקת bundling אמיתית עם Metro (לא סתם type-check):
```bash
npx expo export --platform android
```

כל שכבות הלוגיקה (`arc/`, `program/`, `build/profileWizard.ts`, `data/weeklyStats.ts`) הן טהורות ונבדקות ישירות. `data/storage.ts` הוא עטיפת `AsyncStorage` דקה בלבד — לא נבדק ב-`node --test`, ומאומת בפועל על ידי הרצת האפליקציה.

**אימות אמיתי שבוצע (לא רק type-check):** הורצה `npx expo start` בפועל, נמשך ה-bundle החי דרך HTTP, ואומת ישירות בקוד המהודר (לא רק grep על טקסט — Babel לפעמים כותב עברית כ-escape יוניקוד `\uXXXX` במקום בייטים גולמיים, שזה תקין לגמרי אבל שובר חיפוש טקסט גולמי) ש-`LiveSessionScreen` ו-`ProfileBuilderScreen` באמת קוראים ל-`getFirstArcStage`/`getNextArcStage`/`getFirstProfileStep` מ-`arc/`/`build/`, לא לקוד הישן.

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

הפקודה מדפיסה קישור/QR. בודקי הפיילוט פותחים אותו **דרך אפליקציית Expo Go** (אין צורך ב-build מותאם אישית) וטוענים את הגרסה שפורסמה, בלי להריץ שרת פיתוח בכלל.

## מה עוד חסר

- **"נפילה" (fall) ללא מקור** — כמתואר למעלה, אין עדיין מנגנון "חלון פעולה מפריעה" בזרימת ה-LIVE החדשה; `fall` תמיד `false` עד שתתקבל החלטת מוצר.
- **מעקב זמן אמיתי בתוך סשן** — `program/progress.ts` עוקב אחרי *ימי אימון* (לא זמן בתוך סשן בודד).
- **לולאת ARC Thought** — 4 השלבים הם קו ישר גם עכשיו: אם הנוכחות התחילה נמוכה, כולם מוצגים ברצף בלי בדיקה חוזרת מוקדמת (רק `arc_thought_presence_recheck` בסוף קובע את הניתוב הבא).
- **ריבוי מתאמנים על מכשיר אחד** — אין מסך התחברות/משתמשים; הפרופיל, ההתקדמות וההיסטוריה הם per-device (`AsyncStorage`), לא per-account.
- **עוגני קידוד (encoding cues) חלקיים** — `EncodingProfile` תומך ב-`bodySensationCue`/`breathCue`/`bodyLanguageCue`/`gazeCue` בנוסף למנטרה, אבל אשף ה-BUILD שואל כרגע רק מנטרה (כדי לא להנפיח את האשף) — שאר השדות נשארים `null`.
