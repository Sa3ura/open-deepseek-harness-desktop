/** Read the existing plugin mutation lease without acquiring or removing it. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Detect a live or unreadable Profile mutation lease. @param home - Active Harness home. @returns True when exit must wait. */
export function menuMutationActive(home: string): boolean {
  let source: string
  try { source = readFileSync(join(home, 'plugin-snapshots', 'v1', '.profile-plugin-mutation.web.lock'), 'utf8') } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
  }
  let owner: unknown
  try { owner = JSON.parse(source) } catch { return true /* A partial lease cannot establish safe shutdown. */ }
  if (typeof owner !== 'object' || owner === null || !('pid' in owner)
    || typeof owner.pid !== 'number' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) return true
  try { process.kill(owner.pid, 0); return true } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH')
  }
}
