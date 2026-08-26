/** Pure selected-text eligibility, quoting, and fixed-panel placement helpers. */

const ACTION_SCOPE = '[data-selection-actions-scope]'
const INTERACTIVE = [
  '[data-selection-actions-exclude]',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'a',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(',')

/** Immutable information retained after the browser selection changes. */
export interface SelectionSnapshot {
  readonly text: string
  readonly rect: DOMRect
}

/** Viewport point used to anchor the right-click menu. */
export interface ViewportPoint {
  readonly x: number
  readonly y: number
}

/** Measured fixed-position surface size. */
export interface PanelSize {
  readonly width: number
  readonly height: number
}

/** Fixed-position surface coordinates. */
export interface PanelPosition {
  readonly left: number
  readonly top: number
}

/** Browser viewport dimensions. */
export interface ViewportSize {
  readonly width: number
  readonly height: number
}

function elementOf(node: Node | null): Element | null {
  if (node === null) return null
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
}

function eligibleEndpoint(node: Node, scope: Element): boolean {
  const element = elementOf(node)
  return element !== null && scope.contains(element) && element.closest(INTERACTIVE) === null
}

/**
 * Capture a non-empty browser selection contained by one approved read-only region.
 * @param selection - browser selection to inspect.
 * @param eventTarget - pointer target that completed or invoked the selection.
 * @returns immutable selected text and range bounds, or null when ineligible.
 */
export function captureSelection(selection: Selection | null, eventTarget: EventTarget | null): SelectionSnapshot | null {
  if (selection === null || selection.rangeCount !== 1 || selection.isCollapsed) return null
  const target = eventTarget instanceof Node ? elementOf(eventTarget) : null
  const scope = target?.closest(ACTION_SCOPE)
  if (scope === null || scope === undefined || target?.closest(INTERACTIVE) !== null) return null
  const range = selection.getRangeAt(0)
  if (!eligibleEndpoint(range.startContainer, scope) || !eligibleEndpoint(range.endContainer, scope)) return null
  if (!range.intersectsNode(target)) return null
  const text = selection.toString()
  if (text.trim() === '') return null
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { text, rect }
}

/**
 * Convert plain text into a Markdown quote while preserving its line structure.
 * @param text - selected plain text.
 * @returns normalized quote block.
 */
export function quoteSelection(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim().split('\n').map(line => `> ${line}`).join('\n')
}

/**
 * Append one quote block without replacing an existing draft.
 * @param draft - current composer draft.
 * @param selectedText - selected plain text.
 * @returns complete next draft.
 */
export function appendSelectionToDraft(draft: string, selectedText: string): string {
  const quote = quoteSelection(selectedText)
  return draft.trimEnd() === '' ? quote : `${draft.trimEnd()}\n\n${quote}`
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), Math.max(lower, upper))
}

/**
 * Place the horizontal toolbar above the range when possible, otherwise below it.
 * @param rect - selected range bounds.
 * @param panel - measured toolbar size.
 * @param viewport - current viewport size.
 * @returns clamped fixed coordinates.
 */
export function placeSelectionToolbar(rect: DOMRect, panel: PanelSize, viewport: ViewportSize): PanelPosition {
  const margin = 8
  const gap = 8
  const above = rect.top - panel.height - gap
  const top = above >= margin ? above : rect.bottom + gap
  return {
    left: clamp(rect.left + rect.width / 2 - panel.width / 2, margin, viewport.width - panel.width - margin),
    top: clamp(top, margin, viewport.height - panel.height - margin),
  }
}

/**
 * Place the vertical context menu beside the pointer and flip at viewport edges.
 * @param point - context-menu pointer position.
 * @param panel - measured menu size.
 * @param viewport - current viewport size.
 * @returns clamped fixed coordinates.
 */
export function placeContextMenu(point: ViewportPoint, panel: PanelSize, viewport: ViewportSize): PanelPosition {
  const margin = 8
  const gap = 4
  const preferredLeft = point.x + gap
  const preferredTop = point.y + gap
  const left = preferredLeft + panel.width + margin <= viewport.width
    ? preferredLeft
    : point.x - panel.width - gap
  const top = preferredTop + panel.height + margin <= viewport.height
    ? preferredTop
    : point.y - panel.height - gap
  return {
    left: clamp(left, margin, viewport.width - panel.width - margin),
    top: clamp(top, margin, viewport.height - panel.height - margin),
  }
}
