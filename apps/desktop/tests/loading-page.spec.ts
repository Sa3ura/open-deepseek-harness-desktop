import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('desktop loading page', () => {
  it('uses one determinate left-to-right bar with task and percentage labels', async () => {
    const html = await readFile(new URL('../src/loading.html', import.meta.url), 'utf8')
    const preload = await readFile(new URL('../src/preload.ts', import.meta.url), 'utf8')

    expect(html).toContain('id="progress-task"')
    expect(html).toContain('id="progress-percent"')
    expect(html).toContain('id="progress-bar"')
    expect(html).toContain('aria-valuemax="100"')
    expect(html).not.toContain('infinite alternate')
    expect(html).not.toContain('@keyframes progress')
    expect(html).toContain('color-scheme: light dark')
    expect(html).toContain('@media (prefers-color-scheme: dark)')
    expect(preload).toContain("getAttribute('data-dsh-color-scheme-source')")
    expect(preload).toContain("ipcRenderer.send('dsh:desktop:theme-source', source)")
    expect(preload).toContain("attributeFilter: ['data-dsh-color-scheme-source']")
  })
})
