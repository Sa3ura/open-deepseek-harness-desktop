import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

/**
 * Keyless smoke for SOURCE `dsh` execution: run `apps/cli/src/bin.ts`
 * with the exact production runtime vector (`node --import tsx/esm`, the
 * vector the root `dsh` script invokes directly) and assert the
 * required-config diagnostic. The Node compatibility matrix runs this
 * WHOLE file, so a Node release changing module hooks or TypeScript handling
 * breaks this gate instead of every developer's `pnpm dsh`; the built-bin
 * suite covers the published `lib/` entry, not this source chain.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const dshSourceBin = 'apps/cli/src/bin.ts'

describe('dsh SOURCE launcher (node --import tsx/esm)', () => {
  it.each([
    ['node-pty', 0],
    ['node-pty@1.1.0', 1],
  ] as const)('drains plugin command completion for %s with status %i', async (packageName, exitCode) => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-plugin-exit-'))
    try {
      const observer = 'data:text/javascript,' + encodeURIComponent(
        'process.once("beforeExit", code => process.stdout.write(`plugin-drained:${code}\\n`))',
      )
      const result = await execa(process.execPath, [
        '--import', 'tsx/esm', '--import', observer, dshSourceBin,
        'plugin', '--profile', 'web', 'approve-build', packageName,
      ], {
        cwd: repoRoot,
        env: { DSH_HOME: home },
        input: '',
        timeout: 25_000,
        killSignal: 'SIGKILL',
        reject: false,
      })
      expect(result.timedOut).toBe(false)
      expect(result.signal).toBeUndefined()
      expect(result.exitCode).toBe(exitCode)
      expect(result.stdout).toContain(`plugin-drained:${exitCode}`)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  }, 30_000)

  it('launches the source CLI without building', async () => {
    const rootPackage = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      readonly scripts?: Record<string, string>
    }
    expect(rootPackage.scripts?.dsh).toBe('node --import tsx/esm apps/cli/src/bin.ts')
  })

  it('boots the source entry and requires a profile', async () => {
    const result = await execa(process.execPath, ['--import', 'tsx/esm', dshSourceBin], {
      cwd: repoRoot,
      input: '',
      timeout: 25_000,
      killSignal: 'SIGKILL',
      reject: false,
    })
    if (result.timedOut) {
      throw new Error(`dsh source launch did not exit within 25s. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
    }
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('--profile <name> is required')
    expect(result.stdout).toBe('')
  }, 30_000)
})
