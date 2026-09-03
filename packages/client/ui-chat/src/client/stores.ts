/** Per-Session Chat selection store shared by the transcript and details panel. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type {
  ChatNodeDisclosureState, ChatStoreState, SelectionTarget, TurnProcessViewEntry,
} from './contract/store.ts'

type ChatActions = {
  select: (draft: ChatStoreState, target: SelectionTarget | null) => void
  setTurnProcessOpen: (
    draft: ChatStoreState,
    turn: number,
    answerStep: number,
    open: boolean,
  ) => void
}

type ChatNodeDisclosureActions = {
  setDisclosure: (draft: ChatNodeDisclosureState, key: string, expanded: boolean) => void
}

/**
 * Resolve the manually expanded answer for one Turn.
 * @param state - Chat store snapshot.
 * @param turn - owning Turn.
 * @returns the Turn's stored entry, when present.
 */
export function storedTurnProcessEntry(
  state: Readonly<ChatStoreState>,
  turn: number,
): Readonly<TurnProcessViewEntry> | undefined {
  return state.turnProcesses.find(entry => entry.turn === turn)
}

/**
 * Create the Chat selection store handle.
 * @returns a handle instantiated once per rendered Session scope.
 */
export function createChatStore(): EngineStoreHandle<ChatStoreState, ChatActions> {
  return defineStore({
    init: (): ChatStoreState => ({ selection: null, turnProcesses: [] }),
    actions: {
      select: (draft, target: SelectionTarget | null) => { draft.selection = target },
      setTurnProcessOpen: (draft, turn, answerStep, open) => {
        const index = draft.turnProcesses.findIndex(entry => entry.turn === turn)
        if (!open) {
          if (index >= 0) draft.turnProcesses.splice(index, 1)
          return
        }
        const next = { turn, answerStep } satisfies TurnProcessViewEntry
        if (index < 0) draft.turnProcesses.push(next)
        else draft.turnProcesses[index] = next
      },
    },
  })
}

/**
 * Create the Chat node disclosure store handle: keyed expansion state for
 * renderer-local disclosure rows (system prompt, context injection, command
 * cards, reasoning blocks). Only `true` means expanded; virtualization
 * unmounts rows outside the window, so this state lives outside the renderers
 * it drives; one handle is shared by every registration whose renderer owns a
 * disclosure row.
 * @returns a handle instantiated once per rendered Session scope.
 */
export function createChatNodeStore(): EngineStoreHandle<ChatNodeDisclosureState, ChatNodeDisclosureActions> {
  return defineStore({
    init: (): ChatNodeDisclosureState => ({ disclosures: {} }),
    actions: {
      setDisclosure: (draft, key, expanded) => {
        // Assign rather than delete (no-dynamic-delete): readers test
        // `=== true`, and per-key entries stay bounded by reader interactions
        // and die with the Session scope.
        draft.disclosures[key] = expanded
      },
    },
  })
}
