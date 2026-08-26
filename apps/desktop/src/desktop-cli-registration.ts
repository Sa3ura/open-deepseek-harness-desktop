/** Packaged desktop ownership of the terminal `dsh` entry point. */

import { spawn } from 'node:child_process'
import { chmod, copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { readDesktopDataHomeSetup } from './desktop-data-home.ts'

const MAC_PATH_BEGIN = '# >>> open-deepseek-harness-desktop dsh >>>'
const MAC_PATH_END = '# <<< open-deepseek-harness-desktop dsh <<<'

/** User-visible registration states returned through the narrow desktop bridge. */
type DesktopCliPhase =
  | 'unsupported'
  | 'uninstalled'
  | 'installed'
  | 'conflict'
  | 'broken'
  | 'setup-required'
  | 'unsupported-shell'

/** Current ownership and conflict information for the desktop `dsh` command. */
export interface DesktopCliStatus {
  readonly phase: DesktopCliPhase
  readonly commandPath: string
  readonly dataHome: string
  readonly conflictPath?: string
  readonly shellProfile?: string
  readonly reason?: 'setup-damaged' | 'setup-invalid' | 'runtime-unavailable' | 'runtime-incomplete' | 'launcher-missing' | 'profile-damaged'
  readonly message?: string
}

/** Fixed packaged paths needed to create a launcher without ambient tooling. */
export interface DesktopCliRuntime {
  readonly nodeBin: string
  readonly harnessBin: string
  readonly pnpmBin: string
  readonly launcherSource: string
}

type WindowsPathAction = 'add' | 'remove' | 'contains'

export interface DesktopCliManagerOptions {
  readonly platform: NodeJS.Platform
  readonly packaged: boolean
  readonly desktopRoot: string
  readonly setupFile: string
  readonly homeDirectory: string
  readonly shellPath?: string
  readonly resourcesPath: string
  readonly runtime?: DesktopCliRuntime
  readonly environment: NodeJS.ProcessEnv
  readonly runWindowsPath?: (action: WindowsPathAction, directory: string) => Promise<boolean>
  readonly findCommands?: (command: string) => Promise<readonly string[]>
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function normalizedPath(value: string): string {
  return normalize(resolve(value)).toLowerCase()
}

async function regularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function collectProcess(command: string, args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.once('error', reject)
    child.once('close', (code) => { resolvePromise({ code: code ?? 1, stdout, stderr }) })
  })
}

async function defaultFindCommands(command: string, environment: NodeJS.ProcessEnv): Promise<readonly string[]> {
  const extensions = process.platform === 'win32'
    ? ['', '.cmd', '.exe', '.bat', '.ps1']
    : ['']
  const results: string[] = []
  for (const directory of (environment.PATH ?? '').split(delimiter)) {
    if (directory.trim() === '') continue
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`)
      if (await regularFile(candidate)) results.push(candidate)
    }
  }
  return results
}

function macShellProfile(homeDirectory: string, shellPath: string | undefined): string | undefined {
  if (shellPath?.endsWith('/zsh') === true) return join(homeDirectory, '.zprofile')
  if (shellPath?.endsWith('/bash') === true) return join(homeDirectory, '.bash_profile')
  return undefined
}

function inspectManagedBlock(source: string): 'absent' | 'present' | 'damaged' {
  const begin = source.split(MAC_PATH_BEGIN).length - 1
  const end = source.split(MAC_PATH_END).length - 1
  if (begin === 0 && end === 0) return 'absent'
  return begin === 1 && end === 1 && source.indexOf(MAC_PATH_BEGIN) < source.indexOf(MAC_PATH_END)
    ? 'present'
    : 'damaged'
}

function removeManagedBlock(source: string): string {
  const begin = source.indexOf(MAC_PATH_BEGIN)
  const end = source.indexOf(MAC_PATH_END)
  if (begin < 0 || end < begin) return source
  const after = end + MAC_PATH_END.length
  return `${source.slice(0, begin)}${source.slice(after).replace(/^\r?\n/u, '')}`
}

async function writeAtomic(path: string, source: string, mode: number): Promise<void> {
  const temporary = `${path}.open-dsh-${process.pid}-${Date.now()}`
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(temporary, source, { mode })
  await rename(temporary, path)
}

/** Own the packaged desktop command registration without exposing arbitrary paths to the renderer. */
export class DesktopCliManager {
  readonly #options: DesktopCliManagerOptions

  constructor(options: DesktopCliManagerOptions) {
    this.#options = options
  }

  get #supported(): boolean {
    return this.#options.packaged && (this.#options.platform === 'win32' || this.#options.platform === 'darwin')
  }

  get #commandDirectory(): string {
    return this.#options.platform === 'win32'
      ? join(this.#options.resourcesPath, 'cli-bin')
      : join(this.#options.desktopRoot, 'cli', 'bin')
  }

  get #commandPath(): string {
    return join(this.#commandDirectory, this.#options.platform === 'win32' ? 'dsh.cmd' : 'dsh')
  }

  get #shellProfile(): string | undefined {
    return this.#options.platform === 'darwin'
      ? macShellProfile(this.#options.homeDirectory, this.#options.shellPath)
      : undefined
  }

  async #findConflict(): Promise<string | undefined> {
    const commands = await (this.#options.findCommands?.('dsh')
      ?? defaultFindCommands('dsh', this.#options.environment))
    const owned = normalizedPath(this.#commandPath)
    return commands.find(command => normalizedPath(command) !== owned)
  }

  async #runWindowsPath(action: WindowsPathAction): Promise<boolean> {
    if (this.#options.runWindowsPath !== undefined) {
      return this.#options.runWindowsPath(action, this.#commandDirectory)
    }
    const script = join(this.#options.resourcesPath, 'cli-bin', 'manage-path.ps1')
    const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const result = await collectProcess(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-Action', action, '-Directory', this.#commandDirectory,
    ])
    if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `PATH update exited with ${result.code}`)
    return result.stdout.trim() === 'present'
  }

  async #readMacProfile(): Promise<{
    path: string
    source: string
    mode: number
    state: 'absent' | 'present' | 'damaged'
  }> {
    const path = this.#shellProfile
    if (path === undefined) return { path: '', source: '', mode: 0o600, state: 'absent' }
    let source = ''
    let mode = 0o600
    try {
      source = await readFile(path, 'utf8')
      mode = (await stat(path)).mode & 0o777
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return { path, source, mode, state: inspectManagedBlock(source) }
  }

  /** Read registration, setup, and command-conflict state.
   * @returns the current immutable status.
   */
  async getStatus(): Promise<DesktopCliStatus> {
    const setup = await readDesktopDataHomeSetup(this.#options.setupFile)
    const base = {
      commandPath: this.#commandPath,
      dataHome: setup?.dshHome ?? '',
      ...(this.#shellProfile === undefined ? {} : { shellProfile: this.#shellProfile }),
    }
    if (!this.#supported) return { ...base, phase: 'unsupported' }
    if (setup === undefined) {
      return await regularFile(this.#options.setupFile)
        ? { ...base, phase: 'broken', reason: 'setup-damaged' }
        : { ...base, phase: 'setup-required' }
    }
    if (!isAbsolute(setup.dshHome)) {
      return { ...base, phase: 'broken', reason: 'setup-invalid' }
    }
    if (this.#options.runtime === undefined) {
      return { ...base, phase: 'broken', reason: 'runtime-unavailable' }
    }
    const runtimeFiles = await Promise.all([
      regularFile(this.#options.runtime.nodeBin),
      regularFile(this.#options.runtime.harnessBin),
      regularFile(this.#options.runtime.pnpmBin),
      regularFile(this.#options.runtime.launcherSource),
    ])
    if (runtimeFiles.includes(false)) {
      return { ...base, phase: 'broken', reason: 'runtime-incomplete' }
    }
    const commandExists = await regularFile(this.#commandPath)
    if (this.#options.platform === 'win32') {
      const registered = await this.#runWindowsPath('contains')
      if (registered && !commandExists) return { ...base, phase: 'broken', reason: 'launcher-missing' }
      if (registered) return { ...base, phase: 'installed' }
    } else {
      if (this.#shellProfile === undefined) return { ...base, phase: 'unsupported-shell' }
      const profile = await this.#readMacProfile()
      if (profile.state === 'damaged') return { ...base, phase: 'broken', reason: 'profile-damaged' }
      if (profile.state === 'present' && !commandExists) return { ...base, phase: 'broken', reason: 'launcher-missing' }
      if (profile.state === 'present') return { ...base, phase: 'installed' }
    }
    const conflictPath = await this.#findConflict()
    return conflictPath === undefined
      ? { ...base, phase: 'uninstalled' }
      : { ...base, phase: 'conflict', conflictPath }
  }

  async #installMacLauncher(): Promise<void> {
    const runtime = this.#options.runtime
    const profile = await this.#readMacProfile()
    if (runtime === undefined || profile.path === '') throw new Error('desktop: macOS CLI registration is unavailable')
    if (profile.state === 'damaged') throw new Error('desktop: the managed shell PATH block is damaged')
    const library = join(this.#options.desktopRoot, 'cli', 'lib')
    const launcher = join(library, 'desktop-cli.mjs')
    await mkdir(this.#commandDirectory, { recursive: true, mode: 0o700 })
    await mkdir(library, { recursive: true, mode: 0o700 })
    await copyFile(runtime.launcherSource, launcher)
    await chmod(launcher, 0o600)
    const wrapper = [
      '#!/bin/sh',
      `export OPEN_DSH_DESKTOP_SETUP_FILE=${shellQuote(this.#options.setupFile)}`,
      `export OPEN_DSH_DESKTOP_HARNESS_BIN=${shellQuote(runtime.harnessBin)}`,
      `export DSH_PNPM_BIN=${shellQuote(runtime.pnpmBin)}`,
      `exec ${shellQuote(runtime.nodeBin)} ${shellQuote(launcher)} "$@"`,
      '',
    ].join('\n')
    await writeAtomic(this.#commandPath, wrapper, 0o700)
    if (profile.state === 'absent') {
      if (profile.source !== '' && !await regularFile(`${profile.path}.open-dsh-backup`)) {
        await copyFile(profile.path, `${profile.path}.open-dsh-backup`)
      }
      const prefix = profile.source === '' || profile.source.endsWith('\n') ? profile.source : `${profile.source}\n`
      const block = [
        MAC_PATH_BEGIN,
        `export PATH=${shellQuote(this.#commandDirectory)}:"$PATH"`,
        MAC_PATH_END,
        '',
      ].join('\n')
      await writeAtomic(profile.path, `${prefix}${block}`, profile.mode)
    }
  }

  /** Install or repair the app-owned command after explicit conflict confirmation.
   * @param force - whether an existing non-owned `dsh` may be shadowed.
   * @returns the resulting status.
   */
  async install(force = false): Promise<DesktopCliStatus> {
    const before = await this.getStatus()
    if (before.phase === 'conflict' && !force) return before
    if (before.phase === 'unsupported' || before.phase === 'unsupported-shell' || before.phase === 'setup-required') return before
    if (before.phase === 'broken'
      && (this.#options.platform !== 'darwin' || before.reason !== 'launcher-missing')) return before
    if (this.#options.platform === 'win32') await this.#runWindowsPath('add')
    else await this.#installMacLauncher()
    return this.getStatus()
  }

  /** Remove only the PATH registration owned by this desktop app.
   * @returns the resulting status.
   */
  async remove(): Promise<DesktopCliStatus> {
    if (!this.#supported) return this.getStatus()
    if (this.#options.platform === 'win32') {
      await this.#runWindowsPath('remove')
    } else {
      const profile = await this.#readMacProfile()
      if (profile.state === 'damaged') throw new Error('desktop: the managed shell PATH block is damaged')
      if (profile.state === 'present') await writeAtomic(profile.path, removeManagedBlock(profile.source), profile.mode)
    }
    return this.getStatus()
  }

  /** Refresh an already registered macOS launcher after an app runtime update. */
  async refresh(): Promise<void> {
    if (this.#options.platform !== 'darwin' || !this.#supported) return
    const profile = await this.#readMacProfile()
    if (profile.state === 'present') await this.#installMacLauncher()
  }
}
