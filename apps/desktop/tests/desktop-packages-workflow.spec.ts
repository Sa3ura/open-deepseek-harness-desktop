import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

interface WorkflowJob {
  readonly needs?: string
  readonly env?: Record<string, string>
  readonly steps?: Array<{ uses?: string; with?: Record<string, string>; run?: string }>
}

describe('desktop package workflow bundled plugins', () => {
  it('resolves one snapshot and reuses it in every platform package', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../../../.github/workflows/desktop-packages.yml'), 'utf8')
    const workflow = parse(source) as { jobs: Record<string, WorkflowJob> }
    const resolver = workflow.jobs['bundled-plugins']
    expect(resolver?.steps?.some(step => step.run === 'pnpm run refresh:desktop:bundled-plugins')).toBe(true)
    expect(resolver?.steps?.some(step => step.with?.name === 'bundled-plugin-snapshot')).toBe(true)

    for (const name of ['macos', 'windows', 'linux']) {
      const job = workflow.jobs[name]
      expect(job?.needs).toBe('bundled-plugins')
      expect(job?.env?.DSH_BUNDLED_PLUGINS_REFRESH).toBe('0')
      expect(job?.steps?.some(step => (
        step.uses === 'actions/download-artifact@v4'
        && step.with?.name === 'bundled-plugin-snapshot'
        && step.with?.path === 'apps/desktop/bundled-plugins'
      ))).toBe(true)
    }
  })

  it('keeps the internal snapshot out of release artifact globs', () => {
    expect('bundled-plugin-snapshot').not.toMatch(/^desktop-/u)
  })
})
