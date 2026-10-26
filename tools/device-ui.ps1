<#
.SYNOPSIS
Dump the device UI hierarchy and optionally tap a node by its text or content-desc.

.DESCRIPTION
Prints every visible node that has text or an accessibility label. When -Tap is
given, the first node whose text or content-desc equals the argument is tapped.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File tools/device-ui.ps1
powershell -ExecutionPolicy Bypass -File tools/device-ui.ps1 -Tap "Nova"
#>
[CmdletBinding()]
param(
  [string]$Tap
)

$ErrorActionPreference = 'Stop'

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { $adb = 'adb' }

$dumpPath = Join-Path $env:TEMP 'nova-ui.xml'
& $adb shell uiautomator dump /sdcard/ui.xml | Out-Null
cmd /c "`"$adb`" exec-out cat /sdcard/ui.xml > `"$dumpPath`""

[xml]$xml = Get-Content $dumpPath -Raw
$nodes = $xml.SelectNodes('//node[@text!="" or @content-desc!=""]')
$rows = foreach ($node in $nodes) {
  $match = [regex]::Match($node.bounds, '\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
  if (-not $match.Success) { continue }
  $left = [int]$match.Groups[1].Value
  $top = [int]$match.Groups[2].Value
  $right = [int]$match.Groups[3].Value
  $bottom = [int]$match.Groups[4].Value
  if ($right -le $left -or $bottom -le $top) { continue }
  [pscustomobject]@{
    Text   = $node.text
    Label  = $node.'content-desc'
    At     = "$([int](($left + $right) / 2)),$([int](($top + $bottom) / 2))"
    Center = @([int](($left + $right) / 2), [int](($top + $bottom) / 2))
  }
}

if ($Tap) {
  $hit = $rows | Where-Object { $_.Text -eq $Tap -or $_.Label -eq $Tap } | Select-Object -First 1
  if (-not $hit) {
    $known = ($rows | Select-Object -First 30 | ForEach-Object {
        if ($_.Text) { $_.Text } else { $_.Label }
      }) -join ' | '
    Write-Host "no node '$Tap'. Known: $known"
    exit 1
  }
  & $adb shell input tap $hit.Center[0] $hit.Center[1]
  Write-Host "tapped '$Tap' at $($hit.At)"
  exit 0
}

$rows | Select-Object -Property Text, Label, At | Format-Table -AutoSize
