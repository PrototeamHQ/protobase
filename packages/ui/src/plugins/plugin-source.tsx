import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { PluginRef } from '@protobase/client'
import { browserLoader, loadPlugin, type PluginLoad, type PluginLoader } from './load-plugin'

/** Where the app's plugins come from: each loaded once for the page, by whichever gate asks for it first. */
export type PluginSource = { load: (ref: PluginRef) => Promise<PluginLoad> }

/** A source that loads with `loader` and keeps each plugin's load, so one named before and after sign-in loads once. */
export const createPluginSource = (loader: PluginLoader): PluginSource => {
  const loads = new Map<string, Promise<PluginLoad>>()
  return {
    load: (ref) => {
      const key = JSON.stringify(ref)
      const known = loads.get(key)
      if (known) return known
      const load = loadPlugin(ref, loader, window.location.href)
      loads.set(key, load)
      return load
    },
  }
}

const PluginSourceContext = createContext<PluginSource | null>(null)

/** The app's plugin source, loading with `loader`: the page's `fetch` and `import()` by default. */
export const PluginSourceProvider = ({ loader = browserLoader, children }: { loader?: PluginLoader; children: ReactNode }) => {
  const source = useMemo(() => createPluginSource(loader), [loader])
  return <PluginSourceContext.Provider value={source}>{children}</PluginSourceContext.Provider>
}

export const usePluginSource = () => {
  const source = useContext(PluginSourceContext)
  if (!source) throw new Error('usePluginSource must be used inside PluginSourceProvider')
  return source
}
