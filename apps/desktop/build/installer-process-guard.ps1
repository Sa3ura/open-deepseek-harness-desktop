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
  $processes = @(Get-DesktopOwnedProcesses)
  if ($processes.Count -eq 0) {
    Write-Output 'No DeepSeek Harness installation-owned processes are running.'
    exit $ExitNoProcesses
  }

  if ($Action -eq 'inspect') {
    Write-ProcessReport $processes ("Detected {0} DeepSeek Harness process(es):" -f $processes.Count)
    exit $ExitProcessesFound
  }

  Write-ProcessReport $processes ("Closing {0} DeepSeek Harness process(es):" -f $processes.Count)

  foreach ($process in $processes) {
    try {
      $liveProcess = Get-Process -Id $process.ProcessId -ErrorAction Stop
      if ($liveProcess.MainWindowHandle -ne [IntPtr]::Zero) {
        [void]$liveProcess.CloseMainWindow()
      }
    }
    catch {
      Write-Output ("Graceful close skipped for PID {0}: {1}" -f $process.ProcessId, $_.Exception.Message)
    }
  }

  Start-Sleep -Milliseconds 1500
  $remaining = @()
  for ($attempt = 1; $attempt -le 3; $attempt += 1) {
    $remaining = @(Get-DesktopOwnedProcesses)
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
  if ($remaining.Count -gt 0) {
    Write-ProcessReport $remaining ("Unable to close {0} installation-owned process(es):" -f $remaining.Count)
    exit $ExitProcessesRemain
  }

  Write-Output 'All DeepSeek Harness installation-owned processes were closed.'
  exit $ExitNoProcesses
}
catch {
  Write-Output ("Process inspection failed: {0}" -f $_.Exception.Message)
  exit $ExitInspectionFailed
}
