// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  ChatSnapshot, ConversationNode, TranscriptViewMode, UserMessageNode,
} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type React from 'react'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { createChatStore } from '../src/client/stores.ts'
import { SystemPromptNodeView } from '../src/client/chat/SystemPromptRow.tsx'
import { disclosureShare } from './disclosure-store-fixture.client.ts'
import { ChatView } from '../src/client/chat/ChatView.tsx'
import { CHAT_VIRTUALIZATION_THRESHOLD } from '../src/client/chat/use-chat-virtualizer.ts'
import { chatSnapshotFixture } from './chat-snapshot-fixture.client.ts'
import { zh } from '../src/client/locale.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
// jsdom has no layout: TanStack reads the scrollport rect and row heights off
// offsetWidth/offsetHeight. Deterministic stubs — a 600px scrollport and 72px
// flow rows — keep the virtual window arithmetic exact in these specs.
const REAL_OFFSET_HEIGHT = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement): number {
    if (typeof this.hasAttribute === 'function') {
      if (this.hasAttribute('data-chat-flow-key')) return 72
      if (this.querySelector(':scope > [data-chat-flow]') !== null) return 600
    }
    return REAL_OFFSET_HEIGHT?.get?.call(this) ?? 0
  },
})

beforeEach(() => {
  localStorage.clear()
})

const SID = 's1' as SessionId
// Stable identity: the projection hook's snapshot must not move per call.
const EMPTY_TURN_OUTLINE: readonly never[] = []

function userNode(seq: number, turn: number): UserMessageNode {
  return {
    kind: 'user',
    seq,
    time: seq * 1_000,
    turn,
    content: [{ type: 'text', text: `reader message ${String(turn)}` }],
    source: { kind: 'user' },
  } as UserMessageNode
}

const TURNS = 80

/**
 * A loaded flow of `TURNS` turns with two visible rows each (above the
 * virtualization threshold), plus one expanded-choice system prompt row at the
 * head for the disclosure-persistence case.
 */
function longSnapshot(): ChatSnapshot {
  const users: UserMessageNode[] = []
  const assistants: ConversationNode[] = []
  for (let turn = 0; turn < TURNS; turn++) {
    users.push(userNode(turn * 2, turn))
    assistants.push({
      kind: 'assistant',
      seq: turn * 2 + 1,
      time: turn * 2_000 + 500,
      turn,
      step: 0,
      messageId: `m${String(turn)}` as never,
      blocks: [{ kind: 'text', text: `assistant answer ${String(turn)}` }],
    } as ConversationNode)
  }
  const headPrompt: ConversationNode = {
    kind: 'system-prompt',
    seq: -1,
    time: 0,
    turn: 0,
    text: 'First prompt row',
  } as never
  return chatSnapshotFixture({
    nodes: [headPrompt, ...users, ...assistants],
  })
}

function shortSnapshot(): ChatSnapshot {
  return chatSnapshotFixture({
    nodes: Array.from({ length: 8 }, (_, index) => userNode(index, 0)),
  })
}

// Stub sources must return referentially stable snapshots: uSES re-renders
// whenever getSnapshot() moves.
const STUB_SESSION = {
  sessionId: SID,
  running: false,
  openState: 'open',
  openError: null,
  hasMore: false,
  loadingOlder: false,
  pendingSubmissions: [],
  queue: [],
  blank: false,
}
const STUB_SESSIONS = { byId: { [SID]: { cwd: '/ws', blank: false } } }
const STUB_PENDING_INTERACTION = new Map()
const STUB_WORKSPACES = { items: [], phase: 'ready' }
const STUB_INPUT = { draft: '' }

function bindKeyedSnapshotSelector<Value>(
  resolve: (key: string) => { subscribe: (listener: () => void) => () => void; getSnapshot: () => Value },
): (key: string, selector?: (value: Value) => unknown) => unknown {
  const hooks = new Map<string, SnapshotSelectorHook<Value>>()
  return (key, selector) => {
    let useValue = hooks.get(key)
    if (useValue === undefined) {
      useValue = bindSnapshotSelector(resolve(key))
      hooks.set(key, useValue)
    }
    return useValue(selector ?? ((value: Value) => value))
  }
}

function sessionHarness(snapshot: ChatSnapshot): React.ComponentProps<typeof ChatView> {
  const chat = createChatStore().create()
  const transcriptView = createSnapshotStore<TranscriptMode>('compact')
  const t = makeTranslate(zh, commonZh)
  // Hook bindings cache per source identity, exactly like the renderer's
  // keyedHooks seat (uSES requires a stable hook identity per source).
  const useChatNode = bindKeyedSnapshotSelector(key => snapshot.nodes.source(key) as never)
  const useChatNodeProcess = bindKeyedSnapshotSelector(
    key => snapshot.nodes.processSource(key) as never,
  )
  // One disclosure store per harness: the render dispatch and the rows share it.
  const disclosures = disclosureShare()
  const props = {
    useChat: bindSnapshotSelector({
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
    }),
    useSession: bindSnapshotSelector({
      subscribe: () => () => {},
      getSnapshot: () => STUB_SESSION,
    }),
    useSessions: bindSnapshotSelector({
      subscribe: () => () => {},
      getSnapshot: () => STUB_SESSIONS,
    }),
    useSessionPendingInteraction: bindSnapshotSelector({
      subscribe: () => () => {},
      getSnapshot: () => STUB_PENDING_INTERACTION,
    }),
    useWorkspaces: bindSnapshotSelector({
      subscribe: () => () => {},
      getSnapshot: () => STUB_WORKSPACES,
    }),
    useInput: bindSnapshotSelector({
      subscribe: () => () => {},
      getSnapshot: () => STUB_INPUT,
    }),
    useComposerBlock: bindSnapshotSelector({
      subscribe: () => () => {},
      getSnapshot: () => undefined,
    }),
    useProjection: () => EMPTY_TURN_OUTLINE,
    useTranscriptView: bindSnapshotSelector(transcriptView),
    useStore: bindSnapshotSelector(chat),
    actions: chat.actions,
    useChatNode: useChatNode as never,
    useChatNodeProcess: useChatNodeProcess as never,
    // Minimal keyed dispatch: system-prompt rows render through the real
    // renderer so the disclosure-persistence case drives a real row.
    renderSlot: ((_key: string, owner: object, opts?: { fallback?: React.ReactNode; entryKey?: string }) => {
      if (opts?.entryKey === 'system-prompt') {
        const { node } = owner as { node: object }
        const viewProps = {
          node,
          openFile: () => {},
          inspectCall: () => {},
          forkAt: () => {},
          renderMessageImages: () => null,
          fileMentions: () => undefined,
          useTurnData: () => undefined,
          ...disclosures,
          t,
        } as never as React.ComponentProps<typeof SystemPromptNodeView>
        return <SystemPromptNodeView {...viewProps} />
      }
      return opts?.fallback ?? null
    }) as never,
    SessionProvider: (({ children }: { children?: React.ReactNode }) => children) as never,
    viewRequest: null,
    openView: vi.fn(),
    completeViewRequest: () => {},
    openDetails: vi.fn(),
    openFile: vi.fn(() => Promise.resolve()),
    loadOlder: vi.fn(),
    loadThrough: vi.fn(() => Promise.resolve()),
    loadImage: vi.fn(() => Promise.resolve('blob:unused')),
    chatScroll: { save: () => {}, read: () => null },
    forkAt: vi.fn(),
    fileMentions: () => undefined,
    t,
  } as unknown as React.ComponentProps<typeof ChatView>
  return props
}

type TranscriptMode = TranscriptViewMode

function flowKeys(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-chat-flow-key]')]
    .map(row => row.dataset.chatFlowKey ?? '')
}

function flowScroller(): HTMLElement {
  const column = document.querySelector<HTMLElement>('[data-chat-flow]')
  if (column === null) throw new Error('Chat flow column not found')
  // Without the resident shell the view-local `.scroll` div owns scrolling.
  return column.parentElement as HTMLElement
}

function scrollFlowTo(offset: number): void {
  const scroller = flowScroller()
  act(() => {
    scroller.scrollTop = offset
    scroller.dispatchEvent(new Event('scroll'))
  })
}

describe('Chat virtualization', () => {
  it(`windows rows once the flow passes ${String(CHAT_VIRTUALIZATION_THRESHOLD)} and truly unmounts offscreen rows`, () => {
    const snapshot = longSnapshot()
    const logical = snapshot.order.length
    expect(logical).toBeGreaterThan(2 * CHAT_VIRTUALIZATION_THRESHOLD)

    render(<ChatView {...sessionHarness(snapshot)} />)

    const column = document.querySelector('[data-chat-flow]')
    expect(column?.getAttribute('data-chat-flow-virtual')).toBe('true')

    const mountedHead = flowKeys()
    expect(mountedHead.length).toBeGreaterThan(0)
    expect(mountedHead.length).toBeLessThan(logical / 2)
    expect(mountedHead).toContain('fixture:system-prompt:-1')
    for (const row of document.querySelectorAll<HTMLElement>('[data-chat-flow-key]')) {
      expect(row.getAttribute('data-index')).not.toBeNull()
    }

    // Jump deep into the flow: head rows truly unmount, tail rows mount.
    scrollFlowTo(150_000)
    const mountedTail = flowKeys()
    expect(mountedTail.length).toBeGreaterThan(0)
    expect(mountedTail.length).toBeLessThan(logical / 2)
    expect(mountedTail).not.toContain('fixture:system-prompt:-1')
    expect(mountedTail.some(key => key === 'fixture:assistant:159')).toBe(true)
  })

  it('keeps the plain full-map path below the threshold', () => {
    const snapshot = shortSnapshot()
    render(<ChatView {...sessionHarness(snapshot)} />)

    const column = document.querySelector('[data-chat-flow]')
    expect(column?.getAttribute('data-chat-flow-virtual')).toBeNull()
    expect(flowKeys()).toHaveLength(snapshot.order.length)
    expect(flowKeys()).toContain('fixture:user:0')
  })

  it('keeps a row disclosure expanded across a window move that unmounts it', () => {
    const snapshot = longSnapshot()
    render(<ChatView {...sessionHarness(snapshot)} />)

    // Expand the head system-prompt row, then scroll far enough that its seat
    // unmounts; the expanded choice lives in the node disclosure store.
    expect(flowKeys()).toContain('fixture:system-prompt:-1')
    const head = screen.getByRole('button', { name: '系统提示词' })
    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('true')

    scrollFlowTo(150_000)
    expect(flowKeys()).not.toContain('fixture:system-prompt:-1')

    scrollFlowTo(0)
    const remounted = screen.getByRole('button', { name: '系统提示词' })
    expect(remounted.getAttribute('aria-expanded')).toBe('true')
  })
})
