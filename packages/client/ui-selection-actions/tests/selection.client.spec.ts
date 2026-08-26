// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendSelectionToDraft, captureSelection, placeContextMenu, placeSelectionToolbar, quoteSelection,
} from '../src/client/selection.ts'

function rect(values: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 20, y: 40, left: 20, top: 40, right: 120, bottom: 60,
    width: 100, height: 20, toJSON: () => ({}), ...values,
  }
}

describe('selected-text helpers', () => {
  beforeEach(() => { document.body.replaceChildren() })

  it('captures only non-empty selections inside one read-only scope', () => {
    const scope = document.createElement('div')
    scope.dataset.selectionActionsScope = ''
    const text = document.createTextNode('alpha beta')
    const paragraph = document.createElement('p')
    paragraph.appendChild(text)
    scope.appendChild(paragraph)
    document.body.appendChild(scope)

    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 5)
    range.getBoundingClientRect = vi.fn(() => rect())
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(captureSelection(selection, paragraph)).toMatchObject({ text: 'alpha' })

    const input = document.createElement('textarea')
    scope.appendChild(input)
    expect(captureSelection(selection, input)).toBeNull()

    const outside = document.createElement('p')
    outside.textContent = 'outside'
    document.body.appendChild(outside)
    expect(captureSelection(selection, outside)).toBeNull()
  })

  it('rejects a selection that crosses scopes or has no visible rectangle', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    first.dataset.selectionActionsScope = ''
    second.dataset.selectionActionsScope = ''
    const a = document.createTextNode('one')
    const b = document.createTextNode('two')
    first.appendChild(a)
    second.appendChild(b)
    document.body.append(first, second)
    const range = document.createRange()
    range.setStart(a, 0)
    range.setEnd(b, 3)
    range.getBoundingClientRect = vi.fn(() => rect())
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    expect(captureSelection(selection, first)).toBeNull()

    range.setStart(a, 0)
    range.setEnd(a, 3)
    range.getBoundingClientRect = vi.fn(() => rect({ width: 0, height: 0 }))
    expect(captureSelection(selection, first)).toBeNull()
  })

  it('normalizes Markdown quotes and preserves an existing draft', () => {
    expect(quoteSelection('  one\r\n\r\ntwo  ')).toBe('> one\n> \n> two')
    expect(appendSelectionToDraft('', 'one')).toBe('> one')
    expect(appendSelectionToDraft('existing  ', 'one\ntwo')).toBe('existing\n\n> one\n> two')
  })

  it('places both surfaces within the viewport and flips at edges', () => {
    expect(placeSelectionToolbar(rect({ top: 4, bottom: 24 }), { width: 80, height: 32 }, { width: 200, height: 120 }))
      .toEqual({ left: 30, top: 32 })
    expect(placeSelectionToolbar(rect({ left: 190, right: 210 }), { width: 80, height: 32 }, { width: 200, height: 120 }).left)
      .toBe(112)
    expect(placeContextMenu({ x: 195, y: 115 }, { width: 90, height: 70 }, { width: 200, height: 120 }))
      .toEqual({ left: 101, top: 41 })
  })
})
