/** Electron application host for the existing DeepSeek Harness Web GUI. */

import { spawn } from 'node:child_process'
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, session, shell, Tray,
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
import { terminateWindowsProcessTree } from './windows-process-tree.ts'
import { revealHarnessLog, type OpenLogResult } from './log-reveal.ts'
import { createNotificationThrottle, desktopNotificationDictionary } from './notifications.ts'
import {
  createDesktopPreferencesStore, DEFAULT_DESKTOP_PREFERENCES, parseDesktopPreferencesPatch,
  type DesktopPreferences, type DesktopPreferencesStore,
} from './preferences.ts'
import { DesktopReleaseChecker, isAllowedReleaseUrl, type DesktopReleaseStatus } from './release-checker.ts'
import { DesktopReleaseDownloader, type DesktopReleaseDownloadStatus } from './release-downloader.ts'
import { SourceUpdater } from './source-updater.ts'
import { createDesktopLifecycle, type DesktopLifecycle } from './window-lifecycle.ts'
import { usesCustomWindowFrame, withCustomWindowFrameInset } from './window-frame.ts'
import { stageDiagnosticFixture } from './diagnostic-fixture.ts'
import { parseStartupBuildApproval } from './startup-build-approval.ts'
import {
  desktopDataHomeSetup,
  hasDesktopData,
  IMPORTED_ONBOARDING_RESET_VERSION,
  importOfficialDesktopData,
  readDesktopDataHomeSetup,
  resetImportedDesktopOnboarding,
  resolveDesktopDataHomeSource,
  resolveRecordedDesktopDataHome,
  resolveDesktopDataHomeLayout,
  writeDesktopDataHomeSetup,
  type DesktopDataHomeSource,
  type DesktopDataHomeLayout,
} from './desktop-data-home.ts'
import { mapBundledPluginProgress, type DesktopStartupProgress } from './startup-progress.ts'
import {
  DesktopCliManager,
  type DesktopCliRuntime,
  type DesktopCliStatus,
} from './desktop-cli-registration.ts'
import {
  createDesktopChatBackgroundStore,
  type DesktopChatBackgroundStore,
} from './chat-background-store.ts'
import {
  desktopThemeBackground,
  isDesktopThemeSource,
  readDesktopThemeSource,
  type DesktopThemeSource,
} from './desktop-theme.ts'
import {
  classifyImportedPluginSourceFailure,
  ImportedPluginRestoreManager,
  type ImportedPluginRestoreSnapshot,
} from './imported-plugin-restore.ts'
import {
  importedPluginVersionDiffers,
  stageImportedPluginArchive,
  stageImportedPluginDirectory,
  type StagedImportedPlugin,
} from './imported-plugin-local-source.ts'
import { resolveSystemProxyEnvironment } from './system-proxy.ts'

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
let releaseDownloader: DesktopReleaseDownloader | undefined
let bundledPluginInstaller: BundledPluginInstaller | undefined
let importedPluginRestoreManager: ImportedPluginRestoreManager | undefined
let desktopCliManager: DesktopCliManager | undefined
let chatBackgroundStore: DesktopChatBackgroundStore | undefined
let startupProgress: DesktopStartupProgress = { stage: 'preparing-desktop', progress: 4 }
let desktopThemeSource: DesktopThemeSource = 'system'

type DataHomeSelection = 'imported' | 'reused' | 'fresh'

type DataHomeChoice =
  | { readonly mode: 'fresh' }
  | { readonly mode: 'imported' | 'reused'; readonly source: string }

type DataHomeSourceResult =
  | { readonly status: 'valid'; readonly path: string; readonly entries: readonly string[] }
  | { readonly status: 'invalid' | 'unreadable'; readonly path: string }
  | { readonly status: 'cancelled' }

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
  commandLineAvailable: boolean
}

function applyDesktopThemeSource(source: DesktopThemeSource): void {
  desktopThemeSource = source
  nativeTheme.themeSource = source
  const window = mainWindow
  if (window !== undefined && !window.isDestroyed()) {
    window.setBackgroundColor(desktopThemeBackground(source, nativeTheme.shouldUseDarkColors))
  }
}

function desktopCapabilities(): DesktopCapabilities {
  return {
    platform: process.platform,
    packaged: app.isPackaged,
    launchAtLoginAvailable: app.isPackaged && process.platform === 'darwin',
    sourceUpdateAvailable: !app.isPackaged,
    // Keep the row discoverable in source builds as well. DesktopCliManager
    // reports `unsupported` there, while packaged macOS/Windows builds expose
    // the real install, repair, and remove actions.
    commandLineAvailable: process.platform === 'win32' || process.platform === 'darwin',
  }
}

function desktopCopy(): {
  open: string
  restart: string
  openLog: string
  launchAtLogin: string
  notifications: string
  quit: string
  logErrorTitle: string
} {
  return app.getLocale().toLowerCase().startsWith('zh')
    ? {
      open: '打开窗口', restart: '快速重启', openLog: '打开 Harness 日志', launchAtLogin: '开机自启',
      notifications: '系统通知', quit: '退出', logErrorTitle: '无法打开日志',
    }
    : {
      open: 'Open Window', restart: 'Quick Restart', openLog: 'Open Harness Log', launchAtLogin: 'Launch at Login',
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
      completeTitle: '导入完成', completeMessage: '用户数据与插件恢复清单已复制到独立桌面目录。进入客户端后可选择重新安装插件。',
      failedTitle: '无法导入官方数据',
    }
    : {
      completeTitle: 'Import complete', completeMessage: 'User data and a plugin restore list were copied into the independent desktop directory. Choose plugins to reinstall after entering Desktop.',
      failedTitle: 'Could not import official data',
    }
}

function isDataHomeSelection(value: unknown): value is DataHomeSelection {
  return value === 'imported' || value === 'reused' || value === 'fresh'
}

function isDataHomeChoice(value: unknown): value is DataHomeChoice {
  if (typeof value !== 'object' || value === null || !('mode' in value)
    || !isDataHomeSelection(value.mode)) return false
  if (value.mode === 'fresh') return true
  return 'source' in value && typeof value.source === 'string' && value.source.trim().length > 0
}

async function showDataHomeChooser(
  defaultSource: DesktopDataHomeSource | undefined,
  defaultSourceUnreadable: boolean,
  defaultSourceCandidate: string,
): Promise<DataHomeChoice> {
  const chooser = new BrowserWindow({
    title: APP_NAME,
    width: 1080,
    height: 720,
    useContentSize: true,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: desktopThemeBackground('system', nativeTheme.shouldUseDarkColors),
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

  return new Promise<DataHomeChoice>((resolve, reject) => {
    let settled = false
    const cleanup = (): void => {
      ipcMain.removeListener('dsh:data-home:selected', handleSelection)
      ipcMain.removeListener('dsh:data-home:cancelled', handleCancellation)
      ipcMain.removeHandler('dsh:data-home:choose-source')
    }
    const closeChooser = (): void => {
      cleanup()
      if (!chooser.isDestroyed()) chooser.destroy()
    }
    const finish = (selection?: DataHomeChoice): void => {
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
      if (event.sender !== chooser.webContents || !isDataHomeChoice(value)) return
      if (value.mode === 'fresh') {
        finish({ mode: 'fresh' })
        return
      }
      void resolveDesktopDataHomeSource(value.source).then((source) => {
        if (settled) return
        if (source === undefined) {
          event.sender.send('dsh:data-home:source-error', { status: 'invalid', path: value.source })
          return
        }
        finish({ mode: value.mode, source: source.path })
      }).catch(() => {
        if (settled) return
        event.sender.send('dsh:data-home:source-error', { status: 'unreadable', path: value.source })
      })
    }
    const handleCancellation = (event: Electron.IpcMainEvent): void => {
      if (event.sender === chooser.webContents) finish()
    }
    ipcMain.on('dsh:data-home:selected', handleSelection)
    ipcMain.on('dsh:data-home:cancelled', handleCancellation)
    ipcMain.handle('dsh:data-home:choose-source', async (event): Promise<DataHomeSourceResult> => {
      if (event.sender !== chooser.webContents) throw new Error('desktop: invalid data-home source requester')
      const result = await dialog.showOpenDialog(chooser, {
        title: app.getLocale().toLowerCase().startsWith('zh') ? '选择 DSH 配置目录' : 'Choose DSH configuration directory',
        properties: ['openDirectory'],
      })
      const candidate = result.filePaths[0]
      if (result.canceled || candidate === undefined) return { status: 'cancelled' }
      try {
        const source = await resolveDesktopDataHomeSource(candidate)
        return source === undefined
          ? { status: 'invalid', path: candidate }
          : { status: 'valid', path: source.path, entries: source.entries }
      } catch {
        return { status: 'unreadable', path: candidate }
      }
    })
    chooser.once('closed', () => { finish() })
    chooser.once('ready-to-show', () => {
      chooser.show()
      chooser.focus()
    })
    void chooser.loadFile(DATA_HOME_PAGE, { query: {
      selected: defaultSource === undefined ? 'fresh' : 'imported',
      source: defaultSource?.path ?? '',
      defaultSource: defaultSource?.path ?? '',
      sourceCandidate: defaultSourceCandidate,
      sourceStatus: defaultSourceUnreadable ? 'unreadable' : defaultSource === undefined ? 'missing' : 'valid',
      development: app.isPackaged ? 'false' : 'true',
    } }).catch(fail)
  })
}

async function prepareDesktopDshHome(layout: DesktopDataHomeLayout): Promise<string> {
  let previous = await readDesktopDataHomeSetup(layout.setupFile)
  if (previous?.mode === 'imported'
    && previous.importedOnboardingReset !== IMPORTED_ONBOARDING_RESET_VERSION) {
    await resetImportedDesktopOnboarding(previous.dshHome)
    previous = { ...previous, importedOnboardingReset: IMPORTED_ONBOARDING_RESET_VERSION }
    await writeDesktopDataHomeSetup(layout.setupFile, previous)
  }
  if (layout.explicitDshHome) {
    await writeDesktopDataHomeSetup(
      layout.setupFile,
      desktopDataHomeSetup('explicit', layout.dshHome),
    )
    return layout.dshHome
  }
  const recordedHome = resolveRecordedDesktopDataHome(layout, previous)
  if (recordedHome !== undefined && previous?.mode !== 'reused') return recordedHome
  if (recordedHome !== undefined) {
    try {
      const recordedSource = await resolveDesktopDataHomeSource(recordedHome)
      if (recordedSource?.path === recordedHome) return recordedHome
    } catch {
      // An unreadable reused source returns to the chooser below.
    }
  }
  if (await hasDesktopData(layout.dshHome)) {
    await writeDesktopDataHomeSetup(
      layout.setupFile,
      desktopDataHomeSetup('existing', layout.dshHome),
    )
    return layout.dshHome
  }
  let defaultSource: DesktopDataHomeSource | undefined
  let defaultSourceUnreadable = false
  try {
    defaultSource = await resolveDesktopDataHomeSource(layout.officialDshHome)
  } catch {
    defaultSourceUnreadable = true
  }

  const copy = dataHomeCopy()
  const selection = await showDataHomeChooser(defaultSource, defaultSourceUnreadable, layout.officialDshHome)
  if (selection.mode === 'imported') {
    try {
      await importOfficialDesktopData(selection.source, layout.dshHome)
      await writeDesktopDataHomeSetup(
        layout.setupFile,
        desktopDataHomeSetup('imported', layout.dshHome, selection.source),
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
  if (selection.mode === 'reused') {
    await writeDesktopDataHomeSetup(
      layout.setupFile,
      desktopDataHomeSetup('reused', selection.source, selection.source),
    )
    return selection.source
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

function requestDesktopRestart(): void {
  if (lifecycle !== undefined) {
    void lifecycle.requestRestart(() => { app.relaunch() })
    return
  }
  app.relaunch()
  quitReleased = true
  app.quit()
}

function buildTrayMenu(): Menu {
  const copy = desktopCopy()
  const capabilities = desktopCapabilities()
  const template: MenuItemConstructorOptions[] = [
    { label: copy.open, click: () => { lifecycle?.showWindow() } },
    {
      label: copy.restart,
      click: requestDesktopRestart,
    },
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

class PackageManagerInvocationError extends Error {
  readonly timedOut: boolean

  constructor(message: string, timedOut: boolean) {
    super(message)
    this.timedOut = timedOut
  }
}

async function runPackageManagerInvocation(
  args: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  options: DesktopLaunchOptions,
  timeoutMs = 10_000,
): Promise<string> {
  const packageManager = options.packageManagerBin
  if (packageManager === undefined) throw new Error('desktop: bundled pnpm is unavailable')
  const javaScriptEntry = /\.(?:cjs|mjs|js)$/iu.test(packageManager)
  const command = javaScriptEntry
    ? environment.DSH_DESKTOP_NODE_BIN ?? options.nodeCommand ?? 'node'
    : packageManager
  const commandArgs = javaScriptEntry ? [packageManager, ...args] : [...args]
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const output: Buffer[] = []
    let outputBytes = 0
    let timedOut = false
    const append = (chunk: Buffer): void => {
      outputBytes += chunk.length
      if (outputBytes <= 2 * 1024 * 1024) output.push(chunk)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timeout)
      const diagnostic = Buffer.concat(output).toString('utf8')
      if (!timedOut && acceptsHarnessInvocationExit(code, signal, [0])) resolve(diagnostic)
      else reject(new PackageManagerInvocationError(
        `desktop: pnpm invocation failed (${String(code)}, ${String(signal)}): ${diagnostic.slice(-4000)}`,
        timedOut,
      ))
    })
  })
}

async function inspectImportedPluginSource(
  packageSpec: string,
  environment: NodeJS.ProcessEnv,
  options: DesktopLaunchOptions,
) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-plugin-source-check-'))
  try {
    await writeFile(join(directory, 'package.json'), '{"private":true}\n', { mode: 0o600 })
    try {
      await runPackageManagerInvocation([
        'add', '--lockfile-only', '--ignore-scripts', '--save-exact', packageSpec,
      ], directory, environment, options)
      return { availability: 'available' as const }
    } catch (error) {
      return classifyImportedPluginSourceFailure(
        error instanceof Error ? error.message : String(error),
        error instanceof PackageManagerInvocationError && error.timedOut,
      )
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
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

function publishStartupProgress(next: DesktopStartupProgress): void {
  startupProgress = next
  const window = mainWindow
  if (window !== undefined && !window.isDestroyed()) {
    window.webContents.send('dsh:startup-progress', startupProgress)
  }
}

function showLoading(state: HarnessState, failure?: HarnessFailure & { logPath: string }): void {
  if (mainWindow === undefined || mainWindow.isDestroyed() || state === 'ready' || state === 'stopped') return
  void mainWindow.loadFile(LOADING_PAGE, {
    query: {
      state,
      stage: startupProgress.stage,
      progress: String(startupProgress.progress),
      ...(startupProgress.detail === undefined ? {} : { detail: startupProgress.detail }),
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
    backgroundColor: desktopThemeBackground(desktopThemeSource, nativeTheme.shouldUseDarkColors),
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
  applyDevelopmentDockIcon()
  const dshHome = await prepareDesktopDshHome(DESKTOP_DATA_HOME)
  applyDesktopThemeSource(await readDesktopThemeSource(
    dshHome,
    (error) => { console.warn('desktop: could not read theme preference; following the system appearance', error) },
  ))
  let harnessEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_PROFILE_SAFE_MODE_ON_FAILURE: '1',
  }
  try {
    const resolvedProxy = await resolveSystemProxyEnvironment(
      harnessEnvironment,
      url => session.defaultSession.resolveProxy(url),
    )
    harnessEnvironment = resolvedProxy.environment
    if (resolvedProxy.applied) console.info('desktop: system proxy enabled for Harness child processes')
  } catch (error) {
    console.warn('desktop: could not resolve the system proxy; preserving the explicit process environment', error)
  }
  let launchOptions: DesktopLaunchOptions = app.isPackaged
    ? {}
    : resolveDevelopmentLaunchOptions(DEFAULT_SOURCE_ROOT)
  harnessLogPath = join(app.getPath('logs'), 'harness.log')
  preferencesStore = createDesktopPreferencesStore(
    join(app.getPath('userData'), 'desktop-preferences.json'),
    (error) => { console.error('desktop: could not read preferences; using defaults', error) },
  )
  preferences = preferencesStore.read()
  chatBackgroundStore = createDesktopChatBackgroundStore(
    join(app.getPath('userData'), 'chat-background.json'),
    (error) => { console.error('desktop: could not read chat background; using browser fallback', error) },
  )
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
  releaseDownloader = releaseChecker === undefined ? undefined : new DesktopReleaseDownloader({
    platform: process.platform,
    arch: process.arch,
    downloadDirectory: join(app.getPath('userData'), 'updates'),
    getRelease: () => releaseChecker?.status ?? { phase: 'unsupported' },
    openPath: path => shell.openPath(path),
  })
  releaseChecker?.subscribe((status) => {
    releaseDownloader?.resetForRelease(status)
    const window = mainWindow
    if (window !== undefined && !window.isDestroyed()) window.webContents.send('dsh:desktop:release-status', status)
  })
  releaseDownloader?.subscribe((status) => {
    const window = mainWindow
    if (window !== undefined && !window.isDestroyed()) {
      window.webContents.send('dsh:desktop:release-download-status', status)
    }
  })
  ipcMain.handle('dsh:desktop:capabilities', () => desktopCapabilities())
  ipcMain.handle('dsh:desktop:preferences:get', () => preferences)
  ipcMain.handle('dsh:desktop:preferences:update', (_event, patch: unknown) => updatePreferences(patch))
  ipcMain.handle('dsh:desktop:chat-background:read', (event) => {
    assertMainRenderer(event.sender)
    return chatBackgroundStore?.read()
  })
  ipcMain.handle('dsh:desktop:chat-background:write', (event, background: unknown) => {
    assertMainRenderer(event.sender)
    if (chatBackgroundStore === undefined) throw new Error('desktop: chat background store is unavailable')
    return chatBackgroundStore.write(background)
  })
  ipcMain.handle('dsh:desktop:log:open', () => openHarnessLog())
  ipcMain.handle('dsh:desktop:cli:get', async (event): Promise<DesktopCliStatus> => {
    assertMainRenderer(event.sender)
    if (desktopCliManager === undefined) throw new Error('desktop: command-line manager is unavailable')
    return desktopCliManager.getStatus()
  })
  ipcMain.handle('dsh:desktop:cli:install', async (event, force: unknown): Promise<DesktopCliStatus> => {
    assertMainRenderer(event.sender)
    if (typeof force !== 'boolean') throw new TypeError('desktop: invalid command-line conflict confirmation')
    if (desktopCliManager === undefined) throw new Error('desktop: command-line manager is unavailable')
    return desktopCliManager.install(force)
  })
  ipcMain.handle('dsh:desktop:cli:remove', async (event): Promise<DesktopCliStatus> => {
    assertMainRenderer(event.sender)
    if (desktopCliManager === undefined) throw new Error('desktop: command-line manager is unavailable')
    return desktopCliManager.remove()
  })
  ipcMain.handle('dsh:desktop:startup-progress:get', (event): DesktopStartupProgress => {
    assertMainRenderer(event.sender)
    return startupProgress
  })
  ipcMain.on('dsh:desktop:theme-source', (event, source: unknown) => {
    assertMainRenderer(event.sender)
    if (!isDesktopThemeSource(source)) throw new TypeError('desktop: invalid theme source')
    applyDesktopThemeSource(source)
  })
  ipcMain.handle('dsh:desktop:releases:get', (): DesktopReleaseStatus => (
    releaseChecker?.status ?? { phase: 'unsupported' }
  ))
  ipcMain.handle('dsh:desktop:releases:check', () => (
    releaseChecker?.check() ?? Promise.resolve({ phase: 'unsupported' } satisfies DesktopReleaseStatus)
  ))
  ipcMain.handle('dsh:desktop:releases:open', async (event, releaseUrl: unknown) => {
    assertMainRenderer(event.sender)
    if (typeof releaseUrl !== 'string' || !isAllowedReleaseUrl(releaseUrl)) {
      throw new TypeError('desktop: invalid Release URL')
    }
    return { error: await shell.openExternal(releaseUrl).then(() => '') }
  })
  ipcMain.handle('dsh:desktop:releases:download:get', (event): DesktopReleaseDownloadStatus => {
    assertMainRenderer(event.sender)
    return releaseDownloader?.status ?? { phase: 'unsupported' }
  })
  ipcMain.handle('dsh:desktop:releases:download:start', (event) => {
    assertMainRenderer(event.sender)
    return releaseDownloader?.start() ?? Promise.resolve({ phase: 'unsupported' } satisfies DesktopReleaseDownloadStatus)
  })
  ipcMain.handle('dsh:desktop:releases:download:cancel', (event): DesktopReleaseDownloadStatus => {
    assertMainRenderer(event.sender)
    return releaseDownloader?.cancel() ?? { phase: 'unsupported' }
  })
  ipcMain.handle('dsh:desktop:releases:download:open', (event) => {
    assertMainRenderer(event.sender)
    return releaseDownloader?.open() ?? Promise.resolve({ error: 'Release downloads are unavailable.' })
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
      requestDesktopRestart()
    }, 250)
    return { restarting: true as const }
  })
  ipcMain.handle('dsh:desktop:restart', (event) => {
    assertMainRenderer(event.sender)
    setTimeout(() => {
      requestDesktopRestart()
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
  ipcMain.handle('dsh:desktop:imported-plugins:get', (event): ImportedPluginRestoreSnapshot | undefined => {
    assertMainRenderer(event.sender)
    return importedPluginRestoreManager?.snapshot()
  })
  ipcMain.handle('dsh:desktop:imported-plugins:check-sources', (event): ImportedPluginRestoreSnapshot | undefined => {
    assertMainRenderer(event.sender)
    return importedPluginRestoreManager?.startSourceCheck()
  })
  ipcMain.handle('dsh:desktop:imported-plugins:start', (
    event,
    restoreIds: unknown,
  ): Promise<ImportedPluginRestoreSnapshot> => {
    assertMainRenderer(event.sender)
    if (!Array.isArray(restoreIds) || restoreIds.some(value => typeof value !== 'string')) {
      throw new TypeError('desktop: invalid imported plugin restore ids')
    }
    if (importedPluginRestoreManager === undefined) {
      throw new Error('desktop: imported plugin restore manager is unavailable')
    }
    return importedPluginRestoreManager.start(restoreIds)
  })
  ipcMain.handle('dsh:desktop:imported-plugins:dismiss', async (
    event,
  ): Promise<ImportedPluginRestoreSnapshot | undefined> => {
    assertMainRenderer(event.sender)
    return importedPluginRestoreManager?.dismissPrompt()
  })
  ipcMain.handle('dsh:desktop:imported-plugins:ignore', async (
    event,
  ): Promise<ImportedPluginRestoreSnapshot | undefined> => {
    assertMainRenderer(event.sender)
    return importedPluginRestoreManager?.ignorePending()
  })
  const installSelectedImportedPlugin = async (
    restoreId: unknown,
    kind: 'directory' | 'archive',
  ): Promise<ImportedPluginRestoreSnapshot | undefined> => {
    if (typeof restoreId !== 'string' || importedPluginRestoreManager === undefined) {
      throw new TypeError('desktop: invalid imported plugin local restore request')
    }
    const entry = importedPluginRestoreManager.localEntry(restoreId)
    const chinese = app.getLocale().toLowerCase().startsWith('zh')
    const chooser = mainWindow
    const result = await (chooser === undefined
      ? dialog.showOpenDialog({
        title: chinese ? '选择插件本地来源' : 'Choose a local plugin source',
        properties: kind === 'directory' ? ['openDirectory'] : ['openFile'],
        ...(kind === 'archive' ? { filters: [{ name: 'npm package', extensions: ['tgz'] }] } : {}),
      })
      : dialog.showOpenDialog(chooser, {
        title: chinese ? '选择插件本地来源' : 'Choose a local plugin source',
        properties: kind === 'directory' ? ['openDirectory'] : ['openFile'],
        ...(kind === 'archive' ? { filters: [{ name: 'npm package', extensions: ['tgz'] }] } : {}),
      }))
    const selectedPath = result.filePaths[0]
    if (result.canceled || selectedPath === undefined) return importedPluginRestoreManager.snapshot()
    let staged: StagedImportedPlugin | undefined
    try {
      staged = kind === 'archive'
        ? await stageImportedPluginArchive(selectedPath, entry.packageName)
        : await stageImportedPluginDirectory(selectedPath, entry.packageName, async (source, destination) => {
          await runPackageManagerInvocation([
            'pack', '--ignore-scripts', '--pack-destination', destination,
          ], source, harnessEnvironment, launchOptions, 60_000)
        })
      if (importedPluginVersionDiffers(entry.declaredSpec, staged.manifest.version)) {
        const confirmation = await showDesktopMessageBox({
          type: 'warning',
          title: chinese ? '插件版本与原配置不同' : 'Plugin version differs from the imported configuration',
          message: chinese ? `仍要安装 ${entry.packageName} 吗？` : `Install ${entry.packageName} anyway?`,
          detail: chinese
            ? `原声明：${entry.declaredSpec}\n本地版本：${staged.manifest.version ?? '未知'}\n本地包将安装到桌面版独立环境。`
            : `Imported declaration: ${entry.declaredSpec}\nLocal version: ${staged.manifest.version ?? 'unknown'}\nThe local package will install into the independent Desktop environment.`,
          buttons: chinese ? ['取消', '继续安装'] : ['Cancel', 'Install anyway'],
          defaultId: 0,
          cancelId: 0,
        })
        if (confirmation.response !== 1) return importedPluginRestoreManager.snapshot()
      }
      return await importedPluginRestoreManager.installLocal(restoreId, staged.archivePath)
    } finally {
      await staged?.cleanup()
    }
  }
  ipcMain.handle('dsh:desktop:imported-plugins:choose-directory', async (event, restoreId: unknown) => {
    assertMainRenderer(event.sender)
    return installSelectedImportedPlugin(restoreId, 'directory')
  })
  ipcMain.handle('dsh:desktop:imported-plugins:choose-archive', async (event, restoreId: unknown) => {
    assertMainRenderer(event.sender)
    return installSelectedImportedPlugin(restoreId, 'archive')
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

  publishStartupProgress(app.isPackaged
    ? { stage: 'preparing-runtime', progress: 10 }
    : { stage: 'preparing-desktop', progress: 24 })
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
  let desktopCliRuntime: DesktopCliRuntime | undefined
  if (app.isPackaged) {
    if (process.platform === 'win32') {
      const windowsRuntime = join(process.resourcesPath, 'runtime', 'win32-x64')
      const harnessBin = join(process.resourcesPath, 'harness', 'lib', 'bin.js')
      const nodeCommand = join(windowsRuntime, 'node.exe')
      const packageManagerBin = join(windowsRuntime, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
      launchOptions = {
        harnessBin,
        nodeCommand,
        packageManagerBin,
        runtimeBinPath: windowsRuntime,
      }
      desktopCliRuntime = {
        harnessBin,
        nodeBin: nodeCommand,
        pnpmBin: packageManagerBin,
        launcherSource: join(process.resourcesPath, 'cli', 'desktop-cli.mjs'),
      }
    } else if (packagedRuntime !== undefined && packageRuntimeBin !== undefined) {
      const harnessBin = join(packagedRuntime, 'lib', 'bin.js')
      const nodeCommand = join(packageRuntimeBin, 'node')
      const packageManagerBin = join(packageRuntimeBin, 'pnpm')
      launchOptions = {
        harnessBin,
        nodeCommand,
        packageManagerBin,
        runtimeBinPath: packageRuntimeBin,
      }
      desktopCliRuntime = {
        harnessBin,
        nodeBin: nodeCommand,
        pnpmBin: packageManagerBin,
        launcherSource: join(process.resourcesPath, 'cli', 'desktop-cli.mjs'),
      }
    } else {
      throw new Error(`desktop: packaged runtime is unavailable for ${process.platform}-${process.arch}`)
    }

  }
  const desktopShellPath = process.env.SHELL ?? (process.platform === 'darwin' ? userInfo().shell ?? '' : '')
  desktopCliManager = new DesktopCliManager({
    platform: process.platform,
    packaged: app.isPackaged,
    desktopRoot: DESKTOP_DATA_HOME.desktopRoot,
    setupFile: DESKTOP_DATA_HOME.setupFile,
    homeDirectory: homedir(),
    resourcesPath: process.resourcesPath,
    environment: process.env,
    ...(desktopShellPath === '' ? {} : { shellPath: desktopShellPath }),
    ...(desktopCliRuntime === undefined ? {} : { runtime: desktopCliRuntime }),
  })
  try {
    await desktopCliManager.refresh()
  } catch (error) {
    console.warn('desktop: could not refresh the registered dsh command', error)
  }
  publishStartupProgress({ stage: 'checking-profile', progress: 28 })
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
  publishStartupProgress({ stage: 'checking-profile', progress: 34 })
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
      await installBundledPluginSource(plugin, archivePath, async (packageSpec) => {
        await runHarnessInvocation(resolveHarnessInvocation(harnessEnvironment, [
          'plugin', '--profile', plugin.profile, 'add', '--save-exact', packageSpec,
        ], launchOptions))
      })
    },
    onFailure: async (error) => {
      await appendBundledPluginFailure(harnessLogPath, error)
      console.error(error)
    },
  })
  await bundledPluginInstaller.seedStartup((progress) => {
    publishStartupProgress(mapBundledPluginProgress(
      progress.entry.packageName,
      progress.index,
      progress.total,
      progress.stage,
      progress.progress,
    ))
  })
  const installedProfileDependencies: Record<string, string> = {}
  try {
    const profileManifest = JSON.parse(
      await readFile(join(dshHome, 'profiles', 'web', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, unknown> }
    for (const [packageName, declaredSpec] of Object.entries(profileManifest.dependencies ?? {})) {
      if (typeof declaredSpec === 'string') installedProfileDependencies[packageName] = declaredSpec
    }
  } catch (error) {
    console.warn('desktop: could not identify installed startup plugins for imported restore', error)
  }
  importedPluginRestoreManager = new ImportedPluginRestoreManager({
    dshHome,
    providedDependencies: installedProfileDependencies,
    inspectSource: packageSpec => inspectImportedPluginSource(packageSpec, harnessEnvironment, launchOptions),
    install: packageSpec => runHarnessInvocation(resolveHarnessInvocation(harnessEnvironment, [
      'plugin', '--profile', 'web', 'add', packageSpec,
    ], launchOptions)),
  })
  try {
    await importedPluginRestoreManager.prepare()
  } catch (error) {
    console.warn('desktop: imported plugin restore metadata is unavailable; startup will continue', error)
    await appendFile(harnessLogPath, `[desktop] Imported plugin restore unavailable: ${error instanceof Error ? error.message : String(error)}\n`)
  }
  publishStartupProgress({ stage: 'starting-harness', progress: 88 })
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
    ...(process.platform === 'win32' ? { terminateProcessTree: terminateWindowsProcessTree } : {}),
    onReady: (url) => {
      harnessOrigin = new URL(url).origin
      publishStartupProgress({ stage: 'ready', progress: 100 })
      const readyOrigin = harnessOrigin
      setTimeout(() => {
        if (harnessOrigin !== readyOrigin || mainWindow === undefined || mainWindow.isDestroyed()) return
        void mainWindow.loadURL(withCustomWindowFrameInset(url, process.platform))
      }, 120)
      if (recovering) {
        recovering = false
        showNotification('recovered', notificationCopy.recovered)
      }
    },
    onState: (state) => {
      if (state === 'restarting' || state === 'failed') harnessOrigin = undefined
      if (state === 'starting') publishStartupProgress({ stage: 'starting-harness', progress: 92 })
      if (state === 'restarting') publishStartupProgress({ stage: 'restarting-harness', progress: 90 })
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
