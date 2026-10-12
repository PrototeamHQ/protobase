import { createContext, useContext } from 'react'

/** A loaded plugin, as its components see it with `usePlugin()`. */
export type PluginInfo = {
  name: string
  /** Its own version, from its package.json, when it has one. */
  version?: string
  /** Its plugin.json, from which its own files are found: `new URL('./data.json', url)`. */
  url: string
  /** What the app gives it in `options.plugins`. */
  settings: Record<string, unknown>
}

const PluginContext = createContext<PluginInfo | null>(null)

export const PluginProvider = PluginContext.Provider

/** The plugin the calling component belongs to: its name, version, URL and settings. Only a plugin's components may call it. */
export const usePlugin = () => {
  const plugin = useContext(PluginContext)
  if (!plugin) throw new Error('usePlugin is for the components of a plugin the app loaded')
  return plugin
}
