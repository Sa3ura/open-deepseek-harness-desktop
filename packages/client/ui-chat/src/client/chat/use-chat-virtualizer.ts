// Adapter between the Chat flow column and @tanstack/react-virtual. The hook
// owns row windowing and measurement only: it never writes the scroll position
// and never follows the list end. ChatView remains the single scroll authority
// (bottom-follow, reader-scroll ownership, prepend anchors, scroll restore), so
// this adapter deliberately omits `anchorTo: 'end'` / `followOnAppend` and
// never drives `scrollToEnd()`.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'

/**
 * Rows at or above this count render through the virtualized window; smaller
 * conversations keep the plain full-map path. Mirrors the trajectory ledger's
 * `VIRTUALIZATION_THRESHOLD` convention.
 */
export const CHAT_VIRTUALIZATION_THRESHOLD = 100

/** Rows mounted beyond the visible window on each edge. */
export const CHAT_VIRTUAL_OVERSCAN_ROWS = 8

/** Row height estimate before a row measures; only affects first layout. */
export const VIRTUAL_ROW_ESTIMATE_PX = 72

/** Fallback scrollport height before the scroll element reports its rect. */
export const CHAT_VIRTUAL_INITIAL_VIEWPORT_PX = 600

/** The virtualized Chat flow window plus key/offset resolution for ChatView. */
export interface ChatVirtualFlow {
  /** Whether the virtualized window currently renders the flow rows. */
  readonly enabled: boolean
  /** Mounted virtual range, in flow order. Empty when disabled. */
  readonly items: readonly VirtualItem[]
  /** Measured-plus-estimated height of the whole loaded flow. */
  readonly totalSize: number
  /**
   * Ref callback measuring one row's border box (leading-gap padding
   * included). Present only while enabled; rows keep their last measurement
   * when they unmount, so prepended offsets stay stable.
   */
  readonly measureElement: ((node: HTMLDivElement | null) => void) | undefined
  /**
   * Absolute scroll offset of one row's top edge, resolved from the row's
   * stable node key; null when virtualization is off or the key is unknown.
   */
  readonly offsetOfKey: (key: string) => number | null
  /**
   * Flow index of the nearest row at or above one absolute scroll offset;
   * null when virtualization is off or the offset is above the first row.
   */
  readonly indexAtOffset: (offset: number) => number | null
}

/**
 * Window the loaded Chat flow through TanStack Virtual.
 * @param order - current visible Chat node keys, in flow order.
 * @param getScrollElement - resolves the owning scrollport (`scrollerOf`).
 * @param scrollMargin - height of the flow head (leading blocks) above row 0.
 * @returns the mounted window plus key/offset resolution for ChatView's
 *   scroll, prepend, and jump logic.
 */
export function useChatVirtualizer(
  order: readonly string[],
  getScrollElement: () => HTMLDivElement | null,
  scrollMargin: number,
): ChatVirtualFlow {
  const enabled = order.length > CHAT_VIRTUALIZATION_THRESHOLD
  // Option identities feed the virtualizer's internal memoization: unstable
  // callbacks would rebuild measurements (and notify) on every render.
  const estimateSize = useCallback(() => VIRTUAL_ROW_ESTIMATE_PX, [])
  const getItemKey = useCallback((index: number) => order[index] ?? `#${String(index)}`, [order])
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: enabled ? order.length : 0,
    enabled,
    overscan: CHAT_VIRTUAL_OVERSCAN_ROWS,
    estimateSize,
    getItemKey,
    getScrollElement,
    initialRect: { width: 0, height: CHAT_VIRTUAL_INITIAL_VIEWPORT_PX },
    scrollMargin,
  })

  const indexByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const [index, key] of order.entries()) map.set(key, index)
    return map
  }, [order])

  const offsetOfKey = useCallback((key: string): number | null => {
    if (!enabled) return null
    const index = indexByKey.get(key)
    if (index === undefined) return null
    const offset = virtualizer.getOffsetForIndex(index, 'start')
    return offset === undefined ? null : offset[0]
  }, [enabled, indexByKey, virtualizer])

  const indexAtOffset = useCallback((offset: number): number | null => {
    if (!enabled) return null
    const item = virtualizer.getVirtualItemForOffset(offset)
    return item === undefined ? null : item.index
  }, [enabled, virtualizer])

  const items = enabled ? virtualizer.getVirtualItems() : []
  return {
    enabled,
    items,
    totalSize: enabled ? virtualizer.getTotalSize() : 0,
    measureElement: enabled
      ? (node) => { virtualizer.measureElement(node) }
      : undefined,
    offsetOfKey,
    indexAtOffset,
  }
}

/**
 * Measure the flow head — the leading hint/error/load-older block that only
 * exists on the virtualized path — and publish its height as the virtualizer's
 * `scrollMargin`. The height is semantic state (leading blocks appear, settle,
 * or reflow), not scroll feedback, so publishing it through React state keeps
 * the virtualizer's offsets aligned with the real layout.
 * @returns a callback ref for the flow-head element and its current height.
 */
export function useFlowHeadHeight(): {
  readonly ref: (node: HTMLDivElement | null) => void
  readonly height: number
} {
  const [height, setHeight] = useState(0)
  const observerRef = useRef<ResizeObserver | null>(null)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const readHeight = useCallback((node: HTMLDivElement | null): void => {
    setHeight(node === null ? 0 : node.offsetHeight)
  }, [])
  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    nodeRef.current = node
    if (node === null || typeof ResizeObserver === 'undefined') {
      readHeight(null)
      return
    }
    const observer = new ResizeObserver(() => { readHeight(node) })
    observer.observe(node)
    observerRef.current = observer
    readHeight(node)
  }, [readHeight])
  useEffect(() => () => {
    observerRef.current?.disconnect()
    observerRef.current = null
    nodeRef.current = null
  }, [])
  return { ref, height }
}
