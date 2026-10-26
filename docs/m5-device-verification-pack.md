# M5 physical-device verification pack

**Status: Implementation complete. Device verification pending.**

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

## Case checklist

Use one row per case per run. Status values: `Pending`, `Pass`, `Fail`,
`Blocked`.

### Tasks

| #   | Case              | Steps                                                                      | Expected result                                                                                             | Evidence                      | Status  |
| --- | ----------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------- | ------- |
| 1   | Create task       | Inbox -> New task -> title, notes, High priority, due today 09:00 -> Save. | Row exists with `status=todo`, `due_date`/`due_time` as floating strings; list shows the task and priority. | `nova.db` task row            | Pending |
| 2   | Edit task         | Open the task -> Edit -> change title, date, time, priority -> Save.       | One row updated with new values; no duplicate; list reflects the edit.                                      | Before/after task row         | Pending |
| 3   | Complete + undo   | Tap the row checkbox, then Undo on the banner.                             | `status=done` + `completed_at`, row leaves Inbox; undo restores `todo` and the same row id.                 | Rows before/after, screenshot | Pending |
| 4   | Delete + undo     | Open the task -> Delete -> confirm -> Undo.                                | `deleted_at` set and reminders cancelled; undo clears `deleted_at` and restores the task.                   | Task/reminder rows            | Pending |
| 5   | Archive + restore | Detail action -> Archive; then restore from the archived filter.           | `archived_at` set; task hidden from Inbox/Today; archived count increases; restore clears it.               | Task row, archived count      | Pending |
| 6   | Duplicate         | Duplicate a task with a reminder and recurrence.                           | New row with a new id; title/notes/dates copied; no duplicate occurrence rows; no duplicate alarms.         | Task + schedule rows          | Pending |
| 7   | Move list         | Create a second list, move the task through the editor.                    | `list_id` changes; detail shows the new list name; reminders stay attached.                                 | Task row                      | Pending |
| 8   | Subtasks          | Add two subtasks, toggle one, remove the other.                            | Rows persist with `is_completed`; progress label updates; removal is soft (`deleted_at`).                   | Subtask rows, screenshot      | Pending |
| 9   | Reminder CRUD     | Add 10 min before -> edit to At due -> remove.                             | One `reminder` row changes `offset_minutes`; removal cancels the schedule and alarm; no orphan rows.        | Reminder + schedule rows      | Pending |

### Reminders and reconciliation

| #   | Case                               | Steps                                                                              | Expected result                                                                                                                 | Evidence                        | Status  |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------- |
| 10  | Exact alarm for a one-off reminder | Due in 2 minutes with a 10-minute reminder; keep the app foregrounded.             | Notification schedule row `scheduled`; `dumpsys alarm` shows one exact alarm; notification posts at the reminder time.          | Schedule row, alarm dump        | Pending |
| 11  | Inexact fallback                   | Revoke Alarms & reminders -> create another reminder.                              | Alarm schedules inexactly, no crash, notification may be delayed; diagnostics/settings shows exact denied.                      | Alarm dump, screenshot          | Pending |
| 12  | Quiet hours deferral               | Enable quiet hours 22:00-07:00 -> set a task reminder at 22:30 local.              | Schedule moves to 07:00 the next day; SQLite retains the original reminder; the deferred trigger is shown.                      | Schedule row, screenshot        | Pending |
| 13  | Snooze overrides quiet hours       | Fire a reminder during quiet hours -> Snooze from the notification.                | New trigger is exactly `now + snooze`, not moved to the end of quiet hours; old notification disappears.                        | Before/after schedule row       | Pending |
| 14  | Complete from notification         | Fire a reminder -> tap Complete.                                                   | Task becomes `done`; reminder `completed`; schedule row removed/cancelled; notification disappears; queue drains.               | Task/reminder/schedule rows     | Pending |
| 15  | Reconcile on app start             | Create reminders -> force-stop -> relaunch.                                        | On launch, SQLite rows are replayed into the native cache; missing alarms are recreated; no duplicates.                         | Alarm dump before/after         | Pending |
| 16  | Reconcile on resume                | Background the app, wait, then foreground it.                                      | Foreground transition drains native actions and rebuilds schedules; counters update.                                            | Logcat timestamps, screenshot   | Pending |
| 17  | Reboot recovery                    | Create future reminders -> reboot -> unlock -> open the app.                       | Boot receiver reschedules from the native cache; floating times recompute in the current zone; reminders fire.                  | Alarm dump, notification        | Pending |
| 18  | Force-stop recovery                | Create a future reminder -> force-stop -> wait past trigger -> launch.             | No notification while stopped (platform behavior); launch reconciles SQLite and surfaces or reschedules the overdue reminder.   | Logcat, schedule row            | Pending |
| 19  | Time change                        | Create a reminder 10 minutes out -> change the clock forward/back -> open the app. | Absolute and floating triggers are recomputed from the wall time; no duplicate alarms; overdue fires at now + 1 s.              | Alarm dump, schedule row        | Pending |
| 20  | Time-zone change                   | Set task due 09:00 -> change the zone (e.g. UTC+2 -> UTC-4) -> open the app.       | Due time still reads 09:00; `notification_schedule.trigger_at` moves by the zone delta; alarms re-register.                     | Task/schedule rows, screenshot  | Pending |
| 21  | Permission change                  | Grant/revoke notifications or exact alarms -> return to the app.                   | Foreground reconcile reflects the new permission, replaces inexact with exact when granted, and reports blocked delivery later. | Settings screenshot, alarm dump | Pending |
| 22  | 200 pending-alarm cap              | Create 205 future reminders (seed script or repeated tasks) -> reconcile.          | Exactly 200 alarms scheduled; 5 schedule rows deferred; no SQLite row deleted; later slots free up after completion.            | Alarm count, schedule rows      | Pending |
| 23  | Recurring horizon                  | Create a daily recurring task with a reminder; inspect `notification_schedule`.    | Schedules cover min(14 days, 10 occurrences) ahead; no schedule beyond the horizon; completing one materializes the next.       | Schedule rows, rule row         | Pending |

### Recurrence

For every recurrence case, verify the rule row, the pending occurrence rows, and
the task row that was materialized.

| #   | Case                      | Steps                                                                                     | Expected result                                                                                                         | Evidence                   | Status  |
| --- | ------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------- |
| 24  | Daily + interval          | Create "Daily, every 2 days" starting today -> complete the first occurrence.             | Next materialized date is +2 days; rule `interval=2`; completed occurrence is `completed` and the series advances once. | Rule/task/occurrence rows  | Pending |
| 25  | Weekdays                  | Create "Every weekday" starting Friday -> complete Friday; Saturday/Sunday do not appear. | Next occurrence is Monday; no Saturday/Sunday rows; weekend completions are ignored by the rule.                        | Occurrence rows            | Pending |
| 26  | Weekly, multiple weekdays | Create Monday + Thursday weekly -> complete Monday.                                       | Thursday materializes; after Thursday, the following Monday does; no duplicate Tuesdays.                                | Occurrence rows            | Pending |
| 27  | Monthly on date + clamp   | Create monthly on the 31st starting Jan 31 -> advance through February.                   | February clamps to the last valid day (28/29), then March returns to the 31st; no invalid dates.                        | Occurrence rows            | Pending |
| 28  | Monthly Nth weekday       | Create "second Tuesday" monthly -> complete and advance.                                  | Only the second Tuesday materializes each month; no other Tuesdays.                                                     | Occurrence rows            | Pending |
| 29  | Yearly + leap day         | Create yearly on Feb 29 starting 2024 -> advance to 2025.                                 | 2025 occurrence clamps to Feb 28; 2028 returns to Feb 29; no crash.                                                     | Occurrence rows            | Pending |
| 30  | DST gap (spring forward)  | Zone `America/New_York`; create a 02:30 daily task before 2024-03-10.                     | The gap day shifts to 03:30 local; the next day returns to 02:30; no missing or duplicated alarm.                       | Schedule rows, alarm dump  | Pending |
| 31  | DST overlap (fall back)   | Zone `America/New_York`; create a 01:30 daily task before 2024-11-03.                     | The ambiguous time resolves to the earlier offset (first 01:30), not both; next day is normal.                          | Schedule/occurrence rows   | Pending |
| 32  | End date                  | Create daily with an end date three days out -> complete through the end.                 | No occurrences after the end date; rule becomes inactive; the final completion does not materialize another task.       | Rule/occurrence rows       | Pending |
| 33  | End after N               | Create daily ending after 3 occurrences -> complete all three.                            | Exactly three occurrence rows, all terminal; no fourth task; rule inactive.                                             | Occurrence rows            | Pending |
| 34  | Repeat after completion   | Enable repeat-after-completion with a daily rule -> complete the task two days late.      | Next occurrence is based on the completion date/time, not the original due date.                                        | New task row + timestamps  | Pending |
| 35  | Skip occurrence           | On a recurring task detail, tap Skip.                                                     | Current occurrence becomes `skipped`; the series advances to the next date; the skipped date does not reappear.         | Occurrence rows            | Pending |
| 36  | Edit one occurrence       | Edit a materialized occurrence title/date and choose "This occurrence".                   | Only that occurrence changes; the template and other occurrences are untouched; `is_exception=1` on the occurrence.     | Task rows, occurrence rows | Pending |
| 37  | Edit whole series         | Choose "Whole series" while editing.                                                      | Template and all pending occurrences receive the change; completed/skipped history is preserved.                        | Task rows                  | Pending |
| 38  | Edit this and following   | Choose "This and following" while editing.                                                | Current and future occurrences change; earlier occurrences stay as they were; rule start date updates.                  | Task rows, rule row        | Pending |
| 39  | Delete one occurrence     | Delete a materialized occurrence.                                                         | Only that occurrence is removed/tombstoned; the series continues; its reminders are cancelled.                          | Task rows, schedule rows   | Pending |
| 40  | Delete series             | Delete the recurring series from the template or detail.                                  | Template, pending occurrences, and their schedules are removed; no future materialization; undo restores in the window. | Task/rule/schedule rows    | Pending |

### States and accessibility

| #   | Case                       | Steps                                                                           | Expected result                                                                                                               | Evidence              | Status  |
| --- | -------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------- |
| 41  | Empty and loading states   | Fresh install; open Today/Inbox/Upcoming; create the first task.                | Empty states are announced; loading state is brief and replaced; no flash of stale data.                                      | Screenshots           | Pending |
| 42  | Error state                | Corrupt or block the database so it cannot be opened.                           | Error state shows a retry action; retry recovers after the cause is removed; no crash.                                        | Screenshot, logcat    | Pending |
| 43  | Offline state              | Airplane mode on; create/edit/complete tasks and reminders.                     | Banner explains offline saving; all mutations still persist; reminders still fire.                                            | Screenshot, task rows | Pending |
| 44  | TalkBack task row          | Enable TalkBack; focus a task row and its checkbox.                             | Row reads title, due, overdue, priority, repeat, subtask progress; checkbox reads its state and toggles; targets are 48x48dp. | Screen recording      | Pending |
| 45  | TalkBack editor and errors | Focus fields and chips; submit an invalid reminder; listen to the announcement. | Every control has a role and label; the validation error is announced assertively; focus order is logical.                    | Screen recording      | Pending |

### Migration

| #   | Case             | Steps                                                                                                                    | Expected result                                                                                                                                                                                                      | Evidence                            | Status  |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------- |
| 46  | M4 -> M5 upgrade | Install the M4 dev APK, create a few reminders, then install the M5 dev APK over it without clearing data. Open the app. | M5 tables are created in one transaction; legacy `task_reminders` rows are left intact but are not projected; the first reconcile cancels M4 alarms and schedules only M5 rows; no crash, no duplicate notification. | `sqlite_master`, alarm dump, logcat | Pending |

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

## M5 status report template

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
