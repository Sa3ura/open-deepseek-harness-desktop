// An enclosing `[data-conversation-scroll]` owns scrolling when present;
// otherwise this view owns it. Each row subscribes to one stable node key.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import type {
  ConversationTimelineSnapshot, RenderMessageImages,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import { Button, IconChevronDownOutline14, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import type { ChatNode } from '../contract/chat-nodes.ts'
import type { ChatSnapshot } from '../contract/snapshot.ts'
import { PendingSteeringBubble, PendingSubmissionBubble } from './MessageItem.tsx'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { TurnNavigator } from './TurnNavigator.tsx'
import { useChatVirtualizer, useFlowHeadHeight } from './use-chat-virtualizer.ts'
import { mergeTurnRailItems, type TurnRailItem } from './turn-rail-items.ts'
import { formatRunDuration } from './message-chrome.ts'
import css from './ChatView.module.css'

const FOLLOW_THRESHOLD = 24
const SCROLL_SAMPLE_INTERVAL_MS = 500

/** Active column host when present; otherwise the view-local scroller. */
function scrollerOf(from: HTMLElement): HTMLElement {
  return (from.closest('[data-conversation-scroll]')) ?? from
}

interface PagingAnchor {
  /** Stable node/call identity, independent of boundary-spanning group keys. */
  key: string
  /** Row top relative to the scrollport after the latest user scroll. */
  top: number
}

/** Find an already-rendered row without interpolating a selector. */
function anchorElement(list: HTMLElement, key: string): HTMLElement | null {
  for (const row of list.querySelectorAll<HTMLElement>('[data-chat-anchor-key]:not([hidden])')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/**
 * Turn owning the row at a scrollport line. Scroll frames are hot, so this
 * hit-tests the line first and falls back to one row scan when layout cannot
 * answer (jsdom, pre-paint); neither path queries per navigation item.
 * @param list - the ChatView list element.
 * @param line - viewport y of the reading line.
 * @returns the Turn number, or null when no loaded row covers the line.
 */
function turnAtLine(list: HTMLElement, line: number): number | null {
  const content = list.getBoundingClientRect()
  if (typeof document.elementsFromPoint === 'function' && content.width > 0) {
    for (const element of document.elementsFromPoint(content.left + content.width / 2, line)) {
      const row = element instanceof HTMLElement ? element.closest<HTMLElement>('[data-chat-turn]') : null
      const turn = Number(row?.dataset.chatTurn)
      if (row !== null && list.contains(row) && Number.isSafeInteger(turn)) return turn
    }
  }
  let found: number | null = null
  for (const row of list.querySelectorAll<HTMLElement>('[data-chat-turn]')) {
    if (row.getBoundingClientRect().top > line) break
    const turn = Number(row.dataset.chatTurn)
    if (Number.isSafeInteger(turn)) found = turn
  }
  return found
}

/** Row position in scrollport coordinates (viewport-independent). */
function flowTop(row: HTMLElement, scrollport: HTMLElement): number {
  return row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top
}

/**
 * Settle target holding one row at a scrollport-relative top. Undefined while
 * the row has not mounted yet — the chase keeps its frame budget and retries —
 * so an estimate-based landing that mounted the window beside the target still
 * converges once the target row commits.
 */
function seatRowTarget(
  local: HTMLElement,
  el: HTMLElement,
  key: string,
  top: number,
): number | undefined {
  const row = anchorElement(local, key)
  if (row === null) return undefined
  return flowTop(row, el) - top
}

/** Turn owning one Chat node, resolved off its engine-owned Location. */
function turnOfNode(node: ChatNode | undefined): number | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.turn : undefined
}

/** Select a visible stable node/call identity, falling back only when layout
 * has not exposed a visible box yet. */
function pagingAnchor(list: HTMLElement, scrollport: HTMLElement): HTMLElement | null {
  const viewport = scrollport.getBoundingClientRect()
  const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
  const visibleBottom = composer?.getBoundingClientRect().top ?? viewport.bottom
  // The leading edge preserves nested call identity when it hits a row.
  // Chrome/gap misses use logarithmic layout reads over the ordered flex rows.
  if (typeof document.elementsFromPoint === 'function' && visibleBottom > viewport.top) {
    const content = list.getBoundingClientRect()
    const left = Math.max(viewport.left, content.left)
    const right = Math.min(viewport.right, content.right)
    const x = left + Math.max(0, right - left) / 2
    for (const element of document.elementsFromPoint(x, viewport.top + 1)) {
      const row = element instanceof HTMLElement
        ? element.closest<HTMLElement>('[data-chat-anchor-key]')
        : null
      if (row !== null && list.contains(row)) return row
    }
  }
  const rows = list.querySelectorAll<HTMLElement>(
    '[data-chat-flow] > [data-chat-flow-key]:not(:empty):not([hidden])',
  )
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (rows.item(middle).getBoundingClientRect().bottom > viewport.top) high = middle
    else low = middle + 1
  }
  const row = rows[low]
  return row !== undefined && row.getBoundingClientRect().top < visibleBottom ? row : rows[0] ?? null
}

type ChatScrollPosition = NonNullable<ReturnType<ChatViewSlotProps['chatScroll']['read']>>

/** Capture a reflow-resistant reader position from the current rendered window. */
function scrollPosition(list: HTMLElement, scrollport: HTMLElement): ChatScrollPosition | null {
  const row = pagingAnchor(list, scrollport)
  const anchorKey = row?.dataset.chatAnchorKey
  if (row === null || anchorKey === undefined) return null
  return {
    anchorKey,
    anchorTop: flowTop(row, scrollport),
    scrollTop: scrollport.scrollTop,
  }
}

/** Host/OS refusal text for the file-open dialog; empty throws keep a locale fallback. */
function openFailureMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message === '' ? fallback : message
}

/** ProducedFiles opens the session workspace as `.`. */
function isFolderOpenPath(path: string): boolean {
  return path === '.'
}

/**
 * Prompt-RPC identities already rendered by durable material: user/steering
 * node sources plus queue occurrences. A submission echo whose identity
 * appears here is hidden in the same render, so the echo→durable swap is
 * atomic — no duplicate, no gap — regardless of when the echo leaves the
 * session snapshot.
 */
function observedRpcIds(
  order: readonly string[],
  nodes: ChatSnapshot['nodes'],
  queue: readonly { readonly rpcId?: string }[],
): ReadonlySet<string> {
  const observed = new Set<string>()
  for (const key of order) {
    const node = nodes.get(key)
    if (node === undefined || (node.kind !== 'user' && node.kind !== 'steering')) continue
    const source = (node.data as { readonly source?: unknown }).source as
      | { readonly kind?: unknown; readonly rpcId?: unknown }
      | undefined
    if (source?.kind === 'user' && typeof source.rpcId === 'string') observed.add(source.rpcId)
  }
  for (const item of queue) {
    if (item.rpcId !== undefined) observed.add(item.rpcId)
  }
  return observed
}

function runningTurnStartTime(timeline: ConversationTimelineSnapshot): number | null {
  let latest: number | null = null
  for (const turn of timeline.turns.values()) {
    if (turn.status === 'open') latest = turn.start?.time ?? null
  }
  return latest
}

/** Turn-level model activity label retained across first-token, tool, and streaming phases. */
function TurnStatus({ startTime, t }: {
  /** The running turn's logged `turn/start` time; null falls back to mount
   *  time when that boundary is outside the window. */
  startTime: number | null
  /** The owning view's locale seat. */
  t: ChatViewSlotProps['t']
}) {
  const [mountedAt] = useState(() => Date.now())
  // Anchored to turn/start so a mid-turn reload keeps the real
  // elapsed time and the final footer's Ran-for label matches this clock.
  const anchor = startTime ?? mountedAt
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor))
  useEffect(() => {
    const tick = (): void => {
      setElapsedMs(Math.max(0, Date.now() - anchor))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { clearInterval(id) }
  }, [anchor])
  // Short turns keep the plain label; the clock only appears once the turn
  // has clearly been running for a while.
  const showClock = elapsedMs >= 15_000
  return (
    <div className={css.turnStatus} role="status" aria-live="polite">
      {t('chat.deepDiving')}
      {showClock && (
        <span className={css.turnStatusClock} aria-hidden>
          {formatRunDuration(elapsedMs, t)}
        </span>
      )}
    </div>
  )
}

type ChatNodeListProps = Omit<ComponentProps<typeof ChatNodeSeat>, 'nodeKey'> & {
  readonly order: readonly string[]
}

const ChatNodeList = memo(function ChatNodeList({ order, ...seatProps }: ChatNodeListProps) {
  return order.map(nodeKey => (
    <ChatNodeSeat key={nodeKey} nodeKey={nodeKey} {...seatProps} />
  ))
})

/**
 * The chat view slot entry: pure component over the composed props; each
 * ordered business Node crosses the keyed renderer seat.
 */
export function ChatView({
  useSession, useChat, useChatNode, useChatNodeProcess, useSessions, useStore, actions, renderSlot,
  sessionId, openFile, loadOlder, loadThrough, loadImage, openView, chatScroll, forkAt, fileMentions,
  useTranscriptView, useProjection, t,
}: ChatViewSlotProps) {
  const order = useChat(s => s.order)
  const nodeStore = useChat(s => s.nodes)
  // The rail's items are accumulated in the Chat snapshot, so this selector is
  // both the data and its change signal: the array identity moves only when a
  // Turn enters, leaves, or changes its preview.
  const turnNavigationItems = useChat(s => s.navigation.items())
  // Host-computed whole-log outline; the merge is view-layer only (the
  // conversation snapshot never carries projection values).
  const turnOutline = useProjection('turnOutline')
  const railItems = useMemo(
    () => mergeTurnRailItems(turnNavigationItems, turnOutline),
    [turnNavigationItems, turnOutline],
  )
  const timeline = useChat(s => s.timeline)
  const inbox = useSession(s => s.queue)
  // Workspace root off the session list row: path summaries display relative to it.
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const running = useSession(s => s.running)
  const openState = useSession(s => s.openState)
  const openError = useSession(s => s.openError)
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  const selectedCallId = useStore(s => s.selection?.callId)
  const compactTranscript = useTranscriptView(mode => mode === 'compact')
  const inspectCall = useCallback((callId: string) => {
    openView('trajectory', callId)
  }, [openView])
  const [fileOpenError, setFileOpenError] = useState<{ path: string; message: string } | null>(null)
  const [fileOpenBusy, setFileOpenBusy] = useState(false)
  // Close/retry must ignore a settlement that started before the latest
  // gesture; otherwise a cancelled in-flight refusal reopens the dialog.
  const fileOpenRequest = useRef(0)

  const requestOpenFile = useCallback((path: string) => {
    const id = ++fileOpenRequest.current
    setFileOpenBusy(true)
    void openFile(path).then(
      () => {
        if (id !== fileOpenRequest.current) return
        setFileOpenError(null)
        setFileOpenBusy(false)
      },
      (error: unknown) => {
        if (id !== fileOpenRequest.current) return
        setFileOpenError({
          path,
          message: openFailureMessage(
            error,
            t(isFolderOpenPath(path) ? 'fileOpen.folderUnknown' : 'fileOpen.unknown'),
          ),
        })
        setFileOpenBusy(false)
      },
    )
  }, [openFile, t])

  const closeFileOpenError = useCallback(() => {
    fileOpenRequest.current += 1
    setFileOpenError(null)
    setFileOpenBusy(false)
  }, [])

  const pendingSteering = useMemo(
    () => inbox.filter(item => item.placement === 'steering'),
    [inbox],
  )
  const pendingSubmissions = useSession(s => s.pendingSubmissions)
  // Submission echoes still awaiting their durable counterpart. `order` is the
  // recompute trigger: durable user material always arrives as an append, and
  // every append replaces the order array.
  const visibleSubmissions = useMemo(() => {
    if (pendingSubmissions.length === 0) return pendingSubmissions
    const observed = observedRpcIds(order, nodeStore, inbox)
    return pendingSubmissions.filter(submission => (
      submission.placement !== 'queued' && !observed.has(submission.requestId)
    ))
  }, [pendingSubmissions, order, nodeStore, inbox])
  const renderMessageImages = useCallback<RenderMessageImages>(
    owner => renderSlot('conversation.message.images', { ...owner, loadImage }),
    [loadImage, renderSlot],
  )
  const runningTurnStart = useMemo(() => runningTurnStartTime(timeline), [timeline])

  const listRef = useRef<HTMLDivElement | null>(null)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const getScrollElement = useCallback((): HTMLDivElement | null => {
    const local = listRef.current
    // Both scroll owners — the shell's `[data-conversation-scroll]` body and
    // this view's local `.scroll` fallback — are divs.
    return local === null ? null : scrollerOf(local) as HTMLDivElement
  }, [])
  const flowHead = useFlowHeadHeight()
  // Content offset of the flow column's top edge inside the scroll content
  // (shell padding and everything above the column). Scroll-invariant, so a
  // ref read during render is enough — no state, no render feedback. Layout
  // effects keep it fresh; a change lands on the next render, which is always
  // triggered by the same snapshot change that moved the origin.
  const flowOriginRef = useRef(0)
  useLayoutEffect(() => {
    const column = columnRef.current
    const el = getScrollElement()
    if (column === null || el === null) return
    flowOriginRef.current = column.getBoundingClientRect().top
      - el.getBoundingClientRect().top
      + el.scrollTop
  })
  const scrollMargin = flowOriginRef.current + flowHead.height
  const virtual = useChatVirtualizer(order, getScrollElement, scrollMargin)
  // Whether a leading block (hint / error / load-older) renders above row 0;
  // row 0 owns no leading gap only when this is false.
  const hasFlowHead = openState === 'loading'
    || (openState === 'error' && openError !== null)
    || hasMore
  // A saved position starts disarmed; the first layout effect synchronously
  // restores it and normalizes a floor-clamped position back to following.
  const [atBottom, setAtBottom] = useState(() => chatScroll.read() === null)
  const atBottomRef = useRef(atBottom)
  const scrollSamplePendingRef = useRef(false)
  const [, setScrollSampleTick] = useState(0)
  const [activeTurn, setActiveTurn] = useState<number | null>(
    () => turnNavigationItems.at(-1)?.turn ?? null,
  )
  /** Last position delivered or written on the main thread. */
  const observedTopRef = useRef(0)
  /** Scroll geometry at the latest raw delivery. Ownership is classified from
   *  delivery truth, not from the delayed sample: on the virtualized path,
   *  measurement of newly mounted rows moves the floor between the delivery
   *  and the sample, which would otherwise reclassify a floor landing
   *  (native End, back-to-bottom) as reader movement. */
  const lastDeliveryRef = useRef<{ scrollTop: number; floor: number; observed: number } | null>(null)
  /** Paging anchor: semantic row/position at click, updated by reader scrolls
   * while the request is pending and restored after the prepend lands. */
  const anchorRef = useRef<PagingAnchor | null>(null)
  /** Unloaded-turn jump in flight: target turn plus its load-through seq. */
  const pendingJumpRef = useRef<{ turn: number; seq: SessionSeq } | null>(null)
  /** Whether the in-flight jump already landed mid-paging (settle then only corrects an untouched landing). */
  const jumpLandedRef = useRef(false)
  const [busyJumpTurn, setBusyJumpTurn] = useState<number | null>(null)
  /** Bumped when a loadThrough completion settles, after its last page's commit. */
  const [jumpSettleTick, setJumpSettleTick] = useState(0)
  /** Window head at the last settle-time repage; an unmoved head falls back instead of repaging forever. */
  const jumpRepageHeadRef = useRef<number | null>(null)
  const firstSeqRef = useRef<number | null>(null)
  const openedRef = useRef(false)
  const lastKeyRef = useRef<string | null>(null)
  const lastSteeringIdRef = useRef<string | null>(null)
  const lastSubmissionIdRef = useRef<string | null>(null)
  /** Flow tip signature — follow-scroll only when this moves, never on a
   *  scroll-driven at-bottom chrome re-render (which would snap inertial
   *  scrolls the rest of the way to the floor). */
  const followSigRef = useRef<string | null>(null)
  /** Programmatic-landing convergence: rows never mounted carry estimate
   *  sizes, so one semantic write (prepend re-seat, session restore, row
   *  landing) moves as the mounted window measures. The frame loop re-reads
   *  the target's live rectangle and rewrites the offset until it holds.
   *  target returns the scroll correction to apply, undefined while the
   *  target row has not mounted yet, and null to abort. */
  const settleRef = useRef<{
    frames: number
    stable: number
    target: (local: HTMLElement, el: HTMLElement) => number | undefined | null
  } | null>(null)
  const settleFrameRef = useRef<number | null>(null)
  /** How long the convergence loop may chase before giving up (frames at
   *  display cadence — wide remeasure cascades must be covered). */
  const SETTLE_MAX_FRAMES = 60

  const runSettleFrame = (): void => {
    settleFrameRef.current = null
    const settle = settleRef.current
    const local = listRef.current
    if (settle === null || local === null) {
      settleRef.current = null
      return
    }
    const el = scrollerOf(local)
    // A delivery off the programmatic ledger is reader movement: the chase
    // must never fight the reader for the scrollport.
    if (Math.abs(el.scrollTop - observedTopRef.current) > 0.5) {
      settleRef.current = null
      return
    }
    const error = settle.target(local, el)
    if (error === null) {
      settleRef.current = null
      return
    }
    if (error !== undefined && Math.abs(error) <= 0.5) {
      settle.stable += 1
      if (settle.stable >= 2) {
        settleRef.current = null
        return
      }
    } else if (error !== undefined) {
      settle.stable = 0
      el.scrollTop += error
      observedTopRef.current = el.scrollTop
    }
    settle.frames += 1
    if (settle.frames > SETTLE_MAX_FRAMES) {
      settleRef.current = null
      return
    }
    settleFrameRef.current = requestAnimationFrame(runSettleFrame)
  }
  /** Arm convergence for the write that follows; the plain path mounts every
   *  row, so its single write is already exact and never chases. */
  const armSettle = (target: (local: HTMLElement, el: HTMLElement) => number | undefined | null): void => {
    if (!virtual.enabled) return
    settleRef.current = { frames: 0, stable: 0, target }
    if (settleFrameRef.current === null && typeof requestAnimationFrame === 'function') {
      settleFrameRef.current = requestAnimationFrame(runSettleFrame)
    }
  }

  const firstKey = order[0]
  const firstSeq = firstKey === undefined ? null : nodeStore.get(firstKey)?.anchorSeq ?? null
  const lastKey = order.at(-1) ?? null
  const lastNode = lastKey === null ? undefined : nodeStore.get(lastKey)
  const lastSteeringId = pendingSteering[pendingSteering.length - 1]?.id ?? null
  const lastSubmissionId = visibleSubmissions[visibleSubmissions.length - 1]?.requestId ?? null
  const followSig = `${openState}:${firstSeq}:${lastKey}:${order.length}:${running ? 1 : 0}:${lastSteeringId ?? ''}:${lastSubmissionId ?? ''}`

  const syncActiveTurn = useCallback((): void => {
    if (scrollSamplePendingRef.current) return
    const local = listRef.current
    const first = turnNavigationItems[0]
    if (local === null || first === undefined) {
      setActiveTurn(null)
      return
    }
    const el = scrollerOf(local)
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1) {
      const latest = turnNavigationItems.at(-1)?.turn ?? first.turn
      setActiveTurn(current => current === latest ? current : latest)
      return
    }
    const readingLine = el.getBoundingClientRect().top + Math.min(96, el.clientHeight * 0.2)
    const reading = turnAtLine(local, readingLine)
    // No row reaches the line yet: the flow head still owns the mark. Otherwise
    // the row's Turn may be one the rail does not offer (all its nodes hidden),
    // so the newest offered Turn at or above it owns the mark. Virtualized
    // windows resolve a line that only spacer or gap boxes cover through the
    // row offsets instead of the mounted-row scan.
    let next = first.turn
    let readingTurn: number | null = reading
    if (readingTurn === null && virtual.enabled) {
      const lineOffset = readingLine - el.getBoundingClientRect().top + el.scrollTop
      const index = virtual.indexAtOffset(lineOffset)
      const key = index === null ? undefined : order[index]
      readingTurn = key === undefined
        ? null
        : turnOfNode(nodeStore.get(key) as ChatNode | undefined) ?? null
    }
    if (readingTurn !== null) {
      for (const item of turnNavigationItems) {
        if (item.turn > readingTurn) break
        next = item.turn
      }
    }
    setActiveTurn(current => current === next ? current : next)
  }, [turnNavigationItems, virtual.enabled, virtual.indexAtOffset, order, nodeStore])

  const activeTurnRef = useRef<(() => void) | null>(null)
  const activeFrameRef = useRef<number | null>(null)
  const scheduleActiveTurn = useCallback((): void => {
    if (activeFrameRef.current !== null) return
    if (typeof requestAnimationFrame === 'undefined') {
      syncActiveTurn()
      return
    }
    activeFrameRef.current = requestAnimationFrame(() => {
      activeFrameRef.current = null
      syncActiveTurn()
    })
  }, [syncActiveTurn])

  useEffect(() => () => {
    if (activeFrameRef.current !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(activeFrameRef.current)
    }
    if (settleFrameRef.current !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(settleFrameRef.current)
    }
    settleRef.current = null
  }, [])

  activeTurnRef.current = scheduleActiveTurn

  useLayoutEffect(() => {
    scheduleActiveTurn()
  }, [scheduleActiveTurn])

  const toBottom = (el: HTMLElement): void => {
    anchorRef.current = null
    // Returning to the live tail supersedes a jump still landing.
    pendingJumpRef.current = null
    setBusyJumpTurn(current => current === null ? current : null)
    el.scrollTop = el.scrollHeight
    observedTopRef.current = el.scrollTop
    atBottomRef.current = true
    setAtBottom(true)
    chatScroll.save(null)
    setActiveTurn(turnNavigationItems.at(-1)?.turn ?? null)
  }

  /**
   * Land one row — addressed by its stable node key — at the reading line and
   * republish scroll-derived state. A mounted row corrects from its real
   * rectangle; a virtualized offscreen row lands on its virtual offset and is
   * geometry-corrected once it measures. A latest-ref, so navigateToTurn's
   * identity stays stable for the memoized rail.
   */
  const landOnRowRef = useRef<(local: HTMLElement, el: HTMLElement, key: string, turn: number) => void>(
    () => {},
  )
  landOnRowRef.current = (local, el, key, turn) => {
    const row = anchorElement(local, key)
    if (row !== null) {
      el.scrollTop += flowTop(row, el) - 24
    } else {
      const offset = virtual.offsetOfKey(key)
      if (offset === null) return
      el.scrollTop = Math.max(0, offset - 24)
    }
    observedTopRef.current = el.scrollTop
    armSettle((settleLocal, settleEl) => seatRowTarget(settleLocal, settleEl, key, 24))
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1
    atBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
    setActiveTurn(turn)
    const position = isAtBottom ? null : scrollPosition(local, el)
    if (isAtBottom) chatScroll.save(null)
    else if (position !== null) chatScroll.save(position)
  }

  /**
   * Land the pending jump once its Turn has a rendered anchor row; false
   * while it must keep waiting. Mid-jump landings (`settle` false) keep the
   * jump armed with the target row as the paging anchor, so later chunks and
   * the load-earlier button's unmount re-land on the same row; the settling
   * call clears the jump.
   */
  const realizePendingJump = (local: HTMLElement, el: HTMLElement, settle: boolean): boolean => {
    const pending = pendingJumpRef.current
    if (pending === null) return true
    const item = railItems.find(candidate => candidate.turn === pending.turn)
    if (item === undefined || item.anchor.kind !== 'loaded') return false
    // A loaded anchor is landable through its virtual offset even while its
    // row is unmounted; keep waiting only when the key resolves to neither.
    if (virtual.offsetOfKey(item.anchor.key) === null && anchorElement(local, item.anchor.key) === null) {
      return false
    }
    if (settle) {
      pendingJumpRef.current = null
      setBusyJumpTurn(null)
      const held = anchorRef.current
      const landedEarlier = jumpLandedRef.current
      jumpLandedRef.current = false
      anchorRef.current = null
      // A reader who moved off an already-landed target mid-jump keeps their
      // place; a first landing, or an untouched one, takes the correction.
      if (!landedEarlier || held?.key === item.anchor.key) {
        landOnRowRef.current(local, el, item.anchor.key, pending.turn)
      }
      return true
    }
    landOnRowRef.current(local, el, item.anchor.key, pending.turn)
    jumpLandedRef.current = true
    // landOnRow seats the row 24px below the scrollport top; the held anchor
    // records that constructed position until the reader scrolls.
    anchorRef.current = { key: item.anchor.key, top: 24 }
    return true
  }

  useLayoutEffect(() => {
    if (scrollSamplePendingRef.current) return
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: React attaches the ref before layout effects run. */
    if (local === null) return
    const el = scrollerOf(local)
    // Open completed: jump to the bottom once — unless a scroll position
    // survives from a previous mount (view-tab switch away and back), which
    // is restored instead of snapping the reader back to the floor.
    if (openState === 'open' && !openedRef.current) {
      openedRef.current = true
      const saved = chatScroll.read()
      if (saved === null) {
        toBottom(el)
      } else {
        el.scrollTop = saved.scrollTop
        const row = anchorElement(local, saved.anchorKey)
        if (row !== null) el.scrollTop += flowTop(row, el) - saved.anchorTop
        observedTopRef.current = el.scrollTop
        armSettle((settleLocal, settleEl) => seatRowTarget(settleLocal, settleEl, saved.anchorKey, saved.anchorTop))
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1
        atBottomRef.current = isAtBottom
        setAtBottom(isAtBottom)
        const normalized = isAtBottom ? null : scrollPosition(local, el)
        if (isAtBottom) chatScroll.save(null)
        else if (normalized !== null) chatScroll.save(normalized)
      }
      firstSeqRef.current = firstSeq
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      lastSubmissionIdRef.current = lastSubmissionId
      followSigRef.current = followSig
      return
    }
    // Prepend (head seq decreased): preserve the same settled row at the
    // position established by the reader's latest scroll. This excludes
    // unrelated tail/composer growth while the request was in flight.
    if (anchorRef.current !== null && firstSeq !== null && firstSeqRef.current !== null && firstSeq < firstSeqRef.current) {
      const anchor = anchorRef.current
      anchorRef.current = null
      // Virtual path: row offsets are self-consistent across the prepend
      // (TanStack keys measured sizes by node key and does not compensate
      // count growth), so scrolling straight to the anchor's new offset minus
      // its pre-prepend viewport top re-seats the same row. That first write
      // rides estimate sizes for the never-mounted rows above the anchor; the
      // settle loop re-seats from live rectangles as they measure. No
      // virtualizer adjustment runs beside either write.
      const virtualOffset = virtual.offsetOfKey(anchor.key)
      const row = virtualOffset === null ? anchorElement(local, anchor.key) : null
      if (virtualOffset !== null) {
        el.scrollTop = Math.max(0, virtualOffset - anchor.top)
      } else if (row !== null) {
        el.scrollTop += flowTop(row, el) - anchor.top
      }
      observedTopRef.current = el.scrollTop
      // A jump chunk lands here: scroll to the target once its rows exist;
      // until then keep holding the reader's row for the next chunk. The
      // re-armed top is the anchor's post-correction viewport position.
      const held = virtualOffset !== null || row !== null
      if (!realizePendingJump(local, el, false) && held) {
        anchorRef.current = { key: anchor.key, top: anchor.top }
        armSettle((settleLocal, settleEl) => seatRowTarget(settleLocal, settleEl, anchor.key, anchor.top))
      }
      firstSeqRef.current = firstSeq
      /* v8 ignore next -- ?? arm: a prepend adds nodes, so the flow list here is never empty. */
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      lastSubmissionIdRef.current = lastSubmissionId
      followSigRef.current = followSig
      return
    }
    firstSeqRef.current = firstSeq
    // Own words must be visible: a new trailing user node force-scrolls
    // (send lives in the composer, so arrival is detected here, not armed there).
    const appendedUser = lastKey !== lastKeyRef.current && lastNode?.kind === 'user'
    const appendedSteering = lastSteeringId !== null && lastSteeringId !== lastSteeringIdRef.current
    const appendedSubmission = lastSubmissionId !== null && lastSubmissionId !== lastSubmissionIdRef.current
    const tipMoved = followSigRef.current !== followSig
    lastKeyRef.current = lastKey
    lastSteeringIdRef.current = lastSteeringId
    lastSubmissionIdRef.current = lastSubmissionId
    followSigRef.current = followSig
    // Follow new flow content while pinned; do NOT re-pin on every render
    // merely because atBottomRef is true (scroll threshold → setState → snap).
    if (appendedUser || appendedSteering || appendedSubmission || (tipMoved && atBottomRef.current)) {
      toBottom(el)
      return
    }
    // A jump whose target committed outside the anchored-prepend path (for
    // example after a mid-jump toBottom dropped the held anchor) lands here.
    if (pendingJumpRef.current !== null) realizePendingJump(local, el, false)
  })

  const onScrollRef = useRef(() => {})
  onScrollRef.current = () => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the handler only fires while mounted. */
    if (local === null) return
    const el = scrollerOf(local)
    // Only reader input may make raw scroll geometry change follow ownership:
    // a delivered position that deviates from the observed-top ledger (every
    // programmatic write records itself there synchronously). This covers
    // wheel, touch, scrollbar, and keyboard alike without naming devices.
    // Browser shrink-clamps land exactly on the floor min and delayed
    // programmatic deliveries land on the ledger itself, so both preserve
    // the current ownership state.
    const floor = Math.max(0, el.scrollHeight - el.clientHeight)
    // Ownership classifies from the delivery that triggered this sample, not
    // from live geometry: on the virtualized path, measurement of newly
    // mounted rows moves the floor between the two, and live sampling would
    // reclassify a floor landing (native End, back-to-bottom) as reader
    // movement and disengage follow while the floor recedes.
    const delivery = lastDeliveryRef.current
    const movedByReader = delivery === null
      ? Math.abs(el.scrollTop - Math.min(observedTopRef.current, floor)) > 0.5
      : Math.abs(delivery.scrollTop - Math.min(delivery.observed, delivery.floor)) > 0.5
    const isAtBottom = movedByReader
      ? ((delivery?.floor ?? floor) - (delivery?.scrollTop ?? el.scrollTop)) <= FOLLOW_THRESHOLD + 1
      : atBottomRef.current
    if (!movedByReader && isAtBottom) {
      toBottom(el)
      return
    }
    atBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
    const position = isAtBottom ? null : scrollPosition(local, el)
    if (isAtBottom) {
      anchorRef.current = null
    } else if (anchorRef.current !== null && position !== null) {
      anchorRef.current = { key: position.anchorKey, top: position.anchorTop }
    }
    // Continuous save (unmount happens after ref detach, so saving there is
    // too late); pinned-to-bottom clears so a remount keeps following.
    if (isAtBottom) chatScroll.save(null)
    else if (position !== null) chatScroll.save(position)
    observedTopRef.current = el.scrollTop
    scheduleActiveTurn()
  }

  // Raw scroll events only schedule work. Geometry is sampled at most once
  // per interval, with scrollend providing the final sample for a short burst.
  useEffect(() => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: effect runs after the list node commits. */
    if (local === null) return
    const el = scrollerOf(local)
    let sampleTimer: number | undefined
    const sample = (): void => {
      if (!scrollSamplePendingRef.current) return
      scrollSamplePendingRef.current = false
      if (sampleTimer !== undefined) window.clearTimeout(sampleTimer)
      sampleTimer = undefined
      onScrollRef.current()
      setScrollSampleTick(tick => tick + 1)
    }
    const onScroll = (): void => {
      lastDeliveryRef.current = {
        scrollTop: el.scrollTop,
        floor: Math.max(0, el.scrollHeight - el.clientHeight),
        observed: observedTopRef.current,
      }
      scrollSamplePendingRef.current = true
      sampleTimer ??= window.setTimeout(sample, SCROLL_SAMPLE_INTERVAL_MS)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', sample, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', sample)
      if (sampleTimer !== undefined) window.clearTimeout(sampleTimer)
      scrollSamplePendingRef.current = false
    }
  }, [])

  // The ref starts null and is assigned every render, so the placeholder
  // initializer a function initial value would need never exists.
  const followRef = useRef<(() => void) | null>(null)
  followRef.current = () => {
    if (scrollSamplePendingRef.current) return
    const local = listRef.current
    if (local !== null && atBottomRef.current) {
      const el = scrollerOf(local)
      el.scrollTop = el.scrollHeight
      observedTopRef.current = el.scrollTop
      chatScroll.save(null)
    }
  }
  // Streaming, tool disclosures, and other flow changes resize the column;
  // the sticky composer resizes outside it. This observer owns ChatView's
  // dynamic-height follow decisions and writes only while the reader is pinned.
  useEffect(() => {
    const column = columnRef.current
    const local = listRef.current
    if (column === null || local === null || typeof ResizeObserver === 'undefined') return
    const scrollport = scrollerOf(local)
    const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
    // Flow-height changes (image loads, tool disclosures) move rows across the
    // reading line without a scroll event, so the active mark resyncs here too.
    const observer = new ResizeObserver(() => {
      followRef.current?.()
      activeTurnRef.current?.()
    })
    observer.observe(column)
    if (composer !== null) observer.observe(composer)
    return () => { observer.disconnect() }
  }, [])

  // A failed/empty page leaves the head unchanged. Once the request leaves
  // its busy state there is no future prepend for the saved anchor to own.
  useEffect(() => {
    if (!loadingOlder) anchorRef.current = null
  }, [loadingOlder])

  // Jump settlement: every loadThrough completion bumps the tick after its
  // last page's commit, and a plain pull's loadingOlder flip re-settles a
  // jump it made wait. A still-pending jump is realized now, held while a
  // plain load-earlier pull owns the pager (its completion retries below),
  // repaged once per head movement, or landed on the nearest rendered Turn
  // at or after the target (failure, exhausted history, or a Turn with no
  // visible row).
  useEffect(() => {
    const pending = pendingJumpRef.current
    const local = listRef.current
    if (pending === null || local === null) return
    const el = scrollerOf(local)
    // The settling landing runs after the load-earlier button's unmount
    // commit, so the target row cannot drift once the jump clears.
    if (realizePendingJump(local, el, true)) return
    const uncovered = firstSeq === null || firstSeq > pending.seq
    if (uncovered && hasMore) {
      // A plain pull owns the pager right now: hold the jump (busy stays)
      // instead of degrading to a wrong landing.
      if (loadingOlder) return
      if (jumpRepageHeadRef.current !== firstSeq) {
        jumpRepageHeadRef.current = firstSeq
        const held = pagingAnchor(local, el)
        if (held !== null && held.dataset.chatAnchorKey !== undefined) {
          anchorRef.current = { key: held.dataset.chatAnchorKey, top: flowTop(held, el) }
        }
        void loadThrough(pending.seq).finally(() => { setJumpSettleTick(tick => tick + 1) })
        return
      }
    }
    for (const row of local.querySelectorAll<HTMLElement>('[data-chat-turn]:not([hidden])')) {
      const turn = Number(row.dataset.chatTurn)
      if (!Number.isSafeInteger(turn) || turn < pending.turn) continue
      // The queried row carries its stable anchor key; landOnRow corrects from
      // its real rectangle (or its virtual offset when the key resolves only
      // there).
      landOnRowRef.current(local, el, row.dataset.chatAnchorKey ?? '', turn)
      break
    }
    pendingJumpRef.current = null
    setBusyJumpTurn(null)
    // Snapshot values are read at settle time; the completion tick is the trigger.
  }, [jumpSettleTick])

  // A jump held while a plain pull owned the pager waits in the effect
  // above; the pull's completion is its retry signal.
  useEffect(() => {
    if (!loadingOlder && pendingJumpRef.current !== null) setJumpSettleTick(tick => tick + 1)
  }, [loadingOlder])

  const loadOlderAnchored = (): void => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */
    if (local !== null) {
      const el = scrollerOf(local)
      const row = pagingAnchor(local, el)
      if (row !== null && row.dataset.chatAnchorKey !== undefined) {
        anchorRef.current = {
          key: row.dataset.chatAnchorKey,
          top: flowTop(row, el),
        }
      }
    }
    loadOlder()
  }

  // Identity feeds the memoized rail; a fresh closure per render would defeat it.
  const navigateToTurn = useCallback((item: TurnRailItem): void => {
    const local = listRef.current
    if (local === null) return
    const el = scrollerOf(local)
    if (item.anchor.kind === 'unloaded') {
      // Jumping into history is leaving the live tail: release bottom
      // ownership on the click itself, or the pinned-scroll snap (a
      // non-reader scroll delivery during the first prepend's compensation)
      // would call toBottom and cancel the jump.
      atBottomRef.current = false
      setAtBottom(false)
      // Hold the reader's place through the paging chunks; the layout effect
      // lands on the target once its rows commit.
      const held = pagingAnchor(local, el)
      if (held !== null && held.dataset.chatAnchorKey !== undefined) {
        anchorRef.current = { key: held.dataset.chatAnchorKey, top: flowTop(held, el) }
      }
      pendingJumpRef.current = { turn: item.turn, seq: item.anchor.seq }
      jumpRepageHeadRef.current = null
      jumpLandedRef.current = false
      setBusyJumpTurn(item.turn)
      void loadThrough(item.anchor.seq).finally(() => { setJumpSettleTick(tick => tick + 1) })
      return
    }
    // A loaded-mark click supersedes any jump still landing.
    pendingJumpRef.current = null
    setBusyJumpTurn(current => current === null ? current : null)
    // landOnRow resolves the key through its mounted row, falling back to the
    // row's virtual offset while that row sits outside the virtual window.
    landOnRowRef.current(local, el, item.anchor.key, item.turn)
    // A pending older page still has to compensate the prepended height, so
    // navigation moves that anchor to the new position instead of dropping it.
    const landed = loadingOlder ? pagingAnchor(local, el) : null
    anchorRef.current = landed === null || landed.dataset.chatAnchorKey === undefined
      ? null
      : { key: landed.dataset.chatAnchorKey, top: flowTop(landed, el) }
  }, [loadingOlder, loadThrough])

  // Leading blocks (hint / error / load-older) share the rows' spacing model:
  // on the virtual path they sit inside one measured flow head so the
  // virtualizer's scrollMargin matches the real space above row 0.
  const leading = (
    <>
      {openState === 'loading' && <div className={css.hint}>{t('chat.loadingHistory')}</div>}
      {openState === 'error' && openError !== null && (
        <div className={css.openError}>
          {t('chat.loadError', { message: openError.message, code: openError.code })}
        </div>
      )}
      {hasMore && (
        <div className={css.older}>
          <button type="button" disabled={loadingOlder} onClick={loadOlderAnchored}>
            {loadingOlder ? t('loading') : t('chat.loadOlder')}
          </button>
        </div>
      )}
    </>
  )
  const seatProps = {
    useChatNode,
    useChatNodeProcess,
    historyIncomplete: hasMore,
    compactTranscript,
    useStore,
    actions,
    selectedCallId,
    cwd,
    openFile: requestOpenFile,
    inspectCall,
    forkAt,
    renderMessageImages,
    fileMentions,
    renderSlot,
    t,
  }
  // Spacer heights keep the natural flow layout identical to the virtualizer's
  // coordinate system: `scrollMargin` is row 0's content offset, so the top
  // spacer covers the mounted range's distance past the leading blocks, and
  // the bottom spacer is the remainder of the estimated flow.
  const firstItem = virtual.items[0]
  const topSpacer = virtual.enabled && firstItem !== undefined
    ? Math.max(0, firstItem.start - scrollMargin)
    : 0
  const lastItem = virtual.items.at(-1)
  const bottomSpacer = virtual.enabled && lastItem !== undefined
    ? Math.max(0, virtual.totalSize - lastItem.end)
    : 0

  return (
    <div className={css.root}>
      <div ref={listRef} className={css.scroll}>
        <TurnNavigator
          items={railItems}
          activeTurn={activeTurn}
          busyTurn={busyJumpTurn}
          onNavigate={navigateToTurn}
          t={t}
        />
        <div
          ref={columnRef}
          className={css.column}
          data-chat-flow=""
          // Browser-contract probe (mirrors the trajectory ledger's
          // aria-rowcount): mounted `[data-chat-flow-key]` rows must stay
          // bounded against this logical count.
          data-chat-logical-count={order.length}
          data-chat-flow-virtual={virtual.enabled || undefined}
        >
          {virtual.enabled ? <div className={css.flowHead} ref={flowHead.ref}>{leading}</div> : leading}
          {topSpacer > 0 && (
            <div
              className={css.flowSpacer}
              data-chat-flow-spacer="top"
              style={{ height: topSpacer }}
              aria-hidden="true"
            />
          )}
          {virtual.enabled ? virtual.items.map(item => (
            <ChatNodeSeat
              key={item.key}
              nodeKey={String(item.key)}
              dataIndex={item.index}
              firstRow={item.index === 0 && !hasFlowHead}
              measureRef={virtual.measureElement}
              {...seatProps}
            />
          )) : <ChatNodeList order={order} {...seatProps} />}
          {bottomSpacer > 0 && (
            <div
              className={css.flowSpacer}
              data-chat-flow-spacer="bottom"
              style={{ height: bottomSpacer }}
              aria-hidden="true"
            />
          )}
          {/* No pending placeholders: questions (ui-user-questions) and approvals
              (ApprovalPanel) both take over the composer, so a flow card would
              double-render the same wait. */}
          {/* Turn-level loading signal: rides the whole running turn (first-token
              wait, tool execution, streaming) so it never flickers per step. */}
          {running && <TurnStatus startTime={runningTurnStart} t={t} />}
          {pendingSteering.map(item => (
            <PendingSteeringBubble
              key={item.id}
              content={item.content}
              renderMessageImages={renderMessageImages}
              t={t}
            />
          ))}
          {visibleSubmissions.map(submission => (
            <PendingSubmissionBubble
              key={submission.requestId}
              submission={submission}
              renderMessageImages={renderMessageImages}
              t={t}
            />
          ))}
        </div>
        {!atBottom && (
          <div className={css.toBottomSlot}>
            <button
              type="button"
              className={css.toBottom}
              aria-label={t('chat.toBottom')}
              onClick={() => {
                const local = listRef.current
                /* v8 ignore next -- ref-null guard: the button only renders alongside the mounted list. */
                if (local !== null) toBottom(scrollerOf(local))
              }}
            >
              <IconChevronDownOutline14 />
            </button>
          </div>
        )}
      </div>
      {fileOpenError !== null && (
        <FileOpenErrorDialog
          path={fileOpenError.path}
          message={fileOpenError.message}
          busy={fileOpenBusy}
          onClose={closeFileOpenError}
          onRetry={() => { requestOpenFile(fileOpenError.path) }}
          t={t}
        />
      )}
    </div>
  )
}

/** In-page Host open-path refusal: the wire reason plus a retry of the same path. */
function FileOpenErrorDialog({
  path, message, busy, onClose, onRetry, t,
}: {
  path: string
  message: string
  busy: boolean
  onClose: () => void
  onRetry: () => void
  t: ChatViewSlotProps['t']
}) {
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t('close')}
      title={t(isFolderOpenPath(path) ? 'fileOpen.folderTitle' : 'fileOpen.title')}
      description={message}
      footer={(
        <>
          <Button variant="outline" className={css.modalAction} onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" className={css.modalAction} disabled={busy} onClick={onRetry}>{t('retry')}</Button>
        </>
      )}
    />
  )
}
