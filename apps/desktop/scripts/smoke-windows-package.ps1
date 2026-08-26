$ErrorActionPreference = 'Stop'

$installer = (Resolve-Path (Join-Path $PSScriptRoot '../../../.artifacts/desktop-windows/DeepSeek-Harness-windows-x64.exe')).Path
$installRoot = Join-Path $env:RUNNER_TEMP 'DeepSeek Harness 安装测试'
$appData = Join-Path $env:RUNNER_TEMP 'DeepSeek Harness AppData'
$dshHome = Join-Path $env:RUNNER_TEMP 'DeepSeek Harness Home'
$unpackedResources = Join-Path $PSScriptRoot '../../../.artifacts/desktop-windows/win-unpacked/resources'
$cliDirectory = Join-Path $installRoot 'resources/cli-bin'
$originalUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')

foreach ($path in @(
  (Join-Path $unpackedResources 'harness/lib/bin.js'),
  (Join-Path $unpackedResources 'harness/node_modules'),
  (Join-Path $unpackedResources 'runtime/win32-x64/node.exe'),
  (Join-Path $unpackedResources 'runtime/win32-x64/pnpm.cmd'),
  (Join-Path $unpackedResources 'runtime/win32-x64/node_modules/pnpm/bin/pnpm.mjs'),
  (Join-Path $unpackedResources 'cli/desktop-cli.mjs'),
  (Join-Path $unpackedResources 'cli-bin/dsh.cmd'),
  (Join-Path $unpackedResources 'cli-bin/manage-path.ps1'),
  (Join-Path $unpackedResources 'bundled-plugins/manifest.json')
)) {
  if (-not (Test-Path $path)) { throw "Unpacked package is missing $path" }
}

$installStart = [System.Diagnostics.ProcessStartInfo]::new()
$installStart.FileName = $installer
$installStart.UseShellExecute = $false
$installStart.ArgumentList.Add('/S')
$installStart.ArgumentList.Add('/currentuser')
$installStart.ArgumentList.Add('/ADDCLI=1')
$installStart.ArgumentList.Add("/D=$installRoot")
$install = [System.Diagnostics.Process]::Start($installStart)
$installDeadline = (Get-Date).AddMinutes(15)
$nextInstallProgress = (Get-Date).AddSeconds(30)
while (-not $install.HasExited -and (Get-Date) -lt $installDeadline) {
  Start-Sleep -Milliseconds 500
  $install.Refresh()
  if ((Get-Date) -ge $nextInstallProgress) {
    $installedExecutable = Test-Path (Join-Path $installRoot 'DeepSeek Harness.exe')
    $installedHarness = Test-Path (Join-Path $installRoot 'resources/harness/lib/bin.js')
    $elapsed = [Math]::Round(((Get-Date) - $install.StartTime).TotalSeconds)
    Write-Host "Installer still running after ${elapsed}s (executable=$installedExecutable, harness=$installedHarness)."
    $nextInstallProgress = (Get-Date).AddSeconds(30)
  }
}
if (-not $install.HasExited) {
  $install.Kill($true)
  $install.WaitForExit()
  throw 'Windows installer did not exit within 15 minutes'
}
if ($install.ExitCode -ne 0) {
  throw "Windows installer exited with $($install.ExitCode)"
}

$required = @(
  (Join-Path $installRoot 'DeepSeek Harness.exe'),
  (Join-Path $installRoot 'resources/harness/lib/bin.js'),
  (Join-Path $installRoot 'resources/harness/node_modules'),
  (Join-Path $installRoot 'resources/runtime/win32-x64/node.exe'),
  (Join-Path $installRoot 'resources/runtime/win32-x64/pnpm.cmd'),
  (Join-Path $installRoot 'resources/runtime/win32-x64/node_modules/pnpm/bin/pnpm.mjs'),
  (Join-Path $installRoot 'resources/cli/desktop-cli.mjs'),
  (Join-Path $cliDirectory 'dsh.cmd'),
  (Join-Path $cliDirectory 'manage-path.ps1'),
  (Join-Path $installRoot 'resources/bundled-plugins/manifest.json')
)
foreach ($path in $required) {
  if (-not (Test-Path $path)) { throw "Installed package is missing $path" }
}
$registeredUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$registeredEntries = @($registeredUserPath.Split(';') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if (-not ($registeredEntries | Where-Object { [string]::Equals($_.TrimEnd('\', '/'), $cliDirectory.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase) })) {
  throw "Silent installer did not register the exact desktop CLI directory: $cliDirectory"
}
$cliRegistration = Get-ItemProperty -Path 'HKCU:\Software\FLAQ.AI\DeepSeek Harness' -ErrorAction Stop
if ($cliRegistration.CliPathRegistered -ne 1 -or
    -not [string]::Equals($cliRegistration.CliPathDirectory, $cliDirectory, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Silent installer and Settings do not share the expected CLI registration marker.'
}

$env:APPDATA = $appData
$env:DSH_HOME = $dshHome
$appStart = [System.Diagnostics.ProcessStartInfo]::new()
$appStart.FileName = Join-Path $installRoot 'DeepSeek Harness.exe'
$appStart.UseShellExecute = $false
$appStart.ArgumentList.Add("--user-data-dir=$appData")
$app = [System.Diagnostics.Process]::Start($appStart)
$deadline = (Get-Date).AddSeconds(180)
$ready = $false
try {
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $app.Refresh()
    if ($app.HasExited) { throw "Installed application exited before Harness readiness with $($app.ExitCode)" }
    $log = Get-ChildItem -Path $appData -Filter harness.log -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $log -and (Get-Content $log.FullName -Raw) -match '(?m)^dsh web: http://127\.0\.0\.1:\d+$') {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    $diagnostic = Get-ChildItem -Path $appData -Filter harness.log -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    $tail = if ($null -eq $diagnostic) { 'No harness.log was created.' } else { (Get-Content $diagnostic.FullName -Tail 80) -join "`n" }
    throw "Installed application did not reach Harness readiness within 180 seconds.`n$tail"
  }
  $betterSidebarMarker = Join-Path $dshHome 'bundled-plugins/dsh-better-sidebar.seeded.json'
  $deferredDeadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deferredDeadline -and -not $app.HasExited -and -not (Test-Path $betterSidebarMarker)) {
    Start-Sleep -Seconds 1
  }
  if (-not (Test-Path $betterSidebarMarker)) {
    $diagnostic = Get-ChildItem -Path $appData -Filter harness.log -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    $tail = if ($null -eq $diagnostic) { 'No harness.log was created.' } else { (Get-Content $diagnostic.FullName -Tail 80) -join "`n" }
    throw "Better Sidebar did not finish its post-entry deferred install within 180 seconds.`n$tail"
  }
} finally {
  if (-not $app.HasExited) {
    $null = $app.CloseMainWindow()
    if (-not $app.WaitForExit(10000)) { Stop-Process -Id $app.Id -Force }
  }
}

$cliStart = [System.Diagnostics.ProcessStartInfo]::new()
$cliStart.FileName = Join-Path $cliDirectory 'dsh.cmd'
$cliStart.UseShellExecute = $false
$cliStart.RedirectStandardOutput = $true
$cliStart.RedirectStandardError = $true
$cliStart.ArgumentList.Add('--help')
$cli = [System.Diagnostics.Process]::Start($cliStart)
if (-not $cli.WaitForExit(30000)) {
  $cli.Kill($true)
  throw 'Installed desktop dsh command did not exit within 30 seconds'
}
$cliOutput = "$($cli.StandardOutput.ReadToEnd())`n$($cli.StandardError.ReadToEnd())"
if ($cli.ExitCode -ne 0) {
  throw "Installed desktop dsh command exited with $($cli.ExitCode).`n$cliOutput"
}
if ($cliOutput -notmatch '(?i)deepseek|dsh|usage') {
  throw "Installed desktop dsh command did not print recognizable help.`n$cliOutput"
}

$profileDirectory = Join-Path $dshHome 'profiles/web'
$profileManifestPath = Join-Path $profileDirectory 'package.json'
$profileLockPath = Join-Path $profileDirectory 'pnpm-lock.yaml'
if (-not (Test-Path $profileManifestPath)) { throw "Bundled plugin seed did not create $profileManifestPath" }
if (-not (Test-Path $profileLockPath)) { throw "Bundled plugin seed did not create $profileLockPath" }
$profileManifest = Get-Content $profileManifestPath -Raw | ConvertFrom-Json
$bundledManifestPath = Join-Path $installRoot 'resources/bundled-plugins/manifest.json'
$bundledManifest = Get-Content $bundledManifestPath -Raw | ConvertFrom-Json
$bundledPlugins = @($bundledManifest.plugins)
foreach ($packageName in @(
  'dshmarket', '@xmanrui/dsh-im', 'dsh-skill-picker', 'dsh-font',
  'dsh-pocket', 'dsh-better-sidebar'
)) {
  if ($bundledPlugins.PackageName -notcontains $packageName) {
    throw "Bundled plugin manifest is missing required preset $packageName"
  }
}
foreach ($onlineOnlyPackage in @(
  '@deepseek-ai/dsh-subagent-codex', '@deepseek-ai/dsh-subagent-claude-code'
)) {
  if ($bundledPlugins.PackageName -contains $onlineOnlyPackage) {
    throw "Online-only external tool connector must not be bundled: $onlineOnlyPackage"
  }
  if ($null -ne $profileManifest.dependencies.PSObject.Properties[$onlineOnlyPackage]) {
    throw "Online-only external tool connector was installed without user action: $onlineOnlyPackage"
  }
}
foreach ($plugin in @($bundledPlugins | Where-Object { $_.InstallPolicy -eq 'startup' })) {
  if ($null -eq $profileManifest.dependencies.PSObject.Properties[$plugin.PackageName]) {
    throw "Bundled plugin dependency $($plugin.PackageName) is absent from $profileManifestPath"
  }
  if ($profileManifest.dsh.profile.bundles -notcontains $plugin.PackageName) {
    throw "Bundled plugin $($plugin.PackageName) is absent from the Web profile bundle list"
  }
  $markerPath = Join-Path $dshHome "bundled-plugins/$($plugin.SeedId).seeded.json"
  if (-not (Test-Path $markerPath)) { throw "Bundled plugin seed marker is missing: $markerPath" }
  $marker = Get-Content $markerPath -Raw | ConvertFrom-Json
  if ($marker.packageName -ne $plugin.PackageName -or $marker.version -ne $plugin.Version) {
    throw "Bundled plugin seed marker has unexpected package metadata: $markerPath"
  }
}
foreach ($plugin in @($bundledPlugins | Where-Object { $_.InstallPolicy -eq 'manual' })) {
  $archivePath = Join-Path $installRoot "resources/bundled-plugins/$($plugin.Archive)"
  if (-not (Test-Path $archivePath)) { throw "Manual bundled plugin archive is missing: $archivePath" }
  $markerPath = Join-Path $dshHome "bundled-plugins/$($plugin.SeedId).seeded.json"
  if ($plugin.PackageName -eq 'dsh-better-sidebar') {
    if ($null -eq $profileManifest.dependencies.PSObject.Properties[$plugin.PackageName]) {
      throw "Deferred Better Sidebar dependency is absent from $profileManifestPath"
    }
    if ($profileManifest.dsh.profile.bundles -notcontains $plugin.PackageName) {
      throw "Deferred Better Sidebar is absent from the Web profile bundle list"
    }
    if (-not (Test-Path $markerPath)) { throw "Deferred Better Sidebar marker is missing: $markerPath" }
    continue
  }
  if ($null -ne $profileManifest.dependencies.PSObject.Properties[$plugin.PackageName]) {
    throw "Manual bundled plugin $($plugin.PackageName) was installed without user action"
  }
  if (Test-Path $markerPath) { throw "Manual bundled plugin marker exists before user action: $markerPath" }
}
$bundledFailure = Get-ChildItem -Path $appData -Filter harness.log -File -Recurse -ErrorAction SilentlyContinue |
  Where-Object { (Get-Content $_.FullName -Raw) -match '(?m)^\[bundled-plugin\]' } |
  Select-Object -First 1
if ($null -ne $bundledFailure) {
  throw "Bundled plugin failure was written to $($bundledFailure.FullName)"
}

$uninstaller = Join-Path $installRoot 'Uninstall DeepSeek Harness.exe'
if (-not (Test-Path $uninstaller)) { throw "Installed package is missing $uninstaller" }
$uninstallStart = [System.Diagnostics.ProcessStartInfo]::new()
$uninstallStart.FileName = $uninstaller
$uninstallStart.UseShellExecute = $false
$uninstallStart.ArgumentList.Add('/S')
$uninstall = [System.Diagnostics.Process]::Start($uninstallStart)
if (-not $uninstall.WaitForExit(180000)) {
  $uninstall.Kill($true)
  throw 'Windows uninstaller did not exit within 3 minutes'
}
if ($uninstall.ExitCode -ne 0) { throw "Windows uninstaller exited with $($uninstall.ExitCode)" }
$restoredUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($restoredUserPath -ne $originalUserPath) {
  throw "Windows uninstaller did not restore the original current-user PATH.`nBefore: $originalUserPath`nAfter: $restoredUserPath"
}
$remainingRegistration = Get-ItemProperty -Path 'HKCU:\Software\FLAQ.AI\DeepSeek Harness' -ErrorAction SilentlyContinue
if ($null -ne $remainingRegistration.CliPathRegistered -or $null -ne $remainingRegistration.CliPathDirectory) {
  throw 'Windows uninstaller left the desktop CLI registration marker behind.'
}

Write-Host 'Installed Windows package registered and ran the desktop dsh command, reached Harness readiness, seeded startup plugins, completed deferred Better Sidebar, kept external tools online-only, and restored PATH on uninstall.'
