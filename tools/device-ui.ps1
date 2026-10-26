<#
.SYNOPSIS
Dump the device UI hierarchy and optionally tap a node by its text or content-desc.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File tools/device-ui.ps1
powershell -ExecutionPolicy Bypass -File tools/device-ui.ps1 -Tap "Nova"
#>
[CmdletBinding()]
param(
  [string]$Tap,
  [switch]$All
)

$ErrorActionPreference = 'Stop'

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { $adb = 'adb' }

$dumpPath = Join-Path $env:TEMP 'nova-ui.xml'
& $adb shell uiautomator dump /sdcard/ui.xml | Out-Null
cmd /c "`"$adb`" exec-out cat /sdcard/ui.xml > `"$dumpPath`""

[xml]$xml = Get-Content $dumpPath -Raw
$nodes = $xml.SelectNodes('//node[@text!="" and @text]')
$rows = foreach ($node in $nodes) {
  $bounds = $node.bounds
  $match = [regex]::Match($bounds, '\[(\d+),(\d+)\]\[(\d+),(\d+)\]')
  if (-not $match.Success) { continue }
  [pscustomobject]@{
    Text   = $node.text
    Label  = $node.'content-desc'
    Center = @(
      [int](([int]$match.Groups[1].Value + [int]$match.Groups[3].Value) / 2),
      [int](([int]$match.Groups[2].Value + [int]$match.Groups[4].Value) / 2)
    )
  }
}

if ($Tap) {
  $hit = $rows | Where-Object { $_.Text -eq $Tap -or $_.Label -eq $Tap } | Select-Object -First 1
  if (-not $hit) {
    Write-Error "No node with text or label '$Tap'. Known: $(($rows | Select-Object -First 25 | ForEach-Object { $_.Text }) -join ' | ')"
    exit 1
  }
  & $adb shell input tap $hit.Center[0] $hit.Center[1]
  Write-Host "tapped '$Tap' at $($hit.Center[0]),$($hit.Center[1])"
  exit 0
}

$rows |
  Select-Object -Property Text, Label, @{ Name = 'At'; Expression = { "$($_.Center[0]),$($_.Center[1])" } } |
  Format-Table -AutoSize
