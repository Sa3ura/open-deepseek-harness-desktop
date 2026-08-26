param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('add', 'remove', 'contains')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$Directory
)

$ErrorActionPreference = 'Stop'

function Normalize-PathEntry([string]$Value) {
  return $Value.Trim().Trim('"').TrimEnd('\', '/')
}

$target = Normalize-PathEntry $Directory
$registrationKey = 'HKCU:\Software\FLAQ.AI\DeepSeek Harness'
$registrationValue = 'CliPathDirectory'
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = if ([string]::IsNullOrEmpty($current)) {
  @()
} else {
  @($current.Split(';'))
}

$remaining = @($entries | Where-Object {
  -not [string]::Equals((Normalize-PathEntry $_), $target, [StringComparison]::OrdinalIgnoreCase)
})

$present = $remaining.Count -ne $entries.Count
if ($Action -eq 'contains') {
  if ($present) { 'present' } else { 'absent' }
  exit 0
}

if ($Action -eq 'add') {
  if ($present) {
    $updated = $current
  } elseif ([string]::IsNullOrEmpty($current)) {
    $updated = $Directory.TrimEnd('\', '/')
  } else {
    $updated = "$($Directory.TrimEnd('\', '/'));$current"
  }
} else {
  $updated = $remaining -join ';'
}
if ($updated.Length -gt 32767) {
  throw 'The current-user PATH would exceed the Windows environment-variable limit.'
}

$environmentKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
try {
  $pathKind = try {
    $environmentKey.GetValueKind('Path')
  } catch {
    [Microsoft.Win32.RegistryValueKind]::ExpandString
  }
  $environmentKey.SetValue('Path', $updated, $pathKind)
} finally {
  $environmentKey.Dispose()
}

if ($Action -eq 'add') {
  $null = New-Item -Path $registrationKey -Force
  $null = New-ItemProperty -Path $registrationKey -Name 'CliPathRegistered' -Value 1 -PropertyType DWord -Force
  $null = New-ItemProperty -Path $registrationKey -Name $registrationValue -Value $Directory.TrimEnd('\', '/') -PropertyType String -Force
} else {
  $registeredDirectory = (Get-ItemProperty -Path $registrationKey -Name $registrationValue -ErrorAction SilentlyContinue).$registrationValue
  if (-not [string]::IsNullOrEmpty($registeredDirectory) -and
      [string]::Equals((Normalize-PathEntry $registeredDirectory), $target, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-ItemProperty -Path $registrationKey -Name 'CliPathRegistered' -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $registrationKey -Name $registrationValue -ErrorAction SilentlyContinue
  }
}

if (-not ('Native.EnvironmentBroadcast' -as [type])) {
  Add-Type -Namespace Native -Name EnvironmentBroadcast -MemberDefinition @'
    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Auto)]
    public static extern bool SendNotifyMessage(
      System.IntPtr hWnd,
      uint Msg,
      System.UIntPtr wParam,
      string lParam);
'@
}

[void][Native.EnvironmentBroadcast]::SendNotifyMessage(
  [IntPtr]0xffff,
  0x001A,
  [UIntPtr]::Zero,
  'Environment'
)
