import type { SettingsSectionRow } from './shell-contract.ts'

/** Drop edge selected from the pointer's position within a navigation row. */
export type SectionDropPosition = 'before' | 'after'

/** Viewport geometry captured for one visible settings row. */
export interface SettingsSectionBox {
  id: string
  top: number
  bottom: number
  height: number
}

/** Remove empty and duplicate ids without trusting durable data blindly. */
export function normalizeSectionOrder(order: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  return order.filter((id) => {
    if (id.length === 0 || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * Apply a durable id order to the currently registered rows. Newly registered
 * plugin sections remain visible at the end in their canonical ledger order.
 */
export function orderSettingsSections(
  rows: readonly SettingsSectionRow[],
  storedOrder: readonly string[],
): readonly SettingsSectionRow[] {
  const normalized = normalizeSectionOrder(storedOrder)
  if (normalized.length === 0) return rows
  const byId = new Map(rows.map(row => [row.id, row]))
  const ordered = normalized.flatMap(id => byId.get(id) ?? [])
  const known = new Set(normalized)
  ordered.push(...rows.filter(row => !known.has(row.id)))
  return ordered
}

/** Compute one visible row move and preserve stale ids for reinstalled plugins. */
export function moveSettingsSection(
  visibleIds: readonly string[],
  storedOrder: readonly string[],
  draggedId: string,
  targetId: string,
  position: SectionDropPosition,
): readonly string[] {
  if (draggedId === targetId || !visibleIds.includes(draggedId) || !visibleIds.includes(targetId)) {
    return normalizeSectionOrder(storedOrder)
  }
  const next = visibleIds.filter(id => id !== draggedId)
  const targetIndex = next.indexOf(targetId)
  next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, draggedId)

  const visible = new Set(visibleIds)
  const hidden = normalizeSectionOrder(storedOrder).filter(id => !visible.has(id))
  return [...next, ...hidden]
}

/** Resolve an insertion index by comparing the dragged row center with every remaining row center. */
export function settingsSectionTargetIndex(
  boxes: readonly SettingsSectionBox[],
  sourceIndex: number,
  draggedCenterY: number,
): number {
  if (boxes.length <= 1) return 0
  let target = 0
  for (let index = 0; index < boxes.length; index += 1) {
    if (index === sourceIndex) continue
    const box = boxes[index]
    if (box === undefined) continue
    if (draggedCenterY > box.top + box.height / 2) target += 1
  }
  return Math.min(boxes.length - 1, target)
}

/** Translate one non-dragged row so it fills the source slot and leaves the target slot empty. */
export function settingsSectionRowShift(
  boxes: readonly SettingsSectionBox[],
  sourceIndex: number,
  targetIndex: number,
  rowIndex: number,
): number {
  const current = boxes[rowIndex]
  if (current === undefined) return 0
  if (targetIndex < sourceIndex && rowIndex >= targetIndex && rowIndex < sourceIndex) {
    return (boxes[rowIndex + 1]?.top ?? current.bottom) - current.top
  }
  if (targetIndex > sourceIndex && rowIndex > sourceIndex && rowIndex <= targetIndex) {
    return (boxes[rowIndex - 1]?.top ?? current.top) - current.top
  }
  return 0
}

/** Move one visible id to a resolved insertion index while retaining absent plugin ids. */
export function moveSettingsSectionToIndex(
  visibleIds: readonly string[],
  storedOrder: readonly string[],
  draggedId: string,
  targetIndex: number,
): readonly string[] {
  const sourceIndex = visibleIds.indexOf(draggedId)
  if (sourceIndex === -1) return normalizeSectionOrder(storedOrder)
  const next = visibleIds.filter(id => id !== draggedId)
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, draggedId)
  const visible = new Set(visibleIds)
  const hidden = normalizeSectionOrder(storedOrder).filter(id => !visible.has(id))
  return [...next, ...hidden]
}

/** rAF auto-scroll velocity near a scrollport edge. */
export function settingsSectionAutoScroll(
  pointerY: number,
  top: number,
  bottom: number,
  edge = 28,
  maximum = 8,
): number {
  if (pointerY < top || pointerY > bottom) return 0
  if (pointerY < top + edge) return -maximum * (1 - (pointerY - top) / edge)
  if (pointerY > bottom - edge) return maximum * (1 - (bottom - pointerY) / edge)
  return 0
}
