# Manual device-test checklist — productivity roadmap (Stages G–AD)

**Status: written only. Nothing in this checklist has been executed.**
Every item below still needs a real device (or at minimum a real
Expo Go / simulator session with real AsyncStorage, real timers, real
backgrounding, and a real notification permission prompt) — none of it
has been exercised outside the automated `node --test` suite, which
verifies logic and wiring from source text, never actual rendering,
actual touch input, or actual OS behavior.

Check off each box only after it has genuinely been run on a device.
Where an item depends on an earlier one (e.g. "create a task" before
"edit a task"), run them in order within that section.

## How to use this checklist

- [ ] Fresh install / cleared AsyncStorage run-through (first-run empty
      states) — do this pass once, at the start, before any other box.
- [ ] A second pass with pre-existing data (tasks, ARC Builds, ARC
      Goals, StateProfiles, Urge/Thought/Belief protocols already
      saved) — do this after the fresh-install pass, reusing the same
      data for every section below.

---

## 1. Navigation (Stage G)

- [ ] Home screen shows all three mode buttons, including "משימות ולוח
      זמנים" (the new third button).
- [ ] Tapping it opens the Today screen (`/today`).
- [ ] From Today, each entry point opens correctly: Tasks (`/tasks`),
      BUILD (`/build`), the LIVE gate (`/live/gate`), Manifest
      Meditation (`/manifest-meditation`).
- [ ] Back navigation from each of those returns to Today correctly
      (no dead-end, no duplicate screens stacking up).

## 2. Today screen (Stage I)

- [ ] With no tasks yet: Today shows a sensible empty state, not a
      crash or blank screen.
- [ ] Create a few tasks with different scheduled dates/times
      (overdue, later today, no time at all) and a recurring task for
      today. Confirm Today buckets them correctly: overdue section,
      current-or-next section, later-today section, unscheduled
      section.
- [ ] Complete a one-time task's card action — it moves to "completed
      today" and does not reappear in another section.
- [ ] Complete a recurring task's TODAY occurrence — it moves to
      completed-today for today only; tomorrow it should appear fresh
      again (check the next day, or by changing the device clock if
      safe to do so).
- [ ] Each card's actions (open, start, postpone, complete, edit,
      prepare) all do what they say — verify "start" actually begins
      the timer on the task's own screen.
- [ ] "תובנות" link (Stage Y) and "סדנת אימון" link (Stage Z) both
      open their respective screens from Today.

## 3. Task creation & editing (Stage H)

- [ ] "+ משימה מלאה" from the tasks list opens a blank new-task editor.
- [ ] Every field is editable and saves correctly: title, description,
      first action, scheduled date/time, duration, recurrence (once vs.
      recurring + day-of-week chips), subtasks (add and remove),
      value, identity, default supportive state (chip picker: 8
      predefined + any saved StateProfiles), linked ArcGoal chip,
      linked ArcBuild chip.
- [ ] Saving with a blank title shows a validation error and does not
      save.
- [ ] A negative duration, or "recurring" with zero days selected, is
      rejected with a visible error.
- [ ] Opening an EXISTING task for editing pre-fills every field
      correctly from its current saved state.
- [ ] Editing and saving an existing task does not reset fields the
      editor doesn't show (status, notification id, postponement
      state, completion) — check by editing a task that's mid-timer or
      already postponed and confirming that state survives the edit.
- [ ] Tapping "העברה לארכיון" (archive) on an existing task shows the
      NEW confirm modal (Stage AD) — it must NOT archive immediately
      on the first tap. Confirm "ביטול" closes the modal with no
      change. Confirm the modal's own "העברה לארכיון" button actually
      archives and returns to the tasks list.
- [ ] An archived task no longer appears in the tasks list or on
      Today.

## 4. Active task screen & timer (Stage J)

- [ ] Starting a task begins a real countdown; backgrounding the app
      and returning after at least a minute shows the correct
      remaining time (not reset, not frozen).
- [ ] Pause/Resume works correctly across a real backgrounding gap —
      paused time is not counted against the timer.
- [ ] "סיום מוקדם" (finish early) ends the timer immediately.
- [ ] At natural timer end, the 3-choice prompt appears (ARC / rest /
      next task) — verify it is visually distinct from "mark task
      complete," and that reaching this prompt never itself marks the
      task complete.
- [ ] Choosing "rest" starts a REST sub-timer with its own
      countdown, persisted the same way as the main timer (kill the
      app mid-rest and reopen — it should resume, not reset or
      vanish).
- [ ] Subtask rows: tapping the ✓/○ glyph toggles completion (confirm
      the enlarged tap area from Stage AD actually makes this easier
      to hit precisely); tapping the subtask's own title text instead
      selects it as the current action, shown highlighted — confirm
      these are two clearly different gestures, not one.
- [ ] "ערוך" link always opens the full editor, regardless of whether
      a timer is running.
- [ ] "הכנה לפני המשימה" (Stage K) opens the preparation screen.
- [ ] "משהו מפריע" opens the new reactive factor chooser (Stage L),
      both before starting the timer and while it's running.
- [ ] "בוא נעשה ARC עכשיו" opens the general LIVE chooser.
- [ ] If the task has a `linkedArcBuildId`, the end-of-timer "ARC"
      choice opens that exact ArcBuild's LIVE session directly (not
      its BUILD editor) and returns to this exact task when that
      session completes.
- [ ] The one-time notification-permission explanation banner appears
      before the OS permission dialog on first use, is dismissible,
      and never reappears after being dismissed (check after an app
      restart too).

## 5. Preparation before a task — proactive route (Stage K)

- [ ] From a task with no default supportive state set, "הכנה לפני
      המשימה" offers choosing one of the 8 predefined states or a
      saved StateProfile, or starting directly.
- [ ] From a task WITH a default supportive state already set, the
      screen offers "use the saved state" as a distinct option.
- [ ] Each of the 8 predefined states runs its own 5-step sequence and
      ends by auto-starting the task's timer.
- [ ] Choosing a saved StateProfile runs its own mantra/posture/
      breathing/energy-color/action content, skipping any field the
      profile left blank (no invented placeholder text).
- [ ] If a task's saved supportive-state link points at a StateProfile
      that has since been disabled or archived, the "use saved state"
      option does NOT appear (Stage AC fix) — confirm by disabling a
      StateProfile that a task is linked to, then reopening
      preparation for that task.
- [ ] "דלג והתחל" (skip and start) and "start directly" both
      immediately open and auto-start the task.

## 6. Reactive factor chooser and its sub-routes (Stages L–U)

- [ ] "משהו מפריע" shows all 9 categories (urge/emotion/thought/
      belief/presence/energy/task-too-large/external-interruption/
      unknown).
- [ ] **Emotion** (M/N): both identification questions work; "I don't
      know"/"none fits" paths correctly fall back or route to
      unidentified; confirming or choosing a different emotion opens
      that emotion's own 3-step protocol; declining to name one routes
      to neutral regulation. Every protocol ends by returning to and
      auto-starting the task.
- [ ] **Neutral regulation** (O): the 9-step sequence runs in order,
      the supportive-state choice step is optional, and it ends by
      returning to the task. Confirm it's reachable both directly and
      as the fallback from emotion/urge/thought/belief "I don't know"
      paths.
- [ ] **Saved urge/thought/belief** (P/R/S): the saved-factor chooser
      lists existing UrgeArc/ThoughtArc/BeliefArc records; opening one
      runs its real LIVE session and returns to the exact task
      afterward (`returnToTaskId`); if a linked MiniArcBuild exists,
      confirm whatever mini-mode choice that LIVE screen already offers
      still works from this entry point.
- [ ] **New/unmatched urge or thought/belief** (Q/T): capturing a short
      label (+ need chip, for urges) saves a ReviewLaterFactor (never a
      real Urge/Thought/BeliefArc record) and continues into neutral
      regulation, never a long mid-task detour. The thought-vs-belief
      gate's one question correctly routes "I don't know" to the
      shorter neutral thought path.
- [ ] **Presence/focus difficulty** (U): the 0-10 rating correctly maps
      to 0, 2, or 3 steps per the spec's band rule; confirm the Stage
      AD touch-target bump makes the 11 adjacent rating chips
      comfortably tappable with a real finger, including the 0 and 10
      extremes.
- [ ] **Low energy** (U): runs its steps without ever routing into an
      emotional protocol.
- [ ] **Practical task difficulty** (U): the 6 questions correctly
      narrow `currentAction` (never overwriting `firstAction`), and
      choosing a start time sets `expectedDurationMinutes`.
- [ ] **External interruption** (U): each of its 4 choices works;
      "reschedule"/"return later" opens the SAME postponement screen
      used elsewhere (Stage W), not a separate prompt.

## 7. Postponement (Stage W)

- [ ] "דחיית המשימה" and every auto-triggered postpone (Today's card,
      external-interruption screen) land on the same full 6-question
      postponement screen — there is no second, bare "reason text
      only" prompt anywhere anymore.
- [ ] Choosing "unscheduled" as the return time is a real, selectable
      answer (not merely what happens if you skip the question) and
      the task correctly disappears into Today's unscheduled section.
- [ ] Choosing a concrete return date/time correctly reschedules the
      task AND schedules a real OS notification for that exact time
      (Stage AB) — verify by actually waiting for (or safely
      fast-forwarding, if your test environment allows it) that
      notification to fire while the app is backgrounded, and that
      tapping it opens the right task.
- [ ] Re-postponing a task that already had a scheduled return
      notification cancels the old one before scheduling the new one —
      confirm only ONE notification ever fires, not two.
- [ ] Choosing "do you want ARC now?" after postponing routes into the
      general LIVE chooser and returns to this exact task afterward.
- [ ] The postponed task correctly saves any chosen supportive state as
      its new default, and preparation (Stage K) picks that up
      automatically the next time.

## 8. Session reflection (Stage X)

- [ ] Once a task is marked completed, an optional "רפלקציה קצרה" link
      appears exactly once.
- [ ] Each of the 3 questions is genuinely optional — leaving all blank
      and saving still records an entry.
- [ ] "דלג" (skip — confirm it reads "דלג", not "דילוג", per the Stage
      AD wording fix) discards nothing being asked and saves no entry.

## 9. Journal & insights (Stage Y)

- [ ] After running through several of the flows above (attempts,
      interference reports, protocol runs, preparation, postponement),
      open "תובנות" from Today.
- [ ] With too little data: shows the plain "not enough data yet"
      message, never a crash or a fabricated number.
- [ ] With enough data: the most-frequent interference category, most-
      frequent confirmed emotion, most-used preparation state, the ARC-
      to-task return percentage, and common postponement hours all
      show PLAUSIBLE, factual numbers matching what you actually did
      (spot-check at least one count against your own actions).
- [ ] Confirm the wording style never sounds diagnostic ("נבחר X ב-N
      פעמים", never anything implying "you have a problem with X").

## 10. Coaching workspace (Stage Z)

- [ ] "סדנת אימון" from Today opens the workspace, showing any
      ReviewLaterFactor entries captured earlier and the same factual
      counts from Stage Y's insights.
- [ ] Editing and saving the free-text notes field persists correctly
      across an app restart.
- [ ] Tapping "ביטול" while editing discards the in-progress edit
      (confirm this is intentional, low-stakes behavior — Stage AD
      reviewed this and deliberately left it without a confirm dialog;
      verify it still feels reasonable in actual use, not jarring).
- [ ] "/coaching/prepare" assembles a sensible session-prep view from
      existing data only — nothing invented.

## 11. Manifest Meditation integration (Stage AA)

- [ ] Opening Manifest Meditation shows suggestion-append buttons for
      values/identities/habits/personal sentences, each sourced from
      your own saved IdentityProfiles and recurring tasks.
- [ ] Appending a suggestion is a deliberate, reviewable action — it
      never auto-inserts without a tap.
- [ ] The "today's action" suggestion matches what Today's own
      schedule would show for right now.
- [ ] "להפוך את הפעולה למשימה" (turn into task) requires the explicit
      confirm step before actually creating a task — tapping the
      initial button alone must NOT create anything yet.

## 12. Notifications completeness (Stage AB)

- [ ] Starting a task's main timer schedules a notification; letting
      it run to completion while backgrounded delivers the
      notification and tapping it opens the right task.
- [ ] Starting the REST sub-timer also schedules its own notification
      (new in Stage AB) — confirm it fires correctly too.
- [ ] Pausing, finishing early, or starting a fresh timer over a stale
      one correctly cancels whatever notification was pending — confirm
      by pausing right before the scheduled fire time and verifying no
      stale notification arrives.
- [ ] Archiving a task with a pending notification cancels it — archive
      a task mid-timer (if possible) or with a postponed-return
      notification pending, and confirm nothing fires afterward.
- [ ] The one-time permission-explanation banner (see section 4) shows
      real in-app context BEFORE the OS dialog, not after.

## 13. Data integrity / library reference safety (Stage AC)

- [ ] Link a task to an ArcBuild, then delete that ArcBuild from the
      BUILD list. Confirm: (a) the delete-confirmation modal shows the
      correct referencing-task count beforehand; (b) after deleting,
      the task's own link is cleared (not dangling) and every other
      field on the task is untouched; (c) the task itself was NOT
      deleted.
- [ ] Repeat the same check for a linked ArcGoal.
- [ ] Link a task's default supportive state to a saved StateProfile,
      then disable (not delete — StateProfiles are never hard-deleted)
      that StateProfile. Confirm preparation (section 5) no longer
      offers it as the "use saved state" option, treating it exactly
      like a deleted link.

## 14. Accessibility / Hebrew UI quality (Stage AD)

- [ ] Every screen listed in sections 3–13 above renders correctly
      right-to-left: Hebrew text reads right-to-left, chips and button
      rows look natural (not mirrored or backwards), and nothing is
      visually flipped incorrectly.
- [ ] Every screen that loads data asynchronously (sections 5, 6, 7, 8,
      10, and the ARC Build/Goal lists) shows the new "טוען..." hint
      briefly on open rather than a flash of blank white — even if it's
      only visible for a fraction of a second on a fast device, confirm
      there's no longer a jarring blank flash.
- [ ] The active-task subtask checkbox and the presence-rating chips
      are comfortably tappable with a real finger, including with one
      hand and without zooming in.
- [ ] Confirm the archive-confirm modal (section 3) and all other
      destructive-action confirmations across the app read clearly and
      aren't accidentally dismissible by a stray tap outside the
      intended button.
- [ ] Spot-check that terminology is consistent as you move between
      screens in a single real session (e.g. "skip" always reads the
      same way for the same kind of action, "cancel" vs. "back" feel
      like they mean different things where they're used).

## 15. Cross-cutting checks

- [ ] Kill and restart the app mid-flow at least twice during this
      pass (once during a running task timer, once during a running
      rest timer) and confirm state is recovered correctly both times
      from real AsyncStorage, not just from the unit-tested pure
      functions.
- [ ] Confirm `returnToTaskId` correctly returns to the originating
      task after: an ArcBuild LIVE session, a saved Urge/Thought/
      Belief LIVE session, and the general LIVE chooser — but note the
      known, documented gap that ARC Goal sessions, Mini ARC, combined
      Personal Development routes, and the Future ARC Link button do
      NOT yet carry this context (confirm they still behave sensibly,
      just without returning to the task).
- [ ] Confirm no existing (pre-this-roadmap) BUILD/LIVE/Personal
      Development/Goal Achievement/Mini ARC/ARC Link flow was broken by
      any of this work — spot-check at least one session in each of
      those areas end-to-end.
