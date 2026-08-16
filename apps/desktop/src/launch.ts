/** Resolve the local Harness process used by the Electron host. */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Executable and arguments for one Harness child process. */
export interface HarnessLaunch {
  command: string
  args: string[]
}

/** Environment variables accepted by {@link resolveHarnessLaunch}. */
export interface DesktopLaunchEnvironment {
  DSH_DESKTOP_DSH_BIN?: string
  DSH_DESKTOP_NODE_BIN?: string
}

/**
 * Resolve a built Harness launcher without consulting the user's shell.
 * @param environment - Desktop-only launch overrides.
 * @param checkoutBin - Built checkout launcher used during development.
 * @returns A direct process launch with no shell interpolation.
 */
export function resolveHarnessLaunch(
  environment: DesktopLaunchEnvironment,
  checkoutBin = fileURLToPath(new URL('../../cli/lib/bin.js', import.meta.url)),
): HarnessLaunch {
  const harnessBin = environment.DSH_DESKTOP_DSH_BIN ?? checkoutBin
  if (!existsSync(harnessBin)) {
    throw new Error(`desktop: Harness launcher not found at ${harnessBin}; run pnpm run build first or set DSH_DESKTOP_DSH_BIN`)
  }
  return {
    command: environment.DSH_DESKTOP_NODE_BIN ?? 'node',
    args: [harnessBin, 'web', '--host', '127.0.0.1', '--port', '0'],
  }
}
