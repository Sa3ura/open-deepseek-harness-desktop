/** Windows process-tree termination used by the desktop Harness supervisor. */

import { spawn } from 'node:child_process'

/** Injectable taskkill runner for deterministic lifecycle tests. */
export type WindowsProcessTreeRunner = (command: string, args: readonly string[]) => Promise<void>

async function runTaskkill(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', reject)
    // A non-zero status also means the process already exited, which is the
    // desired terminal state for shutdown.
    child.once('close', () => { resolve() })
  })
}

/** Ask Windows to stop one process and every descendant it created. */
export async function terminateWindowsProcessTree(
  processId: number,
  force: boolean,
  run: WindowsProcessTreeRunner = runTaskkill,
): Promise<void> {
  if (!Number.isInteger(processId) || processId <= 0) {
    throw new TypeError('desktop: Windows process id must be a positive integer')
  }
  await run('taskkill.exe', [
    '/PID', String(processId), '/T',
    ...(force ? ['/F'] : []),
  ])
}
