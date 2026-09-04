import { memo, useCallback, useLayoutEffect, useMemo } from 'react'
import { JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationLocationDataStore, ConversationTurnDataMap } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeOwnerProps, ChatViewSlotProps } from '../contract/slots.ts'
import type { ChatNode } from '../contract/chat-nodes.ts'
import { TURN_PROCESS_INDEPENDENT_KINDS } from '../contract/turn-process.ts'
import { storedTurnProcessEntry } from '../stores.ts'
import { useSearchableHidden } from './searchable-hidden.ts'
import css from './ChatView.module.css'

interface ChatNodeSeatProps extends ChatNodeOwnerProps {
  readonly nodeKey: string
  readonly useChatNode: ChatViewSlotProps['useChatNode']
  readonly useChatNodeProcess: ChatViewSlotProps['useChatNodeProcess']
  readonly historyIncomplete: boolean
  readonly compactTranscript: boolean
  readonly useStore: ChatViewSlotProps['useStore']
  readonly actions: ChatViewSlotProps['actions']
  readonly renderSlot: ChatViewSlotProps['renderSlot']
  readonly t: ChatViewSlotProps['t']
  /** TanStack measurement ref; present only on the virtualized render path. */
  readonly measureRef?: ((node: HTMLDivElement | null) => void) | undefined
  /** The conversation scrollport — the focus target when this row unmounts
   *  while holding focus, so virtual unmounts never strand native keyboard
   *  scrolling on the body. */
  readonly focusScroller?: (() => HTMLElement | null) | undefined
  /** Virtual item index; TanStack's measureElement resolves rows by `data-index`. */
  readonly dataIndex?: number | undefined
  /** First flow row with no leading block above it: owns no leading gap. */
  readonly firstRow?: boolean | undefined
}

type RoutedChatNodeOwner = {
  [Kind in ChatNode['kind']]: ChatNodeOwnerProps & { readonly node: ChatNode<Kind> }
}[ChatNode['kind']]

function turnDataOf(node: ChatNode | undefined): ConversationLocationDataStore<ConversationTurnDataMap> | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.data : undefined
}

function turnOf(node: ChatNode | undefined): number | undefined {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn.turn : undefined
}

/** Subscribe, apply Turn-process visibility, and dispatch one stable Context key. */
export const ChatNodeSeat = memo(function ChatNodeSeat({
  nodeKey, useChatNode, useChatNodeProcess, historyIncomplete, compactTranscript,
  selectedCallId, cwd, openFile, inspectCall, forkAt,
  renderMessageImages, fileMentions, useStore, actions, renderSlot, t,
  measureRef, dataIndex, firstRow, focusScroller,
}: ChatNodeSeatProps) {
  const node = useChatNode(nodeKey)
  const routedNode = node as ChatNode | undefined
  const turn = turnOf(routedNode)
  const processPresentation = useChatNodeProcess(nodeKey)
  const processSpec = processPresentation?.spec
  const storedEntry = useStore(state => processSpec === undefined
    ? undefined
    : storedTurnProcessEntry(state, processSpec.turn))
  const processEntry = processSpec !== undefined
    && processSpec.answerStep !== null
    && storedEntry?.answerStep === processSpec.answerStep
    ? storedEntry
    : undefined
  const processOpen = processEntry !== undefined
  const setOpen = useCallback((open: boolean) => {
    if (processSpec !== undefined && processSpec.answerStep !== null) {
      actions.setTurnProcessOpen(processSpec.turn, processSpec.answerStep, open)
    }
  }, [actions, processSpec])
  const processWindowReady = processSpec !== undefined
    && processPresentation !== undefined
    && compactTranscript
    && processSpec.answerAnchorSeq !== null
    && processPresentation.turn === processSpec.turn
    && processPresentation.turnClosed
    && !historyIncomplete
  const processMember = routedNode !== undefined
    && processWindowReady
    && !TURN_PROCESS_INDEPENDENT_KINDS.has(routedNode.kind)
    && routedNode.anchorSeq >= processSpec.processStartSeq
    && routedNode.anchorSeq < processSpec.answerAnchorSeq
  const processAnswer = routedNode !== undefined
    && processWindowReady
    && routedNode.kind === 'assistant-step'
    && routedNode.data.step === processSpec.answerStep
  const ownsDisclosure = routedNode?.kind === 'turn-process' || processAnswer
  const foldable = processWindowReady
    && (processMember || (ownsDisclosure
      && (processPresentation.hasExternalProcess || processSpec.inlineReasoning)))
  const turnProcess = useMemo(() => processSpec === undefined
    ? undefined
    : {
      spec: processSpec,
      foldable,
      open: processOpen,
      setOpen,
    }, [
    foldable, processOpen, processSpec, setOpen,
  ])
  const controllerInactive = routedNode?.kind === 'turn-process'
    && !foldable
  const compactAnswer = processAnswer
    && foldable
    && processPresentation.compactAnswer
    && !processOpen
  const processHidden = controllerInactive || (foldable && processMember && !processOpen)
  const revealProcess = useCallback(() => {
    if (processMember) setOpen(true)
  }, [processMember, setOpen])
  const wrapperRef = useSearchableHidden(processHidden, revealProcess)
  // Runs during the deletion commit, before React removes the seat's DOM:
  // a row about to unmount while holding focus hands it to the conversation
  // scrollport, so the browser's native keyboard scrolling (End, PageUp)
  // keeps panning the transcript instead of dying on <body>. The element is
  // captured at mount because React detaches child refs before running this
  // destroy hook; rows without focus never touch focus state.
  useLayoutEffect(() => {
    const seat = wrapperRef.current
    return () => {
      const active = seat?.ownerDocument.activeElement
      if (seat !== null && active instanceof Node && seat.contains(active)) {
        focusScroller?.()?.focus({ preventScroll: true })
      }
    }
  }, [focusScroller, wrapperRef])
  // One callback ref feeds both the searchable-hidden subtree and the
  // virtualizer's row measurement; the seat wrapper is the measured unit.
  const setWrapperRef = useCallback((element: HTMLDivElement | null) => {
    wrapperRef.current = element
    measureRef?.(element)
  }, [measureRef, wrapperRef])
  const owner = useMemo<ChatNodeOwnerProps | null>(() => node === undefined
    ? null
    : {
      selectedCallId,
      cwd,
      openFile,
      inspectCall,
      forkAt,
      renderMessageImages,
      fileMentions,
      turnProcess,
    }, [
    node, selectedCallId, cwd, openFile, inspectCall, forkAt,
    renderMessageImages, fileMentions, turnProcess,
  ])
  if (routedNode === undefined || owner === null) return null
  const turnData = turnDataOf(routedNode)
  // Runtime dispatch owns the correlation: every Node's discriminant is the
  // keyed-slot entry passed alongside that same Node. TypeScript does not
  // distribute an object containing a union into a union of objects itself.
  const routedOwner = { ...owner, node: routedNode } as RoutedChatNodeOwner
  return (
    <div
      ref={setWrapperRef}
      className={css.flowItem}
      data-index={dataIndex}
      data-chat-flow-head={firstRow || undefined}
      data-chat-anchor-key={routedNode.key}
      data-chat-flow-key={routedNode.key}
      data-chat-flow-kind={routedNode.kind}
      data-chat-turn={turn}
      data-turn-process-member={processMember || undefined}
      data-turn-process-hidden={processHidden || undefined}
      data-turn-process-answer={compactAnswer || undefined}
    >
      {renderSlot('conversation.chat.node', routedOwner, {
        entryKey: routedNode.kind,
        hookContext: turnData,
        fallback: (
          <JsonBlock
            label={t('message.unknownSurface', { type: routedNode.kind })}
            payload={routedNode.data}
            truncatedLabel={total => t('json.truncated', { total })}
          />
        ),
      })}
    </div>
  )
})
