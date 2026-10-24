# M4 — Android reminder proof of concept

**Status: Implementation complete. Device verification pending.**

M4 exercises the native notification/alarm path without adding the full task
product. It is deliberately **Android-only** and **dev-flavor-only**. The
implementation is ready for hardware verification; all 25 device cases remain
pending until run on physical devices.

## Scope

Implemented:

- A minimal `task_reminders` SQLite table as the source of truth.
- A native Kotlin module (`NovaReminders`) backed by `AlarmManager`.
- A durable native alarm cache and native action queue.
- Exact alarms with a user-grantable special permission, plus an inexact
  `setAndAllowWhileIdle` fallback.
- A `task_reminders` notification channel, runtime notification permission
  flow, and notification delivery.
- Complete and Snooze actions handled entirely in native code.
- Boot, app-update, wall-clock, time-zone, and exact-alarm-permission receivers.
- Reconciliation from SQLite on app launch and every foreground transition.
- A dev-only reminder test lab and reminder diagnostics screen in the Nova tab.

Not implemented:

- Full task screens, task CRUD beyond the M4 fixture table, recurrence, AI,
  billing, voice, cloud backup, notification preferences, or iOS support.
- A battery-optimization exemption request (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
  is intentionally absent).
- Silent alarm recovery from a force-stopped process. Android clears alarms and
  suppresses boot delivery; the next app launch reconciles from SQLite.

## Architecture

```text
Dev screens (dev flavor only)
        │
        ▼
src/reminders/service.ts ─── bridge.ts ─── NovaRemindersModule.kt
        │                                      │
        ▼                                      ▼
SQLite task_reminders                 Native SharedPreferences cache
(source of truth)                     + native action queue
        │                                      │
        │                                      ▼
        │                              AlarmManager + PendingIntents
        │                                      │
        │                                      ▼
        │                              BroadcastReceivers
        │                                ├─ alarm fire
        │                                ├─ complete / snooze
        │                                ├─ boot / package update
        │                                └─ time / TZ / exact access
        │                                      │
        └────────── next foreground ◄──────────┘
                 apply queued actions, then reconcile
```

The native cache is a receiver-safe mirror, not a second source of truth. Every
foreground reconciliation replaces it from SQLite after applying any queued
notification actions.

## Native files

All paths are under `apps/mobile/android/app/src/main/java/com/novatask/app/reminders/`.

| File                        | Responsibility                                                          |
| --------------------------- | ----------------------------------------------------------------------- |
| `ReminderModels.kt`         | Constants, stored reminder/action models, JSON codecs, outcome types    |
| `ReminderPolicy.kt`         | Pure cap/order/overdue/request-code/snooze/terminal rules               |
| `ReminderAlarmStore.kt`     | Durable `SharedPreferences` cache with synchronous `commit()`           |
| `ReminderActionQueue.kt`    | Durable native action queue with deterministic, idempotent IDs          |
| `ReminderIntents.kt`        | Immutable, unique PendingIntents and cancellation helpers               |
| `ReminderNotifier.kt`       | Channel creation, permission/channel checks, notification rendering     |
| `ReminderScheduler.kt`      | Reconciliation, 200-alarm cap, exact/inexact alarms, cleanup            |
| `ReminderAlarmReceiver.kt`  | Fires notifications; uses intent extras if the cache entry is missing   |
| `ReminderActionReceiver.kt` | Complete/Snooze without JS; updates cache and enqueues a durable action |
| `ReceiverSupport.kt`        | Receiver executor and boot/update/time/time-zone reschedule path        |
| `Receivers.kt`              | Boot, package-update, time-change, and exact-permission receivers       |
| `NovaRemindersModule.kt`    | Typed legacy native-module API, permissions, diagnostics, constants     |
| `NovaRemindersPackage.kt`   | Registers the app-local module in the React Native package list         |

Android integration:

- `AndroidManifest.xml` declares `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`,
  and `SCHEDULE_EXACT_ALARM`, plus all six non-exported receivers.
  `USE_EXACT_ALARM` is intentionally not requested.
- `MainApplication.kt` adds `NovaRemindersPackage()` and creates the channel.
- `build.gradle` adds `androidx.core:core-ktx` and JUnit.
- `res/values/strings.xml`, `res/values/colors.xml`, and
  `res/drawable/ic_notification.xml` provide notification resources.
- The native module exposes `APP_ENV` as a constant so JS environment resolution
  uses the actual Gradle flavor, not only `__DEV__`. This keeps staging/prod
  debug builds from enabling the dev-only screens.

## SQLite schema

`src/reminders/repository.ts` creates:

```sql
CREATE TABLE task_reminders (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  trigger_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  request_code INTEGER NOT NULL UNIQUE,
  schedule_state TEXT NOT NULL DEFAULT 'pending',
  schedule_reason TEXT,
  snooze_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_task_reminders_status_trigger
ON task_reminders (status, trigger_at);
```

`trigger_at`, `snooze_until`, and timestamps are epoch milliseconds. Request
codes are allocated from `1..700,000,000`; persisted reminder flows never reuse a
code because completed/cancelled rows remain in the table. Dev-only immediate test
notifications reserve the top 1,000 codes (`699,999,001..700,000,000`) so they do
not collide with normal gap-filled rows.

Schedule states are diagnostics, not app truth:

`pending`, `exact`, `inexact`, `exact-overdue`, `inexact-overdue`,
`deferred-cap`, `error`, `delivered-active`, `blocked-notification-permission`,
`blocked-notification-channel`, `fired`, `completed`, `cancelled`, `cache-miss`.

## Scheduling policy

- Alarm request codes: `1..700,000,000`.
- Content intent: `requestCode + 700,000,000`.
- Complete action: `-requestCode`.
- Snooze action: `-(requestCode + 700,000,000)`.
- Notification ID: the alarm request code.
- All PendingIntents are `FLAG_IMMUTABLE`; alarms use `FLAG_UPDATE_CURRENT`.
- A PendingIntent token can outlive its one-shot alarm, so the cap and
  diagnostics also require a state such as `exact`/`inexact`. A fired reminder
  no longer counts as pending and `pendingIntentExists` reports `false`.
- At most **200 pending alarms**. Active reminders beyond the cap remain in
  SQLite and the native cache with state `deferred-cap`; they are never deleted.
- Overdue reminders fire at `now + 1 s` rather than being dropped.
- If a notification for an overdue reminder is still visible, reconciliation
  records `delivered-active` and does not schedule a second alarm.
- Exact alarms use `setExactAndAllowWhileIdle`. If the special permission is
  denied or revoked, scheduling falls back to `setAndAllowWhileIdle` and the
  state reports `inexact`.
- Snooze is 10 minutes. Snooze writes a new `trigger_at` in SQLite after the
  native action is drained.
- Complete/snooze PendingIntents are created only when a notification is
  delivered, so the alarm cap does not also multiply live notification
  PendingIntents.

## Lifecycle behavior

| Event                         | Behavior                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| App launch / foreground       | Drain native actions into SQLite, then reconcile all active reminders into AlarmManager         |
| Reminder created              | Insert row, allocate request code, reconcile; show blocked state if notifications are disabled  |
| Alarm fires                   | Post notification, record `fired`/`blocked-*`, keep SQLite row active until completed           |
| Complete from notification    | Cancel alarm/notification, update native cache, enqueue durable `complete` action               |
| Snooze from notification      | Cancel old alarm/notification, schedule +10 min, enqueue durable `snooze` action                |
| Complete/snooze/cancel in app | Update SQLite, reconcile; old notification and alarm are removed or replaced                    |
| Reboot                        | `BOOT_COMPLETED` rebuilds alarms from the native cache; SQLite is reconciled on next app launch |
| App update                    | `MY_PACKAGE_REPLACED` rebuilds alarms from the native cache                                     |
| Wall clock / time zone        | `TIME_SET`, `DATE_CHANGED`, `TIMEZONE_CHANGED` rebuild alarms from absolute epoch timestamps    |
| Exact permission granted      | `SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED` retries exact scheduling                        |
| Exact permission revoked      | Android may cancel exact alarms and stop the app; next launch reconciles to inexact fallback    |
| Notification permission       | Requested from the dev test lab; denied/future alarms remain scheduled and report blocked state |
| Channel blocked               | Delivery records `blocked-notification-channel`; diagnostics explains how to fix it             |
| Force stop                    | Android clears alarms and suppresses boot; next manual launch reconciles from SQLite            |
| Doze / battery saver          | Exact allow-while-idle alarms are used; inexact fallback may be delayed                         |

## Dev-only UI

`environment.m4Enabled` is true only for the `dev` flavor. When enabled:

- The Nova tab shows a **Developer tools** card.
- **Reminder test lab** can request notification permission, open notification
  and exact-alarm settings, schedule a reminder in 10/30/60/300 seconds, send an
  immediate notification, seed 205 reminders for the cap test, delete all rows,
  reconcile, and complete/snooze/cancel individual reminders.
- **Reminder diagnostics** shows permission/channel/exact-alarm state, battery
  and Doze state, cache counts, last reconcile/reschedule metadata, SQLite counts,
  cache drift, native action queue, and cached alarm rows.

Both screens use the existing semantic tokens, 48dp touch targets, safe areas,
and accessible labels. They are not registered in staging or prod.

## Build and device instructions

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
```

```bash
pnpm install --frozen-lockfile
pnpm start
pnpm android:dev
```

Manual APK flow:

```bash
cd apps/mobile/android
./gradlew assembleDevDebug
adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
adb shell monkey -p com.novatask.app.dev -c android.intent.category.LAUNCHER 1
```

On the device:

1. Open **Nova → Developer tools → Reminder test lab**.
2. Tap **Allow notifications** and accept the Android 13+ prompt.
3. Tap **Exact alarm settings** and allow alarms/reminders if the OEM requires it.
4. Schedule a 10-second reminder.
5. Lock the screen and confirm the notification appears.
6. Use **Complete** and **Snooze 10 min** from the notification.
7. Reopen the app; the diagnostics screen should show the action applied to
   SQLite and the action queue empty.
8. Run the 25-case matrix in
   [`docs/m4-test-matrix.md`](m4-test-matrix.md) using the fillable
   [`device verification pack`](m4-device-verification-pack.md) and
   [`device command reference`](m4-device-commands.md).

## Automated tests

```bash
# TypeScript / React Native
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test

# Kotlin policy tests
cd apps/mobile/android
./gradlew :app:testDevDebugUnitTest
```

Coverage:

- `ReminderPolicyTest.kt` (7 tests): cap/order, overdue, request-code namespaces,
  snooze, state mapping, terminal statuses, and pending-state classification.
- `src/reminders/policy.test.ts`: cap, allocator, draft validation, issue
  derivation, cache drift.
- `src/reminders/mappers.test.ts`: SQLite row mapping, complete/snooze reducers,
  idempotency, wrong-reminder and stale-request-code rejection.
- `src/reminders/bridge.test.ts`: missing-native error and full bridge delegation.
- `src/core/env/environment.test.ts`: M4 gating by resolved flavor, including
  staging/prod debug builds.
- `src/App.test.tsx`: shell navigation still renders with the dev runtime skipped
  under Jest.

Latest local evidence: `pnpm verify` passes (15 suites, 67 tests, formatting,
fonts, and the Android static audit). `:app:testDevDebugUnitTest` passes (7
tests). `assembleDevDebug`, `assembleStagingDebug`, and `assembleProdRelease`
all succeed. The release APK declares only `INTERNET`, `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED`, and `SCHEDULE_EXACT_ALARM` plus AndroidX's own
dynamic-receiver permission; all six reminder receivers are `exported="false"`.

## Acceptance checklist

Local/static:

- [x] Minimal `task_reminders` schema and repository.
- [x] Reconciliation replaces the native cache from SQLite.
- [x] Exact scheduling plus inexact fallback.
- [x] Immutable, uniquely-coded PendingIntents.
- [x] 200 pending-alarm cap with persistent `deferred-cap` overflow.
- [x] Complete and Snooze from a notification without JS.
- [x] Durable native action queue; actions acknowledged only after SQLite save.
- [x] Boot, app-update, time, time-zone, and exact-permission receivers.
- [x] Notification channel and Android 13+ permission flow.
- [x] Dev-only test lab and diagnostics screens.
- [x] Flavor-aware environment gating (native `APP_ENV`).
- [x] Kotlin policy tests and TypeScript mapper/policy/bridge tests.
- [x] `pnpm verify` passes.
- [x] `assembleDevDebug`, `assembleStagingDebug`, and `assembleProdRelease` pass.
- [x] Android config audit permits only the required M4 permissions/receivers;
      the release APK permission list was inspected directly.
- [x] Release signing uses a real keystore when configured, warns on the
      non-distributable debug fallback, and fails closed with
      `-PrequireReleaseSigning=true`.
- [x] Manifest receivers are non-exported. Android still delivers protected
      system broadcasts (boot, package update, time/TZ, exact access) to
      non-exported manifest receivers.

Device (blocked: no Android device/emulator attached):

- [ ] Notification delivery while foreground, background, and killed.
- [ ] Complete and Snooze from the notification.
- [ ] Reboot, force stop, app update, wall-clock, and time-zone recovery.
- [ ] Exact-alarm denial fallback and permission grant recovery.
- [ ] 205-reminder cap behavior.
- [ ] Doze/battery-saver behavior on the target OEM.
- [ ] TalkBack labels and font scaling on the dev screens.
- [ ] Full 25-case matrix in [`docs/m4-test-matrix.md`](m4-test-matrix.md).

## Risks and fallbacks

| Risk                                                 | Mitigation / current behavior                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| OEM kills background broadcasts or delays alarms     | Use allow-while-idle alarms, surface power/Doze diagnostics, and provide settings shortcuts     |
| Exact-alarm access denied                            | Fall back to inexact `setAndAllowWhileIdle`; never request `USE_EXACT_ALARM`                    |
| Notification permission denied                       | Keep the row active; record `blocked-notification-permission`; allow retry after permission     |
| Channel blocked by the user                          | Record `blocked-notification-channel`; diagnostics links to notification settings               |
| More than 200 active reminders                       | Schedule the earliest 200; retain/report the rest as `deferred-cap`; promote on later reconcile |
| Force stop clears alarms                             | Android cannot recover until the user launches the app; reconciliation runs on that launch      |
| Process death during a notification action           | Cache and queue use synchronous `commit()`; SQLite catches up on the next foreground            |
| Cache/SQLite drift                                   | Every foreground reconciliation rebuilds cache from SQLite; diagnostics report drift            |
| Race between a receiver action and JS reconciliation | The durable queue survives; a later sync applies it, with at most a transient re-arm            |
| Repeated Complete/Snooze delivery                    | Complete is terminal; duplicate snooze is ignored while the first snooze action is pending      |
| Non-exported manifest receivers                      | Protected system broadcasts still reach them; reboot delivery remains a device-test case        |
| Immediate test notification is not a SQLite row      | Dev fixture; reserved high request codes avoid collisions; it does not persist                  |
| No release keystore locally                          | Release APKs built locally use debug signing and must not be distributed                        |
| M4 schema is not a full migration framework          | `CREATE TABLE IF NOT EXISTS` only; M1 must introduce versioned migrations                       |
| Native cache loss                                    | Alarm receiver falls back to PendingIntent extras to deliver at least once                      |
| No device available in this environment              | All device cases remain explicitly pending; static/build evidence is recorded above             |
