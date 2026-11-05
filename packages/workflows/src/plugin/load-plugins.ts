import type { Plugin } from './types'

/** A plugin and where it came from, such as a package name or a file, which an error names. */
export type LoadedPlugin = { plugin: Plugin; source: string }

/** The plugins an app runs, refusing two of one name, which would give two types one id. */
export const loadPlugins = (loaded: readonly LoadedPlugin[]): Plugin[] => {
  const seen = new Map<string, string>()
  for (const { plugin, source } of loaded) {
    const first = seen.get(plugin.name)
    if (first !== undefined) throw new Error(`Two workflow plugins are named "${plugin.name}": ${first} and ${source}`)
    seen.set(plugin.name, source)
  }
  return loaded.map(({ plugin }) => plugin)
}
