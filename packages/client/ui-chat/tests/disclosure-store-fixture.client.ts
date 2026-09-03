/** Zero-machinery disclosure store share for component specs. */
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatNodeDisclosureStore } from '../src/client/contract/slots.ts'
import { createChatNodeStore } from '../src/client/stores.ts'

/**
 * Instantiate one disclosure store per case and bind its PropsStore share —
 * the sanctioned zero-machinery path for driving declared stores in specs.
 * @returns the share AssistantMarkdown and the disclosure node renderers take.
 */
export function disclosureShare(): PropsStore<ChatNodeDisclosureStore> {
  const instance = createChatNodeStore().create()
  return { useStore: bindSnapshotSelector(instance), actions: instance.actions }
}
