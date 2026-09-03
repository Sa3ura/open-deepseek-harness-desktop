// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import type React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ChatNode } from '../src/client/contract/chat-nodes.ts'
import { SystemPromptNodeView } from '../src/client/chat/SystemPromptRow.tsx'
import { en } from '../src/client/locale.ts'
import { disclosureShare } from './disclosure-store-fixture.client.ts'

afterEach(cleanup)

describe('SystemPromptNodeView', () => {
  it('mounts the opaque context body only while its row is expanded', () => {
    const text = '# Agent rules\n\n- Read first\n- **Act carefully**'
    const node: ChatNode<'system-prompt'> = {
      key: 'request-prompt:1',
      kind: 'system-prompt',
      id: '1',
      target: 'chat',
      anchorSeq: 1,
      location: { kind: 'unresolved' },
      visibility: 'visible',
      data: { text },
    }
    const viewProps = {
      node,
      openFile: () => {},
      inspectCall: () => {},
      forkAt: () => {},
      renderMessageImages: () => null,
      fileMentions: () => undefined,
      useTurnData: () => undefined,
      ...disclosureShare(),
      t: makeTranslate(en),
    } as never as React.ComponentProps<typeof SystemPromptNodeView>
    const { container } = render(<SystemPromptNodeView {...viewProps} />)

    const disclosure = screen.getByRole('button', { name: 'System prompt' })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-system-prompt-body]')).toBeNull()
    expect(container.querySelector('[data-context-text]')).toBeNull()

    fireEvent.click(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[data-system-prompt-body]')).not.toBeNull()
    expect(container.querySelector('[data-context-text]')?.textContent).toBe(text)
    expect(screen.queryByRole('heading', { name: 'Agent rules' })).toBeNull()

    fireEvent.click(disclosure)
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-system-prompt-body]')).toBeNull()
  })

  it('keeps the expanded choice across an unmount and remount', () => {
    const text = '# Agent rules\n\n- Read first'
    const node: ChatNode<'system-prompt'> = {
      key: 'request-prompt:1',
      kind: 'system-prompt',
      id: '1',
      target: 'chat',
      anchorSeq: 1,
      location: { kind: 'unresolved' },
      visibility: 'visible',
      data: { text },
    }
    const props = {
      node,
      openFile: () => {},
      inspectCall: () => {},
      forkAt: () => {},
      renderMessageImages: () => null,
      fileMentions: () => undefined,
      ...disclosureShare(),
      useTurnData: () => undefined,
      t: makeTranslate(en),
    } as never as React.ComponentProps<typeof SystemPromptNodeView>
    const first = render(<SystemPromptNodeView {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'System prompt' }))
    expect(screen.getByRole('button', { name: 'System prompt' }).getAttribute('aria-expanded')).toBe('true')
    first.unmount()

    const second = render(<SystemPromptNodeView {...props} />)
    expect(screen.getByRole('button', { name: 'System prompt' }).getAttribute('aria-expanded')).toBe('true')
    expect(second.container.querySelector('[data-system-prompt-body]')).not.toBeNull()
  })
})
