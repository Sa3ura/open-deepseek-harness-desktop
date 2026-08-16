import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { scrubEnvironment, SourceUpdater } from '../src/source-updater.ts'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Desktop Updater Test',
      GIT_AUTHOR_EMAIL: 'updater@example.invalid',
      GIT_COMMITTER_NAME: 'Desktop Updater Test',
      GIT_COMMITTER_EMAIL: 'updater@example.invalid',
    },
  }).trim()
}

function commit(root: string, file: string, content: string, message: string): string {
  writeFileSync(join(root, file), content)
  git(root, 'add', file)
  git(root, 'commit', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}

function fixture(): { upstream: string; checkout: string; initial: string } {
  const parent = mkdtempSync(join(tmpdir(), 'dsh-source-updater-'))
  const upstream = join(parent, 'upstream')
  const checkout = join(parent, 'checkout')
  git(parent, 'init', '-b', 'master', upstream)
  const initial = commit(upstream, 'version.txt', 'one\n', 'initial')
  git(parent, 'clone', upstream, checkout)
  return { upstream, checkout, initial }
}

describe('desktop source updater', () => {
  it('classifies and applies an official fast-forward update', async () => {
    const { upstream, checkout, initial } = fixture()
    const latest = commit(upstream, 'version.txt', 'two\n', 'stable update')
    const prepare = vi.fn(() => Promise.resolve())
    const updater = new SourceUpdater({
      sourceRoot: checkout,
      nodeCommand: process.execPath,
      repository: upstream,
      prepare,
    })

    await expect(updater.check()).resolves.toMatchObject({
      reason: 'ready',
      currentCommit: initial,
      latestCommit: latest,
      dirtyFiles: 0,
    })
    await expect(updater.upgrade(latest)).resolves.toEqual({
      ok: true,
      previousCommit: initial,
      currentCommit: latest,
      restartRequired: true,
    })
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(latest)
    expect(prepare).toHaveBeenCalledOnce()
  })

  it('blocks a dirty worktree before changing its branch', async () => {
    const { upstream, checkout, initial } = fixture()
    const latest = commit(upstream, 'version.txt', 'two\n', 'stable update')
    writeFileSync(join(checkout, 'local.txt'), 'keep me\n')
    const prepare = vi.fn(() => Promise.resolve())
    const updater = new SourceUpdater({
      sourceRoot: checkout,
      nodeCommand: process.execPath,
      repository: upstream,
      prepare,
    })

    await expect(updater.check()).resolves.toMatchObject({ reason: 'dirty', dirtyFiles: 1 })
    await expect(updater.upgrade(latest)).resolves.toMatchObject({
      ok: false,
      status: { reason: 'dirty' },
    })
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(initial)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('rolls the checkout and build back when preparation fails', async () => {
    const { upstream, checkout, initial } = fixture()
    const latest = commit(upstream, 'version.txt', 'two\n', 'stable update')
    const prepare = vi.fn()
      .mockRejectedValueOnce(new Error('build failed'))
      .mockResolvedValueOnce(undefined)
    const updater = new SourceUpdater({
      sourceRoot: checkout,
      nodeCommand: process.execPath,
      repository: upstream,
      prepare,
    })

    await expect(updater.upgrade(latest)).resolves.toMatchObject({
      ok: false,
      rollbackIncomplete: false,
      status: { reason: 'check-failed', detail: 'build failed' },
    })
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(initial)
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('requires a manual merge when local and official histories diverge', async () => {
    const { upstream, checkout } = fixture()
    commit(checkout, 'local.txt', 'local\n', 'local change')
    commit(upstream, 'official.txt', 'official\n', 'official change')
    const updater = new SourceUpdater({
      sourceRoot: checkout,
      nodeCommand: process.execPath,
      repository: upstream,
      prepare: () => Promise.resolve(),
    })

    await expect(updater.check()).resolves.toMatchObject({ reason: 'diverged', dirtyFiles: 0 })
  })

  it('removes credential-bearing variables from updater children', () => {
    expect(scrubEnvironment({
      PATH: '/bin',
      DEEPSEEK_API_KEY: 'secret',
      npm_TOKEN: 'secret',
      ORDINARY: 'visible',
    })).toEqual({ PATH: '/bin', ORDINARY: 'visible' })
  })
})
