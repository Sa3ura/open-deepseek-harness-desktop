import { existsSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
  DiagnosticLabManager,
  type DiagnosticLabRunSnapshot,
  type DiagnosticLabStartRequest,
} from '../src/diagnostic-lab.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function bench(): Promise<{
  root: string
  home: string
  manager: DiagnosticLabManager
  snapshots: DiagnosticLabRunSnapshot[]
  suspendHarness: Mock<() => Promise<void>>
  resumeHarness: Mock<() => void>
  installProfile: Mock<() => Promise<void>>
  runDoctor: Mock<() => Promise<{ status: string; issueCodes: string[]; output: string }>>
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-diagnostic-lab-'))
  roots.push(root)
  const home = join(root, 'active-home')
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  await writeFile(join(home, 'profiles', 'web', 'package.json'), '{"name":"dsh-profile-web","private":true}\n')
  const snapshots: DiagnosticLabRunSnapshot[] = []
  const suspendHarness = vi.fn<() => Promise<void>>(async () => {})
  const resumeHarness = vi.fn<() => void>(() => {})
  const installProfile = vi.fn<() => Promise<void>>(async () => {})
  const runDoctor = vi.fn(async () => ({ status: 'healthy', issueCodes: [], output: '{}' }))
  const manager = new DiagnosticLabManager({
    root: join(root, 'lab'),
    activeDshHome: home,
    logDirectory: join(root, 'logs'),
    suspendHarness,
    resumeHarness,
    installProfile,
    runDoctor,
    productionDoctorFixtures: false,
    onSnapshot: (snapshot) => { snapshots.push(snapshot) },
  })
  return { root, home, manager, snapshots, suspendHarness, resumeHarness, installProfile, runDoctor }
}

async function waitForTerminal(manager: DiagnosticLabManager, runId: string): Promise<DiagnosticLabRunSnapshot> {
  for (let count = 0; count < 200; count += 1) {
    const snapshot = manager.get(runId)
    if (snapshot.phase === 'completed' || snapshot.phase === 'failed' || snapshot.phase === 'cancelled') return snapshot
    await new Promise((resolve) => { setTimeout(resolve, 5) })
  }
  throw new Error('diagnostic lab test run did not settle')
}

describe('DiagnosticLabManager', () => {
  it('runs every reviewed isolated scenario offline and removes its runtime', async () => {
    const b = await bench()
    const scenarioIds = b.manager.catalog().map(scenario => scenario.id)
    const initial = b.manager.start({ scenarioIds, preset: 'quick', target: 'isolated' })
    expect(b.manager.current()?.runId).toBe(initial.runId)
    const final = await waitForTerminal(b.manager, initial.runId)

    expect(final.phase).toBe('completed')
    expect(final.results).toHaveLength(scenarioIds.length)
    expect(final.results.every(result => result.phase === 'passed' && result.cleaned)).toBe(true)
    expect(final.completedSteps).toBe(final.totalSteps)
    expect(b.runDoctor).toHaveBeenCalledTimes(scenarioIds.length * 4)
    expect(b.suspendHarness).not.toHaveBeenCalled()
    expect(b.resumeHarness).not.toHaveBeenCalled()
    expect(existsSync(join(b.root, 'lab', 'runs', initial.runId, 'runtime'))).toBe(false)
    expect(JSON.parse(b.manager.exportReport(initial.runId))).toMatchObject({ runId: initial.runId, phase: 'completed' })
  })

  it('installs production fixtures before requiring convergence and quarantine outcomes', async () => {
    const b = await bench()
    const calls = new Map<string, number>()
    const runDoctor = vi.fn(async (home: string) => {
      const scenarioId = home.split('/').at(-1) ?? ''
      const call = (calls.get(home) ?? 0) + 1
      calls.set(home, call)
      if (call === 1) {
        const profileDir = join(home, 'profiles', 'web')
        await mkdir(profileDir, { recursive: true })
        await writeFile(join(profileDir, 'package.json'), '{"name":"dsh-profile-web","private":true}\n')
        await writeFile(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\n')
      }
      if (call === 2) {
        const issueCode = scenarioId === 'orphaned-bundle'
          ? 'profile.orphaned-bundle'
          : 'profile.host-dependency-conflict'
        return { status: 'failed', issueCodes: [issueCode], output: '{}' }
      }
      if (call === 3) {
        return {
          status: scenarioId === 'host-shadow-compatible' ? 'repaired' : 'quarantined',
          issueCodes: [],
          output: '{}',
        }
      }
      return { status: 'healthy', issueCodes: [], output: '{}' }
    })
    const manager = new DiagnosticLabManager({
      root: join(b.root, 'production-lab'),
      activeDshHome: b.home,
      logDirectory: join(b.root, 'production-logs'),
      suspendHarness: b.suspendHarness,
      resumeHarness: b.resumeHarness,
      installProfile: b.installProfile,
      runDoctor,
      onSnapshot: () => {},
    })
    const initial = manager.start({
      scenarioIds: ['host-shadow-compatible', 'host-shadow-incompatible', 'orphaned-bundle'],
      preset: 'quick',
      target: 'isolated',
    })
    const final = await waitForTerminal(manager, initial.runId)

    expect(final.phase).toBe('completed')
    expect(final.results.every(result => result.phase === 'passed')).toBe(true)
    expect(b.installProfile).toHaveBeenCalledTimes(3)
    expect(runDoctor).toHaveBeenCalledTimes(12)
  })

  it('runs the standard preset three times without scenario residue', async () => {
    const b = await bench()
    const initial = b.manager.start({
      scenarioIds: ['host-shadow-compatible', 'orphaned-bundle'],
      preset: 'standard',
      target: 'isolated',
    })
    const final = await waitForTerminal(b.manager, initial.runId)
    expect(final.results).toHaveLength(6)
    expect(final.results.map(result => result.round)).toEqual([1, 1, 2, 2, 3, 3])
    expect(final.phase).toBe('completed')
  })

  it('cancels at a safe boundary, cleans runtime, and rejects a concurrent run', async () => {
    const b = await bench()
    const initial = b.manager.start({
      scenarioIds: b.manager.catalog().map(scenario => scenario.id),
      preset: 'soak',
      target: 'isolated',
    })
    expect(() => b.manager.start({
      scenarioIds: ['orphaned-bundle'], preset: 'quick', target: 'isolated',
    })).toThrow('another diagnostic lab run is active')
    b.manager.cancel(initial.runId)
    const final = await waitForTerminal(b.manager, initial.runId)
    expect(final.phase).toBe('cancelled')
    expect(existsSync(join(b.root, 'lab', 'runs', initial.runId, 'runtime'))).toBe(false)
  })

  it('rejects arbitrary and target-incompatible scenario requests', async () => {
    const b = await bench()
    expect(() => b.manager.start({ scenarioIds: [], preset: 'quick', target: 'isolated' })).toThrow('invalid')
    expect(() => b.manager.start({
      scenarioIds: ['patch-invalid'],
      preset: 'quick',
      target: 'active-profile',
    })).toThrow('unavailable')
    expect(() => b.manager.start({
      scenarioIds: ['arbitrary-command' as never],
      preset: 'quick',
      target: 'isolated',
    })).toThrow('invalid')
  })

  it('pauses the active Harness and restores managed Profile bytes', async () => {
    const b = await bench()
    const manifest = join(b.home, 'profiles', 'web', 'package.json')
    const before = await readFile(manifest, 'utf8')
    const request: DiagnosticLabStartRequest = {
      scenarioIds: ['host-shadow-compatible', 'loader-duplicate'],
      preset: 'quick',
      target: 'active-profile',
    }
    const initial = b.manager.start(request)
    const final = await waitForTerminal(b.manager, initial.runId)

    expect(final.phase).toBe('completed')
    expect(final.recovery).toBe('clean')
    expect(b.suspendHarness).toHaveBeenCalledOnce()
    expect(b.resumeHarness).toHaveBeenCalledOnce()
    expect(await readFile(manifest, 'utf8')).toBe(before)
    expect(existsSync(join(b.home, 'profiles', 'web', '.diagnostic-lab', initial.runId))).toBe(false)
    expect(await readFile(join(b.root, 'logs', `${initial.runId}.txt`), 'utf8'))
      .toContain('[PASSED] round 1 / host-shadow-compatible')
  })

  it('redacts active home and credential values in failures', async () => {
    const b = await bench()
    const manager = new DiagnosticLabManager({
      root: join(b.root, 'redaction-lab'),
      activeDshHome: b.home,
      logDirectory: join(b.root, 'redaction-logs'),
      suspendHarness: async () => { throw new Error(`token=secret-value ${b.home}`) },
      resumeHarness: () => {},
      installProfile: async () => {},
      runDoctor: async () => ({ status: 'healthy', issueCodes: [], output: '{}' }),
      productionDoctorFixtures: false,
      onSnapshot: () => {},
    })
    const initial = manager.start({
      scenarioIds: ['host-shadow-compatible'],
      preset: 'quick',
      target: 'active-profile',
    })
    const final = await waitForTerminal(manager, initial.runId)
    expect(final.phase).toBe('failed')
    expect(final.diagnostic).toContain('token=[REDACTED]')
    expect(final.diagnostic).toContain('$DSH_HOME')
    expect(final.diagnostic).not.toContain('secret-value')
  })

  it('fails closed and does not resume when an external edit changes a managed Profile file', async () => {
    const b = await bench()
    const manifest = join(b.home, 'profiles', 'web', 'package.json')
    const manager = new DiagnosticLabManager({
      root: join(b.root, 'external-edit-lab'),
      activeDshHome: b.home,
      logDirectory: join(b.root, 'external-edit-logs'),
      suspendHarness: b.suspendHarness,
      resumeHarness: b.resumeHarness,
      installProfile: b.installProfile,
      runDoctor: async () => ({ status: 'healthy', issueCodes: [], output: '{}' }),
      productionDoctorFixtures: false,
      onSnapshot: (snapshot) => {
        if (snapshot.currentStep === 'inject') {
          writeFileSync(manifest, '{"external":true}\n')
        }
      },
    })
    const initial = manager.start({
      scenarioIds: ['orphaned-bundle'], preset: 'quick', target: 'active-profile',
    })
    const final = await waitForTerminal(manager, initial.runId)
    expect(final.phase).toBe('failed')
    expect(final.recovery).toBe('failed')
    expect(final.diagnostic).toContain('changed during diagnostic exercise')
    expect(b.resumeHarness).not.toHaveBeenCalled()
    expect(await readFile(join(b.root, 'external-edit-logs', `${initial.runId}.txt`), 'utf8'))
      .toContain('Recovery: failed')
  })
})
