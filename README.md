# Nova Task

Android-first task manager. This repository contains the **M0 foundation** plus the
**M4 Android reminder proof of concept**: native alarms, SQLite-backed
reconciliation, notifications, and dev-only test/diagnostics screens.

> **M4 status: Implementation complete. Device verification pending.**
> Do not treat M4 as complete until all 25 cases in
> [`docs/m4-device-verification-pack.md`](docs/m4-device-verification-pack.md)
> pass on the required physical devices.

M4 intentionally contains **no full task product, AI, billing, voice capture,
recurrence, cloud backup, or iOS support**. The four tabs remain placeholders;
the only new product surface is the dev-only reminder tooling in the Nova tab.

Device verification: [`pack`](docs/m4-device-verification-pack.md) ·
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

The dev flavor exposes **Nova → Developer tools** for the M4 reminder test lab
and diagnostics. Staging and prod do not register those screens.

Other flavors:

```bash
pnpm android:staging   # com.novatask.app.staging
pnpm android:prod      # com.novatask.app
```

Flavor matrix:

| Flavor  | Application ID             | Launcher name     | M4 dev tools | M0 spike                                 | Cleartext  |
| ------- | -------------------------- | ----------------- | ------------ | ---------------------------------------- | ---------- |
| dev     | `com.novatask.app.dev`     | Nova Task Dev     | enabled      | enabled when `NOVA_ENABLE_M0_SPIKE=true` | debug only |
| staging | `com.novatask.app.staging` | Nova Task Staging | never        | never                                    | no         |
| prod    | `com.novatask.app`         | Nova Task         | never        | never                                    | no         |

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

Local M4 evidence (2026-10-24, Windows/JDK 21/SDK 36):
`assembleDevDebug`, `assembleStagingDebug`, and `assembleProdRelease` build;
`testDevDebugUnitTest` passes; `pnpm verify` passes. The dev APK installs
`com.novatask.app.dev`. No Android device or emulator was attached, so the 25
device cases remain pending.

Release-signing checks: the no-keystore release build printed the
NON-DISTRIBUTABLE warning and produced a `CN=Android Debug` APK;
`-PrequireReleaseSigning=true` failed configuration without a keystore; and a
throwaway test keystore produced a release-signed APK with the expected
`CN=Nova Task Test` certificate. The throwaway key and properties were removed.

## M4 reminder setup on a device

1. Install the dev flavor (`pnpm android:dev`).
2. Open **Nova → Developer tools → Reminder test lab**.
3. Tap **Allow notifications** and accept the Android 13+ prompt.
4. If the device reports exact alarms as denied, tap **Exact alarm settings**
   and allow alarms/reminders. Otherwise M4 uses the inexact fallback.
5. Schedule a 10-second reminder, lock the screen, and confirm delivery.
6. Test **Complete** and **Snooze 10 min** from the notification.
7. Open **Reminder diagnostics** to inspect the cache, SQLite counts, power
   state, channel state, and native action queue.
8. Run the 25 cases with the
   [`device verification pack`](docs/m4-device-verification-pack.md), the
   [`device command reference`](docs/m4-device-commands.md), and the
   [`matrix`](docs/m4-test-matrix.md).

**M4 remains “Implementation complete. Device verification pending” until all 25
cases pass on the required physical devices.**

M4 does not request `USE_EXACT_ALARM`, `VIBRATE`, `FOREGROUND_SERVICE`, or a
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

## Verification checklist (M0 + M4)

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
- [x] Dev-only test lab and diagnostics screens, flavor-gated by native `APP_ENV`
- [x] Kotlin policy/unit tests and TypeScript policy/mapper/bridge tests
- [x] `pnpm verify` and `:app:testDevDebugUnitTest` pass

Device-only (see `docs/m0-spike-results.md` and `docs/m4-test-matrix.md`):

- [ ] App builds and launches on a physical Android device
- [ ] Tabs navigate and TalkBack announces role/label/selected state
- [ ] SQLite spike: FTS5, JSON1, WAL, Luxon IANA, Hermes Intl
- [ ] Fonts render as Plus Jakarta Sans with system font scaling capped at 2.0x
- [ ] M4 25-case reminder matrix (notifications, actions, reboot, force stop, clock/TZ, exact fallback, cap, power saving)

## Project layout

```text
apps/mobile            React Native Android app
  android/             Gradle project, flavors, manifests, resources
  assets/fonts/        Plus Jakarta Sans + Roboto source of truth
  src/core/            errors, logging, crash, clock, IDs, environment
  src/db/              nova.db client, Drizzle spike schema, M0 spike
  src/design/          semantic tokens, ThemeProvider, AppText
  src/i18n/            i18next setup and English locale
  src/navigation/      root stack, tabs, custom tab bar, placeholders
  src/reminders/       M4 bridge, SQLite repository, service, policy, dev UI
packages/shared        @nova/shared domain contracts (no React/RN)
tools                  font/config/APK checks, ESLint rules, secret guard
docs                   toolchain, ADRs, M0 spike results, M4 architecture + matrix
.github/workflows      CI
```

## Environment variables

Only public, non-secret values are inlined at bundle time:

| Variable               | Purpose                       | Default                            |
| ---------------------- | ----------------------------- | ---------------------------------- |
| `NOVA_APP_ENV`         | `dev`, `staging`, or `prod`   | Gradle flavor (`APP_ENV` constant) |
| `NOVA_API_BASE_URL`    | Public API origin placeholder | per-environment                    |
| `NOVA_ENABLE_M0_SPIKE` | Dev-only SQLite spike         | `false` unless set                 |

M4 dev tools follow `NOVA_APP_ENV`, which now falls back to the native Gradle
flavor constant (`dev`, `staging`, or `prod`) instead of only `__DEV__`. Setting
`NOVA_APP_ENV` explicitly overrides the flavor. After changing build-time values,
restart Metro with `pnpm start -- --reset-cache`.

## License

Proprietary. All rights reserved.
