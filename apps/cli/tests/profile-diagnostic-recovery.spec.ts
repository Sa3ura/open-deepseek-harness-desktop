import { describe, expect, it } from 'vitest'
import { classifyProfileDiagnostic } from '@deepseek-ai/dsh-app-boot'
import { isDeterministicSafeModeFailure, loaderClientModuleFailure } from '../src/profile-boot.ts'

describe('Profile diagnostic recovery policy', () => {
  it('does not divert transient, waiting-period, unknown, or broken-runtime failures into safe mode', () => {
    for (const value of [
      'ECONNRESET while fetching registry',
      'ERR_PNPM_FETCH_401 registry unauthorized',
      'ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION',
      'a failure the current rules do not recognize',
      'Harness exited before becoming ready',
    ]) {
      const issue = classifyProfileDiagnostic({ source: 'profile', phase: 'preflight', value })
      expect(isDeterministicSafeModeFailure(issue), issue.code).toBe(false)
    }
  })

  it('enters safe mode for user configuration and external Loader failures', () => {
    for (const value of [
      'credentials-local: the value for "version" must be a string',
      'failed to apply loader entry fixture (@fixture/broken): activation failed',
      'duplicate loader entry fixture',
    ]) {
      const issue = classifyProfileDiagnostic({ source: 'loader', phase: 'apply', value })
      expect(isDeterministicSafeModeFailure(issue), issue.code).toBe(true)
    }
  })

  it('extracts only proven client module-table Loader import failures', () => {
    const cause = new Error('client-modules: require("@deepseek-ai/dsh-client-runtime/client") missed the module table — not a platform seed word, not a materialized module, and no registered package factory')
    const error = new Error('failed to import loader entry 71626ed6 (dsh-font)', { cause })
    expect(loaderClientModuleFailure(error)).toEqual({
      entryId: '71626ed6',
      moduleName: 'dsh-font',
    })
    expect(loaderClientModuleFailure(
      new Error('failed to import loader entry 71626ed6 (dsh-font): plugin apply threw'),
    )).toBeUndefined()
  })
})
