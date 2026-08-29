import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CUSTOM_WINDOW_TITLE_BAR_HEIGHT,
  usesCustomWindowFrame,
  withCustomWindowFrameInset,
} from '../src/window-frame.ts'

const readUtf8 = readFileSync as unknown as (path: URL, encoding: 'utf8') => string

describe('desktop window frame policy', () => {
  it.each(['win32', 'linux'] as const)('uses Harness window chrome on %s', (platform) => {
    expect(usesCustomWindowFrame(platform)).toBe(true)
  })

  it('keeps the native macOS title bar', () => {
    expect(usesCustomWindowFrame('darwin')).toBe(false)
  })

  it.each(['win32', 'linux'] as const)('declares the custom title-bar inset on %s', (platform) => {
    const url = new URL(withCustomWindowFrameInset('http://127.0.0.1:64174/?token=one#session', platform))

    expect(url.searchParams.get('token')).toBe('one')
    expect(url.searchParams.get('dsh-desktop-mode')).toBe('advanced')
    expect(url.searchParams.get('dsh-desktop-platform')).toBe(platform)
    expect(url.searchParams.get('dsh-desktop-titlebar-inset')).toBe(String(CUSTOM_WINDOW_TITLE_BAR_HEIGHT))
    expect(url.hash).toBe('#session')
  })

  it('does not stamp the macOS Harness URL', () => {
    const url = 'http://127.0.0.1:64174/?token=one#session'
    expect(withCustomWindowFrameInset(url, 'darwin')).toBe(url)
  })

  it('pins Web content below the custom title bar instead of relying on document padding', () => {
    const preload = readUtf8(new URL('../src/preload.ts', import.meta.url), 'utf8')

    expect(preload).toContain('inset: ${CUSTOM_WINDOW_TITLE_BAR_HEIGHT}px 0 0;')
    expect(preload).toContain('--dsh-desktop-titlebar-inset: ${CUSTOM_WINDOW_TITLE_BAR_HEIGHT}px;')
    expect(preload).toContain('height: auto !important;')
    expect(preload).toContain('position: fixed;')
    expect(preload).not.toContain('padding-top: ${CUSTOM_WINDOW_TITLE_BAR_HEIGHT}px;')
  })

  it('keeps body-portaled full-viewport client surfaces below custom window chrome', () => {
    const files = [
      '../../../packages/client/ui-primitives/src/Modal.module.css',
      '../../../packages/client/ui-primitives/src/OnboardingSurface.module.css',
      '../../../packages/client/ui-attachment/src/DropOverlay.module.css',
      '../../../packages/client/ui-attachment/src/ImageLightbox.module.css',
      '../../../packages/client/ui-settings-general/src/client/SettingsRoot.module.css',
    ]

    for (const file of files) {
      const css = readUtf8(new URL(file, import.meta.url), 'utf8')
      expect(css, file).toContain('inset: var(--dsh-desktop-titlebar-inset, 0px) 0 0;')
    }
  })
})
