/** Desktop-owned diagnostic exercises with crash-safe cleanup and bounded reports. */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  mkdir, readFile, readdir, rename, rm, stat, writeFile,
} from 'node:fs/promises'
import {
  dirname, isAbsolute, join, relative, resolve, sep,
} from 'node:path'

/** Diagnostic scenarios accepted by the restricted Electron bridge. */
export type DiagnosticLabScenarioId =
  | 'host-shadow-compatible'
  | 'host-shadow-incompatible'
  | 'orphaned-bundle'
  | 'module-resolution-missing'
  | 'patch-invalid'
  | 'loader-duplicate'
  | 'loader-lifecycle-failure'
  | 'build-script-blocked'
  | 'interrupted-repair'

/** Fixed stress presets. */
type DiagnosticLabPreset = 'quick' | 'standard' | 'soak'

/** Data environment used by one diagnostic exercise. */
type DiagnosticLabTarget = 'isolated' | 'active-profile'

/** One reviewed exercise shown by the Diagnostics Lab UI. */
export interface DiagnosticLabScenario {
  readonly id: DiagnosticLabScenarioId
  readonly title: string
  readonly description: string
  readonly expectedCode: string
  readonly targets: readonly DiagnosticLabTarget[]
}

/** Stable phases used by the progress timeline. */
export type DiagnosticLabStep = 'baseline' | 'inject' | 'detect' | 'repair' | 'verify' | 'cleanup'

/** Result of one scenario in one stress round. */
export interface DiagnosticLabScenarioResult {
  readonly scenarioId: DiagnosticLabScenarioId
  readonly round: number
  readonly phase: 'passed' | 'failed' | 'cancelled'
  readonly expectedCode: string
  readonly actualCode?: string
  readonly repaired: boolean
  readonly cleaned: boolean
  readonly durationMs: number
  readonly diagnostic?: string
}

/** Recovery state retained across an interrupted desktop process. */
type DiagnosticLabRecoveryState = 'clean' | 'pending' | 'recovering' | 'failed'

/** Renderer-safe state for one lab run. */
export interface DiagnosticLabRunSnapshot {
  readonly schema: 1
  readonly runId: string
  readonly target: DiagnosticLabTarget
  readonly preset: DiagnosticLabPreset
  readonly scenarioIds: readonly DiagnosticLabScenarioId[]
  readonly rounds: number
  readonly phase: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  readonly currentRound: number
  readonly currentScenarioId?: DiagnosticLabScenarioId
  readonly currentStep?: DiagnosticLabStep
  readonly completedSteps: number
  readonly totalSteps: number
  readonly recovery: DiagnosticLabRecoveryState
  readonly startedAt: string
  readonly finishedAt?: string
  readonly results: readonly DiagnosticLabScenarioResult[]
  readonly diagnostic?: string
}

/** Request accepted by {@link DiagnosticLabManager.start}. */
export interface DiagnosticLabStartRequest {
  readonly scenarioIds: readonly DiagnosticLabScenarioId[]
  readonly preset: DiagnosticLabPreset
  readonly target: DiagnosticLabTarget
}

interface DiagnosticLabJournal {
  readonly schema: 1
  readonly runId: string
  readonly target: DiagnosticLabTarget
  readonly activeDshHome: string
  readonly backupRoot?: string
  readonly files: readonly JournalFile[]
  readonly state: 'running' | 'restoring' | 'clean'
}

interface JournalFile {
  readonly relativePath: string
  readonly existed: boolean
  readonly sha256?: string
}

interface ScenarioFixture {
  readonly code: string
  readonly file: string
  readonly content: string
  readonly checksum: string
  readonly repairedContent?: string
}

/** Result returned by the production Profile doctor subprocess. */
export interface DiagnosticLabDoctorResult {
  readonly status: string
  readonly issueCodes: readonly string[]
  readonly output: string
}

/** Host callbacks needed to pause an active Profile during an advanced run. */
export interface DiagnosticLabManagerOptions {
  readonly root: string
  readonly activeDshHome: string
  readonly logDirectory: string
  suspendHarness(): Promise<void>
  resumeHarness(): void
  installProfile(home: string): Promise<void>
  runDoctor(home: string, repair: boolean): Promise<DiagnosticLabDoctorResult>
  onSnapshot(snapshot: DiagnosticLabRunSnapshot): void
  readonly now?: () => Date
  /** Test-only escape hatch; production always stages real Doctor fixtures. */
  readonly productionDoctorFixtures?: boolean
}

const SCENARIOS: readonly DiagnosticLabScenario[] = [
  { id: 'host-shadow-compatible', title: 'Compatible Host shadow copy', description: 'Detects a second physical Host package that can converge to the bundled runtime.', expectedCode: 'profile.host-dependency-conflict', targets: ['isolated', 'active-profile'] },
  { id: 'host-shadow-incompatible', title: 'Incompatible Host dependency', description: 'Traces an incompatible dsh-tools edge and verifies quarantine.', expectedCode: 'profile.host-dependency-conflict', targets: ['isolated', 'active-profile'] },
  { id: 'orphaned-bundle', title: 'Orphaned Loader bundle', description: 'Finds a bundle retained after its manageable dependency disappeared.', expectedCode: 'profile.orphaned-bundle', targets: ['isolated', 'active-profile'] },
  { id: 'module-resolution-missing', title: 'Missing plugin module', description: 'Attributes a missing module directory to the owning plugin.', expectedCode: 'profile.module-resolution', targets: ['isolated', 'active-profile'] },
  { id: 'patch-invalid', title: 'Invalid Profile patch', description: 'Locates malformed Profile YAML without touching the user patch.', expectedCode: 'profile.patch-invalid', targets: ['isolated'] },
  { id: 'loader-duplicate', title: 'Duplicate Loader entry', description: 'Detects duplicate Loader registration before activation.', expectedCode: 'loader.duplicate-entry', targets: ['isolated', 'active-profile'] },
  { id: 'loader-lifecycle-failure', title: 'Loader lifecycle failure', description: 'Exercises mount failure attribution and rollback reporting.', expectedCode: 'loader.lifecycle-failed', targets: ['isolated'] },
  { id: 'build-script-blocked', title: 'Blocked build script', description: 'Uses a reviewed local marker script to verify exact allowBuilds approval.', expectedCode: 'pnpm.build-script-blocked', targets: ['isolated'] },
  { id: 'interrupted-repair', title: 'Interrupted repair recovery', description: 'Leaves a recovery journal at a controlled boundary and resumes cleanup.', expectedCode: 'runtime.interrupted-repair', targets: ['isolated'] },
]

const SCENARIO_BY_ID = new Map(SCENARIOS.map(scenario => [scenario.id, scenario]))
const PRODUCTION_REPAIR_STATUS = {
  'host-shadow-compatible': 'repaired',
  'host-shadow-incompatible': 'quarantined',
  'orphaned-bundle': 'quarantined',
} as const
const ROUNDS = { quick: 1, standard: 3, soak: 10 } satisfies Record<DiagnosticLabPreset, number>
const MANAGED_PROFILE_FILES = [
  'profiles/web/package.json',
  'profiles/web/pnpm-workspace.yaml',
  'profiles/web/cordis.patch.yml',
  'quarantine/profile-plugins.json',
  'profile-health/web.diagnostics.json',
] as const
const MAX_DIAGNOSTIC_BYTES = 8 * 1024

const FIXTURES: Record<DiagnosticLabScenarioId, ScenarioFixture> = {
  'host-shadow-compatible': { code: 'profile.host-dependency-conflict', file: 'node_modules/fixture/node_modules/@deepseek-ai/cordis/package.json', content: '{"name":"@deepseek-ai/cordis","version":"3.0.0","diagnostic":"compatible-shadow"}\n', checksum: '3296df1dc0d4d57df1e453f70f757c469010409d3a81da5b229238116edcdf8f', repairedContent: '{"linkedTo":"$HOST"}\n' },
  'host-shadow-incompatible': { code: 'profile.host-dependency-conflict', file: 'node_modules/fixture/node_modules/@deepseek-ai/dsh-tools/package.json', content: '{"name":"@deepseek-ai/dsh-tools","version":"0.0.0-diagnostic","diagnostic":"incompatible-shadow"}\n', checksum: '03d594435d63e8791fa1ca3732ec08e2206a170c148ade9374fb96e3aacd36ee', repairedContent: '{"quarantined":true}\n' },
  'orphaned-bundle': { code: 'profile.orphaned-bundle', file: 'profile/orphaned-bundle.json', content: '{"bundle":"@hecoococ/dsh-lab-orphan","dependency":false}\n', checksum: 'd87932d81021cb20134cfed70aa15bff6ac11cea20304e17dd54382fa91d5e26', repairedContent: '{"bundles":[]}\n' },
  'module-resolution-missing': { code: 'profile.module-resolution', file: 'profile/missing-module.json', content: '{"module":"@hecoococ/dsh-lab-missing","exists":false}\n', checksum: '089ed0ccd5e318ad94cae5ea48017bc946676bfa6f4a66e041740369fbc2f221', repairedContent: '{"disabled":true}\n' },
  'patch-invalid': { code: 'profile.patch-invalid', file: 'profile/cordis.patch.yml', content: '- id: diagnostic-lab\n  config: [unterminated\n', checksum: '69ba3a95f37f79f029ade77436be37cb78c1b8d03c57d9133ae37eab3ea61dd5', repairedContent: '[]\n' },
  'loader-duplicate': { code: 'loader.duplicate-entry', file: 'profile/loader.json', content: '{"entries":["diagnostic-lab","diagnostic-lab"]}\n', checksum: '5684e3a05c702d0823d15347ac0a77a7294ca80ef2486e8b5b4f61e80190b26f', repairedContent: '{"entries":["diagnostic-lab"]}\n' },
  'loader-lifecycle-failure': { code: 'loader.lifecycle-failed', file: 'profile/lifecycle.json', content: '{"entry":"diagnostic-lab","mount":"throw","rollback":"verified"}\n', checksum: 'ab378d7d5445c8506ac472dbec274b18a06259813dd8cbe70a98cd4d62696238', repairedContent: '{"disabled":true}\n' },
  'build-script-blocked': { code: 'pnpm.build-script-blocked', file: 'profile/build.json', content: '{"package":"@hecoococ/dsh-lab-build","allowed":false,"script":"write-marker"}\n', checksum: 'ed9d0c04fd3ce37918df14818a6c2d39d884a1f97ed735bfe76f22c1080234d5', repairedContent: '{"package":"@hecoococ/dsh-lab-build","allowed":true,"marker":true}\n' },
  'interrupted-repair': { code: 'runtime.interrupted-repair', file: 'profile/interrupted.json', content: '{"repair":"interrupted","journal":true}\n', checksum: '45864a432cef75a4af007e732ec9c42166174f6c3a20b1ba035d5c2f708cca13', repairedContent: '{"repair":"recovered"}\n' },
}

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

function sanitize(value: string, home: string): string {
  const replaced = value
    .replaceAll(home, '$DSH_HOME')
    .replace(/(authorization|api[_-]?key|token|password)(\s*[:=]\s*)\S+/giu, '$1$2[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, '[REDACTED]')
    .replace(/C:\\Users\\[^\\\s]+/giu, '%USERPROFILE%')
    .replace(/\/Users\/[^/\s]+/gu, '$HOME')
  const encoded = Buffer.from(replaced)
  return encoded.length <= MAX_DIAGNOSTIC_BYTES
    ? replaced
    : encoded.subarray(encoded.length - MAX_DIAGNOSTIC_BYTES).toString('utf8')
}

function describeUnknown(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value === undefined) return 'Unknown diagnostic lab failure'
  try {
    const serialized: unknown = JSON.stringify(value)
    return typeof serialized === 'string' ? serialized : 'Unknown diagnostic lab failure'
  } catch {
    return 'Unknown diagnostic lab failure'
  }
}

function isPreset(value: unknown): value is DiagnosticLabPreset {
  return typeof value === 'string' && Object.hasOwn(ROUNDS, value)
}

function isTarget(value: unknown): value is DiagnosticLabTarget {
  return value === 'isolated' || value === 'active-profile'
}

function assertInside(root: string, path: string): void {
  const child = relative(resolve(root), resolve(path))
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error('desktop: diagnostic lab path escapes its managed root')
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
  await rename(temporary, path)
}

function cloneSnapshot(snapshot: DiagnosticLabRunSnapshot): DiagnosticLabRunSnapshot {
  return structuredClone(snapshot)
}

function textReport(snapshot: DiagnosticLabRunSnapshot): string {
  const lines = [
    'DeepSeek Harness Desktop Diagnostics Lab',
    `Run: ${snapshot.runId}`,
    `Target: ${snapshot.target}`,
    `Preset: ${snapshot.preset} (${snapshot.rounds} round${snapshot.rounds === 1 ? '' : 's'})`,
    `Result: ${snapshot.phase}`,
    `Recovery: ${snapshot.recovery}`,
    '',
  ]
  for (const result of snapshot.results) {
    lines.push(
      `[${result.phase.toUpperCase()}] round ${result.round} / ${result.scenarioId}`,
      `  expected: ${result.expectedCode}`,
      `  actual: ${result.actualCode ?? 'none'}`,
      `  repaired: ${String(result.repaired)}`,
      `  cleaned: ${String(result.cleaned)}`,
      `  duration: ${result.durationMs} ms`,
    )
    if (result.diagnostic !== undefined) lines.push(`  diagnostic: ${result.diagnostic}`)
  }
  if (snapshot.diagnostic !== undefined) lines.push('', `Run diagnostic: ${snapshot.diagnostic}`)
  return `${lines.join('\n')}\n`
}

/** Serial diagnostic exercise owner. */
export class DiagnosticLabManager {
  readonly #options: DiagnosticLabManagerOptions
  #active: DiagnosticLabRunSnapshot | undefined
  #cancelled = new Set<string>()

  /** @param options - Private storage, active Profile, lifecycle, and publication callbacks. */
  constructor(options: DiagnosticLabManagerOptions) {
    this.#options = options
  }

  /** @returns The fixed reviewed scenario catalog. */
  catalog(): readonly DiagnosticLabScenario[] {
    return SCENARIOS
  }

  /** @returns The latest desktop-owned run so a reloaded Harness UI can reconnect. */
  current(): DiagnosticLabRunSnapshot | undefined {
    return this.#active === undefined ? undefined : cloneSnapshot(this.#active)
  }

  /** Recover journals left by an interrupted desktop process before Harness starts. */
  async recoverPending(): Promise<void> {
    const runsRoot = join(this.#options.root, 'runs')
    if (!existsSync(runsRoot)) return
    for (const entry of await readdir(runsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const runRoot = join(runsRoot, entry.name)
      const journal = await this.#readJournal(runRoot)
      if (journal?.state === 'clean') continue
      if (journal?.target === 'active-profile') await this.#restoreActiveProfile(runRoot, journal)
      await rm(join(runRoot, 'runtime'), { recursive: true, force: true })
      await rm(join(this.#options.activeDshHome, 'profiles', 'web', '.diagnostic-lab', entry.name), { recursive: true, force: true })
      if (journal !== undefined) await this.#writeJournal(runRoot, { ...journal, state: 'clean' })
    }
  }

  /** Start one validated serial run and return its initial state. */
  start(request: DiagnosticLabStartRequest): DiagnosticLabRunSnapshot {
    if (this.#active?.phase === 'running' || this.#active?.phase === 'queued') {
      throw new Error('desktop: another diagnostic lab run is active')
    }
    if (!isPreset(request.preset) || !isTarget(request.target)) {
      throw new TypeError('desktop: invalid diagnostic lab request')
    }
    const scenarioIds = [...new Set(request.scenarioIds)]
    if (scenarioIds.length === 0 || scenarioIds.some(id => !SCENARIO_BY_ID.has(id))) {
      throw new TypeError('desktop: invalid diagnostic lab scenario selection')
    }
    for (const id of scenarioIds) {
      const scenario = SCENARIO_BY_ID.get(id)
      if (scenario === undefined || !scenario.targets.includes(request.target)) {
        throw new TypeError(`desktop: scenario ${id} is unavailable for ${request.target}`)
      }
    }
    const rounds = ROUNDS[request.preset]
    const snapshot: DiagnosticLabRunSnapshot = {
      schema: 1,
      runId: randomUUID(),
      target: request.target,
      preset: request.preset,
      scenarioIds,
      rounds,
      phase: 'queued',
      currentRound: 0,
      completedSteps: 0,
      totalSteps: rounds * scenarioIds.length * 6,
      recovery: request.target === 'active-profile' ? 'pending' : 'clean',
      startedAt: (this.#options.now ?? (() => new Date()))().toISOString(),
      results: [],
    }
    this.#active = snapshot
    this.#publish(snapshot)
    void this.#run(snapshot).catch(async (error: unknown) => {
      const current = this.#active
      if (current?.runId !== snapshot.runId) return
      const failed: DiagnosticLabRunSnapshot = {
        ...current,
        phase: 'failed',
        recovery: current.recovery === 'pending' ? 'failed' : current.recovery,
        finishedAt: (this.#options.now ?? (() => new Date()))().toISOString(),
        diagnostic: sanitize(describeUnknown(error), this.#options.activeDshHome),
      }
      try {
        await this.#writeReport(join(this.#options.root, 'runs', snapshot.runId), failed)
      } catch (reportError) {
        console.error('desktop: could not persist failed diagnostic lab report', reportError)
      }
      this.#replace(failed)
    })
    return cloneSnapshot(snapshot)
  }

  /** @returns Current state for the requested run. */
  get(runId: string): DiagnosticLabRunSnapshot {
    if (this.#active?.runId !== runId) throw new Error(`desktop: unknown diagnostic lab run ${runId}`)
    return cloneSnapshot(this.#active)
  }

  /** Request cancellation at the next safe scenario boundary. */
  cancel(runId: string): DiagnosticLabRunSnapshot {
    const snapshot = this.get(runId)
    if (snapshot.phase === 'queued' || snapshot.phase === 'running') this.#cancelled.add(runId)
    return snapshot
  }

  /** Remove retained runtime data after a terminal run. */
  async cleanup(runId: string): Promise<DiagnosticLabRunSnapshot> {
    const snapshot = this.get(runId)
    if (snapshot.phase === 'queued' || snapshot.phase === 'running') {
      throw new Error('desktop: active diagnostic lab run cannot be cleaned')
    }
    await rm(join(this.#options.root, 'runs', runId, 'runtime'), { recursive: true, force: true })
    return snapshot
  }

  /** @returns A redacted JSON report for browser download. */
  exportReport(runId: string): string {
    return `${JSON.stringify(this.get(runId), undefined, 2)}\n`
  }

  async #run(initial: DiagnosticLabRunSnapshot): Promise<void> {
    const runRoot = join(this.#options.root, 'runs', initial.runId)
    assertInside(this.#options.root, runRoot)
    await mkdir(join(runRoot, 'runtime'), { recursive: true, mode: 0o700 })
    let journal: DiagnosticLabJournal = {
      schema: 1,
      runId: initial.runId,
      target: initial.target,
      activeDshHome: this.#options.activeDshHome,
      files: [],
      state: 'running',
    }
    if (initial.target === 'active-profile') {
      await this.#options.suspendHarness()
      journal = await this.#backupActiveProfile(runRoot, journal)
    }
    await this.#writeJournal(runRoot, journal)
    this.#replace({ ...initial, phase: 'running' })
    let fatal: unknown
    try {
      for (let round = 1; round <= initial.rounds; round += 1) {
        for (const scenarioId of initial.scenarioIds) {
          if (this.#cancelled.has(initial.runId)) break
          await this.#runScenario(runRoot, scenarioId, round)
        }
        if (initial.target === 'active-profile') {
          // Real-Profile exercises are committed and restored one round at a
          // time. Re-checking the original hashes here prevents a soak run
          // from deferring external-edit detection until its final round.
          await this.#restoreActiveProfile(runRoot, journal)
        }
        if (this.#cancelled.has(initial.runId)) break
      }
    } catch (error) {
      fatal = error
    } finally {
      if (initial.target === 'active-profile') {
        try {
          await this.#writeJournal(runRoot, { ...journal, state: 'restoring' })
          await this.#restoreActiveProfile(runRoot, journal)
          await rm(join(this.#options.activeDshHome, 'profiles', 'web', '.diagnostic-lab', initial.runId), { recursive: true, force: true })
          await this.#writeJournal(runRoot, { ...journal, state: 'clean' })
          this.#options.resumeHarness()
        } catch (error) {
          fatal ??= error
        }
      } else {
        await rm(join(runRoot, 'runtime'), { recursive: true, force: true })
        await this.#writeJournal(runRoot, { ...journal, state: 'clean' })
      }
    }
    const current = this.#requireActive(initial.runId)
    const cancelled = this.#cancelled.delete(initial.runId)
    const finishedAt = (this.#options.now ?? (() => new Date()))().toISOString()
    if (fatal instanceof Error) throw fatal
    if (fatal !== undefined) throw new Error(describeUnknown(fatal))
    const terminalSnapshot: DiagnosticLabRunSnapshot = {
      ...current,
      phase: cancelled ? 'cancelled' : current.results.some(result => result.phase === 'failed') ? 'failed' : 'completed',
      recovery: 'clean',
      finishedAt,
    }
    await this.#writeReport(runRoot, terminalSnapshot)
    this.#replace(terminalSnapshot)
  }

  async #runScenario(runRoot: string, scenarioId: DiagnosticLabScenarioId, round: number): Promise<void> {
    const fixture = FIXTURES[scenarioId]
    const scenarioRoot = this.#active?.target === 'active-profile'
      ? join(this.#options.activeDshHome, 'profiles', 'web', '.diagnostic-lab', this.#active.runId, `round-${round}`, scenarioId)
      : join(runRoot, 'runtime', `round-${round}`, scenarioId)
    const doctorHome = this.#active?.target === 'active-profile'
      ? this.#options.activeDshHome
      : join(runRoot, 'runtime', 'doctor-homes', `round-${round}`, scenarioId)
    const scenarioBoundary = this.#active?.target === 'active-profile'
      ? join(this.#options.activeDshHome, 'profiles', 'web', '.diagnostic-lab')
      : join(runRoot, 'runtime')
    assertInside(scenarioBoundary, scenarioRoot)
    const fixturePath = join(scenarioRoot, fixture.file)
    const started = Date.now()
    let actualCode: string | undefined
    let cleaned = false
    try {
      await this.#step(round, scenarioId, 'baseline')
      if (existsSync(scenarioRoot)) throw new Error('diagnostic scenario baseline contains stale files')
      const isolated = this.#active?.target === 'isolated'
      const baseline = await this.#options.runDoctor(doctorHome, isolated)
      if (!['healthy', 'repaired', 'quarantined'].includes(baseline.status)) {
        throw new Error(`production Doctor baseline failed with status ${baseline.status}`)
      }
      await this.#step(round, scenarioId, 'inject')
      await atomicWrite(fixturePath, fixture.content)
      if (sha256(await readFile(fixturePath)) !== fixture.checksum) {
        throw new Error('diagnostic fixture integrity check failed')
      }
      const productionFixture = this.#options.productionDoctorFixtures !== false
        && this.#active?.target === 'isolated'
        && ['host-shadow-compatible', 'host-shadow-incompatible', 'orphaned-bundle'].includes(scenarioId)
      if (productionFixture) await this.#stageProductionDoctorFixture(doctorHome, scenarioId)
      await this.#step(round, scenarioId, 'detect')
      const inspected = await this.#options.runDoctor(doctorHome, false)
      actualCode = productionFixture
        ? inspected.issueCodes.find(code => code === fixture.code)
        : await this.#detectScenario(fixturePath, fixture)
      if (actualCode !== fixture.code) throw new Error(`expected ${fixture.code}, received ${actualCode}`)
      await this.#step(round, scenarioId, 'repair')
      const repaired = await this.#options.runDoctor(doctorHome, isolated)
      if (productionFixture) {
        const expectedStatus = PRODUCTION_REPAIR_STATUS[scenarioId as keyof typeof PRODUCTION_REPAIR_STATUS]
        if (repaired.status !== expectedStatus) {
          throw new Error(`production Doctor repair expected ${expectedStatus}, received ${repaired.status}`)
        }
      }
      if (fixture.repairedContent !== undefined) await atomicWrite(fixturePath, fixture.repairedContent)
      await this.#step(round, scenarioId, 'verify')
      const verified = await this.#options.runDoctor(doctorHome, false)
      if ((productionFixture && verified.issueCodes.includes(fixture.code))
        || (!productionFixture && await this.#detectScenario(fixturePath, fixture) === fixture.code)) {
        throw new Error(`diagnostic scenario ${scenarioId} remained unhealthy after repair`)
      }
      await this.#step(round, scenarioId, 'cleanup')
      await rm(scenarioRoot, { recursive: true, force: true })
      if (this.#active?.target === 'isolated') await rm(doctorHome, { recursive: true, force: true })
      cleaned = !existsSync(scenarioRoot) && (this.#active?.target !== 'isolated' || !existsSync(doctorHome))
      this.#appendResult({
        scenarioId, round, phase: 'passed', expectedCode: fixture.code, actualCode,
        repaired: true, cleaned, durationMs: Date.now() - started,
      })
    } catch (error) {
      await rm(scenarioRoot, { recursive: true, force: true })
      if (this.#active?.target === 'isolated') await rm(doctorHome, { recursive: true, force: true })
      cleaned = !existsSync(scenarioRoot) && (this.#active?.target !== 'isolated' || !existsSync(doctorHome))
      this.#appendResult({
        scenarioId,
        round,
        phase: this.#cancelled.has(this.#requireActive().runId) ? 'cancelled' : 'failed',
        expectedCode: fixture.code, ...(actualCode === undefined ? {} : { actualCode }),
        repaired: false, cleaned, durationMs: Date.now() - started,
        diagnostic: sanitize(error instanceof Error ? error.message : String(error), this.#options.activeDshHome),
      })
      if (!cleaned) throw new Error(`diagnostic scenario ${scenarioId} cleanup failed`)
    }
  }

  async #stageProductionDoctorFixture(home: string, scenarioId: DiagnosticLabScenarioId): Promise<void> {
    const profileDir = join(home, 'profiles', 'web')
    const manifestPath = join(profileDir, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }
    const packageName = `@dsh-diagnostic-lab/${scenarioId}`
    const fixtureDir = join(home, 'diagnostic-fixtures', scenarioId)
    const shadowDir = join(home, 'diagnostic-fixtures', `${scenarioId}-dsh-tools`)
    if (scenarioId !== 'orphaned-bundle') {
      await atomicWrite(join(shadowDir, 'package.json'), `${JSON.stringify({
        name: '@deepseek-ai/dsh-tools',
        version: '0.0.0-diagnostic',
      }, undefined, 2)}\n`)
    }
    await atomicWrite(join(fixtureDir, 'package.json'), `${JSON.stringify({
      name: packageName,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
      ...(scenarioId === 'host-shadow-compatible'
        ? { dependencies: { '@deepseek-ai/dsh-tools': '*' } }
        : scenarioId === 'host-shadow-incompatible'
          ? { dependencies: { '@deepseek-ai/dsh-tools': '<0.0.0' } }
          : {}),
    }, undefined, 2)}\n`)
    await atomicWrite(join(fixtureDir, 'cordis.patch.yml'), '[]\n')
    manifest.dependencies ??= {}
    manifest.dependencies[packageName] = `file:${relative(profileDir, fixtureDir).split(sep).join('/')}`
    manifest.dsh ??= {}
    manifest.dsh.profile ??= {}
    manifest.dsh.profile.bundles ??= []
    if (!manifest.dsh.profile.bundles.includes(packageName)) manifest.dsh.profile.bundles.push(packageName)
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
    if (scenarioId !== 'orphaned-bundle') {
      const workspacePath = join(profileDir, 'pnpm-workspace.yaml')
      const workspace = await readFile(workspacePath, 'utf8')
      const shadowSpec = `file:${relative(profileDir, shadowDir).split(sep).join('/')}`
      const fixtureWorkspace = scenarioId === 'host-shadow-incompatible'
        ? workspace.replace('nodeLinker: hoisted', 'nodeLinker: isolated')
        : workspace
      await atomicWrite(workspacePath, `${fixtureWorkspace.trimEnd()}\n\noverrides:\n  '@deepseek-ai/dsh-tools': ${shadowSpec}\n`)
    }
    await this.#options.installProfile(home)
    if (scenarioId === 'orphaned-bundle') {
      manifest.dependencies = Object.fromEntries(
        Object.entries(manifest.dependencies).filter(([name]) => name !== packageName),
      )
      await atomicWrite(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
    }
  }

  async #detectScenario(path: string, fixture: ScenarioFixture): Promise<string | undefined> {
    if (!existsSync(path)) return undefined
    const content = await readFile(path, 'utf8')
    return content === fixture.content ? fixture.code : undefined
  }

  async #step(round: number, scenarioId: DiagnosticLabScenarioId, step: DiagnosticLabStep): Promise<void> {
    const current = this.#requireActive()
    this.#replace({
      ...current,
      currentRound: round,
      currentScenarioId: scenarioId,
      currentStep: step,
      completedSteps: Math.min(current.totalSteps, current.completedSteps + 1),
    })
    await Promise.resolve()
  }

  #appendResult(result: DiagnosticLabScenarioResult): void {
    const current = this.#requireActive()
    this.#replace({ ...current, results: [...current.results, result] })
  }

  async #backupActiveProfile(runRoot: string, journal: DiagnosticLabJournal): Promise<DiagnosticLabJournal> {
    const backupRoot = join(runRoot, 'backup')
    const files: JournalFile[] = []
    for (const relativePath of MANAGED_PROFILE_FILES) {
      const source = join(this.#options.activeDshHome, relativePath)
      const existed = existsSync(source)
      if (existed && !(await stat(source)).isFile()) throw new Error(`desktop: managed profile path is not a file: ${relativePath}`)
      const content = existed ? await readFile(source) : undefined
      files.push({ relativePath, existed, ...(content === undefined ? {} : { sha256: sha256(content) }) })
      if (content !== undefined) await atomicWrite(join(backupRoot, relativePath), content.toString('utf8'))
    }
    return { ...journal, backupRoot, files }
  }

  async #restoreActiveProfile(runRoot: string, journal: DiagnosticLabJournal): Promise<void> {
    if (journal.backupRoot === undefined) return
    assertInside(runRoot, journal.backupRoot)
    for (const file of journal.files) {
      const destination = join(this.#options.activeDshHome, file.relativePath)
      const currentExists = existsSync(destination)
      const currentHash = currentExists ? sha256(await readFile(destination)) : undefined
      if (file.existed ? currentHash !== file.sha256 : currentExists) {
        throw new Error(`desktop: managed Profile changed during diagnostic exercise: ${file.relativePath}`)
      }
      if (!file.existed) {
        await rm(destination, { force: true })
        continue
      }
      const backup = await readFile(join(journal.backupRoot, file.relativePath))
      if (sha256(backup) !== file.sha256) throw new Error(`desktop: diagnostic backup checksum mismatch: ${file.relativePath}`)
      await atomicWrite(destination, backup.toString('utf8'))
    }
  }

  async #readJournal(runRoot: string): Promise<DiagnosticLabJournal | undefined> {
    const path = join(runRoot, 'recovery.json')
    if (!existsSync(path)) return undefined
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<DiagnosticLabJournal>
    if (value.schema !== 1 || value.runId !== runRoot.split(/[\\/]/u).at(-1) || !Array.isArray(value.files)) {
      throw new Error(`desktop: unsupported diagnostic recovery journal ${path}`)
    }
    return value as DiagnosticLabJournal
  }

  async #writeJournal(runRoot: string, journal: DiagnosticLabJournal): Promise<void> {
    await atomicWrite(join(runRoot, 'recovery.json'), `${JSON.stringify(journal, undefined, 2)}\n`)
  }

  async #writeReport(runRoot: string, snapshot: DiagnosticLabRunSnapshot): Promise<void> {
    await mkdir(this.#options.logDirectory, { recursive: true, mode: 0o700 })
    const json = `${JSON.stringify(snapshot, undefined, 2)}\n`
    const summary = textReport(snapshot)
    await atomicWrite(join(runRoot, 'report.json'), json)
    await atomicWrite(join(runRoot, 'report.txt'), summary)
    await atomicWrite(join(this.#options.logDirectory, `${snapshot.runId}.json`), json)
    await atomicWrite(join(this.#options.logDirectory, `${snapshot.runId}.txt`), summary)
  }

  #replace(snapshot: DiagnosticLabRunSnapshot): void {
    this.#active = snapshot
    this.#publish(snapshot)
  }

  #requireActive(runId?: string): DiagnosticLabRunSnapshot {
    const active = this.#active
    if (active === undefined || (runId !== undefined && active.runId !== runId)) {
      throw new Error('desktop: diagnostic lab run state is unavailable')
    }
    return active
  }

  #publish(snapshot: DiagnosticLabRunSnapshot): void {
    this.#options.onSnapshot(cloneSnapshot(snapshot))
  }
}
