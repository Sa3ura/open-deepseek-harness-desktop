import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PluginInventoryLocaleKey } from './locales.ts'
import {
  readImportedPluginRestoreBridge,
  type ImportedPluginRestoreEntry,
  type ImportedPluginRestoreSnapshot,
} from './imported-restore-bridge.ts'
import { restartDesktopApplication } from './bundled-install-bridge.ts'
import css from './ImportedPluginRestore.module.css'

export interface ImportedPluginRestoreInjected {
  readonly getRestore: () => Promise<ImportedPluginRestoreSnapshot | undefined>
  readonly checkSources: () => Promise<ImportedPluginRestoreSnapshot | undefined>
  readonly startRestore: (restoreIds: readonly string[]) => Promise<ImportedPluginRestoreSnapshot>
  readonly chooseLocalDirectory: (restoreId: string) => Promise<ImportedPluginRestoreSnapshot | undefined>
  readonly chooseLocalArchive: (restoreId: string) => Promise<ImportedPluginRestoreSnapshot | undefined>
  readonly dismissRestore: () => Promise<ImportedPluginRestoreSnapshot | undefined>
  readonly ignoreRestore: () => Promise<ImportedPluginRestoreSnapshot | undefined>
  readonly restart: () => Promise<boolean>
}

export interface ImportedPluginRestoreProps extends ImportedPluginRestoreInjected {
  readonly mode: 'dialog' | 'card'
  readonly t: (key: PluginInventoryLocaleKey, params?: Record<string, string | number>) => string
}

export type ImportedPluginRestoreDialogProps = Omit<ImportedPluginRestoreProps, 'mode'>

/** Desktop bridge methods injected into both restore presentations. */
export function importedPluginRestoreInjected(): ImportedPluginRestoreInjected {
  const bridge = readImportedPluginRestoreBridge()
  return {
    getRestore: () => bridge?.get() ?? Promise.resolve(undefined),
    checkSources: () => bridge?.checkSources() ?? Promise.resolve(undefined),
    startRestore: ids => bridge === undefined
      ? Promise.reject(new Error('desktop imported plugin bridge is unavailable'))
      : bridge.start(ids),
    chooseLocalDirectory: id => bridge?.chooseLocalDirectory(id) ?? Promise.resolve(undefined),
    chooseLocalArchive: id => bridge?.chooseLocalArchive(id) ?? Promise.resolve(undefined),
    dismissRestore: () => bridge?.dismiss() ?? Promise.resolve(undefined),
    ignoreRestore: () => bridge?.ignore() ?? Promise.resolve(undefined),
    restart: restartDesktopApplication,
  }
}

function stateKey(entry: ImportedPluginRestoreEntry): PluginInventoryLocaleKey {
  return `restore.state.${entry.state}`
}

function reasonKey(entry: ImportedPluginRestoreEntry): PluginInventoryLocaleKey | undefined {
  return entry.unsupportedReason === undefined
    ? undefined
    : `restore.reason.${entry.unsupportedReason}`
}

function availabilityKey(entry: ImportedPluginRestoreEntry): PluginInventoryLocaleKey {
  return `restore.availability.${entry.availability}`
}

/** Render the first-run modal or the persistent Plugins-page recovery card. */
export function ImportedPluginRestore({
  mode,
  getRestore,
  checkSources,
  startRestore,
  chooseLocalDirectory,
  chooseLocalArchive,
  dismissRestore,
  ignoreRestore,
  restart,
  t,
}: ImportedPluginRestoreProps): ReactNode {
  const titleId = useId()
  const [snapshot, setSnapshot] = useState<ImportedPluginRestoreSnapshot>()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState(false)
  const previousAvailability = useRef(new Map<string, ImportedPluginRestoreEntry['availability']>())

  const applySnapshot = useCallback((next: ImportedPluginRestoreSnapshot | undefined) => {
    setSnapshot(next)
    if (next === undefined) return
    setSelected((current) => {
      const selectedNext = new Set(current)
      for (const entry of next.entries) {
        const previous = previousAvailability.current.get(entry.restoreId)
        const selectableNow = entry.recoverable
          && (entry.state === 'pending' || entry.state === 'failed')
          && (entry.availability === 'available' || entry.availability === 'unknown')
        if (!selectableNow) selectedNext.delete(entry.restoreId)
        if (entry.availability === 'available' && entry.defaultSelected
          && (previous === undefined || previous === 'checking')) selectedNext.add(entry.restoreId)
        previousAvailability.current.set(entry.restoreId, entry.availability)
      }
      return selectedNext
    })
  }, [])

  const refresh = useCallback(async () => {
    const next = await getRestore()
    applySnapshot(next)
    return next
  }, [applySnapshot, getRestore])

  useEffect(() => {
    let current = true
    void getRestore().then((next) => {
      if (!current || next === undefined) return
      applySnapshot(next)
      void checkSources().then((checked) => {
        if (current) applySnapshot(checked)
      }, () => { if (current) setFailed(true) })
    }, () => { if (current) setFailed(true) })
    return () => { current = false }
  }, [applySnapshot, checkSources, getRestore])

  useEffect(() => {
    if (!snapshot?.active && !snapshot?.sourceCheckActive) return
    const timer = window.setInterval(() => { void refresh().catch(() => { setFailed(true) }) }, 500)
    return () => { window.clearInterval(timer) }
  }, [refresh, snapshot?.active, snapshot?.sourceCheckActive])

  const visible = snapshot !== undefined
    && snapshot.entries.length > 0
    && (mode === 'dialog'
      ? !snapshot.firstPromptDismissed
      : snapshot.restartRequired || snapshot.entries.some(entry => (
        entry.state === 'pending' || entry.state === 'failed' || entry.state === 'installing'
      )))
  const selectable = useMemo(() => snapshot?.entries.filter(entry => (
    entry.recoverable && (entry.state === 'pending' || entry.state === 'failed')
      && (entry.availability === 'available' || entry.availability === 'unknown')
  )) ?? [], [snapshot])
  if (!visible) return null

  const toggle = (id: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const start = (): void => {
    setFailed(false)
    void startRestore([...selected]).then(applySnapshot, () => { setFailed(true) })
  }
  const chooseLocal = (entry: ImportedPluginRestoreEntry, kind: 'directory' | 'archive'): void => {
    setFailed(false)
    const operation = kind === 'directory' ? chooseLocalDirectory : chooseLocalArchive
    void operation(entry.restoreId).then(applySnapshot, () => { setFailed(true) })
  }
  const body = (
    <section
      className={css.surface}
      data-mode={mode}
      aria-busy={snapshot.active}
      aria-labelledby={titleId}
      {...(mode === 'dialog' ? { role: 'dialog', 'aria-modal': true } : {})}
    >
      <div className={css.heading}>
        <div>
          <span className={css.eyebrow}>{t('restore.eyebrow')}</span>
          <h3 id={titleId}>{t('restore.title')}</h3>
          <p>{t('restore.description')}</p>
        </div>
        <span className={css.count}>{snapshot.entries.length}</span>
      </div>
      {snapshot.sourceIssues.length > 0 ? (
        <p className={css.notice} role="status">{t('restore.sourceIssue')}</p>
      ) : null}
      <div className={css.sourceCheck}>
        <span>{snapshot.sourceCheckActive ? t('restore.checkingSources') : t('restore.sourcesChecked')}</span>
        <button type="button" disabled={snapshot.active || snapshot.sourceCheckActive} onClick={() => {
          setFailed(false)
          void checkSources().then(applySnapshot, () => { setFailed(true) })
        }}>{t('restore.recheckSources')}</button>
      </div>
      <div className={css.groups}>
        {(['plugin', 'external-tool'] as const).map((category) => {
          const entries = snapshot.entries.filter(entry => entry.category === category)
          if (entries.length === 0) return null
          return (
            <div className={css.group} key={category}>
              <div className={css.groupHeading}>
                <strong>{t(category === 'plugin' ? 'restore.group.plugins' : 'restore.group.tools')}</strong>
                {category === 'plugin' && selectable.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const all = selectable.filter(entry => entry.category === 'plugin')
                      const selectAll = all.some(entry => !selected.has(entry.restoreId))
                      setSelected((current) => {
                        const next = new Set(current)
                        for (const entry of all) {
                          if (selectAll) next.add(entry.restoreId)
                          else next.delete(entry.restoreId)
                        }
                        return next
                      })
                    }}
                  >{t('restore.selectAll')}</button>
                ) : null}
              </div>
              <ul className={css.entries}>
                {entries.map((entry) => {
                  const selectableEntry = entry.recoverable && (entry.state === 'pending' || entry.state === 'failed')
                    && (entry.availability === 'available' || entry.availability === 'unknown')
                  const reason = reasonKey(entry)
                  const canUseLocal = entry.category === 'plugin'
                    && (entry.state === 'pending' || entry.state === 'failed')
                  return (
                    <li key={entry.restoreId} data-state={entry.state}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected.has(entry.restoreId)}
                          disabled={!selectableEntry || snapshot.active}
                          onChange={() => { toggle(entry.restoreId) }}
                        />
                        <span>
                          <strong>{entry.packageName}</strong>
                          <code>{entry.declaredSpec}</code>
                        </span>
                      </label>
                      <span className={css.entryState}>{entry.state === 'pending'
                        ? reason === undefined ? t(availabilityKey(entry)) : t(reason)
                        : t(stateKey(entry))}</span>
                      {entry.availabilityDiagnostic !== undefined ? (
                        <details><summary>{t('restore.sourceDetails')}</summary><pre>{entry.availabilityDiagnostic}</pre></details>
                      ) : null}
                      {entry.state === 'failed' && entry.diagnostic !== undefined ? (
                        <details><summary>{t('restore.failureDetails')}</summary><pre>{entry.diagnostic}</pre></details>
                      ) : null}
                      {canUseLocal ? (
                        <div className={css.localActions}>
                          <button type="button" disabled={snapshot.active} onClick={() => { chooseLocal(entry, 'directory') }}>
                            {t('restore.localDirectory')}
                          </button>
                          <button type="button" disabled={snapshot.active} onClick={() => { chooseLocal(entry, 'archive') }}>
                            {t('restore.localArchive')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      {failed ? <p className={css.error} role="alert">{t('restore.operationFailed')}</p> : null}
      <div className={css.actions}>
        {snapshot.restartRequired ? (
          <Button variant="primary" onClick={() => { void restart() }}>{t('restore.restart')}</Button>
        ) : (
          <Button variant="primary" disabled={selected.size === 0 || snapshot.active} onClick={start}>
            {snapshot.active ? t('restore.installing') : t('restore.install')}
          </Button>
        )}
        {mode === 'dialog' ? (
          <Button variant="outline" disabled={snapshot.active} onClick={() => {
            void dismissRestore().then(applySnapshot)
          }}>{t('restore.later')}</Button>
        ) : (
          <Button variant="outline" disabled={snapshot.active} onClick={() => {
            void ignoreRestore().then(applySnapshot)
          }}>{t('restore.ignore')}</Button>
        )}
      </div>
    </section>
  )
  return mode === 'dialog' ? <div className={css.mask} role="presentation">{body}</div> : body
}

/** First-entry presentation registered in the shell overlay slot. */
export function ImportedPluginRestoreDialog(props: ImportedPluginRestoreDialogProps): ReactNode {
  return <ImportedPluginRestore {...props} mode="dialog" />
}

/** Reopenable presentation embedded in the existing Plugins settings page. */
export function ImportedPluginRestoreCard(props: ImportedPluginRestoreDialogProps): ReactNode {
  return <ImportedPluginRestore {...props} mode="card" />
}
