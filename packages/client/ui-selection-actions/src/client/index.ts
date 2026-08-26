/** Browser plugin for selected-text actions in read-only conversation surfaces. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { SelectionActions, type SelectionActionsInjected } from './SelectionActions.tsx'
import { appendSelectionToDraft } from './selection.ts'
import { en, NS, zh, type SelectionActionsKey } from './locales.ts'

export type { SelectionActionsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Contextual selected-text action copy. */
    selectionActions: SelectionActionsKey
  }
}

/** Required client services. */
export const inject = ['slots', 'sessions', 'workspaces', 'conversation', 'locale']

function appendAvailable(ctx: ClientContext, sessionId: SessionId | undefined): boolean {
  if (sessionId === undefined) return false
  const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
  if (summary === undefined || summary.pendingInteraction !== undefined) return false
  const actx = ctx.sessions.scope(sessionId)
  if (actx === undefined) return false
  const session = ctx.sessions.sessionOf(actx)?.getSnapshot()
  if (session === undefined || session.removed || session.openState !== 'open' || session.pending.length > 0) return false
  if (session.subagent?.address.mode === 'continuable' && !session.subagent.parentAvailable) return false
  if (ctx.conversation.blocks.storeFor(sessionId).getSnapshot() !== undefined) return false
  const phase = ctx.conversation.input.for(actx).state.getSnapshot().phase
  return phase !== 'adjudicating' && phase !== 'submitting'
}

function createAppendAvailability(ctx: ClientContext): HostObservable<boolean> {
  return {
    getSnapshot: () => appendAvailable(ctx, ctx.sessions.list.getSnapshot().current),
    subscribe: (listener) => {
      let nestedStops: (() => void)[] = []
      const stopNested = (): void => {
        for (const stop of nestedStops) stop()
        nestedStops = []
      }
      const bindCurrent = (): void => {
        stopNested()
        const sessionId = ctx.sessions.list.getSnapshot().current
        if (sessionId === undefined) return
        const actx = ctx.sessions.scope(sessionId)
        if (actx === undefined) return
        const session = ctx.sessions.sessionOf(actx)
        if (session === undefined) return
        nestedStops = [
          session.subscribe(listener),
          ctx.conversation.input.for(actx).state.subscribe(listener),
          ctx.conversation.blocks.storeFor(sessionId).subscribe(listener),
        ]
      }
      const stopSessions = ctx.sessions.list.subscribe(() => {
        bindCurrent()
        listener()
      })
      bindCurrent()
      return () => {
        stopSessions()
        stopNested()
      }
    },
  }
}

/** Register the localized root-overlay contribution. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-selection-actions: dictionaries')
  const availability = createAppendAvailability(ctx)
  const injected = (): SelectionActionsInjected => ({
    hooks: { appendAvailable: availability },
    copy: writeClipboard,
    askInNewConversation: async (workspaceId, draft) => {
      const sessionId = await ctx.workspaces.connectWorkspace(workspaceId)
      const actx = ctx.sessions.scope(sessionId)
      if (actx === undefined) throw new Error(`selection actions: session "${sessionId}" has no scope`)
      ctx.conversation.input.for(actx).setDraft(draft)
      ctx.sessions.open(sessionId)
    },
    appendToCurrent: (sessionId, text) => {
      const current = ctx.sessions.list.getSnapshot().current
      if (current !== sessionId || !appendAvailable(ctx, sessionId)) {
        throw new Error('selection actions: current composer is not editable')
      }
      const actx = ctx.sessions.scope(sessionId)
      if (actx === undefined) throw new Error(`selection actions: session "${sessionId}" has no scope`)
      const input = ctx.conversation.input.for(actx)
      input.setDraft(appendSelectionToDraft(input.state.getSnapshot().draft, text))
    },
  })

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'selection-actions',
    order: 10,
    locale: NS,
    inject: injected,
  }, SelectionActions))
}
