/** Electron application host for the existing DeepSeek Harness Web GUI. */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { resolveHarnessLaunch } from './launch.ts'
import { HarnessSupervisor, type HarnessState } from './supervisor.ts'
import { SourceUpdater } from './source-updater.ts'

const APP_NAME = 'DeepSeek Harness'
const LOADING_PAGE = fileURLToPath(new URL('./loading.html', import.meta.url))
const PRELOAD = fileURLToPath(new URL('./preload.js', import.meta.url))
const DEFAULT_SOURCE_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

let mainWindow: BrowserWindow | undefined
let supervisor: HarnessSupervisor | undefined
let harnessOrigin: string | undefined
let quitting = false

function showLoading(state: HarnessState): void {
  if (mainWindow === undefined || mainWindow.isDestroyed() || state === 'ready' || state === 'stopped') return
  void mainWindow.loadFile(LOADING_PAGE, { query: { state } })
}

function configureNavigation(window: BrowserWindow): void {
  window.webContents.on('will-navigate', (event, target) => {
    if (harnessOrigin !== undefined && new URL(target).origin === harnessOrigin) return
    event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { action: 'deny' }
    }
    if (parsed.protocol === 'https:') void shell.openExternal(parsed.href)
    return { action: 'deny' }
  })
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f2ed',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: PRELOAD,
    },
  })
  configureNavigation(window)
  window.once('ready-to-show', () => {
    window.show()
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  mainWindow = window
  if (harnessOrigin === undefined) showLoading('starting')
  else void window.loadURL(harnessOrigin)
  return window
}

async function startApplication(): Promise<void> {
  app.setName(APP_NAME)
  await app.whenReady()
  const updater = new SourceUpdater({
    sourceRoot: process.env.DSH_DESKTOP_SOURCE_ROOT ?? DEFAULT_SOURCE_ROOT,
    nodeCommand: process.env.DSH_DESKTOP_NODE_BIN ?? 'node',
  })
  ipcMain.handle('dsh:source-update:check', () => updater.check())
  ipcMain.handle('dsh:source-update:upgrade', (_event, expectedCommit: unknown) => {
    if (typeof expectedCommit !== 'string' || !/^[0-9a-f]{40}$/u.test(expectedCommit)) {
      throw new TypeError('desktop: invalid expected update commit')
    }
    return updater.upgrade(expectedCommit)
  })
  ipcMain.handle('dsh:source-update:restart', () => {
    setTimeout(() => {
      app.relaunch()
      app.quit()
    }, 250)
    return { restarting: true as const }
  })
  createWindow()

  const launch = resolveHarnessLaunch(process.env)
  supervisor = new HarnessSupervisor({
    launch,
    logPath: join(app.getPath('logs'), 'harness.log'),
    environment: { ...process.env },
    onReady: (url) => {
      harnessOrigin = new URL(url).origin
      if (mainWindow !== undefined && !mainWindow.isDestroyed()) void mainWindow.loadURL(url)
    },
    onState: (state) => {
      if (state === 'restarting') harnessOrigin = undefined
      showLoading(state)
    },
  })
  supervisor.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) createWindow()
    if (mainWindow?.isMinimized() === true) mainWindow.restore()
    mainWindow?.show()
    mainWindow?.focus()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    const shutdown = supervisor?.stop()
    if (shutdown === undefined) app.quit()
    else void shutdown.finally(() => {
      app.quit()
    })
  })
  void startApplication().catch((error: unknown) => {
    console.error(error)
    app.quit()
  })
}
