import { describe, expect, it, vi } from 'vitest'
import {
  CODEX_PROXY_TARGET,
  parseResolvedSystemProxy,
  resolveSystemProxyEnvironment,
} from '../src/system-proxy.ts'

describe('desktop system proxy', () => {
  it('parses Chromium proxy routes without accepting credentials or unsupported routes', () => {
    expect(parseResolvedSystemProxy('PROXY 127.0.0.1:7890; DIRECT')).toBe('http://127.0.0.1:7890/')
    expect(parseResolvedSystemProxy('HTTPS proxy.example:8443')).toBe('https://proxy.example:8443/')
    expect(parseResolvedSystemProxy('SOCKS5 [::1]:1080')).toBe('socks5://[::1]:1080')
    expect(parseResolvedSystemProxy('QUIC proxy.example:443; DIRECT')).toBeUndefined()
    expect(parseResolvedSystemProxy('PROXY user:secret@proxy.example:8080')).toBeUndefined()
    expect(parseResolvedSystemProxy('DIRECT')).toBeUndefined()
  })

  it('adds the resolved route and loopback bypasses for managed child processes', async () => {
    const resolveProxy = vi.fn(async () => 'PROXY 127.0.0.1:7890; DIRECT')
    const result = await resolveSystemProxyEnvironment({
      PATH: '/usr/bin',
      NO_PROXY: 'internal.example,localhost',
    }, resolveProxy)

    expect(resolveProxy).toHaveBeenCalledWith(CODEX_PROXY_TARGET)
    expect(result).toEqual({
      applied: true,
      environment: {
        PATH: '/usr/bin',
        HTTP_PROXY: 'http://127.0.0.1:7890/',
        HTTPS_PROXY: 'http://127.0.0.1:7890/',
        NO_PROXY: 'internal.example,localhost,127.0.0.1,::1',
      },
    })
  })

  it('preserves explicit proxy environment entries without consulting Electron', async () => {
    const resolveProxy = vi.fn(async () => 'PROXY system.example:8080')
    const result = await resolveSystemProxyEnvironment({
      https_proxy: 'http://explicit.example:3128',
    }, resolveProxy)

    expect(resolveProxy).not.toHaveBeenCalled()
    expect(result).toEqual({
      applied: false,
      environment: { https_proxy: 'http://explicit.example:3128' },
    })
  })

  it('keeps direct system routes unchanged', async () => {
    const result = await resolveSystemProxyEnvironment(
      { PATH: '/usr/bin' },
      async () => 'DIRECT',
    )
    expect(result).toEqual({ applied: false, environment: { PATH: '/usr/bin' } })
  })
})
