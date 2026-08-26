import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  desktopThemeBackground,
  isDesktopThemeSource,
  readDesktopThemeSource,
  resolveDesktopThemeSource,
} from '../src/desktop-theme.ts'

describe('desktop theme synchronization', () => {
  it('maps every built-in skin to its light or dark base palette', () => {
    expect(resolveDesktopThemeSource('system')).toBe('system')
    for (const preference of ['dark', 'ocean', 'moonlight', 'starlight', 'pirate', 'shinobi', 'rift']) {
      expect(resolveDesktopThemeSource(preference)).toBe('dark')
    }
    for (const preference of ['light', 'bubble', 'inspiration-collage']) {
      expect(resolveDesktopThemeSource(preference)).toBe('light')
    }
    expect(resolveDesktopThemeSource('unknown')).toBe('system')
  })

  it('reads the active Harness home and tolerates absent or malformed settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-theme-'))
    await mkdir(join(root, 'dark'), { recursive: true })
    await writeFile(join(root, 'dark', 'settings.yaml'), 'ui-theme:\n  preference: ocean\n')
    expect(await readDesktopThemeSource(join(root, 'dark'))).toBe('dark')

    expect(await readDesktopThemeSource(join(root, 'missing'))).toBe('system')
    await mkdir(join(root, 'broken'), { recursive: true })
    await writeFile(join(root, 'broken', 'settings.yaml'), 'ui-theme: [broken\n')
    const reportError = vi.fn()
    expect(await readDesktopThemeSource(join(root, 'broken'), reportError)).toBe('system')
    expect(reportError).toHaveBeenCalledOnce()
  })

  it('validates IPC sources and resolves pre-paint backgrounds', () => {
    expect(['system', 'light', 'dark'].every(isDesktopThemeSource)).toBe(true)
    expect(isDesktopThemeSource('ocean')).toBe(false)
    expect(desktopThemeBackground('system', true)).toBe('#1b1b1a')
    expect(desktopThemeBackground('system', false)).toBe('#f4f2ed')
    expect(desktopThemeBackground('dark', false)).toBe('#1b1b1a')
    expect(desktopThemeBackground('light', true)).toBe('#f4f2ed')
  })
})
