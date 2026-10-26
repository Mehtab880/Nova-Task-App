<#
.SYNOPSIS
Collect Nova Task M5 device evidence: database, alarms, notifications, screenshot.

.DESCRIPTION
Pulls the dev-flavour SQLite database (including the WAL companions), a filtered
`dumpsys alarm` section, pending notifications for the app and a screenshot into
`artifacts/device/<timestamp>/`, then prints a schema/row summary.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File tools/device-evidence.ps1
#>
[CmdletBinding()]
param(
  [string]$Package = 'com.novatask.app.dev',
  [string]$OutDir = 'artifacts/device'
)

$ErrorActionPreference = 'Stop'

$adbCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
  'adb'
)
$adb = $adbCandidates | Where-Object {
  $_ -eq 'adb' -or (Test-Path $_)
} | Select-Object -First 1
if (-not $adb) { throw 'adb not found. Install platform-tools or add adb to PATH.' }

$devices = & $adb devices | Select-String 'device$'
if (-not $devices) { throw 'No adb device online. Check `adb devices -l`.' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path $OutDir $stamp
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Invoke-Raw([string]$arguments, [string]$path) {
  # PowerShell 5.1 `>` writes UTF-16 and corrupts binary payloads, so hand the
  # redirection to cmd.exe.
  cmd /c "`"$adb`" $arguments > `"$path`""
}

foreach ($file in @('nova.db', 'nova.db-wal', 'nova.db-shm')) {
  Invoke-Raw "exec-out run-as $Package cat databases/default/$file" (Join-Path $dir $file)
}

Invoke-Raw "exec-out screencap -p" (Join-Path $dir 'screen.png')

$alarm = & $adb shell dumpsys alarm 2>&1 | Select-String -Pattern $Package -SimpleMatch
($alarm | ForEach-Object { $_.Line.Trim() }) | Set-Content -Encoding utf8 (Join-Path $dir 'alarms.txt')
$alarmCount = ($alarm | Select-String -Pattern 'RTC_WAKEUP|ELAPSED_WAKEUP' | Measure-Object).Count

$notifications = & $adb shell dumpsys notification --noredact 2>&1 |
  Select-String -Pattern $Package -SimpleMatch
($notifications | ForEach-Object { $_.Line.Trim() }) | Set-Content -Encoding utf8 (Join-Path $dir 'notifications.txt')

$version = & $adb shell dumpsys package $Package 2>&1 |
  Select-String -Pattern 'versionName|firstInstallTime|lastUpdateTime' |
  ForEach-Object { $_.Line.Trim() }
Set-Content -Encoding utf8 -Path (Join-Path $dir 'app.txt') -Value $version

$exactAlarm = & $adb shell appops get $Package SCHEDULE_EXACT_ALARM 2>&1
Set-Content -Encoding utf8 -Path (Join-Path $dir 'exact-alarm.txt') -Value $exactAlarm

Write-Host "evidence: $dir"
Write-Host "alarm lines for ${Package}: $alarmCount"

& node (Join-Path $PSScriptRoot 'device-evidence-report.mjs') $dir
