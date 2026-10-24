# ADR 0001 — M0 stack and platform decisions

- **Status:** Accepted
- **Date:** 2026-10-24
- **Milestone:** M0
- **Deciders:** Nova Task engineering

## Context

Nova Task is an Android-first task manager. V1 is Android only. M0 must create a
production-shaped foundation that can accept real features (tasks, reminders,
recurrence, AI, billing, voice capture, cloud backup, notifications) without
rework, while deliberately shipping none of them.

Constraints from the approved plan:

- React Native + TypeScript, strict settings, pnpm monorepo.
- Android application IDs `com.novatask.app.dev`, `com.novatask.app.staging`,
  `com.novatask.app`; minSdk 26, compileSdk/targetSdk 36.
- Hermes and the New Architecture.
- SQLite is the future source of truth; M0 is a spike only.
- No secrets, no backup of the task database, no notification/alarm permissions.

## Decision

### React Native 0.88.0 / React 19.3.0

Use the latest stable React Native version that supports compileSdk 36 and the
current Android toolchain. RN 0.88 pairs with React 19.3 and the New
Architecture by default. Versions are pinned exactly; the lockfile is committed.

### pnpm with hoisted linking

Use a pnpm workspace (`apps/mobile`, `packages/shared`, `tools`, `docs`) with
`node-linker=hoisted`. React Native's Gradle autolinking and Metro resolver are
most reliable with a flat `node_modules` at the repository root. The cost is
weaker dependency isolation; the benefit is reproducible native builds.

`@nova/shared` is a real workspace package consumed through `workspace:*`.
Metro watches the workspace root and resolves the package source directly.

### Strict TypeScript

`strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are on
from day one, plus `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`, and
`verbatimModuleSyntax`. Path aliases (`@/`) are mirrored in TypeScript, Babel,
Metro, and Jest to avoid divergence.

### Android-only, flavor-based environments

Three product flavors (`dev`, `staging`, `prod`) carry fixed application IDs
rather than suffixes. Debug builds allow cleartext for Metro; release builds do
not. `allowBackup=false` plus explicit data-extraction exclusions protect the
future `nova.db`. Predictive back and edge-to-edge are enabled now so later UI
does not need to retrofit navigation behavior.

### SQLite: op-sqlite + Drizzle ORM

SQLite will be the local source of truth. op-sqlite provides a fast JSI binding
with FTS5/JSON1 support. Drizzle provides typed schema and migrations without
locking domain code to a vendor. M0 only creates a throwaway `m0_spike` table
and drops/recreates it; no product tables or migrations exist yet.

Pragmas are applied when the database opens: `foreign_keys=ON`,
`journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`. WAL improves
reader/writer concurrency; NORMAL is the standard durability/performance
trade-off for mobile; the busy timeout prevents transient lock failures.

### Navigation

React Navigation 7 with a native stack and bottom tabs. Tabs use a custom tab
bar rather than the default to guarantee 48dp targets, safe-area handling, an
active pill, and explicit accessibility roles/labels. No gesture-handler or
Reanimated dependency is needed for M0.

### Theme, typography, and i18n

Semantic tokens are the only source of colour. Light and dark themes share the
same token names. Brand primaries are `#0F5557` (light) and `#6FC3C4` (dark).
Plus Jakarta Sans is bundled in four weights with Roboto as the fallback; the
font-check script prevents broken typography from reaching a build.

i18next is initialized synchronously with bundled English resources. All UI
strings use translation keys. Time is formatted with Intl in 12-hour form and
covered by unit tests.

### Infrastructure boundaries

- `packages/shared` has no React, React Native, UI, or platform imports. ESLint
  enforces this.
- `src/core` contains platform-light utilities: `AppError`, `Logger` (with
  redaction), `Clock`, ULID IDs, environment config, crash reporter interface.
- A no-op crash reporter keeps vendor choice open.
- The logger redacts secrets by key and by pattern (JWT, Bearer, email).

### Quality gates

ESLint flat config includes local rules that ban colour literals outside
`colors.ts` and literal JSX text. Prettier, Husky, lint-staged, gitleaks, Jest,
RNTL, and CI enforce the rest. CI builds both `assembleDevDebug` and
`assembleProdRelease`, then verifies the APK targetSdk is 36.

## Consequences

Positive:

- Feature milestones can add screens, tables, and native modules without
  changing the foundation.
- Accessibility and theming are structural, not retrofitted.
- CI catches the expensive Android regressions (SDK level, signing, R8, Hermes).
- Domain contracts are reusable and testable outside React Native.

Negative / trade-offs:

- React Native 0.88 is recent; third-party compatibility must be checked before
  adding dependencies.
- New Architecture native builds require NDK/CMake and are slower in CI.
- Hoisted pnpm linking allows accidental phantom dependencies; code review and
  explicit dependency declarations are required.
- Hermes Intl behavior depends on Android ICU data and must be verified on a
  device. M0 includes an on-device check for this reason.
- ULIDs fall back to `Math.random` when Web Crypto is unavailable in Hermes.
  IDs are uniqueness-oriented, not security tokens. A CSPRNG polyfill can be
  introduced when IDs become security-sensitive.
- R8 full mode can expose missing keep rules; release builds are exercised in CI.

## Alternatives considered

| Alternative                      | Why not now                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Bare Android/Kotlin              | Rejected by product direction; React Native is approved                      |
| Expo managed workflow            | Native SQLite/New Architecture control and flavor IDs are simpler in bare RN |
| Yarn/npm workspaces              | pnpm is the approved package manager; lockfile + hoisting are deterministic  |
| JSC                              | Hermes is required for modern RN and Intl/startup performance                |
| `expo-sqlite`                    | op-sqlite was approved and exposes the needed pragmas/FTS5 directly          |
| Raw SQL only                     | Drizzle keeps schema typed without hiding SQL; adapter is thin               |
| Default React Navigation tab bar | Cannot guarantee the approved pill/touch/accessibility design                |
| Reanimated / Gesture Handler     | Not needed for M0; avoid native surface area                                 |
| Notifee / Firebase / Sentry      | Explicitly out of scope for M0                                               |
| iOS support                      | V1 is Android only                                                           |

## Follow-ups

- Run the device-only SQLite/Hermes checks and record results in
  `docs/m0-spike-results.md`.
- Add a real migration strategy and product tables in the persistence milestone.
- Replace Babel-inlined environment values with native BuildConfig plumbing if
  environment drift becomes a risk.
- Add a CSPRNG if IDs or tokens require cryptographic unpredictability.
- Add E2E (Maestro/Detox) once real flows exist.
