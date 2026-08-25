/** One-time, removable installation of plugins shipped with the desktop app. */

import { createHash } from 'node:crypto'
import { appendFile, copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export interface BundledPluginManifestEntry {
  readonly seedId: string
  readonly packageName: string
  readonly version: string
  readonly profile: string
  readonly installPolicy: 'startup' | 'manual'
  /** Exact npm or Git spec used first so ordinary installs remain updateable. */
  readonly registrySpec?: string
  /** Reviewed registry packages whose lifecycle scripts this bundled entry requires. */
  readonly approvedBuilds?: readonly string[]
  readonly archive: string
  readonly integrity: string
}

export interface SeedBundledPluginOptions {
  readonly entry: BundledPluginManifestEntry
  readonly resourcesDirectory: string
  readonly dshHome: string
  readonly install: (archivePath: string, entry: BundledPluginManifestEntry) => Promise<void>
  /** Merge reviewed lifecycle approvals before adopting or installing a dependency. */
  readonly prepare?: (entry: BundledPluginManifestEntry) => Promise<void>
  /** Explicit UI installs may replace a tombstone left by an earlier uninstall. */
  readonly force?: boolean
  /** Development migration for schema-1 markers produced before DSH_HOME reached the installer. */
  readonly repairLegacyMarker?: boolean
  /** Milestone updates for a desktop-owned progress surface. */
  readonly onProgress?: (progress: BundledPluginSeedProgress) => void
}

export type SeedBundledPluginResult = 'installed' | 'already-seeded' | 'already-installed'

/** Coarse installation milestones that remain truthful across package-manager implementations. */
export type BundledPluginSeedStage = 'verifying' | 'extracting' | 'configuring'

/** Point-in-time milestone emitted while one bundled plugin is being prepared. */
export interface BundledPluginSeedProgress {
  readonly stage: BundledPluginSeedStage
  readonly progress: number
}

/**
 * Persist a preset installation failure before the Harness supervisor starts.
 * @param logPath - Desktop Harness log path.
 * @param error - Installation failure to render.
 * @returns Completion after the diagnostic is durable.
 */
export async function appendBundledPluginFailure(logPath: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  await mkdir(dirname(logPath), { recursive: true })
  await appendFile(logPath, `[bundled-plugin] ${message}\n`)
}

/** Reject malformed packaged metadata before it can become an install allowlist. */
export function assertBundledPluginManifestEntry(entry: unknown): asserts entry is BundledPluginManifestEntry {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new TypeError('desktop: invalid bundled plugin manifest entry')
  }
  const candidate = entry as Record<string, unknown>
  const approvedBuilds = candidate.approvedBuilds
  const seedLabel = typeof candidate.seedId === 'string' ? candidate.seedId : '<unknown>'
  if (typeof candidate.seedId !== 'string'
    || !/^[a-z0-9][a-z0-9._-]*$/iu.test(candidate.seedId)
    || typeof candidate.packageName !== 'string'
    || !/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/iu.test(candidate.packageName)
    || typeof candidate.profile !== 'string'
    || !/^[a-z0-9][a-z0-9._-]*$/iu.test(candidate.profile)
    || typeof candidate.version !== 'string'
    || !/^[a-z0-9][a-z0-9.+-]*$/iu.test(candidate.version)
    || typeof candidate.archive !== 'string'
    || basename(candidate.archive) !== candidate.archive
    || (candidate.installPolicy !== 'startup' && candidate.installPolicy !== 'manual')
    || (candidate.registrySpec !== undefined && (
      typeof candidate.registrySpec !== 'string'
      || !/^\S+$/u.test(candidate.registrySpec)
      || candidate.registrySpec.length > 512
    ))
    || (approvedBuilds !== undefined && (
      !Array.isArray(approvedBuilds)
      || approvedBuilds.length > 16
      || new Set(approvedBuilds).size !== approvedBuilds.length
      || approvedBuilds.some(packageName => (
        typeof packageName !== 'string'
        || !/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/iu.test(packageName)
      ))
    ))
    || typeof candidate.integrity !== 'string'
    || !candidate.integrity.startsWith('sha512-')) {
    throw new TypeError(`desktop: invalid bundled plugin manifest entry ${seedLabel}`)
  }
}

function githubRepositoryIdentity(spec: string | undefined): string | undefined {
  if (spec === undefined) return undefined
  const normalized = spec.trim().replace(/^git\+/u, '')
  const shorthand = /^github:(?<repository>[^#]+)(?:#(?<fragment>.*))?$/iu.exec(normalized)
  const url = /^(?:https?|git|ssh):\/\/(?:git@)?github\.com[/:](?<repository>[^#]+)(?:#(?<fragment>.*))?$/iu.exec(normalized)
    ?? /^git@github\.com:(?<repository>[^#]+)(?:#(?<fragment>.*))?$/iu.exec(normalized)
  const match = shorthand ?? url
  const repository = match?.groups?.repository?.replace(/\.git$/iu, '').replace(/^\/+|\/+$/gu, '')
  if (repository === undefined || repository.split('/').length !== 2) return undefined
  const path = /(?:^|&)path:\/?(?<path>[^&]+)(?:&|$)/u.exec(match?.groups?.fragment ?? '')?.groups?.path
  return `github:${repository.toLowerCase()}${path === undefined ? '' : `#path:${path.replace(/\/+$/gu, '').toLowerCase()}`}`
}

function dependencyMatchesBundledEntry(
  dependencyName: string,
  dependencySpec: unknown,
  entry: BundledPluginManifestEntry,
): boolean {
  if (dependencyName === entry.packageName) return true
  if (typeof dependencySpec !== 'string') return false
  if (dependencySpec.startsWith(`npm:${entry.packageName}@`)) return true
  const expectedRepository = githubRepositoryIdentity(entry.registrySpec)
  return expectedRepository !== undefined && githubRepositoryIdentity(dependencySpec) === expectedRepository
}

async function hasDependency(packagePath: string, entry: BundledPluginManifestEntry): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(packagePath, 'utf8')) as {
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
    }
    return Object.entries({ ...manifest.devDependencies, ...manifest.dependencies })
      .some(([dependencyName, dependencySpec]) => (
        dependencyMatchesBundledEntry(dependencyName, dependencySpec, entry)
      ))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return false
    throw error
  }
}

async function markerExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function seedMarkerSchema(path: string): Promise<number | undefined> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as { schema?: unknown }
    return typeof value.schema === 'number' ? value.schema : 0
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    return 0
  }
}

/**
 * Check the durable uninstall-aware seed marker for one packaged entry.
 * @param dshHome - Harness home directory that owns bundled-plugin state.
 * @param entry - Exact allowlisted packaged plugin.
 * @returns Whether startup or a prior deferred install has already handled the entry.
 */
export async function hasBundledPluginSeedMarker(
  dshHome: string,
  entry: BundledPluginManifestEntry,
): Promise<boolean> {
  assertBundledPluginManifestEntry(entry)
  return markerExists(join(dshHome, 'bundled-plugins', `${entry.seedId}.seeded.json`))
}

/**
 * Detect the development-only legacy marker format that may have been written
 * even though the plugin command targeted a different Harness home.
 * @param dshHome - Harness home directory that owns bundled-plugin state.
 * @param entry - Exact allowlisted packaged plugin.
 * @returns Whether an existing marker predates schema 2.
 */
export async function hasLegacyBundledPluginSeedMarker(
  dshHome: string,
  entry: BundledPluginManifestEntry,
): Promise<boolean> {
  assertBundledPluginManifestEntry(entry)
  const schema = await seedMarkerSchema(join(dshHome, 'bundled-plugins', `${entry.seedId}.seeded.json`))
  return schema !== undefined && schema < 2
}

/**
 * Check whether dependency health deliberately removed this plugin from the active profile.
 * A deferred installer must not undo quarantine automatically; an explicit user install may.
 *
 * @param dshHome - Harness home directory that owns quarantine state.
 * @param entry - allowlisted packaged plugin being considered for deferred installation.
 * @returns Whether a matching durable quarantine record exists.
 */
export async function hasBundledPluginQuarantineRecord(
  dshHome: string,
  entry: BundledPluginManifestEntry,
): Promise<boolean> {
  assertBundledPluginManifestEntry(entry)
  try {
    const parsed = JSON.parse(await readFile(join(dshHome, 'quarantine', 'profile-plugins.json'), 'utf8')) as {
      plugins?: Array<{ profile?: unknown; packageName?: unknown }>
    }
    return Array.isArray(parsed.plugins) && parsed.plugins.some(record => (
      record.profile === entry.profile && record.packageName === entry.packageName
    ))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function writeMarker(path: string, entry: BundledPluginManifestEntry): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify({
    schema: 2,
    seedId: entry.seedId,
    packageName: entry.packageName,
    version: entry.version,
    seededAt: new Date().toISOString(),
  }, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, path)
}

/** Seed once. The durable marker intentionally survives a later user uninstall. */
export async function seedBundledPlugin(options: SeedBundledPluginOptions): Promise<SeedBundledPluginResult> {
  const {
    entry, resourcesDirectory, dshHome, install, prepare,
    force = false, repairLegacyMarker = false, onProgress,
  } = options
  assertBundledPluginManifestEntry(entry)
  const stateDirectory = join(dshHome, 'bundled-plugins')
  const markerPath = join(stateDirectory, `${entry.seedId}.seeded.json`)
  const dependencyPresent = await hasDependency(
    join(dshHome, 'profiles', entry.profile, 'package.json'),
    entry,
  )
  if (!force) {
    const markerSchema = await seedMarkerSchema(markerPath)
    if (markerSchema !== undefined) {
      if (!repairLegacyMarker || markerSchema >= 2 || dependencyPresent) {
        if (dependencyPresent) await prepare?.(entry)
        return 'already-seeded'
      }
      await unlink(markerPath)
    }
  }

  if (dependencyPresent) {
    await prepare?.(entry)
    onProgress?.({ stage: 'configuring', progress: 90 })
    await writeMarker(markerPath, entry)
    onProgress?.({ stage: 'configuring', progress: 100 })
    return 'already-installed'
  }

  onProgress?.({ stage: 'verifying', progress: 8 })
  const source = join(resourcesDirectory, entry.archive)
  const bytes = await readFile(source)
  const actualIntegrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  if (actualIntegrity !== entry.integrity) {
    throw new Error(`desktop: bundled plugin integrity mismatch for ${entry.packageName}`)
  }
  await mkdir(stateDirectory, { recursive: true })
  const stableArchive = join(stateDirectory, entry.archive)
  await copyFile(source, stableArchive)
  await prepare?.(entry)
  onProgress?.({ stage: 'extracting', progress: 46 })
  await install(stableArchive, entry)
  onProgress?.({ stage: 'configuring', progress: 90 })
  await writeMarker(markerPath, entry)
  onProgress?.({ stage: 'configuring', progress: 100 })
  return 'installed'
}
