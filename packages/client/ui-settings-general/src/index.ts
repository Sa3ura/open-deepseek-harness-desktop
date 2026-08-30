/** Host loader entry for the browser implementation exported from `./client`. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  SETTINGS_NAVIGATION_NAMESPACE, type SettingsNavigationSettings,
} from './settings-navigation-order.ts'

/** Durable settings namespace for product-wide GUI onboarding facts. */
const ONBOARDING_SETTINGS_NAMESPACE = 'ui-onboarding'

interface OnboardingSettings {
  /** Last version acknowledged by the current product welcome step. */
  welcomeNoticeVersion?: string
}

const OnboardingSettingsSchema: z<OnboardingSettings> = z.object({
  welcomeNoticeVersion: z.string(),
})

const SettingsNavigationSchema: z<SettingsNavigationSettings> = z.object({
  sectionOrder: z.array(z.string()).default([]),
})

/** Register the durable onboarding and settings-navigation sections. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(ONBOARDING_SETTINGS_NAMESPACE),
      OnboardingSettingsSchema,
    )
    settingsCtx.settings.register(
      settingsNamespace(SETTINGS_NAVIGATION_NAMESPACE),
      SettingsNavigationSchema,
    )
  })
}
