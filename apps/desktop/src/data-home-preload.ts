/** Sandboxed interaction controller for the first-run data-home chooser. */

import { ipcRenderer } from 'electron'

type DataHomeMode = 'imported' | 'reused' | 'fresh'

function isDataHomeMode(value: string | null): value is DataHomeMode {
  return value === 'imported' || value === 'reused' || value === 'fresh'
}

interface DetailCopy {
  title: string
  risk?: string
  location: string
  sharing: string
  plugins: string
  builds: string
}

const zh = {
  windowTitle: '选择数据目录', languageLabel: '语言', importTitle: '导入官方配置（独立环境）', recommended: '推荐',
  importSummary: '复制用户数据与插件清单；插件进入后选择重新安装。', reuseTitle: '直接复用官方配置',
  reuseSummary: '与官方 dsh 共享设置、凭据、会话和插件。', freshTitle: '全新开始',
  freshSummary: '不导入任何现有数据。', locationLabel: '数据位置', sharingLabel: '共享范围',
  pluginsLabel: '已有插件', buildsLabel: '构建权限', compare: '查看完整对比', cancel: '取消',
  continue: '使用此配置', comparisonTitle: '这三个选项有什么区别？', suitableLabel: '适合谁',
  compareImportLocation: '将设置、凭据、会话、Skills 等用户数据复制到桌面版独立目录。', compareReuseLocation: '直接使用官方 ~/.dsh。',
  compareFreshLocation: '创建新的桌面版独立目录。', compareImportSharing: '不共享；复制后互不影响。',
  compareReuseSharing: '共享；两端修改会互相影响。', compareFreshSharing: '不共享任何既有数据。',
  compareImportPlugins: '复制安全的插件恢复清单但不复制 Profile 或运行时；进入后可选择联网重新安装。', compareReusePlugins: '直接使用官方目录中已有插件。',
  compareFreshPlugins: '从空白 Profile 开始，只安装预置项。', compareImportSuitable: '希望保留数据，同时隔离桌面版的用户。',
  compareReuseSuitable: '希望桌面版与官方 dsh 始终一致的用户。', compareFreshSuitable: '希望完全从零配置的用户。',
  comparisonNote: '“导入”一次性复制用户数据、插件清单与精确构建许可，恢复后仍使用独立 Profile；只有“直接复用”会持续共享官方插件环境。',
  acknowledge: '知道了', helpLabel: '查看三个选项的区别', closeLabel: '关闭', modeGroupLabel: '数据目录模式',
}

const en: typeof zh = {
  windowTitle: 'Choose data directory', languageLabel: 'Language', importTitle: 'Import official configuration (independent)', recommended: 'Recommended',
  importSummary: 'Copy user data and a plugin list; choose what to reinstall after entry.', reuseTitle: 'Reuse official configuration',
  reuseSummary: 'Share settings, credentials, sessions, and plugins with official dsh.', freshTitle: 'Start fresh',
  freshSummary: 'Do not import any existing data.', locationLabel: 'Data location', sharingLabel: 'Sharing',
  pluginsLabel: 'Existing plugins', buildsLabel: 'Build approvals', compare: 'View full comparison', cancel: 'Cancel',
  continue: 'Use this configuration', comparisonTitle: 'How do these options differ?', suitableLabel: 'Best for',
  compareImportLocation: 'Copy user settings, credentials, sessions, Skills, and other supported data into an independent desktop directory.', compareReuseLocation: 'Use official ~/.dsh directly.',
  compareFreshLocation: 'Create a new independent desktop directory.', compareImportSharing: 'Not shared; each side changes independently.',
  compareReuseSharing: 'Shared; changes on either side affect the other.', compareFreshSharing: 'No existing data is shared.',
  compareImportPlugins: 'Copy a safe restore list without Profiles or runtimes, then choose plugins to reinstall online.', compareReusePlugins: 'Use plugins already installed in the official home.',
  compareFreshPlugins: 'Start with an empty Profile and install only presets.', compareImportSuitable: 'Keep existing data while isolating the desktop app.',
  compareReuseSuitable: 'Keep the desktop app and official dsh fully aligned.', compareFreshSuitable: 'Configure everything from scratch.',
  comparisonNote: 'Import copies user data, a plugin list, and exact build rules once while keeping an independent Profile. Only Reuse continuously shares the official plugin environment.',
  acknowledge: 'Got it', helpLabel: 'Compare the three options', closeLabel: 'Close', modeGroupLabel: 'Data directory mode',
}

const details: Record<'zh' | 'en', Record<DataHomeMode, DetailCopy>> = {
  zh: {
    imported: {
      title: zh.importTitle,
      location: '复制到桌面版独立数据目录，官方 ~/.dsh 保持不变。',
      sharing: '复制完成后不共享；桌面版与官方 dsh 的后续修改互不影响。',
      plugins: '复制插件恢复清单但不复制 Profile、node_modules 或锁文件；进入后可选择重新安装，预置同名项不会重复安装。',
      builds: '导入经过验证的精确 allowBuilds 布尔规则并与独立 Profile 合并；任何明确 false 都不会被放宽。',
    },
    reused: {
      title: zh.reuseTitle,
      risk: '桌面版与官方 dsh 的修改会互相影响，包括凭据、会话和插件。',
      location: '直接使用 ~/.dsh，不创建第二份 Harness 配置。',
      sharing: '共享设置、凭据、会话、Agent 预设、Skills、Profile 和插件。',
      plugins: '保留当前版本；同名、npm alias 或同 GitHub 仓库与子路径不重复安装。',
      builds: '与现有 allowBuilds 取并集，用户明确设置的 false 不会被覆盖。',
    },
    fresh: {
      title: zh.freshTitle,
      location: '创建空白的桌面版独立数据目录。',
      sharing: '不读取或修改官方 ~/.dsh。',
      plugins: '从空白 Profile 开始，只核对桌面版预置插件。',
      builds: '仅加入预置插件经过审核且确实需要的构建许可。',
    },
  },
  en: {
    imported: {
      title: en.importTitle,
      location: 'Copy into the desktop-owned data directory while leaving official ~/.dsh unchanged.',
      sharing: 'Nothing stays shared after copying; later changes remain independent.',
      plugins: 'Copy a plugin restore list without Profiles, node_modules, or lockfiles. Choose what to reinstall after entry; matching presets are not duplicated.',
      builds: 'Merge validated exact allowBuilds booleans into the independent Profile. Every explicit false remains denied.',
    },
    reused: {
      title: en.reuseTitle,
      risk: 'Desktop and official dsh changes affect each other, including credentials, sessions, and plugins.',
      location: 'Use ~/.dsh directly without creating a second Harness configuration.',
      sharing: 'Share settings, credentials, sessions, Agent presets, Skills, Profiles, and plugins.',
      plugins: 'Keep current versions; matching names, npm aliases, or GitHub repository subpaths are not installed twice.',
      builds: 'Merge with existing allowBuilds while preserving every explicit false rule.',
    },
    fresh: {
      title: en.freshTitle,
      location: 'Create an empty desktop-owned data directory.',
      sharing: 'Do not read or modify official ~/.dsh.',
      plugins: 'Start from an empty Profile and reconcile only desktop presets.',
      builds: 'Add only reviewed lifecycle approvals required by desktop presets.',
    },
  },
}

function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector)
  if (element === null) throw new Error(`desktop: data-home chooser is missing ${selector}`)
  return element
}

window.addEventListener('DOMContentLoaded', () => {
  let language: 'zh' | 'en' = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const help = required('#help') as HTMLButtonElement
  const close = required('#close-comparison') as HTMLButtonElement
  const choicesGroup = required('#choices')
  const languageSelect = required('#language') as HTMLSelectElement

  const choices = [...document.querySelectorAll<HTMLButtonElement>('.choice')]
  const overlay = required('#overlay')
  const detailTitle = required('#detail-title')
  const risk = required('#risk')
  const location = required('#location-value')
  const sharing = required('#sharing-value')
  const plugins = required('#plugins-value')
  const builds = required('#builds-value')
  const requestedMode = new URLSearchParams(window.location.search).get('selected')
  let selected: DataHomeMode = isDataHomeMode(requestedMode) ? requestedMode : 'imported'

  const renderCopy = (): void => {
    const copy = language === 'zh' ? zh : en
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    document.title = copy.windowTitle
    languageSelect.value = language
    help.ariaLabel = copy.helpLabel
    close.ariaLabel = copy.closeLabel
    choicesGroup.ariaLabel = copy.modeGroupLabel
    for (const element of document.querySelectorAll<HTMLElement>('[data-copy]')) {
      const key = element.dataset.copy as keyof typeof copy
      element.textContent = copy[key]
    }
  }

  const select = (mode: DataHomeMode): void => {
    selected = mode
    for (const choice of choices) choice.ariaChecked = String(choice.dataset.mode === mode)
    const detail = details[language][mode]
    detailTitle.textContent = detail.title
    risk.textContent = detail.risk ?? ''
    risk.hidden = detail.risk === undefined
    location.textContent = detail.location
    sharing.textContent = detail.sharing
    plugins.textContent = detail.plugins
    builds.textContent = detail.builds
  }
  for (const choice of choices) {
    choice.addEventListener('click', () => { select(choice.dataset.mode as DataHomeMode) })
  }
  languageSelect.addEventListener('change', () => {
    language = languageSelect.value === 'en' ? 'en' : 'zh'
    renderCopy()
    select(selected)
  })

  const showComparison = (): void => {
    overlay.hidden = false
    required('#acknowledge').focus()
  }
  const hideComparison = (): void => {
    overlay.hidden = true
    help.focus()
  }
  help.addEventListener('click', showComparison)
  required('#compare').addEventListener('click', showComparison)
  close.addEventListener('click', hideComparison)
  required('#acknowledge').addEventListener('click', hideComparison)
  overlay.addEventListener('click', (event) => { if (event.target === overlay) hideComparison() })
  required('#continue').addEventListener('click', () => {
    ipcRenderer.send('dsh:data-home:selected', selected)
  })
  required('#cancel').addEventListener('click', () => {
    ipcRenderer.send('dsh:data-home:cancelled')
  })
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) hideComparison()
    else if (event.key === 'Escape') ipcRenderer.send('dsh:data-home:cancelled')
    else if (event.key === 'Enter' && overlay.hidden) ipcRenderer.send('dsh:data-home:selected', selected)
  })
  renderCopy()
  select(selected)
}, { once: true })
