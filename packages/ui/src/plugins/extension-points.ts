import type { ProjectUi } from '../app/pages/project-ui'

/** The parts of a plugin's UI config the app draws or runs (see `pluginUi`): the extension points a plugin can fill. */
export const pluginExtensionPoints = [
  'components',
  'actions',
  'fields',
  'fileViewers',
  'dropRules',
  'boardDrops',
  'titles',
  'marks',
  'shell.actions',
  'shell.rightPanel',
  'shell.logo',
  'shell.bell',
  'beforeSignIn',
] as const

const valueAt = (ui: ProjectUi, point: string): unknown => point.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], ui)

// A component, or a map holding at least one entry.
const filled = (value: unknown) => value !== undefined && value !== null && !(typeof value === 'object' && Object.keys(value).length === 0)

/**
 * The extension points a merged UI config fills, which `protobase build-plugin` records in plugin.json so an app
 * without one of them leaves the plugin off.
 */
export const extensionPointsOf = (ui: ProjectUi): string[] => pluginExtensionPoints.filter((point) => filled(valueAt(ui, point)))
