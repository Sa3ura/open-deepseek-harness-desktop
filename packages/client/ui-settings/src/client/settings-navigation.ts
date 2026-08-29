import { Service, type Context } from '@deepseek-ai/cordis'

export interface SettingsNavigationRequest {
  sectionId: string
  subsectionId?: string
  revision: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    settingsNavigation: SettingsNavigation
  }
}

/** Process-local navigation channel owned by the settings domain. */
export class SettingsNavigation extends Service {
  private request: SettingsNavigationRequest | undefined
  private revision = 0
  private readonly listeners = new Set<() => void>()

  constructor(ctx: Context) {
    super(ctx, 'settingsNavigation')
  }

  open(request: Omit<SettingsNavigationRequest, 'revision'>): void {
    this.revision += 1
    this.request = { ...request, revision: this.revision }
    for (const listener of this.listeners) listener()
  }

  getSnapshot = (): SettingsNavigationRequest | undefined => this.request

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}
