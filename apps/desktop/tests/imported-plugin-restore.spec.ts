import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractImportedPluginRestorePlan,
  dependencyMatchesImportedRestore,
  ImportedPluginRestoreManager,
  mergeImportedAllowBuilds,
  readImportedPluginRestorePlan,
  writeImportedPluginRestorePlan,
} from '../src/imported-plugin-restore.ts'

const roots: string[] = []

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-imported-plugin-restore-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('imported plugin restore', () => {
  it('extracts only ordered dependency and bundle intersections and classifies unsafe sources', async () => {
    const root = await fixture()
    const profile = join(root, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    await writeFile(join(root, 'settings.yaml'), 'agent-presets:\n  externalTools:\n    codex: true\n')
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      dependencies: {
        library: '^1.0.0',
        registryPlugin: '^2.0.0',
        aliasPlugin: 'npm:real-plugin@^3.0.0',
        gitPlugin: 'github:owner/repo#v1',
        localPlugin: 'file:../plugin',
        secretPlugin: 'git+https://user:token@example.test/repo.git',
        '@deepseek-ai/dsh-subagent-codex': '^0.1.0',
      },
      dsh: { profile: { bundles: [
        '@deepseek-ai/dsh-base', 'gitPlugin', 'library-missing', 'registryPlugin',
        'localPlugin', 'secretPlugin', 'aliasPlugin', '@deepseek-ai/dsh-subagent-codex',
      ] } },
    }))
    await writeFile(join(profile, 'pnpm-workspace.yaml'), [
      'packages:', '  - .', 'dangerouslyAllowAllBuilds: true', 'allowBuilds:',
      '  node-pty: true', '  unsafe-native: false', '',
    ].join('\n'))

    let index = 0
    const plan = await extractImportedPluginRestorePlan(root, () => `restore-${++index}`)
    expect(plan.entries.map(entry => entry.packageName)).toEqual([
      'gitPlugin', 'registryPlugin', 'localPlugin', 'secretPlugin', 'aliasPlugin',
      '@deepseek-ai/dsh-subagent-codex',
    ])
    expect(plan.entries.find(entry => entry.packageName === 'localPlugin')).toMatchObject({
      recoverable: false, unsupportedReason: 'local-source',
    })
    expect(plan.entries.find(entry => entry.packageName === 'secretPlugin')).toMatchObject({
      recoverable: false, unsupportedReason: 'credentialed-source',
    })
    expect(plan.entries.at(-1)).toMatchObject({
      category: 'external-tool', tool: 'codex', defaultSelected: true,
    })
    expect(plan.allowBuilds).toEqual({ 'node-pty': true, 'unsafe-native': false })
  })

  it('keeps malformed official Profile metadata non-blocking', async () => {
    const root = await fixture()
    const profile = join(root, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'package.json'), '{broken')
    await writeFile(join(profile, 'pnpm-workspace.yaml'), 'allowBuilds: [broken')
    const plan = await extractImportedPluginRestorePlan(root)
    expect(plan.entries).toEqual([])
    expect(plan.sourceIssues).toHaveLength(2)
  })

  it('does not follow a linked official Profile manifest', async () => {
    const root = await fixture()
    const outside = join(root, 'outside-package.json')
    const profile = join(root, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    await writeFile(outside, JSON.stringify({
      dependencies: { plugin: '^1.0.0' }, dsh: { profile: { bundles: ['plugin'] } },
    }))
    await symlink(outside, join(profile, 'package.json'))
    const plan = await extractImportedPluginRestorePlan(root)
    expect(plan.entries).toEqual([])
  })

  it('does not follow a linked Web Profile directory', async () => {
    const root = await fixture()
    const outside = join(root, 'outside-web')
    await mkdir(join(root, 'profiles'), { recursive: true })
    await mkdir(outside)
    await writeFile(join(outside, 'package.json'), JSON.stringify({
      dependencies: { plugin: '^1.0.0' }, dsh: { profile: { bundles: ['plugin'] } },
    }))
    await symlink(outside, join(root, 'profiles', 'web'))
    const plan = await extractImportedPluginRestorePlan(root)
    expect(plan.entries).toEqual([])
  })

  it('merges exact build rules with explicit false winning and comments retained', async () => {
    const root = await fixture()
    await writeFile(join(root, 'pnpm-workspace.yaml'), [
      'packages:', '  - .', '# keep user setting', 'nodeLinker: hoisted', 'allowBuilds:',
      '  node-pty: false', '  sharp: true', '',
    ].join('\n'))
    await expect(mergeImportedAllowBuilds(root, {
      'node-pty': true, sharp: false, ssh2: true,
    })).resolves.toBe(true)
    const content = await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8')
    expect(content).toContain('# keep user setting')
    expect(content).toContain('node-pty: false')
    expect(content).toContain('sharp: false')
    expect(content).toContain('ssh2: true')
  })

  it('adopts matching names, npm aliases, and GitHub repository subpaths', () => {
    expect(dependencyMatchesImportedRestore('plugin', '^9', {
      packageName: 'plugin', declaredSpec: '^1',
    })).toBe(true)
    expect(dependencyMatchesImportedRestore('renamed', 'npm:real-plugin@^2', {
      packageName: 'alias', declaredSpec: 'npm:real-plugin@^1',
    })).toBe(true)
    expect(dependencyMatchesImportedRestore('renamed', 'github:owner/repo#path:/one', {
      packageName: 'git-plugin', declaredSpec: 'git+https://github.com/owner/repo.git#path:/one',
    })).toBe(true)
    expect(dependencyMatchesImportedRestore('renamed', 'github:owner/repo#path:/two', {
      packageName: 'git-plugin', declaredSpec: 'github:owner/repo#path:/one',
    })).toBe(false)
  })

  it('restores opaque selected ids serially, marks provided entries, and retains failures', async () => {
    const root = await fixture()
    await mkdir(join(root, 'profiles', 'web'), { recursive: true })
    await writeFile(join(root, 'profiles', 'web', 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    const base = await extractImportedPluginRestorePlan(root)
    await writeImportedPluginRestorePlan(root, {
      ...base,
      entries: [
        { restoreId: 'one', packageName: 'provided', packageSpec: 'provided@^1', declaredSpec: '^1', category: 'plugin', defaultSelected: true, recoverable: true, state: 'pending' },
        { restoreId: 'two', packageName: 'good', packageSpec: 'good@^1', declaredSpec: '^1', category: 'plugin', defaultSelected: true, recoverable: true, state: 'pending' },
        { restoreId: 'three', packageName: 'bad', packageSpec: 'bad@^1', declaredSpec: '^1', category: 'plugin', defaultSelected: true, recoverable: true, state: 'pending' },
      ],
    })
    const install = vi.fn(async (spec: string) => {
      if (spec.startsWith('bad@')) throw new Error('registry unavailable')
      return 'installed'
    })
    const manager = new ImportedPluginRestoreManager({
      dshHome: root, providedDependencies: { provided: '^2' }, install,
    })
    await manager.prepare()
    expect(manager.snapshot()?.entries[0]?.state).toBe('provided')
    await expect(manager.start(['unknown'])).rejects.toThrow('not selectable')
    await manager.start(['two', 'three'])
    await vi.waitFor(() => { expect(manager.snapshot()?.active).toBe(false) })
    expect(install.mock.calls.map(call => call[0])).toEqual(['good@^1', 'bad@^1'])
    expect(manager.snapshot()?.entries.map(entry => entry.state)).toEqual(['provided', 'succeeded', 'failed'])
    expect((await readImportedPluginRestorePlan(root))?.entries[2]?.diagnostic).toContain('registry unavailable')
  })

  it('rejects a locally edited plan that tries to replace an opaque id with a path install', async () => {
    const root = await fixture()
    const plan = await extractImportedPluginRestorePlan(root)
    await writeImportedPluginRestorePlan(root, {
      ...plan,
      entries: [{
        restoreId: 'tampered', packageName: 'plugin', packageSpec: 'file:/tmp/plugin',
        declaredSpec: '^1.0.0', category: 'plugin', defaultSelected: true,
        recoverable: true, state: 'pending',
      }],
    })
    await expect(readImportedPluginRestorePlan(root)).resolves.toBeUndefined()
  })
})
