# M4 physical-device verification pack

**Status: Implementation complete. User-reported device verification passed
(2026-10). Formal evidence archive still pending.**

M4 was exercised on a physical Android device: on-time delivery, screen-off,
background and process-gone delivery, the 200-reminder cap, Complete and Snooze
actions, reboot, force-stop, permission changes, exact-alarm fallback, and
time-zone changes. This pack is retained as the historical M4 protocol; M5
replaced the dev-only test lab and diagnostics screens with the Nova settings
screen and the M5 verification pack.

This pack is derived from the 25 cases in
[`docs/m4-test-matrix.md`](m4-test-matrix.md). Do not mark M4 complete until all
25 cases have device evidence and a reviewer signs the status report below.

Use commands from [`docs/m4-device-commands.md`](m4-device-commands.md).

## Required devices and Android versions

The minimum sign-off set is **two physical Android devices**:

| Role                        | Required Android version           | Why                                                                 |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Legacy baseline             | Android 8.0–11 (API 26–30)         | minSdk 26, notification channels, no Android 12+ special access     |
| Modern baseline             | Android 13+ (API 33+)              | `POST_NOTIFICATIONS`, exact-alarm access, current notification flow |
| Latest target behavior      | Android 16 / API 36 when available | targetSdk 36 edge-to-edge and platform behavior                     |
| OEM power-management sample | Any supported OEM                  | Doze, battery saver, background restrictions, boot behavior         |

Required for sign-off:

- At least one physical device at API 26–30.
- At least one physical device at API 33 or newer.
- API 31/32 and the newest API available should be added when accessible.
- Doze, battery saver, reboot, and OEM-kill behavior must be exercised on
  physical hardware. Emulators are useful for preliminary smoke checks but do
  not replace physical-device evidence.

## Run metadata

Copy this block for each device/run. Use a unique run ID in the case table.

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
| Metro/runtime state   |                              |
| Device time zone      |                              |
| Test start (UTC)      |                              |
| Test end (UTC)        |                              |
| Evidence directory    | `artifacts/device-<run-id>/` |
| Reviewer              |                              |

## Evidence conventions

- Store logs, dumps, screenshots, and SQLite snapshots under
  `artifacts/device-<run-id>/`; `artifacts/` is gitignored.
- Record UTC timestamps in ISO 8601.
- For each case, reference the exact file name(s) in the **Evidence** column.
- Attach raw `dumpsys alarm` and `dumpsys notification --noredact` output, not
  only filtered excerpts.
- For SQLite states, include the diagnostics screenshot and, where possible,
  the pulled `nova.db` plus WAL file.
- Never mark Pass from a unit test alone.

## 25-case checklist

Fill one row per case per run. `Device / API` is repeated so the table remains
self-contained when copied into a report.

| #   | Case                                      | Steps                                                                                                                                | Expected result                                                                                                                                    | Actual result | Device model / API | Timestamp (UTC) | Evidence | Status  |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------ | --------------- | -------- | ------- |
| 1   | Future reminder schedules an exact alarm  | Schedule a reminder in 30 seconds; open diagnostics.                                                                                 | SQLite row is `scheduled`; state is `exact` (or `inexact` if access denied); diagnostics shows a pending alarm and exact count +1.                 |               |                    |                 |          | Pending |
| 2   | Exact-alarm denial falls back             | Deny Alarms & reminders in Settings; schedule in 30 seconds; open diagnostics.                                                       | Alarm schedules as `inexact`; no crash; diagnostics shows exact denied and an inexact count; delivery may be delayed.                              |               |                    |                 |          | Pending |
| 3   | Notification permission not requested     | Fresh install; do not tap Allow notifications; schedule in 10 seconds.                                                               | Row is stored and alarm remains scheduled; diagnostics shows `notDetermined` and a warning; no silent SQLite loss.                                 |               |                    |                 |          | Pending |
| 4   | Grant notification permission             | Tap Allow notifications; accept the system prompt; schedule in 10 seconds.                                                           | Permission becomes `granted`; notification appears; permission issue clears.                                                                       |               |                    |                 |          | Pending |
| 5   | Deny notification permission              | Revoke permission; schedule one overdue and one future reminder.                                                                     | Overdue row becomes `blocked-notification-permission`; future row stays scheduled; diagnostics reports the error; no alarm loop.                   |               |                    |                 |          | Pending |
| 6   | Fire while app is foregrounded            | Schedule in 10 seconds and keep the test lab open.                                                                                   | Notification posts with Complete and Snooze 10 min; diagnostics shows `fired`/`delivered-active`; no crash.                                        |               |                    |                 |          | Pending |
| 7   | Fire while app is backgrounded            | Schedule in 10 seconds; press Home; wait.                                                                                            | Notification posts while React Native is not visible; action buttons are present.                                                                  |               |                    |                 |          | Pending |
| 8   | Fire while process is gone                | Schedule in 10 seconds; open another app; swipe Nova from Recents (do not force-stop); wait.                                         | Native receiver runs without React Native; notification posts; actions work without a JS process.                                                  |               |                    |                 |          | Pending |
| 9   | Complete from notification updates SQLite | Tap Complete; reopen diagnostics; wait for reconciliation.                                                                           | Notification disappears; row becomes `completed`; completed count increases; action queue drains to 0.                                             |               |                    |                 |          | Pending |
| 10  | Snooze from notification                  | Tap Snooze 10 min; inspect immediately and after one sync.                                                                           | Notification disappears; trigger moves about 10 minutes ahead; state returns to exact/inexact; queue drains; no duplicate reminder.                |               |                    |                 |          | Pending |
| 11  | Duplicate Complete action                 | Complete; reconcile twice. A true repeat delivery needs a temporary debug hook because the receiver is non-exported.                 | Only one completed transition; no resurrection or duplicate notification.                                                                          |               |                    |                 |          | Pending |
| 12  | Duplicate Snooze action                   | Snooze; use a temporary debug hook to repeat the action before the first drain. adb cannot inject it into the non-exported receiver. | Duplicate is ignored; trigger remains the first snooze target; the new alarm is not canceled.                                                      |               |                    |                 |          | Pending |
| 13  | Complete in app with visible notification | Fire a reminder; leave the notification visible; tap Complete in the test lab.                                                       | Notification and alarm disappear during reconciliation; row becomes completed; queue is empty.                                                     |               |                    |                 |          | Pending |
| 14  | Snooze in app with visible notification   | Fire a reminder; leave it visible; tap Snooze 10 min in the test lab.                                                                | Old notification disappears; trigger moves ahead; new alarm schedules; state is exact/inexact.                                                     |               |                    |                 |          | Pending |
| 15  | Cancel in app                             | Schedule a reminder; tap Cancel in the test lab.                                                                                     | Row becomes `cancelled`; alarm and notification are removed; no pending intent remains; no future delivery.                                        |               |                    |                 |          | Pending |
| 16  | Clear all reminder rows                   | Seed several reminders; confirm Delete all reminder rows.                                                                            | SQLite empty; native cache empty; alarms and notifications canceled; diagnostics counts are 0.                                                     |               |                    |                 |          | Pending |
| 17  | 200-alarm cap                             | Tap Seed 205 reminders; inspect diagnostics after reconciliation.                                                                    | Exactly 200 alarms scheduled; 5 rows are `deferred-cap`; all 205 SQLite rows remain; cap warning shown; nothing deleted.                           |               |                    |                 |          | Pending |
| 18  | Reboot recovery                           | Schedule future reminders; note diagnostics; reboot; unlock; wait for boot; open the app.                                            | Boot receiver restores alarms from native cache; pending alarms reappear; reminders fire at epoch times.                                           |               |                    |                 |          | Pending |
| 19  | Force-stop recovery                       | Schedule a future reminder; force-stop the app; wait past trigger; launch manually.                                                  | No notification while stopped (platform behavior); launch reconciles SQLite and reschedules/fires overdue reminder; diagnostics explains recovery. |               |                    |                 |          | Pending |
| 20  | App-update recovery                       | Install the same dev APK over itself while reminders exist; reopen.                                                                  | `MY_PACKAGE_REPLACED` rebuilds alarms from cache; no duplicates; last reschedule reason updates.                                                   |               |                    |                 |          | Pending |
| 21  | Wall-clock change                         | Schedule future; change device clock forward/back; wait for receiver; inspect.                                                       | Alarms rebuild from absolute epoch `trigger_at`; past-due fires at now + 1 s; no duplicate active alarms.                                          |               |                    |                 |          | Pending |
| 22  | Time-zone change                          | Schedule future; change time zone; wait for `TIMEZONE_CHANGED`; inspect.                                                             | Alarms rebuild from epoch timestamps; displayed time reflects the new zone; no lost rows.                                                          |               |                    |                 |          | Pending |
| 23  | Exact permission granted later            | Deny exact alarms; schedule (inexact); grant access; return to app.                                                                  | Receiver and/or foreground reconciliation replaces inexact with exact; exact count rises; no duplicate alarms.                                     |               |                    |                 |          | Pending |
| 24  | Notification channel blocked              | Block the `Task reminders` channel; schedule in 10 seconds.                                                                          | Alarm fires safely; delivery records `blocked-notification-channel`; diagnostics reports blocked; no crash or loop.                                |               |                    |                 |          | Pending |
| 25  | Power saving: Doze and battery saver      | Schedule several minutes out; enable battery saver; force Doze with screen off and stationary.                                       | Allow-while-idle alarm fires or is delayed, never silently lost; diagnostics reports battery saver/Doze and exact/inexact state.                   |               |                    |                 |          | Pending |

## Instructions to run the matrix

1. Start with a clean install of `devDebug` and a fresh diagnostics snapshot.
2. Fill in one **Run metadata** block per device.
3. Run cases 1–10 first on the modern device; this proves the basic path before
   testing recovery and power behavior.
4. Run cases 11–16 to exercise app-initiated changes and queue behavior.
5. Run case 17 with a fresh table; restore normal data afterward.
6. Run cases 18–23 with unrelated apps closed and the device charging unless the
   case says otherwise.
7. Run cases 24–25 only after the basic notification path passes.
8. For every failure, capture logcat, the diagnostics screen, relevant
   `dumpsys` output, and the UTC timestamp. Do not retry silently.
9. Repeat the full matrix on every required device role. A case is only signed
   off when every required device has a result or an approved exception.
10. Review the completed pack against the original matrix. Confirm exactly 25
    case rows and no case marked Pass without evidence.

Cases 11 and 12 require a temporary debug-only injection hook because the
receivers are intentionally non-exported. If no hook is approved, record them as
**Blocked** and cite the mapper/idempotency tests; do not claim device coverage.

## M4 status report template

Copy this template into the issue/PR or release record after the run.

```markdown
# M4 status report — YYYY-MM-DD

## Status

Implementation complete. Device verification pending.

- Implementation: complete
- Device verification: PENDING — 0/25 cases with evidence
- M5: not started
- Commit/build: <SHA> / <APK SHA-256>

## Devices

| Run ID | Device | Android/API | OEM build | Result |
| ------ | ------ | ----------- | --------- | ------ |
|        |        |             |           |        |

## Case summary

- Passed: 0/25
- Failed: 0/25
- Blocked: 0/25
- Not run: 25/25

## Evidence

- Evidence directory:
- Alarm dump:
- Notification dump:
- Exact-alarm appops:
- Logcat:
- SQLite snapshot:
- Screenshots:

## Failures and risks

| Case | Device | Failure | Evidence | Owner | Next action |
| ---- | ------ | ------- | -------- | ----- | ----------- |
|      |        |         |          |       |             |

## Decision

M4 is NOT complete until all required devices have a result for all 25 cases
and no unresolved severity-1 or severity-2 failure remains.

- [ ] All 25 cases pass on required devices.
- [ ] Failures and exceptions reviewed.
- [ ] Evidence archived.
- [ ] Status updated from “Implementation complete. Device verification pending.”
```
