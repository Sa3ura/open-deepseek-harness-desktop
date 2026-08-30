import { describe, expect, it, vi } from 'vitest'
import {
  compareDesktopVersions, DesktopReleaseChecker, fetchGitHubReleases, isAllowedReleaseUrl, selectRelease,
} from '../src/release-checker.ts'

const url = 'https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/dsh-v0.1.0-rc.8'

describe('desktop Release checker', () => {
  it('compares stable and prerelease semantic versions', () => {
    expect(compareDesktopVersions('0.1.0-rc.8', '0.1.0-rc.7')).toBe(1)
    expect(compareDesktopVersions('0.1.0', '0.1.0-rc.99')).toBe(1)
    expect(compareDesktopVersions('invalid', '0.1.0')).toBeUndefined()
  })

  it('allows only Release pages from the configured repository', () => {
    expect(isAllowedReleaseUrl(url)).toBe(true)
    expect(isAllowedReleaseUrl('https://github.com/example/project/releases/tag/x')).toBe(false)
    expect(isAllowedReleaseUrl('javascript:alert(1)')).toBe(false)
  })

  it('accepts prereleases for an rc client but not for a stable client', () => {
    const releases = [{
      draft: false, prerelease: true, tag_name: 'dsh-v0.1.0-rc.8', html_url: url,
      published_at: '2026-08-20T00:00:00Z',
    }]
    expect(selectRelease('0.1.0-rc.7', releases)).toMatchObject({ phase: 'available', latestVersion: '0.1.0-rc.8' })
    expect(selectRelease('0.1.0', releases)).toEqual({ phase: 'current', currentVersion: '0.1.0' })
  })

  it('recognizes community tags and lets prerelease clients move between channels', () => {
    const releaseUrl = 'https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/odsh-v0.1.2-alpha.1'
    const releases = [{
      draft: false, prerelease: false, tag_name: 'odsh-v0.1.2-alpha.1', html_url: releaseUrl,
      published_at: '2026-08-30T09:06:58Z',
    }]
    expect(selectRelease('0.1.1-rc.2', releases)).toMatchObject({
      phase: 'available', latestVersion: '0.1.2-alpha.1', releaseUrl,
    })
    expect(selectRelease('0.1.2-alpha.1', releases)).toEqual({
      phase: 'current', currentVersion: '0.1.2-alpha.1',
    })
  })

  it('uses semantic prerelease data when GitHub metadata is incorrect', () => {
    const releases = [{
      draft: false, prerelease: false, tag_name: 'odsh-v0.2.0-alpha.1',
      html_url: 'https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/odsh-v0.2.0-alpha.1',
      published_at: '2026-08-30T09:06:58Z',
    }]
    expect(selectRelease('0.1.2', releases)).toEqual({ phase: 'current', currentVersion: '0.1.2' })
  })

  it('bounds a stalled GitHub request and aborts the underlying fetch', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => (
        new Promise<Response>(() => {
          expect(init?.signal).toBeInstanceOf(AbortSignal)
        })
      ))
      const request = fetchGitHubReleases(fetchImpl, 2_000)
      const rejection = expect(request).rejects.toThrow('GitHub Releases request timed out after 2 seconds')
      await vi.advanceTimersByTimeAsync(2_000)
      await rejection
      const signal = fetchImpl.mock.calls[0]?.[1]?.signal
      expect(signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces concurrent checks and contains request failures', async () => {
    const fetchReleases = vi.fn(() => Promise.reject(new Error('offline')))
    const checker = new DesktopReleaseChecker('0.1.0-rc.7', fetchReleases)
    const first = checker.check()
    const second = checker.check()
    expect(first).toBe(second)
    await expect(first).resolves.toMatchObject({ phase: 'error', message: 'offline' })
    expect(fetchReleases).toHaveBeenCalledOnce()
  })
})
