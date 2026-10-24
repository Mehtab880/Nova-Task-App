# M0 SQLite spike results

- **Date:** 2026-10-24
- **Milestone:** M0
- **Database:** `nova.db`
- **Scope:** persistence capabilities only. No product tables, migrations, sync,
  reminders, recurrence, or AI.

## Status summary

| Area                                 | Host (Node/Jest)          | Android device               |
| ------------------------------------ | ------------------------- | ---------------------------- |
| TypeScript compilation of spike code | PASS                      | n/a                          |
| Android dev/release assembly         | PASS (SDK/NDK, no device) | n/a                          |
| Luxon IANA zones + DST               | PASS                      | NOT RUN                      |
| Intl IANA time zones                 | PASS (Node ICU)           | NOT RUN (Hermes/Android ICU) |
| op-sqlite open + pragmas             | NOT RUN (native module)   | NOT RUN                      |
| foreign_keys=ON                      | NOT RUN                   | NOT RUN                      |
| WAL journal mode                     | NOT RUN                   | NOT RUN                      |
| synchronous=NORMAL                   | NOT RUN                   | NOT RUN                      |
| busy_timeout=5000                    | NOT RUN                   | NOT RUN                      |
| Drizzle insert/select on `m0_spike`  | NOT RUN                   | NOT RUN                      |
| FTS5 virtual table + MATCH           | NOT RUN                   | NOT RUN                      |
| JSON1 `json_extract` / `json_valid`  | NOT RUN                   | NOT RUN                      |

**Conclusion:** the spike is implemented and unit-tested where the host allows,
and both Android variants assemble successfully with SDK 36 and the required
native modules. Device-dependent runtime checks are **not yet verified** because
this build environment has no connected Android device or emulator. M0 is not
considered device-verified until the checklist at the end of this document is
completed.

## What the spike does

Entry point: `apps/mobile/src/db/m0-spike.ts`.

1. Opens `nova.db` at the default app database location.
2. Applies and verifies:
   - `PRAGMA foreign_keys = ON`
   - `PRAGMA journal_mode = WAL`
   - `PRAGMA synchronous = NORMAL`
   - `PRAGMA busy_timeout = 5000`
3. Drops and recreates the temporary `m0_spike` table:
   `id TEXT PRIMARY KEY NOT NULL`, `payload TEXT NOT NULL`, `created_at TEXT NOT NULL`.
4. Inserts and selects one row through Drizzle ORM using the op-sqlite adapter.
5. Creates a temporary FTS5 virtual table, inserts one row, runs a `MATCH`
   query, and drops it.
6. Runs JSON1 `json_extract` and `json_valid`.
7. Verifies Luxon resolves `America/New_York` (winter EST and summer EDT) and
   `Asia/Tokyo`.
8. Verifies Hermes `Intl.DateTimeFormat` resolves the same IANA zones.
9. Logs a JSON report through the app logger.

No task, reminder, recurrence, AI, billing, backup, or user tables are created.
The `m0_spike` table is throwaway and is recreated on every run.

## Host verification (executed)

Commands:

```bash
pnpm typecheck
pnpm --filter @nova/mobile test -- --runInBand src/db/spike/timezone-checks.test.ts
```

Observed values:

```text
Luxon: NY=2026-01-15 12:00 -0500  Tokyo=2026-01-16 02:00 +0900  summer=-240
Intl:  NY=12:00 PM  Tokyo=2:00 AM  UTC=5:00 PM
```

This confirms the pure time-zone logic and the expected values used by the
on-device assertions. It does **not** prove Hermes Intl behavior; Node ships full
ICU data, while Hermes delegates to the Android platform ICU.

## Android build verification (executed)

Environment: Windows, JDK 21.0.11, Android SDK platform 36, build-tools 36.0.0,
NDK 27.1.12297006, CMake 3.22.1. No device or emulator was attached.

```bash
cd apps/mobile/android
./gradlew assembleDevDebug assembleStagingDebug --no-daemon
./gradlew assembleProdRelease --no-daemon

cd ../../..
node tools/verify-target-sdk.mjs \
  apps/mobile/android/app/build/outputs/apk/prod/release/app-prod-release.apk
```

Observed:

| Check                  | Result                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `assembleDevDebug`     | PASS                                                             |
| `assembleStagingDebug` | PASS                                                             |
| `assembleProdRelease`  | PASS (R8 + resource shrinking, Hermes bytecode)                  |
| Dev APK package        | `com.novatask.app.dev`, `0.1.0-dev`, label `Nova Task Dev`       |
| Staging APK package    | `com.novatask.app.staging`, `0.1.0-staging`, `Nova Task Staging` |
| Prod APK package       | `com.novatask.app`, `0.1.0`, label `Nova Task`                   |
| APK minSdk / targetSdk | 26 / 36                                                          |
| Prod JS bundle         | Hermes bytecode (`C6 1F BC 03 C1 03 19 1F`)                      |
| Bundled fonts          | 5 TTFs present in the prod APK                                   |
| Prod signing           | debug fallback (no `keystore.properties` in this environment)    |
| R8 mapping file        | generated                                                        |

These results prove the native project compiles and packages. They do not prove
runtime behavior: opening `nova.db`, pragmas, FTS5, JSON1, and Hermes Intl still
require the on-device run below.

## How to run the device spike

Prerequisites: dev flavor installed, Metro running, `NOVA_ENABLE_M0_SPIKE=true`.

```bash
# Terminal 1
NOVA_ENABLE_M0_SPIKE=true pnpm start -- --reset-cache

# Terminal 2
pnpm android:dev

# Watch Metro logs for:
#   M0 SQLite spike complete { passed, failed, engine }
#   M0 SQLite spike report  { report: "<JSON>" }
# Failures are logged at error level with the full report.
```

On PowerShell:

```powershell
$env:NOVA_ENABLE_M0_SPIKE = 'true'
pnpm start -- --reset-cache
```

The spike runs automatically once per launch when all of the following are true:

- build flavor is `dev`
- `NOVA_ENABLE_M0_SPIKE=true`
- `NOVA_APP_ENV` is not `staging` or `prod`

## Expected on-device report shape

```json
{
  "startedAt": "2026-10-24T12:00:00.000Z",
  "finishedAt": "2026-10-24T12:00:00.420Z",
  "engine": "hermes",
  "platform": "android 36",
  "database": "nova.db",
  "databasePath": "/data/user/0/com.novatask.app.dev/databases/nova.db",
  "sqliteVersion": "3.x.x",
  "passed": 10,
  "failed": 0,
  "checks": [
    { "id": "open-database", "status": "pass", "details": "sqlite … at …" },
    { "id": "foreign-keys", "status": "pass", "details": "foreign_keys=1" },
    { "id": "wal", "status": "pass", "details": "journal_mode=wal" },
    { "id": "synchronous", "status": "pass", "details": "synchronous=NORMAL (1)" },
    { "id": "busy-timeout", "status": "pass", "details": "busy_timeout=5000" },
    { "id": "drizzle-m0-spike", "status": "pass", "details": "drizzle read 1 row via op-sqlite" },
    { "id": "fts5", "status": "pass", "details": "FTS5 MATCH returned 1 row" },
    { "id": "json1", "status": "pass", "details": "json_extract=1, json_valid=1" },
    { "id": "luxon-iana", "status": "pass", "details": "Luxon: …" },
    { "id": "hermes-intl", "status": "pass", "details": "Intl resolved NY=12:00 PM …" }
  ]
}
```

Actual device values (fill in after running):

| Check          | Observed | Status  |
| -------------- | -------- | ------- |
| Engine         | pending  | pending |
| SQLite version | pending  | pending |
| Database path  | pending  | pending |
| foreign_keys   | pending  | pending |
| WAL            | pending  | pending |
| synchronous    | pending  | pending |
| busy_timeout   | pending  | pending |
| Drizzle        | pending  | pending |
| FTS5           | pending  | pending |
| JSON1          | pending  | pending |
| Luxon          | pending  | pending |
| Hermes Intl    | pending  | pending |

## Risks and notes

- FTS5 must be compiled into op-sqlite. If the FTS5 check fails, do not add
  search features until the build flag or library is confirmed.
- Hermes Intl depends on the device's ICU data. Some minimally configured
  Android images can return incomplete zone names; the check asserts formatted
  local times, not localized zone abbreviations.
- WAL leaves `nova.db-wal` and `nova.db-shm`. These are excluded from backup and
  data extraction together with `nova.db`.
- The spike requires the native module and therefore cannot run in Jest. Jest
  mocks op-sqlite and covers only pure time-zone helpers.
- `m0_spike` is not a product table and must not be referenced by feature code.

## Device verification checklist

- [ ] Dev APK installs and launches on a physical Android device
- [ ] Metro log shows `passed: 10`, `failed: 0`
- [ ] `engine` is `hermes`
- [ ] `journal_mode=wal`
- [ ] FTS5 MATCH returns one row
- [ ] JSON1 returns `1` for extract and valid
- [ ] Luxon and Hermes Intl agree on New York and Tokyo times
- [ ] Actual values pasted into the table above
