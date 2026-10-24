# M4 device command reference

Status: **Implementation complete. Device verification pending.**

Use this reference with
[`docs/m4-device-verification-pack.md`](m4-device-verification-pack.md) and the
25-case matrix. Commands are for the **dev** flavor:

- Package: `com.novatask.app.dev`
- Activity: `com.novatask.app.MainActivity`
- APK: `apps/mobile/android/app/build/outputs/apk/dev/debug/app-dev-debug.apk`
- Notification channel: `task_reminders`

OEMs sometimes rename settings and restrict shell commands. Record the actual
command output even when a shortcut does not work on a particular device.

## 1. Connect and verify the device

```bash
adb devices -l
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell dumpsys package com.novatask.app.dev | grep versionName
```

PowerShell equivalents:

```powershell
adb devices -l
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell dumpsys package com.novatask.app.dev | Select-String versionName
```

Record the exact model, Android release, API level, OEM, build type, and UTC
timestamp in the run metadata block.

## 2. Build and install the dev APK

From the repository root:

```bash
cd apps/mobile/android
./gradlew :app:assembleDevDebug
adb install -r -d app/build/outputs/apk/dev/debug/app-dev-debug.apk
```

PowerShell:

```powershell
cd apps/mobile/android
.\gradlew.bat :app:assembleDevDebug
adb install -r -d app\build\outputs\apk\dev\debug\app-dev-debug.apk
```

The debug APK uses Metro. Start it from the repository root in another terminal:

```bash
pnpm start
adb reverse tcp:8081 tcp:8081
```

A babeled release/dev bundle can be used for app-killed tests; the notification
receiver itself does not need React Native.

## 3. Launch Nova and open the Reminder Lab

There is no deep link for the dev screens. Launch the app, then navigate:

```bash
adb shell am start -W -n com.novatask.app.dev/com.novatask.app.MainActivity
```

Manual navigation:

1. Tap **Nova** in the bottom tab bar.
2. Under **Developer tools**, tap **Reminder test lab**.
3. Optionally tap **Reminder diagnostics** for the inspection screen.

The dev screens are registered only when the resolved environment is `dev`.
Staging and prod builds must not show them.

## 4. Schedule a test reminder

This is intentionally a manual UI action because there is no scheduling deep
link or test harness endpoint.

1. In **Reminder test lab**, enter a title such as `M4 device test`.
2. Enter an optional body.
3. Choose **In 10 seconds**.
4. Tap **Schedule reminder**.
5. Open **Reminder diagnostics** and confirm the new row, request code,
   schedule state, and pending-alarm count.
6. Lock the screen and wait for the notification.
7. Use **Complete** or **Snooze 10 min** on the notification.
8. Reopen the app and confirm the action drains into SQLite.

If notification permission or exact-alarm access is not granted, use the
settings buttons on the test lab screen and repeat.

## 5. Inspect scheduled alarms

Capture the full snapshot, then filter on the host:

```bash
adb shell dumpsys alarm > device-alarms.txt
```

```powershell
adb shell dumpsys alarm > device-alarms.txt
Select-String -Path device-alarms.txt -Pattern 'com.novatask.app.dev' -Context 4,10
```

Look for the package in the pending-alarm entries and compare the count with
**Reminder diagnostics**. The exact layout of `dumpsys alarm` is Android-version
specific, so record the raw output as evidence as well as the filtered excerpt.

Useful cross-checks:

```bash
adb shell dumpsys alarm | grep -i -A 10 -B 5 'com.novatask.app.dev'
adb shell dumpsys package com.novatask.app.dev | grep -i -A 3 -B 3 'alarm'
```

## 6. Inspect the notification channel

```bash
adb shell dumpsys notification --noredact > device-notifications.txt
adb shell dumpsys notification --noredact | grep -i -A 30 -B 5 task_reminders
```

PowerShell:

```powershell
adb shell dumpsys notification --noredact > device-notifications.txt
Select-String -Path device-notifications.txt -Pattern 'task_reminders' -Context 5,30
```

Expected: channel `task_reminders` exists with importance `high` (or the
importance the user selected). Record whether it is blocked.

On Android 13+ also inspect the app notification permission:

```bash
adb shell dumpsys package com.novatask.app.dev | grep -i -A 2 -B 2 POST_NOTIFICATIONS
adb shell cmd appops get com.novatask.app.dev POST_NOTIFICATION
```

## 7. Inspect exact-alarm permission

```bash
adb shell cmd appops get com.novatask.app.dev SCHEDULE_EXACT_ALARM
adb shell dumpsys package com.novatask.app.dev | grep -i -A 3 -B 3 SCHEDULE_EXACT_ALARM
```

On some builds the legacy form is needed:

```bash
adb shell appops get com.novatask.app.dev SCHEDULE_EXACT_ALARM
```

Expected on Android 12+:

- Allowed: appops reports `allow` (or the diagnostics screen shows `granted`).
- Denied: appops reports `deny`/`ignore` or no grant; scheduling must report
  `inexact` and use the allow-while-idle fallback.

Prefer the system Settings screen for grant/revoke tests on retail devices. Do
not assume shell appops writes are permitted by every OEM.

## 8. Capture logcat

Clear the buffer before a case:

```bash
adb logcat -c
```

Capture a bounded snapshot after reproducing the behavior:

```bash
adb logcat -d -v threadtime \
  -s NovaReminders:V NotificationService:V AlarmManager:V AndroidRuntime:E \
  > device-logcat.txt
```

PowerShell:

```powershell
adb logcat -c
adb logcat -d -v threadtime -s NovaReminders:V NotificationService:V AlarmManager:V AndroidRuntime:E > device-logcat.txt
```

Watch live while reproducing (stop with Ctrl+C):

```bash
adb logcat -v threadtime | grep -E 'NovaReminders|NotificationService|AlarmManager|AndroidRuntime'
```

```powershell
adb logcat -v threadtime | Select-String -Pattern 'NovaReminders|NotificationService|AlarmManager|AndroidRuntime'
```

Also capture a full log when diagnosing OEM behavior:

```bash
adb logcat -b all -d -v threadtime > device-logcat-all.txt
```

## 9. Evidence bundle

Use a timestamped directory and keep it outside Git (`artifacts/` is ignored):

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "artifacts/device-$STAMP"
adb shell dumpsys alarm > "artifacts/device-$STAMP/alarms.txt"
adb shell dumpsys notification --noredact > "artifacts/device-$STAMP/notifications.txt"
adb shell cmd appops get com.novatask.app.dev SCHEDULE_EXACT_ALARM > "artifacts/device-$STAMP/exact-alarm.txt"
adb logcat -d -v threadtime > "artifacts/device-$STAMP/logcat.txt"
adb shell screencap -p /sdcard/nova-screen.png
adb pull /sdcard/nova-screen.png "artifacts/device-$STAMP/screen.png"
adb shell rm /sdcard/nova-screen.png
```

PowerShell:

```powershell
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$dir = "artifacts/device-$stamp"
New-Item -ItemType Directory -Force $dir | Out-Null
adb shell dumpsys alarm > "$dir/alarms.txt"
adb shell dumpsys notification --noredact > "$dir/notifications.txt"
adb shell cmd appops get com.novatask.app.dev SCHEDULE_EXACT_ALARM > "$dir/exact-alarm.txt"
adb logcat -d -v threadtime > "$dir/logcat.txt"
adb shell screencap -p /sdcard/nova-screen.png
adb pull /sdcard/nova-screen.png "$dir/screen.png"
adb shell rm /sdcard/nova-screen.png
```

Optional SQLite evidence for a debuggable dev build:

```bash
adb shell run-as com.novatask.app.dev ls -l databases
adb exec-out run-as com.novatask.app.dev cat databases/nova.db > nova.db
adb exec-out run-as com.novatask.app.dev cat databases/nova.db-wal > nova.db-wal
```

Include both the database and WAL file if the database is in WAL mode, or query
the diagnostics screen instead.

## 10. Recovery and power cases

Force stop:

```bash
adb shell am force-stop com.novatask.app.dev
```

Reboot:

```bash
adb reboot
adb wait-for-device
adb devices -l
```

App update (same dev APK over itself):

```bash
adb install -r -d app/build/outputs/apk/dev/debug/app-dev-debug.apk
```

Doze (emulator or debuggable test device):

```bash
adb shell dumpsys battery unplug
adb shell dumpsys deviceidle force-idle
adb shell dumpsys deviceidle unforce
adb shell dumpsys battery reset
```

Battery saver and notification-channel blocking should be toggled in Android
Settings on physical devices. Record the Settings path used.

Wall-clock and time-zone changes should be performed in Settings on retail
devices. Emulator/rooted-device shortcuts are not evidence of retail behavior.

## 11. What not to do

- Do not `adb shell am broadcast` to the reminder receivers. They are
  `android:exported="false"` by design, so shell broadcasts are rejected.
  Duplicate-delivery cases require a temporary debug hook or unit-level proof.
- Do not rely on `dumpsys alarm` formatting across Android versions; attach the
  raw snapshot.
- Do not mark a case passed from unit tests. The 25 device cases require the
  native device path.
- Do not use a debug-signed release APK for distribution.
