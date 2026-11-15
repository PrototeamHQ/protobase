import { customPlugin } from './custom-steps'
import { checkPlugin } from './define-plugin'
import type { Plugin } from './types'

/** A plugin and where it came from, such as a package name or a file, which an error names. */
export type LoadedPlugin = { plugin: Plugin; source: string }

const record = (value: unknown) => value === undefined || (typeof value === 'object' && value !== null)

// What a module's default export must be to be read as a plugin; definePlugin's checks then look at its names.
const isPlugin = (value: unknown): value is Plugin => {
  if (typeof value !== 'object' || value === null) return false
  const plugin = value as Record<string, unknown>
  return typeof plugin.name === 'string' && typeof plugin.label === 'string' && record(plugin.steps) && record(plugin.triggers) && record(plugin.connections)
}

/**
 * The plugins an app runs, each checked as definePlugin checks it, refusing two of one name, which would give two types
 * one id, and one named `custom`, the name of the app's custom steps.
 */
export const loadPlugins = (loaded: readonly LoadedPlugin[]): Plugin[] => {
  const seen = new Map<string, string>()
  for (const { plugin, source } of loaded) {
    if (!isPlugin(plugin)) throw new Error(`${source} does not export a workflow plugin as its default; export default definePlugin({ ... })`)
    checkPlugin(plugin, `Workflow plugin "${plugin.name}" of ${source}`)
    if (plugin.name === customPlugin) throw new Error(`Workflow plugin "${customPlugin}" of ${source}: "${customPlugin}" is kept for the app's custom steps, whose types are ${customPlugin}:<name>:<version>; give the plugin another name`)
    const first = seen.get(plugin.name)
    if (first !== undefined) throw new Error(`Two workflow plugins are named "${plugin.name}": ${first} and ${source}`)
    seen.set(plugin.name, source)
  }
  return loaded.map(({ plugin }) => plugin)
}
