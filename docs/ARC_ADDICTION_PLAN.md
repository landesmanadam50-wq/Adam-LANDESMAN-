# ARC Addiction – מסוגלות, זמן וקבלה · תוכנית יישום

סטטוס: **מומש (שלבים 1–6), ממתין לבדיקות מכשיר ולאינטגרציה** · ענף: `feature/arc-addiction` · בסיס: `origin/claude/task-productivity-integration` @ `47abffd`
(הענף העדכני ביותר עם קוד מקור – 60 קומיטים מעל `main`, כולל את v86 בלי קומיט ה־APK).
Worktree מבודד: `/home/user/arc-addiction` (סביבת העבודה הראשית והענפים האחרים לא נגעו).

מצב בסיס לפני שינויים: `npm test` 6618/6618 ✔ · `tsc --noEmit` ✔ · `expo lint` ✔.

---

## 0. עקרונות

1. **מנוע עצמאי חדש**, באותו דפוס של `arc/urgeLive.ts` (מכונת מצבים טהורה + קופי), ולא הרחבה של `NewArcLiveScreen` (3750 שורות, slot יחיד `archi.newArcLiveSession.v1` שמשמש ARC של משימות – שיתוף שלו היה דורס סשן ARC פעיל של משימה).
2. **שימוש חוזר** ברכיבים ובמנגנונים קיימים: `BodySilhouetteMap`, `ArcBodyMantraCircle`, `ArcStageScreen`, מאגר התחושות התומכות (`supportiveBodySensation` + `archi.supportiveBodySensationUsages.v1`), Positive Memory ובחירה שלה, תשתית notifee/foreground-service, `actionTimer`, דפוסי storage.
3. **אפס שינוי התנהגותי** במסלולי ARC קיימים. שינויים בקבצים משותפים יהיו תוספתיים בלבד (ענף `kind` חדש, שדה אופציונלי מנורמל, כרטיס כניסה).
4. **כל לוגיקה = פונקציה טהורה עם בדיקות**; מסכים ו־storage = בדיקות source-text wiring (קונבנציית הריפו – אין mocks ל־RN/AsyncStorage).
5. **שפה לא שיפוטית**: אין "כישלון", אין איפוס, אין רצף (streak) שנשבר. הקבלה העצמית אינה מותנית בתוצאה. גיבוי: הצהרה "כלי לתרגול עצמי, לא טיפול רפואי ולא תחליף לליווי מקצועי".

---

## 1. מודל נתונים (`arc/arcAddiction.ts`, טהור)

```ts
AddictionProfile {
  id, name,                         // שם ההתנהגות
  urgeSensation: string,            // התחושה הגופנית הקשורה לדחף
  urgeBodyAreas: {region: BodyScanRegion, side: BodyScanSide}[],
  supportiveSensations: {region, side, label, movementLabel|null}[], // מוצמדות ידנית; בנוסף הדירוג האוטומטי מהמאגר הקיים
  mayCauseBodilyHarm: boolean,      // => תיעוד בדיעבד בלבד, ללא טיימר התנהגות
  waitTargetMinutes: number,        // יעד ההמתנה הנוכחי (ברירת מחדל 1? / לבחירת המשתמש ביצירה)
  progression: { mode: "increase" | "hold", stepMinutes: number /*ברירת מחדל 1*/ },
  minWaitMinutes: 1, maxWaitMinutes: 240,
  archived: boolean, createdAt, updatedAt
}

AddictionEpisode {                  // רשומת היסטוריה – כל כניסה למסלול
  id, profileId, taskId|null, startedAt, endedAt|null,
  initialIntensity: 0..10|null,
  efficacyRounds: {startedAt, completedAt|null, skipped, efficacyRating 0..10|null}[],
  waitRounds: {startedAt, targetMinutes, endsAt, endedEarlyAt|null, answeredAt|null, choice: "act"|"not_act"|null, intensityAfter|null}[],
  outcome: "resisted" | "acted" | "ended_by_user" | "abandoned" | null,
  waitTargetMet: boolean,           // לפחות סבב המתנה אחד הושלם ביעד
  totalWaitSeconds: number,         // מהתחלה ועד החלטה לפעול/סיום
  behavior: { durationMinutes|null, loggedRetrospectively: boolean } | null,
  acceptance: { before 0..10|null, after 0..10|null, completed, skipped } | null,
  savedPositiveMemoryId|null,
  targetBefore, targetAfter         // לשקיפות של מנגנון ההתקדמות
}
```

Storage (`data/storage.ts`, קונבנציית `archi.<name>.v1` + normalize בטעינה):
- `archi.arcAddictionProfiles.v1` – רשימת פרופילים.
- `archi.arcAddictionEpisodes.v1` – היסטוריה (append/update; גיזום רך אחרי N=2000 רשומות לפרופיל).
- `archi.arcAddictionActiveSession.v1` – **slot יחיד** לסשן פעיל (episodeId, שלב נוכחי, מצב מכונה). זה מה שמאפשר יציאה וחזרה ומונע כפילות סשנים.

---

## 2. מכונת המצבים של סשן (`arc/arcAddictionFlow.ts`, טהור)

```
entry(intensity?) ─► efficacy_arc ─► wait_timer ─► decision ┬─ "לא" ─► intensity_check ┬ 0      ─► success_close ─► (Positive Memory?) ─► done
                         ▲                ▲                  │                          ├ 1–4    ─► [המשך בשגרה = done(resisted)] | [טיימר נוסף ─► wait_timer]
                         │                │                  │                          └ 5–10   ─► [ARC נוסף (מוצע) ─► efficacy_arc] | [טיימר נוסף] | [סיום]
                         └────────────────┴──────────────────┘
                                                             └─ "כן" ─► behavior_log ─► acceptance_arc ─► done(acted)
מכל שלב: "דלג" (efficacy/acceptance) · "סיים" · "קרה משהו – תיעוד ומעבר לקבלה" · "סיום טיימר מוקדם"
```

- `resolveIntensityRoute(n)`: `0 → "can_finish"`, `1..4 → "low"`, `5..10 → "high"`; ערך לא שלם / מחוץ לטווח / NaN → `null` (הכפתור "המשך" מנוטרל). **בדיקות גבול 0, 4, 5, 10** + ‎-1, 11, 4.5, NaN.
- ב־"high" ה־ARC הנוסף **מוצע** (כפתור ראשי), לא כפוי – תמיד יש גם טיימר נוסף / סיום.
- אין תקרה כופה על מספר סבבים, אבל אחרי 3 סבבים מוצגת הודעה עדינה ("אפשר גם לעצור כאן – כל דקה של בחירה נחשבת") כדי שהתרגול לא יהפוך לכפייתי.
- `getNextAddictionStage(stage, state, event)` – switch טהור; כל אירוע לא חוקי מחזיר את אותו שלב.

### 2.1 ARC מסוגלות (`arc/arcAddictionEfficacy.ts` + קופי)
שלבים קצרים (≈2–4 דק'), בסגנון Mini/Urge הקיים:
1. **זיהוי** – "מה מרגישים עכשיו ואיפה?" – מפת גוף (`BodySilhouetteMap`) עם אזורי הפרופיל מסומנים מראש; דירוג עוצמה ראשוני (אם לא ניתן בכניסה).
2. **עצירה וקבלת התחושה** – `ArcBodyMantraCircle stage="urge_acceptance"` על אזור הדחף ("אני יכול להרגיש את זה בלי לפעול").
3. **עיגון בתחושה תומכת** – הצעות מהמאגר: `resolveSuggestedBodySensations(["addiction:<profileId>"], usages)` + התחושות המוצמדות בפרופיל + `resolveSupportiveMovementSuggestionsForAreas`. בחירה נרשמת עם `recordBodySensationDiscovery(contextKey="addiction:<profileId>", …)`.
4. **זיכרון מסוגלות** (אופציונלי) – רגע הצלחה קודם מאותו פרופיל מ־Positive Memory (ראו §6).
5. **שהייה + מנטרה** – "אני מסוגל לשאת את התחושה הזו" (מתוך `supportiveFeelingMapping` – quality "מסוגלות").
6. **דירוג** – "כמה אתה מרגיש מסוגל לשאת את התחושה עכשיו?" 0–10 + `recordBodySensationRating` (כך המאגר לומד מה עוזר).

### 2.2 ARC קבלה עצמית (`arc/arcAddictionAcceptance.ts` + קופי)
1. דירוג קבלה עצמית לפני (0–10, אפשר לדלג).
2. **שיום** – "אילו מחשבות עולות עכשיו?" צ'יפים: ביקורת עצמית / אשמה / בושה / תסכול / אחר.
3. **איפה זה בגוף** – מפת גוף + `ArcBodyMantraCircle` לקבלת התחושה.
4. **הסבר קצר** – "ביקורת עצמית אחרי פעולה לפי הדחף מגבירה מצוקה ועלולה לחזק את הדחף הבא. קבלה אינה הסכמה עם ההתנהגות."
5. **אנושיות משותפת + מנטרה** – "אני מקבל את עצמי גם עכשיו" (mapping `shame → קבלה עצמית` הקיים).
6. **כוונה עדינה לפעם הבאה** (חופשי, אופציונלי) – בלי "התחייבות".
7. דירוג קבלה עצמית אחרי.
הקופי מנוסח כך שאין בו תנאי ("אם תצליח…") ואין מילת כישלון – נבדק בטסט שסורק את כל מחרוזות הקופי למילים אסורות (`כישלון`, `נכשלת`, `נפילה`, `אפס`).

---

## 3. מנגנון התקדמות (`arc/arcAddictionProgression.ts`, טהור)

- `applyEpisodeToProfile(profile, episode)`:
  - `waitTargetMet && mode === "increase"` → `target + stepMinutes` (ברירת מחדל +1), חסום ב־`maxWaitMinutes`.
  - `mode === "hold"` → ללא שינוי.
  - יעד לא הושג / פעל לפני הזמן / סיים מוקדם → **ללא שינוי** (לעולם לא איפוס, לעולם לא הורדה אוטומטית).
- פעולות משתמש: `setProgressionStep`, `holdTarget`, `decreaseTarget(by)` (מינימום 1), `setTargetManually`.
- "עמידה ביעד" = סבב המתנה שהגיע ל־`endsAt` לפני שנבחר "כן" (גם אם אחר כך פעל – זה עדיין התקדמות בזמן).
- מגמת משך התנהגות: `computeBehaviorDurationTrend(episodes)` – ממוצע נע של 5 אחרונים מול 5 קודמים; מוצג כ"מגמה", לא כציון.

---

## 4. טיימר ההמתנה + התראה אמיתית

תבנית: `data/taskNotStartedNotification.ts` / `armTaskTimerEndAlarm` (notifee trigger + `SET_ALARM_CLOCK` + foreground service – עובד גם כשהאפליקציה סגורה/נהרגה).

קובץ חדש `data/arcAddictionWaitNotification.ts`:
- `armAddictionWaitEnd(episodeId, endsAt, profileName)`:
  - **id קבוע יחיד** `arc-addiction-wait-end` → אי־אפשר שתהיינה שתי התראות; תמיד `cancel` לפני `arm`.
  - `createTriggerNotification({ id, data:{kind:"arcAddictionWaitEnd", episodeId}, android:{ channelId: NOTIFEE_REMINDER_CHANNEL_ID, actions:[{title:"כן", pressAction:{id:"arc_addiction_act_yes", launchActivity:"default"}}, {title:"לא", pressAction:{id:"arc_addiction_act_no", launchActivity:"default"}}], pressAction:{id:"default"} } }, {type: TIMESTAMP, timestamp: endsAt, alarmManager:{type: SET_ALARM_CLOCK}})`.
  - כותרת: "ARC Addiction · <שם ההתנהגות>"; גוף: "האם אתה בוחר לפעול לפי הדחף כרגע?".
- `cancelAddictionWaitEnd()`; `handleArcAddictionNotificationEvent(event)`:
  - ACTION_PRESS/PRESS → כותב את התשובה ל־active session **לפני** ניווט (כך גם בהפעלה קרה, אם הניווט מהרקע לא נקלט, `_layout` ימשיך מהמצב השמור) → `router.replace("/arc-addiction/session", {answer})`.
  - התעלמות מאירוע של episode שכבר נענה / לא תואם (מונע כפילות לחיצות).
- חיבור תוספתי ב־`data/taskAlarm.ts`: ענף `kind === "arcAddictionWaitEnd"` ב־`handleTaskAlarmEvent` (ואם נדרש ב־foreground service – רק אם נבחר דפוס ARM).
- **Busy gate**: ההתראה לא מושתקת בזמן משימה פעילה (המשתמש ביקש אותה במפורש). סשן ARC Addiction פעיל **בשלבי ARC** (לא בזמן ההמתנה) ייחשב "עסוק" עבור התראות מפריעות אחרות – בדיקה בסוף; שינוי קטן ב־`hasActiveTaskConflict` רק אם לא פוגע בבדיקות הקיימות.
- **Reconcile** ב־`app/_layout.tsx` (ליד `syncMorningAlarm`) וב־AppState→active: אם יש סשן פעיל ו־`endsAt` עבר ללא תשובה → ניווט למסך ההחלטה; אם `endsAt` עתידי ואין trigger → arm מחדש (idempotent).
- תצוגה בזמן ריצה: wall-clock מ־`endsAt` (`formatRemainingTime`), כמו כל הטיימרים בריפו – שורד kill.

## 5. סנכרון Task LIVE והטיימר הצף

- **כניסה בזמן משימה**: שורה חדשה "+ דחף (ARC Addiction)" ב־`live/components/AddInfoMenu.tsx` ופרמטר `returnToTaskId`. טיימר המשימה ממשיך (הוא ב־storage) – בסיום/המתנה חוזרים ל־`/tasks/[id]` בדיוק כמו `UrgeArcLiveScreen`.
- **ב־ActiveTaskScreen**: צ'יפ קטן "⏳ המתנה לדחף 03:12" כשיש סשן פעיל, לחיצה → מסך הסשן.
- **הטיימר הצף** – כרגע יש רק טיימר אחד (שירות Kotlin singleton). שתי אפשרויות (נדרשת החלטה, §11):
  - **א׳ (מומלץ)**: הרחבה תוספתית של ה־payload – `secondaryLabel`, `secondaryEndsAtMs` (שורה שנייה קטנה ב־OverlayService + deep link `archi://arc-addiction/session`). כשאין משימה פעילה – הטיימר מוצג כטיימר הראשי. דורש שינוי Kotlin ו־APK.
  - **ב׳**: בלי שינוי native – הטיימר מוצג רק בתוך האפליקציה ובהתראה הקבועה של notifee (ongoing עם chronometer לספירה לאחור). פשוט יותר, פחות סנכרון חזותי.

## 6. Positive Memory

- שדה תוספתי אופציונלי ב־`PositiveMemory`: `source: {kind: "arc_addiction", refId: profileId} | null` (מנורמל ל־null ב־`normalizePositiveMemory` – זיכרונות קיימים לא משתנים).
- בסיום מוצלח (0 / בחירה שלא לפעול / עמידה ביעד) – כפתור "שמור כרגע הצלחה" → `createPositiveMemory("success", …)` + `upsertPositiveMemoryEntry`, עם ref guard נגד שמירה כפולה (דפוס `SessionReflectionScreen`).
- `selectPositiveMemoryForAddictionProfile(memories, profileId, history, excludeIds)` – העדפה לזיכרונות עם אותו `source.refId`, אחר כך כל הצלחה; context חדש `"arc_addiction"` ב־selection history (גיוון, "הצלחה אחרת").

## 7. מסך התקדמות אישי (`arc/arcAddictionStats.ts` טהור + מסך)

לכל פרופיל:
- כרטיסי מדדים: יעד נוכחי, מספר בחירות "לא", זמן המתנה ממוצע (7/30 יום), משך התנהגות ממוצע + מגמה, תדירות (פעמים בשבוע).
- גרפים (רכיב חדש `live/components/ArcSimpleChart.tsx` על `react-native-svg` שכבר מותקן – אין כרגע רכיב גרף בריפו): זמן המתנה, משך התנהגות, תדירות שבועית, עוצמת דחף, מסוגלות, קבלה עצמית.
- היסטוריית תרגולים (רשימה, פירוט episode).
- פעולות: עריכת קצב התקדמות / החזקה / הקטנת יעד.
- אגרגציה בדפוס `data/weeklyStats.ts` (`getIsoWeekKey`).

## 8. מסכים וניתוב (expo-router)

| Route | מסך | תפקיד |
|---|---|---|
| `app/arc-addiction/index.tsx` | `build/ArcAddictionHomeScreen.tsx` | רשימת פרופילים + "מרגיש דחף עכשיו" לכל פרופיל (כניסה מהירה) + המשך סשן פעיל |
| `app/arc-addiction/profile/[id].tsx` | `build/ArcAddictionProfileEditorScreen.tsx` | יצירה/עריכה (כולל מפת גוף, התנהגות מזיקה, יעד וקצב) |
| `app/arc-addiction/session.tsx` | `live/ArcAddictionSessionScreen.tsx` | כל שלבי הסשן לפי המכונה (resume מה־slot) |
| `app/arc-addiction/progress/[id].tsx` | `live/ArcAddictionProgressScreen.tsx` | מסך התקדמות |

רישום ב־`app/_layout.tsx` (`<Stack.Screen>`). כניסות: כרטיס "ARC Addiction" במסך הבית (`FlexibleDailyScreen`, ליד ARC GYM/Learning/Creativity), אופציה ב־`SelfDevelopmentBuildScreen` (רשימת סוגי ARC), ו־AddInfoMenu בזמן משימה.

**מניעת כפילות סשנים**: "התחל" כשקיים סשן פעיל → "יש תרגול פעיל ל־X – להמשיך / לסיים ולהתחיל חדש" (סיום = outcome `ended_by_user`, cancel התראה).

## 9. התנהגות שעלולה לגרום נזק גופני

- `mayCauseBodilyHarm = true` (ביצירה – שאלה מפורשת; ברירת מחדל `true` כשהמשתמש לא בטוח).
- במסך "פעלתי לפי הדחף": **אין טיימר/סטופר**, רק "כמה זמן זה נמשך בערך?" (בחירה מהירה 1/3/5/10/15/30 דק' + חופשי), אפשר לדלג. בהתנהגות לא מזיקה – אפשרות סטופר (count‑up) **או** תיעוד בדיעבד.
- בכל מקרה – מיד אחר כך מעבר ל־ARC קבלה.

## 10. בדיקות (כולן ב־`npm test`, קבצים חדשים בלבד + התאמות מינימליות)

- `arc/arcAddictionFlow.test.ts` – כל המעברים, דילוג/סיום מכל שלב, לולאות, `resolveIntensityRoute` בערכי **0, 4, 5, 10** ו־‎-1/11/4.5/NaN, תוצאות episode.
- `arc/arcAddictionProgression.test.ts` – +1 ברירת מחדל, step מותאם, hold, decrease (מינימום), תקרה, אין איפוס/הורדה אוטומטית בכשל/פעולה/סיום מוקדם, מגמת משך.
- `arc/arcAddiction.test.ts` – normalize (נתונים חסרים/פגומים), CRUD טהור, ולידציה של פרופיל.
- `arc/arcAddictionCopy.test.ts` – אין מילים שיפוטיות, קיום ההצהרה, ניסוח השאלה המדויק בהתראה.
- `arc/arcAddictionStats.test.ts` – אגרגציות, שבועות, ממוצעים, ספירת "לא".
- `arc/arcAddictionTimer.test.ts` – remaining מ־endsAt, סיום מוקדם, resume אחרי "kill" (state מ־storage), טיימר שהסתיים בזמן שהאפליקציה סגורה.
- `data/arcAddictionWaitNotification.test.ts` – id קבוע, cancel‑before‑arm, כפתורי כן/לא, channel, `SET_ALARM_CLOCK`, ענף kind ב־`handleTaskAlarmEvent`, כתיבת תשובה לפני ניווט, התעלמות מ־episode לא תואם.
- `data/arcAddictionStorage.test.ts` – מפתחות, normalize בטעינה, slot יחיד.
- `live/arcAddictionWiring.test.ts` – routes רשומים, כניסות (בית / SelfDevelopment / AddInfoMenu), returnToTaskId, צ'יפ ב־ActiveTaskScreen, reconcile ב־_layout, Positive Memory guard, אין טיימר במסלול מזיק.
- `arc/positiveMemory*.test.ts` – זיכרונות ישנים בלי `source` נטענים כ־`null` (תאימות לאחור).
- רגרסיה: כל 6618 הבדיקות הקיימות + `tsc` + `lint`.

## 11. שלבי עבודה (קומיט לכל שלב, push לענף)

1. מודל + storage + progression + flow + קופי (טהור) + בדיקות.
2. התראה + טיימר + reconcile + חיבור ל־`handleTaskAlarmEvent` + בדיקות.
3. מסכים: בית/פרופיל/סשן (efficacy, wait, decision, intensity, behavior log, acceptance).
4. Positive Memory + מסך התקדמות + גרפים.
5. שילוב Task LIVE + AddInfoMenu + טיימר צף (לפי החלטה §5).
6. ריצה מלאה: tests / tsc / lint, בדיקה ידנית ב־web (playwright, צילומי מסך) של הזרימה, עדכון `MANUAL_TEST_CHECKLIST.md` (בדיקות שדורשות מכשיר: התראה כשהאפליקציה נהרגה, כפתורי כן/לא).

## 12. מיזוג ו־APK (לא עכשיו)

- **לא ממזגים** ל־main או לענף הצ'אט השני עד ששני הפיצ'רים מוכנים ונבדקו.
- אז: ענף אינטגרציה `integration/arc-addiction+<time-planning>` מעל הבסיס המשותף → מיזוג שני הענפים → פתרון קונפליקטים (צפויים ב־`data/taskAlarm.ts`, `app/_layout.tsx`, `data/storage.ts`, `ActiveTaskScreen.tsx`) → `npm test` + `tsc` + `lint` → רק אז בניית APK משותף.

## 13. החלטות פתוחות

1. טיימר צף: א׳ (הרחבת Kotlin) או ב׳ (ללא native)?
2. יעד המתנה התחלתי ברירת מחדל: 1 דק' / 3 / 5 / לבחירה ביצירה?
3. שם הענף של הצ'אט השני (לתיאום המיזוג בהמשך).

---

## 14. סטטוס מימוש

- החלטות המשתמש: טיימר צף – אפשרות א׳ (שורה שנייה עצמאית ב־Kotlin). יעד התחלתי – לבחירה ביצירה, ברירת מחדל דקה. שני מדדי התקדמות נפרדים, בלי איפוס. ARC קבלה עצמית מלא, מוצע גם כשפעלו לפני סוף ההמתנה.
- סטייה מהתוכנית: storage בקובץ נפרד (`data/arcAddictionStorage.ts`) ולא ב־`data/storage.ts`, כדי לצמצם קונפליקטים עם הענף המקביל.
- כניסה מ־Task LIVE: כפתור ב־`ActiveTaskScreen` (רכיב `ArcAddictionTaskLiveEntry`), כי `AddInfoMenu` לא מוצג ב־Task LIVE.
- Busy gate: `hasActiveTaskConflict` לא שונה. ההתראה של סוף ההמתנה אינה מושתקת בזמן משימה, כי היא נדרשה במפורש.
- Kotlin: לא קומפל בסביבה הזו (אין Android SDK). נבדק בסקירת קוד ובבדיקות source-text. הקומפילציה תיבדק בבניית ה־APK.
- בדיקות ידניות על מכשיר: `docs/ARC_ADDICTION_MANUAL_TESTS.md`.
