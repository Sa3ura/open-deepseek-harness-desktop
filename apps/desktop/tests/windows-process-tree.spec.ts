import { describe, expect, it, vi } from 'vitest'
import { terminateWindowsProcessTree } from '../src/windows-process-tree.ts'

describe('Windows process-tree termination', () => {
  it('uses taskkill tree mode and adds force only for the fallback', async () => {
    const run = vi.fn(async () => {})

    await terminateWindowsProcessTree(4812, false, run)
    await terminateWindowsProcessTree(4812, true, run)

    expect(run).toHaveBeenNthCalledWith(1, 'taskkill.exe', ['/PID', '4812', '/T'])
    expect(run).toHaveBeenNthCalledWith(2, 'taskkill.exe', ['/PID', '4812', '/T', '/F'])
  })

  it('rejects invalid process identifiers before invoking Windows', async () => {
    const run = vi.fn(async () => {})
    await expect(terminateWindowsProcessTree(0, false, run)).rejects.toThrow('positive integer')
    expect(run).not.toHaveBeenCalled()
  })
})
