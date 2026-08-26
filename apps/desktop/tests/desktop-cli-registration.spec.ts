import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopDataHomeSetup, writeDesktopDataHomeSetup } from '../src/desktop-data-home.ts'
import { DesktopCliManager, type DesktopCliManagerOptions } from '../src/desktop-cli-registration.ts'

const roots: string[] = []

async function fixture(): Promise<{
  root: string
  setupFile: string
  runtime: NonNullable<DesktopCliManagerOptions['runtime']>
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-cli-registration-'))
  roots.push(root)
  const setupFile = join(root, 'desktop', 'data-home-setup.json')
  const runtimeRoot = join(root, 'runtime with spaces')
  await mkdir(runtimeRoot, { recursive: true })
  const runtime = {
    nodeBin: join(runtimeRoot, 'node'),
    harnessBin: join(runtimeRoot, 'lib', 'bin.js'),
    pnpmBin: join(runtimeRoot, 'bin', 'pnpm'),
    launcherSource: join(runtimeRoot, 'desktop-cli.js'),
  }
  await Promise.all([
    writeFile(runtime.nodeBin, ''),
    mkdir(join(runtimeRoot, 'lib'), { recursive: true }).then(() => writeFile(runtime.harnessBin, '')),
    mkdir(join(runtimeRoot, 'bin'), { recursive: true }).then(() => writeFile(runtime.pnpmBin, '')),
    writeFile(runtime.launcherSource, 'launcher'),
  ])
  await writeDesktopDataHomeSetup(setupFile, desktopDataHomeSetup('fresh', join(root, 'dsh-home')))
  return { root, setupFile, runtime }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('DesktopCliManager', () => {
  it('installs, refreshes, and removes one macOS managed PATH block', async () => {
    const { root, setupFile, runtime } = await fixture()
    const home = join(root, '用户 Home')
    const desktopRoot = join(root, 'Application Support', 'open-deepseek-harness-desktop')
    await mkdir(home, { recursive: true })
    await writeFile(join(home, '.zprofile'), 'export EXISTING=value\n')
    await chmod(join(home, '.zprofile'), 0o640)
    const manager = new DesktopCliManager({
      platform: 'darwin', packaged: true, desktopRoot, setupFile, homeDirectory: home,
      shellPath: '/bin/zsh', resourcesPath: join(root, 'app resources'), runtime, environment: { PATH: '/usr/bin' },
      findCommands: () => Promise.resolve([]),
    })

    await expect(manager.getStatus()).resolves.toMatchObject({ phase: 'uninstalled' })
    await expect(manager.install()).resolves.toMatchObject({ phase: 'installed' })
    const profile = await readFile(join(home, '.zprofile'), 'utf8')
    expect(profile).toContain('export EXISTING=value')
    expect((await stat(join(home, '.zprofile'))).mode & 0o777).toBe(0o640)
    expect(profile.match(/open-deepseek-harness-desktop dsh >>>/gu)).toHaveLength(1)
    expect(await readFile(join(home, '.zprofile.open-dsh-backup'), 'utf8')).toBe('export EXISTING=value\n')
    const wrapper = await readFile(join(desktopRoot, 'cli', 'bin', 'dsh'), 'utf8')
    expect(wrapper).toContain(runtime.nodeBin)
    expect(wrapper).toContain(setupFile)
    await manager.refresh()
    expect((await readFile(join(home, '.zprofile'), 'utf8')).match(/open-deepseek-harness-desktop dsh >>>/gu)).toHaveLength(1)
    await expect(manager.remove()).resolves.toMatchObject({ phase: 'uninstalled' })
    expect(await readFile(join(home, '.zprofile'), 'utf8')).toBe('export EXISTING=value\n')
    expect((await stat(join(home, '.zprofile'))).mode & 0o777).toBe(0o640)
  })

  it('requires confirmation before shadowing an existing command', async () => {
    const { root, setupFile, runtime } = await fixture()
    const home = join(root, 'home')
    await mkdir(home)
    const conflict = join(root, 'official', 'dsh')
    const manager = new DesktopCliManager({
      platform: 'darwin', packaged: true, desktopRoot: join(root, 'desktop'), setupFile, homeDirectory: home,
      shellPath: '/bin/zsh', resourcesPath: root, runtime, environment: {},
      findCommands: () => Promise.resolve([conflict]),
    })
    await expect(manager.install()).resolves.toMatchObject({ phase: 'conflict', conflictPath: conflict })
    await expect(readFile(join(home, '.zprofile'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(manager.install(true)).resolves.toMatchObject({ phase: 'installed' })
  })

  it('uses bash_profile for a packaged bash login shell', async () => {
    const { root, setupFile, runtime } = await fixture()
    const home = join(root, 'home')
    await mkdir(home)
    const manager = new DesktopCliManager({
      platform: 'darwin', packaged: true, desktopRoot: join(root, 'desktop'), setupFile, homeDirectory: home,
      shellPath: '/bin/bash', resourcesPath: root, runtime, environment: {}, findCommands: () => Promise.resolve([]),
    })
    await expect(manager.install()).resolves.toMatchObject({ phase: 'installed', shellProfile: join(home, '.bash_profile') })
    expect(await readFile(join(home, '.bash_profile'), 'utf8')).toContain('open-deepseek-harness-desktop dsh')
  })

  it('reports unsupported shells and damaged owned blocks without rewriting them', async () => {
    const { root, setupFile, runtime } = await fixture()
    const home = join(root, 'home')
    await mkdir(home)
    const fish = new DesktopCliManager({
      platform: 'darwin', packaged: true, desktopRoot: join(root, 'desktop'), setupFile, homeDirectory: home,
      shellPath: '/opt/homebrew/bin/fish', resourcesPath: root, runtime, environment: {},
    })
    await expect(fish.getStatus()).resolves.toMatchObject({ phase: 'unsupported-shell' })

    await writeFile(join(home, '.zprofile'), '# >>> open-deepseek-harness-desktop dsh >>>\n')
    const damaged = new DesktopCliManager({
      platform: 'darwin', packaged: true, desktopRoot: join(root, 'desktop'), setupFile, homeDirectory: home,
      shellPath: '/bin/zsh', resourcesPath: root, runtime, environment: {},
    })
    await expect(damaged.getStatus()).resolves.toMatchObject({ phase: 'broken' })
    await expect(damaged.remove()).rejects.toThrow('PATH block is damaged')
  })

  it('distinguishes missing setup from damaged setup and incomplete runtime', async () => {
    const { root, setupFile, runtime } = await fixture()
    const home = join(root, 'home')
    await mkdir(home)
    const options = {
      platform: 'darwin' as const, packaged: true, desktopRoot: join(root, 'desktop'), setupFile,
      homeDirectory: home, shellPath: '/bin/zsh', resourcesPath: root, runtime, environment: {},
    }
    await rm(setupFile)
    await expect(new DesktopCliManager(options).getStatus()).resolves.toMatchObject({ phase: 'setup-required' })
    await writeFile(setupFile, '{broken')
    await expect(new DesktopCliManager(options).getStatus()).resolves.toMatchObject({ phase: 'broken', reason: 'setup-damaged' })
    await writeDesktopDataHomeSetup(setupFile, desktopDataHomeSetup('fresh', join(root, 'dsh-home')))
    await rm(runtime.nodeBin)
    await expect(new DesktopCliManager(options).getStatus()).resolves.toMatchObject({ phase: 'broken', reason: 'runtime-incomplete' })
  })

  it('uses one Windows PATH entry and leaves conflict resolution to explicit force', async () => {
    const { root, setupFile, runtime } = await fixture()
    const resources = join(root, 'DeepSeek Harness resources')
    await mkdir(join(resources, 'cli-bin'), { recursive: true })
    await writeFile(join(resources, 'cli-bin', 'dsh.cmd'), '')
    let registered = false
    const runWindowsPath = vi.fn((action: 'add' | 'remove' | 'contains') => {
      if (action === 'add') registered = true
      if (action === 'remove') registered = false
      return Promise.resolve(action === 'contains' ? registered : false)
    })
    const conflict = 'C:\\Program Files\\Official DSH\\dsh.cmd'
    const manager = new DesktopCliManager({
      platform: 'win32', packaged: true, desktopRoot: join(root, 'desktop'), setupFile,
      homeDirectory: join(root, 'home'), resourcesPath: resources, runtime, environment: {},
      runWindowsPath, findCommands: () => Promise.resolve([conflict]),
    })
    await expect(manager.install()).resolves.toMatchObject({ phase: 'conflict' })
    expect(runWindowsPath).not.toHaveBeenCalledWith('add', expect.anything())
    await expect(manager.install(true)).resolves.toMatchObject({ phase: 'installed' })
    await expect(manager.remove()).resolves.toMatchObject({ phase: 'conflict' })
    expect(runWindowsPath).toHaveBeenCalledWith('remove', join(resources, 'cli-bin'))
  })
})
