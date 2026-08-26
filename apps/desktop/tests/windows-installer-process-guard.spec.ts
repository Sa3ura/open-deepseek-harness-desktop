import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const buildRoot = fileURLToPath(new URL('../build/', import.meta.url))

describe('Windows installer process guard', () => {
  it('overrides the broad electron-builder process check', async () => {
    const installer = await readFile(`${buildRoot}/installer.nsh`, 'utf8')
    expect(installer).toContain('!macro customCheckAppRunning')
    expect(installer).toContain('installer-process-guard.ps1')
    expect(installer).toContain('GetCurrentProcessId')
    expect(installer).toContain('-ExcludeProcessId $R9')
    expect(installer).toContain('DeepSeek-Harness-process-guard.log')
    expect(installer).toContain('IfFileExists "$INSTDIR\\${APP_EXECUTABLE_FILENAME}" process_guard_inspect')
    expect(installer).toContain('IfFileExists "$INSTDIR\\resources\\*.*" process_guard_inspect')
  })

  it('declares custom translations with LCIDs available before MUI languages load', async () => {
    const installer = await readFile(`${buildRoot}/installer.nsh`, 'utf8')
    expect(installer).toContain('LangString CliPageTitle 2052 "命令行工具"')
    expect(installer).toContain('LangString CliPageTitle 1033 "Command-line tool"')
    expect(installer).not.toContain('${LANG_SIMPCHINESE}')
    expect(installer).not.toContain('${LANG_ENGLISH}')
  })

  it('matches only the exact app or the resources directory boundary', async () => {
    const guard = await readFile(`${buildRoot}/installer-process-guard.ps1`, 'utf8')
    expect(guard).toContain('[string]::Equals($path, $appPath, $comparison)')
    expect(guard).toContain('$path.StartsWith($resourcesPrefix, $comparison)')
    expect(guard).toContain("[System.IO.Path]::Combine($installRoot, 'resources') + [System.IO.Path]::DirectorySeparatorChar")
    expect(guard).toContain('$_.ProcessId -ne $ExcludeProcessId')
    expect(guard).not.toContain('$path.StartsWith($installRoot')
  })

  it('reports exact process details and verifies cleanup before installation continues', async () => {
    const guard = await readFile(`${buildRoot}/installer-process-guard.ps1`, 'utf8')
    expect(guard).toContain('PID {0}  {1}  {2}')
    expect(guard).toContain('$ExitProcessesRemain = 30')
    expect(guard).toContain('$remaining = @(Get-DesktopOwnedProcesses)')
    expect(guard).toContain('for ($attempt = 1; $attempt -le 3; $attempt += 1)')
    expect(guard).toContain('Stop-Process -Id $process.ProcessId -Force')
  })
})
