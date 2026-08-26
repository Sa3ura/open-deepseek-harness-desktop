import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDesktopChatBackgroundStore, parseDesktopChatBackground } from '../src/chat-background-store.ts'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('desktop chat background store', () => {
  it('persists a custom image across store instances', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-background-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'chat-background.json')
    const background = { id: 'custom', url: 'data:image/webp;base64,AAAA' }
    createDesktopChatBackgroundStore(path).write(background)

    expect(createDesktopChatBackgroundStore(path).read()).toEqual(background)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(background)
  })

  it('stores built-in selections without renderer-provided URLs', () => {
    expect(parseDesktopChatBackground({ id: 'moon-whale', url: 'file:///private/image' })).toEqual({
      id: 'moon-whale',
    })
  })

  it('rejects arbitrary custom URLs and reports damaged disk data', () => {
    expect(() => parseDesktopChatBackground({ id: 'custom', url: 'https://example.com/image' })).toThrow(
      'invalid custom chat background',
    )
    const directory = mkdtempSync(join(tmpdir(), 'dsh-background-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'chat-background.json')
    const report = vi.fn()
    const store = createDesktopChatBackgroundStore(path, report)
    writeFileSync(path, '{broken', 'utf8')
    expect(store.read()).toBeUndefined()
    expect(report).toHaveBeenCalledOnce()
  })
})
