/** Settings-panel geometry contract for contributed navigation and desktop chrome. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SettingsRoot.module.css', import.meta.url)), 'utf8')

/** Read one exact selector's declarations from the CSS module source. */
function declarations(selector: string): Map<string, string> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectors = '', body = ''] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return new Map()
}

describe('SettingsRoot.module.css geometry', () => {
  it('keeps the desktop title bar outside settings overlays and panel height', () => {
    expect(declarations('.overlay').get('inset')).toBe('var(--dsh-desktop-titlebar-inset, 0px) 0 0')
    expect(declarations('.panel').get('height'))
      .toBe('min(800px, calc(100vh - var(--dsh-desktop-titlebar-inset, 0px) - 48px))')
    expect(declarations('.onboardingPanel').get('height'))
      .toBe('min(820px, calc(100vh - var(--dsh-desktop-titlebar-inset, 0px) - 48px))')
  })

  it('gives contributed navigation its own non-collapsing scrollport', () => {
    const nav = declarations('.nav')
    const list = declarations('.navList')
    const cell = declarations('.navCell')

    expect(nav.get('min-height')).toBe('0')
    expect(nav.get('overflow')).toBe('hidden')
    expect(list.get('flex')).toBe('1')
    expect(list.get('min-height')).toBe('0')
    expect(list.get('overflow-y')).toBe('auto')
    expect(list.get('overscroll-behavior')).toBe('contain')
    expect(list.get('scrollbar-gutter')).toBe('stable')
    expect(cell.get('flex')).toBe('none')
  })
})
