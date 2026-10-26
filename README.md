# Nova Task

Android-first task manager. This repository contains the **M0 foundation**, the
**M4 native reminder layer**, and the **M5 task, recurrence, and reminder
engine**: SQLite-backed tasks, subtasks, reminders, and recurrence rules, a
materializer that keeps occurrences and native alarms in sync, and a minimal
accessible UI.

> **M5 status: Implementation complete. Device verification pending.**
> Do not treat M5 as complete until all 46 cases in
> [`docs/m5-device-verification-pack.md`](docs/m5-device-verification-pack.md)
> pass on the required physical devices.
>
> M4 was verified by the user on a physical Android device (notifications with
> the screen off, background and process-gone delivery, the 200 cap,
> notification actions, reboot, force-stop, permission, exact-alarm fallback,
> and time-zone changes). The M4 evidence format and 25-case archive remain in
> [`docs/m4-device-verification-pack.md`](docs/m4-device-verification-pack.md).

M5 intentionally contains **no AI, billing, voice capture, cloud backup/sync,
Play subscriptions, widgets, templates, or iOS support**. The UI is deliberately
minimal: task lists, an editor sheet, task detail, recurrence controls, and
notification settings.

Device verification: [`M5 pack`](docs/m5-device-verification-pack.md) ·
[`M4 pack`](docs/m4-device-verification-pack.md) ·
[`commands`](docs/m4-device-commands.md) · [`matrix`](docs/m4-test-matrix.md).
Release signing: [`signing`](docs/android-release-signing.md).

## Stack

| Area       | Choice                                                                                 |
| ---------- | -------------------------------------------------------------------------------------- |
| Runtime    | React Native 0.88.0, React 19.3.0, Hermes, New Architecture                            |
| Language   | TypeScript 6.0.3, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`   |
| Workspace  | pnpm 10.34.7, `node-linker=hoisted`, `apps/mobile`, `packages/shared`, `tools`, `docs` |
| Android    | minSdk 26, compileSdk 36, targetSdk 36, AGP 9.2.1, Gradle 9.4.1, Kotlin 2.2.0          |
| Navigation | React Navigation native stack + bottom tabs, custom accessible tab bar                 |
| Data       | op-sqlite 18.2.5 + Drizzle ORM 0.45.4 (`nova.db`, WAL, foreign keys)                   |
| Reminders  | Kotlin `NovaReminders` module, AlarmManager, BroadcastReceivers, NotificationCompat    |
| Time       | Luxon 3.7.2 for IANA zones; Intl on Hermes                                             |
| UI         | Plus Jakarta Sans (bundled), Roboto fallback, light/dark semantic tokens               |
| i18n       | i18next 26.5.8 + react-i18next 17.1.6, English only                                    |
| Quality    | ESLint flat config, Prettier, Husky, lint-staged, gitleaks, Jest, RNTL, JUnit          |

Full version pinning and rationale: [`docs/toolchain.md`](docs/toolchain.md).
Architecture decision: [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md).
M4 architecture, acceptance, and risks: [`docs/m4-reminders.md`](docs/m4-reminders.md).
M4 device matrix: [`docs/m4-test-matrix.md`](docs/m4-test-matrix.md).
SQLite spike: [`docs/m0-spike-results.md`](docs/m0-spike-results.md).

## Prerequisites

- Node.js 24.18.0 (supported range: `^22.13.0 || ^24.3.0 || >=26`)
- pnpm 10.34.7 (`corepack enable` or `npm install -g pnpm@10.34.7`)
- JDK 21 (JDK 17+ is required by Gradle/AGP)
- Android SDK: platform 36, build-tools 36.0.0, platform-tools, NDK
  27.1.12297006, CMake 3.22.1
- A physical Android device (API 26+) with USB debugging, or an emulator

No iOS tooling is required. The `ios/` folder does not exist.

## Initialize from scratch

```bash
git clone <repository-url> nova-task
cd nova-task

corepack enable
corepack prepare pnpm@10.34.7 --activate
# Windows alternative if corepack cannot create shims:
# npm install -g pnpm@10.34.7

pnpm install --frozen-lockfile

# Optional public build-time overrides. This repository does not auto-load
# .env files; export values in the shell that runs Metro or Gradle.
# .env.example is a reference for the supported variables.
```

On PowerShell:

```powershell
$env:NOVA_APP_ENV = 'dev'   # optional; otherwise the Gradle flavor is used
```

Configure the Android SDK:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"

sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" `
  "ndk;27.1.12297006" "cmake;3.22.1"
```

Set `ANDROID_HOME` permanently and add `%ANDROID_HOME%\platform-tools` to `PATH`.

## Run

```bash
# Terminal 1 — Metro
pnpm start

# Terminal 2 — build, install, and launch the dev flavor
pnpm android:dev
```

The **Nova** tab opens M5 notification settings: permissions, quiet hours,
default snooze length, and reconciliation health. The M4 dev-only test lab and
diagnostics screens were replaced by the M5 runtime and SQLite-backed settings.

Other flavors:

```bash
pnpm android:staging   # com.novatask.app.staging
pnpm android:prod      # com.novatask.app
```

Flavor matrix:

| Flavor  | Application ID             | Launcher name     | M5 UI   | M0 spike                                 | Cleartext  |
| ------- | -------------------------- | ----------------- | ------- | ---------------------------------------- | ---------- |
| dev     | `com.novatask.app.dev`     | Nova Task Dev     | enabled | enabled when `NOVA_ENABLE_M0_SPIKE=true` | debug only |
| staging | `com.novatask.app.staging` | Nova Task Staging | enabled | never                                    | no         |
| prod    | `com.novatask.app`         | Nova Task         | enabled | never                                    | no         |

The native module exposes the Gradle `APP_ENV` to JS, so debug builds of staging
and prod resolve to their real environment instead of defaulting to dev.

## Verify

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm check:fonts
pnpm check:android-config
pnpm check:target-sdk
```

Or all static checks:

```bash
pnpm verify
```

CI runs Jest through a dedicated script so the flags reach Jest on Linux:

```bash
pnpm test:ci
```

Android unit tests:

```bash
cd apps/mobile/android
./gradlew :app:testDevDebugUnitTest
```

Android assembly:

```bash
cd apps/mobile/android

./gradlew assembleDevDebug
./gradlew assembleStagingDebug
./gradlew assembleProdRelease

cd ../../..
node tools/verify-target-sdk.mjs \
  apps/mobile/android/app/build/outputs/apk/prod/release/app-prod-release.apk
```

`assembleProdRelease` uses R8 + resource shrinking. If
`apps/mobile/android/keystore.properties` is absent, Gradle prints a
**NON-DISTRIBUTABLE RELEASE** warning and falls back to the public debug keystore
so local/CI smoke builds work. Pass `-PrequireReleaseSigning=true` to fail closed.
**Never publish a release built with the debug key.** Full setup and CI secret
instructions: [`docs/android-release-signing.md`](docs/android-release-signing.md).

Local M5 evidence (2026-10-26, Windows/JDK 21/SDK 36):
`pnpm verify` passes (typecheck, ESLint, Prettier, 120 Jest tests in 18 suites,
font and Android config checks); `:app:testDevDebugUnitTest` passes (16 JUnit
tests, including the floating-time DST vectors). `assembleDevDebug` builds
`com.novatask.app.dev`. No Android device was attached to the agent during this
run, so the 46 M5 device cases in
[`docs/m5-device-verification-pack.md`](docs/m5-device-verification-pack.md)
remain pending.

CI evidence (2026-10-26): GitHub Actions run #5 on `67e7126` is green. The
quality job passes typecheck, lint, format, Jest (120 tests), fonts,
Android configuration, and gitleaks; the Android job passes
`:app:testDevDebugUnitTest`, `assembleDevDebug`, `assembleStagingDebug`,
`assembleProdRelease`, the targetSdk 36 APK check, and artifact upload.

Release-signing checks: the no-keystore release build printed the
NON-DISTRIBUTABLE warning and produced a `CN=Android Debug` APK;
`-PrequireReleaseSigning=true` failed configuration without a keystore; and a
throwaway test keystore produced a release-signed APK with the expected
`CN=Nova Task Test` certificate. The throwaway key and properties were removed.

## M5 task and reminder setup on a device

1. Install the dev flavor (`pnpm android:dev`).
2. Open **Inbox → New task**, add a title, pick a due date/time, choose a
   reminder, and optionally enable **Repeat**.
3. Open **Nova → Permissions** and allow notifications. If exact alarms are
   denied, tap **Exact alarm settings** and allow alarms/reminders; otherwise M5
   uses the inexact fallback.
4. Lock the screen and confirm delivery. Use the notification's **Complete** and
   **Snooze** actions, then reopen the app to confirm SQLite reflects them.
5. Change the device time zone and confirm a 09:00 task still reads 09:00 and
   its alarm moves. Repeat around a DST boundary.
6. Run the 46 cases with the
   [`M5 device verification pack`](docs/m5-device-verification-pack.md). The pack
   includes the `adb`/`sqlite3` commands for capturing task, rule, occurrence,
   and schedule rows.

**M5 remains “Implementation complete. Device verification pending” until all 46
cases pass on the required physical devices.**

M5 does not request `USE_EXACT_ALARM`, `VIBRATE`, `FOREGROUND_SERVICE`, or a
battery-optimization exemption.

## Build and install on a physical Android device

1. Enable Developer options and USB debugging on the device.
2. Connect via USB and accept the RSA fingerprint prompt.
3. Confirm the device is visible:

   ```bash
   adb devices
   ```

4. Forward Metro to the device (USB):

   ```bash
   adb reverse tcp:8081 tcp:8081
   ```

5. Start Metro:

   ```bash
   pnpm start
   ```

6. Build and install the dev flavor:

   ```bash
   pnpm android:dev
   ```

   Equivalent manual flow:

   ```bash
   cd apps/mobile/android
   ./gradlew assembleDevDebug
   adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
   adb shell monkey -p com.novatask.app.dev -c android.intent.category.LAUNCHER 1
   ```

7. For a standalone release APK (JS bundle embedded, no Metro):

   ```bash
   cd apps/mobile/android
   ./gradlew assembleProdRelease
   adb install -r app/build/outputs/apk/prod/release/app-prod-release.apk
   ```

For a store build, create `apps/mobile/android/keystore.properties` from
`keystore.properties.example`, point it at a real keystore, and keep both files
out of git.

## Verification checklist (M0 + M4 + M5)

Static:

- [x] pnpm workspace contains `apps/mobile`, `packages/shared`, `tools`, `docs`
- [x] Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- [x] Path aliases in TypeScript, Babel, Metro, and Jest
- [x] Android flavors `dev`, `staging`, `prod` with the approved application IDs
- [x] minSdk 26 / compileSdk 36 / targetSdk 36
- [x] Hermes and New Architecture enabled
- [x] Edge-to-edge and predictive back enabled
- [x] R8 + resource shrinking for release
- [x] Release signing uses `keystore.properties` when present; missing signing produces an explicit NON-DISTRIBUTABLE debug fallback or fails closed with `-PrequireReleaseSigning=true`
- [x] `allowBackup=false` and task DB excluded from backup/data extraction
- [x] Release APK adds only `INTERNET`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, and `SCHEDULE_EXACT_ALARM` (debug also gets React Native's debug-only overlay/local-network permissions)
- [x] No `USE_EXACT_ALARM`, `VIBRATE`, `FOREGROUND_SERVICE`, or battery-optimization exemption
- [x] Light/dark semantic tokens; brand `#0F5557` / `#6FC3C4`
- [x] Spacing 2/4/8/12/16/24/32; radius 8/12/16/24/full; 48dp touch; 56dp header; 64dp tab bar
- [x] Plus Jakarta Sans 4 weights + Roboto fallback, checked by script
- [x] Root native stack + four tabs with active pill and accessible labels
- [x] AppError, ErrorBoundary, Logger with redaction, no-op CrashReporter, Clock, ULID
- [x] Environment config, i18next, English locale, tested 12-hour formatter
- [x] `@nova/shared` Zod schemas, enums, Capabilities, no React imports
- [x] SQLite spike code for WAL, FKs, synchronous, busy_timeout, FTS5, JSON1, Luxon, Intl
- [x] ESLint flat config, Prettier, Husky, lint-staged, gitleaks, Jest, RNTL
- [x] `assembleDevDebug`, `assembleStagingDebug`, and `assembleProdRelease` succeed; APK minSdk 26 / targetSdk 36 verified
- [x] GitHub Actions workflow configured for cache install, typecheck, lint, format, Jest, fonts, gitleaks, Android unit tests, all three APKs, targetSdk 36

M4 static:

- [x] Minimal `task_reminders` SQLite schema and repository
- [x] Native `NovaReminders` module and app-local package registration
- [x] Exact scheduling plus inexact allow-while-idle fallback
- [x] Immutable, uniquely-coded PendingIntents; 200 pending-alarm cap
- [x] Complete and Snooze from notification without JS
- [x] Durable native cache and action queue using synchronous commits
- [x] Boot, app-update, time, time-zone, and exact-permission receivers
- [x] Notification channel, runtime permission flow, and diagnostics states
- [x] Dev-only test lab and diagnostics screens in M4 (replaced by the M5 settings screen)
- [x] Kotlin policy/unit tests and TypeScript policy/mapper/bridge tests
- [x] `pnpm verify` and `:app:testDevDebugUnitTest` pass

M5 static:

- [x] M5 SQLite schema and migrations for tasks, subtasks, lists, tags, reminders, recurrence, schedules, history, tombstones, settings, and drafts
- [x] Task create/edit/complete/undo/delete/undo/archive/restore/duplicate/move/priority and subtask CRUD
- [x] Recurrence engine: daily, weekdays, weekly single/multiple, monthly date/Nth weekday, yearly, interval, end date, end-after-N, repeat-after-completion
- [x] Occurrence actions: complete, skip, edit one/series/following, delete one/series, with floating local dates and DST gap/overlap policy
- [x] Reminder CRUD, exact/inexact scheduling, quiet hours, snooze, complete-from-notification, and the 200-alarm cap
- [x] SQLite-first reconciliation on start, resume, task change, boot, time change, time-zone change, and permission change
- [x] Recurring reminder horizon of min(14 days, 10 occurrences)
- [x] Minimal accessible UI: lists, editor sheet, date/time and reminder pickers, recurrence editor, detail, undo, states
- [x] 48x48dp targets, checkbox state, task-row labels, assertive error announcements
- [x] Recurrence, lifecycle, reconciliation, component, and Kotlin floating-time tests

Device-only (see `docs/m0-spike-results.md`, `docs/m4-test-matrix.md`, and
`docs/m5-device-verification-pack.md`):

- [ ] App builds and launches on a physical Android device
- [ ] Tabs navigate and TalkBack announces role/label/selected state
- [ ] SQLite spike: FTS5, JSON1, WAL, Luxon IANA, Hermes Intl
- [ ] Fonts render as Plus Jakarta Sans with system font scaling capped at 2.0x
- [ ] M4 was device-verified by the user (notifications, actions, reboot, force stop, clock/TZ, exact fallback, cap, power saving)
- [ ] M5 46-case task, recurrence, reminder, reconciliation, and accessibility matrix

## Project layout

```text
apps/mobile            React Native Android app
  android/             Gradle project, flavors, manifests, resources
  assets/fonts/        Plus Jakarta Sans + Roboto source of truth
  src/core/            errors, logging, crash, clock, IDs, environment
  src/db/              nova.db client, Drizzle spike schema, M0 spike
  src/design/          semantic tokens, ThemeProvider, AppText
  src/i18n/            i18next setup and English locale
  src/navigation/      root stack, tabs, custom tab bar
  src/tasks/           M5 store, service, lifecycle, repositories, UI
  src/recurrence/      recurrence engine, time/DST policy, materializer
  src/notifications/   schedule projection, reconciliation, SQLite repository
  src/reminders/       native bridge, policy, and shared types
packages/shared        @nova/shared domain contracts (no React/RN)
tools                  font/config/APK checks, ESLint rules, secret guard
docs                   toolchain, ADRs, M0 spike, M4/M5 architecture and packs
.github/workflows      CI
```

## Environment variables

Only public, non-secret values are inlined at bundle time:

| Variable               | Purpose                       | Default                            |
| ---------------------- | ----------------------------- | ---------------------------------- |
| `NOVA_APP_ENV`         | `dev`, `staging`, or `prod`   | Gradle flavor (`APP_ENV` constant) |
| `NOVA_API_BASE_URL`    | Public API origin placeholder | per-environment                    |
| `NOVA_ENABLE_M0_SPIKE` | Dev-only SQLite spike         | `false` unless set                 |

M5 removed the M4 dev-only screens; every flavor exposes the same task and
settings UI. `NOVA_APP_ENV` still falls back to the native Gradle flavor
constant (`dev`, `staging`, or `prod`). Setting `NOVA_APP_ENV` explicitly
overrides the flavor. After changing build-time values, restart Metro with
`pnpm start -- --reset-cache`.

## License

Proprietary. All rights reserved.
