# M5 physical-device verification pack

**Status: Implementation complete. Device verification in progress - 15/47 cases
passed on one API 33 device (the original 46 remain at 14; case 47, the F1
re-verification, and the stale-snooze path passed on 2026-10-28); the API 26-30
leg has not started.**

This pack covers the M5 acceptance criteria for real task storage, recurrence,
reminders, and notification reconciliation. M5 is not complete until every case
below has device evidence on at least one physical device, and the
reminder/time-zone/DST cases have evidence on a second device with a different
Android version.

M4 delivery behavior (screen-off delivery, force-stop recovery, channel
blocking, Doze) is already signed off by the user and archived in
[`docs/m4-device-verification-pack.md`](m4-device-verification-pack.md). M5
cases focus on what changed: SQLite being the source of truth, floating local
times, recurrence materialization, and reconciliation after every trigger.

## Required devices and Android versions

| Role                   | Required Android version   | Why                                                                  |
| ---------------------- | -------------------------- | -------------------------------------------------------------------- |
| Legacy baseline        | Android 8.0-11 (API 26-30) | minSdk 26, `java.time`, notification channels, no exact-alarm toggle |
| Modern baseline        | Android 13+ (API 33+)      | `POST_NOTIFICATIONS`, exact-alarm access, per-app alarm controls     |
| Latest target behavior | Android 16 / API 36        | targetSdk 36 edge-to-edge and platform behavior                      |
| OEM power sample       | Any supported OEM          | OEM battery restrictions on boot and background receivers            |

Required for sign-off:

- At least one physical device at API 26-30 and one at API 33+.
- A device whose time zone can be changed offline (all of them can, but record
  whether automatic time/zone was disabled first).
- A DST-observing zone for cases 30-31 (`America/New_York` or
  `Europe/Berlin`) and a non-DST zone for the control cases.

## Build and install

From the repository root, with a device visible to `adb devices -l`:

```powershell
pnpm android:dev
```

Manual fallback:

```powershell
cd apps/mobile/android
.\gradlew.bat :app:assembleDevDebug
adb install -r app\build\outputs\apk\dev\debug\app-dev-debug.apk
adb shell am start -n com.novatask.app.dev/com.novatask.app.MainActivity
```

Useful inspection commands (debuggable build):

```powershell
adb shell run-as com.novatask.app.dev ls -l databases
adb shell run-as com.novatask.app.dev sqlite3 databases/nova.db ".tables"
adb shell run-as com.novatask.app.dev sqlite3 databases/nova.db "select id, title, due_date, due_time, status, series_id from task;"
adb shell run-as com.novatask.app.dev sqlite3 databases/nova.db "select * from recurrence_rule;"
adb shell run-as com.novatask.app.dev sqlite3 databases/nova.db "select * from recurrence_occurrence order by occurrence_date;"
adb shell run-as com.novatask.app.dev sqlite3 databases/nova.db "select * from notification_schedule;"
adb shell dumpsys alarm | findstr /i novatask
adb shell dumpsys notification --noredact | findstr /i novatask
```

`sqlite3` is not present on every device image. If it is missing, copy the
database with
`adb exec-out run-as com.novatask.app.dev cat databases/nova.db > nova.db` and
inspect it locally.

## Run metadata

Copy this block for each device/run.

| Field                 | Value                        |
| --------------------- | ---------------------------- |
| Run ID                |                              |
| Tester                |                              |
| Device manufacturer   |                              |
| Device model          |                              |
| Android release       |                              |
| API level             |                              |
| OEM skin/build number |                              |
| App ID                | `com.novatask.app.dev`       |
| APK build             | `devDebug`                   |
| APK SHA-256           |                              |
| Device time zone      |                              |
| Automatic time zone   | on / off                     |
| Test start (UTC)      |                              |
| Test end (UTC)        |                              |
| Evidence directory    | `artifacts/device-<run-id>/` |
| Reviewer              |                              |

## Evidence conventions

- Store logs, database dumps, screenshots, and `dumpsys` output under
  `artifacts/device-<run-id>/`; `artifacts/` is gitignored.
- Record UTC timestamps in ISO 8601.
- Reference exact file names in the **Evidence** column.
- Include the task row, rule row, occurrence rows, and notification schedule row
  for every recurrence case. A screenshot alone is not evidence of advancement.
- Never mark Pass from a unit test alone.
- A `reminder` row is a definition shared by every occurrence of a recurring
  task, so completing a task cancels its `notification_schedule` row but leaves
  the reminder `scheduled`. Judge completion from the task/occurrence status
  plus the `reminder_event` row, not from `reminder.status`.
- `tools/device-evidence.ps1` pulls the database (with its WAL companions),
  filtered `dumpsys alarm`/`dumpsys notification` output, the exact-alarm
  app-op, and a screenshot into `artifacts/device/<timestamp>/`, then prints a
  row summary.
- `dumpsys notification` also prints the notification archive. Entries that
  appear after the `mArchive=Archive (N notifications)` header are already
  cancelled, so a reminder id there means the notification was dismissed, not
  that it is still in the shade.
- A `notification_schedule.state` of `exact` means the exact alarm was
  accepted; `dumpsys alarm` must show a matching `RTC_WAKEUP` entry per
  scheduled occurrence.

## Captured evidence (2026-10-26, NOTE 24 / API 33)

Each directory under `artifacts/device/` holds `nova.db` (plus WAL), `alarms.txt`,
`notifications.txt`, `exact-alarm.txt`, `app.txt`, and `screen.png`.

| Case | Evidence directory | What it shows                                                                                                                                                                                                                                                |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `20261026-131329`  | `Case 1 task` row with notes, `priority=high`, `due_date=2026-10-26`, `due_time=09:00` (floating strings).                                                                                                                                                   |
| 2    | `20261026-131329`  | Same task id before the edit.                                                                                                                                                                                                                                |
| 2    | `20261026-131552`  | Same id after the edit: `Case 1 task v2`, `due_date=2026-10-27`, `due_time=10:30`, `priority=urgent`; 1 row.                                                                                                                                                 |
| 3    | `20261026-131621`  | Checkbox tap: `status=done`, `completed_at=1793002574218`, Inbox drops to `0 tasks`, undo banner.                                                                                                                                                            |
| 3    | `20261026-131638`  | After Undo: same id back to `status=todo`, `completed_at=null`.                                                                                                                                                                                              |
| 4    | `20261026-131741`  | Reminder added to the task before deleting (`At due time`).                                                                                                                                                                                                  |
| 4    | `20261026-131808`  | `deleted_at=1793002680300`, reminder `status=cancelled`, `notification_schedule` empty.                                                                                                                                                                      |
| 4    | `20261026-131836`  | After Undo: `deleted_at=null`, reminder `scheduled`, exact schedule restored with the same reminder id.                                                                                                                                                      |
| 8    | `20261026-124933`  | Two `subtask` rows on `task_01M5VJHGZTEBTRP6M0KT7VWQ82`: `Buy milk99` `is_completed=1`, `Call plumber` `deleted_at=1793000963637`; detail label reads `1 of 1 subtask`.                                                                                      |
| 10   | `20261026-132353`  | Pre-fire: schedule at 13:26, `state=exact`, `status=scheduled`, one `RTC_WAKEUP` alarm.                                                                                                                                                                      |
| 10   | `20261026-132646`  | 13:26:42: notification `Case 10 exact` posted (live `NotificationRecord`), alarm consumed. `shade.png` shows it.                                                                                                                                             |
| 11   | `20261026-132819`  | `SCHEDULE_EXACT_ALARM: deny`; settings screen reads `Exact alarms: Denied (inexact fallback)`.                                                                                                                                                               |
| 11   | `20261026-132900`  | New reminder schedules with `state=inexact` after the app-op change; alarm still one `RTC_WAKEUP`.                                                                                                                                                           |
| 12   | `20261026-133949`  | Quiet hours enabled (`quiet_hours_enabled=true`) after the switch fix.                                                                                                                                                                                       |
| 12   | `20261026-134419`  | Task due `22:30`; schedule moved to `2026-10-27 07:00` (end of window) with an exact alarm.                                                                                                                                                                  |
| 12   | `20261026-134443`  | Detail shows `Next: Tue, Oct 27 at 7:00 AM`; task still `10:30 PM`, reminder `offset_minutes=0`.                                                                                                                                                             |
| 13   | `20261026-135757`  | Before snooze: `Case 13 snooze` fired at 13:57 with quiet hours `14:00-16:00`; live notification id 5; `shade.png` shows the expanded notification with `Complete` and `Snooze 10 min`.                                                                      |
| 13   | `20261026-135826`  | After tapping `Snooze 10 min` at 13:57:49: `snoozed_until=1793005669644` (14:07:49.644, inside quiet hours) and `state=exact` — not deferred to 16:00; one `RTC_WAKEUP` at 1793005669644; notification id 5 only in `mArchive`; `notification-snooze` event. |
| 13   | `20261026-140806`  | Re-fire: `logcat.txt` shows `14:07:49.674 … schedule_660efd2ca60b3c93 delivery=POSTED`; exactly one live `NotificationRecord` id 5 titled `Case 13 snooze`, snoozed alarm consumed, no duplicate id; `shade.png` shows the single row.                       |
| 14   | `20261026-122221`  | Task `done` + `completed_at`, schedule row cancelled, `notification-complete` event; notification archived.                                                                                                                                                  |
| 5    | `20261026-124318`  | Archived list screenshot (`1 task`), `archived_at=1793000575782`; visible rows drop to 11.                                                                                                                                                                   |
| 5    | `20261026-124349`  | After restore: no archived rows, visible rows back to 12, detail shows `Archive` again.                                                                                                                                                                      |
| 6    | `20261026-124154`  | Pre-duplicate: 2 reminders, 10 schedules, 1 rule, 10 occurrences; 10 `RTC_WAKEUP` alarms.                                                                                                                                                                    |
| 6    | `20261026-124210`  | Copy `task_01M5VJHGZTEBTRP6M0KT7VWQ82`, `series_id=null`; reminder/schedule/rule/occurrence counts unchanged.                                                                                                                                                |
| 7    | `20261026-123831`  | Lists `Inbox` + `Workk`; moved task row `list_id=list_01M5VJ2B1Z8KQYM8RZ3E987KG1`.                                                                                                                                                                           |
| 7    | `20261026-124525`  | Occurrence moved to `Workk`; reminder definition and all 10 exact schedules unchanged; 10 `RTC_WAKEUP` alarms.                                                                                                                                               |

## Captured evidence (2026-10-28, F1/F2 re-verification, NOTE 24 / API 33)

Same device and app id; F2 build (`installDevDebug`) with schema v2. Evidence
directories are gitignored.

| Step                                       | Evidence directory                                                                         | Key observation                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration v1 -> v2 on existing data        | `20261028-112627-f2-migration`                                                             | `pragma user_version=2`; `trigger_seq`/`delivered_seq`/`dismissed_seq`/`dismissed_at` present; prior tasks/events intact; no schedules re-armed.                                               |
| Fire (overdue one-off)                     | `20261028-112943-f2-fire1`                                                                 | `schedule_9caaf8dea48b2799` POSTED at 11:29:16; SQLite still pending until the next reconcile (delivery is not acked by scheduling).                                                           |
| Delivered + visible reconcile              | `20261028-113030-f2-visible-reconcile`                                                     | `state=delivered-active`, `trigger=1`, `delivered=1`; still exactly one live `NotificationRecord`; no second POSTED.                                                                           |
| Snooze from notification                   | `20261028-113141-f2-snoozed`                                                               | `trigger=2`, `delivered=1`, `snoozed_until=11:41:15`, `notification-snooze` event; old notification gone; one new `RTC_WAKEUP`.                                                                |
| Snoozed re-fire (F1)                       | `20261028-114218-f1-refire-foreground`                                                     | POSTED at 11:41:15; after foregrounding the app the notification stayed visible, `trigger=2`, `delivered=2`, `state=delivered-active`, no third POSTED.                                        |
| Dismiss (swipe) + force-stop + relaunch x2 | `20261028-114340-case47-dismissed-relaunch`                                                | "Dismissed reminder ... attempt 2"; `status=fired`, `trigger=2`, `delivered=2`, `dismissed=2`, `dismissed_at` set, `notification-dismiss` event, task still `todo`, no notification, no alarm. |
| Settings reconcile after dismissal         | `20261028-114451-case47-quiet-reconcile`                                                   | Quiet-hours switch toggled (reconcile) -> still no notification and no alarm for the delivered row; row unchanged.                                                                             |
| Recurring occurrence 1 delivered+dismissed | `20261028-115012-case47-recur-dismissed`                                                   | `schedule_df7c...` `delivered=1`, `dismissed=1`, `status=fired`; the 9 later occurrences stay `state=exact` with 9 live app alarms; every task stays `todo`.                                   |
| Deliberate date/time edit after dismissal  | `20261028-115212-case47-edit-newschedule`, `20261028-115241-case47-newschedule-reconciled` | New id `schedule_9e9e3011ce3e4d98`, new request code 12, POSTED at 11:52:00, `trigger=1`, `delivered=1`; old delivered row dropped. The dismissal did not suppress it.                         |

The 9 future recurring alarms were still live at the end of the run
(`live app alarms: 9`), and no reminder notification was left in the shade.

## Captured evidence (2026-10-28, final-build F2 smoke, NOTE 24 / API 33)

Installed with `installDevDebug` over the existing v2 database (data intact).
Directories are under `artifacts/device/` (gitignored).

| Step                                     | Evidence directory                                                | Key observation                                                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Case 47 fire                             | `20261028-1218-final47-smoke/01-fire`                             | `schedule_91aec4b2318b6c4b` POSTED once at 12:30:00; notification id 1 live; 9 recurring alarms; SQLite still pending until the next reconcile.                                                                                             |
| Delivered + visible reconcile            | `20261028-1218-final47-smoke/02-visible-reconcile`                | Foreground reconcile moved the row to `state=delivered-active`, `trigger=1`, `delivered=1`; 3 live notifications stayed visible; no new POSTED.                                                                                             |
| Swipe dismiss + force-stop + relaunch x2 | `20261028-1218-final47-smoke/03-dismissed-relaunch`               | Log "Dismissed reminder schedule_91aec4b2318b6c4b attempt 1"; notification removed; app relaunched twice.                                                                                                                                   |
| Post-relaunch check                      | `20261028-1218-final47-smoke/04-relaunch-check`                   | `status=fired`, `reason=already-delivered`, `trigger=1`, `delivered=1`, `dismissed=1`, `dismissed_at=1793172732737`, `notification-dismiss` event; task still `todo`; 1 POSTED total; 9 alarms; 0 notifications.                            |
| Settings reconcile after dismissal       | `20261028-1218-final47-smoke/05-settings-reconcile`               | Settings screen opened; no re-alert, no new POSTED, delivered row unchanged.                                                                                                                                                                |
| Manual reconcile after dismissal         | `20261028-1218-final47-smoke/06-manual-reconcile`                 | `Reconcile now` tapped at 12:35:49; still 1 POSTED, no alarm for the delivered attempt, 0 live notifications, task still `todo`.                                                                                                            |
| Stale-snooze armed                       | `20261028-1240-final47-stalesnooze/00-armed`                      | `schedule_2508de935da51e64` code 14, due 12:45 exact, `trigger=1`, `delivered=0`.                                                                                                                                                           |
| Stale-snooze fire                        | `20261028-1240-final47-stalesnooze/01-fire`                       | POSTED once at 12:45:00; notification id 14 live; SQLite still pending (delivery recorded natively).                                                                                                                                        |
| Snooze from shade                        | `20261028-1240-final47-stalesnooze/02-shade-snooze`               | Expanded shade shows `Complete` / `Snooze 10 min`; tap at 12:46:28 logs "Snoozed ... until 1793174188429"; old notification removed.                                                                                                        |
| Pre-drain state                          | `20261028-1240-final47-stalesnooze/03-pre-reconcile`              | SQLite `trigger=1`, `delivered=0`, `snoozed=null`; native cache `triggerSeq=2`, `deliveredSeq=1`, `snoozedUntil=1793174188429`; durable action `snooze` `seq=1` queued.                                                                     |
| Reconcile before drain                   | `20261028-1240-final47-stalesnooze/04-manual-reconcile-pre-drain` | `Reconcile now` (`last_reconcile_reason=settings-manual`) merged `trigger=2`, `delivered=1`, `scheduled_at=1793174188429`, `snoozed_until` still null; action still queued; exactly one alarm at 1793174188429.                             |
| Drain on foreground                      | `20261028-1240-final47-stalesnooze/05-drained-foreground`         | Background + relaunch drained the action: `snoozed_until=1793174188429` preserved, `trigger=2`, `delivered=1`, `state=exact`, `status=scheduled`, `notification-snooze` event; queue empty; one alarm at the snooze instant; none at 12:45. |
| Stale-snooze re-fire                     | `20261028-1240-final47-stalesnooze/06-refire`                     | POSTED once at 12:56:29.171; native cache `triggerSeq=2`, `deliveredSeq=2`, `deliveryState=posted`, `lastFiredAt=1793174189147`; exactly one live notification id 14; snooze alarm consumed.                                                |
| Re-fire foreground merge                 | `20261028-1240-final47-stalesnooze/07-refire-foreground`          | Foreground reconcile persisted `trigger=2`, `delivered=2`, `state=delivered-active`, `status=fired`; notification id 14 stayed visible; no third POSTED; no alarm at 12:45 or at the snooze instant.                                        |

## Findings from the 2026-10-26 run

### F1 - A delivered snoozed notification is dismissed by the next foreground reconcile (fixed in code; device re-verification not finished)

Observed while running case 13. The snoozed reminder re-fired correctly at
14:07:49.674 (`NotificationRecord` id 5 live, `shade.png` in
`20261026-140806`), but opening the app 50 s later removed that notification
while its row still claimed `state=delivered-active,
reason=notification-visible`.

Cause: after the snoozed delivery the reconcile plan stops carrying the snooze
(`withSnooze` only keeps `snoozedUntil > now`), so the native input reverts
`triggerAt` to the original wall time (13:57). `ReminderScheduler` cancels a
visible notification when the request code is unchanged but `triggerAt`
differs (the "same code, moved trigger" guard), so the notification that had
just been delivered was dismissed. A plain (never snoozed) delivery such as
case 10 is unaffected because its `triggerAt` never changes.

Impact: the user loses the remaining visual reminder after a snooze, and the
next reconcile can re-fire the row as overdue.

Fix: the "moved trigger" guard must not cancel a notification whose new
trigger is already in the past - a past trigger is the delivered reminder, not
a stale future alarm. `ReminderScheduler` now skips that cancel when
`ReminderPolicy.isOverdue(current.triggerAt, now)`; the rule lives in
`ReminderPolicy.shouldCancelStaleNotification` with a unit test.

Fix status: **device-verified on 2026-10-28**. The code change, the Kotlin unit
test, `testDevDebugUnitTest` and `installDevDebug` all pass locally, and the
on-device sequence completed: overdue fire -> Snooze 10 min -> re-fire at
`11:41:15.096` -> background/foreground the app -> the notification stayed in
the shade with exactly one `NotificationRecord`, `trigger_seq=2`,
`delivered_seq=2`, `state=delivered-active`, and no third POSTED
(`20261028-114218-f1-refire-foreground`). The earlier 2026-10-26 attempt stopped
before the snooze tap because adb over Wi-Fi dropped; that gap is now closed.

### F2 - A delivered reminder with no visible notification re-fires on the next reconcile (fixed in code; device verification pending)

Same run, immediately after F1. Once the delivered notification was gone, the
next reconcile (quiet-hours edits at 14:11:50) treated the reminder as overdue
with nothing posted and re-armed it: a second
`Reminder schedule_660efd2ca60b3c93 delivery=POSTED` at 14:11:50.687, i.e. the
same reminder alerted twice in four minutes.

The F1 fix removes the accidental cancel that triggered this. The remaining path
is the user dismissing a delivered reminder: the row stayed `status=scheduled`,
`state=delivered-active`, so the plan kept sending the wall time and native
re-armed it as overdue. Dismissal used to mean "will alert again on the next app
open".

Decision taken: dismissal is final for that delivery attempt, but it is
**history, not a scheduling input**. It must not complete the task, must not
cancel later recurring occurrences, and must not suppress an explicit future
snooze or a deliberately re-scheduled trigger.

Implementation (separate fix, does not modify `4182a22`):

- Delivery attempt identity is explicit: `notification_schedule.trigger_seq`
  starts at 1 and advances **only** on an explicit snooze; `delivered_seq` is
  written **only** by the native receiver after a notification was actually
  posted (`NotificationDelivery.POSTED`). A logical trigger is delivered when
  `trigger_seq > 0 && delivered_seq >= trigger_seq`. Recomputing a wall time
  (quiet hours, time zone, clock change) can therefore never make a delivered
  trigger look pending again.
- Dismissal is recorded separately (`dismissed_seq`, `dismissed_at`, a
  `notification-dismiss` event) through `deleteIntent` -> `ReminderActionReceiver`
  -> durable `NativeAction(type='dismiss')` queue -> JS. It is never inferred
  from `notificationActive = false` and never feeds the scheduler.
- Duplicate-delivery prevention does not depend on dismissal callbacks: the
  delivered branch in `ReminderScheduler` never re-arms, never re-posts, never
  cancels a still-visible notification, and never consumes a pending-alarm slot.
- `ReminderAlarmStore.replaceAll` and the reconcile merge by schedule id, taking
  the highest seq values and newest timestamps, so delivery/dismissal history and
  request-code reservations survive restart, cache replacement, and a stale JS
  snapshot. A snooze performed while the app was dead wins over the incoming
  plan because the cache's attempt is newer.
- `markScheduleFiredByNativeId` was removed; delivery is persisted only from
  receiver-recorded outcomes via `persistNativeResult`. Scheduling success is no
  longer treated as delivery.
- Schema migration v2 is additive: four `ALTER TABLE notification_schedule`
  columns plus a backfill that marks rows already delivered before this build
  (`last_fired_at IS NOT NULL`, `state='delivered-active'`, or `status='fired'`)
  as `delivered_seq = trigger_seq`. The v1 migration is untouched.
- If a reconcile copies `trigger_seq` from the native cache before the durable
  snooze action is drained, the action is applied idempotently (same absolute
  snooze time, no second attempt) instead of being discarded. Otherwise the
  lost `snoozed_until` would let the next reconcile re-arm the original past
  wall time and re-alert.

Local verification: Jest 39 tests across `src/notifications` + `src/reminders`
pass (including the new F2 regressions: delivered+visible survives reconcile,
delivered+dismissed does not re-alert, delivery survives restart/cache
replacement, explicit snooze alerts once, a reconcile that already propagated
the attempt still keeps the snooze time, a deliberate new schedule is not
suppressed, an old delivery does not suppress a distinct trigger, a future
recurring occurrence still alerts, a stale dismissal cannot suppress a newer
trigger, and delivered rows do not consume the cap). The schema v2 migration
suite covers a fresh install, an existing v1 database, already-delivered rows,
pending rows, and reopening an already-upgraded database.
`testDevDebugUnitTest` passes (attempt identity, dismissal validation, cache
merge, JSON round trip). `pnpm verify` is green.

Status: **device-verified on 2026-10-28 (case 47)**. The final F2 build
(`installDevDebug` over existing data) was smoke-tested end to end: delivered +
visible survived a foreground reconcile; a delivered + dismissed attempt
produced no second POSTED after a swipe, two relaunches, and a settings
`Reconcile now`; the row stayed `status=fired` with `trigger_seq=1`,
`delivered_seq=1`, `dismissed_seq=1`, `dismissed_at` set, a
`notification-dismiss` event, the task still `todo`, and no alarm for the
delivered attempt. The stale-snooze path (reconcile copies `trigger_seq` before
the durable snooze action is drained) was exercised separately on the same
build: the reconcile kept `trigger_seq=2`/`delivered_seq=1`, the later drain
preserved the absolute `snoozed_until`, exactly one alarm remained at the snooze
instant, the attempt re-fired exactly once, and the following foreground merge
recorded `delivered_seq=2` while keeping the notification visible. The recurring-occurrence and
deliberate-edit legs were verified earlier on the same F2 code
(`20261028-115012`, `20261028-115212`): dismissing one occurrence kept the 9
later alarms, and a date/time edit after the dismissal alerted again with a new
schedule id and request code. Local regression tests cover the cases the device
flow cannot reach quickly (cap accounting, stale callbacks, cache merge).

## Case checklist

Use one row per case per run. Status values: `Pending`, `Pass`, `Fail`,
`Blocked`.

### Tasks

| #   | Case              | Steps                                                                      | Expected result                                                                                             | Evidence                      | Status                              |
| --- | ----------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------- |
| 1   | Create task       | Inbox -> New task -> title, notes, High priority, due today 09:00 -> Save. | Row exists with `status=todo`, `due_date`/`due_time` as floating strings; list shows the task and priority. | `nova.db` task row            | Pass (2026-10-26, NOTE 24 / API 33) |
| 2   | Edit task         | Open the task -> Edit -> change title, date, time, priority -> Save.       | One row updated with new values; no duplicate; list reflects the edit.                                      | Before/after task row         | Pass (2026-10-26, NOTE 24 / API 33) |
| 3   | Complete + undo   | Tap the row checkbox, then Undo on the banner.                             | `status=done` + `completed_at`, row leaves Inbox; undo restores `todo` and the same row id.                 | Rows before/after, screenshot | Pass (2026-10-26, NOTE 24 / API 33) |
| 4   | Delete + undo     | Open the task -> Delete -> confirm -> Undo.                                | `deleted_at` set and reminders cancelled; undo clears `deleted_at` and restores the task.                   | Task/reminder rows            | Pass (2026-10-26, NOTE 24 / API 33) |
| 5   | Archive + restore | Detail action -> Archive; then restore from the archived filter.           | `archived_at` set; task hidden from Inbox/Today; archived count increases; restore clears it.               | Task row, archived count      | Pass (2026-10-26, NOTE 24 / API 33) |
| 6   | Duplicate         | Duplicate a task with a reminder and recurrence.                           | New row with a new id; title/notes/dates copied; no duplicate occurrence rows; no duplicate alarms.         | Task + schedule rows          | Pass (2026-10-26, NOTE 24 / API 33) |
| 7   | Move list         | Create a second list, move the task through the editor.                    | `list_id` changes; detail shows the new list name; reminders stay attached.                                 | Task row                      | Pass (2026-10-26, NOTE 24 / API 33) |
| 8   | Subtasks          | Add two subtasks, toggle one, remove the other.                            | Rows persist with `is_completed`; progress label updates; removal is soft (`deleted_at`).                   | Subtask rows, screenshot      | Pass (2026-10-26, NOTE 24 / API 33) |
| 9   | Reminder CRUD     | Add 10 min before -> edit to At due -> remove.                             | One `reminder` row changes `offset_minutes`; removal cancels the schedule and alarm; no orphan rows.        | Reminder + schedule rows      | Pass (2026-10-26, NOTE 24 / API 33) |

### Reminders and reconciliation

| #   | Case                               | Steps                                                                              | Expected result                                                                                                                                                                                                | Evidence                          | Status                                                  |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| 10  | Exact alarm for a one-off reminder | Due in 2 minutes with a 10-minute reminder; keep the app foregrounded.             | Notification schedule row `scheduled`; `dumpsys alarm` shows one exact alarm; notification posts at the reminder time.                                                                                         | Schedule row, alarm dump          | Pass (2026-10-26, NOTE 24 / API 33)                     |
| 11  | Inexact fallback                   | Revoke Alarms & reminders -> create another reminder.                              | Alarm schedules inexactly, no crash, notification may be delayed; diagnostics/settings shows exact denied.                                                                                                     | Alarm dump, screenshot            | Pass (2026-10-26, NOTE 24 / API 33)                     |
| 12  | Quiet hours deferral               | Enable quiet hours 22:00-07:00 -> set a task reminder at 22:30 local.              | Schedule moves to 07:00 the next day; SQLite retains the original reminder; the deferred trigger is shown.                                                                                                     | Schedule row, screenshot          | Pass (2026-10-26, NOTE 24 / API 33)                     |
| 13  | Snooze overrides quiet hours       | Fire a reminder during quiet hours -> Snooze from the notification.                | New trigger is exactly `now + snooze`, not moved to the end of quiet hours; old notification disappears.                                                                                                       | Before/after schedule row         | Pass (2026-10-26, NOTE 24 / API 33)                     |
| 14  | Complete from notification         | Fire a reminder -> tap Complete.                                                   | Task becomes `done`; schedule row cancelled; the shared `reminder` row stays `scheduled` (recurrence reuses it); a `notification-complete` `reminder_event` is written; notification disappears; queue drains. | Task/reminder/schedule/event rows | Pass (2026-10-26, NOTE 24 / API 33)                     |
| 15  | Reconcile on app start             | Create reminders -> force-stop -> relaunch.                                        | On launch, SQLite rows are replayed into the native cache; missing alarms are recreated; no duplicates.                                                                                                        | Alarm dump before/after           | Pending - not run (phone offline 14:21)                 |
| 16  | Reconcile on resume                | Background the app, wait, then foreground it.                                      | Foreground transition drains native actions and rebuilds schedules; counters update.                                                                                                                           | Logcat timestamps, screenshot     | Pending - not run (phone offline 14:21)                 |
| 17  | Reboot recovery                    | Create future reminders -> reboot -> unlock -> open the app.                       | Boot receiver reschedules from the native cache; floating times recompute in the current zone; reminders fire.                                                                                                 | Alarm dump, notification          | Blocked - needs reboot (phone offline 14:21)            |
| 18  | Force-stop recovery                | Create a future reminder -> force-stop -> wait past trigger -> launch.             | No notification while stopped (platform behavior); launch reconciles SQLite and surfaces or reschedules the overdue reminder.                                                                                  | Logcat, schedule row              | Pending - not run (phone offline 14:21)                 |
| 19  | Time change                        | Create a reminder 10 minutes out -> change the clock forward/back -> open the app. | Absolute and floating triggers are recomputed from the wall time; no duplicate alarms; overdue fires at now + 1 s.                                                                                             | Alarm dump, schedule row          | Blocked - needs clock change (phone offline 14:21)      |
| 20  | Time-zone change                   | Set task due 09:00 -> change the zone (e.g. UTC+2 -> UTC-4) -> open the app.       | Due time still reads 09:00; `notification_schedule.trigger_at` moves by the zone delta; alarms re-register.                                                                                                    | Task/schedule rows, screenshot    | Blocked - needs zone change (phone offline 14:21)       |
| 21  | Permission change                  | Grant/revoke notifications or exact alarms -> return to the app.                   | Foreground reconcile reflects the new permission, replaces inexact with exact when granted, and reports blocked delivery later.                                                                                | Settings screenshot, alarm dump   | Pending - not run (phone offline 14:21)                 |
| 22  | 200 pending-alarm cap              | Create 205 future reminders (seed script or repeated tasks) -> reconcile.          | Exactly 200 alarms scheduled; 5 schedule rows deferred; no SQLite row deleted; later slots free up after completion.                                                                                           | Alarm count, schedule rows        | Blocked - needs 205-reminder seed (phone offline 14:21) |
| 23  | Recurring horizon                  | Create a daily recurring task with a reminder; inspect `notification_schedule`.    | Schedules cover min(14 days, 10 occurrences) ahead; no schedule beyond the horizon; completing one materializes the next.                                                                                      | Schedule rows, rule row           | Pending - not run (phone offline 14:21)                 |

### Recurrence

For every recurrence case, verify the rule row, the pending occurrence rows, and
the task row that was materialized.

| #   | Case                      | Steps                                                                                     | Expected result                                                                                                         | Evidence                   | Status                                  |
| --- | ------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------- |
| 24  | Daily + interval          | Create "Daily, every 2 days" starting today -> complete the first occurrence.             | Next materialized date is +2 days; rule `interval=2`; completed occurrence is `completed` and the series advances once. | Rule/task/occurrence rows  | Pending - not run (phone offline 14:21) |
| 25  | Weekdays                  | Create "Every weekday" starting Friday -> complete Friday; Saturday/Sunday do not appear. | Next occurrence is Monday; no Saturday/Sunday rows; weekend completions are ignored by the rule.                        | Occurrence rows            | Pending - not run (phone offline 14:21) |
| 26  | Weekly, multiple weekdays | Create Monday + Thursday weekly -> complete Monday.                                       | Thursday materializes; after Thursday, the following Monday does; no duplicate Tuesdays.                                | Occurrence rows            | Pending - not run (phone offline 14:21) |
| 27  | Monthly on date + clamp   | Create monthly on the 31st starting Jan 31 -> advance through February.                   | February clamps to the last valid day (28/29), then March returns to the 31st; no invalid dates.                        | Occurrence rows            | Pending - not run (phone offline 14:21) |
| 28  | Monthly Nth weekday       | Create "second Tuesday" monthly -> complete and advance.                                  | Only the second Tuesday materializes each month; no other Tuesdays.                                                     | Occurrence rows            | Pending - not run (phone offline 14:21) |
| 29  | Yearly + leap day         | Create yearly on Feb 29 starting 2024 -> advance to 2025.                                 | 2025 occurrence clamps to Feb 28; 2028 returns to Feb 29; no crash.                                                     | Occurrence rows            | Pending - not run (phone offline 14:21) |
| 30  | DST gap (spring forward)  | Zone `America/New_York`; create a 02:30 daily task before 2024-03-10.                     | The gap day shifts to 03:30 local; the next day returns to 02:30; no missing or duplicated alarm.                       | Schedule rows, alarm dump  | Pending - not run (phone offline 14:21) |
| 31  | DST overlap (fall back)   | Zone `America/New_York`; create a 01:30 daily task before 2024-11-03.                     | The ambiguous time resolves to the earlier offset (first 01:30), not both; next day is normal.                          | Schedule/occurrence rows   | Pending - not run (phone offline 14:21) |
| 32  | End date                  | Create daily with an end date three days out -> complete through the end.                 | No occurrences after the end date; rule becomes inactive; the final completion does not materialize another task.       | Rule/occurrence rows       | Pending - not run (phone offline 14:21) |
| 33  | End after N               | Create daily ending after 3 occurrences -> complete all three.                            | Exactly three occurrence rows, all terminal; no fourth task; rule inactive.                                             | Occurrence rows            | Pending - not run (phone offline 14:21) |
| 34  | Repeat after completion   | Enable repeat-after-completion with a daily rule -> complete the task two days late.      | Next occurrence is based on the completion date/time, not the original due date.                                        | New task row + timestamps  | Pending - not run (phone offline 14:21) |
| 35  | Skip occurrence           | On a recurring task detail, tap Skip.                                                     | Current occurrence becomes `skipped`; the series advances to the next date; the skipped date does not reappear.         | Occurrence rows            | Pending - not run (phone offline 14:21) |
| 36  | Edit one occurrence       | Edit a materialized occurrence title/date and choose "This occurrence".                   | Only that occurrence changes; the template and other occurrences are untouched; `is_exception=1` on the occurrence.     | Task rows, occurrence rows | Pending - not run (phone offline 14:21) |
| 37  | Edit whole series         | Choose "Whole series" while editing.                                                      | Template and all pending occurrences receive the change; completed/skipped history is preserved.                        | Task rows                  | Pending - not run (phone offline 14:21) |
| 38  | Edit this and following   | Choose "This and following" while editing.                                                | Current and future occurrences change; earlier occurrences stay as they were; rule start date updates.                  | Task rows, rule row        | Pending - not run (phone offline 14:21) |
| 39  | Delete one occurrence     | Delete a materialized occurrence.                                                         | Only that occurrence is removed/tombstoned; the series continues; its reminders are cancelled.                          | Task rows, schedule rows   | Pending - not run (phone offline 14:21) |
| 40  | Delete series             | Delete the recurring series from the template or detail.                                  | Template, pending occurrences, and their schedules are removed; no future materialization; undo restores in the window. | Task/rule/schedule rows    | Pending - not run (phone offline 14:21) |

### States and accessibility

| #   | Case                       | Steps                                                                           | Expected result                                                                                                               | Evidence              | Status                                  |
| --- | -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------- |
| 41  | Empty and loading states   | Fresh install; open Today/Inbox/Upcoming; create the first task.                | Empty states are announced; loading state is brief and replaced; no flash of stale data.                                      | Screenshots           | Pending - not run (phone offline 14:21) |
| 42  | Error state                | Corrupt or block the database so it cannot be opened.                           | Error state shows a retry action; retry recovers after the cause is removed; no crash.                                        | Screenshot, logcat    | Pending - not run (phone offline 14:21) |
| 43  | Offline state              | Airplane mode on; create/edit/complete tasks and reminders.                     | Banner explains offline saving; all mutations still persist; reminders still fire.                                            | Screenshot, task rows | Pending - not run (phone offline 14:21) |
| 44  | TalkBack task row          | Enable TalkBack; focus a task row and its checkbox.                             | Row reads title, due, overdue, priority, repeat, subtask progress; checkbox reads its state and toggles; targets are 48x48dp. | Screen recording      | Pending - not run (phone offline 14:21) |
| 45  | TalkBack editor and errors | Focus fields and chips; submit an invalid reminder; listen to the announcement. | Every control has a role and label; the validation error is announced assertively; focus order is logical.                    | Screen recording      | Pending - not run (phone offline 14:21) |

### Migration

| #   | Case             | Steps                                                                                                                    | Expected result                                                                                                                                                                                                      | Evidence                            | Status                                              |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| 46  | M4 -> M5 upgrade | Install the M4 dev APK, create a few reminders, then install the M5 dev APK over it without clearing data. Open the app. | M5 tables are created in one transaction; legacy `task_reminders` rows are left intact but are not projected; the first reconcile cancels M4 alarms and schedules only M5 rows; no crash, no duplicate notification. | `sqlite_master`, alarm dump, logcat | Blocked - needs M4 APK + data (phone offline 14:21) |

### Delivery and dismissal (F2)

| #   | Case                                                | Steps                                                                                                                                                                                                                                                                                                                                                                                                                                            | Expected result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                                                                                                    | Status                              |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 47  | F2 - delivered trigger never re-alerts on reconcile | 1) Create a task due in 2 minutes with `At due time`, let it fire. 2) Snooze 10 min from the shade; let the snoozed notification fire. 3) Swipe that notification away. 4) Force-stop, relaunch twice, then toggle a notification setting to force a reconcile. 5) Repeat with a delivered notification left visible (do not dismiss). 6) Create a daily recurring reminder and let occurrence N fire and be dismissed; wait for occurrence N+1. | Delivered + dismissed: no second POSTED, no new `NotificationRecord`, `notification_schedule.status='fired'`, `delivered_seq >= trigger_seq`, `dismissed_seq` set, `dismissed_at` set, one `notification-dismiss` `reminder_event`, task still `todo`, alarm list empty for that schedule. Delivered + visible: notification stays in the shade across relaunch/reconcile, still exactly one POSTED. Snooze before dismissal: snooze fires exactly once (one new POSTED), `trigger_seq` incremented once. Occurrence N+1 still alerts with a different schedule id and request code. Restart/cache replacement keeps `delivered_seq`/`dismissed_seq`. | `nova.db` (task/reminder/schedule/event rows), `dumpsys notification`, `dumpsys alarm`, logcat POSTED lines | Pass (2026-10-28, NOTE 24 / API 33) |

### Run outcome - 2026-10-26 (session interrupted at 14:21)

Cases 15-46 were not reached. adb over Wi-Fi dropped at ~14:21 and the phone was
not available again in this session, so no further device evidence could be
captured. The statuses above record that instead of assuming a result:

- `Pending - not run (phone offline 14:21)`: 15, 16, 18, 21, 23-45.
- `Blocked - ... (phone offline 14:21)`: 17 (reboot), 19 (clock change), 20
  (time-zone change), 22 (205-reminder seed) and 46 (M4 APK + data). Each needs
  a device-side action that could not be performed.
- No case was marked Pass from a unit test, a reconcile plan, or a scheduled
  alarm alone; every Pass row cites a pulled `nova.db` / `dumpsys` /
  `logcat` / screenshot.

## M5 status report - 2026-10-26 (in progress)

### Status

Implementation complete. Device verification partial and paused.

- Implementation: complete (M5 scope only).
- TypeScript typecheck, lint, Prettier: pass.
- Jest: pass, 19 suites / 140 tests (includes the F2 regressions and the schema
  v2 migration/backfill suite).
- Font and Android config audits: pass.
- Android unit tests: pass (`testDevDebugUnitTest`), dev APK builds and installs
  (`installDevDebug`).
- Device verification: **15/47 cases passed on a single API 33 device** (the
  original 46 are unchanged at 14 pass; case 47 passed on 2026-10-28). The
  API 26-30 leg has not started.
- Commit/build: `b13ae46` (cases 10-12), `4182a22` (F1 fix, CI run
  `40638154853` success), plus the F2 fix commit (attempt identity, dismissal
  path, migration v2, regression tests, and these documentation updates). Case
  47, the F1 re-verification, and the stale-snooze path were run against the
  final F2 `installDevDebug` build.

### Devices

| Run ID     | Device  | Android/API         | Time zone    | Result                                   |
| ---------- | ------- | ------------------- | ------------ | ---------------------------------------- |
| 2026-10-26 | NOTE 24 | Android 13 / API 33 | Asia/Karachi | 14 pass, 5 blocked, 27 not run           |
| 2026-10-28 | NOTE 24 | Android 13 / API 33 | Asia/Karachi | case 47 pass, F1 + stale-snooze verified |

No other device was exercised. Wireless adb is the only transport used, and it
dropped twice during the session (the second time ended the run), so treat
long-wait observations as fragile until a USB connection is available.

### Case summary

Pack size: 47 cases (the original 46 plus case 47, the F2 regression). The
original 46 keep their recorded result; case 47 is new and passed on 2026-10-28.

- Passed: 14/46 original (1-14); 15/47 overall (case 47 added and passed)
- Failed: 0/46 original; 0/47 overall
- Blocked: 5/46 original (17, 19, 20, 22, 46)
- Not run: 27/46 original (15, 16, 18, 21, 23-45)
- New case: 47 (F2 delivered-trigger dismissal/delivery) - Pass on 2026-10-28

### Coverage gaps (explicit)

- **Legacy baseline (API 26-30): 0 cases.** Required by the pack; no device was
  available. Every Pass above is modern-baseline only and must not be reported
  as legacy coverage.
- **Latest target behaviour (API 36): 0 cases.**
- **OEM power sample: not run** (the NOTE 24 is a single OEM sample and was not
  tested against a second OEM).
- **DST zones (cases 30-31): not started**; the device is in a non-DST zone.
- **Second-device re-run of cases 19-20: not started.**
- Multi-device sign-off is therefore **not** claimed: the pack has one device.

### Evidence

- Evidence directory: `artifacts/device/<timestamp>/` (gitignored), 47 pulls
  from 2026-10-26 plus 10 from 2026-10-28. Key runs:
  - `20261026-131741` / `131808` / `131836` - case 4 delete + undo.
  - `20261026-124933` - case 8 subtask rows.
  - `20261026-132353` / `132646` - case 10 exact alarm + delivery.
  - `20261026-132819` / `132900` - case 11 inexact fallback.
  - `20261026-134443` - case 12 deferral to 07:00.
  - `20261026-135757` / `135826` / `140806` - case 13 snooze before, after,
    and the re-fire (`shade.png`, `logcat.txt`).
  - `20261026-140840` / `141245` - F1 dismissal and the F2 duplicate POSTED.
  - `20261028-112627-f2-migration` - schema v2 applied to existing M5 data.
  - `20261028-113030-f2-visible-reconcile` - delivered + visible survives reconcile.
  - `20261028-113141-f2-snoozed` - snooze starts exactly one new attempt.
  - `20261028-114218-f1-refire-foreground` - F1 re-verification (notification stays).
  - `20261028-114340-case47-dismissed-relaunch` - dismissal survives two relaunches.
  - `20261028-114451-case47-quiet-reconcile` - settings reconcile does not re-alert.
  - `20261028-115012-case47-recur-dismissed` - later recurring alarms survive.
  - `20261028-115212-case47-edit-newschedule` / `115241-...-reconciled` - a
    deliberate new schedule alerts again.
- Alarm dump: `alarms.txt` in each evidence directory.
- Notification dump: `notifications.txt` (live `NotificationRecord` lines only;
  `StatusBarNotification` entries after `mArchive=` are cancelled).
- Database dump: `nova.db` with `nova.db-wal` / `nova.db-shm`.
- Logcat: `logcat.txt` where captured (`20261026-140806`, `141245`).
- Screenshots: `screen.png`, plus `shade.png` for notification states.

### Failures and risks

| Case | Device  | Failure                                                                                                                | Evidence                                  | Owner | Next action                                                            |
| ---- | ------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----- | ---------------------------------------------------------------------- |
| 13   | NOTE 24 | F1: delivered snoozed notification dismissed by the next foreground reconcile                                          | `20261026-140806`, `140840`               | dev   | device-verified 2026-10-28 (`20261028-114218-f1-refire-foreground`)    |
| 13   | NOTE 24 | F2: delivered reminder with no visible notification re-fires on the next reconcile                                     | `20261026-141245` (`14:11:50.687 POSTED`) | dev   | device-verified 2026-10-28 as case 47                                  |
| -    | -       | No API 26-30 device available                                                                                          | -                                         | user  | run the legacy leg on a second phone or an API 30 emulator             |
| 10   | NOTE 24 | Case run as "due 13:26 with At due time" (3-minute wait), not the literal "due in 2 minutes with a 10-minute reminder" | `20261026-132353`, `132646`               | dev   | accepted: same one-off exact path; noted, not an equivalent-step claim |
| 13   | NOTE 24 | Case run with quiet hours `14:00-16:00` rather than `22:00-07:00`                                                      | `20261026-135826`                         | dev   | accepted: proves snooze overrides an active quiet window               |

### Decision

M5 is NOT complete. 15 of 47 cases have device evidence on one API 33 phone (the
original 46 remain at 14 pass; case 47 and the F1 re-verification passed on
2026-10-28), and the required API 26-30 leg is missing, so neither multi-device
nor full-pack sign-off is claimed.

- [x] Implementation scope limited to M5 (no AI, billing, voice, cloud sync,
      widgets, templates, or M6 work started).
- [x] Local verification green after the last code change.
- [ ] All 47 cases pass on required devices.
- [ ] Legacy (API 26-30) evidence captured.
- [ ] Recurrence vectors and DST cases confirmed on device.
- [x] F1 device re-verification and case 47 (F2) closed.
- [ ] Evidence archived.

## Instructions to run the checklist

1. Start from a clean install (`adb uninstall com.novatask.app.dev` first) so the
   M5 schema is created from scratch, then repeat case 46 with an M4-to-M5
   in-place upgrade.
2. Fill in one **Run metadata** block per device.
3. Run tasks 1-9 first; they prove SQLite persistence independently of
   notification delivery.
4. Run reminders 10-14 on the modern device, then 15-23, rebooting and changing
   the clock only when the case calls for it.
5. Run recurrence 24-29 with a fixed device clock in a non-DST zone, then run
   30-31 in `America/New_York` or `Europe/Berlin` with automatic time zone off.
6. Run 32-40 against the same series where possible, capturing the rule,
   occurrence, and task rows before and after each edit.
7. Run 41-45 last, with TalkBack enabled and font scale at 100% and 200%.
8. Run case 46 on a device with M4 data before the clean-install run.
9. For every failure, capture logcat, a database dump, the relevant screen, and
   the UTC timestamp. Do not retry silently.
10. Repeat the reminder time-zone and DST cases on the second device role.
11. Review the completed pack against the acceptance criteria. Confirm no case
    is marked Pass without evidence.

## M5 status report template (for the next run)

```markdown
# M5 status report - YYYY-MM-DD

## Status

Implementation complete. Device verification pending.

- Implementation: complete
- TypeScript / lint / format / Jest / Android unit tests: pass (attach output)
- Device verification: PENDING - 0/46 cases with evidence
- Commit/build: <SHA> / <APK SHA-256>

## Devices

| Run ID | Device | Android/API | Time zone | Result |
| ------ | ------ | ----------- | --------- | ------ |
|        |        |             |           |        |

## Case summary

- Passed: 0/46
- Failed: 0/46
- Blocked: 0/46
- Not run: 46/46

## Evidence

- Evidence directory:
- Alarm dump:
- Notification dump:
- Database dump:
- Logcat:
- Screenshots / recordings:

## Failures and risks

| Case | Device | Failure | Evidence | Owner | Next action |
| ---- | ------ | ------- | -------- | ----- | ----------- |
|      |        |         |          |       |             |

## Decision

M5 is NOT complete until every case has a result on the required devices and no
unresolved severity-1 or severity-2 failure remains.

- [ ] All 46 cases pass on required devices.
- [ ] Recurrence vectors and DST cases confirmed on device.
- [ ] Failures and exceptions reviewed.
- [ ] Evidence archived.
- [ ] Status updated from "Implementation complete. Device verification pending."
```
