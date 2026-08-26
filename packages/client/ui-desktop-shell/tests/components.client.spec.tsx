// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DesktopBridge, DesktopCliStatus, DesktopReleaseStatus } from '../src/client/bridge.ts'
import { DesktopShellController } from '../src/client/controller.ts'
import { DesktopPreferencesRow, type DesktopPreferencesRowProps } from '../src/client/DesktopPreferencesRow.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: string, params?: Record<string, string | number>) => {
  let value = (en as Record<string, string>)[key] ?? key
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replace(`{${name}}`, String(replacement))
  return value
}) as never

function setup(releaseStatus: DesktopReleaseStatus = {
  phase: 'available', currentVersion: '0.1.0-rc.7', latestVersion: '0.1.0-rc.8',
  publishedAt: '2026-08-20T00:00:00Z', releaseUrl: 'https://github.com/flaqai/open-deepseek-harness-desktop/releases/tag/dsh-v0.1.0-rc.8',
}, commandLine: DesktopCliStatus = {
  phase: 'uninstalled', commandPath: '/desktop/cli/bin/dsh', dataHome: '/desktop/dsh-home',
}) {
  const updatePreferences = vi.fn((patch: Record<string, unknown>) => Promise.resolve({
    closeBehavior: patch.closeBehavior === 'quit' ? 'quit' as const : 'tray' as const,
    notificationsEnabled: patch.notificationsEnabled !== false,
    launchAtLoginEnabled: patch.launchAtLoginEnabled === true,
  }))
  const openDownload = vi.fn(() => Promise.resolve({ error: '' }))
  const installCommandLine = vi.fn(() => Promise.resolve({
    phase: 'installed' as const, commandPath: '/desktop/cli/bin/dsh', dataHome: '/desktop/dsh-home',
  }))
  const bridge: DesktopBridge = {
    shell: {
      getCapabilities: () => Promise.resolve({
        platform: 'darwin', packaged: true, launchAtLoginAvailable: true, sourceUpdateAvailable: false,
        commandLineAvailable: true,
      }),
      getPreferences: () => Promise.resolve({
        closeBehavior: 'tray', notificationsEnabled: true, launchAtLoginEnabled: false,
      }),
      updatePreferences,
      onPreferences: () => () => {},
      openLog: vi.fn(),
      getCommandLine: () => Promise.resolve(commandLine),
      installCommandLine,
      removeCommandLine: vi.fn(() => Promise.resolve({
        phase: 'uninstalled' as const, commandPath: '/desktop/cli/bin/dsh', dataHome: '/desktop/dsh-home',
      })),
    },
    releases: {
      getStatus: () => Promise.resolve(releaseStatus),
      check: vi.fn(), onStatus: () => () => {}, openDownload,
    },
  }
  const controller = new DesktopShellController(bridge)
  controller.start()
  return { controller, updatePreferences, openDownload, installCommandLine }
}

describe('desktop shell components', () => {
  it('shows preferences and sends toggle updates', async () => {
    const b = setup()
    render(<DesktopPreferencesRow {...({ controller: b.controller, t } as DesktopPreferencesRowProps)} />)
    const notifications = await screen.findByRole('switch', { name: 'System notifications' })
    fireEvent.click(notifications)
    await waitFor(() => { expect(b.updatePreferences).toHaveBeenCalledWith({ notificationsEnabled: false }) })
    expect(screen.getByText('Version 0.1.0-rc.8 is available')).toBeTruthy()
    b.controller.dispose()
  })

  it('checks for updates inside General Settings and opens an available Release', async () => {
    const b = setup()
    render(<DesktopPreferencesRow {...({ controller: b.controller, t } as DesktopPreferencesRowProps)} />)
    expect(await screen.findByText('Version 0.1.0-rc.8 is available')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View download' }))
    await waitFor(() => { expect(b.openDownload).toHaveBeenCalledOnce() })
    b.controller.dispose()
  })

  it('keeps the update check inside General Settings when the client is current', async () => {
    const b = setup({ phase: 'current', currentVersion: '0.1.0-rc.8' })
    render(<DesktopPreferencesRow {...({ controller: b.controller, t } as DesktopPreferencesRowProps)} />)
    expect(await screen.findByText('This is the latest version')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeTruthy()
    b.controller.dispose()
  })

  it('toggles simulated current and available update states in development mode', async () => {
    const b = setup({ phase: 'unsupported' })
    render(<DesktopPreferencesRow {...({ controller: b.controller, t } as DesktopPreferencesRowProps)} />)

    expect(await screen.findByText('Development mode: this is the latest version')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    expect(screen.getByText('Development mode: simulated version 0.1.1-rc.3 is available')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
    expect(screen.getByText('Development mode: this is the latest version')).toBeTruthy()
    expect(b.openDownload).not.toHaveBeenCalled()
    b.controller.dispose()
  })

  it('installs and removes the app-owned dsh command', async () => {
    const b = setup()
    render(<DesktopPreferencesRow {...({ controller: b.controller, t } as DesktopPreferencesRowProps)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Install dsh' }))
    await waitFor(() => { expect(screen.getByText('dsh is installed. Use it from a new terminal window.')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Check and repair' }))
    await waitFor(() => { expect(b.installCommandLine).toHaveBeenCalledTimes(2) })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Install dsh' })).toBeTruthy() })
    b.controller.dispose()
  })

  it('requires explicit confirmation before shadowing another dsh command', async () => {
    const b = setup(undefined, {
      phase: 'conflict', commandPath: '/desktop/cli/bin/dsh', dataHome: '/desktop/dsh-home',
      conflictPath: '/usr/local/bin/dsh',
    })
    render(<DesktopPreferencesRow {...({ controller: b.controller, t } as DesktopPreferencesRowProps)} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Install dsh' }))
    expect(screen.getByText('/usr/local/bin/dsh was found. Continuing gives the desktop-managed dsh higher priority without deleting the existing command.')).toBeTruthy()
    expect(b.installCommandLine).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Install anyway' }))
    await waitFor(() => { expect(b.installCommandLine).toHaveBeenCalledWith(true) })
    b.controller.dispose()
  })
})
