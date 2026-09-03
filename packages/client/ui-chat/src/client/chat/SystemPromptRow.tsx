import { memo } from 'react'
import type { ChatNodeDisclosureViewProps, ChatViewSlotProps } from '../contract/slots.ts'
import { DisclosureRow, IconBrowseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { OpaqueBody } from './ContextBody.tsx'
import css from './ContextInjectionRow.module.css'

/** Props for one complete system prompt disclosure. */
export interface SystemPromptRowProps {
  /** Complete model-visible prompt text. */
  text: string
  /** Controlled expansion state persisted in the node disclosure store. */
  expanded: boolean
  /** Publishes the next controlled expansion state. */
  onToggle: (expanded: boolean) => void
  /** The owning view's locale seat. */
  t: ChatViewSlotProps['t']
}

/**
 * Render one complete system prompt as a collapsed disclosure whose expanded
 * body is the same opaque context chrome: 141px code-block scrollport and
 * model-facing text with its real line breaks.
 * @param props - Complete prompt text, controlled expansion, and the locale seat.
 * @returns The system-prompt disclosure row.
 */
export function SystemPromptRow({ text, expanded, onToggle, t }: SystemPromptRowProps) {
  return (
    <DisclosureRow
      className={css.root}
      icon={<IconBrowseOutline16 size={14} />}
      chevronClassName={css.chevron}
      title={t('message.systemPrompt')}
      open={expanded}
      expandable
      expandOnRowClick
      onToggle={() => { onToggle(!expanded) }}
    >
      <div className={css.body} data-system-prompt-body>
        <OpaqueBody content={[{ type: 'text', text }]} source={null} t={t} />
      </div>
    </DisclosureRow>
  )
}

/** System-prompt keyed Chat renderer. */
export const SystemPromptNodeView = memo(function SystemPromptNodeView({
  node, useStore, actions, t,
}: ChatNodeDisclosureViewProps<'system-prompt'>) {
  const key = `system-prompt:${node.key}`
  const expanded = useStore(state => state.disclosures[key] === true)
  return (
    <SystemPromptRow
      text={node.data.text}
      expanded={expanded}
      onToggle={(next) => { actions.setDisclosure(key, next) }}
      t={t}
    />
  )
})
