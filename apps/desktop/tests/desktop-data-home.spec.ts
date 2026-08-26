import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  desktopDataHomeSetup,
  hasDesktopData,
  hasImportableDesktopData,
  importOfficialDesktopData,
  IMPORTED_ONBOARDING_RESET_VERSION,
  readDesktopDataHomeSetup,
  resetImportedDesktopOnboarding,
  resolveDesktopDataHomeSource,
  resolveRecordedDesktopDataHome,
  resolveDesktopDataHomeLayout,
  writeDesktopDataHomeSetup,
} from '../src/desktop-data-home.ts'

const roots: string[] = []

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-data-home-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('desktop data home', () => {
  it('separates packaged and development data under the repository name', () => {
    const packaged = resolveDesktopDataHomeLayout('/app-data', '/home/user', true, {})
    const development = resolveDesktopDataHomeLayout('/app-data', '/home/user', false, {})
    expect(packaged.desktopRoot).toBe(join('/app-data', 'open-deepseek-harness-desktop'))
    expect(packaged.dshHome).toBe(join(packaged.desktopRoot, 'dsh-home'))
    expect(packaged.sessionData).toBe(join(packaged.desktopRoot, 'session-data'))
    expect(development.desktopRoot).toBe(join('/app-data', 'open-deepseek-harness-desktop', 'development'))
    expect(development.dshHome).toBe(join(development.desktopRoot, 'dsh-home'))
    expect(packaged.officialDshHome).toBe(join('/home/user', '.dsh'))
  })

  it('keeps an explicit DSH_HOME authoritative and expands a home prefix', () => {
    const layout = resolveDesktopDataHomeLayout('/app-data', '/home/user', true, { DSH_HOME: '~/.custom-dsh' })
    expect(layout.dshHome).toBe(join('/home/user', '.custom-dsh'))
    expect(layout.explicitDshHome).toBe(true)
    expect(layout.desktopRoot).toBe(join('/app-data', 'open-deepseek-harness-desktop'))
  })

  it('imports supported user state without plugin runtimes, markers, or symlinks', async () => {
    const root = await fixture()
    const official = join(root, '.dsh')
    const target = join(root, 'desktop', 'dsh-home')
    await mkdir(join(official, 'sessions', 'one'), { recursive: true })
    await mkdir(join(official, 'profiles', 'web', 'node_modules'), { recursive: true })
    await mkdir(join(official, 'bundled-plugins'), { recursive: true })
    await writeFile(join(official, 'settings.yaml'), [
      '# keep this comment',
      'locale: zh',
      'ui-onboarding:',
      '  welcomeNoticeVersion: 2026-08-19.1',
      '',
    ].join('\n'))
    await writeFile(join(official, '.credentials.yaml'), 'version: "1"\n')
    await writeFile(join(official, 'sessions', 'one', 'session.jsonl'), '{}\n')
    await writeFile(join(official, 'profiles', 'web', 'package.json'), '{}\n')
    await writeFile(join(official, 'bundled-plugins', 'plugin.seeded.json'), '{}\n')
    await writeFile(join(official, '.anonymous-user-id'), 'old-id\n')
    await symlink(join(official, 'settings.yaml'), join(official, 'AGENTS.md'))

    expect(await hasImportableDesktopData(official)).toBe(true)
    const result = await importOfficialDesktopData(official, target)
    expect(result.copied).toEqual(['.credentials.yaml', 'sessions', 'settings.yaml'])
    expect(result.skippedSymlinks).toEqual(['AGENTS.md'])
    expect(result.restorablePlugins).toBe(0)
    expect(result.pluginRestoreIssues).toEqual([])
    const importedSettings = await readFile(join(target, 'settings.yaml'), 'utf8')
    expect(importedSettings).toContain('# keep this comment')
    expect(importedSettings).toContain('locale: zh')
    expect(importedSettings).not.toContain('ui-onboarding')
    expect(importedSettings).not.toContain('welcomeNoticeVersion')
    expect(await readFile(join(target, 'sessions', 'one', 'session.jsonl'), 'utf8')).toBe('{}\n')
    await expect(readFile(join(target, 'profiles', 'web', 'package.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(target, 'bundled-plugins', 'plugin.seeded.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(target, '.anonymous-user-id'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(JSON.parse(await readFile(join(target, 'imported-plugin-restore.v1.json'), 'utf8'))).toMatchObject({
      profile: 'web', entries: [], allowBuilds: {},
    })
    expect(await hasDesktopData(target)).toBe(true)
  })

  it('refuses a non-empty destination and records setup atomically', async () => {
    const root = await fixture()
    const official = join(root, '.dsh')
    const target = join(root, 'target')
    const setupPath = join(root, 'desktop', 'data-home-setup.json')
    await mkdir(official)
    await mkdir(target)
    await writeFile(join(target, 'owned.txt'), 'keep')
    await expect(importOfficialDesktopData(official, target)).rejects.toThrow('non-empty Harness home')
    expect(await readFile(join(target, 'owned.txt'), 'utf8')).toBe('keep')

    const setup = desktopDataHomeSetup('imported', target, official)
    expect(setup.importedOnboardingReset).toBe(IMPORTED_ONBOARDING_RESET_VERSION)
    await writeDesktopDataHomeSetup(setupPath, setup)
    expect(await readDesktopDataHomeSetup(setupPath)).toEqual(setup)
    await writeFile(setupPath, '{broken')
    expect(await readDesktopDataHomeSetup(setupPath)).toBeUndefined()
  })

  it('resets a copied onboarding acknowledgement once without changing other settings', async () => {
    const root = await fixture()
    const dshHome = join(root, 'dsh-home')
    await mkdir(dshHome, { recursive: true })
    await writeFile(join(dshHome, 'settings.yaml'), [
      'locale: en',
      'ui-onboarding:',
      '  welcomeNoticeVersion: 2026-08-19.1',
      '',
    ].join('\n'))

    await expect(resetImportedDesktopOnboarding(dshHome)).resolves.toBe(true)
    const settings = await readFile(join(dshHome, 'settings.yaml'), 'utf8')
    expect(settings).toContain('locale: en')
    expect(settings).not.toContain('ui-onboarding')
    await expect(resetImportedDesktopOnboarding(dshHome)).resolves.toBe(false)
  })

  it('records direct reuse of the official home without copying it', async () => {
    const root = await fixture()
    const official = join(root, '.dsh')
    const setupPath = join(root, 'desktop', 'data-home-setup.json')
    const setup = desktopDataHomeSetup('reused', official, official)
    await writeDesktopDataHomeSetup(setupPath, setup)
    await expect(readDesktopDataHomeSetup(setupPath)).resolves.toEqual(setup)
    expect(await hasDesktopData(join(root, 'desktop', 'dsh-home'))).toBe(false)

    const layout = resolveDesktopDataHomeLayout(join(root, 'app-data'), root, true, {})
    expect(resolveRecordedDesktopDataHome(layout, setup)).toBe(official)
    expect(resolveRecordedDesktopDataHome(layout, {
      ...setup,
      source: join(root, 'unexpected'),
    })).toBeUndefined()
  })

  it('recognizes direct and parent-selected DSH homes while rejecting unrelated directories', async () => {
    const root = await fixture()
    const direct = join(root, 'direct')
    const parent = join(root, 'parent')
    const unrelated = join(root, 'unrelated')
    await mkdir(join(direct, 'profiles', 'web'), { recursive: true })
    await mkdir(join(parent, '.dsh'), { recursive: true })
    await mkdir(unrelated)
    await writeFile(join(direct, 'profiles', 'web', 'package.json'), '{}\n')
    await writeFile(join(parent, '.dsh', 'settings.yaml'), 'locale: zh\n')
    await writeFile(join(unrelated, 'notes.txt'), 'not dsh\n')

    await expect(resolveDesktopDataHomeSource(direct)).resolves.toEqual({
      path: direct,
      entries: ['profiles/web/package.json'],
    })
    await expect(resolveDesktopDataHomeSource(parent)).resolves.toEqual({
      path: join(parent, '.dsh'),
      entries: ['settings.yaml'],
    })
    await expect(resolveDesktopDataHomeSource(unrelated)).resolves.toBeUndefined()
  })

  it('restores a persisted custom reused home', async () => {
    const root = await fixture()
    const custom = join(root, 'portable-dsh')
    const layout = resolveDesktopDataHomeLayout(join(root, 'app-data'), root, true, {})
    const setup = desktopDataHomeSetup('reused', custom, custom)

    expect(resolveRecordedDesktopDataHome(layout, setup)).toBe(custom)
  })
})
