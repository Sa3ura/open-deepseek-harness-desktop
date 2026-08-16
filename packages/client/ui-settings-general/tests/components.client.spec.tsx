// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { GeneralSectionComponentProps } from '../src/client/GeneralSection.tsx'
import { GeneralSection } from '../src/client/GeneralSection.tsx'
import { CloseLabel, HeaderContent, TriggerContent } from '../src/client/chrome.tsx'
import type { TriggerContentProps } from '../src/client/chrome.tsx'
import { SettingsDocumentAction } from '../src/client/SettingsDocumentAction.tsx'
import { SettingsDocumentStore } from '../src/client/settings-document-store.ts'
import { DesktopUpdateRow, type DesktopUpdateBridge } from '../src/client/DesktopUpdateRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete window.deepSeekHarnessDesktop
})

// The seat's key domain is settings ∪ common; the stub answers from the
// package dictionary and falls back to the key like the real chain.
const t: TriggerContentProps['t'] = key => (en as Record<string, string>)[key] ?? key

// Global standard kit stubs: none of these components consume the hooks.
const unusedHook = (() => { throw new Error('unused by settings-general components') }) as never
const kit = { useSessions: unusedHook, useWorkspaces: unusedHook }

describe('chrome content', () => {
  it('TriggerContent renders the icon with the label in the wide column', () => {
    const { container } = render(<TriggerContent {...kit} wide t={t} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('TriggerContent drops the label in the rail state', () => {
    const { container } = render(<TriggerContent {...kit} wide={false} t={t} />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('Settings')).toBeNull()
  })

  it('HeaderContent and CloseLabel render their translated text', () => {
    render(<HeaderContent {...kit} t={t} />)
    render(<CloseLabel {...kit} t={t} />)
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('Close')).toBeTruthy()
  })
})

describe('GeneralSection', () => {
  function mount() {
    const renderSlot = vi.fn(
      ((key: string) => <div data-testid={`slot-${key}`} />) as GeneralSectionComponentProps['renderSlot'],
    )
    const props: GeneralSectionComponentProps = { ...kit, renderSlot, close: vi.fn() }
    const view = render(<GeneralSection {...props} />)
    return { view, renderSlot }
  }

  it('renders the item slot as the section body', () => {
    const { renderSlot } = mount()
    expect(renderSlot).toHaveBeenCalledWith('settings.general.item', {})
    expect(screen.getByTestId('slot-settings.general.item')).toBeTruthy()
  })
})

describe('SettingsDocumentAction', () => {
  it('appears only for a file-backed provider and requests its Host-owned document', async () => {
    const openDocument = vi.fn(() => Promise.resolve({
      rpcId: 'document-open' as never,
      result: { ok: true as const, value: { opened: true as const } },
    }))
    const controller = new SettingsDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          rpcId: 'document-action' as never,
          result: {
            ok: true as const,
            value: { writable: true, hasDocument: true, namespaces: [] },
          },
        })),
        openDocument,
      },
    } as never)
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    const action = await screen.findByRole('button', { name: 'Open configuration file' })
    fireEvent.click(action)
    await waitFor(() => { expect(openDocument).toHaveBeenCalledWith({}) })
  })

  it('stays absent without a document and retries availability after remount', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce({
        rpcId: 'document-action-absent' as never,
        result: { ok: true as const, value: { writable: true, hasDocument: false, namespaces: [] } },
      })
      .mockResolvedValueOnce({
        rpcId: 'document-action-ready' as never,
        result: { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [] } },
      })
    const controller = new SettingsDocumentStore({
      settings: {
        describe,
        openDocument: vi.fn(),
      },
    } as never)
    const first = render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    await waitFor(() => { expect(controller.store.getSnapshot().status).toBe('unavailable') })
    expect(screen.queryByRole('button', { name: 'Open configuration file' })).toBeNull()
    first.unmount()
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    expect(await screen.findByRole('button', { name: 'Open configuration file' })).toBeTruthy()
    expect(describe).toHaveBeenCalledTimes(2)
  })

  it('keeps the action available and reports a native-open failure', async () => {
    const controller = new SettingsDocumentStore({
      settings: {
        describe: vi.fn(() => Promise.resolve({
          rpcId: 'document-action' as never,
          result: {
            ok: true as const,
            value: { writable: true, hasDocument: true, namespaces: [] },
          },
        })),
        openDocument: vi.fn(() => Promise.resolve({
          rpcId: 'document-open-failed' as never,
          result: { ok: false as const, error: { code: 'internal' as const, message: 'xdg-open missing', details: {} } },
        })),
      },
    } as never)
    render(<SettingsDocumentAction
      {...kit}
      t={t}
      controller={controller}
      useSnapshot={bindSnapshotSelector(controller.store)}
    />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open configuration file' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not open configuration file')
    expect(screen.getByRole('button', { name: 'Open configuration file' })).toBeTruthy()
  })
})

describe('DesktopUpdateRow', () => {
  it('checks, confirms, upgrades, and offers restart through the narrow desktop bridge', async () => {
    const current = '1'.repeat(40)
    const latest = '2'.repeat(40)
    const check = vi.fn(() => Promise.resolve({
      repository: 'https://github.com/deepseek-ai/deepseek-harness.git',
      branch: 'master',
      reason: 'ready' as const,
      currentCommit: current,
      latestCommit: latest,
      dirtyFiles: 0,
    }))
    const upgrade = vi.fn(() => Promise.resolve({
      ok: true as const,
      previousCommit: current,
      currentCommit: latest,
      restartRequired: true as const,
    }))
    const restart = vi.fn(() => Promise.resolve({ restarting: true as const }))
    const updater: DesktopUpdateBridge = { check, upgrade, restart }
    render(<DesktopUpdateRow {...kit} updater={updater} t={t} />)

    expect(await screen.findByText('A newer stable version is available as a safe fast-forward update.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade Harness core' }))
    expect(screen.getByRole('dialog', { name: 'Upgrade DeepSeek Harness?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm upgrade' }))
    expect(await screen.findByText('Update complete. Restart the app to apply it.')).toBeTruthy()
    expect(upgrade).toHaveBeenCalledWith(latest)
    fireEvent.click(screen.getByRole('button', { name: 'Restart app now' }))
    expect(restart).toHaveBeenCalledOnce()
  })

  it('explains why a dirty source checkout cannot update', async () => {
    const updater: DesktopUpdateBridge = {
      check: () => Promise.resolve({
        repository: 'https://github.com/deepseek-ai/deepseek-harness.git',
        branch: 'master',
        reason: 'dirty',
        currentCommit: '1'.repeat(40),
        latestCommit: '2'.repeat(40),
        dirtyFiles: 7,
      }),
      upgrade: vi.fn(),
      restart: vi.fn(),
    }
    render(<DesktopUpdateRow {...kit} updater={updater} t={t} />)

    expect(await screen.findByText('Automatic update is blocked by uncommitted local changes.')).toBeTruthy()
    expect(screen.getByText('Commit or safely preserve 7 local changes, then check again.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Upgrade Harness core' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
