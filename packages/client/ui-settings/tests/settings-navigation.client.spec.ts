import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNavigation } from '../src/client/settings-navigation.ts'

describe('SettingsNavigation', () => {
  it('publishes ordered requests and stops notifying disposed subscribers', () => {
    const navigation = new SettingsNavigation(new Context())
    const listener = vi.fn()
    const dispose = navigation.subscribe(listener)

    navigation.open({ sectionId: 'market', subsectionId: 'discover:plugin-a' })
    expect(navigation.getSnapshot()).toEqual({
      sectionId: 'market',
      subsectionId: 'discover:plugin-a',
      revision: 1,
    })
    expect(listener).toHaveBeenCalledOnce()

    dispose()
    navigation.open({ sectionId: 'plugins' })
    expect(navigation.getSnapshot()).toEqual({ sectionId: 'plugins', revision: 2 })
    expect(listener).toHaveBeenCalledOnce()
  })
})
