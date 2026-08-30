/** Durable settings contract for the user-arranged settings navigation. */

/** Settings namespace owned by the settings shell. */
export const SETTINGS_NAVIGATION_NAMESPACE = 'ui-settings-navigation'

/** Host-persisted settings-shell preferences. */
export interface SettingsNavigationSettings {
  /** Stable `settings.section` ids in the user's preferred vertical order. */
  sectionOrder: string[]
}
