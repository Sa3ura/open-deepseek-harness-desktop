import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveHarnessLaunch } from '../src/launch.ts'

describe('desktop Harness launch', () => {
  it('uses explicit executable overrides without a shell', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-launch-'))
    const harnessBin = join(root, 'bin.js')
    writeFileSync(harnessBin, '')
    expect(resolveHarnessLaunch({
      DSH_DESKTOP_DSH_BIN: harnessBin,
      DSH_DESKTOP_NODE_BIN: '/opt/node/bin/node',
    })).toEqual({
      command: '/opt/node/bin/node',
      args: [harnessBin, 'web', '--host', '127.0.0.1', '--port', '0'],
    })
  })

  it('fails before spawning when the Harness launcher is absent', () => {
    expect(() => resolveHarnessLaunch({}, '/does/not/exist/dsh.js')).toThrow('Harness launcher not found')
  })
})
