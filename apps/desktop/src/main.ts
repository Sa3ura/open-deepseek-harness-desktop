/** Electron application host for the existing DeepSeek Harness Web GUI. */

import { spawn } from 'node:child_process'
import { appendFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray,
  type MenuItemConstructorOptions, type MessageBoxOptions,
} from 'electron'
import { appendBundledPluginFailure } from './bundled-plugin-seed.ts'
import {
  BundledPluginInstaller,
  installBundledPluginSource,
  parseBundledPluginManifest,
  resolveBundledPluginResourcesDirectory,
  type BundledPluginDeferredStartResult,
  type BundledPluginStartResult,
  type BundledPluginInstallSnapshot,
} from './bundled-plugin-installer.ts'
import {
  acceptsHarnessInvocationExit,
  resolveDevelopmentLaunchOptions,
  resolveHarnessInvocation,
  resolveHarnessLaunch,
  type DesktopLaunchOptions,
  type HarnessLaunch,
} from './launch.ts'
import { allowsHarnessPermission } from './permissions.ts'
import { ensurePackagedRuntime, packagedRuntimeArchiveRoot } from './packaged-runtime.ts'
import { HarnessSupervisor, type HarnessFailure, type HarnessState } from './supervisor.ts'
import { revealHarnessLog, type OpenLogResult } from './log-reveal.ts'
import { createNotificationThrottle, desktopNotificationDictionary } from './notifications.ts'
import {
  createDesktopPreferencesStore, DEFAULT_DESKTOP_PREFERENCES, parseDesktopPreferencesPatch,
  type DesktopPreferences, type DesktopPreferencesStore,
} from './preferences.ts'
import { DesktopReleaseChecker, isAllowedReleaseUrl, type DesktopReleaseStatus } from './release-checker.ts'
import { SourceUpdater } from './source-updater.ts'
import { createDesktopLifecycle, type DesktopLifecycle } from './window-lifecycle.ts'
import { usesCustomWindowFrame, withCustomWindowFrameInset } from './window-frame.ts'
import { stageDiagnosticFixture } from './diagnostic-fixture.ts'
import { parseStartupBuildApproval } from './startup-build-approval.ts'
import {
  desktopDataHomeSetup,
  hasDesktopData,
  importOfficialDesktopData,
  readDesktopDataHomeSetup,
  resolveRecordedDesktopDataHome,
  resolveDesktopDataHomeLayout,
  writeDesktopDataHomeSetup,
  type DesktopDataHomeLayout,
} from './desktop-data-home.ts'

const APP_NAME = 'DeepSeek Harness'
const LOADING_PAGE = fileURLToPath(new URL('./loading.html', import.meta.url))
const WINDOW_ICON = fileURLToPath(new URL('./icon.png', import.meta.url))
const DEVELOPMENT_DOCK_ICON = fileURLToPath(new URL('./dev-dock-icon.png', import.meta.url))
const MACOS_TRAY_ICON = fileURLToPath(new URL('./tray-iconTemplate.png', import.meta.url))
const PRELOAD = fileURLToPath(new URL('./preload.cjs', import.meta.url))
const DATA_HOME_PAGE = fileURLToPath(new URL('./data-home.html', import.meta.url))
const DATA_HOME_PRELOAD = fileURLToPath(new URL('./data-home-preload.cjs', import.meta.url))
const DEFAULT_SOURCE_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const DESKTOP_DATA_HOME = resolveDesktopDataHomeLayout(
  app.getPath('appData'),
  homedir(),
  app.isPackaged,
  process.env,
)

app.setName(APP_NAME)
app.setPath('userData', DESKTOP_DATA_HOME.desktopRoot)
app.setPath('sessionData', DESKTOP_DATA_HOME.sessionData)
app.setAppLogsPath(DESKTOP_DATA_HOME.logs)

let mainWindow: BrowserWindow | undefined
let supervisor: HarnessSupervisor | undefined
let harnessOrigin: string | undefined
let lifecycle: DesktopLifecycle | undefined
let preferencesStore: DesktopPreferencesStore | undefined
let preferences: DesktopPreferences = { ...DEFAULT_DESKTOP_PREFERENCES }
let tray: Tray | undefined
let quitReleased = false
let hiddenLaunch = false
let harnessLogPath = ''
let releaseChecker: DesktopReleaseChecker | undefined
let bundledPluginInstaller: BundledPluginInstaller | undefined

type DataHomeSelection = 'imported' | 'reused' | 'fresh'

class DesktopDataHomeSelectionCancelledError extends Error {
  constructor() {
    super('desktop: data-home selection was cancelled')
    this.name = 'DesktopDataHomeSelectionCancelledError'
  }
}

interface DesktopCapabilities {
  platform: NodeJS.Platform
  packaged: boolean
  launchAtLoginAvailable: boolean
  sourceUpdateAvailable: boolean
}

function desktopCapabilities(): DesktopCapabilities {
  return {
    platform: process.platform,
    packaged: app.isPackaged,
    launchAtLoginAvailable: app.isPackaged && process.platform === 'darwin',
    sourceUpdateAvailable: !app.isPackaged,
  }
}

function desktopCopy(): {
  open: string
  openLog: string
  launchAtLogin: string
  notifications: string
  quit: string
  logErrorTitle: string
} {
  return app.getLocale().toLowerCase().startsWith('zh')
    ? {
      open: '打开窗口', openLog: '打开 Harness 日志', launchAtLogin: '开机自启',
      notifications: '系统通知', quit: '退出', logErrorTitle: '无法打开日志',
    }
    : {
      open: 'Open Window', openLog: 'Open Harness Log', launchAtLogin: 'Launch at Login',
      notifications: 'Notifications', quit: 'Quit', logErrorTitle: 'Could Not Open Log',
    }
}

function dataHomeCopy(): {
  completeTitle: string
  completeMessage: string
  failedTitle: string
} {
  return app.getLocale().toLowerCase().startsWith('zh')
    ? {
      completeTitle: '导入完成', completeMessage: '官方数据已复制到独立的桌面目录。',
      failedTitle: '无法导入官方数据',
    }
    : {
      completeTitle: 'Import complete', completeMessage: 'Official data was copied into the independent desktop directory.',
      failedTitle: 'Could not import official data',
    }
}

function isDataHomeSelection(value: unknown): value is DataHomeSelection {
  return value === 'imported' || value === 'reused' || value === 'fresh'
}

async function showDataHomeChooser(initialSelection: DataHomeSelection = 'imported'): Promise<DataHomeSelection> {
  const chooser = new BrowserWindow({
    title: APP_NAME,
    width: 1080,
    height: 720,
    useContentSize: true,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: '#ffffff',
    icon: WINDOW_ICON,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: DATA_HOME_PRELOAD,
    },
  })
  chooser.webContents.on('will-navigate', (event) => { event.preventDefault() })
  chooser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  return new Promise<DataHomeSelection>((resolve, reject) => {
    let settled = false
    const cleanup = (): void => {
      ipcMain.removeListener('dsh:data-home:selected', handleSelection)
      ipcMain.removeListener('dsh:data-home:cancelled', handleCancellation)
    }
    const closeChooser = (): void => {
      cleanup()
      if (!chooser.isDestroyed()) chooser.destroy()
    }
    const finish = (selection?: DataHomeSelection): void => {
      if (settled) return
      settled = true
      closeChooser()
      if (selection === undefined) reject(new DesktopDataHomeSelectionCancelledError())
      else resolve(selection)
    }
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      closeChooser()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const handleSelection = (event: Electron.IpcMainEvent, value: unknown): void => {
      if (event.sender !== chooser.webContents || !isDataHomeSelection(value)) return
      finish(value)
    }
    const handleCancellation = (event: Electron.IpcMainEvent): void => {
      if (event.sender === chooser.webContents) finish()
    }
    ipcMain.on('dsh:data-home:selected', handleSelection)
    ipcMain.on('dsh:data-home:cancelled', handleCancellation)
    chooser.once('closed', () => { finish() })
    chooser.once('ready-to-show', () => {
      chooser.show()
      chooser.focus()
    })
    void chooser.loadFile(DATA_HOME_PAGE, { query: { selected: initialSelection } }).catch(fail)
  })
}

async function prepareDesktopDshHome(layout: DesktopDataHomeLayout): Promise<string> {
  const previous = await readDesktopDataHomeSetup(layout.setupFile)
  if (layout.explicitDshHome) {
    await writeDesktopDataHomeSetup(
      layout.setupFile,
      desktopDataHomeSetup('explicit', layout.dshHome),
    )
    return layout.dshHome
  }
  const recordedHome = resolveRecordedDesktopDataHome(layout, previous)
  if (recordedHome !== undefined) return recordedHome
  if (await hasDesktopData(layout.dshHome)) {
    await writeDesktopDataHomeSetup(
      layout.setupFile,
      desktopDataHomeSetup('existing', layout.dshHome),
    )
    return layout.dshHome
  }
  if (!await hasDesktopData(layout.officialDshHome)) {
    await writeDesktopDataHomeSetup(
      layout.setupFile,
      desktopDataHomeSetup('fresh', layout.dshHome),
    )
    return layout.dshHome
  }

  const copy = dataHomeCopy()
  const selection = await showDataHomeChooser()
  if (selection === 'imported') {
    try {
      await importOfficialDesktopData(layout.officialDshHome, layout.dshHome)
      await writeDesktopDataHomeSetup(
        layout.setupFile,
        desktopDataHomeSetup('imported', layout.dshHome, layout.officialDshHome),
      )
      await dialog.showMessageBox({
        type: 'info', title: copy.completeTitle, message: copy.completeMessage,
        detail: layout.dshHome, buttons: ['OK'], noLink: true,
      })
      return layout.dshHome
    } catch (error) {
      dialog.showErrorBox(copy.failedTitle, error instanceof Error ? error.message : String(error))
      throw error
    }
  }
  if (selection === 'reused') {
    await writeDesktopDataHomeSetup(
      layout.setupFile,
      desktopDataHomeSetup('reused', layout.officialDshHome, layout.officialDshHome),
    )
    return layout.officialDshHome
  }
  await writeDesktopDataHomeSetup(
    layout.setupFile,
    desktopDataHomeSetup('fresh', layout.dshHome),
  )
  return layout.dshHome
}

function applyLaunchAtLogin(enabled: boolean): void {
  if (!desktopCapabilities().launchAtLoginAvailable) return
  app.setLoginItemSettings({ openAtLogin: enabled })
}

function publishPreferences(): void {
  const window = mainWindow
  if (window !== undefined && !window.isDestroyed()) {
    window.webContents.send('dsh:desktop:preferences', preferences)
  }
  refreshTrayMenu()
}

function updatePreferences(raw: unknown): DesktopPreferences {
  const patch = parseDesktopPreferencesPatch(raw)
  if (patch.launchAtLoginEnabled !== undefined) {
    if (!desktopCapabilities().launchAtLoginAvailable && patch.launchAtLoginEnabled) {
      throw new Error('desktop: launch at login is available only in a packaged macOS application')
    }
    applyLaunchAtLogin(patch.launchAtLoginEnabled)
  }
  preferences = { ...preferences, ...patch }
  preferencesStore?.write(preferences)
  publishPreferences()
  return preferences
}

async function openHarnessLog(): Promise<OpenLogResult> {
  const result = await revealHarnessLog(harnessLogPath, shell)
  if (result.error !== '') dialog.showErrorBox(desktopCopy().logErrorTitle, result.error)
  return result
}

function buildTrayMenu(): Menu {
  const copy = desktopCopy()
  const capabilities = desktopCapabilities()
  const template: MenuItemConstructorOptions[] = [
    { label: copy.open, click: () => { lifecycle?.showWindow() } },
    { label: copy.openLog, click: () => { void openHarnessLog() } },
    { type: 'separator' },
    {
      label: copy.launchAtLogin,
      type: 'checkbox',
      visible: capabilities.launchAtLoginAvailable,
      checked: preferences.launchAtLoginEnabled,
      click: (item) => { updatePreferences({ launchAtLoginEnabled: item.checked }) },
    },
    {
      label: copy.notifications,
      type: 'checkbox',
      checked: preferences.notificationsEnabled,
      click: (item) => { updatePreferences({ notificationsEnabled: item.checked }) },
    },
    { type: 'separator' },
    { label: copy.quit, click: () => { void lifecycle?.requestQuit() } },
  ]
  return Menu.buildFromTemplate(template)
}

function refreshTrayMenu(): void {
  tray?.setContextMenu(buildTrayMenu())
}

function createTray(): void {
  const image = nativeImage.createFromPath(process.platform === 'darwin' ? MACOS_TRAY_ICON : WINDOW_ICON)
  if (process.platform === 'darwin') {
    image.setTemplateImage(true)
  }
  tray = new Tray(image)
  tray.setToolTip(APP_NAME)
  refreshTrayMenu()
  // A macOS tray with a context menu opens that menu on a primary click. Do
  // not also focus the application window: doing so lets an auto-hidden menu
  // bar collapse behind the still-open tray menu. Other platforms retain the
  // conventional primary-click shortcut for restoring the window.
  if (process.platform !== 'darwin') {
    tray.on('click', () => { lifecycle?.showWindow() })
  }
  tray.on('right-click', refreshTrayMenu)
}

/** Replace Electron's generic Dock icon while running the unpackaged macOS host. */
function applyDevelopmentDockIcon(): void {
  if (process.platform !== 'darwin' || app.isPackaged) return
  const image = nativeImage.createFromPath(DEVELOPMENT_DOCK_ICON)
  if (image.isEmpty()) {
    throw new Error(`desktop: development Dock icon is unavailable at ${DEVELOPMENT_DOCK_ICON}`)
  }
  const dock = app.dock
  if (dock === undefined) throw new Error('desktop: macOS Dock integration is unavailable')
  dock.setIcon(image)
}

async function runHarnessInvocation(
  launch: HarnessLaunch,
  acceptedExitCodes: readonly number[] = [0],
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(launch.command, launch.args, {
      env: { ...process.env, ...launch.environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const output: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => { output.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { output.push(chunk) })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      const diagnostic = Buffer.concat(output).toString('utf8')
      if (acceptsHarnessInvocationExit(code, signal, acceptedExitCodes)) resolve(diagnostic)
      else reject(new Error(`desktop: Harness invocation failed (${String(code)}, ${String(signal)}): ${diagnostic.slice(-4000)}`))
    })
  })
}

function showDesktopMessageBox(options: MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  return mainWindow === undefined
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(mainWindow, options)
}

async function resolveStartupBuildApproval(
  diagnostic: string,
  environment: NodeJS.ProcessEnv,
  launchOptions: DesktopLaunchOptions,
): Promise<string> {
  const approval = parseStartupBuildApproval(diagnostic)
  if (approval === undefined) return diagnostic
  const chinese = app.getLocale().toLowerCase().startsWith('zh')
  const result = await showDesktopMessageBox({
    type: 'warning',
    title: chinese ? '插件构建脚本被拦截' : 'Plugin build script blocked',
    message: chinese ? '一个插件需要运行构建脚本' : 'A plugin needs to run a build script',
    detail: chinese
      ? `pnpm 已阻止 ${approval.packageBuildKey} 的构建脚本。该插件已被安全隔离，因此即使不允许也可以继续进入应用。仅在你信任插件来源时允许。`
      : `pnpm blocked the build script for ${approval.packageBuildKey}. The plugin is already safely isolated, so you can continue without allowing it. Only allow a source you trust.`,
    buttons: chinese
      ? ['允许构建并恢复插件', '不允许，保持隔离', '退出应用']
      : ['Allow and restore plugin', 'Keep isolated', 'Quit'],
    defaultId: 1,
    cancelId: 2,
    noLink: true,
  })
  if (result.response === 2) throw new DesktopDataHomeSelectionCancelledError()
  if (result.response !== 0) return diagnostic

  const recoveryDiagnostics: string[] = []
  try {
    recoveryDiagnostics.push(await runHarnessInvocation(resolveHarnessInvocation(environment, [
      'plugin', '--profile', 'web', 'approve-build-key', approval.packageBuildKey,
    ], launchOptions)))
    for (const quarantineId of approval.quarantineIds) {
      recoveryDiagnostics.push(await runHarnessInvocation(resolveHarnessInvocation(environment, [
        'plugin', '--profile', 'web', 'doctor', '--retry', quarantineId,
      ], launchOptions), [0, 10, 11]))
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    await showDesktopMessageBox({
      type: 'warning',
      title: chinese ? '插件恢复失败' : 'Plugin recovery failed',
      message: chinese ? '应用仍可继续启动' : 'The application can still start',
      detail: chinese
        ? `构建许可未能安全完成或插件仍有其他问题。插件会继续保持隔离，可稍后在“诊断”中重试。\n\n${detail.slice(-2000)}`
        : `The approval could not be completed safely or the plugin has another issue. It remains isolated and can be retried later in Diagnostics.\n\n${detail.slice(-2000)}`,
      buttons: [chinese ? '继续' : 'Continue'],
    })
    return `${diagnostic}\n[desktop] Build approval recovery failed: ${detail}`
  }
  return `${diagnostic}\n[desktop] User approved ${JSON.stringify(approval.packageBuildKey)} and restored ${approval.quarantineIds.length} quarantined plugin(s).\n${recoveryDiagnostics.join('\n')}`
}

function assertMainRenderer(sender: Electron.WebContents): void {
  if (mainWindow === undefined || mainWindow.isDestroyed() || sender !== mainWindow.webContents) {
    throw new Error('desktop: bundled plugin request came from an untrusted renderer')
  }
}

function showLoading(state: HarnessState, failure?: HarnessFailure & { logPath: string }): void {
  if (mainWindow === undefined || mainWindow.isDestroyed() || state === 'ready' || state === 'stopped') return
  void mainWindow.loadFile(LOADING_PAGE, {
    query: {
      state,
      ...(failure === undefined ? {} : { message: failure.message, logPath: failure.logPath }),
    },
  })
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
  window.webContents.session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    return contents === window.webContents && allowsHarnessPermission(
      permission,
      details.requestingUrl ?? requestingOrigin,
      harnessOrigin,
      details.isMainFrame,
    )
  })
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requestingUrl = 'requestingUrl' in details ? details.requestingUrl : undefined
    const isMainFrame = 'isMainFrame' in details && details.isMainFrame
    callback(contents === window.webContents && allowsHarnessPermission(
      permission,
      requestingUrl,
      harnessOrigin,
      isMainFrame,
    ))
  })
}

function createWindow(): BrowserWindow {
  const customWindowFrame = usesCustomWindowFrame(process.platform)
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f4f2ed',
    icon: WINDOW_ICON,
    frame: !customWindowFrame,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: PRELOAD,
      additionalArguments: [app.isPackaged ? '--dsh-packaged' : '--dsh-source'],
    },
  })
  configureNavigation(window)
  if (customWindowFrame) {
    const sendMaximizedState = (): void => {
      window.webContents.send('dsh:window:maximized', window.isMaximized())
    }
    window.on('maximize', sendMaximizedState)
    window.on('unmaximize', sendMaximizedState)
  }
  window.once('ready-to-show', () => {
    if (!hiddenLaunch && lifecycle?.isQuitting !== true) window.show()
  })
  window.on('close', (event) => { lifecycle?.onWindowClose(event) })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  mainWindow = window
  if (harnessOrigin === undefined) showLoading('starting')
  else void window.loadURL(withCustomWindowFrameInset(harnessOrigin, process.platform))
  return window
}

async function startApplication(): Promise<void> {
  if (process.platform === 'win32') app.setAppUserModelId('ai.flaq.deepseek-harness')
  await app.whenReady()
  const dshHome = await prepareDesktopDshHome(DESKTOP_DATA_HOME)
  const harnessEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_PROFILE_SAFE_MODE_ON_FAILURE: '1',
  }
  let launchOptions: DesktopLaunchOptions = app.isPackaged
    ? {}
    : resolveDevelopmentLaunchOptions(DEFAULT_SOURCE_ROOT)
  applyDevelopmentDockIcon()
  harnessLogPath = join(app.getPath('logs'), 'harness.log')
  preferencesStore = createDesktopPreferencesStore(
    join(app.getPath('userData'), 'desktop-preferences.json'),
    (error) => { console.error('desktop: could not read preferences; using defaults', error) },
  )
  preferences = preferencesStore.read()
  if (!desktopCapabilities().launchAtLoginAvailable) preferences.launchAtLoginEnabled = false
  applyLaunchAtLogin(preferences.launchAtLoginEnabled)
  hiddenLaunch = process.platform === 'darwin'
    && preferences.launchAtLoginEnabled
    && app.getLoginItemSettings().wasOpenedAtLogin
  const updater = new SourceUpdater({
    sourceRoot: process.env.DSH_DESKTOP_SOURCE_ROOT ?? DEFAULT_SOURCE_ROOT,
    nodeCommand: process.env.DSH_DESKTOP_NODE_BIN ?? 'node',
  })
  releaseChecker = app.isPackaged ? new DesktopReleaseChecker(app.getVersion()) : undefined
  releaseChecker?.subscribe((status) => {
    const window = mainWindow
    if (window !== undefined && !window.isDestroyed()) window.webContents.send('dsh:desktop:release-status', status)
  })
  ipcMain.handle('dsh:desktop:capabilities', () => desktopCapabilities())
  ipcMain.handle('dsh:desktop:preferences:get', () => preferences)
  ipcMain.handle('dsh:desktop:preferences:update', (_event, patch: unknown) => updatePreferences(patch))
  ipcMain.handle('dsh:desktop:log:open', () => openHarnessLog())
  ipcMain.handle('dsh:desktop:releases:get', (): DesktopReleaseStatus => (
    releaseChecker?.status ?? { phase: 'unsupported' }
  ))
  ipcMain.handle('dsh:desktop:releases:check', () => (
    releaseChecker?.check() ?? Promise.resolve({ phase: 'unsupported' } satisfies DesktopReleaseStatus)
  ))
  ipcMain.handle('dsh:desktop:releases:open', async (_event, releaseUrl: unknown) => {
    if (typeof releaseUrl !== 'string' || !isAllowedReleaseUrl(releaseUrl)) {
      throw new TypeError('desktop: invalid Release URL')
    }
    return { error: await shell.openExternal(releaseUrl).then(() => '') }
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
  ipcMain.handle('dsh:desktop:restart', (event) => {
    assertMainRenderer(event.sender)
    setTimeout(() => {
      app.relaunch()
      app.quit()
    }, 250)
    return { restarting: true as const }
  })
  ipcMain.handle('dsh:harness:retry', () => ({ started: supervisor?.retry() ?? false }))
  ipcMain.handle('dsh:harness:open-logs', () => openHarnessLog())
  ipcMain.handle('dsh:desktop:bundled-plugins:start', (event, request: unknown): BundledPluginStartResult => {
    assertMainRenderer(event.sender)
    if (request === null || typeof request !== 'object') throw new TypeError('desktop: invalid bundled plugin request')
    const { profile, packageSpec } = request as { profile?: unknown; packageSpec?: unknown }
    if (typeof profile !== 'string' || typeof packageSpec !== 'string') {
      throw new TypeError('desktop: invalid bundled plugin request')
    }
    return bundledPluginInstaller?.startManual(profile, packageSpec) ?? { handled: false }
  })
  ipcMain.handle('dsh:desktop:bundled-plugins:start-deferred', async (
    event,
    request: unknown,
  ): Promise<BundledPluginDeferredStartResult> => {
    assertMainRenderer(event.sender)
    if (request === null || typeof request !== 'object') throw new TypeError('desktop: invalid bundled plugin request')
    const { profile, packageSpec } = request as { profile?: unknown; packageSpec?: unknown }
    if (typeof profile !== 'string' || typeof packageSpec !== 'string') {
      throw new TypeError('desktop: invalid bundled plugin request')
    }
    return bundledPluginInstaller?.startDeferred(profile, packageSpec) ?? { handled: false }
  })
  ipcMain.handle('dsh:desktop:bundled-plugins:get', (event, installId: unknown): BundledPluginInstallSnapshot => {
    assertMainRenderer(event.sender)
    if (typeof installId !== 'string') throw new TypeError('desktop: invalid bundled plugin install id')
    if (bundledPluginInstaller === undefined) throw new Error('desktop: bundled plugin installer is unavailable')
    return bundledPluginInstaller.getInstall(installId)
  })
  ipcMain.handle('dsh:desktop:diagnostic-fixture:install', async (event) => {
    assertMainRenderer(event.sender)
    if (app.isPackaged) throw new Error('desktop: diagnostic fixture is unavailable in packaged builds')
    const fixtureSource = join(DEFAULT_SOURCE_ROOT, 'apps', 'desktop', 'fixtures', 'diagnostic-incompatible-plugin')
    const fixtureArchive = await stageDiagnosticFixture(
      fixtureSource,
      join(app.getPath('userData'), 'diagnostic-fixtures', 'incompatible-plugin'),
    )
    const diagnostic = await runHarnessInvocation(resolveHarnessInvocation(harnessEnvironment, [
      'plugin', '--profile', 'web', 'add', fixtureArchive,
    ], launchOptions))
    return { installed: true as const, diagnostic: diagnostic.slice(-4000) }
  })
  ipcMain.on('dsh:window:minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window === mainWindow && usesCustomWindowFrame(process.platform)) window.minimize()
  })
  ipcMain.on('dsh:window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window !== mainWindow || !usesCustomWindowFrame(process.platform)) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.on('dsh:window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window === mainWindow && usesCustomWindowFrame(process.platform)) window.close()
  })
  lifecycle = createDesktopLifecycle({
    getWindow: () => mainWindow,
    createWindow,
    readCloseBehavior: () => preferences.closeBehavior,
    disposeHost: async () => { await supervisor?.stop() },
    releaseQuit: () => {
      quitReleased = true
      tray?.destroy()
      tray = undefined
      app.quit()
    },
    reportError: (error) => { console.error('desktop: shutdown failed', error) },
  })
  createTray()
  createWindow()

  const packagedRuntimeRoot = app.isPackaged
    ? packagedRuntimeArchiveRoot(process.platform, process.arch)
    : undefined
  const packagedRuntime = packagedRuntimeRoot !== undefined
    ? await ensurePackagedRuntime({
      archivePath: join(process.resourcesPath, 'harness-runtime.tar.gz'),
      destination: join(app.getPath('userData'), 'runtime', app.getVersion()),
      archiveRoot: packagedRuntimeRoot,
    })
    : undefined
  const packageRuntimeBin = packagedRuntime === undefined
    ? undefined
    : join(packagedRuntime, 'package-runtime', 'bin')
  if (app.isPackaged) {
    if (process.platform === 'win32') {
      const windowsRuntime = join(process.resourcesPath, 'runtime', 'win32-x64')
      launchOptions = {
        harnessBin: join(process.resourcesPath, 'harness', 'lib', 'bin.js'),
        nodeCommand: join(windowsRuntime, 'node.exe'),
        packageManagerBin: join(windowsRuntime, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
        runtimeBinPath: windowsRuntime,
      }
    } else if (packagedRuntime !== undefined && packageRuntimeBin !== undefined) {
      launchOptions = {
        harnessBin: join(packagedRuntime, 'lib', 'bin.js'),
        nodeCommand: join(packageRuntimeBin, 'node'),
        packageManagerBin: join(packageRuntimeBin, 'pnpm'),
        runtimeBinPath: packageRuntimeBin,
      }
    } else {
      throw new Error(`desktop: packaged runtime is unavailable for ${process.platform}-${process.arch}`)
    }

  }
  let initialProfileRepairDiagnostic: string
  try {
    initialProfileRepairDiagnostic = await runHarnessInvocation(resolveHarnessInvocation(harnessEnvironment, [
      'plugin', '--profile', 'web', 'doctor', '--repair',
    ], launchOptions), [0, 10, 11])
  } catch (error) {
    initialProfileRepairDiagnostic = error instanceof Error ? error.message : String(error)
    console.warn('desktop: Profile startup repair did not settle; supervised startup will classify the failure', error)
  }
  const profileRepairDiagnostic = await resolveStartupBuildApproval(
    initialProfileRepairDiagnostic,
    harnessEnvironment,
    launchOptions,
  )
  if (profileRepairDiagnostic.trim() !== '') {
    await appendFile(harnessLogPath, `[desktop] Profile startup repair:\n${profileRepairDiagnostic.trim()}\n`)
  }
  const bundledDirectory = resolveBundledPluginResourcesDirectory(
    app.isPackaged,
    process.resourcesPath,
    DEFAULT_SOURCE_ROOT,
  )
  const manifest = parseBundledPluginManifest(
    JSON.parse(await readFile(join(bundledDirectory, 'manifest.json'), 'utf8')) as unknown,
  )
  bundledPluginInstaller = new BundledPluginInstaller({
    manifest,
    resourcesDirectory: bundledDirectory,
    dshHome,
    repairLegacyMarkers: !app.isPackaged,
    prepare: async (plugin) => {
      for (const packageName of plugin.approvedBuilds ?? []) {
        await runHarnessInvocation(resolveHarnessInvocation(harnessEnvironment, [
          'plugin', '--profile', plugin.profile, 'approve-build', packageName,
        ], launchOptions))
      }
    },
    install: async (archivePath, plugin) => {
      await installBundledPluginSource(plugin, archivePath, async (packageSpec, preferOffline) => {
        await runHarnessInvocation(resolveHarnessInvocation(harnessEnvironment, [
          'plugin', '--profile', plugin.profile, 'add', '--save-exact',
          ...(preferOffline ? ['--prefer-offline'] : []), packageSpec,
        ], launchOptions))
      }, (error) => {
        console.warn(`desktop: registry install failed for ${plugin.packageName}; using bundled archive`, error)
      })
    },
    onFailure: async (error) => {
      await appendBundledPluginFailure(harnessLogPath, error)
      console.error(error)
    },
  })
  await bundledPluginInstaller.seedStartup()
  const launch = resolveHarnessLaunch(harnessEnvironment, launchOptions)
  const notificationCopy = desktopNotificationDictionary(app.getLocale())
  const allowNotification = createNotificationThrottle(5 * 60_000)
  let recovering = false
  const showNotification = (key: string, copy: { title: string; body: string }): void => {
    if (!preferences.notificationsEnabled || !Notification.isSupported() || !allowNotification(key, Date.now())) return
    const notification = new Notification({ title: copy.title, body: copy.body, icon: WINDOW_ICON })
    notification.on('click', () => { lifecycle?.showWindow() })
    notification.show()
  }
  supervisor = new HarnessSupervisor({
    launch,
    logPath: harnessLogPath,
    environment: harnessEnvironment,
    onReady: (url) => {
      harnessOrigin = new URL(url).origin
      if (mainWindow !== undefined && !mainWindow.isDestroyed()) {
        void mainWindow.loadURL(withCustomWindowFrameInset(url, process.platform))
      }
      if (recovering) {
        recovering = false
        showNotification('recovered', notificationCopy.recovered)
      }
    },
    onState: (state) => {
      if (state === 'restarting' || state === 'failed') harnessOrigin = undefined
      if (state !== 'failed') showLoading(state)
      if (state === 'restarting' && !recovering) {
        recovering = true
        showNotification('restart', notificationCopy.restart)
      }
    },
    onFailure: (failure) => {
      showLoading('failed', { ...failure, logPath: harnessLogPath })
      showNotification('failed', notificationCopy.failed)
    },
  })
  supervisor.start()

  if (releaseChecker !== undefined) {
    setTimeout(() => { void releaseChecker?.check() }, 10_000)
  }

  app.on('activate', () => {
    lifecycle?.showWindow()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    lifecycle?.showWindow()
  })
  app.on('window-all-closed', () => {
    // The tray owns application lifetime on every platform.
  })
  app.on('before-quit', (event) => {
    if (quitReleased) return
    event.preventDefault()
    void lifecycle?.requestQuit()
  })
  void startApplication().catch((error: unknown) => {
    if (!(error instanceof DesktopDataHomeSelectionCancelledError)) console.error(error)
    if (lifecycle === undefined) {
      quitReleased = true
      app.quit()
    } else {
      void lifecycle.requestQuit()
    }
  })
}
