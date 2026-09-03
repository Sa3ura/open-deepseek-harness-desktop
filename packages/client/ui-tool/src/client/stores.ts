/** Per-Session Tool disclosure state, keyed by call id. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Expansion state persisted outside the call-tree renderers. */
export interface ToolDisclosureState {
  /**
   * Call ids whose detail body the reader expanded; only `true` means
   * expanded. Virtualization unmounts rows outside the Chat window, so
   * the expanded choice lives here instead of component-local state. Entries
   * die with the Session scope that instantiated the store and grow only with
   * reader interactions, never with loaded history.
   */
  expandedCalls: Record<string, boolean>
}

/** Mutation API of the Tool disclosure store. */
export type ToolDisclosureActions = {
  setCallExpanded: (draft: ToolDisclosureState, callId: string, expanded: boolean) => void
}

/**
 * Create the Tool disclosure store handle. Only `true` means expanded.
 * @returns a handle instantiated once per rendered Session scope on the
 *   `tool-call` Chat Node registration.
 */
export function createToolDisclosureStore(): EngineStoreHandle<ToolDisclosureState, ToolDisclosureActions> {
  return defineStore({
    init: (): ToolDisclosureState => ({ expandedCalls: {} }),
    actions: {
      setCallExpanded: (draft, callId, expanded) => {
        // Assign rather than delete (no-dynamic-delete): readers test
        // `=== true`, and per-call entries stay bounded by reader
        // interactions and die with the Session scope.
        draft.expandedCalls[callId] = expanded
      },
    },
  })
}
