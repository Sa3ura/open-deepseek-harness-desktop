/** Live plugin-market preview for the new-session home screen. */
import { useEffect, useState, type ReactNode } from 'react'
import type { PluginInventorySnapshot } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginInstallId, PluginInstallSnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import { Button, IconCordisPluginOutline14, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PluginInventoryLocaleKey } from './locales.ts'
import css from './PluginDiscovery.module.css'

type PreviewState = 'installed' | 'uninstalled' | 'restart' | 'unavailable'
interface PreviewItem {
  name: string
  owner: string
  category: string[]
  categoryLabels: Record<string, Record<string, string>>
  description: Record<string, string>
  downloads: number | null
  stars: number | null
  packageName: string
  state: PreviewState
}
interface PreviewSnapshot {
  schema: 'dsh-market/preview/v1'
  updated: string
  items: PreviewItem[]
}
type ViewState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; snapshot: PreviewSnapshot }
  | { status: 'missing' | 'outdated' | 'error'; message?: string; elapsedMs: number }

export type PluginDiscoveryProps = PropsRuntime<'conversation.hero.pluginDiscovery'>
  & PropsLocale<'settings.pluginInventory'> & PluginDiscoveryInjected
export interface PluginDiscoveryInjected {
  list: () => Promise<PluginInventorySnapshot>
  startInstall: () => Promise<PluginInstallSnapshot>
  getInstall: (installId: PluginInstallId) => Promise<PluginInstallSnapshot>
  openSettings: (sectionId: string, subsectionId?: string) => void
}

const endpoint = (): string => new URL('dsh-market/preview', document.baseURI).pathname
const count = (value: number | null): string => value === null ? '—' : new Intl.NumberFormat().format(value)

export function PluginDiscovery({ t, list, startInstall, getInstall, openSettings }: PluginDiscoveryProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState(0)
  const [state, setState] = useState<ViewState>({ status: 'idle' })
  const [install, setInstall] = useState<PluginInstallSnapshot | null>(null)
  const lang = document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'

  useEffect(() => {
    if (!open) return
    let current = true
    const started = performance.now()
    setState({ status: 'loading' })
    void (async () => {
      let marketInstalled = false
      try {
        const inventory = await list()
        marketInstalled = inventory.entries.some(entry => entry.moduleName === 'dshmarket' || entry.moduleName === 'dsh-market')
      } catch { /* the preview request still supplies a useful verdict */ }
      try {
        const response = await fetch(endpoint(), { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
        const elapsedMs = Math.round(performance.now() - started)
        if (response.status === 404) {
          if (current) setState({ status: marketInstalled ? 'outdated' : 'missing', elapsedMs })
          return
        }
        const body = await response.json() as PreviewSnapshot & { error?: string }
        if (!response.ok || body.schema !== 'dsh-market/preview/v1') {
          if (current) setState({ status: marketInstalled ? 'outdated' : 'error', elapsedMs, ...(body.error === undefined ? {} : { message: body.error }) })
          return
        }
        if (current) setState({ status: 'ready', snapshot: body })
      } catch (cause) {
        if (current) setState({ status: marketInstalled ? 'error' : 'missing', elapsedMs: Math.round(performance.now() - started), message: cause instanceof Error ? cause.message : String(cause) })
      }
    })()
    return () => { current = false }
  }, [list, open, request])

  useEffect(() => {
    if (install?.phase !== 'running') return
    const timer = window.setTimeout(() => { void getInstall(install.installId).then(setInstall) }, 750)
    return () => { window.clearTimeout(timer) }
  }, [getInstall, install])

  const installMarket = (): void => {
    void startInstall().then(setInstall).catch(() => {
      setState({ status: 'error', elapsedMs: 0, message: t('discovery.install.startFailed') })
    })
  }
  const navigate = (item?: PreviewItem): void => {
    setOpen(false)
    openSettings('market', item === undefined ? 'discover' : `${item.state === 'uninstalled' ? 'discover' : 'installed'}:${item.packageName}`)
  }

  return <>
    <button type="button" className={css.trigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true) }}>
      <IconCordisPluginOutline14 size={14} />{t('discovery.trigger')}
    </button>
    <Modal open={open} onClose={() => { setOpen(false) }} closeLabel={t('discovery.close')} title={t('discovery.title')}
      description={t('discovery.description')} className={css.dialog as string} contentClassName={css.dialogContent as string}>
      {state.status === 'loading' || state.status === 'idle'
        ? <div className={css.notice}>{t('discovery.loading')}</div>
        : state.status === 'ready'
          ? <><ul className={css.grid}>{state.snapshot.items.map(item => <li key={item.name} className={css.card}>
            <div className={css.cardHead}><div><div className={css.category}>{item.category.map(id => item.categoryLabels[id]?.[lang] ?? item.categoryLabels[id]?.en ?? id).join(' · ')}</div>
              <div className={css.name}>{item.name}</div><div className={css.author}>@{item.owner}</div></div>
            <span className={css.state}>{t(`discovery.state.${item.state}` as PluginInventoryLocaleKey)}</span></div>
            <p className={css.summary}>{item.description[lang] ?? item.description.en ?? ''}</p>
            <div className={css.meta}><span>★ {count(item.stars)}</span><span>{t('discovery.downloads')} {count(item.downloads)}</span></div>
            <div className={css.actions}><Button size="sm" variant="outline" onClick={() => { navigate(item) }}>
              {t(item.state === 'uninstalled' ? 'discovery.goInstall' : 'discovery.goManage')}</Button></div>
          </li>)}</ul>
          <div className={css.footer}><span>{t('discovery.updated')} {state.snapshot.updated}</span>
            <Button size="sm" variant="ghost" onClick={() => { navigate() }}>{t('discovery.more')}</Button></div></>
          : state.status === 'missing' || state.status === 'outdated' || state.status === 'error'
            ? <div className={css.notice}><strong>{t(`discovery.${state.status}.title` as PluginInventoryLocaleKey)}</strong>
              <p>{t(`discovery.${state.status}.description` as PluginInventoryLocaleKey)} ({state.elapsedMs} ms)</p>
              {state.message === undefined ? null : <code>{state.message}</code>}
              <div className={css.actions}>{state.status === 'missing'
                ? <Button size="sm" variant="primary" disabled={install?.phase === 'running'} onClick={installMarket}>{t('discovery.installMarket')}</Button>
                : state.status === 'outdated'
                  ? <Button size="sm" variant="primary" disabled={install?.phase === 'running'} onClick={installMarket}>{t('discovery.updateMarket')}</Button>
                  : null}
              <Button size="sm" variant="outline" onClick={() => { setRequest(value => value + 1) }}>{t('discovery.retry')}</Button></div>
              {install?.phase === 'succeeded' ? <p>{t('discovery.marketInstalledRestart')}</p> : null}
            </div>
            : null}
    </Modal>
  </>
}
