# Hebrew BUILD/LIVE/Manifest/Tasks rework — progress summary (updated)

Branch: `claude/task-productivity-integration` (based on current `main`,
which includes the earlier Personal Development consolidation, PR #69/#70).
**Nothing in this task has been committed or pushed** — all work below is
in the uncommitted working tree.

**Final verification (this pass):** `npx tsc --noEmit` clean · `node --test`
(full suite) **3169/3169 passing** · `npx expo lint` clean.
**No manual/device testing has been performed on any of this.**

**Commit state:** one checkpoint commit (`d25a54c6595a0d5a9ea4baa55cc4846a3610a93d`)
was made and pushed to this branch under an explicit, one-time user
authorization. That authorization was for that single commit only — the
Phase 1 work described in the next section is, per the task's own
standing default ("do not commit, push, merge, publish, deploy, or
create a PR"), **uncommitted** in the working tree on top of that
checkpoint.

## Productivity & Personal Development upgrade (done, automatically verified)

A later, separate request: continuous task-flow improvements (chronological
ordering, a start-time alarm, a clear end-of-timer sound, pausing the
task timer during ARC/Rest, auto-advance to the next task) plus a new
"Manifest" task kind. Every existing function (Task Planning, Task
LIVE, the timer, the ARC/Rest/Continue choices) is preserved; nothing
was deleted.

### Requirement 1 — chronological task ordering: already fully implemented, no code changed
`arc/todaySchedule.ts`'s `buildTodaySections` already sorts every
bucket chronologically (nearest-first), already promotes a single
`currentOrNext` task (an active task always wins, otherwise the
earliest-due), already highlights it visually
(`taskCardEmphasized`), already supports recurring tasks, and already
recomputes fresh on every load/edit (no caching to go stale). Verified
against `arc/todaySchedule.test.ts`'s existing 19 tests, which already
exhaustively cover this -- no new tests were needed.

### Requirement 2 — start-time alarm (new)
- `arc/taskScheduledStart.ts` (pure) -- `resolveNextTaskStartOccurrence`
  mirrors `arc/routines.ts`'s own `resolveNextOccurrenceDate` exactly
  (same day-offset walk, same "strictly after now" rule, deliberately
  not completion-aware, matching that one existing precedent). Only
  ever produces a candidate for a "planned" task.
- `data/taskScheduledStart.ts` -- `rescheduleTaskStartNotification`/
  `reconcileTaskScheduledStartNotifications` mirror
  `data/routines.ts`'s own reschedule/reconcile split. A new
  `ReminderKind`, `"taskScheduledStart"`, reuses the existing generic
  `scheduleReminderNotification` (sound, background delivery, snooze/
  dismiss all already handled by the OS exactly like every other
  reminder in this app) and `Task.notificationId`/`notificationScheduledFor`
  (already-reserved fields) -- no new storage key needed beyond the
  kind itself.
- Wired into `build/TaskEditorScreen.tsx`'s save (immediate reconcile)
  and `build/TodayScreen.tsx`'s own focus reload (the same lazy
  "reconcile on next relevant touch" pattern `reconcileRoutineNotifications`
  already uses, so a recurring task's alarm keeps advancing to its next
  qualifying day). Tapping it deep-links to the task's own screen,
  exactly like every other task-kind reminder.
- Guarded so it can never clobber a different pending notification
  (e.g. a postponed-return reminder) on a task that isn't "planned."
- 8 pure tests (`arc/taskScheduledStart.test.ts`) + 7 wiring tests
  (`data/taskScheduledStart.test.ts`).

### Requirement 3 — clear end-of-timer sound, never duplicated (new)
`data/timerSound.ts`'s `playTimerCompletionSound` already existed for
every OTHER real timed activity in this app but was never wired to the
task timer specifically -- now is, via a new effect in
`live/ActiveTaskScreen.tsx` gated by a ref keyed on the run's own id
(`soundPlayedForRunId`), so it fires exactly once per run regardless of
how many times the surrounding 1s re-render tick fires while the
end-of-timer prompt stays on screen. The background/locked-phone case
was already covered by the run's own scheduled OS notification (its
own, separately-configured sound) -- untouched. 2 tests in
`live/productivityUpgrade.test.ts`.

### Requirement 4 — the task timer pauses during ARC/Rest (behavior change)
Rest already had its own fully separate timer and was already only
reachable after the main timer had already ended (nothing to pause).
ARC is the real change: entering ARC from an ACTIVE (not yet ended)
timer now calls the exact same `handlePause()` the explicit "השהיה"
button already uses -- never a duplicated pause path -- before
navigating, so ARC time is never counted as task work time. Returning
lands back on the task in its already-paused state, ready for an
explicit "המשך" tap (never auto-resumed without the trainee's own
action, carrying over Phase 1's own "never force-start a timer"
principle). No separate ARC-duration timer was built -- the new ARC
LIVE flow is step-based (dwell gates), not duration-based, so pausing
the task's own timer is what actually satisfies "ARC time is not
deducted from work time"; this is a deliberate scope decision, not an
oversight. `live/newArcLiveScreen.test.ts`'s own entry test was updated
(not deleted) to assert the new, intentional pause-first behavior.

### Requirement 5 — auto-advance to the next task (new)
`live/ActiveTaskScreen.tsx`'s `handleComplete` now calls a new
`advanceToNextTask`, which re-reads all tasks/completions and asks the
SAME `buildTodaySections` Today's own dashboard already uses for
"what's next" -- never a second, competing calculation -- then
navigates there if it differs from the task just completed. The next
task's own timer is never auto-started (no `autoStart` param); the
trainee still starts it explicitly. A "planned" task not yet due now
also shows "מתחיל בעוד X" (hours/minutes), computed from the exact same
clock reading `arc/todaySchedule.ts`'s own bucketing already uses
(`resolveTaskClockTime`, now exported for this reuse). 4 tests in
`live/productivityUpgrade.test.ts`.

### Requirement 6 — the "Manifest" task kind (new)
- `arc/tasks.ts`: additive `taskKind: "standard" | "manifest"` +
  `manifestProfile: ManifestProfile | null` (longTermGoal/desiredResult/
  desiredIdentity/bodyLanguageDescription) -- every pre-existing Task
  normalizes to `"standard"`/`null`, unaffected. A Manifest task is a
  real Task: same model, same persistence, same Today/scheduling/
  recurrence/notification machinery as any other -- **no new main
  screen**, exactly as asked.
- `arc/manifestTaskSteps.ts` (pure) -- a short, strictly LINEAR sequence
  (no branching, unlike the new ARC LIVE's goal-type/unpleasant-area
  branches, since Step A's setup is fixed once, never re-chosen per
  run): visualize (5 progressive screens) -> awareness -> presence ->
  acceptance -> regulation -> encoding (4 progressive screens) ->
  identity action.
- `arc/manifestTaskCopy.ts` (pure) -- reuses existing shared content
  wherever it already exists: `getAwarenessInstruction`/
  `getCombinedAttentionInstruction` (`arc/instructions.ts`, the same
  functions the main ARC engine itself uses) for awareness/presence,
  `getFreeBreathingLine` for regulation's buffer line, and the EXACT
  already-sanctioned "דמיין שהמטרה הגדולה שלך כבר הושגה" observer-
  perspective phrasing `arc/lifeManifestVisualization.ts`'s own
  Major-Goal stage already uses and `arc/instructions.ts`'s safety
  denylist already whitelists -- no new whitelist entry needed. Every
  encoding line about the positive sensation uses this codebase's
  established "notice/allow/let it expand" idiom, never "imagine
  yourself FEELING X" (the exact pattern the denylist exists to catch).
- `live/ManifestTaskLiveScreen.tsx` (route `/tasks/[id]/manifest`) --
  renders only what the two pure modules above decide, same split as
  `live/NewArcLiveScreen.tsx`. Finishing marks a one-time task complete
  via the shared `completeTask`, or a recurring task's TODAY occurrence
  via the shared `createTaskOccurrenceCompletion` -- never a third
  completion mechanism.
- `data/storage.ts` gained `loadManifestRunState`/`saveManifestRunState`/
  `clearManifestRunState`, a single-slot store mirroring the new-ARC-
  LIVE session's own shape, so an in-progress Manifest run survives
  backgrounding/app-restart.
- `build/TaskEditorScreen.tsx` gained a deterministic "סוג משימה" chip
  picker (רגילה / Manifest) and, only when Manifest is selected, the
  four Step-A setup fields -- defined once, never re-asked per run.
- `live/ActiveTaskScreen.tsx`'s `handleStart` now checks `taskKind`
  first: a Manifest task always opens its own guided run instead of
  creating a `TaskTimerRun`, even via `autoStart` (Today's own "start"
  card action) -- guarded in the function itself, not just the button
  label, so there's no path that creates an inappropriate timer for a
  Manifest task.
- 14 pure tests (`arc/manifestTaskSteps.test.ts`/`arc/manifestTaskCopy.test.ts`,
  including a full safety-denylist walk with both a full and a
  completely blank profile) + 10 wiring tests
  (`live/manifestTaskLiveScreen.test.ts`).

### What still requires device testing
Everything above is source-text/pure-logic verified only. Still needed
on a real device: the start-time alarm actually firing with sound while
backgrounded/locked and deep-linking correctly; the end-of-timer sound
actually being audible and never doubling up with the background
notification's own sound in a real foreground/background transition;
pausing for ARC and resuming afterward with the displayed remaining
time intact across a real app background/kill; auto-advance actually
landing on the right next task and showing an accurate "starts in X"
countdown; and the full Manifest run (visualize -> ARC -> identity
action) read end-to-end for pacing/tone, plus its own run state
surviving a real app kill mid-run.

## Simplified architecture, Phase 2 — the new, self-contained ARC LIVE (done, automatically verified)

Builds on Phase 1 below: the end-of-timer "צריך ARC" choice (and a new
button that keeps the same entry available while the task timer is
still running) now opens a REAL ARC LIVE flow instead of Phase 1's
honest placeholder -- "there is no separate ARC BUILD; the user makes
the necessary choices during LIVE." This is a genuinely new, independent
module tree (`arc/newArcLive*.ts`, `live/NewArcLiveScreen.tsx`), never an
extension of the old BUILD-driven engine (`arc/arcEngine.ts`,
`live/ArcLiveRenderer.tsx`), since that engine's whole shape assumes a
pre-authored `ArcBuildProfile` which has no equivalent here.

### New files
- `arc/newArcLiveTypes.ts` -- the session-state shape (every field the
  task listed: goal type, desired ending, emotion + custom text,
  thought, focus object/color, presence-completion flag, unpleasant
  area + description, and the three continuity fields --
  `supportiveBodyArea`/`supportiveSensation`/`positiveMovement`, each
  exactly one field, read verbatim everywhere, never re-asked or
  reworded), plus the fixed option lists (emotions, focus colors,
  supportive sensations, body-scan region groups).
- `arc/newArcLiveSteps.ts` -- the typed deterministic state machine:
  `resolveNextStep`/`resolvePreviousStep` (pure "what comes next/what's
  safely behind me"), `isStepSkippable`, `resolveProgress`, and one
  small setter per piece of trainee input, each of which updates the
  state and advances in one call. All 20 top-level steps and every
  progressive sub-screen (visual field, sound awareness, the 7-region
  body scan, Acceptance's 4 lines, Regulation's 3-4, Encoding's 5-6) are
  sequenced here -- `live/NewArcLiveScreen.tsx` never decides what's
  next itself.
- `arc/newArcLiveCopy.ts` -- the actual Hebrew instruction text for
  every (step, sub-screen) pair, reusing `arc/bodyRegionRoles.ts`'s
  existing `BodyRegion`/labels for both the unpleasant and supportive
  area pickers, `arc/bodyRegionMovementPresets.ts` for the supportive-
  movement suggestions (capped at 3 with a "view more" expansion, per
  the task's own display cap), and `arc/naturalBreathing.ts`'s existing
  `getFreeBreathingLine` for Regulation's "buffer, never commanded"
  breathing line.
- `live/NewArcLiveScreen.tsx` (route `/tasks/[id]/arc`, replacing Phase
  1's placeholder at the same route) -- renders exactly what the two
  pure modules above decide: title, progress ("שלב X מתוך Y"), primary
  instruction, at most two supporting lines, a dwell-gated "המשך"
  (never auto-advancing, never trapping once the dwell elapses), "חזרה"
  where safe, "דלג" where the step is optional, and each step's own
  input widget (chips/text/body-area picker) where one exists.
- `data/storage.ts` gained `loadNewArcLiveSession`/
  `saveNewArcLiveSession`/`clearNewArcLiveSession` -- a single-slot
  store, exact mirror of `loadTaskTimerRun`'s own shape/guarantees, so
  the session survives backgrounding and app restart; resumed only when
  its own `taskId` matches and it isn't already completed, otherwise a
  fresh one starts (same "resume, never duplicate" convention used
  throughout this codebase).
- `arc/instructions.ts` gained exactly ONE new safety-denylist whitelist
  entry ("את עצמך בסוף") for the Encoding result-imagery lines -- the
  task's own literal "דמיין את סוף הפעולה..." line was reworded to
  "דמיין את עצמך בסוף הפעולה..." (meaning preserved) specifically so it
  reuses this one new, narrow exception rather than weakening the
  denylist; verified the existing dangerous case
  (`"דמיין את עצמך מרגיש חרדה."`) is still correctly flagged.

### The continuity rule, concretely
Steps 10-12 (Acceptance/Regulation/Encoding) all read
`state.supportiveBodyArea`/`state.supportiveSensation`/
`state.positiveMovement` directly -- selected exactly once in Step 9,
never re-asked. Their role progresses exactly as specified: Acceptance
begins the saved movement while holding attention on both areas (or
just the supportive one, if no unpleasant area was selected);
Regulation chooses to focus more on the supportive area/sensation and
gently expands the same movement; Encoding lets the sensation spread
from the same area while keeping the same movement and adding the
goal-specific result imagery (desired ending + first action for an
action goal; desired ending alone, never a forced task action, for
emotion-only).

### Two deliberate copy adjustments (safety-driven, meaning preserved)
- Step 12's literal "דמיין שהתחושה מתרחבת בהדרגה..." was reworded to
  "אפשר לתחושת X להתרחב בהדרגה..." -- avoiding the imagination-of-a-
  sensation form `arc/instructions.ts`'s safety denylist exists to
  block, using the exact "אפשר ל... להתרחב" idiom this codebase already
  uses elsewhere for gentle sensation-expansion.
- Step 12's action-goal result line ("דמיין את סוף הפעולה...") was
  reworded to "דמיין את עצמך בסוף הפעולה..." to land inside the one new
  whitelist exception described above (the emotion-only result line was
  already phrased that way in the task's own spec text, so it needed no
  change).

### Entry points
- End-of-timer "צריך ARC" (`live/ActiveTaskScreen.tsx`) always opens
  `/tasks/[id]/arc` with the task's id, regardless of any linked
  ArcBuild -- never `/build`, never the old `/live`/`/live/select`.
- A new "צריך ARC" button is also shown while the task's main timer is
  actively running (the task's own explicit requirement) -- it does not
  stop or clear that timer, which keeps running (timestamp-based,
  persisted independently of which screen is showing) and is exactly as
  found on return.
- Completion ("להתחיל עכשיו") clears the session and returns to
  `/tasks/[id]` with `autoStart=1`. "לחזור למשימה בלי טיימר" returns the
  same way without auto-starting. "להקטין את הצעד" reuses the existing
  task editor (`/tasks/[id]/edit`) rather than a new screen. "לחזור
  לתרגיל קצר" restarts the same flow fresh from Step 1. Emotion-only
  completion offers "סיום"/"לבצע פעולה קטנة" (an explicitly optional
  small action, never a forced one), both returning to the task
  schedule.

### Tests added
- `arc/newArcLiveSteps.test.ts` (16 tests) -- the state machine: step
  ordering, the thought/unpleasant-area skip branches (forward AND
  backward), sub-screen counts for visual field/sound/body-scan/
  Acceptance/Regulation/Encoding, `isStepSkippable`, progress, and every
  setter.
- `arc/newArcLiveCopy.test.ts` (13 tests) -- every one of the task's own
  explicitly required continuity proofs (Acceptance begins the selected
  movement; Regulation focuses on the selected area/sensation and
  expands the selected movement; Encoding spreads from the selected area
  and retains the selected movement; action encoding includes the
  desired ending and first action; emotion-only encoding never
  references a task action; no unpleasant area still reaches
  Acceptance), natural breathing as an unmodified buffer, the "at most
  two supporting lines" display cap, and a full walk of Acceptance/
  Regulation/Encoding for both goal types and both unpleasant-area
  states through `containsInductionPattern`.
- `live/newArcLiveScreen.test.ts` (12 tests) -- route registration,
  both ARC entry points (end-of-timer and active-timer, confirming the
  latter never clears the running timer), persistence (functions
  exported, resume-only-if-matching-and-not-completed), the shared
  `commit()` save-on-every-change helper, every return-to-task path,
  emotion-only completion, "no path opens /build or the old LIVE
  chooser," and the dwell timer never auto-advancing on its own.
- `build/phase1Simplification.test.ts`'s "ARC never opens BUILD" test
  was updated (not deleted) to check the real new screen instead of
  Phase 1's now-superseded placeholder.

### What was NOT touched / explicitly out of scope (per the task's own list)
Emotion selection, thought entry, point-focus, visual-field expansion,
sound awareness, body scan, unpleasant/supportive-area selection,
Acceptance, Regulation, Encoding, and the action-vs-emotion-only goal
typing are now all IMPLEMENTED (this was the point of Phase 2) --
nothing from that list remains deferred except what the task itself
still defers beyond this: Google Calendar, Endel integration, and
production deployment. No legacy ARC code, route, test, or persisted
data was deleted. The one file actually removed,
`live/ArcLivePlaceholderScreen.tsx`, was Phase 1's own scaffolding built
specifically as a temporary stand-in for this exact phase -- not legacy
ARC system code -- and is now genuinely superseded, not merely hidden.

### What still requires device testing
Everything here is source-text/pure-logic verified only (no React
Native component renderer exists in this codebase). Still needed on a
real device: the dwell timer's actual felt pacing (too slow/too fast);
every chip/text-input screen's real RTL layout and touch targets; the
body-scan and visual-field/sound-awareness progression actually reading
as calm rather than tedious; the session actually surviving a real app
kill mid-flow and resuming at the exact right step; the "עוד אפשרויות"
(show more movements) expansion; and that "ARC" from an active timer
and from the end-of-timer prompt both land correctly and that returning
from either genuinely preserves the running/ended timer's own state.

## Simplified architecture, Phase 1 — Task Planning + Task LIVE only (done, automatically verified)

A separate, later product decision: ARCHI is being reduced to exactly
two user-facing screens, Task Planning and Task LIVE, with no separate
ARC BUILD. This Phase 1 pass hides everything else from normal
navigation **without deleting any legacy source file, route, test, or
persisted data** — see the "what remains preserved" list below.

### What is now visible
- **Task Planning is the app's root** (`app/index.tsx` now renders
  `build/TodayScreen.tsx` directly — no more three-button mode chooser).
  Shows current/overdue/later/unscheduled/completed tasks, each with
  start/postpone/complete/edit actions, plus "כל המשימות" (the full
  list/create screen, `/tasks`). Title and the current-task section now
  read "תכנון משימות"/"המשימה עכשיו" per the task's own required Hebrew
  labels.
- **Task LIVE** (`live/ActiveTaskScreen.tsx`, route `/tasks/[id]`) now
  shows only: task name, an explicitly labeled "הפעולה הראשונה", any
  subtask, the timer, Start ("התחלה")/Pause ("השהיה")/Resume
  ("המשך")/Finish-interval-early ("סיום מקטע"), Complete ("השלמת
  משימה"), and Postpone ("דחיית המשימה"). The timer itself
  (`arc/taskTimer.ts`), its persistence/restoration, and the timer-vs-
  completion separation are all reused completely unchanged.
- **The end-of-timer 3-choice prompt** is unchanged in shape and now
  reads "צריך ARC" / "צריך מנוחה" / "להמשיך" (`arc/taskTimerEndChoice.ts`'s
  own `TASK_TIMER_END_CHOICE_LABELS`, the one place all three labels are
  defined). Rest still runs its own timestamp-based sub-timer, returns to
  the same task, and schedules its own notification, all unchanged.
  Continue still offers the next task without completing the current one.
  "ARC" now **always** opens a new, honestly labeled placeholder
  (`live/ArcLivePlaceholderScreen.tsx`, route `/tasks/[id]/arc`) — "ARC
  LIVE בהכנה" — showing the task's own name and a single "חזרה למשימה"
  button, regardless of whether the task has a linked ArcBuild. It never
  opens `/build`, the BUILD editor, or the old `/live`/`/live/select`
  chooser. Building the real, simplified ARC LIVE sequence is explicitly
  deferred to Phase 2.

### What was hidden (not deleted)
From `app/index.tsx`: the "התפתחות אישית"/"השגת מטרה" mode buttons.
From `build/TodayScreen.tsx`: the "הכנה" (prepare) card action and the
bottom links to BUILD, the LIVE gate, Manifest Meditation, Insights, and
the Coaching workspace.
From `live/ActiveTaskScreen.tsx`: "משהו מפריע" (the reactive
emotion/urge/thought/belief/presence/energy/practical/interruption
chooser), "בוא נעשה ARC עכשיו" (the old ad-hoc LIVE chooser), "הכנה לפני
המשימה" (preparation), and the optional "רפלקציה קצרה" (reflection) link.

Every one of these screens, their own routes (`self-development/index`,
`reach-your-goal/index`, `build/index`, `build/[id]`, `live/gate`,
`live/select`, `manifest-meditation`, `coaching/index`,
`coaching/prepare`, `tasks/insights`, `tasks/[id]/prepare`,
`tasks/[id]/reflect`, the whole `tasks/[id]/factor/*` tree, and every
Urge/Thought/Belief/Presence ARC + ArcGoal + Personal Development route)
**stays registered in `app/_layout.tsx` exactly as before** — reachable
by direct URL/deep link, just not linked from the new, simplified
surface. No navigation guard was added to actively block entry, since
none of these routes are reachable through anything the simplified
screens themselves render; a stray old deep link would still work
(intentional — "legacy routes may remain registered... but must not
appear in normal navigation").

### Mechanism
No product-mode config module or scattered feature flags were added —
there's no runtime mode switch to support. Exactly three files gate what
the trainee can reach: `app/index.tsx`, `build/TodayScreen.tsx`, and
`live/ActiveTaskScreen.tsx`. Everything else is unreached simply because
nothing links to it anymore, which satisfies "the smallest maintainable
mechanism" literally.

### What remains preserved (untouched in this pass)
`arc/tasks.ts` (Task model, status, archive), `data/storage.ts`
(persistence, migrations, normalization), `arc/todaySchedule.ts`/
`arc/taskOccurrence.ts` (Today's bucketing + recurrence), `arc/taskTimer.ts`
(the timer itself), `data/notifications.ts` (scheduling/cancellation),
`build/TaskEditorScreen.tsx`/`build/TasksListScreen.tsx` (task
create/edit, including the linked-ArcGoal/ArcBuild/supportive-state
fields — left as-is; these are optional fields on the SAME task editor,
not a separate legacy screen), and every legacy screen/protocol/test
listed above. `build/phase1Simplification.test.ts` proves the legacy
data loaders are still exported and the legacy screen files still exist
on disk.

### Deferred to Phase 2
The real, simplified ARC LIVE sequence (emotion selection, thought
entry, point-focus, visual-field expansion, sound awareness, body scan,
unpleasant-area selection, supportive body-area selection, Acceptance,
Regulation, Encoding, Energy spread, result imagery, action-vs-emotion-
only goal typing) — the current placeholder is a deliberate, honest
stand-in, not a preview of that design. Also deferred: Google Calendar,
Endel integration, and any production deployment.

### What still requires device testing
Everything in this pass is source-text-verified only (no React Native
component renderer exists in this codebase). Still needed on a real
device: confirming Home opens directly on Task Planning with no flash of
the old chooser; the simplified Task LIVE screen's layout/RTL/touch
targets; that "ARC" from the end-of-timer prompt reliably opens the
placeholder and "חזרה למשימה" returns correctly; that Android's hardware
back button from Task LIVE returns to Task Planning without losing the
timer (this relies on expo-router's default Stack back behavior plus the
timer's own persistence, both unchanged — not given a new, dedicated
back-handler in this pass); and that a legacy deep link (e.g. to
`/build` or `/manifest-meditation`) still opens correctly even though
nothing in the new UI links to it.

## New productivity roadmap (Stages G–AF) — ALL STAGES COMPLETE (Stage AF consolidation)

Every stage G through AF (20 stages) is now done and automatically
verified. Nothing has been committed, pushed, merged, or published --
all of it remains in this uncommitted working tree, exactly as the
standing instruction for this whole roadmap requires.

### Stage-by-stage index (detail for each is further below in this file)

| Stage | What | Status |
|---|---|---|
| G | Home navigation → Today/Tasks/BUILD/LIVE gate/Manifest | done |
| H | Full task creation/editing UI, archive | done |
| I | Today screen: sections, sorting, recurring-task occurrences | done |
| J | Active-task session: subtasks, rest-timer persistence, return-to-task context | done |
| K | Preparation before a task (proactive route, 8 predefined states + saved StateProfile) | done |
| L | Reactive entry: "something is interfering" + deterministic 9-category chooser | done |
| M–O | Emotion identification (suggestion, never declaration) + 7 predefined protocols + neutral regulation fallback | done |
| P–Q | Saved urge protocols (reuse existing UrgeArc/LIVE) + new/unmatched-urge capture | done |
| R–T | Saved thought/belief protocols + thought-vs-belief gate + new/unmatched capture | done |
| U | Presence/focus, low energy, practical task difficulty, external interruption | done |
| V | Mini ARC integration — satisfied by reuse of existing mini-mode choices | done |
| W | Full 6-question postponement flow, replacing the old bare prompt | done |
| X | End-of-session factual reflection (3 optional questions) | done |
| Y | Journal fields for every new route + factual-only insights screen | done |
| Z | Coaching workspace (surfaces ReviewLaterFactor + insight counts for a human review pass) | done |
| AA | Manifest Meditation integration (suggestions from IdentityProfile/recurring tasks, today's-action→task) | done |
| AB | Notification completeness: rest/postponed-return kinds, stale-notification cancellation, permission-explanation UI | done |
| AC | Data integrity: never-silently-delete-referenced-data for ArcBuild/ArcGoal/StateProfile links | done |
| AD | Accessibility & Hebrew UI quality pass (confirm-before-archive, loading states, touch targets, terminology) | done |
| AE | Manual device-test checklist — **written only, not executed** (`MANUAL_TEST_CHECKLIST.md`) | done (as a document) |
| AF | This consolidation | done |

### Final verification (Stage AF, this pass)

- `npx tsc --noEmit` — clean, zero errors.
- `node --test` across all 158 `*.test.ts` files in the repo — **3076/3076
  passing, 0 failing, 0 cancelled**.
- `npx expo lint` — exit code 0, no warnings surfaced.
- `git status` confirms the repository is still on
  `claude/task-productivity-integration`, HEAD unchanged from the branch's
  starting commit -- **nothing has been committed**. All of the work below
  is uncommitted, tracked-modified or untracked-new files in the working
  tree (126 files touched by this whole roadmap, G through AF).

### Complete file inventory for Stages G–AF

**Modified (pre-existing files, each change additive/non-destructive):**
`app/_layout.tsx` (route registrations), `app/index.tsx` (third Home
button), `arc/types.ts`, `data/storage.ts`, `data/notifications.ts`,
`build/LiveModeSelectScreen.tsx`, `build/ArcBuildListScreen.tsx`,
`build/ArcGoalListScreen.tsx`, `build/liveModeSelectCombinedRoutes.test.ts`,
`live/LiveSessionScreen.tsx`, `live/UrgeArcLiveScreen.tsx`,
`live/ThoughtArcLiveScreen.tsx`, `live/BeliefArcLiveScreen.tsx`,
`live/PresenceArcLiveScreen.tsx`, `live/runtimeSafety.test.ts`.
(`arc/arcEngine.ts`/`.test.ts`, `arc/dwellTimes.ts`/`.test.ts`,
`arc/instructions.ts`, `arc/mantras.ts`/`.test.ts`,
`arc/stageCopy.ts`/`.test.ts`, `build/ArcBuildProfileForm.tsx`,
`build/profileWizard.ts`/`.test.ts`, `live/ArcLiveRenderer.tsx`,
`live/screens.tsx` were modified in the EARLIER Stages A–E pass, before
this G–AF roadmap began.)

**New pure logic + tests (`arc/`, `data/`):** `taskDraft.ts`, `tasks.ts`
(+`.test.ts` each), `taskOccurrence.ts`, `todaySchedule.ts`,
`taskTimer.ts`, `taskTimerEndChoice.ts`, `preparationStates.ts`,
`reactiveFactorChooser.ts`, `emotionIdentification.ts`,
`predefinedEmotionProtocols.ts`, `neutralRegulation.ts`,
`reviewLaterFactor.ts`, `thoughtVsBeliefGate.ts`, `taskSupportRoutes.ts`,
`postponementDraft.ts`, `taskInsights.ts`, `coachingWorkspace.ts`,
`coachingSessionPrep.ts`, `manifestMeditationDataSources.ts`,
`taskLibraryUsage.ts`, `data/taskJournal.ts` (each with its own
`.test.ts`).

**New screens (`build/`, `live/`):** `build/TodayScreen.tsx`,
`build/TaskEditorScreen.tsx`, `build/TasksListScreen.tsx`,
`live/ActiveTaskScreen.tsx`, `live/PreparationScreen.tsx`,
`live/ReactiveFactorChooserScreen.tsx`,
`live/EmotionIdentificationScreen.tsx`, `live/NeutralRegulationScreen.tsx`,
`live/SavedFactorChooserScreen.tsx`, `live/NewFactorCaptureScreen.tsx`,
`live/PresenceProtocolScreen.tsx`, `live/LowEnergyScreen.tsx`,
`live/PracticalTaskSupportScreen.tsx`, `live/ExternalInterruptionScreen.tsx`,
`live/PostponementScreen.tsx`, `live/SessionReflectionScreen.tsx`,
`live/TaskInsightsScreen.tsx`, `live/CoachingWorkspaceScreen.tsx`,
`live/CoachingSessionPrepScreen.tsx`.

**New routes (`app/`):** `app/today.tsx`, `app/tasks/index.tsx`,
`app/tasks/[id].tsx`, `app/tasks/[id]/edit.tsx`,
`app/tasks/[id]/prepare.tsx`, `app/tasks/[id]/postpone.tsx`,
`app/tasks/[id]/reflect.tsx`, `app/tasks/insights.tsx`,
`app/tasks/[id]/factor/index.tsx`, `.../emotion.tsx`, `.../neutral.tsx`,
`.../saved.tsx`, `.../new.tsx`, `.../presence.tsx`, `.../energy.tsx`,
`.../practical.tsx`, `.../interruption.tsx`, `app/coaching/index.tsx`,
`app/coaching/prepare.tsx`.

**New wiring/regression tests:** `build/todayScreenNavigation.test.ts`,
`build/taskEditorScreen.test.ts`, `live/returnToTaskWiring.test.ts`,
`live/preparationScreen.test.ts`, `live/reactiveFactorRoutes.test.ts`,
`live/activeTaskScreen.test.ts`, `live/postponementScreen.test.ts`,
`live/postponementAndReflection.test.ts`, `live/taskInsightsScreen.test.ts`,
`live/coachingWorkspace.test.ts`, `live/manifestMeditationDataIntegration.test.ts`,
`live/notificationCompleteness.test.ts`, `live/stageADAccessibility.test.ts`.

**New documents:** `HEBREW_REWORK_PROGRESS.md` (this file),
`MANUAL_TEST_CHECKLIST.md`.

(Files like `arc/bodyRegionMovementPresets.ts`, `arc/emotionStateOptions.ts`,
`arc/preSessionGate.ts`, `arc/manifestMeditation.ts`,
`live/PreSessionGateScreen.tsx`, `app/live/gate.tsx`,
`app/manifest-meditation.tsx`, and their tests belong to the EARLIER
Stages A–E pass, not this G–AF roadmap, and are listed in that section
further below.)

### Migrations

No destructive schema changes anywhere in this roadmap. Every new field
is additive with safe defaults read by existing loaders
(`loadTask`/`loadTaskTimerRun`/etc. all tolerate a pre-existing record
missing a newer field). New top-level storage slots
(`TaskOccurrenceCompletion`, `ReviewLaterFactor`, `TaskJournalEntry`'s
newer fields, `CoachingWorkspaceEntry`) are all append-only or
upsert-by-id, never a destructive rewrite of existing data. `TaskStatus`
gained `"archived"` additively; `ReminderKind` gained
`"restTimerEnded"`/`"postponedTaskReturn"` additively; `TaskTimerRun`
gained `kind` with a backward-compatible default.

### Known limitations (consolidated; see each stage's own section above for full detail)

- Return-to-task context (`returnToTaskId`) covers the ArcBuild "ARC
  רגיל"/open_linked path and the saved Urge/Thought/Belief/Presence LIVE
  screens, but NOT ARC Goal sessions, Mini ARC, combined Personal
  Development routes, or the Future ARC Link button.
- `SavedFactorChooserScreen.tsx`/`NewFactorCaptureScreen.tsx` do not
  write journal entries (those screens are shared with unrelated,
  pre-existing flows -- adding task-specific journaling there needs its
  own dedicated look).
- "Regulation tool associated with task return" and "completion after
  preparation" insights are intentionally not computed -- no honest data
  join exists for them yet, and inventing either would overclaim.
- A plain scheduled-date/time reminder for a task that is NOT in a
  postponed-return state is still not wired (only the postponed-return
  and timer-completion notification kinds exist).
- Chip-picker-level filtering of disabled/archived StateProfiles (they
  are correctly never RUN per Stage AC's fix, but could still be SEEN as
  a chip in a couple of pickers).
- No interactive OS notification action buttons (confirmed zero
  precedent anywhere in this codebase; the spec's own sanctioned
  single-tap-opens-the-choice-screen fallback is built and used
  instead) and no true cross-screen foreground overlay banner.
- No comprehensive `accessibilityLabel`/`accessibilityRole` screen-reader
  audit (a thin, pre-existing, codebase-wide gap, not unique to this
  roadmap -- see Stage AD).
- No BUILD-side UI to edit `Task.linkedArcBuildId`/`linkedArcGoalId`
  directly from the BUILD side (only from the task editor).
- `UrgeArcEditorScreen.tsx` was deliberately not expanded with the
  spec's requested extra fields (prevention/choice mantra, daily
  habit, dedicated task-return action) -- the CORE requirement (built in
  BUILD, selected in LIVE, full ARC method) was already true before this
  roadmap and remains so.

### Automated-verified vs. manual/device-untested — explicit split

**Automated and verified, every stage, every time:** all pure routing/
state/content logic (`arc/*.ts`), all storage round-trip functions, every
screen's own wiring (imports, the right functions called, the right
routes registered, navigation never happening at render time) via
source-text regression tests, and the full `tsc`/`node --test`/`expo
lint` triad after every single stage -- see each stage's own section
above for the exact test counts at that point, and the Stage AF numbers
just above for the final, whole-repo count.

**NOT verified -- genuinely untested, requires a real device or
simulator, and no claim is made anywhere in this document that it was
tested:** anything about actual rendering, actual RTL visual layout,
actual touch interaction, actual OS notification delivery/permission
dialogs, actual AsyncStorage persistence through a real app kill/
restart, and actual backgrounding behavior. `MANUAL_TEST_CHECKLIST.md`
(Stage AE) is the written, unexecuted checklist for exactly this
category of remaining work.

## New productivity roadmap (Stages G–AF) — per-stage detail

A much larger follow-on roadmap (Stages G through AF) turns ARCHI into a
full task-centric productivity app that routes interference to existing
ARC protocols. Standing rules for this whole roadmap: no commit/push/
publish, reuse existing architecture (never a second ARC engine), no
AI/LLM/text-classification/keyword-inference anywhere, deterministic
questions and explicit choices only, versioned additive migrations.

Before writing any code, a research pass mapped the existing protocol
architecture (`arc/urgeArcs.ts`, `arc/thoughtArcs.ts`, `arc/beliefArcs.ts`,
`arc/presenceArcs.ts`, `arc/interferenceItem.ts`, `arc/stateProfile.ts`,
`arc/personalDevelopmentRouteConfig.ts`, `arc/libraryItemUsage.ts`) to
avoid rebuilding anything that already exists. Key finding: there are
already 4+ independent LIVE engines in this codebase (arcEngine.ts for
ArcBuild; separate `*Live.ts` engines for Urge/Thought/Belief; Presence's
own; `personalDevelopmentRouteLink.ts` composing State+InterferenceItem+
Presence+Action) — later stages (L, M–O, P, R–S, V) must pick the single
most-reusable existing piece per stage rather than adding a 5th.

### Stage G — Navigation (done, automatically verified)
Added a THIRD mode button on Home (`app/index.tsx`), "משימות ולוח זמנים",
next to the existing two ("התפתחות אישית"/"השגת מטרה") — same convention,
no duplicate home system. It opens a new dashboard, `build/TodayScreen.tsx`
(route `/today`, registered in `app/_layout.tsx`), which itself hosts
every one of Stage G's required entry points: Tasks (`/tasks`), BUILD
(`/build`), the LIVE gate (`/live/gate`), Manifest Meditation
(`/manifest-meditation`), and Active Task (via each card, `/tasks/[id]`).
No render-time navigation anywhere (every `router.push` is inside an
`onPress`) — verified by a dedicated test in
`build/todayScreenNavigation.test.ts`, alongside tests proving each
route is registered.

### Stage I — Today screen with sections and sorting (done, automatically verified)
Built together with Stage G since Today's own nav entry had to be a real
screen, not a stub. All categorization/sorting is pure and separately
tested BEFORE the UI, in two new modules:
- `arc/taskOccurrence.ts` — per-occurrence completion for a RECURRING
  task (`TaskOccurrenceCompletion`), exact mirror of the existing
  `RoutineOccurrenceCompletion` shape/guarantees (append-only, keyed by
  taskId+local date — completing today's occurrence can never mark a
  different day's, or a different task's). Storage CRUD added to
  `data/storage.ts` (`loadTaskOccurrenceCompletions`/
  `appendTaskOccurrenceCompletion`), mirroring the routine pattern
  exactly.
- `arc/todaySchedule.ts` — `buildTodaySections(tasks, completions, now)`
  returns the 5 required sections (overdue/currentOrNext/laterToday/
  unscheduled/completedToday) with deterministic sorting (by clock time,
  then createdAt; completedToday most-recent-first). Handles one-time
  AND recurring tasks, postponed tasks (returnAt's own date/time decides
  the bucket; `returnAt: null` is the spec's explicit "move to
  unscheduled" outcome), and archived tasks (always excluded). 22 tests
  in `arc/todaySchedule.test.ts` cover every bucketing/sorting/promotion
  rule, including the currentOrNext promotion priority (an active task
  always wins; otherwise the most urgent timed task).
`build/TodayScreen.tsx` only renders what these pure modules decided.
Card actions are limited to ones with a real destination: open details,
start (navigates to the detail screen with `autoStart=1`), postpone
(`openPostpone=1`), complete (direct — a one-time task's own
`completeTask`, or a recurring task's TODAY occurrence, never the
other's mechanism), and edit (Stage H, see below). "Prepare" (Stage K)
is intentionally not rendered yet.

### Stage H — Complete task creation/editing (done, automatically verified)
- `arc/tasks.ts`: added `"archived"` to `TaskStatus` (additive) +
  `archiveTask`/`unarchiveTask` (hides from lists without deleting
  history, mirroring the library-item disable convention). Existing
  `TasksListScreen.tsx`/`todaySchedule.ts` updated to exclude archived
  tasks. 2 new tests in `arc/tasks.test.ts`.
- `arc/taskDraft.ts` (NEW, pure, 12 tests) — the full draft/validation
  layer (`TaskDraft`, `createEmptyTaskDraft`, `taskDraftFromTask`,
  `validateTaskDraft`, `buildTaskFromDraft`, subtask/recurrence-day
  helpers), same split as `build/profileWizard.ts`. Validation is
  deterministic only: title required; duration cannot be negative;
  recurring requires ≥1 day; scheduledDate/scheduledTime format-checked.
  First action is intentionally NOT required (matches the product
  spec's explicit "may remain optional for backward compatibility" and
  `normalizeTask`'s existing tolerance). Editing an EXISTING task
  preserves every field the draft doesn't cover (status, notification
  id, postponement, completion) — verified by a dedicated test.
- `build/TaskEditorScreen.tsx` (NEW, route `/tasks/[id]/edit`, `id ===
  "new"` to create) — exposes every field: title, description, schedule
  (date/time/duration), first action, subtasks (add/remove), recurrence
  (once/recurring + day chips), value, identity, default supportive
  state (free text — Stage K will add presets), linked ArcGoal and
  linked ArcBuild (both a deterministic pick from the trainee's own
  saved records via `loadArcGoals`/`loadArcBuilds`, never a free-text id
  field), save, and archive (existing tasks only). Saves through the
  exact same `upsertTask` as the existing quick-create path on
  `TasksListScreen.tsx`, which is untouched — never a second task store.
  Reachable from: `TasksListScreen.tsx`'s new "+ משימה מלאה" button,
  `ActiveTaskScreen.tsx`'s new "ערוך" link (always visible, independent
  of timer state), and `TodayScreen.tsx`'s own card "ערוך" action.
- `ActiveTaskScreen.tsx` also gained `autoStart`/`openPostpone` props
  (read from the route params Today's cards now pass) that trigger the
  exact same `handleStart`/`setShowPostpone` a trainee tapping those
  buttons on this screen itself would — one-shot guarded, never when a
  timer is already in flight. No duplicated timer logic.
- 9 new wiring tests in `build/taskEditorScreen.test.ts`.

Reminders UI (one of Stage H's listed fields) is deliberately NOT added
yet — `Task.notificationId`/`notificationScheduledFor` exist but no
reconcile logic reads scheduledDate/scheduledTime into an actual
reminder notification (distinct from the already-working timer-
completion notification). Tracked for Stage AB.

### Stage J — Finish active-task session behavior (done, automatically verified)
- **Subtasks**: now rendered with a completion toggle (tap the ○/✓ →
  `toggleTaskSubtaskCompletion`) and a separate "select as current"
  tap on the title (→ `setTaskCurrentAction`) — two different gestures,
  never conflated. The selected one is visually highlighted.
- **Rest-timer persistence (a previously documented gap, now closed)**:
  `arc/taskTimer.ts`'s `TaskTimerRun` gained an additive `kind: "task" |
  "rest"` field (`createTaskTimerRun`'s new optional 5th parameter,
  default `"task"`). The single-slot `TaskTimerRun` storage now also
  carries the "I need rest" sub-timer — it survives backgrounding and
  app restart exactly like the main timer always did, because it reuses
  the exact same persisted slot instead of local-only React state.
  `data/storage.ts`'s `loadTaskTimerRun` defaults a pre-existing
  persisted run's missing `kind` to `"task"` (backward compatible).
  `reload()` now restores into `restRun` vs `timerRun` based on that
  field.
- **Return-to-task context (a previously documented gap, now mostly
  closed)**: a new `returnToTaskId` route param, added as its own
  independent param mirroring the EXISTING `fourWeekGoalId`/
  `pdProgramId`/`thenIdentityGoalId` "optional support and return
  context" precedent in `live/LiveSessionScreen.tsx` (never touching
  those other paths). Threaded: `ActiveTaskScreen.tsx`'s "משהו
  מפריע"/"בוא נעשה ARC עכשיו" buttons and the end-of-timer "ARC" choice
  → `build/LiveModeSelectScreen.tsx` (forwarded onto its "ARC רגיל"
  push) → `live/LiveSessionScreen.tsx` (a new `returnToTask()` function,
  wired into `onCompletePrimary`'s existing priority chain, plus the
  optional identity-extension-continuation offer's own `returnTo`).
  Fixed a genuine small bug while here: "open the linked practice"
  (when a task has `linkedArcBuildId`) previously opened that
  ArcBuild's BUILD *editor*, not a LIVE session of it — now goes
  straight to `/live` with the right `buildId` (and `returnToTaskId`).
  **Known remaining gap**: this is scoped to the single most direct
  path (ArcBuild "ARC רגיל"/open_linked) — ARC Goal, Mini ARC, combined
  Personal Development routes, and the Future ARC Link button do not
  yet carry `returnToTaskId`; completing one of those sessions still
  returns to their own normal destination, not the task.
- 7 new tests in `live/returnToTaskWiring.test.ts`, 4 new tests added to
  `live/activeTaskScreen.test.ts`, 1 existing regex in
  `build/liveModeSelectCombinedRoutes.test.ts` updated (functionally
  unchanged path, now also optionally forwards the new param).

### Stage K — Preparation before a task (done, automatically verified)
- `arc/preparationStates.ts` (NEW, pure) — the proactive route's
  content. 8 PREDEFINED states (focus/confidence/calm/energy/patience/
  curiosity/determination/creativity), each a fixed 5-step deterministic
  sequence; the spec's own worked examples (focus/confidence/calm/
  energy) are reproduced directly, the other 4 are a consistent
  extension built from the exact same step categories (reasonable
  implementation decision, per this task's own standing instruction).
  Reuses shared content where it already exists
  (`arc/naturalBreathing.ts`'s `getFreeBreathingLine`,
  `arc/presenceColor.ts`'s `getEnergyColorLine`) rather than
  re-authoring it. The final step of every state reuses the EXACT
  already-sanctioned "דמיין את עצמך מתחיל" Action-Imagery phrasing from
  `arc/instructions.ts`'s own denylist whitelist — verified by a test
  that runs `containsInductionPattern` against every generated line for
  every state. A SECOND path, `getPreparationStepsForStateProfile`,
  builds steps directly from a trainee's own saved `StateProfile`
  fields (mantra/posture/regulation/energy color/action) — never
  inventing content for a field left blank. `resolvePreparationSource`
  resolves `Task.defaultSupportiveStateId` against either the 8
  predefined ids or a real saved `StateProfile` id, returning `null`
  (safe fallback, never a crash) for a blank or since-deleted id.
- `build/TaskEditorScreen.tsx`'s "מצב תומך מועדף" field upgraded from
  free text (Stage H's placeholder) to a deterministic chip picker over
  the 8 predefined states plus the trainee's own saved `StateProfile`s.
- `live/PreparationScreen.tsx` (NEW, route `/tasks/[id]/prepare`) — the
  four choices: "use the state saved on the task" (shown only when
  `resolvePreparationSource` actually resolves to something real),
  "choose another supportive state" (predefined chips + saved
  profiles), and "start directly"/"skip preparation" (the same action:
  open the task immediately). Every path ends by opening
  `/tasks/[id]` with `autoStart=1` — the exact same param Today's own
  "start" card action already uses, no duplicated timer-start logic.
  Reachable from `ActiveTaskScreen.tsx`'s new "הכנה לפני המשימה" button
  and `TodayScreen.tsx`'s card "הכנה" action.
- 10 tests in `arc/preparationStates.test.ts`, 7 wiring tests in
  `live/preparationScreen.test.ts`.

### Stages L–U — the reactive "what is interfering right now?" route tree (done, automatically verified)

Before writing any of this, a research pass mapped the EXISTING protocol
architecture to avoid rebuilding anything (see "New productivity
roadmap" intro above). Key reuse decisions made as a result:
`UrgeArc`/`ThoughtArc`/`BeliefArc` + their own LIVE screens are reused
AS-IS for Stages P/R/S (never a new engine); a brand-new shared
"neutral regulation" protocol (Stage O) is reused as the explicit
fallback for Stages O/Q/R/S alike, per the spec's own repeated "offer
neutral Mini ARC or neutral regulation" instruction.

- **Stage L** — `arc/reactiveFactorChooser.ts` (pure): 9 fixed
  categories (urge/emotion/thought/belief/presence/energy/
  taskTooLarge/externalInterruption/unknown), an exhaustive
  discriminated-union router (`resolveReactiveFactorDestination`, a
  real TS exhaustive `switch`) to each category's own real screen —
  never free-text classification. `live/ReactiveFactorChooserScreen.tsx`
  (route `/tasks/[id]/factor`) only renders the choice and navigates
  to whatever that pure function names.
- **Stage M** — `arc/emotionIdentification.ts` (pure): two deterministic
  questions (10 body-sensation options, 9 closest-statement options)
  produce a `EmotionSuggestion` — **never a declaration**. The
  statement answer maps almost 1:1 to one of the 7 predefined emotions;
  the body sensation is consulted only as a fallback when the
  statement itself was "I don't know"; "none fits" always resolves to
  "unidentified" without consulting the body at all.
  `live/EmotionIdentificationScreen.tsx` always asks the trainee to
  confirm/choose-another/decline before running anything.
- **Stage N** — `arc/predefinedEmotionProtocols.ts` (pure): a ready-made
  3-step protocol for each of the 7 emotions (fear/shame/frustration/
  overwhelm/boredom/anger/sadness) — the spec's own "no more than three
  exercises at one time" rule, content compressed from each emotion's
  own worked tool list. Every protocol's final step reuses the EXACT
  already-sanctioned "דמיין את עצמך מתחיל" Action-Imagery phrasing
  (verified: every generated line for every emotion is run through
  `containsInductionPattern` in the test suite). Shame's own step
  reads the task's saved `value`/`identity` verbatim when present,
  never inventing one.
- **Stage O** — `arc/neutralRegulation.ts` (pure) +
  `live/NeutralRegulationScreen.tsx` (route `/tasks/[id]/factor/neutral`):
  the spec's own 9-step neutral sequence (notice → brief Stay → accept
  without naming → widen visual field → body contact → natural breath
  → optional supportive-state choice, reusing Stage K's own 8
  predefined chips → the task's own smallest action → return). Never
  blocks the trainee for lack of an identified factor.
- **Stage P/R/S** — `live/SavedFactorChooserScreen.tsx` (route
  `/tasks/[id]/factor/saved`, one shared screen parameterized by
  `factorKind: "urge"|"thought"|"belief"`): lists the trainee's own
  saved `UrgeArc`/`ThoughtArc`/`BeliefArc` records and opens the
  EXISTING `live/UrgeArcLiveScreen.tsx`/`ThoughtArcLiveScreen.tsx`/
  `BeliefArcLiveScreen.tsx` (and, by extension, whatever Mini-ARC mode
  choice each of those screens already offers when a linked
  `MiniArcBuild` exists — Stage V, see below). Each of those 4 LIVE
  screens (Urge/Thought/Belief/Presence) gained a new `returnToTaskId`
  param, mirroring `live/LiveSessionScreen.tsx`'s own existing
  `fourWeekGoalId`/`pdProgramId`/`thenIdentityGoalId` "return context"
  precedent exactly — practicing a saved protocol from a task now
  returns to that exact task, never a generic dashboard.
- **Stage Q/T** — `arc/reviewLaterFactor.ts` (pure) +
  `live/NewFactorCaptureScreen.tsx` (route `/tasks/[id]/factor/new`,
  shared across urge/thought/belief): a short text label (+ a
  deterministic "need" chip for urges only, 10 fixed options) is saved
  as an append-only `ReviewLaterFactor` (`data/storage.ts`'s
  `appendReviewLaterFactor`) — **never** a real `UrgeArc`/`ThoughtArc`/
  `BeliefArc` record; turning it into one stays a deliberate, later
  BUILD action. Always continues into Stage O's neutral regulation,
  never a long mid-task investigation. `arc/thoughtVsBeliefGate.ts`
  (Stage T) asks its one deterministic question before every new
  thought/belief capture; "I don't know" resolves to the shorter
  neutral thought route, per spec.
- **Stage U** — `arc/taskSupportRoutes.ts` (pure) + 4 screens:
  `live/PresenceProtocolScreen.tsx` (a 0-10 rating → the spec's own
  literal 3-band rule: 7-10 skip, 4-6 two stages, 1-3 three stages —
  deliberately a NEW, simpler, task-reactive embedded Presence,
  distinct from `arc/presenceLive.ts`'s own 2-band split for saved
  `PresenceArc`s, which is untouched); `live/LowEnergyScreen.tsx` (never
  routed into an emotional protocol); `live/PracticalTaskSupportScreen.tsx`
  (6 practical questions, narrows `Task.currentAction` via the existing
  `setTaskCurrentAction`, never `firstAction`, and sets
  `expectedDurationMinutes` when a start time is chosen); and
  `live/ExternalInterruptionScreen.tsx` (4 choices; reschedule/return-later
  reuse the task's own existing postpone prompt via `openPostpone=1`,
  never a duplicated postponement UI).
- **Reachability**: `ActiveTaskScreen.tsx`'s "משהו מפריע" button (both
  pre-start and during an active timer) now opens this whole new
  chooser; "בוא נעשה ARC עכשיו" is unchanged (still the general
  `/live/select`, now also available pre-start, not just during the
  timer). All 9 new routes are registered in `app/_layout.tsx`.
- 19+13+4+2+5 = 43 new automated tests across
  `arc/reactiveFactorChooser.test.ts`, `arc/neutralRegulation.test.ts`,
  `arc/emotionIdentification.test.ts`,
  `arc/predefinedEmotionProtocols.test.ts`,
  `arc/reviewLaterFactor.test.ts`, `arc/thoughtVsBeliefGate.test.ts`,
  `arc/taskSupportRoutes.test.ts`, and the consolidated wiring guard
  `live/reactiveFactorRoutes.test.ts`.

**Explicitly scoped out / documented gaps for this block:**
- Stage P's own request to EXPAND `UrgeArcEditorScreen.tsx` with new
  fields (prevention mantra, choice mantra, daily positive habit, a
  dedicated task-return action) was **not done** — `UrgeArc` already
  has most of the requested shape (name, interferingAction, needs,
  stopCue, regulationAnchor, encodingMantra, beneficialAlternativeAction)
  from before this task, and editing that large, unfamiliar existing
  screen without a dedicated investigation pass risked a rushed
  regression for marginal benefit this pass. The CORE requirement
  ("built in BUILD, selected in LIVE," full ARC-method LIVE route) was
  already true before this task and is now also reachable from a task.
- Stage U's own "retain editable dwell times" — every new step sequence
  (preparation, emotion protocols, neutral regulation, presence) uses a
  fixed, safe default pace with no dwell-configuration UI yet.
- Stage V (Mini ARC integration) is **substantially satisfied by reuse**
  rather than new code: Urge/Thought/Belief's own existing mini-mode
  choice (already built into their LIVE screens before this task) is
  now reachable from a task via Stage P/R/S's wiring; the 7 predefined
  emotion protocols (Stage N) and the neutral protocol (Stage O) are
  themselves already "mini-length" (≤3 exercises) by construction. The
  one remaining gap: a task whose `linkedArcBuildId` points at a
  State-target `ArcBuild` with its own linked `MiniArcBuild` has no way
  to choose the Mini version from the task's "ARC" end-of-timer button
  — `resolveArcChoiceDestination` always opens the full `/live` session.
  Not fixed this pass (changing that function's own contract touches
  `arc/taskTimerEndChoice.ts`, tested elsewhere, and deserves its own
  dedicated look rather than a rushed edit).
- No journal/insights entries are written yet for ANY of these new
  routes (emotion/urge/thought/belief/presence/energy/practical/
  interruption) — Stage Y (journal) is not started; nothing from this
  block is recorded to `data/taskJournal.ts` yet.
- Postponement from `ExternalInterruptionScreen` reuses the existing
  bare postpone prompt (reason text only) — Stage W's own fuller
  postponement question flow (why/practical-or-internal/when/first
  action/ARC-now/supportive-state) is not built yet.

### Stage W — Full postponement question flow (done, automatically verified)
`arc/postponementDraft.ts` (pure): the 6-question draft + `resolvePostponementReturnAt` (an explicit "unscheduled" choice is a real, valid, selectable answer — never merely a fallback for a skipped question) + `buildPostponedTask` (narrows `currentAction`, never `firstAction`; saves the chosen supportive state as the task's new `defaultSupportiveStateId`, read back automatically by Stage K's own preparation screen next time). `live/PostponementScreen.tsx` (route `/tasks/[id]/postpone`) **replaces** `ActiveTaskScreen.tsx`'s previous bare "reason text only" inline prompt entirely (the inline `showPostpone`/`postponeReason`/`handlePostponeConfirm` state and UI were removed, not left as a second path) — "דחיית המשימה" and every `openPostpone=1` auto-action (Today's card, `ExternalInterruptionScreen`) now land here. "Do you want ARC now?" routes to `/live/select` with `returnToTaskId` after saving; otherwise to `/tasks`.

### Stage X — End-of-session reflection (done, automatically verified)
`live/SessionReflectionScreen.tsx` (route `/tasks/[id]/reflect`) — 3 short, optional questions (returned after ARC / what helped / what to reuse next time), reached only via one explicit, skippable link shown once a task is marked completed. "Did you complete the task?" is skipped since reaching the screen already answers it. Saves one `session_reflection` journal entry; a visible "דילוג" (skip) link saves nothing.

### Stage Y — Journal and factual insights (done, automatically verified)
- `data/taskJournal.ts` extended additively with the fields its own doc had deliberately deferred until the routes that populate them existed: `interferenceCategory`, `confirmedEmotion`, `savedFactorKind`/`savedFactorId`, `reviewLaterFactorId`, `usedPreparationStateLabel`, and the 3 `session_reflection` fields. New `createTaskJournalEntry` builder (defaults every field to `null` except what the caller states) and `normalizeTaskJournalEntry` (backfills a pre-Stage-Y row) — `data/storage.ts`'s `loadTaskJournal` now normalizes on read.
- **Every route built in Stages L–U, K, W, and X now actually writes to the journal**: `ActiveTaskScreen.tsx` (`attempt_started`/`attempt_ended`/`task_completed`, reusing the task timer's own `runId` as the journal `attemptId`), `ReactiveFactorChooserScreen.tsx` (`interference_reported`), `EmotionIdentificationScreen.tsx`/`NeutralRegulationScreen.tsx`/`PresenceProtocolScreen.tsx`/`LowEnergyScreen.tsx`/`PracticalTaskSupportScreen.tsx`/`ExternalInterruptionScreen.tsx` (`protocol_run_completed`, each tagging its own `interferenceCategory`), `PreparationScreen.tsx` (`protocol_run_completed` with `usedPreparationStateLabel`, gated so "start directly" with no chosen state logs nothing), and `PostponementScreen.tsx` (`postponed`). `SavedFactorChooserScreen.tsx`/`NewFactorCaptureScreen.tsx` deliberately do NOT journal themselves (see gaps below).
- `arc/taskInsights.ts` (pure): plain frequency counts only — most-frequent interference category, most-frequent confirmed emotion, most-used preparation state, the ARC-to-task return percentage, and common postponement hours (by local hour, never UTC). Explicitly does NOT compute "regulation tool associated with return" or "completion after preparation" (no discrete regulation-tool field exists yet; a honest completion-correlation needs a join this pass doesn't have the data for) — inventing either would risk exactly the overclaim this stage forbids.
- `live/TaskInsightsScreen.tsx` (route `/tasks/insights`, linked from `TodayScreen.tsx`) renders only those counts, with the spec's own exact wording style ("נבחר X ב-N פעמים", never "יש לך בעיית X"). An empty journal shows a plain "not enough data yet" message, never a crash or a fabricated number.
- 6 tests in `arc/taskInsights.test.ts`, 3 in `data/taskJournal.test.ts`, plus wiring tests in `live/taskInsightsScreen.test.ts`, `live/postponementScreen.test.ts`, `live/postponementAndReflection.test.ts`, and additions to `live/preparationScreen.test.ts`/`live/activeTaskScreen.test.ts`.

**Explicitly scoped out / documented gaps for this block:**
- `SavedFactorChooserScreen.tsx` → the existing `UrgeArc`/`ThoughtArc`/`BeliefArc` LIVE screens (practicing a SAVED protocol) do not yet write a `protocol_run_completed` journal entry with `savedFactorKind`/`savedFactorId` — those screens are shared with many other, unrelated flows (Personal Development, ARC Goal, four-week programs) and adding task-specific journaling inside them was judged too risky to do safely in this pass without a dedicated look. The fields exist on `TaskJournalEntry` and are ready for this once that look happens.
- `NewFactorCaptureScreen.tsx` does not log `interference_reported`/`reviewLaterFactorId` to the journal either (same reasoning: kept minimal, the `ReviewLaterFactor` record itself is the durable source of truth for this data).
- "Regulation tool associated with task return" and "completion after preparation" insights are not computed (see `arc/taskInsights.ts`'s own doc for why).
- No UI yet surfaces the raw `ReviewLaterFactor`/journal rows for a human (coach) review pass — Stage Z may want this.

### Stage Z — Coaching workspace integration (done, automatically verified)
`arc/coachingWorkspace.ts` (pure) + `arc/coachingSessionPrep.ts` (pure):
a durable, append/update "coaching workspace" entry (one per trainee,
keyed by a fixed id) that pulls together exactly the factual material a
human coach/trainee review session needs -- the raw `ReviewLaterFactor`
rows and journal-derived counts Stage Y's own doc flagged as not yet
surfaced anywhere ("No UI yet surfaces the raw ReviewLaterFactor/journal
rows for a human (coach) review pass -- Stage Z may want this"), plus a
short free-text notes field the trainee can edit between sessions. Never
invents a diagnosis or recommendation -- `coachingSessionPrep.ts` only
assembles what already exists (unresolved review-later factors,
`arc/taskInsights.ts`'s own existing counts) into one read screen; no new
inference. `data/storage.ts` gained `loadCoachingWorkspaceEntries`/
`upsertCoachingWorkspaceEntry`. `live/CoachingWorkspaceScreen.tsx` (route
`/coaching`) and `live/CoachingSessionPrepScreen.tsx` (route
`/coaching/prepare`), both registered in `app/_layout.tsx`, reachable from
`build/TodayScreen.tsx`'s new "סדנת אימון" link. 4+4 tests in
`arc/coachingWorkspace.test.ts`/`arc/coachingSessionPrep.test.ts`, 7
wiring tests in `live/coachingWorkspace.test.ts`.

### Stage AA — Manifest Meditation integration (done, automatically verified)
`arc/manifestMeditationDataSources.ts` (pure): deterministic suggestion
functions that read the trainee's own already-saved data --
`suggestValuesFromIdentityProfiles`/`suggestIdentitiesFromIdentityProfiles`/
`suggestPersonalSentencesFromIdentityProfiles` read `IdentityProfile`
(the existing values/identities library -- reused, never duplicated) and
`suggestHabitsFromRecurringTasks` reads the trainee's own recurring
tasks. Every suggestion is an explicit, reviewable, appendable option --
never auto-inserted into the meditation content. `live/ManifestMeditationScreen.tsx`
gained append buttons for each suggestion category, a "today's action"
suggestion sourced from `arc/todaySchedule.ts`'s own `buildTodaySections`
(the same pure function Today's screen already uses -- no second
schedule-reading path), and a "turn into task" action that requires an
explicit confirm step before calling `createTaskFromTodaysAction` (never
silently creating a task from meditation content). 4 tests in
`arc/manifestMeditationDataSources.test.ts` (plus a fixed test-helper bug
where `overrides` wasn't spread, silently nullifying 3 of 4 override
assertions), 6 wiring tests in `live/manifestMeditationDataIntegration.test.ts`.

### Stage AB — Notifications and permissions completeness (done, automatically verified)
Closes the two remaining Stage E/Stage AB gaps this doc had tracked
("contextual, explanatory permission-request copy" and "rest/postponed-
return notification kinds beyond timer-completion"):
- `data/storage.ts`'s `ReminderKind` union gains `"restTimerEnded"` and
  `"postponedTaskReturn"` (additive, alongside the existing
  `"taskTimerEnded"`) -- reuses the exact same generic
  `scheduleReminderNotification` mechanism, never a second notification
  path. `app/_layout.tsx`'s `handleReminderResponse` deep-link branch
  extended to all 3 kinds.
- `live/ActiveTaskScreen.tsx`: the rest timer now schedules and persists
  its own notification id (`scheduleRestTimerNotification`), and every
  path that ends a timer early (finish-early, the ordinary end-of-timer
  flow, starting a fresh timer over a stale one) now explicitly cancels
  whatever notification id was left on the task/run, closing a real
  "stale notification still fires after the timer it described no longer
  applies" gap. A one-time, dismissible permission-explanation notice
  (`hasSeenNotificationExplanation`/`markNotificationExplanationSeen`)
  shows in-app context BEFORE the bare OS permission dialog, rather than
  the OS dialog appearing with no explanation.
- `live/PostponementScreen.tsx`: cancels the task's existing
  `notificationId` before scheduling a new one, and -- when the trainee
  chose a concrete `returnAt` -- schedules a `"postponedTaskReturn"`
  reminder for exactly that time, persisting the new id/scheduled-for
  onto the task (closing Stage E's "recurring tasks / scheduled-date
  reminders... still not wired" gap for the postponement-return case
  specifically; a plain `scheduledDate`/`scheduledTime` reminder
  unrelated to postponement is still not wired -- see remaining
  limitations).
- `build/TaskEditorScreen.tsx`'s `handleArchive` now also cancels any
  pending notification for the task being archived (an archived task
  must never still ring).
- 7 tests in `live/notificationCompleteness.test.ts`, plus window-size
  adjustments to 2 tests each in `live/activeTaskScreen.test.ts`/
  `live/postponementScreen.test.ts` (source-text tests whose asserted
  substring shifted past the test's fixed read window after legitimate
  new code was added earlier in the same function -- the window was
  widened, the correct production logic was never changed to make a test
  pass).

**Still not built from Stage AB's original list:** interactive OS
notification action buttons (3 inline buttons on a locked-screen
notification) -- confirmed zero precedent anywhere in this codebase, and
the spec's own sanctioned single-tap-opens-the-choice-screen fallback is
already built and working; a true foreground overlay banner visible
across any screen (not just the task's own); a plain scheduled-date/time
reminder for a task that is not in a postponed-return state.

### Stage AC — Data integrity and library reference safety (done, automatically verified)
"Never silently delete referenced data" applied to every place this
codebase can actually hard-delete a record a Task may point at:
- `arc/taskLibraryUsage.ts` (NEW, pure) -- `findTasksReferencingArcBuild`/
  `findTasksReferencingArcGoal`/`findTasksReferencingStateProfile` (an
  archived task's own reference never counts, same convention as the
  existing `arc/libraryItemUsage.ts`), `isReferencedByAnyTask`, and
  `unlinkArcBuildFromTasks`/`unlinkArcGoalFromTasks`/
  `unlinkStateProfileFromTasks` (clear exactly the one reference field on
  every affected task, touching no other field, never deleting the task
  itself). 5 tests in `arc/taskLibraryUsage.test.ts`.
- `build/ArcBuildListScreen.tsx` and `build/ArcGoalListScreen.tsx`: both
  now load `tasks` alongside their own list, and `handleDelete` unlinks
  every referencing task (via the module above) BEFORE calling the
  existing `deleteArcBuild`/`deleteArcGoal` -- a task that pointed at a
  deleted build/goal is left with a cleared link and every other field
  intact, never a dangling id. The delete-confirmation modal on both
  screens now shows the referencing-task count so the trainee knows what
  will be affected before confirming.
- A real correctness gap found and fixed while confirming there is no
  StateProfile delete path to patch (there isn't -- StateProfiles are
  only ever disabled/archived, never hard-deleted, confirmed via a
  repo-wide search): `arc/preparationStates.ts`'s `resolvePreparationSource`
  previously matched a saved `StateProfile` by id regardless of its
  `status`, so a disabled or archived profile would still be silently
  offered/used as if it were an active choice. Fixed to require
  `status === "enabled"`, treating a disabled/archived profile exactly
  like a deleted one (the profile record itself is untouched -- only no
  longer surfaced here, preserving the library's own disable-only
  convention). A new test in `arc/preparationStates.test.ts` covers both
  the disabled and archived cases; the existing test for this function
  was unaffected since `createEmptyStateProfile` already defaults to
  `status: "enabled"`.

**Explicitly scoped out / documented gap:** chip-picker-level filtering
(so a disabled/archived StateProfile is not even offered as a choice in
`TaskEditorScreen`/`PreparationScreen`/`PostponementScreen`'s own chip
rows) was not added this pass -- `resolvePreparationSource`'s fix is the
correctness-critical half (never silently RUNNING a retired profile);
the chip rows themselves still read the full saved-profile list, so a
disabled/archived profile could still be seen (but not successfully
chosen-and-run) in those pickers. Lower priority, tracked for a future
pass.

### Stage AD — Accessibility and Hebrew UI quality pass (done, automatically verified)
A dedicated research pass (not guesswork) catalogued concrete findings
across all 22 screens added/modified in Stages G–AC, against 5 categories
the spec itself named: confirmation before destructive actions, loading/
empty/error states, RTL correctness, touch target size, and consistent
terminology. Findings and what was done about each:

- **Confirmation before destructive actions**: `build/TaskEditorScreen.tsx`'s
  "העברה לארכיון" (archive) button previously archived immediately on tap
  -- now opens a confirm Modal first (mirroring `ArcBuildListScreen.tsx`/
  `ArcGoalListScreen.tsx`'s own existing confirm-before-delete pattern
  exactly), `handleArchive` itself only ever wired to the modal's own
  confirm button. `live/CoachingWorkspaceScreen.tsx`'s "ביטול" while
  editing a free-text workspace note (discards typed text, no confirm)
  was reviewed and deliberately left as-is: a plain "cancel this text
  edit" is a universally-expected, low-stakes UI pattern (no task data,
  no irreversible record), and adding a confirm dialog there would be
  friction, not safety.
- **Loading/empty/error states**: 10 screens previously rendered a
  silent, completely blank `View` while their own async data loaded
  (`EmotionIdentificationScreen`, `NeutralRegulationScreen`,
  `SavedFactorChooserScreen`, `PostponementScreen`,
  `SessionReflectionScreen`, `CoachingWorkspaceScreen`,
  `CoachingSessionPrepScreen`, `TaskInsightsScreen`,
  `ArcBuildListScreen`, `ArcGoalListScreen`) -- every one now shows a
  visible "טוען..." hint, matching the exact pattern
  `TodayScreen.tsx`/`TaskEditorScreen.tsx`/`ActiveTaskScreen.tsx` already
  used. Every one of these screens already had a correct, real
  empty-state message once data loads empty -- only the loading flash
  itself was silent.
- **RTL correctness**: audited and found NOT to be a defect -- the
  `"row"` + `flex-end`/`"center"` pattern used by every new chip row and
  Yes/No-style button pair exactly matches heavy pre-existing precedent
  (`build/ArcBuildProfileForm.tsx`'s own `chipRow`, `live/screens.tsx`'s
  `YesNoButtons`). No `I18nManager` RTL-forcing exists anywhere in this
  codebase, so `"row-reverse"` is reserved codebase-wide for genuinely
  order-sensitive action rows only (e.g. a list row's name-vs-actions
  split) -- the new screens don't violate that split. No change made.
- **Touch target size**: `live/ActiveTaskScreen.tsx`'s subtask
  completion toggle (a bare ✓/○ glyph, ~20×19pt, the smallest target in
  the whole set) gained a 12pt `hitSlop` on all sides.
  `live/PresenceProtocolScreen.tsx`'s 0-10 rating chips (11 adjacent
  single-digit targets) had their `paddingVertical`/`minWidth` bumped to
  meet the ~44pt guideline.
- **Consistent terminology**: `live/SessionReflectionScreen.tsx`'s skip
  link said "דילוג" (a noun form) where every other plain "skip this
  step" link in the new screens (`NewFactorCaptureScreen.tsx`) says "דלג"
  (the verb form) -- standardized to "דלג". The three "דלג והתחל"
  ("skip and start the task") links (`PreparationScreen`,
  `EmotionIdentificationScreen`, `LowEnergyScreen`) were confirmed
  consistent with each other and NOT merged with plain "skip," since they
  genuinely combine two actions a plain skip link doesn't. The
  "חזרה"/"ביטול" pair sharing a `backButton` style across
  `PreparationScreen`/`ManifestMeditationScreen`/`CoachingWorkspaceScreen`
  was reviewed and found correct, not inconsistent: "חזרה" is used only
  for a genuine "go back a step" with nothing to lose, "ביטול" only for
  declining a confirm prompt or discarding in-progress typed text --
  different words for genuinely different actions that happen to share
  one CSS class name.
- 5 new regression tests in `live/stageADAccessibility.test.ts` (source-text
  guards: every fixed loading screen shows "טוען...", the hitSlop/chip
  touch-target fixes are in place, the skip-wording standardization, and
  the archive-confirm wiring), plus 1 new test in
  `build/taskEditorScreen.test.ts` for the archive-confirm modal
  specifically.

**Explicitly out of scope for this pass** (same reasoning as every prior
stage's own documented gaps): a full screen-reader audit
(`accessibilityLabel`/`accessibilityRole` on every Pressable) was not
added -- the wider pre-existing codebase itself has only a thin,
3-file precedent for this, so adding it comprehensively to 92 Pressables
across 22 new screens would be a codebase-wide accessibility initiative
beyond this specific roadmap's own new screens, not a regression this
roadmap introduced; tracked as a known limitation for a future dedicated
pass, not fixed here.

### Stage AE — Manual device-test checklist (written only, NOT executed)
`MANUAL_TEST_CHECKLIST.md` (new, repo root): a comprehensive, section-by-
section checklist covering every screen/flow added across Stages G–AD --
navigation, Today, task creation/editing (including the new Stage AD
archive-confirm modal), the active-task timer (including the rest-timer
notification and subtask-toggle hitSlop), preparation, every reactive
factor-chooser sub-route (emotion/neutral/saved urge-thought-belief/new-
factor-capture/presence/energy/practical/external-interruption),
postponement, session reflection, journal/insights, the coaching
workspace, the Manifest Meditation integration, notification
completeness, the Stage AC data-integrity/unlink behavior, the Stage AD
accessibility fixes themselves, and cross-cutting checks (app-kill/
restart recovery, `returnToTaskId` return-context coverage and its known
gaps, a no-regression spot-check of pre-existing BUILD/LIVE/Personal
Development/Goal Achievement/Mini ARC/ARC Link flows). States plainly at
the top, and means it: **nothing in it has been run**. This is a
document-only stage -- no application code changed; `npx tsc --noEmit`
was re-run as a sanity check and stayed clean.

## Stages A–E (earlier pass): done and automatically verified

### Stage A — BUILD data-model foundations
`arc/emotionStateOptions.ts`, `arc/bodyRegionRoles.ts`,
`arc/bodyRegionMovementPresets.ts` + 11 new additive `ArcBuildProfile`
fields + `DwellTimes.bridgeToActionDwellSeconds`, `arc/mantras.ts`'s
Prevention/Choice mantras.

### Stage B — BUILD UI wiring
Three new accordion sections in `build/ArcBuildProfileForm.tsx` (collapsed
by default), full `build/profileWizard.ts` round-trip wiring.

### Stage C1 — new LIVE stage "Bridge to Action"
Inserted between Encode and Act, gated on `hasBridgeToActionContent` so
every unconfigured/legacy build is unaffected.

### Stage C2 — movement-aware Stay/Accept/Regulate copy
Additive body-region movement lines, gated on `bodyRegionConfigs`.

### Sequencing correction (post-hoc, user-flagged)
**The opening movement (spec step 4) was originally missing entirely** —
only the later, noticing-only reference (step 6, in Stay) existed. Fixed:
the real opening-movement performance now happens at `observer_pause`
(the existing stage immediately before Presence), and Stay was corrected
to only ever NOTICE that same region, never re-perform the movement.
Verified with a dedicated regression test asserting the movement text
appears at `observer_pause` and never at `stay`. Also added at
`observer_pause`: the pre-movement air-contact line (step 3, using
`preMovementAirContactRegion`).
**Accept (step 7, starts the supportive movement) and Regulate (step 8,
expands it) were already correctly ordered** — confirmed by a dedicated
test, no change needed there.

### Stage C3 — pre-practice gate
`arc/preSessionGate.ts` (pure, 3 optional questions, suggestion-only
threshold) + `live/PreSessionGateScreen.tsx` at route `/live/gate`.
**Not yet linked from any existing dashboard button** — reachable only at
its own route; wiring a specific entry point through it is a deliberate
follow-up decision, not done here to avoid risking the many existing
navigation-wiring regression tests.

### Stage C4 — dual trigger-imagery for a new "preparation" practice mode
New `ArcLiveState.practiceMode: "real_time" | "preparation"` (defaults to
`"real_time"` — every existing session unaffected). Early appearance
folded into `trigger_selection`'s own copy (step 1 awakening sentence +
step 2 trigger imagery); second appearance is a new `trigger_imagery_repeat`
stage inserted between Regulate and Encode, gated on preparation mode +
a configured trigger (`ArcBuildProfile.linkSettings.triggerText`, reused
directly — no new BUILD field needed). Added a new sanctioned
`containsInductionPattern` whitelist entry ("דמיין את הרגע הבא") after a
test caught the new copy tripping the existing safety denylist — fixed
by rewording, not by weakening the denylist.
**Known gap: there is still no UI control anywhere for a trainee to
actually choose "preparation" mode** — the field exists and the engine/
copy logic is fully built and tested, but nothing currently sets it to
anything other than the default `"real_time"`. This needs a chooser step
wired into session start before the feature is reachable end-to-end.

### Stage C5 — post-practice rating + "was it performed?"
Two new optional fields on `GratitudeAndLearningScreen`, session-local
state in `LiveSessionScreen.tsx`, never gating Continue. Made optional on
`ArcLiveRenderer`'s shared props type so the three *other* screens reusing
that renderer (ArcGoal, Identity Extension sessions) were never forced to
wire fields unrelated to their own flows.

### Stage D — Manifest Meditation (new page)
`arc/manifestMeditation.ts` (list-shaped values/identities/goals/personal
sentences — genuinely new, since every existing value/identity field in
this codebase is a single string) + `live/ManifestMeditationScreen.tsx`
at route `/manifest-meditation`. Duration (5/10/15/20 min) divides evenly
across the 7 content stages as a per-stage dwell — deliberately its own
bounds (10–600s), not ARC's 1–120s dwell cap, since that cap would have
silently made the 20-minute option impossible to actually reach (caught
by a test). Added a second new safety-denylist whitelist entry ("דמיין
יום שבו אתה פועל") for the day-imagery line. Text-only, confirmed no
TTS/audio capability exists anywhere in this codebase.
**Not yet linked from any dashboard** — reachable only at its own route.

### Stage E — Goals/Tasks/Timer page
Builds on the Task model from the earlier (English) task-management
request (`arc/tasks.ts`, `data/taskJournal.ts`, already-existing storage
CRUD). New this pass:
- `arc/taskTimer.ts` — pause-aware, timestamp-based timer (never a tick
  counter; backgrounding-safe by construction, same philosophy as
  `arc/actionTimer.ts`). Pause freezes elapsed time exactly; resume folds
  the real pause duration back in. 11 tests covering multi-cycle
  pause/resume, backgrounding-equivalent long gaps, and idempotent
  early-finish.
- `arc/taskTimerEndChoice.ts` — the 3 end-of-timer choices (ARC / rest /
  next task), pure.
- `Task.linkedArcBuildId` — new additive field (distinct from the
  existing `linkedArcGoalId`) so a task can link directly to an ARC
  practice.
- `data/storage.ts` — single-slot `TaskTimerRun` persistence
  (`loadTaskTimerRun`/`saveTaskTimerRun`/`clearTaskTimerRun`), kept
  deliberately separate from the existing ARC-internal `TimerRun`/
  `TimerType` (a different, fixed 7-value union).
- `build/TasksListScreen.tsx` (route `/tasks`) — minimal creation
  (title + first action) + list.
- `live/ActiveTaskScreen.tsx` (route `/tasks/[id]`) — Start/Pause/Resume/
  Finish-early, the 3-choice end-of-timer prompt, postpone, and a
  separate, always-available "mark complete" action (the spec's own
  explicit "timer ended" vs "task completed" distinction, verified by a
  dedicated test that the end-of-timer prompt never itself calls
  `completeTask`).
- **Notifications**: new `ReminderKind: "taskTimerEnded"` +
  `scheduleReminderNotification`'s existing generic mechanism (reused,
  not duplicated) + a new branch in `app/_layout.tsx`'s
  `handleReminderResponse` that deep-links a tapped notification straight
  to the task's own screen — this is the spec's **own explicitly
  sanctioned fallback** ("if not all three choices fit in the
  notification, tapping it opens the choice screen"), so it is spec-
  compliant, not a shortcut. Scheduled on start/resume for the exact
  remaining duration, cancelled on pause/finish-early/postpone.

## Known gaps in Stage E (explicitly not built this pass; status as of the newer G–K roadmap below)

- **Interactive OS notification action buttons** (3 inline buttons on a
  locked-screen notification) — confirmed zero precedent anywhere in this
  codebase; would need `Notifications.setNotificationCategoryAsync` +
  reading `response.actionIdentifier`. Using the spec's own sanctioned
  single-tap fallback instead (built, above). Still not built — tracked
  for the newer roadmap's Stage AB.
- **A true foreground overlay banner** (visible across any screen, not
  just the task's own) — still not built. The 3-choice prompt only
  renders while the trainee is on `/tasks/[id]` itself.
- **Contextual, explanatory permission-request copy** — still not built;
  `ensurePermissionAsync` still shows the bare OS dialog with no
  in-app explanation first. Tracked for Stage AB.
- ~~Rest-timer persistence across backgrounding~~ — **closed in Stage J**
  (see above): the rest timer now persists through the same
  `TaskTimerRun` storage slot, tagged `kind: "rest"`.
- **Recurring tasks / scheduled-date reminders** (distinct from the
  timer-completion notification above) — recurring tasks themselves are
  now fully modeled and rendered (Stage I's `arc/todaySchedule.ts` +
  `arc/taskOccurrence.ts`, Stage H's recurrence-day picker), but a
  scheduled-date/time REMINDER notification (as opposed to the
  timer-completion one, which works) is still not wired. Tracked for
  Stage AB.
- ~~"Today" view~~ — **closed in Stage I** (`build/TodayScreen.tsx`).
- ~~Linking a task to an ArcGoal or a specific ArcBuild from the creation
  UI~~ — **closed in Stage H** (`build/TaskEditorScreen.tsx`'s chip
  pickers).

## Still not started (as of Stage AE; AF remains)

- A full screen-reader (`accessibilityLabel`/`accessibilityRole`) audit
  across every new Pressable (see Stage AD's own documented gap above)
  -- a pre-existing, codebase-wide gap, not unique to this roadmap.
- Actually RUNNING `MANUAL_TEST_CHECKLIST.md` (Stage AE) on a real
  device -- the checklist itself is written, but every box in it is
  still unchecked.
- **Stage AF** — final consolidation: re-run tsc/full tests/lint one last
  time, list every file added/changed across the whole roadmap, summarize
  every completed stage, list every remaining known limitation, and
  explicitly separate automated-verified work from manual/device-untested
  work.
- Return-to-task context for ARC Goal, Mini ARC, combined Personal
  Development routes, and the Future ARC Link button (see Stage J's own
  "known remaining gap" above) — only the ArcBuild "ARC רגיל" path
  carries it so far.
- `SavedFactorChooserScreen.tsx`/`NewFactorCaptureScreen.tsx` still do not
  write journal entries (see Stage Y's own documented gap above).
- A plain scheduled-date/time reminder for a task not in a
  postponed-return state (see Stage AB's own documented gap above).
- Chip-picker-level filtering of disabled/archived StateProfiles in
  TaskEditorScreen/PreparationScreen/PostponementScreen (see Stage AC's
  own documented gap above).
- A BUILD-side UI for `Task.linkedArcBuildId`/`linkedArcGoalId`.

## What still needs manual phone/device testing — nothing below has been run on a device

**See `MANUAL_TEST_CHECKLIST.md` (Stage AE) for the comprehensive,
section-by-section checklist covering every screen/flow from Stages
G–AD.** The list below predates that file (Stages A–K) and is kept for
history; nothing in either list has been executed.

- Every new BUILD accordion section (chip selection, multi-region
  add/remove, keyboard interaction).
- The Bridge to Action LIVE screen, the corrected opening-movement
  sequencing (observer_pause vs. stay), and the dual trigger-imagery
  placement, all in a real session.
- The Manifest Meditation screen's full setup → practice flow.
- The Tasks list → active task screen → timer (start, pause across a
  real backgrounding, resume, finish early) → end-of-timer prompt → each
  of the 3 choices.
- The scheduled local notification actually arriving while backgrounded/
  locked, and tapping it landing on the right task.
- Saving/reopening the app to confirm every new field round-trips through
  real AsyncStorage (unit-tested against the real functions, but not
  exercised through the real native module).
- Home's new third mode button → Today screen → each of its entry
  points (Tasks, BUILD, LIVE gate, Manifest Meditation) and card actions
  (start/postpone/complete/edit/prepare), in a real session.
- The full task editor (`/tasks/[id]/edit`): every field, the recurrence
  day-chip picker, subtask add/remove, the ArcGoal/ArcBuild/supportive-
  state chip pickers, save, and archive.
- The rest-timer surviving a real app kill/restart mid-rest (persistence
  logic is unit-tested; the real AsyncStorage round-trip through an
  actual app restart is not).
- Starting ARC from a task ("משהו מפריע"/"בוא נעשה ARC עכשיו"/the
  end-of-timer ARC choice) and confirming it actually returns to the
  exact same task afterward, on a real device.
- The full preparation flow (`/tasks/[id]/prepare`): each of the 8
  predefined states, a linked saved StateProfile, and the "start
  directly" skip, confirming each one actually opens and auto-starts
  the task's timer.
- Every screen touched in Stage AD: confirming the archive-confirm
  modal actually renders and blocks accidental taps on a real device,
  that the new "טוען..." loading hints actually appear (even briefly)
  rather than a flash of blank white, that the enlarged subtask-checkbox
  hitSlop and bumped presence-rating chip size are actually easier to
  tap with a real finger, and that every RTL layout decided "not a
  defect" by source-code review alone actually reads correctly
  right-to-left in a real Hebrew-locale render.
