[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('inspect', 'stop')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$InstallDirectory,

  [Parameter(Mandatory = $true)]
  [string]$AppExecutable,

  [Parameter(Mandatory = $true)]
  [int]$ExcludeProcessId
)

$ErrorActionPreference = 'Stop'
$ExitNoProcesses = 0
$ExitProcessesFound = 10
$ExitInspectionFailed = 20
$ExitProcessesRemain = 30
$diagnosticPath = Join-Path $env:TEMP 'DeepSeek-Harness-process-guard.log'

function Write-GuardTrace([string]$Message) {
  Add-Content -LiteralPath $diagnosticPath -Value ("{0:o} {1}" -f (Get-Date), $Message) -Encoding utf8
}

Set-Content -LiteralPath $diagnosticPath -Value ("{0:o} action={1} installerPid={2}" -f (Get-Date), $Action, $ExcludeProcessId) -Encoding utf8

function Get-NormalizedDirectory([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path).TrimEnd([char[]]@('\', '/'))
}

function Get-DesktopOwnedProcesses {
  $installRoot = Get-NormalizedDirectory $InstallDirectory
  $appPath = [System.IO.Path]::Combine($installRoot, $AppExecutable)
  $resourcesPrefix = [System.IO.Path]::Combine($installRoot, 'resources') + [System.IO.Path]::DirectorySeparatorChar
  $comparison = [System.StringComparison]::OrdinalIgnoreCase

  return @(
    Get-CimInstance -ClassName Win32_Process -ErrorAction Stop |
      Where-Object {
        $path = $_.ExecutablePath
        $_.ProcessId -ne $ExcludeProcessId -and
          -not [string]::IsNullOrWhiteSpace($path) -and
          ([string]::Equals($path, $appPath, $comparison) -or $path.StartsWith($resourcesPrefix, $comparison))
      } |
      Sort-Object -Property ProcessId
  )
}

function Write-ProcessReport([object[]]$Processes, [string]$Heading) {
  Write-Output $Heading
  foreach ($process in $Processes | Select-Object -First 12) {
    Write-Output ("PID {0}  {1}  {2}" -f $process.ProcessId, $process.Name, $process.ExecutablePath)
  }
  if ($Processes.Count -gt 12) {
    Write-Output ("... and {0} more process(es)" -f ($Processes.Count - 12))
  }
}

try {
  Write-GuardTrace 'Inspecting installation-owned processes.'
  $processes = @(Get-DesktopOwnedProcesses)
  Write-GuardTrace ("Inspection found {0} process(es)." -f $processes.Count)
  if ($processes.Count -eq 0) {
    Write-Output 'No DeepSeek Harness installation-owned processes are running.'
    exit $ExitNoProcesses
  }

  if ($Action -eq 'inspect') {
    Write-ProcessReport $processes ("Detected {0} DeepSeek Harness process(es):" -f $processes.Count)
    exit $ExitProcessesFound
  }

  Write-ProcessReport $processes ("Closing {0} DeepSeek Harness process(es):" -f $processes.Count)

  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DshInstallerWindow {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
'@
  foreach ($process in $processes) {
    try {
      $liveProcess = Get-Process -Id $process.ProcessId -ErrorAction Stop
      if ($liveProcess.MainWindowHandle -ne [IntPtr]::Zero) {
        Write-GuardTrace ("Posting WM_CLOSE to PID {0}." -f $process.ProcessId)
        [void][DshInstallerWindow]::PostMessage($liveProcess.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
      }
    }
    catch {
      Write-Output ("Graceful close skipped for PID {0}: {1}" -f $process.ProcessId, $_.Exception.Message)
    }
  }

  Start-Sleep -Milliseconds 1500
  Write-GuardTrace 'Graceful-close wait completed.'
  $remaining = @()
  for ($attempt = 1; $attempt -le 3; $attempt += 1) {
    $remaining = @(Get-DesktopOwnedProcesses)
    Write-GuardTrace ("Force-stop attempt {0} found {1} process(es)." -f $attempt, $remaining.Count)
    if ($remaining.Count -eq 0) { break }
    foreach ($process in $remaining) {
      try {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
        Write-Output ("Stopped PID {0} ({1}) on attempt {2}." -f $process.ProcessId, $process.Name, $attempt)
      }
      catch {
        Write-Output ("Could not stop PID {0} ({1}) on attempt {2}: {3}" -f $process.ProcessId, $process.Name, $attempt, $_.Exception.Message)
      }
    }
    Start-Sleep -Milliseconds 1000
  }

  $remaining = @(Get-DesktopOwnedProcesses)
  Write-GuardTrace ("Final inspection found {0} process(es)." -f $remaining.Count)
  if ($remaining.Count -gt 0) {
    Write-ProcessReport $remaining ("Unable to close {0} installation-owned process(es):" -f $remaining.Count)
    exit $ExitProcessesRemain
  }

  Write-Output 'All DeepSeek Harness installation-owned processes were closed.'
  exit $ExitNoProcesses
}
catch {
  Write-GuardTrace ("Failed: {0}" -f $_.Exception.Message)
  Write-Output ("Process inspection failed: {0}" -f $_.Exception.Message)
  exit $ExitInspectionFailed
}
