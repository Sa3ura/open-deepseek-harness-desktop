/** Narrow desktop bridge for source update checks and confirmed upgrades. */

import { contextBridge, ipcRenderer } from 'electron'
import type { SourceUpdateResult, SourceUpdateStatus } from './source-updater.ts'

/** Renderer-visible update methods; no generic process or filesystem access is exposed. */
export interface DesktopUpdateBridge {
  check(): Promise<SourceUpdateStatus>
  upgrade(expectedCommit: string): Promise<SourceUpdateResult>
  restart(): Promise<{ restarting: true }>
}

const bridge: DesktopUpdateBridge = {
  check: () => ipcRenderer.invoke('dsh:source-update:check') as Promise<SourceUpdateStatus>,
  upgrade: expectedCommit => ipcRenderer.invoke('dsh:source-update:upgrade', expectedCommit) as Promise<SourceUpdateResult>,
  restart: () => ipcRenderer.invoke('dsh:source-update:restart') as Promise<{ restarting: true }>,
}

contextBridge.exposeInMainWorld('deepSeekHarnessDesktop', Object.freeze({ updater: Object.freeze(bridge) }))
