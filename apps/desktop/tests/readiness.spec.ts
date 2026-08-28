import { describe, expect, it } from 'vitest'
import { LineBuffer, parseHarnessReadyLine } from '../src/readiness.ts'

describe('desktop Harness readiness', () => {
  it('accepts only the canonical loopback readiness line', () => {
    expect(parseHarnessReadyLine('dsh web: http://127.0.0.1:49152')).toBe('http://127.0.0.1:49152')
    expect(parseHarnessReadyLine('dsh web: http://127.0.0.1:49152/?token=abc_DEF-123'))
      .toBe('http://127.0.0.1:49152/?token=abc_DEF-123')
    expect(parseHarnessReadyLine('dsh web: http://127.0.0.1:49152 (LAN: http://192.168.1.4:49152)'))
      .toBe('http://127.0.0.1:49152')
    expect(parseHarnessReadyLine('dsh web: http://example.com:49152')).toBeUndefined()
    expect(parseHarnessReadyLine('dsh web: http://127.0.0.1:49152/?token=abc&redirect=https://example.com'))
      .toBeUndefined()
  })

  it('reassembles readiness split across process chunks', () => {
    const lines = new LineBuffer()
    expect(lines.push('dsh web: http://127.')).toEqual([])
    expect(lines.push('0.0.1:41000\nnext')).toEqual(['dsh web: http://127.0.0.1:41000'])
    expect(lines.flush()).toBe('next')
    expect(lines.flush()).toBeUndefined()
  })
})
