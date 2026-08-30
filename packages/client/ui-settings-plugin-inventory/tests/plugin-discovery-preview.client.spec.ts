import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPluginDiscoveryCatalog,
  PLUGIN_DISCOVERY_CACHE_KEY,
  PLUGIN_DISCOVERY_CACHE_TTL_MS,
  PLUGIN_DISCOVERY_POPULAR,
  readPluginDiscoveryCache,
  resetPluginDiscoveryMemoryCache,
  selectPluginDiscoveryItems,
  writePluginDiscoveryCache,
  type MarketRegistryPlugin,
  type MarketRegistrySnapshot,
} from '../src/client/plugin-discovery-preview.ts'

const plugin = (name: string, downloads: number, stars: number, extra: Partial<MarketRegistryPlugin> = {}): MarketRegistryPlugin => ({
  name,
  owner: `owner-${name}`,
  url: `https://github.com/owner/${name}`,
  npm: name,
  category: 'tools',
  description: { en: name },
  downloads,
  stars,
  install: `dsh plugin --profile web add ${name}`,
  ...extra,
})

function memoryStorage(initial?: string): Storage {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(PLUGIN_DISCOVERY_CACHE_KEY, initial)
  return {
    get length() { return values.size },
    clear: () => { values.clear() },
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('desktop plugin discovery catalog', () => {
  beforeEach(() => { resetPluginDiscoveryMemoryCache() })

  it('ranks once into popular and non-empty market categories', () => {
    const registry: MarketRegistrySnapshot = {
      updated: '2026-08-30',
      categories: { tools: { en: 'Tools' }, ui: { en: 'UI' }, empty: { en: 'Empty' } },
      plugins: [
        plugin('dshmarket', 999, 999, { name: 'dsh-market', npm: 'dshmarket' }),
        plugin('deprecated', 900, 1, { deprecated: true }),
        plugin('missing-source', 800, 1, { install: '' }),
        plugin('alpha', 700, 10, { category: ['tools', 'ui'] }),
        plugin('beta', 600, 20, { category: 'tools' }),
        plugin('gamma', 500, 30, { category: 'ui' }),
        plugin('delta', 400, 40, { category: 'tools' }),
        plugin('epsilon', 300, 50, { category: 'tools' }),
        plugin('sixth', 200, 60, { category: 'tools' }),
      ],
    }
    const originalOrder = registry.plugins.map(entry => entry.name)
    const catalog = buildPluginDiscoveryCatalog(registry, 100)

    expect(catalog.schema).toBe('desktop-plugin-discovery-cache/v1')
    expect(catalog.categories.map(entry => entry.id)).toEqual(['tools', 'ui'])
    expect(registry.plugins.map(entry => entry.name)).toEqual(originalOrder)
    expect(catalog.items[catalog.rankings[PLUGIN_DISCOVERY_POPULAR]?.[0] ?? '']?.installSpec).toBe('alpha')
    expect(selectPluginDiscoveryItems(catalog, PLUGIN_DISCOVERY_POPULAR, { installed: {} }).map(item => item.name))
      .toEqual(['alpha', 'beta', 'gamma', 'delta'])
    expect(selectPluginDiscoveryItems(catalog, 'tools', { installed: {} }).map(item => item.name))
      .toEqual(['alpha', 'beta', 'delta', 'epsilon'])
    expect(selectPluginDiscoveryItems(catalog, 'ui', { installed: {} }).map(item => item.name))
      .toEqual(['alpha', 'gamma'])
  })

  it('uses repository evidence before ambiguous names and reports restart state', () => {
    const first = plugin('same-name', 10, 1, { url: 'https://github.com/one/project' })
    const second = plugin('same-name', 9, 1, { url: 'https://github.com/two/project' })
    const catalog = buildPluginDiscoveryCatalog({
      updated: '2026-08-30', categories: { tools: { en: 'Tools' } }, plugins: [first, second],
    })
    const items = selectPluginDiscoveryItems(catalog, PLUGIN_DISCOVERY_POPULAR, {
      installed: { localAlias: 'file:/tmp/plugin.tgz' },
      repoIdentities: { localAlias: ['two/project'] },
      activation: { localAlias: { state: 'restart' } },
    })

    expect(items[0]?.state).toBe('uninstalled')
    expect(items[1]).toMatchObject({ packageName: 'localAlias', state: 'restart' })
  })

  it('does not misreport installation when the local snapshot failed', () => {
    const catalog = buildPluginDiscoveryCatalog({
      updated: '2026-08-30', categories: { tools: { en: 'Tools' } }, plugins: [plugin('alpha', 1, 1)],
    })
    expect(selectPluginDiscoveryItems(catalog, PLUGIN_DISCOVERY_POPULAR, null)[0]?.state).toBe('unknown')
  })

  it('keeps entries without an npm package market-only', () => {
    const catalog = buildPluginDiscoveryCatalog({
      updated: '2026-08-30',
      categories: { tools: { en: 'Tools' } },
      plugins: [plugin('source-only', 1, 1, { npm: null, install: 'dsh plugin --profile web add github:owner/source-only' })],
    })
    expect(selectPluginDiscoveryItems(catalog, PLUGIN_DISCOVERY_POPULAR, { installed: {} })[0]?.installSpec).toBeNull()
  })

  it('treats the exact 24-hour boundary as stale', () => {
    const storage = memoryStorage()
    const catalog = buildPluginDiscoveryCatalog({
      updated: '2026-08-30', categories: { tools: { en: 'Tools' } }, plugins: [plugin('alpha', 1, 1)],
    }, 1_000)
    writePluginDiscoveryCache(catalog, storage)

    expect(readPluginDiscoveryCache(1_000 + PLUGIN_DISCOVERY_CACHE_TTL_MS - 1, storage)?.stale).toBe(false)
    expect(readPluginDiscoveryCache(1_000 + PLUGIN_DISCOVERY_CACHE_TTL_MS, storage)?.stale).toBe(true)
  })

  it('drops malformed persistent data without losing a valid process cache', () => {
    const storage = memoryStorage('{broken')
    expect(readPluginDiscoveryCache(1, storage)).toBeNull()
    expect(storage.getItem(PLUGIN_DISCOVERY_CACHE_KEY)).toBeNull()

    const catalog = buildPluginDiscoveryCatalog({
      updated: '2026-08-30', categories: { tools: { en: 'Tools' } }, plugins: [plugin('alpha', 1, 1)],
    }, 10)
    writePluginDiscoveryCache(catalog, null)
    const failingStorage = {
      getItem: vi.fn(() => null), removeItem: vi.fn(), setItem: vi.fn(() => { throw new Error('quota') }),
    }
    writePluginDiscoveryCache(catalog, failingStorage)
    expect(readPluginDiscoveryCache(11, null)?.catalog.updated).toBe('2026-08-30')
  })
})
